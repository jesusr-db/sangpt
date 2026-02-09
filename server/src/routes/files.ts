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
  getVolumeStorage,
} from '../services/volume-storage';
import {
  saveFileUpload,
  getFileUploadsByChatId,
  getFileUploadById,
  deleteFileUpload,
  isDatabaseAvailable,
} from '@chat-template/db';
import { generateUUID } from '@chat-template/core';
import { ChatSDKError } from '@chat-template/core/errors';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

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
 *
 * Storage strategy:
 * 1. Original file -> Databricks Volume (if available)
 * 2. Extracted text + metadata -> PostgreSQL (if available)
 * 3. Fallback -> Session memory (ephemeral)
 */
filesRouter.post(
  '/upload',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId, projectId } = req.body;
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

      // Generate file ID
      const fileId = generateUUID();

      // Read the file buffer for volume upload
      const fileBuffer = await fs.readFile(uploadedFile.tempFilePath);

      // Process the file (extract text content)
      const processedFile = await FileProcessor.processFile(
        uploadedFile.tempFilePath,
        uploadedFile.name,
        uploadedFile.mimetype,
      );

      // Store in session memory (always available as fallback)
      sessionMemory.addFile(chatId, userId!, fileId, processedFile);

      // Track storage type and volume info
      let storageType: 'volume' | 'memory' = 'memory';
      let volumePath: string | undefined;
      let volumeCatalog: string | undefined;
      let volumeSchema: string | undefined;
      let volumeName: string | undefined;
      let fileChecksum: string | undefined;

      // Try to upload to Databricks Volume
      const volumeStorage = getVolumeStorage();
      if (volumeStorage) {
        try {
          const volumeResult = await volumeStorage.uploadFile(
            fileBuffer,
            uploadedFile.name,
            { chatId, projectId, userId, fileId },
          );

          volumePath = volumeResult.volumePath;
          volumeCatalog = volumeResult.volumeCatalog;
          volumeSchema = volumeResult.volumeSchema;
          volumeName = volumeResult.volumeName;
          fileChecksum = volumeResult.checksum;
          storageType = 'volume';

          console.log(`[FileUpload] File uploaded to volume: ${volumePath}`);
        } catch (volumeError) {
          console.warn(
            '[FileUpload] Volume upload failed, falling back to memory storage:',
            volumeError,
          );
          // Continue with memory storage
        }
      } else {
        console.log(
          '[FileUpload] Volume storage not configured, using memory storage',
        );
      }

      // Store metadata in database if available
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
              // Volume storage fields
              volumePath,
              volumeCatalog,
              volumeSchema,
              volumeName,
              storageType,
              fileChecksum,
            });
          } else {
            console.log(
              `Chat ${chatId} not in database yet, file metadata stored in session memory only`,
            );
          }
        } catch (dbError) {
          // If database save fails, just log it - file is still in session memory
          console.log(
            'Could not save file metadata to database, stored in session memory:',
            dbError,
          );
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
        isImage: false,
        storageType,
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
          contentLength: file.extractedContent?.length || 0,
          isImage: file.contentType.startsWith('image/'),
          storageType: file.storageType || 'memory',
          canDownload: file.storageType === 'volume' && !!file.volumePath,
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
          contentLength: sessionFile.file.extractedContent?.length || 0,
          isImage: sessionFile.file.contentType.startsWith('image/'),
          storageType: 'memory', // Session files are always in memory
          canDownload: false,
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
 * GET /api/files/:chatId/:fileId/content - Get file extracted content (text)
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
        const file = files.find((f) => f.id === fileId);

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
 * GET /api/files/:chatId/:fileId/download - Download original file from Volume
 */
filesRouter.get(
  '/:chatId/:fileId/download',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId, fileId } = req.params;

      // Get file metadata from database
      if (!isDatabaseAvailable()) {
        const error = new ChatSDKError(
          'bad_request:api',
          'Database not available for file download',
        );
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      const file = await getFileUploadById({ id: fileId });

      if (!file) {
        const error = new ChatSDKError('not_found:api', 'File not found');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      // Check that the file belongs to the requested chat
      if (file.chatId !== chatId) {
        const error = new ChatSDKError(
          'forbidden:api',
          'File does not belong to this chat',
        );
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      // Check if file is stored in Volume
      if (file.storageType !== 'volume' || !file.volumePath) {
        const error = new ChatSDKError(
          'bad_request:api',
          'File is not available for download (stored in memory only)',
        );
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      // Get volume storage
      const volumeStorage = getVolumeStorage();
      if (!volumeStorage) {
        const error = new ChatSDKError(
          'bad_request:api',
          'Volume storage not configured',
        );
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      // Download file from Volume
      const fileBuffer = await volumeStorage.downloadFile(file.volumePath);

      // Set response headers
      res.setHeader('Content-Type', file.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.filename)}"`,
      );
      res.setHeader('Content-Length', fileBuffer.length);

      // Send file
      res.send(fileBuffer);
    } catch (error) {
      console.error('Download file error:', error);
      const chatError = new ChatSDKError(
        'bad_request:api',
        error instanceof Error ? error.message : 'Failed to download file',
      );
      const response = chatError.toResponse();
      return res.status(response.status).json(response.json);
    }
  },
);

/**
 * DELETE /api/files/:chatId/:fileId - Delete a file from session and storage
 */
filesRouter.delete(
  '/:chatId/:fileId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId, fileId } = req.params;

      // Try to delete from Volume storage if available
      if (isDatabaseAvailable()) {
        const file = await getFileUploadById({ id: fileId });

        if (file?.storageType === 'volume' && file.volumePath) {
          const volumeStorage = getVolumeStorage();
          if (volumeStorage) {
            try {
              await volumeStorage.deleteFile(file.volumePath);
              console.log(`[FileDelete] Deleted from volume: ${file.volumePath}`);
            } catch (volumeError) {
              console.warn(
                '[FileDelete] Failed to delete from volume:',
                volumeError,
              );
              // Continue with database/memory deletion
            }
          }
        }
      }

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
