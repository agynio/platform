import type { Meta, StoryObj } from '@storybook/react';
import Sidebar, { type MenuItem } from '../src/components/Sidebar';
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
  Variable
} from 'lucide-react';

const defaultMenuItems: MenuItem[] = [
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

const meta: Meta<typeof Sidebar> = {
  title: 'Layouts/MainLayout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Playground: Story = {
  args: {
    menuItems: defaultMenuItems,
    currentUser: {
      name: 'John Developer',
      email: 'john@agyn.io',
    },
    selectedMenuItem: 'graph',
  },
};
