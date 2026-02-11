// server/src/logger.ts
// OTEL-integrated logger that emits logs to Databricks

import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace, context } from '@opentelemetry/api';

// Get a logger instance from the global LoggerProvider
const otelLogger = logs.getLogger('chatbot-server', '1.0.0');

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Emit a log record to OTEL and console
 */
function emitLog(
  level: LogLevel,
  message: string,
  attributes?: LogAttributes,
): void {
  const severityMap: Record<LogLevel, { number: SeverityNumber; text: string }> =
    {
      debug: { number: SeverityNumber.DEBUG, text: 'DEBUG' },
      info: { number: SeverityNumber.INFO, text: 'INFO' },
      warn: { number: SeverityNumber.WARN, text: 'WARN' },
      error: { number: SeverityNumber.ERROR, text: 'ERROR' },
    };

  const severity = severityMap[level];

  // Get current span context for trace correlation
  const currentSpan = trace.getActiveSpan();
  const spanContext = currentSpan?.spanContext();

  // Emit to OTEL
  otelLogger.emit({
    severityNumber: severity.number,
    severityText: severity.text,
    body: message,
    attributes: {
      ...attributes,
      // Add trace context for correlation
      ...(spanContext && {
        'trace.id': spanContext.traceId,
        'span.id': spanContext.spanId,
      }),
    },
  });

  // Also log to console for local debugging
  const timestamp = new Date().toISOString();
  const attrStr = attributes ? ` ${JSON.stringify(attributes)}` : '';
  const consoleMethod = level === 'error' ? console.error : console.log;
  consoleMethod(`[${timestamp}] [${severity.text}] ${message}${attrStr}`);
}

/**
 * Logger with OTEL integration
 */
export const logger = {
  debug(message: string, attributes?: LogAttributes): void {
    emitLog('debug', message, attributes);
  },

  info(message: string, attributes?: LogAttributes): void {
    emitLog('info', message, attributes);
  },

  warn(message: string, attributes?: LogAttributes): void {
    emitLog('warn', message, attributes);
  },

  error(message: string, attributes?: LogAttributes): void {
    emitLog('error', message, attributes);
  },

  /**
   * Log with custom attributes - useful for structured logging
   */
  log(
    level: LogLevel,
    message: string,
    attributes?: LogAttributes,
  ): void {
    emitLog(level, message, attributes);
  },

  /**
   * Create a child logger with preset attributes
   */
  child(baseAttributes: LogAttributes) {
    return {
      debug: (message: string, attributes?: LogAttributes) =>
        emitLog('debug', message, { ...baseAttributes, ...attributes }),
      info: (message: string, attributes?: LogAttributes) =>
        emitLog('info', message, { ...baseAttributes, ...attributes }),
      warn: (message: string, attributes?: LogAttributes) =>
        emitLog('warn', message, { ...baseAttributes, ...attributes }),
      error: (message: string, attributes?: LogAttributes) =>
        emitLog('error', message, { ...baseAttributes, ...attributes }),
    };
  },
};

export default logger;
