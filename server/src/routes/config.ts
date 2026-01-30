import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { isDatabaseAvailable } from '@chat-template/db';
import {
  FOUNDATION_MODELS,
  getDefaultFoundationModel,
} from '@chat-template/ai-sdk-providers';

export const configRouter: RouterType = Router();

/**
 * GET /api/config - Get application configuration
 * Returns feature flags based on environment configuration
 */
configRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    features: {
      chatHistory: isDatabaseAvailable(),
    },
    availableModels: FOUNDATION_MODELS,
    defaultModel: getDefaultFoundationModel(),
  });
});
