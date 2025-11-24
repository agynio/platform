import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { SettingsSecrets } from '../../pages/SettingsSecrets';

describe('Settings/Secrets page', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

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
      http.post(abs('/api/vault/kv/:mount/write'), async ({ request }) => {
        const body = (await request.json()) as { path: string; key: string; value: string };
        if (body.path === 'github') ghKeys = Array.from(new Set([...ghKeys, body.key]));
        if (body.path === 'slack') slackKeys = Array.from(new Set([...slackKeys, body.key]));
        return HttpResponse.json({ mount: 'secret', path: body.path, key: body.key, version: Date.now() });
      }),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('secret/github/GH_TOKEN');
    expect(screen.getByRole('button', { name: /Missing \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText('secret/openai/API_KEY')).toBeInTheDocument();

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
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.post(abs('/api/vault/kv/:mount/write'), () => HttpResponse.json({ mount: 'secret', path: 'github', key: 'GH_TOKEN', version: 1 })),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText('secret/github/GH_TOKEN');
    const editButton = await screen.findByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);

    const row = screen.getByText('secret/github/GH_TOKEN').closest('tr');
    expect(row).not.toBeNull();

    const inputs = within(row as HTMLTableRowElement).getAllByRole('textbox');
    const keyInput = inputs[0];
    const valueInput = inputs[1];

    fireEvent.change(keyInput, { target: { value: 'secret/github/RENAMED' } });

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const saveButton = within(row as HTMLTableRowElement).getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Renaming secrets is not supported yet'));

    fireEvent.change(keyInput, { target: { value: 'secret/github/GH_TOKEN' } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Secret value is required'));

    fireEvent.change(valueInput, { target: { value: 'new-value' } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument());
    expect(alertSpy).toHaveBeenCalledTimes(2);

    alertSpy.mockRestore();
  });
});
