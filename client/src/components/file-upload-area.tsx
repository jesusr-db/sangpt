import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, File, FileText, Image, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileUploadAreaProps {
  chatId: string;
  onFileUploaded: (file: UploadedFile) => void;
  disabled?: boolean;
  className?: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  metadata?: Record<string, any>;
  hasContent: boolean;
  isImage: boolean;
}

const ALLOWED_EXTENSIONS = [
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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploadArea({
  chatId,
  onFileUploaded,
  disabled = false,
  className,
}: FileUploadAreaProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `File type ${extension} is not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }

    return null;
  };

  const uploadFile = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chatId', chatId);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload file');
      }

      const uploadedFile = await response.json();
      onFileUploaded(uploadedFile);
      toast.success(`File "${file.name}" uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(uploadFile);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const files = Array.from(e.dataTransfer.files);
      files.forEach(uploadFile);
    },
    [disabled, isUploading]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled && !isUploading) {
        setIsDragging(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
      return <Image className="h-4 w-4" />;
    }
    if (['pdf', 'docx'].includes(ext || '')) {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 border-dashed transition-colors',
        isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
          : 'border-gray-300 dark:border-gray-700',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled || isUploading}
      />

      <div className="flex flex-col items-center justify-center p-6 text-center">
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        ) : (
          <Upload className="h-8 w-8 text-gray-400" />
        )}

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {isUploading
            ? 'Uploading...'
            : isDragging
            ? 'Drop files here'
            : 'Drag and drop files here, or click to select'}
        </p>

        {!isUploading && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            Select Files
          </Button>
        )}

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
          Supported: {ALLOWED_EXTENSIONS.join(', ')} (max {MAX_FILE_SIZE / 1024 / 1024}MB)
        </p>
      </div>
    </div>
  );
}

export function FileChip({
  file,
  onRemove,
  onClick,
}: {
  file: UploadedFile;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
      return <Image className="h-3 w-3" />;
    }
    if (['pdf', 'docx'].includes(ext || '')) {
      return <FileText className="h-3 w-3" />;
    }
    return <File className="h-3 w-3" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs',
        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
        onClick && 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
      onClick={onClick}
    >
      {getFileIcon(file.filename)}
      <span className="max-w-[150px] truncate">{file.filename}</span>
      <span className="text-gray-500 dark:text-gray-500">
        ({formatFileSize(file.fileSize)})
      </span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-red-500 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}