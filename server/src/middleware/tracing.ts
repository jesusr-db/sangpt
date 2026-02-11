// server/src/middleware/tracing.ts
// Middleware to inject user/session context into OTEL spans

import { trace } from '@opentelemetry/api';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that adds user and session context to the active OTEL span.
 * Should be applied after authMiddleware so req.session is available.
 */
export function tracingContextMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const span = trace.getActiveSpan();

    if (span) {
      // Add user context if available
      if (req.session?.user) {
        span.setAttributes({
          'user.id': req.session.user.id,
          'user.email': req.session.user.email || 'unknown',
          'user.name': req.session.user.name || 'unknown',
        });
      }

      // Add chat context from params or body
      const chatId = req.params.id || req.body?.id;
      if (chatId) {
        span.setAttribute('chat.id', chatId);
      }

      // Add model context if available
      const model = req.body?.selectedChatModel;
      if (model) {
        span.setAttribute('chat.model', model);
      }

      // Add request metadata
      span.setAttributes({
        'http.route': req.route?.path || req.path,
        'http.method': req.method,
      });
    }

    next();
  };
}

/**
 * Creates a child span for a specific operation within a request.
 * Useful for wrapping database calls, external API calls, etc.
 */
export function createOperationSpan(operationName: string) {
  const tracer = trace.getTracer('chatbot-server');
  return tracer.startSpan(operationName);
}

/**
 * Wraps an async operation with a span for tracing.
 */
export async function withSpan<T>(
  operationName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer('chatbot-server');
  const span = tracer.startSpan(operationName);

  if (attributes) {
    span.setAttributes(attributes);
  }

  try {
    const result = await fn();
    span.setStatus({ code: 1 }); // OK
    return result;
  } catch (error) {
    span.setStatus({
      code: 2, // ERROR
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    span.end();
  }
}
