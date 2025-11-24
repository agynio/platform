import GraphScreen, { type GraphNodeConfig } from '../screens/GraphScreen';
import type { SavingStatus } from '../SavingStatusControl';

interface GraphLayoutProps {
  nodes: GraphNodeConfig[];
  savingStatus: SavingStatus;
  savingErrorMessage?: string | null;
  onBack?: () => void;
  onNodeUpdate?: (nodeId: string, updates: Partial<GraphNodeConfig>) => void;
}

export function GraphLayout({
  nodes,
  savingStatus,
  savingErrorMessage,
  onBack,
  onNodeUpdate,
}: GraphLayoutProps) {
  return (
    <GraphScreen
      nodes={nodes}
      savingStatus={savingStatus}
      savingErrorMessage={savingErrorMessage ?? undefined}
      onBack={onBack}
      onNodeUpdate={onNodeUpdate}
    />
  );
}
