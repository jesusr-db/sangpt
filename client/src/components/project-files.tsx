import { useState, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  Upload,
  File,
  FileText,
  Trash2,
  Loader2,
  HardDrive,
  MemoryStick,
  FileImage,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, fetcher } from '@/lib/utils';

interface ProjectFile {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storageType?: 'volume' | 'memory' | 'database';
  createdAt: string;
  extractedContent?: string;
}

interface ProjectFilesProps {
  projectId: string;
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
  '.pdf',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch project files
  const {
    data: files,
    mutate: mutateFiles,
    isLoading,
  } = useSWR<ProjectFile[]>(`/api/projects/${projectId}/files`, fetcher);

  const validateFile = (file: File): string | null => {
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `File type ${extension} is not supported.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`;
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

    try {
      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to upload file');
      }

      toast.success(`"${file.name}" uploaded`);
      mutateFiles();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/files/${fileId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      toast.success(`"${filename}" deleted`);
      mutateFiles();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      Array.from(selectedFiles).forEach(uploadFile);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (isUploading) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach(uploadFile);
    },
    [isUploading, projectId]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isUploading) setIsDragging(true);
    },
    [isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const getFileIcon = (filename: string, contentType: string) => {
    if (contentType.startsWith('image/')) {
      return <FileImage className="h-4 w-4 text-purple-500" />;
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['pdf', 'docx'].includes(ext || '')) {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    if (['py', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext || '')) {
      return <FileCode className="h-4 w-4 text-green-500" />;
    }
    return <File className="h-4 w-4 text-blue-500" />;
  };

  const getStorageIcon = (storageType?: string) => {
    if (storageType === 'volume') {
      return (
        <span title="Stored in Databricks Volume">
          <HardDrive className="h-3 w-3 text-muted-foreground" />
        </span>
      );
    }
    return (
      <span title="Stored in memory">
        <MemoryStick className="h-3 w-3 text-muted-foreground" />
      </span>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-muted-foreground/25',
          isUploading && 'pointer-events-none opacity-50'
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
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center p-6 text-center">
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}

          <p className="mt-2 text-muted-foreground text-sm">
            {isUploading
              ? 'Uploading...'
              : isDragging
                ? 'Drop files here'
                : 'Drag and drop files, or click to select'}
          </p>

          {!isUploading && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => fileInputRef.current?.click()}
            >
              Select Files
            </Button>
          )}

          <p className="mt-2 text-muted-foreground/70 text-xs">
            Max {MAX_FILE_SIZE / 1024 / 1024}MB per file
          </p>
        </div>
      </div>

      {/* File List */}
      <div>
        <h4 className="mb-2 font-medium text-sm">
          Project Files ({files?.length || 0})
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files && files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  {getFileIcon(file.filename, file.contentType)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{file.filename}</span>
                      {getStorageIcon(file.storageType)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>•</span>
                      <span>{file.contentType}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(file.id, file.filename)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <File className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground text-sm">
              No files uploaded yet
            </p>
            <p className="text-muted-foreground/70 text-xs">
              Files uploaded here will be available to all chats in this project
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="font-medium">How project files work:</p>
        <ul className="mt-1 list-inside list-disc space-y-1">
          <li>Files uploaded here are shared across all chats in this project</li>
          <li>Text content is automatically extracted and available to the AI</li>
          <li>Toggle files on/off per chat to control token usage</li>
        </ul>
      </div>
    </div>
  );
}
