import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  generateText,
  type LanguageModelUsage,
  pipeUIMessageStreamToResponse,
} from 'ai';
import {
  authMiddleware,
  requireAuth,
  requireChatAccess,
} from '../middleware/auth';
import {
  deleteChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastContextById,
  updateChatVisiblityById,
  isDatabaseAvailable,
  getProjectContexts,
  getProjectFiles,
  getFileUploadsByChatId,
} from '@chat-template/db';
import {
  type ChatMessage,
  checkChatAccess,
  convertToUIMessages,
  generateUUID,
  myProvider,
  postRequestBodySchema,
  type PostRequestBody,
  StreamCache,
  type VisibilityType,
} from '@chat-template/core';
import {
  DATABRICKS_TOOL_CALL_ID,
  DATABRICKS_TOOL_DEFINITION,
  extractApprovalStatus,
} from '@databricks/ai-sdk-provider';
import { ChatSDKError } from '@chat-template/core/errors';
import { ProjectSessionMemory } from '../services/project-session-memory';
import { tracingContextMiddleware } from '../middleware/tracing';
import {
  chatRequestCounter,
  tokenUsageHistogram,
  responseLatencyHistogram,
  activeStreamsGauge,
  errorCounter,
} from '../metrics';
import { logger } from '../logger';

export const chatRouter: RouterType = Router();

const streamCache = new StreamCache();
const sessionMemory = ProjectSessionMemory.getInstance();

// Apply auth middleware to all chat routes
chatRouter.use(authMiddleware);

// Apply tracing context middleware to inject user/session info into spans
chatRouter.use(tracingContextMiddleware());

/**
 * POST /api/chat - Send a message and get streaming response
 *
 * Note: Works in ephemeral mode when database is disabled.
 * Streaming continues normally, but no chat/message persistence occurs.
 */
chatRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const requestStartTime = Date.now();
  const dbAvailable = isDatabaseAvailable();
  if (!dbAvailable) {
    logger.info('Running in ephemeral mode - no persistence', { component: 'chat' });
  }

  logger.info('Chat request received', {
    component: 'chat',
    timestamp: Date.now(),
  });

  let requestBody: PostRequestBody;

  try {
    requestBody = postRequestBodySchema.parse(req.body);
  } catch (_) {
    logger.error('Error parsing request body', { component: 'chat', error: String(_) });
    const error = new ChatSDKError('bad_request:api');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      projectId,
      enabledFileIds,
    }: {
      id: string;
      message?: ChatMessage;
      selectedChatModel: string;
      selectedVisibilityType: VisibilityType;
      projectId?: string | null;
      enabledFileIds?: string[];
    } = requestBody;

    const session = req.session;
    if (!session) {
      const error = new ChatSDKError('unauthorized:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { chat, allowed, reason } = await checkChatAccess(
      id,
      session?.user.id,
    );

    if (reason !== 'not_found' && !allowed) {
      const error = new ChatSDKError('forbidden:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    if (!chat) {
      // Only create new chat if we have a message (not a continuation)
      if (isDatabaseAvailable() && message) {
        const title = await generateTitleFromUserMessage({ message });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          visibility: selectedVisibilityType,
          projectId,
        });
      }
    } else {
      if (chat.userId !== session.user.id) {
        const error = new ChatSDKError('forbidden:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });

    // Use previousMessages from request body when:
    // 1. Ephemeral mode (DB not available) - always use client-side messages
    // 2. Continuation request (no message) - tool results only exist client-side
    const useClientMessages =
      !dbAvailable || (!message && requestBody.previousMessages);
    const previousMessages = useClientMessages
      ? (requestBody.previousMessages ?? [])
      : convertToUIMessages(messagesFromDb);

    // If message is provided, add it to the list and save it
    // If not (continuation/regeneration), just use previous messages
    let uiMessages: ChatMessage[];
    if (message) {
      uiMessages = [...previousMessages, message];
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    } else {
      // Continuation: use existing messages without adding new user message
      uiMessages = previousMessages as ChatMessage[];

      // For continuations with database enabled, save any updated assistant messages
      // This ensures tool-result parts (like MCP approval responses) are persisted
      if (dbAvailable && requestBody.previousMessages) {
        const assistantMessages = requestBody.previousMessages.filter(
          (m: ChatMessage) => m.role === 'assistant',
        );
        if (assistantMessages.length > 0) {
          await saveMessages({
            messages: assistantMessages.map((m: ChatMessage) => ({
              chatId: id,
              id: m.id,
              role: m.role,
              parts: m.parts,
              attachments: [],
              createdAt: m.metadata?.createdAt
                ? new Date(m.metadata.createdAt)
                : new Date(),
            })),
          });

          // Check if this is an MCP denial - if so, we're done (no need to call LLM)
          // Only check the last assistant message's last part for a fresh denial
          const lastAssistantMessage = assistantMessages.at(-1);
          const lastPart = lastAssistantMessage?.parts?.at(-1);

          const approvalStatus =
            lastPart?.type === 'tool-databricks-tool-call' && lastPart.output
              ? extractApprovalStatus(lastPart.output)
              : undefined;

          const hasMcpDenial = approvalStatus === false;

          if (hasMcpDenial) {
            // We don't need to call the LLM because the user has denied the tool call
            res.end();
            return;
          }
        }
      }
    }

    // Clear any previous active stream for this chat
    streamCache.clearActiveStream(id);

    let finalUsage: LanguageModelUsage | undefined;
    const streamId = generateUUID();

    // Get file context for this chat
    const _fileContext = sessionMemory.getContextString(id);

    // Get project context if chat belongs to a project
    let projectContext: string | null = null;
    let projectFileContext: string | null = null;

    if (chat?.projectId) {
      try {
        // Initialize chat with project association
        sessionMemory.initializeChatWithProject(id, chat.projectId);

        // Fetch project context/instructions from database
        const contexts = await getProjectContexts({
          projectId: chat.projectId,
        });
        if (contexts.length > 0) {
          projectContext = contexts
            .map((ctx) => `[${ctx.contextType}]: ${ctx.content}`)
            .join('\n\n');

          // Add instructions to session memory
          for (const ctx of contexts) {
            sessionMemory.addProjectInstructions(chat.projectId, ctx.content);
          }
        }

        // Fetch project files from database
        const projectFiles = await getProjectFiles({
          projectId: chat.projectId,
        });
        if (projectFiles.length > 0) {
          // Filter by enabled file IDs if provided
          const enabledProjectFiles = enabledFileIds
            ? projectFiles.filter((f) => enabledFileIds.includes(f.id))
            : projectFiles;

          // Add enabled project files to project context in session memory
          for (const file of enabledProjectFiles) {
            sessionMemory.addProjectFile(chat.projectId, file.id, {
              id: file.id,
              filename: file.filename,
              contentType: file.contentType,
              fileSize: file.fileSize,
              extractedContent: file.extractedContent || '',
              metadata: file.metadata || {},
              createdAt: file.createdAt,
            });
          }

          projectFileContext = enabledProjectFiles
            .map(
              (f) => `- ${f.filename} (${f.contentType}, ${f.fileSize} bytes)`,
            )
            .join('\n');

          if (
            enabledFileIds &&
            enabledProjectFiles.length < projectFiles.length
          ) {
            console.log(
              `[Chat] Filtered project files: ${enabledProjectFiles.length}/${projectFiles.length} enabled`,
            );
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch project context', { component: 'chat', error: String(error) });
      }
    }

    // Prepare messages with context
    let messagesForModel = convertToModelMessages(uiMessages);
    const systemMessages: any[] = [];

    // Add project context as the first system message if available
    if (projectContext) {
      systemMessages.push({
        role: 'system',
        content: `Project Context and Instructions:\n\n${projectContext}`,
      });
    }

    // Load files from database/Volume into session memory if not already there
    // This ensures images have their base64Content available for vision models
    if (isDatabaseAvailable()) {
      try {
        const dbFiles = await getFileUploadsByChatId({ chatId: id });

        // Filter by enabled file IDs if provided
        const enabledDbFiles = enabledFileIds
          ? dbFiles.filter((f) => enabledFileIds.includes(f.id))
          : dbFiles;

        const sessionFiles = sessionMemory.getSessionFiles(id);
        const sessionFileIds = new Set(sessionFiles.map((sf) => sf.id));

        for (const dbFile of enabledDbFiles) {
          // Skip if already in session memory
          if (sessionFileIds.has(dbFile.id)) continue;

          // Add file to session memory
          sessionMemory.addFile(id, dbFile.userId, dbFile.id, {
            filename: dbFile.filename,
            contentType: dbFile.contentType,
            fileSize: dbFile.fileSize,
            extractedContent: dbFile.extractedContent || '',
            metadata: dbFile.metadata || {},
          });
        }

        if (enabledFileIds && enabledDbFiles.length < dbFiles.length) {
          console.log(
            `[Chat] Filtered chat files: ${enabledDbFiles.length}/${dbFiles.length} enabled`,
          );
        }
      } catch (err) {
        logger.warn('Failed to load files from database', { component: 'chat', error: String(err) });
      }
    }

    // Add file context for text-based files (includes both project files and chat-specific files)
    logger.debug('Looking up files for chat', { component: 'chat', chatId: id });
    const allFileContext = sessionMemory.getContextString(id);
    if (allFileContext || projectFileContext) {
      let fileMessage = 'You have access to the following files:\n\n';

      if (projectFileContext) {
        fileMessage += `Project Files:\n${projectFileContext}\n\n`;
      }

      if (allFileContext) {
        fileMessage += `Chat Files:\n${allFileContext}`;
      }

      fileMessage +=
        '\n\nYou can reference these files by name when responding to user queries.';

      systemMessages.push({
        role: 'system',
        content: fileMessage,
      });
    }

    // Prepend system messages to the conversation
    if (systemMessages.length > 0) {
      messagesForModel = [...systemMessages, ...messagesForModel];
    }

    logger.info('Sending messages to model', {
      component: 'chat',
      chatId: id,
      model: selectedChatModel,
      messageCount: messagesForModel.length,
      userId: session.user.id,
    });

    // Track request metrics
    chatRequestCounter.add(1, { model: selectedChatModel });
    activeStreamsGauge.add(1, { model: selectedChatModel });

    const model = await myProvider.languageModel(selectedChatModel);
    const result = streamText({
      model,
      messages: messagesForModel,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'chat-completion',
        metadata: {
          chatId: id,
          userId: session.user.id,
          model: selectedChatModel,
        },
      },
      onFinish: ({ usage }) => {
        finalUsage = usage;

        // Track token usage metrics
        if (usage) {
          tokenUsageHistogram.record(usage.totalTokens, {
            model: selectedChatModel,
            type: 'total',
          });
          tokenUsageHistogram.record(usage.promptTokens, {
            model: selectedChatModel,
            type: 'prompt',
          });
          tokenUsageHistogram.record(usage.completionTokens, {
            model: selectedChatModel,
            type: 'completion',
          });
        }

        // Track response latency
        responseLatencyHistogram.record(Date.now() - requestStartTime, {
          model: selectedChatModel,
        });

        // Decrement active streams
        activeStreamsGauge.add(-1, { model: selectedChatModel });
      },
      tools: {
        [DATABRICKS_TOOL_CALL_ID]: DATABRICKS_TOOL_DEFINITION,
      },
    });

    /**
     * We manually create the stream to have access to the stream writer.
     * This allows us to inject custom stream parts like data-error.
     */
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.merge(
          result.toUIMessageStream({
            originalMessages: uiMessages,
            generateMessageId: generateUUID,
            sendReasoning: true,
            sendSources: true,
            onError: (error) => {
              logger.error('Stream error', { component: 'chat', chatId: id, error: String(error) });

              const errorMessage =
                error instanceof Error ? error.message : JSON.stringify(error);

              writer.write({ type: 'data-error', data: errorMessage });

              return errorMessage;
            },
          }),
        );
      },
      onFinish: async ({ responseMessage }) => {
        console.log(
          'Finished message stream! Saving message...',
          JSON.stringify(responseMessage, null, 2),
        );
        await saveMessages({
          messages: [
            {
              id: responseMessage.id,
              role: responseMessage.role,
              parts: responseMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            },
          ],
        });

        if (finalUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalUsage,
            });
          } catch (err) {
            logger.warn('Unable to persist last usage for chat', {
              component: 'chat',
              chatId: id,
              error: String(err),
            });
          }
        }

        // Log successful completion
        logger.info('Chat response completed', {
          component: 'chat',
          chatId: id,
          totalTokens: finalUsage?.totalTokens,
          promptTokens: finalUsage?.promptTokens,
          completionTokens: finalUsage?.completionTokens,
          durationMs: Date.now() - requestStartTime,
        });

        streamCache.clearActiveStream(id);
      },
    });

    pipeUIMessageStreamToResponse({
      stream,
      response: res,
      consumeSseStream({ stream }) {
        streamCache.storeStream({
          streamId,
          chatId: id,
          stream,
        });
      },
    });
  } catch (error) {
    // Track error metrics
    errorCounter.add(1, {
      type: error instanceof ChatSDKError ? error.type : 'unknown',
      route: 'chat',
    });

    // Ensure we decrement active streams on error
    activeStreamsGauge.add(-1, {
      model: requestBody?.selectedChatModel || 'unknown',
    });

    if (error instanceof ChatSDKError) {
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    logger.error('Unhandled error in chat API', {
      component: 'chat',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const chatError = new ChatSDKError('offline:chat');
    const response = chatError.toResponse();
    return res.status(response.status).json(response.json);
  }
});

/**
 * DELETE /api/chat?id=:id - Delete a chat
 */
chatRouter.delete(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const deletedChat = await deleteChatById({ id });
    return res.status(200).json(deletedChat);
  },
);

/**
 * GET /api/chat/:id
 */

chatRouter.get(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const { chat } = await checkChatAccess(id, req.session?.user.id);

    return res.status(200).json(chat);
  },
);

/**
 * GET /api/chat/:id/stream - Resume a stream
 */
chatRouter.get(
  '/:id/stream',
  [requireAuth],
  async (req: Request, res: Response) => {
    const { id: chatId } = req.params;
    const cursor = req.headers['x-resume-stream-cursor'] as string;

    console.log(`[Stream Resume] Cursor: ${cursor}`);

    console.log(`[Stream Resume] GET request for chat ${chatId}`);

    // Check if there's an active stream for this chat first
    const streamId = streamCache.getActiveStreamId(chatId);

    if (!streamId) {
      console.log(`[Stream Resume] No active stream for chat ${chatId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { allowed, reason } = await checkChatAccess(
      chatId,
      req.session?.user.id,
    );

    // If chat doesn't exist in DB, it's a temporary chat from the homepage - allow it
    if (reason === 'not_found') {
      console.log(
        `[Stream Resume] Resuming stream for temporary chat ${chatId} (not yet in DB)`,
      );
    } else if (!allowed) {
      console.log(
        `[Stream Resume] User ${req.session?.user.id} does not have access to chat ${chatId} (reason: ${reason})`,
      );
      const streamError = new ChatSDKError('forbidden:chat', reason);
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    // Get all cached chunks for this stream
    const stream = streamCache.getStream(streamId, {
      cursor: cursor ? Number.parseInt(cursor) : undefined,
    });

    if (!stream) {
      console.log(`[Stream Resume] No stream found for ${streamId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    console.log(`[Stream Resume] Resuming stream ${streamId}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe the cached stream directly to the response
    stream.pipe(res);

    // Handle stream errors
    stream.on('error', (error) => {
      console.error('[Stream Resume] Stream error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  },
);

/**
 * POST /api/chat/title - Generate title from message
 */
chatRouter.post('/title', requireAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const title = await generateTitleFromUserMessage({ message });
    res.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

/**
 * PATCH /api/chat/:id/visibility - Update chat visibility
 */
chatRouter.patch(
  '/:id/visibility',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { visibility } = req.body;

      if (!visibility || !['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Invalid visibility type' });
      }

      await updateChatVisiblityById({ chatId: id, visibility });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating visibility:', error);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  },
);

// Helper function to generate title from user message
async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const model = await myProvider.languageModel('title-model');
  const { text: title } = await generateText({
    model,
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons. do not include other expository content ("I'll help...")`,
    prompt: JSON.stringify(message),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'generate-title',
    },
  });

  return title;
}
