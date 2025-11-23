import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { SettingsSecrets } from '../../pages/SettingsSecrets';

describe('Settings/Secrets page', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('defaults to Used filter; allows inline write to create key; All shows union', async () => {
    // Mock graph with two required secrets
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

    // Vault discovery: mounts and paths; start with no keys existing
    let ghKeys: string[] = [];
    let slackKeys: string[] = [];
    const openaiKeys: string[] = ['API_KEY']; // non-required key to verify 'All' filter includes non-required
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
        // Simulate write by updating in-memory arrays
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

    // Default filter should be Used (shows required keys regardless of presence)
    await screen.findByRole('button', { name: /Used/ });
    expect(await screen.findByText('secret/github/GH_TOKEN')).toBeInTheDocument();
    expect(await screen.findByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();

    // Edit github token inline and save
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    const showBtn = await screen.findByRole('button', { name: 'Show' });
    fireEvent.click(showBtn); // unmask
    const input = await screen.findByPlaceholderText('Enter secret value');
    fireEvent.change(input, { target: { value: 'topsecret' } });
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    // After save, missing count should drop to 1 (label updates though Used is active)
    await waitFor(() => expect(screen.getByText('Missing (1)')).toBeInTheDocument());

    // Toggle to Used: shows only required keys (2 rows)
    fireEvent.click(screen.getByRole('button', { name: /Used/ }));
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();
    // Toggle to All: includes non-required openai key
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(screen.getByText('secret/openai/API_KEY')).toBeInTheDocument();
  });

  it('shows banner when Vault unavailable and still lists graph-required keys', async () => {
    // Mock graph with one required secret
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({
          name: 'g', version: 1, updatedAt: new Date().toISOString(), nodes: [
            { id: 'n1', template: 'sendSlackMessageTool', config: { bot_token: { value: 'secret/slack/BOT_TOKEN', source: 'vault' } } },
          ], edges: []
        }),
      ),
    );
    // Vault mounts error (simulate unavailable)
    server.use(http.get(abs('/api/vault/mounts'), () => new HttpResponse(null, { status: 500 })));

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    await screen.findByText(/Vault (error|not configured)/);
    expect(screen.getByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();
  });

  it('fetches value on reveal/edit and clears plaintext on cancel', async () => {
    // Graph with one required
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({ name: 'g', version: 1, updatedAt: new Date().toISOString(), nodes: [
          { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
        ], edges: [] }),
      ),
    );
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.get(abs('/api/vault/kv/:mount/read'), () => HttpResponse.json({ value: 'gh-secret' })),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    // Click Edit to fetch
    const editBtn = await screen.findByRole('button', { name: 'Edit' });
    fireEvent.click(editBtn);

    // Toggle Show to unmask and verify fetched value appears
    const showBtn = await screen.findByRole('button', { name: 'Show' });
    fireEvent.click(showBtn);

    const input = await screen.findByPlaceholderText('Enter secret value');
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('gh-secret'));

    // Cancel clears plaintext
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByDisplayValue('gh-secret')).not.toBeInTheDocument();
  });

  it('shows neutral message on missing secret (404) and keeps input empty', async () => {
    // Graph with one required
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({ name: 'g', version: 1, updatedAt: new Date().toISOString(), nodes: [
          { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
        ], edges: [] }),
      ),
    );
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ['GH_TOKEN'] })),
      http.get(abs('/api/vault/kv/:mount/read'), () => new HttpResponse(null, { status: 404 })),
    );

    // Spy on alert to capture notifyError
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    // Click Edit to attempt fetch
    const editBtn = await screen.findByRole('button', { name: 'Edit' });
    fireEvent.click(editBtn);

    // Toggle Show to trigger fetch on reveal if needed
    const showBtn = await screen.findByRole('button', { name: 'Show' });
    fireEvent.click(showBtn);

    // Expect neutral message and empty input
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('No value available');
    });
    const input = await screen.findByPlaceholderText('Enter secret value');
    expect((input as HTMLInputElement).value).toBe('');

    alertSpy.mockRestore();
  });
});
