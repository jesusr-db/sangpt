import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  File,
  FileText,
  FileImage,
  FileCode,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  MessageSquare,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn, fetcher } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface FileInfo {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  contentLength?: number;
}

interface ChatFileToggleProps {
  chatId: string;
  projectId?: string | null | undefined;
  onToggleChange?: (enabledFileIds: string[]) => void;
  className?: string;
}

// Rough estimate: ~4 chars per token for English text
const CHARS_PER_TOKEN = 4;

export function ChatFileToggle({
  chatId,
  projectId,
  onToggleChange,
  className,
}: ChatFileToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [enabledFiles, setEnabledFiles] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch project files if in a project
  const { data: projectFiles } = useSWR<FileInfo[]>(
    projectId ? `/api/projects/${projectId}/files` : null,
    fetcher
  );

  // Fetch chat-specific files (API returns { files: [...] })
  const { data: chatFilesResponse } = useSWR<{ files: FileInfo[] }>(
    `/api/files/${chatId}`,
    fetcher
  );
  const chatFiles = chatFilesResponse?.files;

  // Initialize all files as enabled on first load
  useEffect(() => {
    if (!initialized && (projectFiles || chatFiles)) {
      const allFileIds = new Set<string>();
      projectFiles?.forEach((f) => allFileIds.add(f.id));
      chatFiles?.forEach((f) => allFileIds.add(f.id));
      setEnabledFiles(allFileIds);
      setInitialized(true);
    }
  }, [projectFiles, chatFiles, initialized]);

  // Notify parent of toggle changes
  useEffect(() => {
    if (initialized && onToggleChange) {
      onToggleChange(Array.from(enabledFiles));
    }
  }, [enabledFiles, initialized, onToggleChange]);

  const handleToggle = (fileId: string, enabled: boolean) => {
    setEnabledFiles((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  };

  const toggleAll = (files: FileInfo[], enabled: boolean) => {
    setEnabledFiles((prev) => {
      const next = new Set(prev);
      files.forEach((f) => {
        if (enabled) {
          next.add(f.id);
        } else {
          next.delete(f.id);
        }
      });
      return next;
    });
  };

  const getFileIcon = (filename: string, contentType: string) => {
    if (contentType.startsWith('image/')) {
      return <FileImage className="h-3.5 w-3.5 text-purple-500" />;
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['pdf', 'docx'].includes(ext || '')) {
      return <FileText className="h-3.5 w-3.5 text-red-500" />;
    }
    if (['py', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext || '')) {
      return <FileCode className="h-3.5 w-3.5 text-green-500" />;
    }
    return <File className="h-3.5 w-3.5 text-blue-500" />;
  };

  const estimateTokens = (file: FileInfo): number => {
    if (!file.contentLength) return 0;
    // Truncated at 5000 chars in backend, so cap estimate
    const length = Math.min(file.contentLength, 5000);
    return Math.ceil(length / CHARS_PER_TOKEN);
  };

  const formatTokens = (tokens: number): string => {
    if (tokens < 1000) return `~${tokens}`;
    return `~${(tokens / 1000).toFixed(1)}k`;
  };

  const totalFiles = (projectFiles?.length || 0) + (chatFiles?.length || 0);
  const enabledCount = enabledFiles.size;

  // Calculate total tokens for enabled files
  const calculateTotalTokens = () => {
    let total = 0;
    projectFiles?.forEach((f) => {
      if (enabledFiles.has(f.id)) total += estimateTokens(f);
    });
    chatFiles?.forEach((f) => {
      if (enabledFiles.has(f.id)) total += estimateTokens(f);
    });
    return total;
  };

  if (totalFiles === 0) {
    return null;
  }

  const totalTokens = calculateTotalTokens();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-between px-2 text-xs"
        >
          <div className="flex items-center gap-2">
            <File className="h-3.5 w-3.5" />
            <span>
              Files ({enabledCount}/{totalFiles} active)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {totalTokens > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Coins className="h-3 w-3" />
                {formatTokens(totalTokens)} tokens
              </span>
            )}
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 space-y-3">
        {/* Project Files Section */}
        {projectFiles && projectFiles.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Project Files</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  toggleAll(
                    projectFiles,
                    !projectFiles.every((f) => enabledFiles.has(f.id))
                  )
                }
              >
                {projectFiles.every((f) => enabledFiles.has(f.id))
                  ? 'Disable All'
                  : 'Enable All'}
              </Button>
            </div>
            <div className="space-y-1">
              {projectFiles.map((file) => (
                <FileToggleRow
                  key={file.id}
                  file={file}
                  enabled={enabledFiles.has(file.id)}
                  onToggle={(enabled) => handleToggle(file.id, enabled)}
                  getFileIcon={getFileIcon}
                  estimateTokens={estimateTokens}
                  formatTokens={formatTokens}
                />
              ))}
            </div>
          </div>
        )}

        {/* Chat Files Section */}
        {chatFiles && chatFiles.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Chat Files</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  toggleAll(
                    chatFiles,
                    !chatFiles.every((f) => enabledFiles.has(f.id))
                  )
                }
              >
                {chatFiles.every((f) => enabledFiles.has(f.id))
                  ? 'Disable All'
                  : 'Enable All'}
              </Button>
            </div>
            <div className="space-y-1">
              {chatFiles.map((file) => (
                <FileToggleRow
                  key={file.id}
                  file={file}
                  enabled={enabledFiles.has(file.id)}
                  onToggle={(enabled) => handleToggle(file.id, enabled)}
                  getFileIcon={getFileIcon}
                  estimateTokens={estimateTokens}
                  formatTokens={formatTokens}
                />
              ))}
            </div>
          </div>
        )}

        {/* Token savings hint */}
        {enabledCount < totalFiles && (
          <p className="text-center text-muted-foreground text-xs">
            💡 {totalFiles - enabledCount} file(s) disabled to save tokens
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface FileToggleRowProps {
  file: FileInfo;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  getFileIcon: (filename: string, contentType: string) => React.ReactNode;
  estimateTokens: (file: FileInfo) => number;
  formatTokens: (tokens: number) => string;
}

function FileToggleRow({
  file,
  enabled,
  onToggle,
  getFileIcon,
  estimateTokens,
  formatTokens,
}: FileToggleRowProps) {
  const tokens = estimateTokens(file);

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border px-2 py-1.5 transition-colors',
        enabled ? 'bg-card' : 'bg-muted/30 opacity-60'
      )}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {getFileIcon(file.filename, file.contentType)}
        <span className="truncate text-xs">{file.filename}</span>
        {tokens > 0 && (
          <span className="shrink-0 text-muted-foreground text-xs">
            ({formatTokens(tokens)})
          </span>
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className="h-4 w-7 shrink-0"
      />
    </div>
  );
}
