import type { ReactElement } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Play, Pencil, Trash2 } from 'lucide-react';

import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import type { ModelRecord } from '../types';

const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;
const tooltipContentClass = 'bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md shadow-lg';

interface ModelsTabProps {
  models: ModelRecord[];
  loading: boolean;
  readOnly: boolean;
  canCreateModel: boolean;
  error?: string | null;
  onEdit: (model: ModelRecord) => void;
  onTest: (model: ModelRecord) => void;
  onDelete: (model: ModelRecord) => void;
}

export function ModelsTab({ models, loading, readOnly, canCreateModel, error, onEdit, onTest, onDelete }: ModelsTabProps): ReactElement {
  const allowWrites = !readOnly;
  const showErrorState = Boolean(error) && models.length === 0 && !loading;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white" data-testid="llm-models-panel">
      {!canCreateModel ? (
        <div className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-3 text-sm text-[var(--agyn-text-subtle)]">
          <p className="font-semibold text-[var(--agyn-dark)]">Models require credentials</p>
          <p className="mt-1">
            Create at least one credential before adding models. Models reference stored credentials for LiteLLM access.
          </p>
        </div>
      ) : null}

      {showErrorState ? (
        <div role="alert" className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4 text-sm">
          <p className="font-semibold text-[var(--agyn-dark)]">Unable to load models</p>
          <p className="mt-1 text-[var(--agyn-text-subtle)]">{error}</p>
        </div>
      ) : (
        <Tooltip.Provider delayDuration={tooltipDelay}>
          <div data-testid="llm-models-table-container" className="flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm" data-testid="llm-models-table">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead data-testid="llm-models-table-header" className="sticky top-0 z-10 text-[var(--agyn-text-subtle)]">
                <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Identifier
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Target Model
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Credential
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Mode
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Limits
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-[var(--agyn-text-subtle)]">
                      Loading models…
                    </td>
                  </tr>
                ) : models.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-[var(--agyn-text-subtle)]">
                      No models configured yet.
                    </td>
                  </tr>
                ) : (
                  models.map((model, index) => (
                    <tr
                      key={model.id}
                      data-testid={`llm-model-row-${model.id}`}
                      className={`bg-white border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/40 ${
                        index === models.length - 1 ? 'last:border-b-0' : ''
                      }`}
                    >
                      <td className="px-6 py-4 align-top">
                        <div className="space-y-1">
                          <p className="text-base font-semibold text-[var(--agyn-dark)]">{model.id}</p>
                          <p className="text-xs text-[var(--agyn-text-subtle)]">Alias used by agents</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="space-y-2">
                          <p className="font-medium text-[var(--agyn-dark)]" title={model.model}>
                            {model.model}
                          </p>
                          <Badge variant="neutral" size="sm">
                            {model.providerLabel}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <Badge variant="outline" size="sm" className="text-[11px] uppercase tracking-tight">
                          {model.credentialName}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 align-top text-[var(--agyn-dark)]">{model.mode ?? 'chat'}</td>
                      <td className="px-6 py-4 align-top">
                        <div className="space-y-1 text-xs text-[var(--agyn-text-subtle)]">
                          <p>RPM: {model.rpm ?? '—'}</p>
                          <p>TPM: {model.tpm ?? '—'}</p>
                          <p>Stream: {model.stream ? 'On' : 'Off'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                type="button"
                                aria-label={`Test model ${model.id}`}
                                variant="ghost"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onTest(model)}
                                icon={<Play className="h-4 w-4" />}
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className={tooltipContentClass} sideOffset={6}>
                                Test
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                type="button"
                                aria-label={`Edit model ${model.id}`}
                                variant="ghost"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onEdit(model)}
                                icon={<Pencil className="h-4 w-4" />}
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className={tooltipContentClass} sideOffset={6}>
                                Edit
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                type="button"
                                aria-label={`Delete model ${model.id}`}
                                variant="danger"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onDelete(model)}
                                icon={<Trash2 className="h-4 w-4" />}
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className={tooltipContentClass} sideOffset={6}>
                                Delete
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Tooltip.Provider>
      )}

      <div className="border-t border-[var(--agyn-border-subtle)] bg-white px-6 py-4 text-sm text-[var(--agyn-text-subtle)]">
        Include advanced params (e.g. mock responses) by adding JSON under “Advanced Params”. Values merge with LiteLLM payloads.
      </div>
    </div>
  );
}
