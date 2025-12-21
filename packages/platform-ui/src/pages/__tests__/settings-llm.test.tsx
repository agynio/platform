import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SettingsLlm } from '../../pages/SettingsLlm';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

const DEFAULT_HEALTH_CHECK_MODES = [
  'chat',
  'completion',
  'embedding',
  'audio_speech',
  'audio_transcription',
  'image_generation',
  'video_generation',
  'batch',
  'rerank',
  'realtime',
  'responses',
  'ocr',
] as const;

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

const paddingClassPrefixes = ['p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-'];

function containerHasPadding(element: HTMLElement): boolean {
  return Array.from(element.classList).some((cls) => paddingClassPrefixes.some((prefix) => cls.startsWith(prefix)));
}

describe('Settings/LLM page', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    notifyMocks.success.mockReset();
    notifyMocks.error.mockReset();
  }, 12000);

  it('renders credentials and models tables', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];
    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];
    const modelRecords = [
      {
        model_name: 'assistant-prod',
        litellm_params: {
          model: 'gpt-4o-mini',
          custom_llm_provider: 'openai',
          litellm_credential_name: 'openai-prod',
          temperature: 0.4,
        },
        model_info: { id: 'assistant-prod', mode: 'chat', rpm: 120, tpm: 60000 },
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: modelRecords })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-prod');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const credentialTableShell = screen.getByTestId('llm-credentials-table-container');
    expect(credentialTableShell.className).not.toMatch(/border/);
    const credentialHeader = screen.getByTestId('llm-credentials-table-header');
    expect(credentialHeader.className).toContain('sticky');
    expect(credentialHeader.className).toContain('top-0');
    const credentialRow = screen.getByTestId('llm-credential-row-openai-prod');
    expect(within(credentialRow).getByText('OpenAI')).toBeInTheDocument();
    expect(within(credentialRow).queryByText('prod')).not.toBeInTheDocument();

    const modelsTab = screen.getByRole('tab', { name: 'Models' });
    await user.click(modelsTab);
    await screen.findByText('assistant-prod');
    const modelsTableShell = screen.getByTestId('llm-models-table-container');
    expect(modelsTableShell.className).not.toMatch(/border/);
    const modelsHeader = screen.getByTestId('llm-models-table-header');
    expect(modelsHeader.className).toContain('sticky');
    expect(modelsHeader.className).toContain('top-0');

    const modelRow = screen.getByTestId('llm-model-row-assistant-prod');
    expect(within(modelRow).getByText('openai-prod')).toBeInTheDocument();
    expect(within(modelRow).getByText('gpt-4o-mini')).toBeInTheDocument();
  }, 12000);

  it('matches the Secrets layout structure (single header, flush tables, sticky tabs)', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];
    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];
    const modelRecords = [
      {
        model_name: 'assistant-prod',
        litellm_params: {
          model: 'gpt-4o-mini',
          custom_llm_provider: 'openai',
          litellm_credential_name: 'openai-prod',
          temperature: 0.4,
        },
        model_info: { id: 'assistant-prod', mode: 'chat', rpm: 120, tpm: 60000 },
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: modelRecords })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-prod');

    const screenRoot = screen.getByTestId('llm-settings-screen');
    const header = screen.getByTestId('llm-settings-header');
    const tabs = screen.getByTestId('llm-settings-tabs');
    expect(screenRoot.firstElementChild).toBe(header);
    expect(header.nextElementSibling).toBe(tabs);
    expect(within(header).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(tabs).getByRole('tablist')).toBeInTheDocument();

    const credentialContainer = screen.getByTestId('llm-credentials-table-container');
    expect(containerHasPadding(credentialContainer)).toBe(false);

    const modelsTab = screen.getByRole('tab', { name: 'Models' });
    await user.click(modelsTab);
    await screen.findByTestId('llm-models-table-container');
    const modelsContainer = screen.getByTestId('llm-models-table-container');
    expect(containerHasPadding(modelsContainer)).toBe(false);
  }, 12000);

  it('shows provider warning when LiteLLM admin is reachable but no providers are detected', async () => {
    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json([])),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json([])),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    expect(
      await screen.findByText('No LiteLLM providers detected. Ensure the LiteLLM admin API is reachable and refresh this page.'),
    ).toBeInTheDocument();

    const addCredentialButton = await screen.findByRole('button', { name: 'Add Credential' });
    expect(addCredentialButton).toBeDisabled();
  }, 12000);

  it('shows an error state when credential records fail to load', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json({ error: 'credential_fetch_failed' }, { status: 500 })),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    expect(await screen.findByText('Unable to load credentials', undefined, { timeout: 9000 })).toBeInTheDocument();
    expect(screen.getByText('credential_fetch_failed')).toBeInTheDocument();
    expect(screen.queryByTestId('llm-credential-row-openai-prod')).not.toBeInTheDocument();
  }, 12000);

  it('shows an error state when model records fail to load', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ error: 'models_fetch_failed' }, { status: 500 })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    const modelsTab = await screen.findByRole('tab', { name: 'Models' });
    await user.click(modelsTab);

    expect(await screen.findByText('Unable to load models', undefined, { timeout: 9000 })).toBeInTheDocument();
    expect(screen.getByText('models_fetch_failed')).toBeInTheDocument();
  }, 12000);

  it('creates a new credential through the dialog', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    const credentialRecords: unknown[] = [];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
      http.post(abs('/api/settings/llm/credentials'), async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          provider: string;
          values?: Record<string, string>;
        };
        credentialRecords.push({
          credential_name: body.name,
          credential_info: { litellm_provider: body.provider },
          credential_values: { api_key: 'sk****new' },
        });
        return HttpResponse.json({ success: true });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByRole('button', { name: 'Add Credential' });

    const addButton = screen.getByRole('button', { name: 'Add Credential' });
    await user.click(addButton);

    const dialog = await screen.findByRole('dialog', { name: /Create Credential/i });
    const nameInput = within(dialog).getByLabelText('Credential Name');
    await user.type(nameInput, 'openai-new');

    const apiKeyInput = within(dialog).getByLabelText('OpenAI API Key');
    await user.type(apiKeyInput, 'sk-test-value');

    const submitButton = within(dialog).getByRole('button', { name: 'Create Credential' });
    await user.click(submitButton);

    await waitFor(() => expect(notifyMocks.success).toHaveBeenCalledWith('Credential created'));
    await screen.findByText('openai-new');
  });

  it('updates an existing credential without resubmitting masked values', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
      http.patch(abs('/api/settings/llm/credentials/openai-prod'), async ({ request }) => {
        const body = (await request.json()) as { values?: Record<string, string> };
        expect(body).not.toHaveProperty('tags');
        expect(body).toMatchObject({ values: { api_key: 'sk-updated-secret' } });
        credentialRecords[0].credential_values.api_key = 'sk****updated';
        return HttpResponse.json({ success: true });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-prod');

    const editButton = screen.getByLabelText('Edit credential openai-prod');
    await user.click(editButton);

    const dialog = await screen.findByRole('dialog', { name: /Edit Credential/i });
    const apiKeyInput = within(dialog).getByLabelText('OpenAI API Key');
    await user.type(apiKeyInput, 'sk-updated-secret');

    const saveButton = within(dialog).getByRole('button', { name: 'Save Changes' });
    await user.click(saveButton);

    await waitFor(() => expect(notifyMocks.success).toHaveBeenCalledWith('Credential updated'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Edit Credential/i })).not.toBeInTheDocument());
  });

  it('deletes a credential via the confirmation dialog', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
      http.delete(abs('/api/settings/llm/credentials/openai-prod'), () => {
        credentialRecords.splice(0, credentialRecords.length);
        return HttpResponse.json({ success: true });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-prod');

    const deleteButton = screen.getByLabelText('Delete credential openai-prod');
    await user.click(deleteButton);

    const confirmDialog = await screen.findByRole('dialog');
    const confirmButton = within(confirmDialog).getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    await waitFor(() => expect(notifyMocks.success).toHaveBeenCalledWith('Credential deleted'));
    await waitFor(() => expect(screen.queryByTestId('llm-credential-row-openai-prod')).not.toBeInTheDocument());
  });

  it('derives model provider metadata from the selected credential', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
      {
        provider: 'Anthropic',
        provider_display_name: 'Anthropic',
        litellm_provider: 'anthropic',
        credential_fields: [
          { key: 'api_key', label: 'Anthropic API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'claude-3-opus',
      },
    ];

    const credentialRecords = [
      {
        credential_name: 'openai-default',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****openai' },
      },
      {
        credential_name: 'zz-anthropic-legacy',
        credential_info: { custom_llm_provider: 'anthropic' },
        credential_values: { api_key: 'sk****anthropic' },
      },
    ];

    const modelRecords: unknown[] = [];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: modelRecords })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
      http.post(abs('/api/settings/llm/models'), async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          provider: string;
          model: string;
          credentialName: string;
          mode?: string;
        };
        expect(body).toMatchObject({
          name: 'anthropic-support',
          provider: 'anthropic',
          model: 'claude-3-opus',
          credentialName: 'zz-anthropic-legacy',
        });
        modelRecords.push({
          model_name: body.name,
          litellm_params: {
            model: body.model,
            custom_llm_provider: body.provider,
            litellm_credential_name: body.credentialName,
          },
          model_info: { id: body.name, mode: body.mode ?? 'chat' },
        });
        return HttpResponse.json({
          model_name: body.name,
          litellm_params: {
            model: body.model,
            custom_llm_provider: body.provider,
            litellm_credential_name: body.credentialName,
          },
          model_info: { id: body.name, mode: body.mode ?? 'chat' },
        });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-default');

    const modelsTab = screen.getByRole('tab', { name: 'Models' });
    await user.click(modelsTab);

    const addModelButton = await screen.findByRole('button', { name: 'Add Model' });
    await user.click(addModelButton);

    const dialog = await screen.findByRole('dialog', { name: /Create Model/i });
    expect(within(dialog).queryByLabelText('Provider')).toBeNull();

    const modelInput = within(dialog).getByLabelText('Provider Model Identifier') as HTMLInputElement;
    expect(modelInput.getAttribute('placeholder')).toBe('gpt-4o-mini');

    const credentialCombobox = within(dialog).getByRole('combobox', { name: 'Credential' });
    await user.click(credentialCombobox);
    const credentialOption = await screen.findByRole('option', { name: 'zz-anthropic-legacy' });
    await user.click(credentialOption);

    await waitFor(() => expect(modelInput.getAttribute('placeholder')).toBe('claude-3-opus'));
    expect(
      within(dialog).getByText('Provider derived from credential: Anthropic.'),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText('Model Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'anthropic-support');
    await user.clear(modelInput);
    await user.type(modelInput, 'claude-3-opus');

    const submitButton = within(dialog).getByRole('button', { name: 'Create Model' });
    await user.click(submitButton);

    await waitFor(() => expect(notifyMocks.success).toHaveBeenCalledWith('Model created'));

    await screen.findByTestId('llm-model-row-anthropic-support');
    const createdRow = screen.getByTestId('llm-model-row-anthropic-support');
    expect(within(createdRow).getByText('Anthropic')).toBeInTheDocument();
    expect(within(createdRow).getByText('zz-anthropic-legacy')).toBeInTheDocument();
  });

  it('uses backend-provided health check modes in dialogs', async () => {
    const providers = [
      {
        provider: 'OpenAI',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [
          { key: 'api_key', label: 'OpenAI API Key', field_type: 'password', required: true, placeholder: null, tooltip: null, options: null, default_value: null },
        ],
        default_model_placeholder: 'gpt-4o-mini',
      },
    ];

    const credentialRecords = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk****prod' },
      },
    ];

    const modeOptions = ['audio_speech', 'ocr', 'video_generation'];

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: true,
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(credentialRecords)),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: modeOptions })),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    await screen.findByText('openai-prod');

    const testButton = screen.getByLabelText('Test credential openai-prod');
    await user.click(testButton);

    const dialog = await screen.findByRole('dialog', { name: /Test Credential/i });
    const modeCombobox = within(dialog).getByRole('combobox');
    await waitFor(() => expect(modeCombobox).toBeEnabled());
    await user.click(modeCombobox);
    const listbox = await screen.findByRole('listbox');
    const renderedOptions = within(listbox).getAllByRole('option');
    const optionLabels = renderedOptions.map((option) => option.textContent?.trim());
    expect(optionLabels).toEqual(modeOptions);
    await user.keyboard('{Escape}');
  });

  it('disables admin actions and shows banner when LiteLLM admin auth is missing', async () => {
    const missingConfigPayload = {
      error: 'litellm_missing_config',
      missing: ['LITELLM_BASE_URL', 'LITELLM_MASTER_KEY'],
    } as const;

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: false,
          baseUrl: undefined,
          hasMasterKey: false,
          provider: 'litellm',
          reason: 'missing_env',
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json(missingConfigPayload, { status: 503 })),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json(missingConfigPayload, { status: 503 })),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json(missingConfigPayload, { status: 503 })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    const banner = await screen.findByRole('alert');
    expect(await within(banner).findByText('LiteLLM administration unavailable')).toBeInTheDocument();
    expect(
      await within(banner).findByText(
        'LiteLLM administration requires LITELLM_BASE_URL and LITELLM_MASTER_KEY. Update the platform server environment and restart.',
      ),
    ).toBeInTheDocument();
    expect(await within(banner).findByText('Example configuration:', { exact: false })).toBeInTheDocument();
    expect(
      await within(banner).findByText('LITELLM_BASE_URL=http://127.0.0.1:4000', {
        selector: 'code',
      }),
    ).toBeInTheDocument();
    expect(
      await within(banner).findByText('LITELLM_MASTER_KEY=sk-dev-master-1234', {
        selector: 'code',
      }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText('Replace the master key with your actual secret if it differs.', { exact: false }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('link', { name: 'View the server LiteLLM admin setup guide' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/agynio/platform/blob/main/packages/platform-server/README.md#litellm-admin-setup',
    );

    expect(
      screen.queryByText('No LiteLLM providers detected. Ensure the LiteLLM admin API is reachable and refresh this page.'),
    ).not.toBeInTheDocument();

    const addCredentialButton = await screen.findByRole('button', { name: 'Add Credential' });
    expect(addCredentialButton).toBeDisabled();

    const modelsTab = await screen.findByRole('tab', { name: 'Models' });
    await user.click(modelsTab);

    const addModelButton = await screen.findByRole('button', { name: 'Add Model' });
    expect(addModelButton).toBeDisabled();
  });

  it('disables admin actions and shows banner when LiteLLM admin credentials are invalid', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: false,
          reason: 'unauthorized',
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () =>
        HttpResponse.json({ error: 'litellm_admin_unauthorized' }, { status: 503 }),
      ),
      http.get(abs('/api/settings/llm/credentials'), () =>
        HttpResponse.json({ error: 'litellm_admin_unauthorized' }, { status: 503 }),
      ),
      http.get(abs('/api/settings/llm/models'), () =>
        HttpResponse.json({ error: 'litellm_admin_unauthorized' }, { status: 503 }),
      ),
      http.get(abs('/api/settings/llm/health-check-modes'), () =>
        HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES }),
      ),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    const banner = await screen.findByRole('alert');
    expect(await within(banner).findByText('LiteLLM administration unavailable')).toBeInTheDocument();
    expect(
      await within(banner).findByText('LiteLLM admin authentication failed. Verify the LiteLLM master key.'),
    ).toBeInTheDocument();
    expect(
      await within(banner).findByText('LITELLM_MASTER_KEY=sk-dev-master-1234', { selector: 'code' }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('link', { name: 'View the server LiteLLM admin setup guide' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/agynio/platform/blob/main/packages/platform-server/README.md#litellm-admin-setup',
    );

    const addCredentialButton = await screen.findByRole('button', { name: 'Add Credential' });
    expect(addCredentialButton).toBeDisabled();

    const modelsTab = await screen.findByRole('tab', { name: 'Models' });
    await user.click(modelsTab);
    const addModelButton = await screen.findByRole('button', { name: 'Add Model' });
    expect(addModelButton).toBeDisabled();
  });

  it('disables admin actions and shows banner when LiteLLM admin is unreachable', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: true,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'litellm',
          adminReachable: false,
          reason: 'unreachable',
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json({ error: 'litellm_unreachable' }, { status: 503 })),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json({ error: 'litellm_unreachable' }, { status: 503 })),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ error: 'litellm_unreachable' }, { status: 503 })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    const banner = await screen.findByRole('alert');
    expect(await within(banner).findByText('LiteLLM administration unavailable')).toBeInTheDocument();
    expect(
      await within(banner).findByText((content) =>
        content.includes('LiteLLM admin API at') && content.includes('is unreachable. Verify the base URL'),
      ),
    ).toBeInTheDocument();
    expect(
      await within(banner).findByText('LITELLM_BASE_URL=http://127.0.0.1:4000', { selector: 'code' }),
    ).toBeInTheDocument();

    const addCredentialButton = await screen.findByRole('button', { name: 'Add Credential' });
    expect(addCredentialButton).toBeDisabled();

    const modelsTab = await screen.findByRole('tab', { name: 'Models' });
    await user.click(modelsTab);
    const addModelButton = await screen.findByRole('button', { name: 'Add Model' });
    expect(addModelButton).toBeDisabled();
  });

  it('disables admin actions when the platform is running without LiteLLM provider', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get(abs('/api/settings/llm/admin-status'), () =>
        HttpResponse.json({
          configured: false,
          baseUrl: 'http://127.0.0.1:4000',
          hasMasterKey: true,
          provider: 'openai',
          reason: 'provider_mismatch',
        }),
      ),
      http.get(abs('/api/settings/llm/providers'), () => HttpResponse.json([])),
      http.get(abs('/api/settings/llm/credentials'), () => HttpResponse.json([])),
      http.get(abs('/api/settings/llm/models'), () => HttpResponse.json({ models: [] })),
      http.get(abs('/api/settings/llm/health-check-modes'), () => HttpResponse.json({ modes: DEFAULT_HEALTH_CHECK_MODES })),
    );

    render(
      <TestProviders>
        <SettingsLlm />
      </TestProviders>,
    );

    const banner = await screen.findByRole('alert');
    expect(await within(banner).findByText('LiteLLM administration unavailable')).toBeInTheDocument();
    expect(
      await within(banner).findByText('LiteLLM administration is disabled because the platform server is not running in LiteLLM mode.'),
    ).toBeInTheDocument();
    expect(await within(banner).findByText('LLM_PROVIDER=litellm', { selector: 'code' })).toBeInTheDocument();

    const addCredentialButton = await screen.findByRole('button', { name: 'Add Credential' });
    expect(addCredentialButton).toBeDisabled();

    const modelsTab = await screen.findByRole('tab', { name: 'Models' });
    await user.click(modelsTab);
    const addModelButton = await screen.findByRole('button', { name: 'Add Model' });
    expect(addModelButton).toBeDisabled();
  });

});
