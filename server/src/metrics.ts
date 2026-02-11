// server/src/metrics.ts
// Custom metrics for chatbot application

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('chatbot-metrics');

// Request counter - tracks total chat requests by model
export const chatRequestCounter = meter.createCounter('chat.requests', {
  description: 'Number of chat requests',
});

// Token usage histogram - tracks token consumption per request
export const tokenUsageHistogram = meter.createHistogram('chat.tokens', {
  description: 'Token usage per request',
});

// Response latency histogram - tracks end-to-end response time
export const responseLatencyHistogram = meter.createHistogram('chat.latency', {
  description: 'Response latency in milliseconds',
  unit: 'ms',
});

// Stream duration histogram - tracks streaming duration
export const streamDurationHistogram = meter.createHistogram(
  'chat.stream_duration',
  {
    description: 'Duration of streaming response',
    unit: 'ms',
  },
);

// File upload counter - tracks file uploads by type
export const fileUploadCounter = meter.createCounter('files.uploads', {
  description: 'Number of file uploads',
});

// File upload size histogram - tracks file sizes
export const fileUploadSizeHistogram = meter.createHistogram('files.size', {
  description: 'Size of uploaded files in bytes',
  unit: 'bytes',
});

// Active streams gauge - tracks concurrent active streams
export const activeStreamsGauge = meter.createUpDownCounter(
  'chat.active_streams',
  {
    description: 'Number of currently active streams',
  },
);

// Database operation histogram - tracks DB query latencies
export const dbOperationHistogram = meter.createHistogram('db.operation', {
  description: 'Database operation latency',
  unit: 'ms',
});

// Error counter - tracks errors by type
export const errorCounter = meter.createCounter('errors', {
  description: 'Number of errors by type',
});
