import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  chat,
  message,
  fileUpload,
  chatContext,
  project,
  projectFile,
  projectContext,
  type DBMessage,
  type Chat,
  type FileUpload,
  type ChatContext,
  type Project,
  type ProjectFile,
  type ProjectContext,
} from './schema';
import type { VisibilityType } from '@chat-template/utils';
import { ChatSDKError } from '@chat-template/core/errors';
import type { LanguageModelV2Usage } from '@ai-sdk/provider';
import { isDatabaseAvailable } from './connection';
import { getAuthMethod, getAuthMethodDescription } from '@chat-template/auth';

// Re-export User type for external use
export type { User } from './schema';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
let _db: ReturnType<typeof drizzle>;

const getOrInitializeDb = async () => {
  if (!isDatabaseAvailable()) {
    throw new Error(
      'Database configuration required. Please set PGDATABASE/PGHOST/PGUSER or POSTGRES_URL environment variables.',
    );
  }

  if (_db) return _db;

  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    // Dynamic auth path - db will be initialized asynchronously
    console.log(
      `Using ${getAuthMethodDescription()} authentication for Postgres connection`,
    );
  } else if (process.env.POSTGRES_URL) {
    // Traditional connection string
    const client = postgres(process.env.POSTGRES_URL);
    _db = drizzle(client);
  }

  return _db;
};

// Helper to ensure db is initialized for dynamic auth connections
async function ensureDb() {
  const db = await getOrInitializeDb();
  // Always get a fresh DB instance for dynamic auth connections to handle token expiry
  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    const authDescription = getAuthMethodDescription();
    console.log(`[ensureDb] Getting ${authDescription} database connection...`);
    try {
      // Import getDb for database connection
      const { getDb } = await import('./connection-pool.js');
      const database = await getDb();
      console.log(
        `[ensureDb] ${authDescription} db connection obtained successfully`,
      );
      return database;
    } catch (error) {
      console.error(
        `[ensureDb] Failed to get ${authDescription} connection:`,
        error,
      );
      throw error;
    }
  }

  // For static connections (POSTGRES_URL), use cached instance
  if (!db) {
    console.error('[ensureDb] DB is still null after initialization attempt!');
    throw new Error('Database connection could not be established');
  }
  return db;
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  projectId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  projectId?: string | null;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveChat] Database not available, skipping persistence');
    return;
  }

  try {
    return await (await ensureDb()).insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      projectId: projectId || null,
    });
  } catch (error) {
    console.error('[saveChat] Error saving chat:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteChatById] Database not available, skipping deletion');
    return null;
  }

  try {
    await (await ensureDb()).delete(message).where(eq(message.chatId, id));

    const [chatsDeleted] = await (await ensureDb())
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
  projectId,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
  projectId?: string | null;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[getChatsByUserId] Database not available, returning empty');
    return { chats: [], hasMore: false };
  }

  try {
    const extendedLimit = limit + 1;

    const query = async (whereCondition?: SQL<any>) => {
      const database = await ensureDb();

      // Build the where clause with optional project filter
      let finalCondition = eq(chat.userId, id);

      if (projectId !== undefined) {
        // If projectId is null, find chats without a project
        // If projectId is a string, find chats with that project
        const projectCondition = projectId === null
          ? sql`${chat.projectId} IS NULL`
          : eq(chat.projectId, projectId);
        finalCondition = and(finalCondition, projectCondition);
      }

      if (whereCondition) {
        finalCondition = and(whereCondition, finalCondition);
      }

      return database
        .select({
          id: chat.id,
          createdAt: chat.createdAt,
          title: chat.title,
          userId: chat.userId,
          projectId: chat.projectId,
          visibility: chat.visibility,
          lastContext: chat.lastContext,
        })
        .from(chat)
        .where(finalCondition)
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);
    };

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      console.log(
        '[getChatsByUserId] Fetching chat for startingAfter:',
        startingAfter,
      );
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      console.log(
        '[getChatsByUserId] Fetching chat for endingBefore:',
        endingBefore,
      );
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      console.log('[getChatsByUserId] Executing main query without pagination');
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;
    console.log(
      '[getChatsByUserId] Query successful, found',
      filteredChats.length,
      'chats',
    );

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('[getChatsByUserId] Error details:', error);
    console.error(
      '[getChatsByUserId] Error stack:',
      error instanceof Error ? error.stack : 'No stack available',
    );
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getChatById] Database not available, returning null');
    return null;
  }

  try {
    const [selectedChat] = await (await ensureDb())
      .select()
      .from(chat)
      .where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveMessages] Database not available, skipping persistence');
    return;
  }

  try {
    // Use upsert to handle both new messages and updates (e.g., MCP approval continuations)
    // When a message ID already exists, update its parts (which may have changed)
    // Using sql`excluded.X` to reference the values that would have been inserted
    return await (await ensureDb())
      .insert(message)
      .values(messages)
      .onConflictDoUpdate({
        target: message.id,
        set: {
          parts: sql`excluded.parts`,
          attachments: sql`excluded.attachments`,
        },
      });
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getMessagesByChatId] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getMessageById] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteMessagesByChatIdAfterTimestamp] Database not available, skipping deletion');
    return;
  }

  try {
    const messagesToDelete = await (await ensureDb())
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      return await (await ensureDb())
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatVisiblityById] Database not available, skipping update');
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ visibility })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store raw LanguageModelUsage to keep it simple
  context: LanguageModelV2Usage;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatLastContextById] Database not available, skipping update');
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn('Failed to update lastContext for chat', chatId, error);
    return;
  }
}

// File upload queries

export async function saveFileUpload({
  id,
  chatId,
  userId,
  filename,
  contentType,
  fileSize,
  storagePath,
  extractedContent,
  metadata,
}: {
  id: string;
  chatId?: string | null; // Made optional for session-only files
  userId: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storagePath?: string;
  extractedContent?: string;
  metadata?: Record<string, any>;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveFileUpload] Database not available, skipping save');
    return;
  }

  try {
    const [result] = await (await ensureDb())
      .insert(fileUpload)
      .values({
        id,
        chatId: chatId || null, // Allow null for session-only files
        userId,
        filename,
        contentType,
        fileSize,
        storagePath: storagePath || null,
        extractedContent: extractedContent || null,
        metadata: metadata || {},
        createdAt: new Date(),
      })
      .returning();

    return result;
  } catch (error) {
    console.error('Failed to save file upload:', error);
    throw new ChatSDKError('bad_request:db', 'Failed to save file upload');
  }
}

export async function getFileUploadsByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<FileUpload[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getFileUploadsByChatId] Database not available, returning empty array');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.chatId, chatId))
      .orderBy(desc(fileUpload.createdAt));
  } catch (error) {
    console.error('Failed to get file uploads:', error);
    return [];
  }
}

export async function deleteFileUpload({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteFileUpload] Database not available, skipping delete');
    return;
  }

  try {
    await (await ensureDb()).delete(fileUpload).where(eq(fileUpload.id, id));
  } catch (error) {
    console.error('Failed to delete file upload:', error);
    throw new ChatSDKError('bad_request:db', 'Failed to delete file upload');
  }
}

export async function saveChatContext({
  chatId,
  fileId,
  contextType,
  content,
}: {
  chatId: string;
  fileId?: string;
  contextType: 'file' | 'memory' | 'instruction';
  content?: string;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveChatContext] Database not available, skipping save');
    return;
  }

  try {
    const [result] = await (await ensureDb())
      .insert(chatContext)
      .values({
        chatId,
        fileId: fileId || null,
        contextType,
        content: content || null,
        createdAt: new Date(),
      })
      .returning();

    return result;
  } catch (error) {
    console.error('Failed to save chat context:', error);
    throw new ChatSDKError('bad_request:db', 'Failed to save chat context');
  }
}

export async function getChatContexts({
  chatId,
}: {
  chatId: string;
}): Promise<ChatContext[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getChatContexts] Database not available, returning empty array');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(chatContext)
      .where(eq(chatContext.chatId, chatId))
      .orderBy(desc(chatContext.createdAt));
  } catch (error) {
    console.error('Failed to get chat contexts:', error);
    return [];
  }
}

// Project queries

export async function createProject({
  userId,
  name,
  description,
  color,
  icon,
  metadata,
}: {
  userId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  metadata?: Record<string, any>;
}): Promise<Project | null> {
  if (!isDatabaseAvailable()) {
    console.log('[createProject] Database not available, skipping');
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .insert(project)
      .values({
        userId,
        name,
        description: description || null,
        color: color || null,
        icon: icon || null,
        metadata: metadata || {},
      })
      .returning();

    return result;
  } catch (error) {
    console.error('[createProject] Failed to create project:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to create project');
  }
}

export async function getProjectsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Project[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getProjectsByUserId] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(project)
      .where(eq(project.userId, userId))
      .orderBy(desc(project.createdAt));
  } catch (error) {
    console.error('[getProjectsByUserId] Failed to get projects:', error);
    return [];
  }
}

export async function getProjectById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Project | null> {
  if (!isDatabaseAvailable()) {
    console.log('[getProjectById] Database not available, returning null');
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)));

    return result || null;
  } catch (error) {
    console.error('[getProjectById] Failed to get project:', error);
    return null;
  }
}

export async function updateProject({
  id,
  userId,
  name,
  description,
  color,
  icon,
  isActive,
  metadata,
}: {
  id: string;
  userId: string;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}): Promise<Project | null> {
  if (!isDatabaseAvailable()) {
    console.log('[updateProject] Database not available, skipping');
    return null;
  }

  try {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (isActive !== undefined) updateData.isActive = isActive ? 'true' : 'false';
    if (metadata !== undefined) updateData.metadata = metadata;

    const [result] = await (await ensureDb())
      .update(project)
      .set(updateData)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning();

    return result || null;
  } catch (error) {
    console.error('[updateProject] Failed to update project:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to update project');
  }
}

export async function deleteProject({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) {
    console.log('[deleteProject] Database not available, skipping');
    return false;
  }

  try {
    const result = await (await ensureDb())
      .delete(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)));

    return true;
  } catch (error) {
    console.error('[deleteProject] Failed to delete project:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to delete project');
  }
}

// Project-Chat association queries

export async function addChatToProject({
  chatId,
  projectId,
  userId,
}: {
  chatId: string;
  projectId: string;
  userId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) {
    console.log('[addChatToProject] Database not available, skipping');
    return false;
  }

  try {
    await (await ensureDb())
      .update(chat)
      .set({ projectId })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return true;
  } catch (error) {
    console.error('[addChatToProject] Failed to add chat to project:', error);
    return false;
  }
}

export async function removeChatFromProject({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) {
    console.log('[removeChatFromProject] Database not available, skipping');
    return false;
  }

  try {
    await (await ensureDb())
      .update(chat)
      .set({ projectId: null })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return true;
  } catch (error) {
    console.error('[removeChatFromProject] Failed to remove chat from project:', error);
    return false;
  }
}

export async function getChatsByProjectId({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}): Promise<Chat[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getChatsByProjectId] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(chat)
      .where(and(eq(chat.projectId, projectId), eq(chat.userId, userId)))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('[getChatsByProjectId] Failed to get chats by project:', error);
    return [];
  }
}

// Project file queries

export async function addFileToProject({
  projectId,
  fileId,
  userId,
}: {
  projectId: string;
  fileId: string;
  userId: string;
}): Promise<ProjectFile | null> {
  if (!isDatabaseAvailable()) {
    console.log('[addFileToProject] Database not available, skipping');
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .insert(projectFile)
      .values({
        projectId,
        fileId,
        addedBy: userId,
      })
      .returning();

    return result;
  } catch (error) {
    console.error('[addFileToProject] Failed to add file to project:', error);
    return null;
  }
}

export async function getProjectFiles({
  projectId,
}: {
  projectId: string;
}): Promise<FileUpload[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getProjectFiles] Database not available, returning empty');
    return [];
  }

  try {
    const results = await (await ensureDb())
      .select({
        file: fileUpload,
      })
      .from(projectFile)
      .innerJoin(fileUpload, eq(projectFile.fileId, fileUpload.id))
      .where(eq(projectFile.projectId, projectId))
      .orderBy(desc(projectFile.addedAt));

    return results.map(r => r.file);
  } catch (error) {
    console.error('[getProjectFiles] Failed to get project files:', error);
    return [];
  }
}

export async function removeFileFromProject({
  projectId,
  fileId,
}: {
  projectId: string;
  fileId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) {
    console.log('[removeFileFromProject] Database not available, skipping');
    return false;
  }

  try {
    await (await ensureDb())
      .delete(projectFile)
      .where(and(eq(projectFile.projectId, projectId), eq(projectFile.fileId, fileId)));

    return true;
  } catch (error) {
    console.error('[removeFileFromProject] Failed to remove file from project:', error);
    return false;
  }
}

// Project context queries

export async function addProjectContext({
  projectId,
  contextType,
  content,
}: {
  projectId: string;
  contextType: 'instruction' | 'memory' | 'reference';
  content: string;
}): Promise<ProjectContext | null> {
  if (!isDatabaseAvailable()) {
    console.log('[addProjectContext] Database not available, skipping');
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .insert(projectContext)
      .values({
        projectId,
        contextType,
        content,
      })
      .returning();

    return result;
  } catch (error) {
    console.error('[addProjectContext] Failed to add project context:', error);
    return null;
  }
}

export async function getProjectContexts({
  projectId,
}: {
  projectId: string;
}): Promise<ProjectContext[]> {
  if (!isDatabaseAvailable()) {
    console.log('[getProjectContexts] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(projectContext)
      .where(eq(projectContext.projectId, projectId))
      .orderBy(desc(projectContext.createdAt));
  } catch (error) {
    console.error('[getProjectContexts] Failed to get project contexts:', error);
    return [];
  }
}

export async function updateProjectContext({
  id,
  content,
}: {
  id: string;
  content: string;
}): Promise<ProjectContext | null> {
  if (!isDatabaseAvailable()) {
    console.log('[updateProjectContext] Database not available, skipping');
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .update(projectContext)
      .set({ content, updatedAt: new Date() })
      .where(eq(projectContext.id, id))
      .returning();

    return result || null;
  } catch (error) {
    console.error('[updateProjectContext] Failed to update project context:', error);
    return null;
  }
}

export async function deleteProjectContext({
  id,
}: {
  id: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) {
    console.log('[deleteProjectContext] Database not available, skipping');
    return false;
  }

  try {
    await (await ensureDb())
      .delete(projectContext)
      .where(eq(projectContext.id, id));

    return true;
  } catch (error) {
    console.error('[deleteProjectContext] Failed to delete project context:', error);
    return false;
  }
}
