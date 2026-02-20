import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { EnvEditor } from '../src/components/nodeProperties/EnvEditor';
import { useEnvEditorState } from '../src/components/nodeProperties/hooks/useEnvEditorState';
import type { NodeConfig } from '../src/components/nodeProperties/types';

const meta: Meta<typeof EnvEditor> = {
  title: 'Manual/EnvEditorWorkspace',
  component: EnvEditor,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

function EnvEditorWorkspaceHarness() {
  const [config, setConfig] = useState<NodeConfig>(() => ({
    kind: 'Workspace',
    title: 'Workspace Env Test',
    env: [
      { id: 'env-1', name: 'STATIC_TOKEN', value: 'one', source: 'static' },
      { id: 'env-2', key: 'VAULT_PATH', value: { path: 'secret', key: 'value' }, source: 'vault' },
      { id: 'env-3', name: 'VARIABLE_REF', value: { name: 'MY_VAR' }, source: 'variable' },
    ],
  }));

  const envState = useEnvEditorState({
    configRecord: config,
    onConfigChange: (updates) => setConfig((prev) => ({ ...prev, ...updates })),
    ensureSecretKeys: async () => undefined,
    ensureVariableKeys: async () => undefined,
  });

  const [open, setOpen] = useState(true);

  return (
    <div className="w-full min-h-screen bg-[var(--agyn-bg-secondary)] text-[var(--agyn-dark)] p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
        <EnvEditor
          title="Environment Variables"
          isOpen={open}
          onOpenChange={setOpen}
          secretSuggestions={['secret/api-key', 'secret/db/password']}
          variableSuggestions={['ORG_ID', 'MY_VAR', 'REGION']}
          {...envState}
        />
      </div>
    </div>
  );
}

export const WorkspaceEnvEditor: StoryObj<typeof EnvEditor> = {
  render: () => <EnvEditorWorkspaceHarness />,
};
