import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@agyn/ui-new';
import {
  Bell,
  Bot,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  GitBranch,
  KeyRound,
  Menu,
  MessageSquare,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useUser } from '../user/user.runtime';

const STORAGE_KEYS = {
  collapsed: 'ui.sidebar.collapsed',
  agentsOpen: 'ui.sidebar.section.agents.open',
  monitoringOpen: 'ui.sidebar.section.monitoring.open',
  memoryOpen: 'ui.sidebar.section.memory.open',
  settingsOpen: 'ui.sidebar.section.settings.open',
};

function useStoredBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {
      /* ignore storage errors */
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, value ? 'true' : 'false');
    } catch {
      /* ignore storage errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; };
type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  items: NavItem[];
};

export function RootLayout() {
  const [collapsed, setCollapsed] = useStoredBoolean(STORAGE_KEYS.collapsed, false);
  const [agentsOpen, setAgentsOpen] = useStoredBoolean(STORAGE_KEYS.agentsOpen, true);
  const [monitoringOpen, setMonitoringOpen] = useStoredBoolean(STORAGE_KEYS.monitoringOpen, false);
  const [memoryOpen, setMemoryOpen] = useStoredBoolean(STORAGE_KEYS.memoryOpen, true);
  const [settingsOpen, setSettingsOpen] = useStoredBoolean(STORAGE_KEYS.settingsOpen, false);

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'agents',
        label: 'Agents',
        icon: Bot,
        isOpen: agentsOpen,
        setOpen: setAgentsOpen,
        items: [
          { label: 'Graph', to: '/agents/graph', icon: GitBranch },
          { label: 'Threads', to: '/agents/threads', icon: MessageSquare },
          { label: 'Reminders', to: '/agents/reminders', icon: Bell },
        ],
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: Boxes,
        isOpen: monitoringOpen,
        setOpen: setMonitoringOpen,
        items: [{ label: 'Containers', to: '/monitoring/containers', icon: Boxes }],
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: Database,
        isOpen: memoryOpen,
        setOpen: setMemoryOpen,
        items: [{ label: 'Explorer', to: '/memory', icon: Database }],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        isOpen: settingsOpen,
        setOpen: setSettingsOpen,
        items: [
          { label: 'Secrets', to: '/settings/secrets', icon: KeyRound },
          { label: 'Variables', to: '/settings/variables', icon: KeyRound },
        ],
      },
    ],
    [agentsOpen, monitoringOpen, memoryOpen, settingsOpen, setAgentsOpen, setMonitoringOpen, setMemoryOpen, setSettingsOpen],
  );

  const { user } = useUser();

  const renderNavItems = (
    navSections: Section[],
    navCollapsed: boolean,
    linkWrapper?: (children: React.ReactNode) => React.ReactNode,
  ) => (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
      {navSections.map((section) => (
        <Collapsible key={section.id} open={navCollapsed ? true : section.isOpen} onOpenChange={section.setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                navCollapsed ? 'justify-center' : 'justify-start',
              )}
            >
              <section.icon className="h-4 w-4" />
              {!navCollapsed && <span className="flex-1 text-left">{section.label}</span>}
              {!navCollapsed && (
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', section.isOpen ? 'rotate-0' : '-rotate-90')}
                />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            {section.items.map((item) => {
              const link = (
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      navCollapsed ? 'justify-center' : 'justify-start',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {!navCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );

              if (navCollapsed) {
                return (
                  <Tooltip key={item.to} delayDuration={0}>
                    <TooltipTrigger asChild>{linkWrapper ? linkWrapper(link) : link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return <Fragment key={item.to}>{linkWrapper ? linkWrapper(link) : link}</Fragment>;
            })}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );

  const renderSidebar = (options?: { collapsedOverride?: boolean; linkWrapper?: (node: React.ReactNode) => React.ReactNode }) => {
    const navCollapsed = options?.collapsedOverride ?? collapsed;
    const brandLabel = navCollapsed ? 'HA' : 'Hautech Agents';

    return (
      <div className={cn('flex h-full flex-col border-r', navCollapsed ? 'w-16' : 'w-64')}>
        <div className={cn('flex items-center gap-2 border-b px-3 py-4', navCollapsed ? 'justify-center' : 'justify-between')}>
          <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">{brandLabel}</span>
          {options?.collapsedOverride === undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {navCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {renderNavItems(sections, navCollapsed, options?.linkWrapper)}

        <div className="mt-auto border-t px-3 py-4">
          <div className={cn('flex items-center gap-2', navCollapsed ? 'justify-center' : 'justify-start')}>
            <Avatar className="h-8 w-8">
              {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user?.name || 'User'} /> : null}
              <AvatarFallback>{(user?.name || 'G').slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            {!navCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user?.name || 'Guest'}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email || 'guest@example.com'}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen shrink-0 md:flex">{renderSidebar()}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-4 md:hidden">
          <Drawer direction="left">
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="w-64 max-w-[85vw] p-0">
              {renderSidebar({ collapsedOverride: false, linkWrapper: (node) => <DrawerClose asChild>{node}</DrawerClose> })}
            </DrawerContent>
          </Drawer>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-base font-semibold tracking-wide">Hautech Agents</span>
        </div>

        <main className="relative flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
