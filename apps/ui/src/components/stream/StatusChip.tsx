import { Badge } from '@hautech/ui';

interface StatusChipProps {
  status: string;
  connected: boolean;
}

export function StatusChip({ status, connected }: StatusChipProps) {
  // Map local stream status to Badge variant; keep mapping here per scope
  if (status === 'error') return <Badge variant="destructive">error</Badge>;
  if (status === 'connecting') return <Badge variant="accent">connecting</Badge>;
  if (status === 'ready') return <Badge variant={connected ? 'secondary' : 'neutral'}>{connected ? 'live' : 'disconnected'}</Badge>;
  return <Badge variant="neutral">idle</Badge>;
}
