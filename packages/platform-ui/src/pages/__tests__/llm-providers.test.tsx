import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { LLMProvidersListPage } from '../LLMProvidersListPage';
import { LLMProviderUpsertPage } from '../LLMProviderUpsertPage';

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
          <Route path="/settings/llm/providers" element={<LLMProvidersListPage />} />
          <Route path="/settings/llm/providers/new" element={<LLMProviderUpsertPage mode="create" />} />
          <Route path="/settings/llm/providers/:providerId/edit" element={<LLMProviderUpsertPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
}

describe('LLM providers pages', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    notifyMocks.success.mockReset();
    notifyMocks.error.mockReset();
  });

  it('renders provider list rows', async () => {
    const providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
      {
        id: 'provider-2',
        endpoint: 'https://api.beta.com',
        authMethod: 'bearer',
        createdAt: '2024-02-03T00:00:00.000Z',
        updatedAt: '2024-02-04T00:00:00.000Z',
      },
    ];

    server.use(
      http.get(abs('/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 20, total: providers.length }),
      ),
    );

    renderWithRoutes('/settings/llm/providers');

    expect(await screen.findByText('LLM Providers')).toBeInTheDocument();
    expect(await screen.findByTestId('llm-provider-row-provider-1')).toBeInTheDocument();
    expect(screen.getByText('https://api.alpha.com')).toBeInTheDocument();
  });

  it('creates a provider from the form', async () => {
    const user = userEvent.setup();
    let providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ];
    let createPayload: Record<string, string> | null = null;

    server.use(
      http.get(abs('/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 20, total: providers.length }),
      ),
      http.post(abs('/llm/v1/providers'), async ({ request }) => {
        const payload = (await request.json()) as Record<string, string>;
        createPayload = payload;
        const created = {
          id: 'provider-2',
          endpoint: payload.endpoint,
          authMethod: payload.authMethod,
          createdAt: '2024-02-05T00:00:00.000Z',
          updatedAt: '2024-02-05T00:00:00.000Z',
        };
        providers = [...providers, created];
        return HttpResponse.json(created);
      }),
    );

    renderWithRoutes('/settings/llm/providers/new');

    await user.type(screen.getByLabelText('Endpoint'), 'https://api.new.com');
    await user.type(screen.getByLabelText('Bearer token'), 'token-123');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createPayload).toEqual({
        endpoint: 'https://api.new.com',
        authMethod: 'bearer',
        token: 'token-123',
      });
    });

    expect(await screen.findByText('LLM Providers')).toBeInTheDocument();
    expect(await screen.findByText('https://api.new.com')).toBeInTheDocument();
  });

  it('loads existing provider values on edit', async () => {
    const provider = {
      id: 'provider-1',
      endpoint: 'https://api.alpha.com',
      authMethod: 'bearer',
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-02T00:00:00.000Z',
    };

    server.use(
      http.get(abs('/llm/v1/providers/:providerId'), () => HttpResponse.json(provider)),
    );

    renderWithRoutes('/settings/llm/providers/provider-1/edit');

    expect(await screen.findByLabelText('Endpoint')).toHaveValue('https://api.alpha.com');
    expect(screen.getByLabelText('Authentication method')).toHaveValue('bearer');
  });

  it('deletes a provider after confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let providers = [
      {
        id: 'provider-1',
        endpoint: 'https://api.alpha.com',
        authMethod: 'bearer',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
      {
        id: 'provider-2',
        endpoint: 'https://api.beta.com',
        authMethod: 'bearer',
        createdAt: '2024-02-03T00:00:00.000Z',
        updatedAt: '2024-02-04T00:00:00.000Z',
      },
    ];

    server.use(
      http.get(abs('/llm/v1/providers'), () =>
        HttpResponse.json({ items: providers, page: 1, perPage: 20, total: providers.length }),
      ),
      http.delete(abs('/llm/v1/providers/:providerId'), ({ params }) => {
        providers = providers.filter((provider) => provider.id !== params.providerId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithRoutes('/settings/llm/providers');

    const row = await screen.findByTestId('llm-provider-row-provider-1');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByTestId('llm-provider-row-provider-1')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('blocks empty submit with validation errors', async () => {
    const user = userEvent.setup();

    renderWithRoutes('/settings/llm/providers/new');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Endpoint is required.')).toBeInTheDocument();
    expect(await screen.findByText('Token is required.')).toBeInTheDocument();
  });
});
