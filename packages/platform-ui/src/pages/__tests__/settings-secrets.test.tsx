import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { SettingsSecrets } from '../../pages/SettingsSecrets';

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

describe('Settings/Secrets page', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    notifyMocks.success.mockReset();
    notifyMocks.error.mockReset();
  });

  it('allows creating missing secrets and updates counts', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
            { id: 'n2', template: 'sendSlackMessageTool', config: { bot_token: { value: 'secret/slack/BOT_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );

    let ghKeys: string[] = [];
    let slackKeys: string[] = [];
    const openaiKeys: string[] = ['API_KEY'];
    const vaultValues = new Map<string, string>([['secret/openai/API_KEY', 'openai-secret']]);
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), ({ request }) => {
        const url = new URL(request.url);
        const prefix = url.searchParams.get('prefix') || '';
        if (prefix) return HttpResponse.json({ items: [] });
        return HttpResponse.json({ items: ['github', 'slack', 'openai'] });
      }),
      http.get(abs('/api/vault/kv/:mount/keys'), ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get('path');
        if (path === 'github') return HttpResponse.json({ items: ghKeys });
        if (path === 'slack') return HttpResponse.json({ items: slackKeys });
        if (path === 'openai') return HttpResponse.json({ items: openaiKeys });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/vault/kv/:mount/read'), ({ params, request }) => {
        const mount = params.mount as string;
        const url = new URL(request.url);
        const path = url.searchParams.get('path') || '';
        const key = url.searchParams.get('key') || '';
        const keyPath = path ? `${mount}/${path}/${key}` : `${mount}/${key}`;
        const value = vaultValues.get(keyPath) ?? '';
        return HttpResponse.json({ value });
      }),
      http.post(abs('/api/vault/kv/:mount/write'), async ({ request, params }) => {
        const body = (await request.json()) as { path: string; key: string; value: string };
        if (body.path === 'github') ghKeys = Array.from(new Set([...ghKeys, body.key]));
        if (body.path === 'slack') slackKeys = Array.from(new Set([...slackKeys, body.key]));
        const mount = params.mount as string;
        const keyPath = body.path ? `${mount}/${body.path}/${body.key}` : `${mount}/${body.key}`;
        vaultValues.set(keyPath, body.value);
        return HttpResponse.json({ mount: 'secret', path: body.path, key: body.key, version: Date.now() });
      }),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('secret/github/GH_TOKEN', undefined, { timeout: 6000 });
    await screen.findByText('secret/openai/API_KEY');
    expect(screen.getByRole('button', { name: /Missing \(2\)/ })).toBeInTheDocument();

    const githubRow = screen.getByText('secret/github/GH_TOKEN').closest('tr');
    expect(githubRow).not.toBeNull();

    const createButton = within(githubRow as HTMLTableRowElement).getByRole('button', { name: 'Create' });
    fireEvent.click(createButton);

    const inputs = within(githubRow as HTMLTableRowElement).getAllByRole('textbox');
    fireEvent.change(inputs[1], { target: { value: 'topsecret' } });

    const saveButton = within(githubRow as HTMLTableRowElement).getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByRole('button', { name: /Missing \(1\)/ })).toBeInTheDocument());
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('secret/openai/API_KEY')).toBeInTheDocument();
  });

  it('shows banner when Vault unavailable and still lists graph-required keys', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'sendSlackMessageTool', config: { bot_token: { value: 'secret/slack/BOT_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );
    server.use(http.get(abs('/api/vault/mounts'), () => new HttpResponse(null, { status: 500 })));

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText(/Vault (error|not configured)/);
    expect(screen.getByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();
  });

  it('prevents renaming secrets and requires a value before saving', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );
    const vaultValues = new Map<string, string>([['secret/github/GH_TOKEN', 'existing-secret']]);
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.get(abs('/api/vault/kv/:mount/read'), ({ params }) => {
        const mount = params.mount as string;
        const value = vaultValues.get(`${mount}/github/GH_TOKEN`) ?? '';
        return HttpResponse.json({ value });
      }),
      http.post(abs('/api/vault/kv/:mount/write'), async ({ request, params }) => {
        const body = (await request.json()) as { path: string; key: string; value: string };
        const mount = params.mount as string;
        const keyPath = body.path ? `${mount}/${body.path}/${body.key}` : `${mount}/${body.key}`;
        vaultValues.set(keyPath, body.value);
        return HttpResponse.json({ mount: 'secret', path: body.path, key: body.key, version: 1 });
      }),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('secret/github/GH_TOKEN');
    const row = screen.getByText('secret/github/GH_TOKEN').closest('tr');
    expect(row).not.toBeNull();
    const secretRow = row as HTMLTableRowElement;

    const maskedValue = '•'.repeat('existing-secret'.length);
    expect(within(secretRow).getByText(maskedValue)).toBeInTheDocument();

    const toggleButton = within(secretRow).getByRole('button', { name: 'Unmask' });
    fireEvent.click(toggleButton);
    await within(secretRow).findByText('existing-secret');

    const maskButton = within(secretRow).getByRole('button', { name: 'Mask' });
    fireEvent.click(maskButton);

    const editButton = within(secretRow).getByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);

    const keyInput = await within(secretRow).findByDisplayValue('secret/github/GH_TOKEN');
    const valueInput = within(secretRow).getByDisplayValue('existing-secret');
    expect(valueInput).toHaveValue('existing-secret');

    fireEvent.change(valueInput, { target: { value: 'updated-secret' } });
    fireEvent.change(keyInput, { target: { value: 'secret/github/RENAMED' } });

    notifyMocks.error.mockClear();
    const notifyErrorSpy = notifyMocks.error;

    const saveButton = within(secretRow).getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(notifyErrorSpy).toHaveBeenCalledTimes(1));
    expect(notifyErrorSpy).toHaveBeenNthCalledWith(1, 'Renaming secrets is not supported yet');

    const editButtonAfterError = await within(secretRow).findByRole('button', { name: 'Edit' });
    fireEvent.click(editButtonAfterError);

    await within(secretRow).findByDisplayValue('secret/github/GH_TOKEN');
    const valueInputAfter = within(secretRow).getByDisplayValue('existing-secret');
    const saveButtonAfter = within(secretRow).getByRole('button', { name: 'Save' });
    expect(saveButtonAfter).not.toBeDisabled();
    expect(notifyErrorSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(valueInputAfter, { target: { value: '' } });
    expect(saveButtonAfter).toBeDisabled();

    fireEvent.change(valueInputAfter, { target: { value: 'new-value' } });
    expect(saveButtonAfter).not.toBeDisabled();
    fireEvent.click(saveButtonAfter);

    await within(secretRow).findByRole('button', { name: 'Edit' });
    expect(notifyErrorSpy).toHaveBeenCalledTimes(1);

    const revealButton = within(secretRow).getByRole('button', { name: 'Unmask' });
    fireEvent.click(revealButton);
    await within(secretRow).findByText('new-value');
  });

  it('shows a warning when reading an existing secret value fails', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.get(abs('/api/vault/kv/:mount/read'), () => new HttpResponse(null, { status: 500 })),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('Failed to read 1 secret value(s). Showing placeholders.', undefined, { timeout: 6000 });
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
  });

  it('treats 404 value reads as placeholders without showing a warning', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.get(abs('/api/vault/kv/:mount/read'), () => HttpResponse.json({ message: 'not found' }, { status: 404 })),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    const secretCell = await screen.findByText('secret/github/GH_TOKEN', undefined, { timeout: 6000 });
    const secretRow = secretCell.closest('tr');
    expect(secretRow).not.toBeNull();

    expect(screen.queryByText('Failed to read 1 secret value(s). Showing placeholders.')).not.toBeInTheDocument();

    const valueCell = within(secretRow as HTMLTableRowElement).getAllByRole('cell')[1];
    expect(valueCell.textContent?.trim()).toBe('');

    const unmaskButton = within(secretRow as HTMLTableRowElement).getByRole('button', { name: 'Unmask' });
    fireEvent.click(unmaskButton);
    await waitFor(() => expect(valueCell.textContent?.trim()).toBe(''));
  });

  it('retries hydration and surfaces aggregated failure counts', async () => {
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          updatedAt: new Date().toISOString(),
          nodes: [
            { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
            { id: 'n2', template: 'sendSlackMessageTool', config: { bot_token: { value: 'secret/slack/BOT_TOKEN', source: 'vault' } } },
          ],
          edges: [],
        }),
      ),
    );

    let readAttempts = 0;
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github', 'slack'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get('path');
        if (path === 'github') return HttpResponse.json({ items: ['GH_TOKEN'] });
        if (path === 'slack') return HttpResponse.json({ items: ['BOT_TOKEN'] });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/vault/kv/:mount/read'), () => {
        readAttempts += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('secret/github/GH_TOKEN', undefined, { timeout: 6000 });
    await screen.findByText('secret/slack/BOT_TOKEN', undefined, { timeout: 6000 });
    await screen.findByText('Failed to read 2 secret value(s). Showing placeholders.', undefined, { timeout: 6000 });

    expect(readAttempts).toBeGreaterThanOrEqual(6);
  });
});
