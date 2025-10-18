import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  Button,
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerClose,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Separator
} from '@hautech/ui';
import {
  Bot,
  Activity,
  Boxes,
  Settings as SettingsIcon,
  GitBranch,
  MessageSquare,
  AlertTriangle,
  Gauge,
  KeyRound,
  Menu,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useUser } from '../user/user.runtime';

const STORAGE_KEYS = {
  collapsed: 'ui.sidebar.collapsed',
  agentsOpen: 'ui.sidebar.section.agents.open',
  tracingOpen: 'ui.sidebar.section.tracing.open',
  monitoringOpen: 'ui.sidebar.section.monitoring.open',
  settingsOpen: 'ui.sidebar.section.settings.open'
};

function useStoredBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {
      /* ignore localStorage read errors */
    }
    return defaultValue;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? 'true' : 'false');
    } catch {
      /* ignore localStorage write errors */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; };

export function RootLayout() {
  const [collapsed, setCollapsed] = useStoredBoolean(STORAGE_KEYS.collapsed, false);
  const [agentsOpen, setAgentsOpen] = useStoredBoolean(STORAGE_KEYS.agentsOpen, true);
  const [tracingOpen, setTracingOpen] = useStoredBoolean(STORAGE_KEYS.tracingOpen, false);
  const [monitoringOpen, setMonitoringOpen] = useStoredBoolean(STORAGE_KEYS.monitoringOpen, false);
  const [settingsOpen, setSettingsOpen] = useStoredBoolean(STORAGE_KEYS.settingsOpen, false);

  const sections = useMemo(
    () => [
      {
        id: 'agents',
        label: 'Agents',
        icon: Bot,
        isOpen: agentsOpen,
        setOpen: setAgentsOpen,
        items: [
          { label: 'Graph', to: '/agents/graph', icon: GitBranch },
          { label: 'Chat', to: '/agents/chat', icon: MessageSquare }
        ] as NavItem[]
      },
      {
        id: 'tracing',
        label: 'Tracing',
        icon: Activity,
        isOpen: tracingOpen,
        setOpen: setTracingOpen,
        items: [
          { label: 'Traces', to: '/tracing/traces', icon: Activity },
          { label: 'Errors', to: '/tracing/errors', icon: AlertTriangle }
        ] as NavItem[]
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: Boxes,
        isOpen: monitoringOpen,
        setOpen: setMonitoringOpen,
        items: [
          { label: 'Containers', to: '/monitoring/containers', icon: Boxes },
          { label: 'Resources', to: '/monitoring/resources', icon: Gauge }
        ] as NavItem[]
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        isOpen: settingsOpen,
        setOpen: setSettingsOpen,
        items: [
          { label: 'Secrets', to: '/settings/secrets', icon: KeyRound }
        ] as NavItem[]
      }
    ], [agentsOpen, tracingOpen, monitoringOpen, settingsOpen, setAgentsOpen, setTracingOpen, setMonitoringOpen, setSettingsOpen]
  );

  const { user } = useUser();

  function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <div className="flex h-full flex-col">
        <SidebarHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Logo or text */}
            <span className="font-semibold">Hautech Agents</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden md:inline-flex">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </SidebarHeader>
        <SidebarContent>
          {sections.map((section) => (
            <SidebarGroup key={section.id}>
              <SidebarGroupLabel>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <section.icon className="h-4 w-4" />
                    {!collapsed && <span>{section.label}</span>}
                  </div>
                  {!collapsed && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 py-0 text-xs" onClick={() => section.setOpen(!section.isOpen)} aria-expanded={section.isOpen} aria-controls={`section-${section.id}`}>
                      {section.isOpen ? 'Hide' : 'Show'}
                    </Button>
                  )}
                </div>
              </SidebarGroupLabel>
              {(!collapsed && section.isOpen) || collapsed ? (
                <SidebarGroupContent id={`section-${section.id}`}>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <NavLink to={item.to} onClick={onNavigate} className="block">
                          {({ isActive }) => (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <SidebarMenuButton isActive={isActive} className="">
                                  <item.icon className="h-4 w-4" />
                                  {!collapsed && <span>{item.label}</span>}
                                </SidebarMenuButton>
                              </TooltipTrigger>
                              {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
                            </Tooltip>
                          )}
                        </NavLink>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              ) : null}
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user?.name || 'User'} /> : null}
              <AvatarFallback>{(user?.name || 'G').slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user?.name || 'Guest'}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email || 'guest@example.com'}</div>
              </div>
            )}
          </div>
        </SidebarFooter>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex ${collapsed ? 'w-16' : 'w-64'}`}>
        <Sidebar className={`${collapsed ? 'w-16' : 'w-64'}`}>
          <SidebarInner />
        </Sidebar>
      </aside>

      {/* Mobile top bar + Drawer */}
      <div className="flex min-h-screen flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="p-0">
              <div className="h-[85vh]">
                <Sidebar className="w-full">
                  <SidebarInner onNavigate={() => {/* Close drawer on nav */}} />
                </Sidebar>
                <div className="p-2">
                  <DrawerClose asChild>
                    <Button variant="secondary" className="w-full">Close</Button>
                  </DrawerClose>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
          <Separator orientation="vertical" className="h-6" />
          <div className="font-semibold">Hautech Agents</div>
        </div>

        {/* Main content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
