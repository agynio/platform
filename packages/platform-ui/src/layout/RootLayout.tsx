import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Network,
  GitBranch,
  MessageSquare,
  Bell,
  Activity,
  Container,
  HardDrive,
  Settings,
  Key,
  Variable,
} from 'lucide-react';
import { MainLayout } from '../components/layouts/MainLayout';
import type { MenuItem } from '../components/Sidebar';

const MENU_ITEM_ROUTES: Record<string, string> = {
  graph: '/agents/graph',
  threads: '/agents/threads',
  reminders: '/agents/reminders',
  containers: '/monitoring/containers',
  resources: '/monitoring/resources',
  secrets: '/settings/secrets',
  variables: '/settings/variables',
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'agents',
    label: 'Agents',
    icon: <Network className="w-5 h-5" />,
    items: [
      { id: 'graph', label: 'Graph', icon: <GitBranch className="w-4 h-4" /> },
      { id: 'threads', label: 'Threads', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'reminders', label: 'Reminders', icon: <Bell className="w-4 h-4" /> },
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
      { id: 'secrets', label: 'Secrets', icon: <Key className="w-4 h-4" /> },
      { id: 'variables', label: 'Variables', icon: <Variable className="w-4 h-4" /> },
    ],
  },
];

const DEFAULT_MENU_ITEM = 'graph';
const MENU_ITEM_ENTRIES = Object.entries(MENU_ITEM_ROUTES);

function getMenuItemFromPath(pathname: string) {
  const match = MENU_ITEM_ENTRIES.find(([, route]) => pathname.startsWith(route));
  return match?.[0] ?? DEFAULT_MENU_ITEM;
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
