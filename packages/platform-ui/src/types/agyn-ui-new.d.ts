/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@agyn/ui-new' {
  import type { ComponentType } from 'react';

  type AnyProps = Record<string, unknown>;

  export type GraphNode = {
    id: string;
    kind: string;
    status: string;
    title?: string;
    x?: number;
    y?: number;
    data?: unknown;
    [key: string]: unknown;
  };

  export interface GraphScreenProps extends AnyProps {
    nodes?: GraphNode[];
    selectedNodeId?: string | null;
    onSelectNode?: (nodeId: string | null) => void;
    onBack?: () => void;
    renderSidebar?: boolean;
  }

  export const GraphScreen: ComponentType<GraphScreenProps>;

  export type Thread = {
    id: string;
    alias?: string | null;
    summary?: string | null;
    status?: string;
    createdAt?: string;
    [key: string]: unknown;
  };

  export type ThreadRunMessage = {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content?: string | null;
    text?: string | null;
    timestamp?: string;
    createdAt?: string;
    [key: string]: unknown;
  };

  export type ThreadRun = {
    id: string;
    status: string;
    duration?: string;
    messages: ThreadRunMessage[];
    [key: string]: unknown;
  };

  export type ThreadsScreenContainer = {
    id: string;
    name: string;
    status: string;
    threadId?: string;
    parentId?: string;
    [key: string]: unknown;
  };

  export type ThreadsScreenReminder = {
    id: string;
    title: string;
    time: string;
    [key: string]: unknown;
  };

  export interface ThreadsScreenProps extends AnyProps {
    threads?: Thread[];
    runs?: ThreadRun[];
    containers?: ThreadsScreenContainer[];
    reminders?: ThreadsScreenReminder[];
    selectedThreadId?: string;
    onSelectThread?: (threadId: string) => void;
    onSendMessage?: (message: string) => void;
    onBack?: () => void;
    renderSidebar?: boolean;
    isRunsInfoCollapsed?: boolean;
  }

  export const ThreadsScreen: ComponentType<ThreadsScreenProps>;

  export type Reminder = {
    id: string;
    note: string;
    scheduledAt: string;
    executedAt?: string;
    status: string;
    threadId: string;
    [key: string]: unknown;
  };

  export interface RemindersScreenProps extends AnyProps {
    reminders: Reminder[];
    onViewThread?: (threadId: string) => void;
  }

  export const RemindersScreen: ComponentType<RemindersScreenProps>;

  export type Container = {
    id: string;
    name: string;
    containerId: string;
    image?: string;
    role: string;
    status: string;
    startedAt?: string;
    lastUsedAt?: string;
    ttl?: string;
    volumes?: string[];
    parentId?: string;
    threadId?: string;
    [key: string]: unknown;
  };

  export interface ContainersScreenProps extends AnyProps {
    containers: Container[];
    onOpenTerminal?: (containerId: string) => void;
    onViewThread?: (threadId: string) => void;
  }

  export const ContainersScreen: ComponentType<ContainersScreenProps>;

  export type Secret = {
    id: string;
    key: string;
    value?: string;
    status?: string;
    updatedAt?: string;
    [key: string]: unknown;
  };

  export interface SecretsScreenProps extends AnyProps {
    secrets: Secret[];
    onCreateSecret?: (secret: Omit<Secret, 'id'>) => void;
    onUpdateSecret?: (id: string, secret: Omit<Secret, 'id'>) => void;
    onDeleteSecret?: (id: string) => void;
  }

  export const SecretsScreen: ComponentType<SecretsScreenProps>;

  export type Variable = {
    id: string;
    key: string;
    value?: string;
    status?: string;
    graphValue?: string | null;
    localValue?: string | null;
    updatedAt?: string;
    [key: string]: unknown;
  };

  export interface VariablesScreenProps extends AnyProps {
    variables: Variable[];
    onCreateVariable?: (variable: Omit<Variable, 'id'>) => void;
    onUpdateVariable?: (id: string, variable: Omit<Variable, 'id'>) => void;
    onDeleteVariable?: (id: string) => void;
  }

  export const VariablesScreen: ComponentType<VariablesScreenProps>;

  export type RunEvent = {
    id: string;
    ts: string;
    type: string;
    status: string;
    [key: string]: unknown;
  };

  export interface RunScreenProps extends AnyProps {
    runId?: string;
    events?: RunEvent[];
    isLoading?: boolean;
    onRefresh?: () => void;
  }

  export const RunScreen: ComponentType<RunScreenProps>;

  export const Button: ComponentType<any>;
  export const Badge: ComponentType<any>;
  export const Input: ComponentType<any>;
  export const Label: ComponentType<any>;
  export const Textarea: ComponentType<any>;
  export const TooltipProvider: ComponentType<any>;
  export const Tooltip: ComponentType<any>;
  export const TooltipTrigger: ComponentType<any>;
  export const TooltipContent: ComponentType<any>;
  export const Dialog: ComponentType<any>;
  export const DialogContent: ComponentType<any>;
  export const DialogDescription: ComponentType<any>;
  export const DialogFooter: ComponentType<any>;
  export const DialogHeader: ComponentType<any>;
  export const DialogTitle: ComponentType<any>;
  export const Alert: ComponentType<any>;
  export const AlertTitle: ComponentType<any>;
  export const AlertDescription: ComponentType<any>;
  export const AlertDialog: ComponentType<any>;
  export const AlertDialogHeader: ComponentType<any>;
  export const AlertDialogContent: ComponentType<any>;
  export const AlertDialogFooter: ComponentType<any>;
  export const AlertDialogTitle: ComponentType<any>;
  export const AlertDialogDescription: ComponentType<any>;
  export const AlertDialogAction: ComponentType<any>;
  export const AlertDialogCancel: ComponentType<any>;
  export const Select: ComponentType<any>;
  export const SelectTrigger: ComponentType<any>;
  export const SelectContent: ComponentType<any>;
  export const SelectItem: ComponentType<any>;
  export const SelectValue: ComponentType<any>;
  export const DropdownMenu: ComponentType<any>;
  export const DropdownMenuTrigger: ComponentType<any>;
  export const DropdownMenuContent: ComponentType<any>;
  export const DropdownMenuRadioGroup: ComponentType<any>;
  export const DropdownMenuRadioItem: ComponentType<any>;
  export const Drawer: ComponentType<any>;
  export const DrawerTrigger: ComponentType<any>;
  export const DrawerContent: ComponentType<any>;
  export const DrawerClose: ComponentType<any>;
  export const DrawerHeader: ComponentType<any>;
  export const DrawerTitle: ComponentType<any>;
  export const DrawerDescription: ComponentType<any>;
  export const Checkbox: ComponentType<any>;
  export const Popover: ComponentType<any>;
  export const PopoverTrigger: ComponentType<any>;
  export const PopoverContent: ComponentType<any>;
  export const Avatar: ComponentType<any>;
  export const AvatarImage: ComponentType<any>;
  export const AvatarFallback: ComponentType<any>;
  export const Separator: ComponentType<any>;
  export const Collapsible: ComponentType<any>;
  export const CollapsibleTrigger: ComponentType<any>;
  export const CollapsibleContent: ComponentType<any>;
  export const StatusIndicator: ComponentType<any>;

  export function cn(...inputs: any[]): string;
}
