import type { ProcessedFile } from './file-processor';
import { FileProcessor } from './file-processor';

export interface SessionFile {
  id: string;
  chatId: string;
  userId: string;
  file: ProcessedFile;
  uploadedAt: Date;
}

export interface SessionContext {
  files: Map<string, SessionFile>;
  lastActivity: Date;
}

/**
 * Manages in-memory session storage for uploaded files
 */
export class SessionMemory {
  private static instance: SessionMemory;
  private sessions: Map<string, SessionContext> = new Map();
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: NodeJS.Timeout | null = null;

  protected constructor() {
    // Start cleanup interval
    this.startCleanupInterval();
  }

  static getInstance(): SessionMemory {
    if (!SessionMemory.instance) {
      SessionMemory.instance = new SessionMemory();
    }
    return SessionMemory.instance;
  }

  /**
   * Add a file to a session
   */
  addFile(chatId: string, userId: string, fileId: string, file: ProcessedFile): void {
    let session = this.sessions.get(chatId);

    if (!session) {
      session = {
        files: new Map(),
        lastActivity: new Date(),
      };
      this.sessions.set(chatId, session);
    }

    session.files.set(fileId, {
      id: fileId,
      chatId,
      userId,
      file,
      uploadedAt: new Date(),
    });

    session.lastActivity = new Date();
  }

  /**
   * Get all files for a chat session
   */
  getSessionFiles(chatId: string): SessionFile[] {
    const session = this.sessions.get(chatId);
    if (!session) {
      return [];
    }

    session.lastActivity = new Date();
    return Array.from(session.files.values());
  }

  /**
   * Get a specific file from a session
   */
  getFile(chatId: string, fileId: string): SessionFile | undefined {
    const session = this.sessions.get(chatId);
    if (!session) {
      return undefined;
    }

    session.lastActivity = new Date();
    return session.files.get(fileId);
  }

  /**
   * Remove a file from a session
   */
  removeFile(chatId: string, fileId: string): boolean {
    const session = this.sessions.get(chatId);
    if (!session) {
      return false;
    }

    const deleted = session.files.delete(fileId);
    session.lastActivity = new Date();

    // Clean up empty sessions
    if (session.files.size === 0) {
      this.sessions.delete(chatId);
    }

    return deleted;
  }

  /**
   * Clear all files for a session
   */
  clearSession(chatId: string): void {
    this.sessions.delete(chatId);
  }

  /**
   * Get context string for all files in a session
   */
  getContextString(chatId: string, maxFiles: number = 10): string {
    const files = this.getSessionFiles(chatId);
    if (files.length === 0) {
      return '';
    }

    const limitedFiles = files.slice(0, maxFiles);
    const contextParts = limitedFiles.map(sf =>
      FileProcessor.formatForContext(sf.file)
    );

    if (files.length > maxFiles) {
      contextParts.push(`\n[${files.length - maxFiles} additional files not shown]`);
    }

    return contextParts.join('\n\n');
  }

  /**
   * Find files by name pattern in a session
   */
  findFilesByName(chatId: string, pattern: string): SessionFile[] {
    const files = this.getSessionFiles(chatId);
    const regex = new RegExp(pattern, 'i');
    return files.filter(sf => regex.test(sf.file.filename));
  }

  /**
   * Get files that contain specific content
   */
  searchFilesContent(chatId: string, searchTerm: string): SessionFile[] {
    const files = this.getSessionFiles(chatId);
    const regex = new RegExp(searchTerm, 'i');
    return files.filter(sf =>
      regex.test(sf.file.extractedContent) || regex.test(sf.file.filename)
    );
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expired: string[] = [];

    for (const [chatId, session] of this.sessions.entries()) {
      const age = now.getTime() - session.lastActivity.getTime();
      if (age > this.SESSION_TTL_MS) {
        expired.push(chatId);
      }
    }

    for (const chatId of expired) {
      console.log(`Cleaning up expired session: ${chatId}`);
      this.sessions.delete(chatId);
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    totalFiles: number;
    oldestSession: Date | null;
  } {
    let totalFiles = 0;
    let oldestSession: Date | null = null;

    for (const session of this.sessions.values()) {
      totalFiles += session.files.size;
      if (!oldestSession || session.lastActivity < oldestSession) {
        oldestSession = session.lastActivity;
      }
    }

    return {
      totalSessions: this.sessions.size,
      totalFiles,
      oldestSession,
    };
  }
}