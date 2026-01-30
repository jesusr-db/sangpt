import type { Chat, Project } from '@chat-template/db';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { memo, useState } from 'react';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import {
  CircleCheck,
  GlobeIcon,
  LockIcon,
  MoreHorizontalIcon,
  ShareIcon,
  TrashIcon,
  FolderIcon,
  MoveIcon,
} from 'lucide-react';
import { MoveChatToProject } from './move-chat-to-project';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  setOpenMobile,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  setOpenMobile: (open: boolean) => void;
}) => {
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
  });
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  // Fetch projects to find the project this chat belongs to
  const { data: projects } = useSWR<Project[]>('/api/projects', fetcher);
  const chatProject = projects?.find((p) => p.id === chat.projectId);

  return (
    <SidebarMenuItem data-testid="chat-history-item">
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={`/chat/${chat.id}`} onClick={() => setOpenMobile(false)}>
          <div className="flex flex-1 items-center gap-2">
            <span className="flex-1 truncate">{chat.title}</span>
            {chatProject && (
              <div className="flex items-center gap-1">
                {chatProject.icon ? (
                  <span className="text-xs">{chatProject.icon}</span>
                ) : (
                  <FolderIcon
                    className="h-3 w-3 opacity-60"
                    style={{ color: chatProject.color || undefined }}
                  />
                )}
              </div>
            )}
          </div>
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            data-testid="chat-options"
            className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setShowMoveDialog(true)}
          >
            <MoveIcon />
            <span>Move to Project</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ShareIcon />
              <span>Share</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType('private');
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <LockIcon size={12} />
                    <span>Private</span>
                  </div>
                  {visibilityType === 'private' ? <CircleCheck /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType('public');
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <GlobeIcon />
                    <span>Public</span>
                  </div>
                  {visibilityType === 'public' ? <CircleCheck /> : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
            onSelect={() => onDelete(chat.id)}
          >
            <TrashIcon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move to Project Dialog */}
      <MoveChatToProject
        chat={chat}
        open={showMoveDialog}
        onOpenChange={setShowMoveDialog}
        onSuccess={() => setShowMoveDialog(false)}
      />
    </SidebarMenuItem>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) return false;
  return true;
});
