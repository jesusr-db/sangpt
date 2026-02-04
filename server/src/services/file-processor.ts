import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileUpload } from '@chat-template/db';
import type { ImagePart, TextPart } from 'ai';
import { createRequire } from 'node:module';

// pdf-parse is a CommonJS module, use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export type FileContentPart = ImagePart | TextPart;

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
    if (!FileProcessor.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      throw new Error(`File type ${fileExtension} is not supported`);
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    if (stats.size > FileProcessor.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${FileProcessor.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Process based on file type
    let extractedContent = '';
    const metadata: Record<string, any> = {
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
      case '.png': {
        const imageBuffer = await fs.readFile(filePath);
        base64Content = imageBuffer.toString('base64');
        extractedContent = `[Image: ${originalName}]`;
        metadata.isImage = true;
        metadata.base64Size = base64Content.length;
        break;
      }

      // PDF files
      case '.pdf':
        try {
          const pdfBuffer = await fs.readFile(filePath);
          const pdfData = await pdfParse(pdfBuffer);

          metadata.isPDF = true;
          metadata.pageCount = pdfData.numpages;
          metadata.pdfInfo = pdfData.info;

          // Check if we got meaningful text content
          const text = pdfData.text?.trim() || '';
          if (text.length > 0) {
            extractedContent = text;
          } else {
            // PDF has no extractable text (likely scanned/image-based)
            extractedContent = `[PDF File: ${originalName}]\n\nNote: This PDF appears to be scanned or image-based. No text content could be extracted. The document has ${pdfData.numpages} page(s).`;
            metadata.isScannedPDF = true;
            metadata.warning = 'PDF appears to be scanned/image-based with no extractable text';
          }
        } catch (error) {
          console.error('Error processing PDF:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          extractedContent = `[PDF File: ${originalName} - Content extraction failed: ${errorMessage}]`;
          metadata.isPDF = true;
          metadata.error = errorMessage;
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
              if (result?.value) {
                extractedContent = result.value;
                metadata.messages = result.messages;
              }
            }
          } catch (_parseError) {
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
  static truncateContent(content: string, maxLength = 10000): string {
    if (content.length <= maxLength) {
      return content;
    }

    const truncated = content.substring(0, maxLength);
    return `${truncated}\n\n[Content truncated...]`;
  }

  /**
   * Prepare file content for inclusion in chat context
   */
  static formatForContext(file: FileUpload | ProcessedFile): string {
    const filename = 'filename' in file ? file.filename : file.filename;
    const content = 'extractedContent' in file ? file.extractedContent : '';

    return `File: ${filename}\n---\n${FileProcessor.truncateContent(content)}\n---`;
  }

  /**
   * Check if file type supports vision models
   */
  static isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png'].includes(ext);
  }

  /**
   * Convert a ProcessedFile to AI SDK content parts for multimodal models.
   * Images with base64 data are returned as image parts for vision models.
   * All other files are returned as text parts with their extracted content.
   */
  static toContentParts(file: ProcessedFile): FileContentPart[] {
    // If it's an image with base64 content, return as image part for vision models
    if (FileProcessor.isImageFile(file.filename) && file.base64Content) {
      return [
        {
          type: 'image',
          image: `data:${file.contentType};base64,${file.base64Content}`,
        },
      ];
    }

    // For all other files, return as text part with extracted content
    return [
      {
        type: 'text',
        text: `File: ${file.filename}\n---\n${FileProcessor.truncateContent(file.extractedContent)}\n---`,
      },
    ];
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