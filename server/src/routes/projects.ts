import { type RequestHandler, Router } from 'express';
import { z } from 'zod';
import { ChatSDKError } from '@chat-template/core/errors';
import { generateUUID } from '@chat-template/core';
import {
  createProject,
  getProjectsByUserId,
  getProjectById,
  updateProject,
  deleteProject,
  addChatToProject,
  removeChatFromProject,
  getChatsByProjectId,
  addFileToProject,
  getProjectFiles,
  removeFileFromProject,
  addProjectContext,
  getProjectContexts,
  updateProjectContext,
  deleteProjectContext,
  getChatById,
  saveFileUpload,
  isDatabaseAvailable,
} from '@chat-template/db';
import { authMiddleware, requireAuth } from '../middleware/auth';
import type { RouterType } from '../routes/types';
import fileUpload from 'express-fileupload';
import { FileProcessor } from '../services/file-processor';
import { ProjectSessionMemory } from '../services/project-session-memory';
import * as os from 'os';

// Schema validation
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const addContextSchema = z.object({
  contextType: z.enum(['instruction', 'memory', 'reference']),
  content: z.string().min(1),
});

const updateContextSchema = z.object({
  content: z.string().min(1),
});

export const projectsRouter: RouterType = Router();

// Apply auth middleware to all routes
projectsRouter.use(authMiddleware);

// Configure file upload middleware for project file uploads
projectsRouter.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
  }),
);

// Initialize session memory
const sessionMemory = ProjectSessionMemory.getInstance();

// Create a new project
projectsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const validatedData = createProjectSchema.parse(req.body);
    const userId = req.session!.user.id;

    const project = await createProject({
      userId,
      ...validatedData,
    });

    if (!project) {
      throw new ChatSDKError('internal:database', 'Failed to create project');
    }

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else if (error instanceof ChatSDKError) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Get all projects for the current user
projectsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const projects = await getProjectsByUserId({ userId });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get a specific project
projectsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const project = await getProjectById({ id: req.params.id, userId });

    if (!project) {
      throw new ChatSDKError('not_found:project', 'Project not found');
    }

    res.json(project);
  } catch (error) {
    if (error instanceof ChatSDKError && error.code === 'not_found:project') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  }
});

// Update a project
projectsRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    const validatedData = updateProjectSchema.parse(req.body);
    const userId = req.session!.user.id;

    const project = await updateProject({
      id: req.params.id,
      userId,
      ...validatedData,
    });

    if (!project) {
      throw new ChatSDKError('not_found:project', 'Project not found');
    }

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else if (error instanceof ChatSDKError && error.code === 'not_found:project') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update project' });
    }
  }
});

// Delete a project
projectsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const success = await deleteProject({ id: req.params.id, userId });

    if (!success) {
      throw new ChatSDKError('not_found:project', 'Project not found');
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ChatSDKError && error.code === 'not_found:project') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  }
});

// Add chat to project
projectsRouter.post('/:id/chats/:chatId', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const { id: projectId, chatId } = req.params;

    // Verify user owns both the project and the chat
    const project = await getProjectById({ id: projectId, userId });
    if (!project) {
      throw new ChatSDKError('not_found:project', 'Project not found');
    }

    const chat = await getChatById({ id: chatId });
    if (!chat || chat.userId !== userId) {
      throw new ChatSDKError('not_found:chat', 'Chat not found');
    }

    const success = await addChatToProject({ chatId, projectId, userId });
    if (!success) {
      throw new ChatSDKError('internal:database', 'Failed to add chat to project');
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      const status = error.code.startsWith('not_found') ? 404 : 500;
      res.status(status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to add chat to project' });
    }
  }
});

// Remove chat from project
projectsRouter.delete('/:id/chats/:chatId', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const { chatId } = req.params;

    const success = await removeChatFromProject({ chatId, userId });
    if (!success) {
      throw new ChatSDKError('internal:database', 'Failed to remove chat from project');
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove chat from project' });
  }
});

// Get all chats in a project
projectsRouter.get('/:id/chats', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const chats = await getChatsByProjectId({ projectId: req.params.id, userId });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project chats' });
  }
});

// Add file to project
projectsRouter.post('/:id/files', requireAuth, async (req, res) => {
  try {
    const userId = req.session!.user.id;
    const { id: projectId } = req.params;
    const { fileId } = req.body;

    if (!fileId) {
      throw new ChatSDKError('bad_request:missing_param', 'fileId is required');
    }

    const projectFile = await addFileToProject({ projectId, fileId, userId });
    if (!projectFile) {
      throw new ChatSDKError('internal:database', 'Failed to add file to project');
    }

    res.json(projectFile);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      const status = error.code.startsWith('bad_request') ? 400 : 500;
      res.status(status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to add file to project' });
    }
  }
});

// Get all files in a project
projectsRouter.get('/:id/files', requireAuth, async (req, res) => {
  try {
    const files = await getProjectFiles({ projectId: req.params.id });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project files' });
  }
});

// Remove file from project
projectsRouter.delete('/:id/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { id: projectId, fileId } = req.params;
    const success = await removeFileFromProject({ projectId, fileId });

    if (!success) {
      throw new ChatSDKError('internal:database', 'Failed to remove file from project');
    }

    // Also remove from session memory
    sessionMemory.removeProjectFile(projectId, fileId);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove file from project' });
  }
});

// Upload file directly to project
projectsRouter.post('/:id/upload', requireAuth, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.session!.user.id;

    // Verify project exists and user has access
    const project = await getProjectById(projectId);
    if (!project || project.userId !== userId) {
      const error = new ChatSDKError('forbidden:project', 'Access denied to project');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    if (!req.files || Object.keys(req.files).length === 0) {
      const error = new ChatSDKError('bad_request:api', 'No files were uploaded');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    const uploadedFiles = [];
    const fileArray = Array.isArray(req.files.file) ? req.files.file : [req.files.file];

    for (const file of fileArray) {
      try {
        // Process the file
        const tempPath = (file as any).tempFilePath;
        const processedFile = await FileProcessor.processFile({
          filename: file.name,
          contentType: file.mimetype,
          buffer: file.data,
          filePath: tempPath,
        });

        // Generate file ID
        const fileId = generateUUID();

        // Save to database if available
        let savedFile = null;
        if (isDatabaseAvailable()) {
          savedFile = await saveFileUpload({
            id: fileId,
            filename: file.name,
            contentType: file.mimetype,
            fileSize: file.size,
            extractedContent: processedFile.extractedContent,
            metadata: processedFile.metadata,
            projectId,
            userId,
          });

          // Add to project files association
          await addFileToProject({ projectId, fileId, userId });
        }

        // Add to project session memory
        sessionMemory.addProjectFile(projectId, fileId, {
          id: fileId,
          filename: file.name,
          contentType: file.mimetype,
          fileSize: file.size,
          extractedContent: processedFile.extractedContent,
          metadata: processedFile.metadata || {},
          createdAt: new Date(),
        });

        uploadedFiles.push({
          id: fileId,
          filename: file.name,
          contentType: file.mimetype,
          fileSize: file.size,
          extractedContent: processedFile.extractedContent,
          projectId,
        });

        // Clean up temp file
        if (tempPath) {
          try {
            const fs = await import('fs/promises');
            await fs.unlink(tempPath);
          } catch (err) {
            console.warn('Failed to clean up temp file:', err);
          }
        }
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
      }
    }

    if (uploadedFiles.length === 0) {
      const error = new ChatSDKError('internal:processing', 'Failed to process any files');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    res.json({
      files: uploadedFiles,
      projectId,
    });
  } catch (error) {
    console.error('Error uploading files to project:', error);

    if (error instanceof ChatSDKError) {
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    res.status(500).json({ error: 'Failed to upload files to project' });
  }
});

// Add project context
projectsRouter.post('/:id/context', requireAuth, async (req, res) => {
  try {
    const validatedData = addContextSchema.parse(req.body);
    const { id: projectId } = req.params;

    const context = await addProjectContext({
      projectId,
      ...validatedData,
    });

    if (!context) {
      throw new ChatSDKError('internal:database', 'Failed to add project context');
    }

    res.json(context);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to add project context' });
    }
  }
});

// Get all project contexts
projectsRouter.get('/:id/context', requireAuth, async (req, res) => {
  try {
    const contexts = await getProjectContexts({ projectId: req.params.id });
    res.json(contexts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project contexts' });
  }
});

// Update project context
projectsRouter.patch('/:id/context/:contextId', requireAuth, async (req, res) => {
  try {
    const validatedData = updateContextSchema.parse(req.body);
    const { contextId } = req.params;

    const context = await updateProjectContext({
      id: contextId,
      ...validatedData,
    });

    if (!context) {
      throw new ChatSDKError('not_found:context', 'Context not found');
    }

    res.json(context);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else if (error instanceof ChatSDKError && error.code === 'not_found:context') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update context' });
    }
  }
});

// Delete project context
projectsRouter.delete('/:id/context/:contextId', requireAuth, async (req, res) => {
  try {
    const { contextId } = req.params;
    const success = await deleteProjectContext({ id: contextId });

    if (!success) {
      throw new ChatSDKError('internal:database', 'Failed to delete context');
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete context' });
  }
});