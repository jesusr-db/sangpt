import type { InferSelectModel } from 'drizzle-orm';
import {
  varchar,
  timestamp,
  json,
  jsonb,
  uuid,
  text,
  integer,
  pgSchema,
} from 'drizzle-orm/pg-core';
import type { LanguageModelV2Usage } from '@ai-sdk/provider';
import type { User as SharedUser } from '@chat-template/utils';

const schemaName = 'ai_chatbot';
const customSchema = pgSchema(schemaName);

// Helper function to create table with proper schema handling
// Use the schema object for proper drizzle-kit migration generation
const createTable = customSchema.table;

export const user = createTable('User', {
  id: text('id').primaryKey().notNull(),
  email: varchar('email', { length: 64 }).notNull(),
  // Password removed - using Databricks SSO authentication
});

export type User = SharedUser;

// Projects table to organize chats and context
export const project = createTable('Project', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'), // For UI differentiation (e.g., "#FF5733")
  icon: text('icon'), // Optional icon/emoji
  isActive: varchar('isActive', { enum: ['true', 'false'] })
    .notNull()
    .default('true'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, any>>(), // Extensible metadata
});

export type Project = InferSelectModel<typeof project>;

export const chat = createTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: text('userId').notNull(),
  projectId: uuid('projectId').references(() => project.id, { onDelete: 'set null' }),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  lastContext: jsonb('lastContext').$type<LanguageModelV2Usage | null>(),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = createTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// File uploads table to store uploaded files and their metadata
export const fileUpload = createTable('FileUpload', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .references(() => chat.id, { onDelete: 'cascade' }), // Made nullable for session-only files
  userId: text('userId').notNull(),
  filename: text('filename').notNull(),
  contentType: text('contentType').notNull(),
  fileSize: integer('fileSize').notNull(),
  storagePath: text('storagePath'),
  extractedContent: text('extractedContent'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export type FileUpload = InferSelectModel<typeof fileUpload>;

// Chat context table to manage file references in chat sessions
export const chatContext = createTable('ChatContext', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  fileId: uuid('fileId').references(() => fileUpload.id, { onDelete: 'cascade' }),
  contextType: varchar('contextType', { enum: ['file', 'memory', 'instruction'] }).notNull(),
  content: text('content'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export type ChatContext = InferSelectModel<typeof chatContext>;

// Project-level files (shared across chats in project)
export const projectFile = createTable('ProjectFile', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  projectId: uuid('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  fileId: uuid('fileId')
    .notNull()
    .references(() => fileUpload.id, { onDelete: 'cascade' }),
  addedAt: timestamp('addedAt').notNull().defaultNow(),
  addedBy: text('addedBy').notNull(), // userId who added it
});

export type ProjectFile = InferSelectModel<typeof projectFile>;

// Project context/instructions
export const projectContext = createTable('ProjectContext', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  projectId: uuid('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  contextType: varchar('contextType', {
    enum: ['instruction', 'memory', 'reference']
  }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export type ProjectContext = InferSelectModel<typeof projectContext>;
