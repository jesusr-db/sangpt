import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  FolderIcon,
  EditIcon,
  PlusIcon,
  FileIcon,
  MessageSquareIcon,
  Settings2Icon,
  ChevronLeftIcon,
} from 'lucide-react';
import type { Project, ProjectContext as ProjectContextType } from '@chat-template/db';
import { fetcher } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectChats } from '@/components/project-chats';
import { ProjectManagerDialog } from '@/components/project-manager';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useProject } from '@/hooks/use-project';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setCurrentProject } = useProject();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingContext, setEditingContext] = useState<ProjectContextType | null>(null);
  const [newInstruction, setNewInstruction] = useState('');

  // Fetch project details
  const { data: project, mutate: mutateProject } = useSWR<Project>(
    id ? `/api/projects/${id}` : null,
    fetcher
  );

  // Fetch project context
  const { data: contexts, mutate: mutateContexts } = useSWR<ProjectContextType[]>(
    id ? `/api/projects/${id}/context` : null,
    fetcher
  );

  const handleAddInstruction = async () => {
    if (!newInstruction.trim() || !id) return;

    try {
      const response = await fetch(`/api/projects/${id}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextType: 'instruction',
          content: newInstruction.trim(),
        }),
      });

      if (!response.ok) throw new Error('Failed to add instruction');

      toast.success('Instruction added');
      setNewInstruction('');
      mutateContexts();
    } catch (error) {
      console.error('Failed to add instruction:', error);
      toast.error('Failed to add instruction');
    }
  };

  const handleUpdateContext = async (context: ProjectContextType, newContent: string) => {
    if (!id) return;

    try {
      const response = await fetch(`/api/projects/${id}/context/${context.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!response.ok) throw new Error('Failed to update context');

      toast.success('Context updated');
      setEditingContext(null);
      mutateContexts();
    } catch (error) {
      console.error('Failed to update context:', error);
      toast.error('Failed to update context');
    }
  };

  const handleDeleteContext = async (context: ProjectContextType) => {
    if (!id) return;

    try {
      const response = await fetch(`/api/projects/${id}/context/${context.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete context');

      toast.success('Context deleted');
      mutateContexts();
    } catch (error) {
      console.error('Failed to delete context:', error);
      toast.error('Failed to delete context');
    }
  };

  const handleStartNewChat = () => {
    if (project) {
      setCurrentProject(project);
      navigate('/');
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              {project.icon ? (
                <span className="text-2xl">{project.icon}</span>
              ) : (
                <FolderIcon
                  className="h-6 w-6"
                  style={{ color: project.color || undefined }}
                />
              )}
              <h1 className="text-xl font-semibold">{project.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <EditIcon className="mr-2 h-4 w-4" />
              Edit Project
            </Button>
            <Button onClick={handleStartNewChat}>
              <PlusIcon className="mr-2 h-4 w-4" />
              New Chat
            </Button>
          </div>
        </div>
        {project.description && (
          <p className="mt-2 text-muted-foreground text-sm">{project.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="chats" className="h-full">
          <TabsList className="m-4">
            <TabsTrigger value="chats">
              <MessageSquareIcon className="mr-2 h-4 w-4" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="context">
              <FileIcon className="mr-2 h-4 w-4" />
              Context
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2Icon className="mr-2 h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chats" className="h-full">
            <ProjectChats projectId={id!} />
          </TabsContent>

          <TabsContent value="context" className="p-4 space-y-4">
            <div>
              <h3 className="mb-2 font-semibold">Project Instructions</h3>
              <p className="mb-4 text-muted-foreground text-sm">
                Add instructions that will be included in all chats within this project.
              </p>

              {/* Existing Instructions */}
              {contexts
                ?.filter((c) => c.contextType === 'instruction')
                .map((context) => (
                  <div key={context.id} className="mb-3 rounded-lg border p-3">
                    {editingContext?.id === context.id ? (
                      <div className="space-y-2">
                        <Textarea
                          defaultValue={context.content}
                          rows={3}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) {
                              handleUpdateContext(
                                context,
                                (e.target as HTMLTextAreaElement).value
                              );
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingContext(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              const textarea = (e.currentTarget.parentElement?.parentElement?.querySelector('textarea') as HTMLTextAreaElement);
                              if (textarea) {
                                handleUpdateContext(context, textarea.value);
                              }
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <p className="whitespace-pre-wrap">{context.content}</p>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingContext(context)}
                          >
                            <EditIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => handleDeleteContext(context)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

              {/* Add New Instruction */}
              <div className="space-y-2">
                <Label htmlFor="new-instruction">Add Instruction</Label>
                <Textarea
                  id="new-instruction"
                  placeholder="Enter instructions that apply to all chats in this project..."
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={handleAddInstruction}
                  disabled={!newInstruction.trim()}
                >
                  Add Instruction
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="p-4">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 font-semibold">Project Settings</h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  Manage project configuration and preferences.
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="mb-2 font-medium">Project Status</h4>
                <p className="text-muted-foreground text-sm">
                  Status: {project.isActive === 'true' ? 'Active' : 'Archived'}
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="mb-2 font-medium">Created</h4>
                <p className="text-muted-foreground text-sm">
                  {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="mb-2 font-medium">Last Updated</h4>
                <p className="text-muted-foreground text-sm">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Project Dialog */}
      <ProjectManagerDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={project}
        onSuccess={() => {
          mutateProject();
          setShowEditDialog(false);
        }}
      />
    </div>
  );
}

// Add missing import
import { TrashIcon } from 'lucide-react';