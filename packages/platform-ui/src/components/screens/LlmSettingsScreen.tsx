import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/Button';
import { CredentialsTab } from '@/features/llmSettings/components/CredentialsTab';
import { ModelsTab } from '@/features/llmSettings/components/ModelsTab';
import type { CredentialRecord, ModelRecord, ProviderOption } from '@/features/llmSettings/types';

type TabValue = 'credentials' | 'models';

type Banner = {
  title: string;
  description: ReactNode;
};

type LlmSettingsScreenProps = {
  activeTab: TabValue;
  onTabChange?: (tab: TabValue) => void;
  credentials: CredentialRecord[];
  models: ModelRecord[];
  providers: ProviderOption[];
  readOnly?: boolean;
  canCreateModel?: boolean;
  loadingCredentials?: boolean;
  loadingModels?: boolean;
  credentialsError?: string | null;
  modelsError?: string | null;
  showProviderWarning?: boolean;
  adminBanner?: Banner | null;
  onCredentialCreate?: () => void;
  onCredentialEdit?: (credential: CredentialRecord) => void;
  onCredentialTest?: (credential: CredentialRecord) => void;
  onCredentialDelete?: (credential: CredentialRecord) => void;
  onModelCreate?: () => void;
  onModelEdit?: (model: ModelRecord) => void;
  onModelTest?: (model: ModelRecord) => void;
  onModelDelete?: (model: ModelRecord) => void;
};

export function LlmSettingsScreen({
  activeTab,
  onTabChange,
  credentials,
  models,
  providers,
  readOnly = false,
  canCreateModel = true,
  loadingCredentials = false,
  loadingModels = false,
  credentialsError = null,
  modelsError = null,
  showProviderWarning = true,
  adminBanner = null,
  onCredentialCreate,
  onCredentialEdit,
  onCredentialTest,
  onCredentialDelete,
  onModelCreate,
  onModelEdit,
  onModelTest,
  onModelDelete,
}: LlmSettingsScreenProps) {
  const handleTabChange = (value: TabValue) => {
    if (value === activeTab) return;
    onTabChange?.(value);
  };

  const showProviderNotice = showProviderWarning && !adminBanner;

  const primaryAction =
    activeTab === 'credentials'
      ? {
          label: 'Add Credential',
          disabled: readOnly || providers.length === 0,
          handler: onCredentialCreate,
        }
      : {
          label: 'Add Model',
          disabled: readOnly || !canCreateModel,
          handler: onModelCreate,
        };

  const showPrimaryAction = Boolean(primaryAction.handler);
  const tabs: { label: string; value: TabValue; id: string; panelId: string }[] = [
    { label: 'Credentials', value: 'credentials', id: 'llm-settings-tab-credentials', panelId: 'llm-settings-panel-credentials' },
    { label: 'Models', value: 'models', id: 'llm-settings-tab-models', panelId: 'llm-settings-panel-models' },
  ];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, value: TabValue) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.value === value);
    if (currentIndex === -1) return;
    const nextIndex = event.key === 'ArrowRight'
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    handleTabChange(nextTab.value);
    const nextButton = document.getElementById(nextTab.id);
    nextButton?.focus();
  };

  return (
    <div className="flex h-full flex-col bg-white" data-testid="llm-settings-screen">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4" data-testid="llm-settings-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">LLM Settings</h1>
            <p className="mt-1 text-sm text-[var(--agyn-text-subtle)]">
              Administer LiteLLM credentials and models used across agents and workflows.
            </p>
          </div>
          {showPrimaryAction ? (
            <Button
              onClick={() => primaryAction.handler?.()}
              disabled={primaryAction.disabled}
              size="sm"
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-3" data-testid="llm-settings-tabs">
        <div role="tablist" aria-label="LLM settings" className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.value}
              id={tab.id}
              aria-controls={tab.panelId}
              tabIndex={activeTab === tab.value ? 0 : -1}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] shadow-[inset_0_0_0_1px_var(--agyn-blue)/40]'
                  : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
              }`}
              onKeyDown={(event) => handleTabKeyDown(event, tab.value)}
              onClick={() => handleTabChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {adminBanner ? (
        <div
          role="alert"
          className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4"
        >
          <p className="font-semibold text-[var(--agyn-dark)]">{adminBanner.title}</p>
          <div className="mt-1 text-sm text-[var(--agyn-text-subtle)]">{adminBanner.description}</div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden bg-white">
        {activeTab === 'credentials' ? (
          <div role="tabpanel" id="llm-settings-panel-credentials" aria-labelledby="llm-settings-tab-credentials" className="h-full">
            <CredentialsTab
              credentials={credentials}
              providers={providers}
              loading={loadingCredentials}
              readOnly={readOnly}
              showProviderWarning={showProviderNotice}
              error={credentialsError}
              onEdit={(credential) => onCredentialEdit?.(credential)}
              onTest={(credential) => onCredentialTest?.(credential)}
              onDelete={(credential) => onCredentialDelete?.(credential)}
            />
          </div>
        ) : (
          <div role="tabpanel" id="llm-settings-panel-models" aria-labelledby="llm-settings-tab-models" className="h-full">
            <ModelsTab
              models={models}
              loading={loadingModels}
              readOnly={readOnly}
              canCreateModel={canCreateModel}
              error={modelsError}
              onEdit={(model) => onModelEdit?.(model)}
              onTest={(model) => onModelTest?.(model)}
              onDelete={(model) => onModelDelete?.(model)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export type { TabValue as LlmSettingsTab };
