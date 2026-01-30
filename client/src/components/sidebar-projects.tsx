import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import useSWR from 'swr';
import { FolderIcon, FolderPlusIcon, LoaderIcon, MoreHorizontalIcon, TrashIcon, EditIcon, FileIcon, Settings2Icon } from 'lucide-react';
import type { Project } from '@chat-template/db';
import { fetcher } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ProjectManagerDialog } from './project-manager';
import { cn } from '@/lib/utils';

export function SidebarProjects({ user }: { user?: any }) {
  const { setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const {
    data: projects,
    error,
    isLoading,
    mutate,
  } = useSWR<Project[]>(user ? '/api/projects' : null, fetcher);

  const handleDeleteProject = async (project: Project) => {
    const deletePromise = fetch(`/api/projects/${project.id}`, {
      method: 'DELETE',
    });

    toast.promise(deletePromise, {
      loading: 'Deleting project...',
      success: () => {
        mutate((projects) => {
          if (projects) {
            return projects.filter((p) => p.id !== project.id);
          }
        });
        return 'Project deleted successfully';
      },
      error: 'Failed to delete project',
    });
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    navigate(`/project/${projectId}`);
    setOpenMobile(false);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setShowProjectManager(true);
  };

  const handleCreateProject = () => {
    setEditingProject(null);
    setShowProjectManager(true);
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Login to create and manage projects!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex flex-row items-center gap-2 p-2 text-zinc-500">
            <div className="animate-spin">
              <LoaderIcon />
            </div>
            <div>Loading projects...</div>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (error) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-red-500">
            Failed to load projects
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const activeProjects = projects?.filter((p) => p.isActive === 'true') || [];
  const archivedProjects = projects?.filter((p) => p.isActive === 'false') || [];

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {/* Create New Project Button */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleCreateProject}
                className="flex items-center gap-2 font-medium"
              >
                <FolderPlusIcon className="h-4 w-4" />
                <span>New Project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Active Projects */}
            {activeProjects.length > 0 && (
              <div className="mt-4">
                <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                  Active Projects
                </div>
                {activeProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <div className="flex w-full items-center">
                      <SidebarMenuButton
                        onClick={() => handleSelectProject(project.id)}
                        className={cn(
                          'flex-1',
                          selectedProjectId === project.id && 'bg-sidebar-accent',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {project.icon ? (
                            <span className="text-lg">{project.icon}</span>
                          ) : (
                            <FolderIcon
                              className="h-4 w-4"
                              style={{ color: project.color || undefined }}
                            />
                          )}
                          <span className="truncate">{project.name}</span>
                        </div>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                          >
                            <MoreHorizontalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/project/${project.id}/chats`)}
                          >
                            <FileIcon className="mr-2 h-4 w-4" />
                            View Chats
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate(`/project/${project.id}/settings`)}
                          >
                            <Settings2Icon className="mr-2 h-4 w-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditProject(project)}>
                            <EditIcon className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteProject(project)}
                            className="text-red-600"
                          >
                            <TrashIcon className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SidebarMenuItem>
                ))}
              </div>
            )}

            {/* Archived Projects */}
            {archivedProjects.length > 0 && (
              <div className="mt-4">
                <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                  Archived Projects
                </div>
                {archivedProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <div className="flex w-full items-center opacity-60">
                      <SidebarMenuButton
                        onClick={() => handleSelectProject(project.id)}
                        className="flex-1"
                      >
                        <div className="flex items-center gap-2">
                          {project.icon ? (
                            <span className="text-lg">{project.icon}</span>
                          ) : (
                            <FolderIcon
                              className="h-4 w-4"
                              style={{ color: project.color || undefined }}
                            />
                          )}
                          <span className="truncate">{project.name}</span>
                        </div>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                          >
                            <MoreHorizontalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditProject(project)}>
                            <EditIcon className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteProject(project)}
                            className="text-red-600"
                          >
                            <TrashIcon className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SidebarMenuItem>
                ))}
              </div>
            )}

            {/* Empty State */}
            {projects?.length === 0 && (
              <div className="mt-8 flex w-full flex-col items-center justify-center gap-2 px-2 text-center text-sm text-zinc-500">
                <FolderIcon className="h-8 w-8 text-zinc-400" />
                <p>No projects yet</p>
                <p className="text-xs">Create your first project to organize your chats</p>
              </div>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Project Manager Dialog */}
      <ProjectManagerDialog
        open={showProjectManager}
        onOpenChange={setShowProjectManager}
        project={editingProject}
        onSuccess={() => {
          mutate();
          setShowProjectManager(false);
          setEditingProject(null);
        }}
      />
    </>
  );
}