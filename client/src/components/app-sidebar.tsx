import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarProjects } from '@/components/sidebar-projects';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { PlusIcon, ClockIcon, FolderIcon } from 'lucide-react';
import type { ClientSession } from '@chat-template/auth';

export function AppSidebar({
  user,
  preferredUsername,
}: {
  user: ClientSession['user'] | undefined;
  preferredUsername: string | null;
}) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('history');

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <Link
              to="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className="flex flex-row items-center gap-3"
            >
              <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                Chatbot
              </span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="h-8 p-1 md:h-fit md:p-2"
                  onClick={() => {
                    setOpenMobile(false);
                    navigate('/');
                  }}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" className="hidden md:block">
                New Chat
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>

        {/* Tabs for History and Projects */}
        <div className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="history" className="flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                <span className="text-xs">History</span>
              </TabsTrigger>
              <TabsTrigger value="projects" className="flex items-center gap-1">
                <FolderIcon className="h-3 w-3" />
                <span className="text-xs">Projects</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {activeTab === 'history' ? (
          <SidebarHistory user={user} />
        ) : (
          <SidebarProjects user={user} />
        )}
      </SidebarContent>

      <SidebarFooter>
        {user && (
          <SidebarUserNav user={user} preferredUsername={preferredUsername} />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
