// client/src/tracing.ts
// Frontend OTEL tracing setup - auto-instruments fetch requests

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let tracingInitialized = false;

/**
 * Initialize frontend OTEL tracing.
 * Traces are proxied through the backend to avoid CORS and auth header exposure.
 */
export async function initFrontendTracing(): Promise<void> {
  if (tracingInitialized) {
    return;
  }

  try {
    // Check if tracing is enabled on the backend
    const response = await fetch('/api/traces/config');
    if (!response.ok) {
      console.log('[Tracing] Backend tracing config not available');
      return;
    }

    const config = await response.json();
    if (!config.enabled) {
      console.log('[Tracing] Frontend tracing not enabled');
      return;
    }

    const provider = new WebTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName || 'chatbot-client',
      }),
    });

    // Export traces through backend proxy to avoid CORS and auth issues
    const exporter = new OTLPTraceExporter({
      url: '/api/traces',
    });

    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register({
      contextManager: new ZoneContextManager(),
    });

    // Auto-instrument fetch - propagates trace context to backend
    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          // Only propagate trace headers to our own API
          propagateTraceHeaderCorsUrls: [/\/api\//],
          clearTimingResources: true,
        }),
      ],
    });

    tracingInitialized = true;
    console.log('[Tracing] Frontend OTEL initialized');
  } catch (error) {
    // Silently fail - tracing is optional
    console.log('[Tracing] Failed to initialize frontend tracing:', error);
  }
}

/**
 * Check if tracing has been initialized.
 */
export function isTracingInitialized(): boolean {
  return tracingInitialized;
}
