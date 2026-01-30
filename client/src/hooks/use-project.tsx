import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import useSWR from 'swr';
import type { Project } from '@chat-template/db';
import { fetcher } from '@/lib/utils';

interface ProjectContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    // Persist the current project in localStorage
    return localStorage.getItem('currentProjectId');
  });

  const { data: currentProject, isLoading } = useSWR<Project>(
    currentProjectId ? `/api/projects/${currentProjectId}` : null,
    fetcher,
    {
      onError: () => {
        // If project not found or error, clear the selection
        setCurrentProjectId(null);
        localStorage.removeItem('currentProjectId');
      },
    }
  );

  const setCurrentProject = (project: Project | null) => {
    if (project) {
      setCurrentProjectId(project.id);
      localStorage.setItem('currentProjectId', project.id);
    } else {
      setCurrentProjectId(null);
      localStorage.removeItem('currentProjectId');
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        currentProject: currentProject || null,
        setCurrentProject,
        isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}