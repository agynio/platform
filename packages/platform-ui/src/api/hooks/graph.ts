// Re-export existing graph hooks to new API hooks namespace
export {
  useTemplates,
  useNodeStatus,
  useNodeReminders,
  useReminderCount,
  useNodeAction,
  useDynamicConfig,
  useMcpTools,
} from '@/lib/graph/hooks';
