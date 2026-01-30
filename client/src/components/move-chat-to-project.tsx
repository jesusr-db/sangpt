import { useState } from 'react';
import { toast } from 'sonner';
import { FolderIcon, MoveIcon } from 'lucide-react';
import useSWR from 'swr';
import type { Project, Chat } from '@chat-template/db';
import { fetcher } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MoveChatToProjectProps {
  chat: Chat;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MoveChatToProject({
  chat,
  onSuccess,
  trigger,
  open: controlledOpen,
  onOpenChange
}: MoveChatToProjectProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [targetProjectId, setTargetProjectId] = useState<string>(
    chat.projectId || 'no-project'
  );

  const { data: projects } = useSWR<Project[]>('/api/projects', fetcher);

  const handleMove = async () => {
    try {
      // If the chat is currently in a project, remove it
      if (chat.projectId) {
        await fetch(`/api/projects/${chat.projectId}/chats/${chat.id}`, {
          method: 'DELETE',
        });
      }

      // Add to new project (if not "no-project")
      if (targetProjectId !== 'no-project') {
        const response = await fetch(`/api/projects/${targetProjectId}/chats/${chat.id}`, {
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error('Failed to add chat to project');
        }
      }

      toast.success(
        targetProjectId === 'no-project'
          ? 'Chat removed from project'
          : 'Chat moved to project'
      );
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to move chat:', error);
      toast.error('Failed to move chat to project');
    }
  };

  const activeProjects = projects?.filter((p) => p.isActive === 'true') || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <MoveIcon className="mr-2 h-4 w-4" />
            Move to Project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Chat to Project</DialogTitle>
          <DialogDescription>
            Select a project to organize this chat.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={targetProjectId} onValueChange={setTargetProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no-project">
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4 opacity-50" />
                  <span>No Project</span>
                </div>
              </SelectItem>
              {activeProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    {project.icon ? (
                      <span className="text-sm">{project.icon}</span>
                    ) : (
                      <FolderIcon
                        className="h-4 w-4"
                        style={{ color: project.color || undefined }}
                      />
                    )}
                    <span>{project.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeProjects.length === 0 && (
            <p className="mt-2 text-muted-foreground text-sm">
              No projects available. Create a project in the sidebar first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={targetProjectId === (chat.projectId || 'no-project')}
          >
            {targetProjectId === 'no-project' ? 'Remove from Project' : 'Move to Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}