import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  Button,
  Logo,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@hautech/ui';
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
  ChevronDown
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
  const [tracingOpen, setTracingOpen] = useStoredBoolean(STORAGE_KEYS.tracingOpen, false);
  const [monitoringOpen, setMonitoringOpen] = useStoredBoolean(STORAGE_KEYS.monitoringOpen, false);
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
          { label: 'Chat', to: '/agents/chat', icon: MessageSquare }
        ]
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
        ]
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
        ]
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        isOpen: settingsOpen,
        setOpen: setSettingsOpen,
        items: [
          { label: 'Secrets', to: '/settings/secrets', icon: KeyRound }
        ]
      }
    ], [agentsOpen, tracingOpen, monitoringOpen, settingsOpen, setAgentsOpen, setTracingOpen, setMonitoringOpen, setSettingsOpen]
  );

  const { user } = useUser();

  // Local sidebar sub menu components (UI-only wrappers)
  function SidebarMenuSub(props: React.HTMLAttributes<HTMLUListElement>) {
    const { className = '', ...rest } = props;
    return <ul className={`ml-6 mt-1 space-y-1 border-l pl-2 ${className}`} {...rest} />;
  }
  function SidebarMenuSubItem(props: React.LiHTMLAttributes<HTMLLIElement>) {
    const { className = '', ...rest } = props;
    return <li className={`list-none ${className}`} {...rest} />;
  }

  function SidebarInner({ linkWrapper }: { linkWrapper?: (children: React.ReactNode) => React.ReactNode }) {
    return (
      <div className="flex h-full flex-col">
        {/* Keep py-4; adjust logo size based on collapsed state to avoid clipping when w-16 */}
        <SidebarHeader className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            {/* Shrink logo to 28px when collapsed; keep 96px when expanded */}
            <Logo
              size={collapsed ? 28 : 96}
              variant="dark"
              aria-label="Hautech Agents"
            />
          </div>
          {/* Removed header expand/collapse icon per spec */}
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {sections.map((section) => (
              <Collapsible key={section.id} open={section.isOpen || collapsed} onOpenChange={section.setOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <button className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
                      <section.icon className="h-4 w-4" />
                      {!collapsed && <span className="flex-1 text-left">{section.label}</span>}
                      {!collapsed && (
                        <ChevronDown className={`h-4 w-4 transition-transform ${section.isOpen ? 'rotate-0' : '-rotate-90'}`} />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {section.items.map((item) => (
                        <SidebarMenuSubItem key={item.to}>
                          {(linkWrapper ?? ((c) => c))(
                            <NavLink to={item.to} className="block">
                              {({ isActive }) => (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <SidebarMenuButton isActive={isActive}>
                                      <item.icon className="h-4 w-4" />
                                      {!collapsed && <span>{item.label}</span>}
                                    </SidebarMenuButton>
                                  </TooltipTrigger>
                                  {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
                                </Tooltip>
                              )}
                            </NavLink>
                          )}
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
          </SidebarMenu>
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
      <aside className={`relative hidden md:flex`}>
        <Sidebar className={`${collapsed ? 'w-16' : 'w-64'}`}>
          <SidebarInner />
        </Sidebar>
        {/* Right-border clickable collapse/expand button (desktop only) */}
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
          className="absolute right-0 top-0 hidden h-full w-2 cursor-pointer md:block"
          title={collapsed ? 'Expand' : 'Collapse'}
        />
      </aside>

      {/* Mobile top bar + Drawer */}
      <div className="flex min-h-screen flex-1 min-w-0 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-4 md:hidden">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="p-0">
              <div className="h-[85vh]">
                <Sidebar className="w-full">
                  <SidebarInner linkWrapper={(node) => <DrawerClose asChild>{node}</DrawerClose>} />
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
          <Logo size={96} variant="dark" aria-label="Hautech Agents" />
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
