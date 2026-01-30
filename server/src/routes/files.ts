import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import fileUpload from 'express-fileupload';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { FileProcessor } from '../services/file-processor';
import { ProjectSessionMemory } from '../services/project-session-memory';
import {
  saveFileUpload,
  getFileUploadsByChatId,
  deleteFileUpload,
  isDatabaseAvailable,
} from '@chat-template/db';
import { generateUUID } from '@chat-template/core';
import { ChatSDKError } from '@chat-template/core/errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export const filesRouter: RouterType = Router();

// Configure file upload middleware
filesRouter.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
  }),
);

// Apply auth middleware
filesRouter.use(authMiddleware);

const sessionMemory = ProjectSessionMemory.getInstance();

/**
 * POST /api/files/upload - Upload a file to a chat session
 */
filesRouter.post(
  '/upload',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.body;
      const userId = req.session?.user.id;

      if (!chatId) {
        const error = new ChatSDKError('bad_request:api', 'Chat ID is required');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      if (!req.files || Object.keys(req.files).length === 0) {
        const error = new ChatSDKError('bad_request:api', 'No files were uploaded');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      const uploadedFile = Array.isArray(req.files.file)
        ? req.files.file[0]
        : req.files.file;

      if (!uploadedFile) {
        const error = new ChatSDKError('bad_request:api', 'File not found in request');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      // Process the file
      const processedFile = await FileProcessor.processFile(
        uploadedFile.tempFilePath,
        uploadedFile.name,
        uploadedFile.mimetype,
      );

      // Generate file ID
      const fileId = generateUUID();

      // Store in session memory
      sessionMemory.addFile(chatId, userId!, fileId, processedFile);

      // Store in database if available AND chat exists
      // We check if the chat exists first to avoid foreign key violations
      // Files will be stored in session memory regardless
      if (isDatabaseAvailable()) {
        try {
          // Check if chat exists in database
          const { checkChatAccess } = await import('@chat-template/core');
          const { chat } = await checkChatAccess(chatId, userId!);

          // Only save to database if chat exists
          if (chat) {
            await saveFileUpload({
              id: fileId,
              chatId,
              userId: userId!,
              filename: processedFile.filename,
              contentType: processedFile.contentType,
              fileSize: processedFile.fileSize,
              extractedContent: processedFile.extractedContent,
              metadata: processedFile.metadata,
            });
          } else {
            console.log(`Chat ${chatId} not in database yet, file stored in session memory only`);
          }
        } catch (dbError) {
          // If database save fails, just log it - file is still in session memory
          console.log('Could not save file to database, stored in session memory:', dbError);
        }
      }

      // Clean up temp file
      await FileProcessor.cleanupTempFile(uploadedFile.tempFilePath);

      res.json({
        id: fileId,
        filename: processedFile.filename,
        contentType: processedFile.contentType,
        fileSize: processedFile.fileSize,
        metadata: processedFile.metadata,
        hasContent: !!processedFile.extractedContent,
        isImage: FileProcessor.isImageFile(processedFile.filename),
      });
    } catch (error) {
      console.error('File upload error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        error instanceof Error ? error.message : 'Failed to upload file',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);

/**
 * GET /api/files/:chatId - Get all files for a chat session
 */
filesRouter.get(
  '/:chatId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;

      // Get files from session memory first
      const sessionFiles = sessionMemory.getSessionFiles(chatId);

      // If database is available, also get persisted files
      let dbFiles: any[] = [];
      if (isDatabaseAvailable()) {
        dbFiles = await getFileUploadsByChatId({ chatId });
      }

      // Merge and deduplicate files (session memory takes precedence)
      const fileMap = new Map();

      // Add database files first
      for (const file of dbFiles) {
        fileMap.set(file.id, {
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
          fileSize: file.fileSize,
          metadata: file.metadata,
          uploadedAt: file.createdAt,
          hasContent: !!file.extractedContent,
          isImage: FileProcessor.isImageFile(file.filename),
        });
      }

      // Override with session files (more recent)
      for (const sessionFile of sessionFiles) {
        fileMap.set(sessionFile.id, {
          id: sessionFile.id,
          filename: sessionFile.file.filename,
          contentType: sessionFile.file.contentType,
          fileSize: sessionFile.file.fileSize,
          metadata: sessionFile.file.metadata,
          uploadedAt: sessionFile.uploadedAt,
          hasContent: !!sessionFile.file.extractedContent,
          isImage: FileProcessor.isImageFile(sessionFile.file.filename),
        });
      }

      const files = Array.from(fileMap.values());
      res.json({ files });
    } catch (error) {
      console.error('Get files error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        'Failed to retrieve files',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);

/**
 * GET /api/files/:chatId/:fileId/content - Get file content
 */
filesRouter.get(
  '/:chatId/:fileId/content',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId, fileId } = req.params;

      // Try to get from session memory first
      const sessionFile = sessionMemory.getFile(chatId, fileId);

      if (sessionFile) {
        return res.json({
          id: fileId,
          filename: sessionFile.file.filename,
          content: sessionFile.file.extractedContent,
          base64Content: sessionFile.file.base64Content,
          metadata: sessionFile.file.metadata,
        });
      }

      // If not in session, try database
      if (isDatabaseAvailable()) {
        const files = await getFileUploadsByChatId({ chatId });
        const file = files.find(f => f.id === fileId);

        if (file) {
          return res.json({
            id: file.id,
            filename: file.filename,
            content: file.extractedContent,
            metadata: file.metadata,
          });
        }
      }

      const error = new ChatSDKError('not_found:api', 'File not found');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    } catch (error) {
      console.error('Get file content error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        'Failed to retrieve file content',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);

/**
 * DELETE /api/files/:chatId/:fileId - Delete a file from session
 */
filesRouter.delete(
  '/:chatId/:fileId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId, fileId } = req.params;

      // Remove from session memory
      sessionMemory.removeFile(chatId, fileId);

      // Remove from database if available
      if (isDatabaseAvailable()) {
        await deleteFileUpload({ id: fileId });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete file error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        'Failed to delete file',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);

/**
 * GET /api/files/:chatId/context - Get formatted context for all files
 */
filesRouter.get(
  '/:chatId/context',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const { maxFiles = 10 } = req.query;

      const context = sessionMemory.getContextString(
        chatId,
        Number.parseInt(maxFiles as string),
      );

      res.json({ context });
    } catch (error) {
      console.error('Get context error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        'Failed to get file context',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);