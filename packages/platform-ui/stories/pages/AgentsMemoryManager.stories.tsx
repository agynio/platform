import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { expect } from '@storybook/jest';
import { HttpResponse, http } from 'msw';
import { waitFor, within, userEvent } from '@storybook/testing-library';
import { useEffect } from 'react';

import { AgentsMemoryManager } from '@/pages/AgentsMemoryManager';
import { config } from '@/config';
import { memoryApi } from '@/api/modules/memory';

import { pageHandlers } from '../../.storybook/msw-handlers';
import { withMainLayout } from '../decorators/withMainLayout';

const LONG_CONTENT = Array.from({ length: 400 }, (_, index) =>
  `Paragraph ${index + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.`,
).join('\n\n');

const meta: Meta<typeof AgentsMemoryManager> = {
  title: 'Pages/AgentsMemoryManager',
  component: AgentsMemoryManager,
  decorators: [withMainLayout],
  tags: ['smoke'],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/memory',
      initialEntry: '/agents/memory',
    },
    selectedMenuItem: 'memory',
  },
};

export default meta;

type Story = StoryObj<typeof AgentsMemoryManager>;

const API_BASE_URL = config.apiBaseUrl;

const memoryHandlers = [
  http.get(`${API_BASE_URL}/api/memory/docs`, () =>
    HttpResponse.json({
      items: [{ nodeId: 'alpha', scope: 'global' as const }],
    }),
  ),
  http.get(`${API_BASE_URL}/api/memory/:nodeId/:scope/dump`, ({ params }) => {
    if (params.nodeId !== 'alpha' || params.scope !== 'global') {
      return HttpResponse.json({ nodeId: params.nodeId, scope: params.scope, data: {}, dirs: {} });
    }
    return HttpResponse.json({
      nodeId: 'alpha',
      scope: 'global',
      data: {
        '/': '',
        '/long-doc': LONG_CONTENT,
      },
      dirs: {},
    });
  }),
  http.get(`${API_BASE_URL}/api/memory/:nodeId/:scope/stat`, ({ params, request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') ?? '/';
    if (params.nodeId !== 'alpha' || params.scope !== 'global') {
      return HttpResponse.json({ exists: false, hasSubdocs: false, contentLength: 0 });
    }
    if (path === '/long-doc') {
      return HttpResponse.json({ exists: true, hasSubdocs: false, contentLength: LONG_CONTENT.length });
    }
    if (path === '/' || path === '') {
      return HttpResponse.json({ exists: true, hasSubdocs: true, contentLength: 0 });
    }
    return HttpResponse.json({ exists: false, hasSubdocs: false, contentLength: 0 });
  }),
  http.get(`${API_BASE_URL}/api/memory/:nodeId/:scope/read`, ({ params, request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') ?? '/';
    if (params.nodeId === 'alpha' && params.scope === 'global' && path === '/long-doc') {
      return HttpResponse.json({ content: LONG_CONTENT });
    }
    return HttpResponse.json({ content: '' });
  }),
];

const withMemoryApiMocks: Decorator = (Story) => {
  useEffect(() => {
    const original = {
      listDocs: memoryApi.listDocs,
      dump: memoryApi.dump,
      stat: memoryApi.stat,
      read: memoryApi.read,
    };

    memoryApi.listDocs = async () => ({ items: [{ nodeId: 'alpha', scope: 'global' as const }] });
    memoryApi.dump = async (nodeId, scope) => {
      if (nodeId !== 'alpha' || scope !== 'global') {
        return { nodeId, scope, data: {}, dirs: {} } as unknown as Awaited<ReturnType<typeof original.dump>>;
      }
      return {
        nodeId: 'alpha',
        scope: 'global',
        data: {
          '/': '',
          '/long-doc': LONG_CONTENT,
        },
        dirs: {},
      } as unknown as Awaited<ReturnType<typeof original.dump>>;
    };
    memoryApi.stat = async (nodeId, scope, _threadId, path) => {
      if (nodeId !== 'alpha' || scope !== 'global') {
        return { exists: false, hasSubdocs: false, contentLength: 0 };
      }
      if (path === '/long-doc') {
        return { exists: true, hasSubdocs: false, contentLength: LONG_CONTENT.length };
      }
      if (path === '/' || path === '') {
        return { exists: true, hasSubdocs: true, contentLength: 0 };
      }
      return { exists: false, hasSubdocs: false, contentLength: 0 };
    };
    memoryApi.read = async (nodeId, scope, _threadId, path) => {
      if (nodeId === 'alpha' && scope === 'global' && path === '/long-doc') {
        return { content: LONG_CONTENT };
      }
      return { content: '' };
    };

    return () => {
      memoryApi.listDocs = original.listDocs;
      memoryApi.dump = original.dump;
      memoryApi.stat = original.stat;
      memoryApi.read = original.read;
    };
  }, []);

  return <Story />;
};

export const LongDocument: Story = {
  parameters: {
    msw: {
      handlers: [...memoryHandlers, ...pageHandlers],
    },
  },
  decorators: [withMemoryApiMocks],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    await canvas.findByText('Loading memory nodes…');
    await waitFor(
      () => {
        expect(canvas.queryByText('Loading memory nodes…')).toBeNull();
      },
      { timeout: 5000 },
    );

    const treeItems = await canvas.findAllByRole('treeitem');
    expect(treeItems.map((item) => item.textContent?.trim())).toContain('long-doc');

    const documentNode = await canvas.findByRole('treeitem', { name: 'long-doc' });
    await user.click(documentNode);

    const textarea = (await canvas.findByRole('textbox', { name: 'Document content' })) as HTMLTextAreaElement;
    const heading = canvas.getByRole('heading', { name: 'Document content' });
    const scrollContainer = (await canvas.findByTestId('memory-editor-scroll-container')) as HTMLDivElement;

    await waitFor(() => {
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    const filler = document.createElement('div');
    filler.dataset.testid = 'overflow-filler';
    filler.style.height = '2000px';
    filler.style.flexShrink = '0';
    scrollContainer.appendChild(filler);

    const scrollTarget = scrollContainer;

    await step('editor body is scrollable', async () => {
      await waitFor(() => {
        expect(scrollContainer.scrollHeight).toBeGreaterThan(scrollContainer.clientHeight);
      });
    });

    await step('header stays pinned while body scrolls', async () => {
      const initialTop = heading.getBoundingClientRect().top;
      scrollTarget.scrollTop = scrollTarget.scrollHeight;
      await waitFor(() => {
        expect(scrollTarget.scrollTop).toBeGreaterThan(0);
      });
      await waitFor(() => {
        expect(heading.getBoundingClientRect().top).toBeCloseTo(initialTop, 1);
      });
    });
  },
};
