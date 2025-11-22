import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

    // Default filter should be All (shows all known keys)
    await screen.findByRole('button', { name: /^All/i });
    expect(await screen.findByText('secret/github/GH_TOKEN')).toBeInTheDocument();
    expect(await screen.findByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();

    // Create github token inline and save
    const ghRow = screen.getByText('secret/github/GH_TOKEN').closest('tr');
    expect(ghRow).toBeTruthy();
    const createButton = within(ghRow!).getByRole('button', { name: 'Create' });
    fireEvent.click(createButton);
    const editRow = screen.getByDisplayValue('secret/github/GH_TOKEN').closest('tr');
    expect(editRow).toBeTruthy();
    const valueInput = within(editRow!).getAllByRole('textbox')[1] as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: 'topsecret' } });
    const saveBtn = within(editRow!).getByRole('button', { name: /Save secret/i });
    fireEvent.click(saveBtn);

    // After save, missing count should drop to 1 (label updates though Used is active)
    await waitFor(() => expect(screen.getByText(/Missing \(1\)/)).toBeInTheDocument());

    // Toggle to Used: shows only required keys (2 rows)
    fireEvent.click(screen.getByRole('button', { name: /^Used/i }));
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('secret/openai/API_KEY')).toBeInTheDocument();
    expect(screen.queryByText('secret/slack/BOT_TOKEN')).not.toBeInTheDocument();
    // Toggle to All: includes non-required openai key
    fireEvent.click(screen.getByRole('button', { name: /^All/i }));
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

    await screen.findByText(/Vault unavailable/i);
    expect(screen.getByText('secret/slack/BOT_TOKEN')).toBeInTheDocument();
  });

  it('allows inline editing and cancel resets the draft value', async () => {
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
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    const editBtn = await screen.findByRole('button', { name: /Edit secret/i });
    fireEvent.click(editBtn);
    const editRow = screen.getByDisplayValue('secret/github/GH_TOKEN').closest('tr');
    expect(editRow).toBeTruthy();
    const valueInput = within(editRow!).getAllByRole('textbox')[1] as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: 'gh-secret' } });

    const cancelBtn = within(editRow!).getByRole('button', { name: /Cancel editing/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => expect(screen.queryByDisplayValue('gh-secret')).not.toBeInTheDocument());
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
  });

  it('allows creating a missing secret inline and updates counts', async () => {
    // Graph with one required
    server.use(
      http.get(abs('/api/graph'), () =>
        HttpResponse.json({ name: 'g', version: 1, updatedAt: new Date().toISOString(), nodes: [
          { id: 'n1', template: 'githubCloneRepoTool', config: { token: { value: 'secret/github/GH_TOKEN', source: 'vault' } } },
        ], edges: [] }),
      ),
    );
    let ghKeys: string[] = [];
    server.use(
      http.get(abs('/api/vault/mounts'), () => HttpResponse.json({ items: ['secret'] })),
      http.get(abs('/api/vault/kv/:mount/paths'), () => HttpResponse.json({ items: ['github'] })),
      http.get(abs('/api/vault/kv/:mount/keys'), () => HttpResponse.json({ items: ghKeys })),
      http.post(abs('/api/vault/kv/:mount/write'), async ({ request }) => {
        const body = (await request.json()) as { path: string; key: string; value: string };
        if (body.path === 'github') ghKeys = Array.from(new Set([...ghKeys, body.key]));
        return HttpResponse.json({ mount: 'secret', path: body.path, key: body.key, version: Date.now() });
      }),
    );

    render(
      <TestProviders>
        <SettingsSecrets />
      </TestProviders>,
    );

    const createBtn = await screen.findByRole('button', { name: 'Create' });
    fireEvent.click(createBtn);

    const editRow = screen.getByDisplayValue('secret/github/GH_TOKEN').closest('tr');
    expect(editRow).toBeTruthy();
    const valueInput = within(editRow!).getAllByRole('textbox')[1] as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: 'super-secret' } });
    const saveBtn = within(editRow!).getByRole('button', { name: /Save secret/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText(/Missing \(0\)/)).toBeInTheDocument());
    expect(screen.getByText('secret/github/GH_TOKEN')).toBeInTheDocument();
  });
});
