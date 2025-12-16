import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Screen,
  ScreenBody,
  ScreenContent,
  ScreenDescription,
  ScreenHeader,
  ScreenHeaderContent,
  ScreenTabs,
  ScreenTitle,
} from '@/components/ui/screen';
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const handleTabChange = (value: string) => {
    if (value === activeTab) return;
    onTabChange?.(value as TabValue);
  };

  const showProviderNotice = showProviderWarning && !adminBanner;

  return (
    <Screen className="bg-background">
      <ScreenTabs
        className="flex h-full flex-col gap-0"
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <ScreenHeader className="border-b border-border/60 bg-background">
          <ScreenHeaderContent className="gap-2">
            <ScreenTitle>LLM Settings</ScreenTitle>
            <ScreenDescription>
              Administer LiteLLM credentials and models used across agents and workflows.
            </ScreenDescription>
          </ScreenHeaderContent>
          <TabsList className="mt-6 w-fit">
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
          </TabsList>
        </ScreenHeader>
        <ScreenBody>
          {adminBanner ? (
            <Alert variant="destructive">
              <AlertTitle>{adminBanner.title}</AlertTitle>
              <AlertDescription>{adminBanner.description}</AlertDescription>
            </Alert>
          ) : null}

          <ScreenContent>
            <TabsContent value="credentials" className="flex-1">
              <CredentialsTab
                credentials={credentials}
                providers={providers}
                loading={loadingCredentials}
                readOnly={readOnly}
                showProviderWarning={showProviderNotice}
                error={credentialsError}
                onCreate={() => onCredentialCreate?.()}
                onEdit={(credential) => onCredentialEdit?.(credential)}
                onTest={(credential) => onCredentialTest?.(credential)}
                onDelete={(credential) => onCredentialDelete?.(credential)}
              />
            </TabsContent>
            <TabsContent value="models" className="flex-1">
              <ModelsTab
                models={models}
                loading={loadingModels}
                readOnly={readOnly}
                canCreateModel={canCreateModel}
                error={modelsError}
                onCreate={() => onModelCreate?.()}
                onEdit={(model) => onModelEdit?.(model)}
                onTest={(model) => onModelTest?.(model)}
                onDelete={(model) => onModelDelete?.(model)}
              />
            </TabsContent>
          </ScreenContent>
        </ScreenBody>
      </ScreenTabs>
    </Screen>
  );
}

export type { TabValue as LlmSettingsTab };
