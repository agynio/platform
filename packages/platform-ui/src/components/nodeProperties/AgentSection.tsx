import { useCallback, useMemo } from 'react';

import { Input } from '../Input';
import { MarkdownInput } from '../MarkdownInput';
import { Dropdown } from '../Dropdown';
import { Toggle } from '../Toggle';
import { Textarea } from '../Textarea';

import { FieldLabel } from './FieldLabel';
import { QUEUE_PROCESS_BUFFER_OPTIONS, QUEUE_WHEN_BUSY_OPTIONS } from './constants';
import type { AgentQueueConfig, AgentSummarizationConfig } from './types';
import { toNumberOrUndefined } from './utils';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { useTemplatesCache } from '@/lib/graph/templates.provider';
import { renderMustacheTemplate } from '@/lib/mustache';
import { createPromptResolver, type PreviewAgentToolContext } from './promptPreview';

interface AgentSectionProps {
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  restrictOutput: boolean;
  restrictionMessage: string;
  restrictionMaxInjections?: number;
  queueConfig: AgentQueueConfig;
  summarization: AgentSummarizationConfig;
  nodeId?: string;
  graphNodes?: GraphNodeConfig[];
  graphEdges?: GraphPersistedEdge[];
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  onRoleChange: (value: string) => void;
  onRoleBlur: () => void;
  onModelChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onRestrictOutputChange: (checked: boolean) => void;
  onRestrictionMessageChange: (value: string) => void;
  onRestrictionMaxInjectionsChange: (value: number | undefined) => void;
  onQueueConfigChange: (partial: Partial<AgentQueueConfig>) => void;
  onSummarizationChange: (partial: Partial<AgentSummarizationConfig>) => void;
}

export function AgentSection({
  model,
  systemPrompt,
  restrictOutput,
  restrictionMessage,
  restrictionMaxInjections,
  queueConfig,
  summarization,
  nodeId,
  graphNodes,
  graphEdges,
  name,
  role,
  onNameChange,
  onNameBlur,
  onRoleChange,
  onRoleBlur,
  onModelChange,
  onSystemPromptChange,
  onRestrictOutputChange,
  onRestrictionMessageChange,
  onRestrictionMaxInjectionsChange,
  onQueueConfigChange,
  onSummarizationChange,
}: AgentSectionProps) {
  const queueDebounceValue = queueConfig.debounceMs !== undefined ? String(queueConfig.debounceMs) : '';
  const queueWhenBusyValue = queueConfig.whenBusy ?? 'wait';
  const queueProcessBufferValue = queueConfig.processBuffer ?? 'allTogether';
  const summarizationKeepValue = summarization.keepTokens !== undefined ? String(summarization.keepTokens) : '';
  const summarizationMaxValue = summarization.maxTokens !== undefined ? String(summarization.maxTokens) : '';
  const summarizationPromptValue = summarization.prompt ?? '';
  const { getTemplate } = useTemplatesCache();
  const toolsContext = useMemo<PreviewAgentToolContext[]>(() => {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      return [];
    }

    const resolver = createPromptResolver({
      graphNodes,
      graphEdges,
      getTemplate,
      overrideAgent: { id: nodeId, systemPrompt },
    });

    return resolver.buildAgentToolContext(nodeId);
  }, [graphEdges, graphNodes, getTemplate, nodeId, systemPrompt]);

  const renderSystemPromptPreview = useCallback(
    (template: string) => {
      if (!template || template.trim().length === 0) {
        return '';
      }
      return renderMustacheTemplate(template, { tools: toolsContext });
    },
    [toolsContext],
  );

  return (
    <>
      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Profile</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Name" hint="Optional display name" />
            <Input
              placeholder="e.g., Casey Quinn"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              onBlur={onNameBlur}
              size="sm"
              maxLength={64}
            />
          </div>
          <div>
            <FieldLabel label="Role" hint="Optional role or specialty" />
            <Input
              placeholder="e.g., Incident Commander"
              value={role}
              onChange={(event) => onRoleChange(event.target.value)}
              onBlur={onRoleBlur}
              size="sm"
              maxLength={64}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">LLM</h3>
        <div className="space-y-4">
          <div>
            <FieldLabel
              label="Model"
              hint="The LLM model identifier (e.g., gpt-4, claude-3-opus)"
              required
            />
            <Input placeholder="gpt-4" value={model} onChange={(event) => onModelChange(event.target.value)} size="sm" />
          </div>
          <div>
            <FieldLabel
              label="System Prompt"
              hint="Initial instructions that define the agent's behavior and personality"
            />
            <MarkdownInput
              rows={3}
              placeholder="You are a helpful assistant..."
              value={systemPrompt}
              onChange={(event) => onSystemPromptChange(event.target.value)}
              size="sm"
              helperText="Preview tab renders with connected tools context."
              previewTransform={renderSystemPromptPreview}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[var(--agyn-dark)] font-semibold">Finish Restriction</h3>
            <p className="text-xs text-[var(--agyn-gray)] mt-1">Do not allow to finish agent work without tool call</p>
          </div>
          <Toggle label="" description="" checked={restrictOutput} onCheckedChange={onRestrictOutputChange} />
        </div>
        {restrictOutput && (
          <div className="space-y-4 pl-4 border-l-2 border-[var(--agyn-border-default)]">
            <div>
              <FieldLabel
                label="Restriction Message"
                hint="Message shown when the agent tries to finish without calling required tools"
              />
              <Textarea
                rows={2}
                placeholder="You must use at least one tool before finishing."
                value={restrictionMessage}
                onChange={(event) => onRestrictionMessageChange(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel
                label="Max Injections"
                hint="Maximum number of times the restriction message can be injected"
              />
              <Input
                type="number"
                min="0"
                size="sm"
                value={restrictionMaxInjections !== undefined ? String(restrictionMaxInjections) : ''}
                onChange={(event) =>
                  onRestrictionMaxInjectionsChange(toNumberOrUndefined(event.target.value))
                }
              />
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Messages Queue</h3>
        <div className="space-y-4">
          <div>
            <FieldLabel label="Debounce (ms)" hint="Wait time in milliseconds before processing new messages" />
            <Input
              type="number"
              placeholder="1000"
              min="0"
              step="100"
              size="sm"
              value={queueDebounceValue}
              onChange={(event) =>
                onQueueConfigChange({ debounceMs: toNumberOrUndefined(event.target.value) })
              }
            />
          </div>
          <div>
            <FieldLabel
              label="When Busy"
              hint="Behavior when a new message arrives while agent is processing"
            />
            <Dropdown
              options={QUEUE_WHEN_BUSY_OPTIONS}
              value={queueWhenBusyValue}
              onValueChange={(value) =>
                onQueueConfigChange({ whenBusy: value as AgentQueueConfig['whenBusy'] })
              }
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Process Buffer" hint="How to process multiple queued messages" />
            <Dropdown
              options={QUEUE_PROCESS_BUFFER_OPTIONS}
              value={queueProcessBufferValue}
              onValueChange={(value) =>
                onQueueConfigChange({ processBuffer: value as AgentQueueConfig['processBuffer'] })
              }
              size="sm"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Summarization</h3>
        <div className="space-y-4">
          <div>
            <FieldLabel label="Keep Last Tokens" hint="Number of tokens to keep from the end of the conversation" />
            <Input
              type="number"
              placeholder="600"
              value={summarizationKeepValue}
              onChange={(event) =>
                onSummarizationChange({ keepTokens: toNumberOrUndefined(event.target.value) })
              }
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Max Tokens" hint="Maximum tokens allowed in the conversation summary" />
            <Input
              type="number"
              placeholder="1200"
              value={summarizationMaxValue}
              onChange={(event) =>
                onSummarizationChange({ maxTokens: toNumberOrUndefined(event.target.value) })
              }
              size="sm"
            />
          </div>
          <div>
            <FieldLabel
              label="Prompt"
              hint="Instructions for how to summarize the conversation"
            />
            <Textarea
              rows={2}
              placeholder="Summarize the conversation above..."
              value={summarizationPromptValue}
              onChange={(event) => onSummarizationChange({ prompt: event.target.value })}
            />
          </div>
        </div>
      </section>
    </>
  );
}
