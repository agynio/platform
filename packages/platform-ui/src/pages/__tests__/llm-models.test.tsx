import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { LLMModelsListPage } from '../LLMModelsListPage';
import { LLMModelUpsertPage } from '../LLMModelUpsertPage';

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

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

function renderWithRoutes(initialEntry: string) {
  return render(
    <TestProviders>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/llm-models" element={<LLMModelsListPage />} />
          <Route path="/llm-models/new" element={<LLMModelUpsertPage mode="create" />} />
          <Route path="/llm-models/:id/edit" element={<LLMModelUpsertPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
}

describe('LLM models pages', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    notifyMocks.success.mockReset();
    notifyMocks.error.mockReset();
  });

  it('renders model list rows with provider names', async () => {
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    const models = [
      {
        id: 'model-1',
        name: 'assistant',
        llmProviderId: 'provider-1',
        remoteName: 'gpt-4o-mini',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];

    server.use(
      http.get(abs('/apiv2/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 100, total: providers.length }),
      ),
      http.get(abs('/apiv2/llm/v1/models'), () =>
        HttpResponse.json({ items: models, page: 1, perPage: 20, total: models.length }),
      ),
    );

    renderWithRoutes('/llm-models');

    expect(await screen.findByText('LLM Models')).toBeInTheDocument();
    expect(await screen.findByTestId('llm-model-row-model-1')).toBeInTheDocument();
    expect(screen.getByText('https://api.alpha.com')).toBeInTheDocument();
  });

  it('creates a model from the form', async () => {
    const user = userEvent.setup();
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    let models = [
      {
        id: 'model-1',
        name: 'assistant',
        llmProviderId: 'provider-1',
        remoteName: 'gpt-4o-mini',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    let createPayload: Record<string, string> | null = null;

    server.use(
      http.get(abs('/apiv2/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 100, total: providers.length }),
      ),
      http.get(abs('/apiv2/llm/v1/models'), () =>
        HttpResponse.json({ items: models, page: 1, perPage: 20, total: models.length }),
      ),
      http.post(abs('/apiv2/llm/v1/models'), async ({ request }) => {
        const payload = (await request.json()) as Record<string, string>;
        createPayload = payload;
        const created = {
          id: 'model-2',
          name: payload.name,
          llmProviderId: payload.llmProviderId,
          remoteName: payload.remoteName,
          createdAt: '2024-02-03T00:00:00.000Z',
          updatedAt: '2024-02-03T00:00:00.000Z',
        };
        models = [...models, created];
        return HttpResponse.json(created);
      }),
    );

    renderWithRoutes('/llm-models/new');

    await user.type(screen.getByLabelText('Name'), 'assistant-preview');
    const providerSelect = screen.getByRole('combobox', { name: 'Provider' });
    await user.click(providerSelect);
    await user.click(await screen.findByRole('option', { name: 'https://api.alpha.com' }));
    await user.type(screen.getByLabelText('Remote name'), 'gpt-4o-mini-preview');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createPayload).toEqual({
        name: 'assistant-preview',
        llmProviderId: 'provider-1',
        remoteName: 'gpt-4o-mini-preview',
      });
    });

    expect(await screen.findByText('LLM Models')).toBeInTheDocument();
    expect(await screen.findByText('assistant-preview')).toBeInTheDocument();
  });

  it('loads existing model values on edit', async () => {
    const user = userEvent.setup();
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    const model = {
      id: 'model-1',
      name: 'assistant',
      llmProviderId: 'provider-1',
      remoteName: 'gpt-4o-mini',
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-02T00:00:00.000Z',
    };

    server.use(
      http.get(abs('/apiv2/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 100, total: providers.length }),
      ),
      http.get(abs('/apiv2/llm/v1/models/:modelId'), () => HttpResponse.json(model)),
    );

    renderWithRoutes('/llm-models/model-1/edit');

    expect(await screen.findByLabelText('Name')).toHaveValue('assistant');
    const providerSelect = screen.getByRole('combobox', { name: 'Provider' });
    await user.click(providerSelect);
    const providerOption = await screen.findByRole('option', { name: 'https://api.alpha.com' });
    await user.click(providerOption);
    expect(screen.getByLabelText('Remote name')).toHaveValue('gpt-4o-mini');
  });

  it('deletes a model after confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    let models = [
      {
        id: 'model-1',
        name: 'assistant',
        llmProviderId: 'provider-1',
        remoteName: 'gpt-4o-mini',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
      {
        id: 'model-2',
        name: 'assistant-2',
        llmProviderId: 'provider-1',
        remoteName: 'gpt-4o-mini-2',
        createdAt: '2024-02-03T00:00:00.000Z',
        updatedAt: '2024-02-04T00:00:00.000Z',
      },
    ];

    server.use(
      http.get(abs('/apiv2/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 100, total: providers.length }),
      ),
      http.get(abs('/apiv2/llm/v1/models'), () =>
        HttpResponse.json({ items: models, page: 1, perPage: 20, total: models.length }),
      ),
      http.delete(abs('/apiv2/llm/v1/models/:modelId'), ({ params }) => {
        models = models.filter((model) => model.id !== params.modelId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithRoutes('/llm-models');

    const row = await screen.findByTestId('llm-model-row-model-1');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByTestId('llm-model-row-model-1')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('blocks empty submit with validation errors', async () => {
    const user = userEvent.setup();
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];

    server.use(
      http.get(abs('/apiv2/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 100, total: providers.length }),
      ),
    );

    renderWithRoutes('/llm-models/new');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(await screen.findByText('Select a provider.')).toBeInTheDocument();
    expect(await screen.findByText('Remote name is required.')).toBeInTheDocument();
  });
});
