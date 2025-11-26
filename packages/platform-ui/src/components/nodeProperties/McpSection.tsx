import { Input } from '../Input';
import { BashInput } from '../BashInput';

import type { EnvEditorProps } from './EnvEditor';
import { EnvEditor } from './EnvEditor';
import { LimitsSection, type LimitField } from './LimitsSection';
import { ToolsList } from './ToolsList';
import { FieldLabel } from './FieldLabel';
import type { McpToolDescriptor } from './types';
import { toNumberOrUndefined } from './utils';

interface McpLimits {
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  staleTimeoutMs?: number;
  restartMaxAttempts?: number;
  restartBackoffMs?: number;
}

interface McpSectionProps {
  namespace: string;
  command: string;
  workdir: string;
  onNamespaceChange: (value: string) => void;
  onCommandChange: (value: string) => void;
  onWorkdirChange: (value: string) => void;
  envEditorProps: EnvEditorProps;
  limitsOpen: boolean;
  onLimitsOpenChange: (open: boolean) => void;
  limits: McpLimits;
  onLimitChange: (key: keyof McpLimits, value: number | undefined) => void;
  tools: {
    items: McpToolDescriptor[];
    enabled: Set<string>;
    loading: boolean;
    onToggle: (toolName: string, enabled: boolean) => void;
  };
}

export function McpSection({
  namespace,
  command,
  workdir,
  onNamespaceChange,
  onCommandChange,
  onWorkdirChange,
  envEditorProps,
  limitsOpen,
  onLimitsOpenChange,
  limits,
  onLimitChange,
  tools,
}: McpSectionProps) {
  const limitFields: LimitField[] = [
    {
      key: 'requestTimeoutMs',
      label: 'Request Timeout (ms)',
      hint: 'Timeout for MCP requests in milliseconds',
      placeholder: '60000',
      value: limits.requestTimeoutMs !== undefined ? String(limits.requestTimeoutMs) : '',
      onChange: (value) => onLimitChange('requestTimeoutMs', toNumberOrUndefined(value)),
    },
    {
      key: 'startupTimeoutMs',
      label: 'Startup Timeout (ms)',
      hint: 'Timeout for MCP server startup in milliseconds',
      placeholder: '30000',
      value: limits.startupTimeoutMs !== undefined ? String(limits.startupTimeoutMs) : '',
      onChange: (value) => onLimitChange('startupTimeoutMs', toNumberOrUndefined(value)),
    },
    {
      key: 'heartbeatIntervalMs',
      label: 'Heartbeat Interval (ms)',
      hint: 'Interval for MCP server heartbeats in milliseconds',
      placeholder: '10000',
      value: limits.heartbeatIntervalMs !== undefined ? String(limits.heartbeatIntervalMs) : '',
      onChange: (value) => onLimitChange('heartbeatIntervalMs', toNumberOrUndefined(value)),
    },
    {
      key: 'staleTimeoutMs',
      label: 'Stale Timeout (ms)',
      hint: 'Timeout for stale MCP server connections in milliseconds',
      placeholder: '30000',
      value: limits.staleTimeoutMs !== undefined ? String(limits.staleTimeoutMs) : '',
      onChange: (value) => onLimitChange('staleTimeoutMs', toNumberOrUndefined(value)),
    },
    {
      key: 'restartMaxAttempts',
      label: 'Restart Max Attempts',
      hint: 'Maximum number of restart attempts for MCP server',
      placeholder: '5',
      value: limits.restartMaxAttempts !== undefined ? String(limits.restartMaxAttempts) : '',
      onChange: (value) => onLimitChange('restartMaxAttempts', toNumberOrUndefined(value)),
    },
    {
      key: 'restartBackoffMs',
      label: 'Restart Backoff (ms)',
      hint: 'Backoff time between MCP server restart attempts in milliseconds',
      placeholder: '2000',
      value: limits.restartBackoffMs !== undefined ? String(limits.restartBackoffMs) : '',
      onChange: (value) => onLimitChange('restartBackoffMs', toNumberOrUndefined(value)),
    },
  ];

  return (
    <>
      <section>
        <div className="space-y-4">
          <div>
            <FieldLabel label="Namespace" hint="Namespace for the MCP server" required />
            <Input
              placeholder="my-mcp-server"
              value={namespace}
              onChange={(event) => onNamespaceChange(event.target.value)}
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Command" hint="Command to start the MCP server" required />
            <BashInput
              rows={3}
              placeholder="npx -y @modelcontextprotocol/server-everything"
              value={command}
              onChange={(event) => onCommandChange(event.target.value)}
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Working Directory" hint="Working directory for the MCP server" />
            <Input
              placeholder="/path/to/workdir"
              value={workdir}
              onChange={(event) => onWorkdirChange(event.target.value)}
              size="sm"
            />
          </div>
        </div>
      </section>

      <EnvEditor {...envEditorProps} />

      <LimitsSection title="Limits" open={limitsOpen} onOpenChange={onLimitsOpenChange} fields={limitFields} />

      <ToolsList
        tools={tools.items}
        enabledToolSet={tools.enabled}
        loading={tools.loading}
        onToggle={tools.onToggle}
      />
    </>
  );
}
