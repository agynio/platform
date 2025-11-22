import { RunScreen } from '@agyn/ui-new';

export function AgentsRunNew() {
  return (
    <RunScreen
      runId="run-1"
      status="running"
      createdAt={new Date().toISOString()}
      duration="--"
      statistics={{ totalEvents: 0, messages: 0, llm: 0, tools: 0, summaries: 0 }}
      tokens={{ input: 0, cached: 0, output: 0, reasoning: 0, total: 0 }}
      events={[]}
      renderSidebar={false}
    />
  );
}
