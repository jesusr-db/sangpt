import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileUpload } from '@chat-template/db';

export interface ProcessedFile {
  filename: string;
  contentType: string;
  fileSize: number;
  extractedContent: string;
  metadata: Record<string, any>;
  base64Content?: string; // For images
}

export class FileProcessor {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly ALLOWED_EXTENSIONS = [
    '.txt',
    '.md',
    '.py',
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.csv',
    '.jpg',
    '.jpeg',
    '.png',
    '.pdf',
    '.docx',
  ];

  /**
   * Process an uploaded file and extract its content
   */
  static async processFile(
    filePath: string,
    originalName: string,
    mimeType: string,
  ): Promise<ProcessedFile> {
    const fileExtension = path.extname(originalName).toLowerCase();

    // Validate file extension
    if (!this.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      throw new Error(`File type ${fileExtension} is not supported`);
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    if (stats.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Process based on file type
    let extractedContent = '';
    let metadata: Record<string, any> = {
      extension: fileExtension,
      originalSize: stats.size,
      processedAt: new Date().toISOString(),
    };
    let base64Content: string | undefined;

    switch (fileExtension) {
      // Text and code files
      case '.txt':
      case '.md':
      case '.py':
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
      case '.json':
      case '.csv':
        extractedContent = await fs.readFile(filePath, 'utf-8');
        metadata.lineCount = extractedContent.split('\n').length;
        break;

      // Images
      case '.jpg':
      case '.jpeg':
      case '.png':
        const imageBuffer = await fs.readFile(filePath);
        base64Content = imageBuffer.toString('base64');
        extractedContent = `[Image: ${originalName}]`;
        metadata.isImage = true;
        metadata.base64Size = base64Content.length;
        break;

      // PDF files
      case '.pdf':
        try {
          // For now, we'll store PDFs but note that text extraction is not available
          // This avoids the CommonJS import issues in production
          extractedContent = `[PDF File: ${originalName}]`;
          metadata.isPDF = true;
          metadata.note = 'PDF text extraction is temporarily disabled. File stored successfully.';

          // Optional: Try to extract text if pdf-parse is available
          try {
            const pdfBuffer = await fs.readFile(filePath);
            const pdfParseModule = await import('pdf-parse').catch(() => null);
            if (pdfParseModule) {
              const pdfParse = pdfParseModule.default || pdfParseModule;
              if (typeof pdfParse === 'function') {
                const pdfData = await pdfParse(pdfBuffer);
                if (pdfData && pdfData.text) {
                  extractedContent = pdfData.text;
                  metadata.pageCount = pdfData.numpages;
                  metadata.pdfInfo = pdfData.info;
                  delete metadata.note;
                }
              }
            }
          } catch (parseError) {
            // Silently fall back to placeholder content
            console.log('PDF parsing unavailable, using placeholder content');
          }
        } catch (error) {
          console.error('Error processing PDF:', error);
          extractedContent = `[PDF File: ${originalName} - Content extraction failed]`;
          metadata.isPDF = true;
          metadata.error = 'Content extraction failed';
        }
        break;

      // Word documents
      case '.docx':
        try {
          // For now, we'll store DOCX files but note if text extraction fails
          extractedContent = `[Word Document: ${originalName}]`;
          metadata.isDocx = true;

          // Optional: Try to extract text if mammoth is available
          try {
            const mammothModule = await import('mammoth').catch(() => null);
            if (mammothModule) {
              const result = await mammothModule.extractRawText({ path: filePath });
              if (result && result.value) {
                extractedContent = result.value;
                metadata.messages = result.messages;
              }
            }
          } catch (parseError) {
            // Silently fall back to placeholder content
            console.log('DOCX parsing unavailable, using placeholder content');
            metadata.note = 'Word document text extraction is temporarily disabled. File stored successfully.';
          }
        } catch (error) {
          console.error('Error processing DOCX:', error);
          extractedContent = `[Word Document: ${originalName} - Content extraction failed]`;
          metadata.isDocx = true;
          metadata.error = 'Content extraction failed';
        }
        break;

      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }

    return {
      filename: originalName,
      contentType: mimeType,
      fileSize: stats.size,
      extractedContent,
      metadata,
      base64Content,
    };
  }

  /**
   * Truncate content to fit within token limits
   */
  static truncateContent(content: string, maxLength: number = 10000): string {
    if (content.length <= maxLength) {
      return content;
    }

    const truncated = content.substring(0, maxLength);
    return truncated + '\n\n[Content truncated...]';
  }

  /**
   * Prepare file content for inclusion in chat context
   */
  static formatForContext(file: FileUpload | ProcessedFile): string {
    const filename = 'filename' in file ? file.filename : file.filename;
    const content = 'extractedContent' in file ? file.extractedContent : '';

    return `File: ${filename}\n---\n${this.truncateContent(content)}\n---`;
  }

  /**
   * Check if file type supports vision models
   */
  static isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png'].includes(ext);
  }

  /**
   * Clean up temporary file
   */
  static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to cleanup temp file:', error);
    }
  }
}