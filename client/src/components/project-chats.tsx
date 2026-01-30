import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { toast } from 'sonner';
import { MessageSquareIcon, FolderIcon, MoveIcon, TrashIcon } from 'lucide-react';
import type { Chat, Project } from '@chat-template/db';
import { fetcher } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

interface ProjectChatsProps {
  projectId: string;
}

export function ProjectChats({ projectId }: ProjectChatsProps) {
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string>('');

  // Fetch chats for this project
  const { data: chats, mutate: mutateChats } = useSWR<Chat[]>(
    `/api/projects/${projectId}/chats`,
    fetcher
  );

  // Fetch all projects for the move dialog
  const { data: projects } = useSWR<Project[]>('/api/projects', fetcher);

  const handleMoveChat = async () => {
    if (!selectedChat || !targetProjectId) return;

    try {
      // Remove from current project
      await fetch(`/api/projects/${projectId}/chats/${selectedChat.id}`, {
        method: 'DELETE',
      });

      // Add to new project (if not "no-project")
      if (targetProjectId !== 'no-project') {
        await fetch(`/api/projects/${targetProjectId}/chats/${selectedChat.id}`, {
          method: 'POST',
        });
      }

      toast.success('Chat moved successfully');
      mutateChats();
      setShowMoveDialog(false);
      setSelectedChat(null);
      setTargetProjectId('');
    } catch (error) {
      console.error('Failed to move chat:', error);
      toast.error('Failed to move chat');
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    const deletePromise = fetch(`/api/chat/${chat.id}`, {
      method: 'DELETE',
    });

    toast.promise(deletePromise, {
      loading: 'Deleting chat...',
      success: () => {
        mutateChats();
        return 'Chat deleted successfully';
      },
      error: 'Failed to delete chat',
    });
  };

  if (!chats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading chats...</div>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquareIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="mb-2 font-semibold">No chats in this project</h3>
        <p className="text-muted-foreground text-sm">
          Start a new chat with this project selected, or move existing chats here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 p-4">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50"
          >
            <div
              className="flex flex-1 cursor-pointer items-center gap-3"
              onClick={() => navigate(`/chat/${chat.id}`)}
            >
              <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">{chat.title}</div>
                <div className="text-muted-foreground text-sm">
                  {format(new Date(chat.createdAt), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChat(chat);
                  setShowMoveDialog(true);
                }}
              >
                <MoveIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat);
                }}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Move Chat Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Chat to Another Project</DialogTitle>
            <DialogDescription>
              Select a project to move "{selectedChat?.title}" to.
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
                {projects
                  ?.filter((p) => p.id !== projectId && p.isActive === 'true')
                  .map((project) => (
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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveDialog(false);
                setSelectedChat(null);
                setTargetProjectId('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMoveChat}
              disabled={!targetProjectId}
            >
              Move Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}