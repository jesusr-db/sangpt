// server/src/tracing.ts
// IMPORTANT: This file MUST be imported FIRST, before any other imports
// to enable auto-instrumentation of Express, HTTP, and PostgreSQL

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

// Skip tracing if not configured
// DATABRICKS_HOST is the workspace URL (may or may not include https://)
const rawDatabricksHost = process.env.DATABRICKS_HOST;
const apiToken = process.env.DATABRICKS_API_TOKEN;
const verboseTracing = process.env.OTEL_VERBOSE === 'true';

let sdk: NodeSDK | null = null;

if (!rawDatabricksHost || !apiToken) {
  console.log('[Tracing] OTEL not configured - skipping instrumentation');
  console.log(
    '[Tracing] Set DATABRICKS_HOST and DATABRICKS_API_TOKEN to enable tracing',
  );
} else {
  // Ensure the host has https:// prefix
  const databricksHost = rawDatabricksHost.startsWith('http')
    ? rawDatabricksHost
    : `https://${rawDatabricksHost}`;
  // Enable OTEL diagnostic logging for debugging
  if (verboseTracing) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    console.log('[Tracing] Verbose logging enabled (OTEL_VERBOSE=true)');
  } else {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const serviceName =
    process.env.OTEL_SERVICE_NAME || 'databricks-chatbot-server';
  const ucTableSpans = process.env.DATABRICKS_UC_TABLE_SPANS || '';
  const ucTableMetrics = process.env.DATABRICKS_UC_TABLE_METRICS || '';
  const ucTableLogs = process.env.DATABRICKS_UC_TABLE_LOGS || '';

  // Construct full OTLP endpoints (must include /v1/traces, /v1/metrics, /v1/logs)
  const tracesEndpoint = `${databricksHost}/api/2.0/otel/v1/traces`;
  const metricsEndpoint = `${databricksHost}/api/2.0/otel/v1/metrics`;
  const logsEndpoint = `${databricksHost}/api/2.0/otel/v1/logs`;

  console.log('[Tracing] Configuration:');
  console.log(`  - Service Name: ${serviceName}`);
  console.log(`  - Databricks Host: ${databricksHost}`);
  console.log(`  - Traces Endpoint: ${tracesEndpoint}`);
  console.log(`  - Metrics Endpoint: ${metricsEndpoint}`);
  console.log(`  - Logs Endpoint: ${logsEndpoint}`);
  console.log(`  - UC Table (Spans): ${ucTableSpans}`);
  console.log(`  - UC Table (Metrics): ${ucTableMetrics}`);
  console.log(`  - UC Table (Logs): ${ucTableLogs}`);
  console.log(
    `  - API Token: ${apiToken ? '***' + apiToken.slice(-4) : 'NOT SET'}`,
  );

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  // Trace exporter with Databricks headers
  // Using full endpoint URL - exporter should NOT append /v1/traces
  const traceExporter = new OTLPTraceExporter({
    url: tracesEndpoint,
    headers: {
      'content-type': 'application/x-protobuf',
      'X-Databricks-UC-Table-Name': ucTableSpans,
      Authorization: `Bearer ${apiToken}`,
    },
  });

  // Metrics exporter with Databricks headers
  const metricExporter = new OTLPMetricExporter({
    url: metricsEndpoint,
    headers: {
      'content-type': 'application/x-protobuf',
      'X-Databricks-UC-Table-Name': ucTableMetrics,
      Authorization: `Bearer ${apiToken}`,
    },
  });

  // Logs exporter with Databricks headers
  const logExporter = new OTLPLogExporter({
    url: logsEndpoint,
    headers: {
      'content-type': 'application/x-protobuf',
      'X-Databricks-UC-Table-Name': ucTableLogs,
      Authorization: `Bearer ${apiToken}`,
    },
  });

  // Set up LoggerProvider for logs export
  const loggerProvider = new LoggerProvider({
    resource,
  });
  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
  logs.setGlobalLoggerProvider(loggerProvider);

  // Build span processors - always include OTLP exporter
  const spanProcessors = [new BatchSpanProcessor(traceExporter)];

  // Add console exporter for debugging when verbose mode is enabled
  if (verboseTracing) {
    console.log('[Tracing] Adding ConsoleSpanExporter for debugging');
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export metrics every 60 seconds
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[Tracing] OTEL SDK initialized for service: ${serviceName}`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    if (sdk) {
      sdk
        .shutdown()
        .then(() => console.log('[Tracing] SDK shut down successfully'))
        .catch((err) =>
          console.error('[Tracing] Error shutting down SDK:', err),
        )
        .finally(() => process.exit(0));
    }
  });
}

export { sdk };
