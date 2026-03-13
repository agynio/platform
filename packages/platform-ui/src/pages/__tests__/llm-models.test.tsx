import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
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
          <Route path="/settings/llm/models" element={<LLMModelsListPage />} />
          <Route path="/settings/llm/models/new" element={<LLMModelUpsertPage mode="create" />} />
          <Route path="/settings/llm/models/:modelId/edit" element={<LLMModelUpsertPage mode="edit" />} />
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
      { id: 'provider-1', endpoint: 'https://api.alpha.com', authMethod: 'bearer' },
    ];
    const models = [
      { id: 'model-1', name: 'assistant', llmProviderId: 'provider-1', remoteName: 'gpt-4o-mini' },
    ];

    server.use(
      http.get(abs('/llm/v1/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/llm/v1/models'), () => HttpResponse.json(models)),
    );

    renderWithRoutes('/settings/llm/models');

    expect(await screen.findByText('LLM Models')).toBeInTheDocument();
    expect(await screen.findByTestId('llm-model-row-model-1')).toBeInTheDocument();
    expect(screen.getByText('https://api.alpha.com')).toBeInTheDocument();
  });

  it('creates a model from the form', async () => {
    const user = userEvent.setup();
    const providers = [
      { id: 'provider-1', endpoint: 'https://api.alpha.com', authMethod: 'bearer' },
    ];
    let models = [{ id: 'model-1', name: 'assistant', llmProviderId: 'provider-1', remoteName: 'gpt-4o-mini' }];
    let createPayload: Record<string, string> | null = null;

    server.use(
      http.get(abs('/llm/v1/providers'), () => HttpResponse.json(providers)),
      http.get(abs('/llm/v1/models'), () => HttpResponse.json(models)),
      http.post(abs('/llm/v1/models'), async ({ request }) => {
        const payload = (await request.json()) as Record<string, string>;
        createPayload = payload;
        const created = {
          id: 'model-2',
          name: payload.name,
          llmProviderId: payload.llmProviderId,
          remoteName: payload.remoteName,
        };
        models = [...models, created];
        return HttpResponse.json(created);
      }),
    );

    renderWithRoutes('/settings/llm/models/new');

    await user.type(screen.getByLabelText('Name'), 'assistant-preview');
    await user.selectOptions(screen.getByLabelText('Provider'), 'provider-1');
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
});
