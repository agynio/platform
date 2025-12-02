import { test, expect } from '@playwright/test';

type ThreadFixture = {
  id: string;
  alias: string;
  summary: string;
  createdAt: string;
  metrics: { remindersCount: number; containersCount: number; activity: 'working' | 'waiting' | 'idle'; runsCount: number };
};

type RunFixture = {
  id: string;
  threadId: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('Threads conversation guards', () => {
  // TODO(#1031): Unskip once virtualization guard prevents undefined index crash.
  test.fixme('avoids react-virtuoso undefined index crash during rapid switches', async ({ page }) => {
    const now = new Date('2024-01-01T12:00:00Z').toISOString();

    const threads: ThreadFixture[] = [
      {
        id: 'thread-alpha',
        alias: 'alpha',
        summary: 'Thread Alpha',
        createdAt: now,
        metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 },
      },
      {
        id: 'thread-beta',
        alias: 'beta',
        summary: 'Thread Beta',
        createdAt: now,
        metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 },
      },
    ];

    const runsByThread: Record<string, RunFixture[]> = {
      'thread-alpha': [
        { id: 'run-alpha-1', threadId: 'thread-alpha', status: 'finished', createdAt: now, updatedAt: now },
      ],
      'thread-beta': [
        { id: 'run-beta-1', threadId: 'thread-beta', status: 'finished', createdAt: now, updatedAt: now },
      ],
    };

    const runMessages: Record<string, Record<string, unknown>> = {
      'run-alpha-1': {
        output: {
          items: [
            {
              id: 'alpha-msg-1',
              kind: 'assistant',
              text: 'Alpha response ready.',
              source: null,
              createdAt: now,
            },
          ],
        },
        input: { items: [] },
        injected: { items: [] },
      },
      'run-beta-1': {
        output: {
          items: [
            {
              id: 'beta-msg-1',
              kind: 'assistant',
              text: 'Beta response ready.',
              source: null,
              createdAt: now,
            },
          ],
        },
        input: { items: [] },
        injected: { items: [] },
      },
    };

    const metricsByThread = Object.fromEntries(
      threads.map((thread) => [thread.id, { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 }]),
    );

    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => {
      consoleErrors.push(error instanceof Error ? error.message : String(error));
      console.log('[pageerror]', error);
    });
    page.on('console', (message) => {
      (async () => {
        const args = await Promise.all(message.args().map(async (arg) => {
          try {
            return await arg.jsonValue();
          } catch (_err) {
            return String(arg);
          }
        }));
        console.log('[console]', message.type(), message.text(), args);
        if (message.type() === 'error' || message.type() === 'warning') {
          consoleErrors.push(`${message.text()} ${JSON.stringify(args)}`);
        }
      })().catch(() => {});
    });

    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        console.log('> ', request.method(), request.url());
      }
    });

    await page.route('**/socket.io/**', (route) => route.abort());

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const rawUrl = request.url();
      const method = request.method();
      const url = new URL(rawUrl, 'http://127.0.0.1:4173');
      const path = url.pathname;

      console.log('[api]', method, path);

      if (!path.startsWith('/api/')) {
        await route.continue();
        return;
      }

      const fulfill = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        });

      if (path === '/api/agents/threads' && method === 'GET') {
        fulfill({ items: threads });
        return;
      }

      if (path === '/api/graph/templates' && method === 'GET') {
        fulfill([]);
        return;
      }

      if (path === '/api/containers' && method === 'GET') {
        fulfill({ items: [] });
        return;
      }

      if (path === '/api/agents/reminders' && method === 'GET') {
        fulfill({ items: [] });
        return;
      }

      const threadMatch = path.match(/^\/api\/agents\/threads\/([^/]+)(?:\/(.*))?$/);
      if (threadMatch) {
        const threadId = decodeURIComponent(threadMatch[1]);
        const subPath = threadMatch[2];

        if (!subPath && method === 'GET') {
          const thread = threads.find((item) => item.id === threadId);
          fulfill(thread ?? { id: threadId, alias: threadId, summary: 'Unknown thread', createdAt: now });
          return;
        }

        if (subPath === 'children' && method === 'GET') {
          fulfill({ items: [] });
          return;
        }

        if (subPath === 'metrics' && method === 'GET') {
          fulfill(metricsByThread[threadId] ?? metricsByThread['thread-alpha']);
          return;
        }

        if (subPath === 'runs' && method === 'GET') {
          await delay(500);
          fulfill({ items: runsByThread[threadId] ?? [] });
          return;
        }

        if (subPath === 'reminders' && method === 'GET') {
          fulfill({ items: [] });
          return;
        }
      }

      const runMatch = path.match(/^\/api\/agents\/runs\/([^/]+)\/messages$/);
      if (runMatch && method === 'GET') {
        const runId = decodeURIComponent(runMatch[1]);
        const type = url.searchParams.get('type') ?? 'output';
        await delay(500);
        const bucket = runMessages[runId] ?? { input: { items: [] }, output: { items: [] }, injected: { items: [] } };
        const payload = bucket[type] ?? { items: [] };
        fulfill(payload);
        return;
      }

      if (path.startsWith('/api/agents/runs/') && path.endsWith('/summary') && method === 'GET') {
        fulfill({
          runId: path.split('/')[4] ?? '',
          threadId: path.split('/')[4] ?? '',
          status: 'finished',
          createdAt: now,
          updatedAt: now,
          firstEventAt: now,
          lastEventAt: now,
          countsByType: {},
          countsByStatus: {},
          totalEvents: 0,
        });
        return;
      }

      if (path.startsWith('/api/agents/runs/') && path.endsWith('/events') && method === 'GET') {
        fulfill({ items: [], nextCursor: null });
        return;
      }

      if (path.startsWith('/api/graph/')) {
        fulfill({ status: 'ok' });
        return;
      }

      fulfill({ ok: true });
    });

    await page.goto('/agents/threads?debug=1');

    await page.waitForLoadState('networkidle');
    console.log('[page url]', page.url());
    const bodySnapshot = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('[body snapshot]', bodySnapshot);
    const htmlSnapshot = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log('[html snapshot]', htmlSnapshot);
    const buttonLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((btn) => ({ text: btn.innerText, name: btn.getAttribute('name'), role: btn.getAttribute('role') })),
    );
    console.log('[buttons]', buttonLabels);

    const alphaThreadItem = page.getByText('Thread Alpha', { exact: true }).first();
    const betaThreadItem = page.getByText('Thread Beta', { exact: true }).first();

    await alphaThreadItem.click();
    await page.waitForTimeout(50);
    await betaThreadItem.click();
    await page.waitForTimeout(250);
    const betaVisible = await page.evaluate(() => document.body.innerText.includes('Beta response ready.'));
    console.log('[beta visible check]', betaVisible);
    console.log('[console errors mid]', consoleErrors);

    const loader = page.locator('[data-testid="conversation-loader"]');
    await expect(loader).toBeVisible();

    await page.waitForSelector('text=Beta response ready.');

    await expect(loader).toHaveCount(0);
    await expect(page.getByText('Beta response ready.')).toBeVisible();

    await expect.poll(async () => {
      return page.evaluate(() => {
        const scroller = document.querySelector('[data-role="virtualized-scroller"]') as HTMLElement | null;
        if (!scroller) return false;
        const remaining = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
        return Math.abs(remaining) <= 2;
      });
    }).toBeTruthy();

    await alphaThreadItem.click();

    await expect(page.getByText('Alpha response ready.')).toBeVisible();
    await expect(loader).toHaveCount(0);

    expect(consoleErrors.filter((msg) => msg.includes('Cannot read properties of undefined (reading "index")'))).toHaveLength(0);
    expect(consoleErrors.filter((msg) => /TypeError/i.test(msg))).toHaveLength(0);
  });
});
