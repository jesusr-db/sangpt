// server/src/routes/traces.ts
// Proxy route for frontend traces to Databricks OTEL endpoint
// This avoids CORS issues and keeps auth tokens server-side

import { Router, type Request, type Response } from 'express';

export const tracesRouter = Router();

/**
 * POST /api/traces - Proxy frontend traces to Databricks OTEL endpoint
 *
 * The frontend sends traces here, and we forward them to Databricks
 * with proper authentication headers.
 */
tracesRouter.post('/', async (req: Request, res: Response) => {
  const endpoint = process.env.DATABRICKS_OTEL_ENDPOINT;
  const token = process.env.DATABRICKS_API_TOKEN;
  const table = process.env.DATABRICKS_UC_TABLE_SPANS;

  if (!endpoint || !token) {
    console.log('[Traces Proxy] Tracing not configured, ignoring request');
    return res.status(503).json({ error: 'Tracing not configured' });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-protobuf',
        'X-Databricks-UC-Table-Name': table || '',
        Authorization: `Bearer ${token}`,
      },
      body: req.body,
    });

    if (!response.ok) {
      console.error(
        `[Traces Proxy] Export failed: ${response.status} ${response.statusText}`,
      );
    }

    res.status(response.status).end();
  } catch (error) {
    console.error('[Traces Proxy] Error forwarding traces:', error);
    res.status(500).json({ error: 'Failed to export traces' });
  }
});

/**
 * GET /api/traces/config - Get tracing configuration for frontend
 *
 * Returns minimal config so frontend knows if tracing is enabled.
 */
tracesRouter.get('/config', (_req: Request, res: Response) => {
  const isEnabled = !!(
    process.env.DATABRICKS_OTEL_ENDPOINT && process.env.DATABRICKS_API_TOKEN
  );

  res.json({
    enabled: isEnabled,
    serviceName: process.env.OTEL_SERVICE_NAME || 'databricks-chatbot-client',
  });
});
