import type { ReactElement } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Play, Pencil, Trash2 } from 'lucide-react';

import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import type { CredentialRecord, ProviderOption } from '../types';

const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;
const tooltipContentClass = 'bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md shadow-lg';

interface CredentialsTabProps {
  credentials: CredentialRecord[];
  providers: ProviderOption[];
  loading: boolean;
  readOnly: boolean;
  showProviderWarning: boolean;
  error?: string | null;
  onEdit: (credential: CredentialRecord) => void;
  onTest: (credential: CredentialRecord) => void;
  onDelete: (credential: CredentialRecord) => void;
}

export function CredentialsTab({
  credentials,
  providers,
  loading,
  readOnly,
  showProviderWarning,
  error,
  onEdit,
  onTest,
  onDelete,
}: CredentialsTabProps): ReactElement {
  const providerCount = providers.length;
  const allowWrites = !readOnly;
  const showErrorState = Boolean(error) && credentials.length === 0 && !loading;
  const showProviderNotice = providerCount === 0 && showProviderWarning;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white" data-testid="llm-credentials-panel">
      {showProviderNotice ? (
        <div className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-3 text-sm text-[var(--agyn-text-subtle)]">
          No LiteLLM providers detected. Ensure the LiteLLM admin API is reachable and refresh this page.
        </div>
      ) : null}

      {showErrorState ? (
        <div role="alert" className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4 text-sm">
          <p className="font-semibold text-[var(--agyn-dark)]">Unable to load credentials</p>
          <p className="mt-1 text-[var(--agyn-text-subtle)]">{error}</p>
        </div>
      ) : (
        <Tooltip.Provider delayDuration={tooltipDelay}>
          <div data-testid="llm-credentials-table-container" className="flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm" data-testid="llm-credentials-table">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[24%]" />
                <col />
                <col className="w-[140px]" />
              </colgroup>
              <thead
                data-testid="llm-credentials-table-header"
                className="sticky top-0 z-10 text-[var(--agyn-text-subtle)]"
              >
                <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Provider
                  </th>
                  <th
                    scope="col"
                    className="bg-white px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    Tags
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
                    <td colSpan={4} className="px-6 py-6 text-center text-[var(--agyn-text-subtle)]">
                      Loading credentials…
                    </td>
                  </tr>
                ) : credentials.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-[var(--agyn-text-subtle)]">
                      No credentials configured yet.
                    </td>
                  </tr>
                ) : (
                  credentials.map((credential, index) => (
                    <tr
                      key={credential.name}
                      data-testid={`llm-credential-row-${credential.name}`}
                      className={`bg-white border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/40 ${
                        index === credentials.length - 1 ? 'last:border-b-0' : ''
                      }`}
                    >
                      <td className="px-6 py-4 align-top text-[var(--agyn-dark)]">
                        <div className="space-y-1">
                          <p className="text-base font-semibold leading-tight">{credential.name}</p>
                          <p className="text-xs text-[var(--agyn-text-subtle)]">
                            {credential.maskedFields.size === 0
                              ? 'No stored secret fields'
                              : `${credential.maskedFields.size} stored ${credential.maskedFields.size === 1 ? 'field' : 'fields'}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        {credential.providerLabel ? (
                          <Badge variant="neutral" size="sm">
                            {credential.providerLabel}
                          </Badge>
                        ) : (
                          <span className="text-[var(--agyn-text-subtle)]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                        {credential.tags.length === 0 ? (
                          <span className="text-[var(--agyn-text-subtle)]">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {credential.tags.map((tag) => (
                              <Badge key={tag} variant="outline" size="sm" className="text-[11px] uppercase tracking-tight">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                type="button"
                                aria-label={`Test credential ${credential.name}`}
                                variant="ghost"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onTest(credential)}
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
                                aria-label={`Edit credential ${credential.name}`}
                                variant="ghost"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onEdit(credential)}
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
                                aria-label={`Delete credential ${credential.name}`}
                                variant="danger"
                                size="sm"
                                disabled={!allowWrites}
                                onClick={() => onDelete(credential)}
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
        Need help mapping providers? Refer to LiteLLM{' '}
        <a
          href="https://docs.litellm.ai/docs/providers"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[var(--agyn-blue)] underline-offset-4 hover:underline"
        >
          provider documentation
        </a>
        .
      </div>
    </div>
  );
}
