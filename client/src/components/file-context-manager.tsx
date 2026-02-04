import React, { useState, } from 'react';
import { FileChip, type UploadedFile } from './file-upload-area';
import { Button } from './ui/button';
import { Trash2, EyeOff, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { cn } from '@/lib/utils';

interface FileContextManagerProps {
  chatId: string;
  uploadedFiles: UploadedFile[];
  onFileRemoved: (fileId: string) => void;
  className?: string;
}

export function FileContextManager({
  chatId,
  uploadedFiles,
  onFileRemoved,
  className,
}: FileContextManagerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const handleRemoveFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${chatId}/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove file');
      }

      onFileRemoved(fileId);
      toast.success('File removed');

      if (selectedFile === fileId) {
        setSelectedFile(null);
        setFileContent(null);
      }
    } catch (error) {
      console.error('Remove file error:', error);
      toast.error('Failed to remove file');
    }
  };

  const loadFileContent = async (fileId: string) => {
    if (selectedFile === fileId) {
      // Toggle off if clicking the same file
      setSelectedFile(null);
      setFileContent(null);
      return;
    }

    setIsLoadingContent(true);
    try {
      const response = await fetch(`/api/files/${chatId}/${fileId}/content`);
      if (!response.ok) {
        throw new Error('Failed to load file content');
      }

      const data = await response.json();
      setSelectedFile(fileId);

      // Handle different content types
      if (data.base64Content) {
        // For images, show a preview
        setFileContent(`[Image content - ${data.filename}]`);
      } else {
        setFileContent(data.content || '[No content available]');
      }
    } catch (error) {
      console.error('Load content error:', error);
      toast.error('Failed to load file content');
    } finally {
      setIsLoadingContent(false);
    }
  };

  const clearAllFiles = async () => {
    try {
      // Remove all files one by one
      for (const file of uploadedFiles) {
        await handleRemoveFile(file.id);
      }
    } catch (error) {
      console.error('Clear files error:', error);
      toast.error('Failed to clear all files');
    }
  };

  if (uploadedFiles.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className='mb-2 flex items-center justify-between'>
          <CollapsibleTrigger className='flex items-center gap-2 font-medium text-sm transition-colors hover:text-primary'>
            <FileText className="h-4 w-4" />
            <span>
              Uploaded Files ({uploadedFiles.length})
            </span>
            <span className='text-gray-500 text-xs'>
              {isExpanded ? '▼' : '▶'}
            </span>
          </CollapsibleTrigger>

          {uploadedFiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFiles}
              className='text-red-500 text-xs hover:text-red-600'
            >
              <Trash2 className='mr-1 h-3 w-3' />
              Clear All
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <FileChip
                  key={file.id}
                  file={file}
                  onRemove={() => handleRemoveFile(file.id)}
                  onClick={() => loadFileContent(file.id)}
                />
              ))}
            </div>

            {selectedFile && fileContent && (
              <div className='mt-3 rounded bg-gray-50 p-3 dark:bg-gray-900'>
                <div className='mb-2 flex items-center justify-between'>
                  <span className='font-medium text-gray-600 text-xs dark:text-gray-400'>
                    File Preview: {uploadedFiles.find(f => f.id === selectedFile)?.filename}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileContent(null);
                    }}
                    className="h-6 px-2"
                  >
                    <EyeOff className="h-3 w-3" />
                  </Button>
                </div>
                <pre className='max-h-40 overflow-y-auto whitespace-pre-wrap text-gray-700 text-xs dark:text-gray-300'>
                  {fileContent}
                </pre>
              </div>
            )}

            {isLoadingContent && (
              <div className='py-2 text-center text-gray-500 text-xs'>
                Loading file content...
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function FileReferenceHelper({
  uploadedFiles,
  onInsertReference,
}: {
  uploadedFiles: UploadedFile[];
  onInsertReference: (filename: string) => void;
}) {
  if (uploadedFiles.length === 0) {
    return null;
  }

  return (
    <div className='flex items-center gap-1 text-gray-500 text-xs dark:text-gray-400'>
      <span>Reference files:</span>
      {uploadedFiles.map((file) => (
        <button
          key={file.id}
          onClick={() => onInsertReference(file.filename)}
          className='rounded px-2 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
        >
          @{file.filename}
        </button>
      ))}
    </div>
  );
}