import { useEffect, useMemo, useState, type ReactElement } from 'react';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createCredential,
  updateCredential,
  deleteCredential,
  testCredential,
  createModel,
  updateModel,
  deleteModel,
  testModel,
  type LiteLLMAdminErrorPayload,
} from '@/api/modules/llmSettings';
import {
  useProviderOptions,
  useCredentialRecords,
  useModelRecords,
  useHealthCheckModes,
  useAdminStatus,
} from './hooks';
import type { CredentialRecord, ModelRecord } from './types';
import { CredentialFormDialog, type CredentialFormPayload } from './components/CredentialFormDialog';
import { TestCredentialDialog } from './components/TestCredentialDialog';
import { ModelFormDialog, type ModelFormPayload } from './components/ModelFormDialog';
import { TestModelDialog } from './components/TestModelDialog';
import { LlmSettingsScreen, type LlmSettingsTab } from '@/components/screens/LlmSettingsScreen';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Unexpected error occurred';
}

const CREDENTIALS_QUERY_KEY = ['llm', 'credentials'] as const;
const MODELS_QUERY_KEY = ['llm', 'models'] as const;
const LITELLM_SETUP_URL = 'https://github.com/agynio/platform/blob/main/packages/platform-server/README.md#litellm-admin-setup';
const LITELLM_SAMPLE_BASE_URL = 'http://127.0.0.1:4000';
const LITELLM_SAMPLE_MASTER_KEY = 'sk-dev-master-1234';

function describeAdminIssue(error: unknown): string | undefined {
  if (axios.isAxiosError<LiteLLMAdminErrorPayload>(error) && error.response) {
    const payload = error.response.data;
    const details = payload?.details;
    if (details && typeof details === 'object' && 'error' in details) {
      const detailError = (details as { error?: unknown }).error;
      if (detailError === 'litellm_admin_auth_required') {
        return 'LiteLLM admin authentication failed. Verify the LiteLLM master key.';
      }
    }
    if (payload?.error === 'litellm_admin_unauthorized') {
      return 'LiteLLM admin authentication failed. Verify the LiteLLM master key.';
    }
    if (payload?.error === 'litellm_unreachable') {
      return 'LiteLLM admin API is unreachable. Verify the base URL and ensure LiteLLM is running.';
    }
    if (payload?.error && typeof payload.error === 'string') {
      return payload.error;
    }
  }
  return error ? toErrorMessage(error) : undefined;
}

export function SettingsLlmContainer(): ReactElement {
  const queryClient = useQueryClient();
  const { providers, map: providerMap, isLoading: providersLoading, error: providersError } = useProviderOptions();
  const { credentials, query: credentialsQuery } = useCredentialRecords(providerMap);
  const { models, query: modelsQuery } = useModelRecords(providerMap);
  const adminStatusQuery = useAdminStatus();
  const adminStatus = adminStatusQuery.data;

  const adminStatusReason = useMemo(() => {
    if (!adminStatus) return undefined;
    if (!adminStatus.configured) return adminStatus.reason ?? ('missing_env' as const);
    if (adminStatus.adminReachable === false) return adminStatus.reason ?? ('unreachable' as const);
    return adminStatus.reason;
  }, [adminStatus]);

  const missingEnvKeys = useMemo(() => {
    if (!adminStatus || adminStatus.configured || adminStatusReason !== 'missing_env') return undefined;
    const vars: string[] = [];
    if (!adminStatus.baseUrl) vars.push('LITELLM_BASE_URL');
    if (!adminStatus.hasMasterKey) vars.push('LITELLM_MASTER_KEY');
    return vars.length ? vars : ['LITELLM_BASE_URL', 'LITELLM_MASTER_KEY'];
  }, [adminStatus, adminStatusReason]);

  const upstreamError = providersError ?? credentialsQuery.error ?? modelsQuery.error ?? adminStatusQuery.error;
  const fallbackErrorMessage = describeAdminIssue(upstreamError);

  const adminDisabled = !adminStatus || !adminStatus.configured || adminStatus.adminReachable === false || Boolean(adminStatus.reason);

  const adminIssueMessage = useMemo(() => {
    if (adminStatusReason === 'missing_env') {
      const vars = missingEnvKeys?.join(' and ') ?? 'LITELLM_BASE_URL and LITELLM_MASTER_KEY';
      return `LiteLLM administration requires ${vars}. Update the platform server environment and restart.`;
    }
    if (adminStatusReason === 'provider_mismatch') {
      return 'Set LLM_PROVIDER=litellm on the platform server to enable LiteLLM administration.';
    }
    if (adminStatusReason === 'unauthorized') {
      return 'LiteLLM admin authentication failed. Verify the LiteLLM master key.';
    }
    if (adminStatusReason === 'unreachable') {
      const target = adminStatus?.baseUrl ?? LITELLM_SAMPLE_BASE_URL;
      return `LiteLLM admin API at ${target} is unreachable. Verify the base URL and ensure LiteLLM is running.`;
    }
    return fallbackErrorMessage;
  }, [adminStatusReason, missingEnvKeys, adminStatus?.baseUrl, fallbackErrorMessage]);

  const showAdminBanner = adminDisabled;
  const { modes: healthCheckModes, isLoading: healthCheckModesLoading } = useHealthCheckModes();
  const adminBannerDescription = useMemo(() => {
    if (adminStatusReason === 'missing_env') {
      return (
        <div className="space-y-2">
          <p>
            LiteLLM administration requires {missingEnvKeys?.join(' and ') ?? 'LITELLM_BASE_URL and LITELLM_MASTER_KEY'}. Update the platform server environment and restart.
          </p>
          <p>
            Example configuration:{' '}
            <code>{`LITELLM_BASE_URL=${LITELLM_SAMPLE_BASE_URL}`}</code>{' '}
            and{' '}
            <code>{`LITELLM_MASTER_KEY=${LITELLM_SAMPLE_MASTER_KEY}`}</code>. Replace the master key with your actual secret if it differs.
          </p>
          <p>
            <a className="underline" href={LITELLM_SETUP_URL} rel="noreferrer" target="_blank">
              View the server LiteLLM admin setup guide
            </a>
            .
          </p>
        </div>
      );
    }
    if (adminStatusReason === 'provider_mismatch') {
      return (
        <div className="space-y-2">
          <p>LiteLLM administration is disabled because the platform server is not running in LiteLLM mode.</p>
          <p>
            Update the environment to include <code>LLM_PROVIDER=litellm</code> and restart the server.
          </p>
          <p>
            <a className="underline" href={LITELLM_SETUP_URL} rel="noreferrer" target="_blank">
              View the server LiteLLM admin setup guide
            </a>
            .
          </p>
        </div>
      );
    }
    if (adminStatusReason === 'unauthorized') {
      return (
        <div className="space-y-2">
          <p>LiteLLM admin authentication failed. Verify the LiteLLM master key.</p>
          <p>
            Example configuration:{' '}
            <code>{`LITELLM_MASTER_KEY=${LITELLM_SAMPLE_MASTER_KEY}`}</code>. Replace the master key with your actual secret if it differs.
          </p>
          <p>
            <a className="underline" href={LITELLM_SETUP_URL} rel="noreferrer" target="_blank">
              View the server LiteLLM admin setup guide
            </a>
            .
          </p>
        </div>
      );
    }
    if (adminStatusReason === 'unreachable') {
      const target = adminStatus?.baseUrl ?? LITELLM_SAMPLE_BASE_URL;
      return (
        <div className="space-y-2">
          <p>
            LiteLLM admin API at <code>{target}</code> is unreachable. Verify the base URL and ensure the LiteLLM service is running.
          </p>
          <p>
            Example configuration:{' '}
            <code>{`LITELLM_BASE_URL=${LITELLM_SAMPLE_BASE_URL}`}</code>. Adjust to match your LiteLLM deployment if it differs.
          </p>
          <p>
            <a className="underline" href={LITELLM_SETUP_URL} rel="noreferrer" target="_blank">
              View the server LiteLLM admin setup guide
            </a>
            .
          </p>
        </div>
      );
    }
    if (adminIssueMessage) {
      return <p>{adminIssueMessage}</p>;
    }
    return <p>LiteLLM administration is currently unavailable.</p>;
  }, [adminStatusReason, adminStatus?.baseUrl, adminIssueMessage, missingEnvKeys]);

  const adminBanner = showAdminBanner
    ? {
        title: 'LiteLLM administration unavailable',
        description: adminBannerDescription,
      }
    : null;

  const credentialsErrorMessage = credentialsQuery.error ? toErrorMessage(credentialsQuery.error) : null;
  const modelsErrorMessage = modelsQuery.error ? toErrorMessage(modelsQuery.error) : null;

  const sortedCredentials = useMemo(
    () => [...credentials].sort((a, b) => a.name.localeCompare(b.name)),
    [credentials],
  );
  const sortedModels = useMemo(() => [...models].sort((a, b) => a.id.localeCompare(b.id)), [models]);

  const hasProviders = providers.length > 0;
  const canCreateModel = sortedCredentials.length > 0;
  const showProviderWarning = !adminDisabled && !providersError && !providersLoading;

  const [activeTab, setActiveTab] = useState<LlmSettingsTab>('credentials');
  const [credentialDialog, setCredentialDialog] = useState<{ mode: 'create' | 'edit'; credential?: CredentialRecord } | null>(null);
  const [testCredentialState, setTestCredentialState] = useState<CredentialRecord | null>(null);
  const [modelDialog, setModelDialog] = useState<{ mode: 'create' | 'edit'; model?: ModelRecord } | null>(null);
  const [testModelState, setTestModelState] = useState<ModelRecord | null>(null);
  const [deleteState, setDeleteState] = useState<{ type: 'credential' | 'model'; item: CredentialRecord | ModelRecord } | null>(null);

  useEffect(() => {
    if (!adminDisabled) return;
    setCredentialDialog(null);
    setTestCredentialState(null);
    setModelDialog(null);
    setTestModelState(null);
    setDeleteState(null);
  }, [adminDisabled]);

  const ensureWritable = () => {
    if (!adminDisabled) return true;
    notifyError(adminIssueMessage ?? 'LiteLLM administration is currently unavailable.');
    return false;
  };

  const createCredentialMutation = useMutation({
    mutationFn: async (payload: CredentialFormPayload) => {
      await createCredential({
        name: payload.name,
        provider: payload.providerKey,
        metadata: payload.metadata,
        values: payload.values,
      });
    },
    onSuccess: () => {
      notifySuccess('Credential created');
      queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
      setCredentialDialog(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const updateCredentialMutation = useMutation({
    mutationFn: async ({ name, ...payload }: CredentialFormPayload) => {
      await updateCredential(name, {
        provider: payload.providerKey,
        metadata: payload.metadata,
        values: payload.values,
      });
    },
    onSuccess: () => {
      notifySuccess('Credential updated');
      queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
      setCredentialDialog(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (name: string) => deleteCredential(name),
    onSuccess: () => {
      notifySuccess('Credential deleted');
      queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
      setDeleteState(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const testCredentialMutation = useMutation({
    mutationFn: async ({ name, model, mode, input }: { name: string; model: string; mode?: string; input?: string }) => {
      await testCredential(name, { model, mode, input });
    },
    onSuccess: () => {
      notifySuccess('Credential test succeeded');
      setTestCredentialState(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const createModelMutation = useMutation({
    mutationFn: async (payload: ModelFormPayload) => {
      await createModel({
        name: payload.name,
        provider: payload.providerKey,
        model: payload.model,
        credentialName: payload.credentialName,
        mode: payload.mode,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        topP: payload.topP,
        frequencyPenalty: payload.frequencyPenalty,
        presencePenalty: payload.presencePenalty,
        stream: payload.stream,
        rpm: payload.rpm,
        tpm: payload.tpm,
        metadata: payload.metadata,
        params: payload.params,
      });
    },
    onSuccess: () => {
      notifySuccess('Model created');
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      setModelDialog(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ModelFormPayload }) => {
      await updateModel(id, {
        name: payload.name,
        provider: payload.providerKey,
        model: payload.model,
        credentialName: payload.credentialName,
        mode: payload.mode,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        topP: payload.topP,
        frequencyPenalty: payload.frequencyPenalty,
        presencePenalty: payload.presencePenalty,
        stream: payload.stream,
        rpm: payload.rpm,
        tpm: payload.tpm,
        metadata: payload.metadata,
        params: payload.params,
      });
    },
    onSuccess: () => {
      notifySuccess('Model updated');
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      setModelDialog(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (id: string) => deleteModel(id),
    onSuccess: () => {
      notifySuccess('Model deleted');
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      setDeleteState(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const testModelMutation = useMutation({
    mutationFn: async ({ id, mode, overrideModel, input, credentialName }: { id: string; mode?: string; overrideModel?: string; input?: string; credentialName?: string }) => {
      await testModel(id, {
        mode,
        overrideModel: overrideModel?.trim() ? overrideModel : undefined,
        input,
        credentialName: credentialName?.trim() ? credentialName : undefined,
      });
    },
    onSuccess: () => {
      notifySuccess('Model test succeeded');
      setTestModelState(null);
    },
    onError: (error) => notifyError(toErrorMessage(error)),
  });

  const credentialSubmitting = Boolean(
    credentialDialog?.mode === 'create' ? createCredentialMutation.isPending : credentialDialog?.mode === 'edit' && updateCredentialMutation.isPending,
  );
  const modelSubmitting = Boolean(
    modelDialog?.mode === 'create' ? createModelMutation.isPending : modelDialog?.mode === 'edit' && updateModelMutation.isPending,
  );

  const deleteSubmitting = deleteState
    ? deleteState.type === 'credential'
      ? deleteCredentialMutation.isPending
      : deleteModelMutation.isPending
    : false;

  const providerDefaultForCredential = testCredentialState
    ? providerMap.get(testCredentialState.providerKey)?.defaultModelPlaceholder ?? undefined
    : undefined;

  return (
    <>
      <LlmSettingsScreen
        activeTab={activeTab}
        onTabChange={setActiveTab}
        credentials={sortedCredentials}
        models={sortedModels}
        providers={providers}
        readOnly={adminDisabled}
        canCreateModel={canCreateModel}
        loadingCredentials={providersLoading || credentialsQuery.isLoading}
        loadingModels={modelsQuery.isLoading}
        credentialsError={credentialsErrorMessage}
        modelsError={modelsErrorMessage}
        showProviderWarning={showProviderWarning}
        adminBanner={adminBanner}
        onCredentialCreate={() => {
          if (!ensureWritable()) return;
          if (!hasProviders) {
            notifyError('LiteLLM providers are unavailable. Refresh once LiteLLM admin is reachable.');
            return;
          }
          setCredentialDialog({ mode: 'create' });
        }}
        onCredentialEdit={(credential) => {
          if (!ensureWritable()) return;
          setCredentialDialog({ mode: 'edit', credential });
        }}
        onCredentialTest={(credential) => {
          if (!ensureWritable()) return;
          setTestCredentialState(credential);
        }}
        onCredentialDelete={(credential) => {
          if (!ensureWritable()) return;
          setDeleteState({ type: 'credential', item: credential });
        }}
        onModelCreate={() => {
          if (!ensureWritable()) return;
          if (!canCreateModel) {
            notifyError('Create a credential before adding a model.');
            return;
          }
          setModelDialog({ mode: 'create' });
        }}
        onModelEdit={(model) => {
          if (!ensureWritable()) return;
          setModelDialog({ mode: 'edit', model });
        }}
        onModelTest={(model) => {
          if (!ensureWritable()) return;
          setTestModelState(model);
        }}
        onModelDelete={(model) => {
          if (!ensureWritable()) return;
          setDeleteState({ type: 'model', item: model });
        }}
      />

      <CredentialFormDialog
        open={credentialDialog !== null}
        mode={credentialDialog?.mode ?? 'create'}
        providers={providers}
        credential={credentialDialog?.credential}
        submitting={credentialSubmitting}
        onOpenChange={(open) => {
          if (!open) setCredentialDialog(null);
        }}
        onSubmit={async (payload) => {
          if (!ensureWritable()) return;
          if (credentialDialog?.mode === 'edit') {
            await updateCredentialMutation.mutateAsync(payload);
          } else {
            await createCredentialMutation.mutateAsync(payload);
          }
        }}
      />

      {testCredentialState ? (
        <TestCredentialDialog
          open={testCredentialState !== null}
          credentialName={testCredentialState.name}
          healthCheckModes={healthCheckModes}
          healthCheckModesLoading={healthCheckModesLoading}
          defaultModel={providerDefaultForCredential}
          submitting={testCredentialMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setTestCredentialState(null);
          }}
          onSubmit={async (values) => {
            if (!ensureWritable()) return;
            await testCredentialMutation.mutateAsync({
              name: testCredentialState.name,
              model: values.model,
              mode: values.mode,
              input: values.input,
            });
          }}
        />
      ) : null}

      <ModelFormDialog
        open={modelDialog !== null}
        mode={modelDialog?.mode ?? 'create'}
        providers={providers}
        credentials={sortedCredentials}
        model={modelDialog?.model}
        submitting={modelSubmitting}
        onOpenChange={(open) => {
          if (!open) setModelDialog(null);
        }}
        onSubmit={async (payload) => {
          if (!ensureWritable()) return;
          if (modelDialog?.mode === 'edit' && modelDialog.model) {
            await updateModelMutation.mutateAsync({ id: modelDialog.model.id, payload });
          } else {
            await createModelMutation.mutateAsync(payload);
          }
        }}
      />

      {testModelState ? (
        <TestModelDialog
          open={testModelState !== null}
          model={testModelState}
          healthCheckModes={healthCheckModes}
          healthCheckModesLoading={healthCheckModesLoading}
          submitting={testModelMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setTestModelState(null);
          }}
          onSubmit={async (values) => {
            if (!ensureWritable()) return;
            await testModelMutation.mutateAsync({
              id: testModelState.id,
              mode: values.mode,
              overrideModel: values.overrideModel,
              input: values.input,
              credentialName: values.credentialName,
            });
          }}
        />
      ) : null}

      <ScreenDialog open={deleteState !== null} onOpenChange={(open) => !open && setDeleteState(null)}>
        <ScreenDialogContent className="sm:max-w-md" hideCloseButton>
          <div className="flex items-start justify-between gap-4">
            <ScreenDialogHeader className="flex-1 gap-2">
              <ScreenDialogTitle>
                Delete {deleteState?.type === 'credential' ? 'Credential' : 'Model'}?
              </ScreenDialogTitle>
              <ScreenDialogDescription>
                This action cannot be undone. References to the {deleteState?.type ?? 'item'} will fail once removed.
              </ScreenDialogDescription>
            </ScreenDialogHeader>
            <IconButton
              icon={<X className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              rounded={false}
              aria-label="Close dialog"
              title="Close"
              className="shrink-0"
              onClick={() => setDeleteState(null)}
            />
          </div>
          <ScreenDialogFooter className="mt-6">
            <Button type="button" variant="ghost" size="md" onClick={() => setDeleteState(null)} disabled={deleteSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              disabled={deleteSubmitting}
              onClick={() => {
                if (!ensureWritable()) return;
                if (!deleteState) return;
                if (deleteState.type === 'credential') {
                  const credential = deleteState.item as CredentialRecord;
                  void deleteCredentialMutation.mutateAsync(credential.name);
                } else {
                  const model = deleteState.item as ModelRecord;
                  void deleteModelMutation.mutateAsync(model.id);
                }
              }}
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete'}
            </Button>
          </ScreenDialogFooter>
        </ScreenDialogContent>
      </ScreenDialog>
    </>
  );
}
