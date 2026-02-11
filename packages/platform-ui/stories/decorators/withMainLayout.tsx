import type { Decorator } from '@storybook/react';
import { MainLayout } from '../../src/components/layouts/MainLayout';
import type { MenuItem } from '../../src/components/Sidebar';
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
  Brain,
} from 'lucide-react';

const defaultMenuItems: MenuItem[] = [
  {
    id: 'agents',
    label: 'Agents',
    icon: <Network className="w-5 h-5" />,
    items: [
      { id: 'graph', label: 'Team', icon: <GitBranch className="w-4 h-4" /> },
      { id: 'threads', label: 'Threads', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'reminders', label: 'Reminders', icon: <Bell className="w-4 h-4" /> },
      { id: 'memory', label: 'Memory', icon: <Brain className="w-4 h-4" /> },
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

export const withMainLayout: Decorator = (Story, context) => {
  const selectedMenuItem = (context.parameters.selectedMenuItem as string | undefined) || 'graph';
  const onMenuItemSelect = context.args.onMenuItemSelect as ((itemId: string) => void) | undefined;

  return (
    <MainLayout 
      menuItems={defaultMenuItems}
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={onMenuItemSelect}
    >
      <Story />
    </MainLayout>
  );
};
