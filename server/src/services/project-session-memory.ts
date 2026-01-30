import type { ProcessedFile } from './file-processor';
import { SessionMemory } from './session-memory';

export interface ProjectContext {
  files: Map<string, ProcessedFile>;
  instructions: string[];
  lastActivity: Date;
}

/**
 * Extends SessionMemory to support project-level file storage and context inheritance
 */
export class ProjectSessionMemory extends SessionMemory {
  private static projectInstance: ProjectSessionMemory;
  private projectContexts: Map<string, ProjectContext> = new Map();
  private chatToProject: Map<string, string> = new Map(); // chatId -> projectId mapping

  protected constructor() {
    super();
  }

  static override getInstance(): ProjectSessionMemory {
    if (!ProjectSessionMemory.projectInstance) {
      ProjectSessionMemory.projectInstance = new ProjectSessionMemory();
    }
    return ProjectSessionMemory.projectInstance;
  }

  /**
   * Initialize a chat with project context
   */
  initializeChatWithProject(chatId: string, projectId: string): void {
    this.chatToProject.set(chatId, projectId);

    // Get project files and add them to the chat's context
    const projectContext = this.projectContexts.get(projectId);
    if (projectContext) {
      for (const [fileId, file] of projectContext.files) {
        // Note: We don't actually add project files to the chat session,
        // but we make them available through getContextString
        // This prevents duplication and maintains single source of truth
      }
    }
  }

  /**
   * Add a file to a project (shared across all project chats)
   */
  addProjectFile(projectId: string, fileId: string, file: ProcessedFile): void {
    let context = this.projectContexts.get(projectId);

    if (!context) {
      context = {
        files: new Map(),
        instructions: [],
        lastActivity: new Date(),
      };
      this.projectContexts.set(projectId, context);
    }

    context.files.set(fileId, file);
    context.lastActivity = new Date();
  }

  /**
   * Get all files for a project
   */
  getProjectFiles(projectId: string): ProcessedFile[] {
    const context = this.projectContexts.get(projectId);
    if (!context) {
      return [];
    }

    context.lastActivity = new Date();
    return Array.from(context.files.values());
  }

  /**
   * Remove a file from a project
   */
  removeProjectFile(projectId: string, fileId: string): boolean {
    const context = this.projectContexts.get(projectId);
    if (!context) {
      return false;
    }

    const deleted = context.files.delete(fileId);
    context.lastActivity = new Date();

    // Clean up empty contexts
    if (context.files.size === 0 && context.instructions.length === 0) {
      this.projectContexts.delete(projectId);
    }

    return deleted;
  }

  /**
   * Add project instructions/context
   */
  addProjectInstructions(projectId: string, instructions: string): void {
    let context = this.projectContexts.get(projectId);

    if (!context) {
      context = {
        files: new Map(),
        instructions: [],
        lastActivity: new Date(),
      };
      this.projectContexts.set(projectId, context);
    }

    context.instructions.push(instructions);
    context.lastActivity = new Date();
  }

  /**
   * Get project instructions
   */
  getProjectInstructions(projectId: string): string[] {
    const context = this.projectContexts.get(projectId);
    return context?.instructions || [];
  }

  /**
   * Clear project instructions
   */
  clearProjectInstructions(projectId: string): void {
    const context = this.projectContexts.get(projectId);
    if (context) {
      context.instructions = [];
      context.lastActivity = new Date();
    }
  }

  /**
   * Get context string for a chat, including inherited project context
   */
  override getContextString(chatId: string, maxFiles: number = 10): string {
    const contextParts: string[] = [];

    // Get project context if chat belongs to a project
    const projectId = this.chatToProject.get(chatId);
    if (projectId) {
      const projectFiles = this.getProjectFiles(projectId);
      if (projectFiles.length > 0) {
        contextParts.push('=== Project Files ===');
        const limitedProjectFiles = projectFiles.slice(0, Math.floor(maxFiles / 2));
        for (const file of limitedProjectFiles) {
          contextParts.push(this.formatFileForContext(file));
        }
        if (projectFiles.length > limitedProjectFiles.length) {
          contextParts.push(`[${projectFiles.length - limitedProjectFiles.length} additional project files not shown]`);
        }
      }
    }

    // Get chat-specific files
    const chatFiles = this.getSessionFiles(chatId);
    if (chatFiles.length > 0) {
      if (contextParts.length > 0) {
        contextParts.push('\n=== Chat Files ===');
      }
      const remainingSlots = maxFiles - (contextParts.length > 0 ? Math.floor(maxFiles / 2) : 0);
      const limitedChatFiles = chatFiles.slice(0, remainingSlots);
      for (const sf of limitedChatFiles) {
        contextParts.push(this.formatFileForContext(sf.file));
      }
      if (chatFiles.length > limitedChatFiles.length) {
        contextParts.push(`[${chatFiles.length - limitedChatFiles.length} additional chat files not shown]`);
      }
    }

    return contextParts.join('\n\n');
  }

  /**
   * Format a file for context inclusion
   */
  private formatFileForContext(file: ProcessedFile): string {
    const parts: string[] = [];
    parts.push(`File: ${file.filename}`);
    parts.push(`Type: ${file.contentType}`);
    parts.push(`Size: ${file.fileSize} bytes`);

    if (file.extractedContent) {
      // Limit content length for context
      const maxContentLength = 5000;
      let content = file.extractedContent;
      if (content.length > maxContentLength) {
        content = content.substring(0, maxContentLength) + '...[truncated]';
      }
      parts.push(`Content:\n${content}`);
    }

    return parts.join('\n');
  }

  /**
   * Search for files across both project and chat contexts
   */
  searchAllFiles(chatId: string, searchTerm: string): ProcessedFile[] {
    const results: ProcessedFile[] = [];
    const regex = new RegExp(searchTerm, 'i');

    // Search project files
    const projectId = this.chatToProject.get(chatId);
    if (projectId) {
      const projectFiles = this.getProjectFiles(projectId);
      for (const file of projectFiles) {
        if (regex.test(file.extractedContent) || regex.test(file.filename)) {
          results.push(file);
        }
      }
    }

    // Search chat files
    const chatFiles = this.searchFilesContent(chatId, searchTerm);
    for (const sf of chatFiles) {
      results.push(sf.file);
    }

    return results;
  }

  /**
   * Clear all project context
   */
  clearProjectContext(projectId: string): void {
    this.projectContexts.delete(projectId);

    // Remove project associations for affected chats
    const affectedChats: string[] = [];
    for (const [chatId, pid] of this.chatToProject.entries()) {
      if (pid === projectId) {
        affectedChats.push(chatId);
      }
    }
    for (const chatId of affectedChats) {
      this.chatToProject.delete(chatId);
    }
  }

  /**
   * Get comprehensive statistics including project data
   */
  getExtendedStats(): {
    totalSessions: number;
    totalFiles: number;
    totalProjects: number;
    totalProjectFiles: number;
    oldestSession: Date | null;
  } {
    const baseStats = this.getStats();

    let totalProjectFiles = 0;
    for (const context of this.projectContexts.values()) {
      totalProjectFiles += context.files.size;
    }

    return {
      ...baseStats,
      totalProjects: this.projectContexts.size,
      totalProjectFiles,
    };
  }

  /**
   * Add a ProcessedFile directly to chat context (for backward compatibility)
   */
  addContext(chatId: string, file: ProcessedFile): void {
    // Generate a temporary ID for the file if needed
    const fileId = file.id || `temp-${Date.now()}`;
    this.addFile(chatId, 'system', fileId, file);
  }
}