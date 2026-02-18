import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Network,
  GitBranch,
  MessageSquare,
  Bell,
  Brain,
  Activity,
  Container,
  HardDrive,
  Settings,
  Key,
  Variable,
  Bot,
  Users,
  Layers,
  Zap,
  Hammer,
  Server,
  Building2,
} from 'lucide-react';
import { MainLayout } from '../components/layouts/MainLayout';
import type { MenuItem } from '../components/Sidebar';

const MENU_ITEM_ROUTES: Record<string, string> = {
  agentsTeam: '/agents/graph',
  agentsThreads: '/agents/threads',
  agentsReminders: '/agents/reminders',
  agentsMemory: '/agents/memory',
  entitiesTriggers: '/triggers',
  entitiesAgents: '/agents',
  entitiesTools: '/tools',
  entitiesMcp: '/mcp',
  entitiesWorkspaces: '/workspaces',
  entitiesMemory: '/memory',
  containers: '/monitoring/containers',
  resources: '/monitoring/resources',
  llm: '/settings/llm',
  secrets: '/settings/secrets',
  variables: '/settings/variables',
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'agents',
    label: 'Agents',
    icon: <Network className="w-5 h-5" />,
    items: [
      { id: 'agentsTeam', label: 'Team', icon: <GitBranch className="w-4 h-4" /> },
      { id: 'agentsThreads', label: 'Threads', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'agentsReminders', label: 'Reminders', icon: <Bell className="w-4 h-4" /> },
      { id: 'agentsMemory', label: 'Memory', icon: <Brain className="w-4 h-4" /> },
    ],
  },
  {
    id: 'entities',
    label: 'Entities',
    icon: <Layers className="w-5 h-5" />,
    items: [
      { id: 'entitiesTriggers', label: 'Triggers', icon: <Zap className="w-4 h-4" /> },
      { id: 'entitiesAgents', label: 'Agents', icon: <Users className="w-4 h-4" /> },
      { id: 'entitiesTools', label: 'Tools', icon: <Hammer className="w-4 h-4" /> },
      { id: 'entitiesMcp', label: 'MCP Servers', icon: <Server className="w-4 h-4" /> },
      { id: 'entitiesWorkspaces', label: 'Workspaces', icon: <Building2 className="w-4 h-4" /> },
      { id: 'entitiesMemory', label: 'Memory', icon: <Brain className="w-4 h-4" /> },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: <Activity className="w-5 h-5" />,
    items: [
      { id: 'containers', label: 'Containers', icon: <Container className="w-4 h-4" /> },
      { id: 'resources', label: 'Resources', icon: <HardDrive className="w-4 h-4" /> },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    items: [
      { id: 'llm', label: 'LLM', icon: <Bot className="w-4 h-4" /> },
      { id: 'secrets', label: 'Secrets', icon: <Key className="w-4 h-4" /> },
      { id: 'variables', label: 'Variables', icon: <Variable className="w-4 h-4" /> },
    ],
  },
];

const DEFAULT_MENU_ITEM = 'entitiesAgents';
const MENU_ITEM_ENTRIES = Object.entries(MENU_ITEM_ROUTES);

function matchesRoute(pathname: string, route: string) {
  if (route === '/') {
    return pathname === '/';
  }
  return pathname === route || pathname.startsWith(`${route}/`);
}

function getMenuItemFromPath(pathname: string) {
  let matched = DEFAULT_MENU_ITEM;
  let bestLength = 0;
  for (const [itemId, route] of MENU_ITEM_ENTRIES) {
    if (matchesRoute(pathname, route) && route.length > bestLength) {
      matched = itemId;
      bestLength = route.length;
    }
  }
  return matched;
}

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedMenuItem = getMenuItemFromPath(location.pathname);

  const handleMenuItemSelect = useCallback(
    (itemId: string) => {
      const targetPath = MENU_ITEM_ROUTES[itemId];
      if (!targetPath) return;

      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate],
  );

  return (
    <MainLayout
      menuItems={MENU_ITEMS} //
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={handleMenuItemSelect}
    >
      <Outlet />
    </MainLayout>
  );
}
