import { useState } from 'react';
import { FolderIcon, ChevronDownIcon } from 'lucide-react';
import { useProject } from '@/hooks/use-project';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';
import type { Project } from '@chat-template/db';
import { fetcher } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function ProjectIndicator() {
  const { currentProject, setCurrentProject } = useProject();
  const [open, setOpen] = useState(false);

  const { data: projects } = useSWR<Project[]>(
    '/api/projects',
    fetcher
  );

  const activeProjects = projects?.filter((p) => p.isActive === 'true') || [];

  const handleSelectProject = (project: Project | null) => {
    setCurrentProject(project);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
        >
          {currentProject ? (
            <>
              {currentProject.icon ? (
                <span className="text-sm">{currentProject.icon}</span>
              ) : (
                <FolderIcon
                  className="h-3.5 w-3.5"
                  style={{ color: currentProject.color || undefined }}
                />
              )}
              <span className="max-w-[120px] truncate">
                {currentProject.name}
              </span>
            </>
          ) : (
            <>
              <FolderIcon className="h-3.5 w-3.5" />
              <span>No Project</span>
            </>
          )}
          <ChevronDownIcon className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem
          onClick={() => handleSelectProject(null)}
          className={cn(
            'flex items-center gap-2',
            !currentProject && 'bg-accent'
          )}
        >
          <FolderIcon className="h-4 w-4 opacity-50" />
          <span>No Project</span>
        </DropdownMenuItem>

        {activeProjects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-muted-foreground text-xs">
              Active Projects
            </div>
            {activeProjects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className={cn(
                  'flex items-center gap-2',
                  currentProject?.id === project.id && 'bg-accent'
                )}
              >
                {project.icon ? (
                  <span className="text-sm">{project.icon}</span>
                ) : (
                  <FolderIcon
                    className="h-4 w-4"
                    style={{ color: project.color || undefined }}
                  />
                )}
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {activeProjects.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 text-center text-muted-foreground text-xs">
              No projects yet. Create one in the sidebar.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}