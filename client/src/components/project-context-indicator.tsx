import { useEffect, useState } from 'react';
import { FolderIcon, FileTextIcon, InfoIcon } from 'lucide-react';
import { fetcher } from '@/lib/utils';
import type { ProjectContext, ProjectFile } from '@chat-template/db';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from './ui/tooltip';

interface ProjectContextIndicatorProps {
  projectId: string | null;
  projectName?: string;
  projectColor?: string;
  projectIcon?: string;
}

export function ProjectContextIndicator({
  projectId,
  projectName,
  projectColor,
  projectIcon,
}: ProjectContextIndicatorProps) {
  const [contexts, setContexts] = useState<ProjectContext[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setContexts([]);
      setFiles([]);
      return;
    }

    setIsLoading(true);

    // Fetch project contexts and files
    Promise.all([
      fetcher(`/api/projects/${projectId}/context`).catch(() => []),
      fetcher(`/api/projects/${projectId}/files`).catch(() => []),
    ])
      .then(([contextData, fileData]) => {
        setContexts(contextData || []);
        setFiles(fileData || []);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [projectId]);

  if (!projectId || (contexts.length === 0 && files.length === 0)) {
    return null;
  }

  const hasInstructions = contexts.some(c => c.contextType === 'instruction');
  const hasFiles = files.length > 0;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {projectIcon ? (
            <span className="text-base">{projectIcon}</span>
          ) : (
            <FolderIcon
              className="h-4 w-4"
              style={{ color: projectColor || undefined }}
            />
          )}
          <span className="font-medium">
            Using project context: {projectName || 'Unnamed Project'}
          </span>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {hasInstructions && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <InfoIcon className="h-3 w-3" />
                  <span>{contexts.filter(c => c.contextType === 'instruction').length} instructions</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-xs">Project Instructions:</p>
                  {contexts
                    .filter(c => c.contextType === 'instruction')
                    .map((ctx, i) => (
                      <p key={i} className="text-xs">
                        • {ctx.content.substring(0, 100)}
                        {ctx.content.length > 100 && '...'}
                      </p>
                    ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {hasFiles && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileTextIcon className="h-3 w-3" />
                  <span>{files.length} shared files</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-xs">Project Files:</p>
                  <div className="space-y-1">
                    {files.slice(0, 5).map((file, i) => (
                      <p key={i} className="text-xs">
                        • {file.filename}
                      </p>
                    ))}
                    {files.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        ...and {files.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}