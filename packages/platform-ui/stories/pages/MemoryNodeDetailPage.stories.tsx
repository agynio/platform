import { useEffect } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { expect } from '@storybook/jest';
import { waitFor, within } from '@storybook/testing-library';
import { HttpResponse, http } from 'msw';
import { useQueryClient } from '@tanstack/react-query';
import { MemoryNodeDetailPage } from '@/pages/MemoryNodeDetailPage';
import { withMainLayout } from '../decorators/withMainLayout';

const LONG_CONTENT = Array.from({ length: 120 }, (_, index) => `Paragraph ${index + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vitae lacus at sem fermentum feugiat. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.`)
  .join('\n\n');

const nodeId = 'alpha';
const scope = 'global';
const longDocPath = '/long-doc';

const meta: Meta<typeof MemoryNodeDetailPage> = {
  title: 'Pages/MemoryNodeDetailPage',
  component: MemoryNodeDetailPage,
  decorators: [withMainLayout],
  tags: ['smoke'],
  parameters: {
    layout: 'fullscreen',
    selectedMenuItem: 'memory',
    screen: {
      routePath: '/memory/:nodeId',
      initialEntry: `/memory/${nodeId}?path=${encodeURIComponent(longDocPath)}`,
    },
  },
};

export default meta;

type Story = StoryObj<typeof MemoryNodeDetailPage>;

const withPreloadedMemoryData: Decorator = (Story) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setQueryData(['memory/docs'], {
      items: [{ nodeId, scope }],
    });
    queryClient.setQueryData(['memory/list', nodeId, scope, undefined, '/'], {
      items: [{ name: 'long-doc.md', hasSubdocs: false }],
    });
    queryClient.setQueryData(['memory/list', nodeId, scope, undefined, longDocPath], {
      items: [],
    });
    queryClient.setQueryData(['memory/stat', nodeId, scope, undefined, '/'], {
      exists: true,
      hasSubdocs: true,
      contentLength: 0,
    });
    queryClient.setQueryData(['memory/stat', nodeId, scope, undefined, longDocPath], {
      exists: true,
      hasSubdocs: false,
      contentLength: LONG_CONTENT.length,
    });
    queryClient.setQueryData(['memory/read', nodeId, scope, undefined, longDocPath], {
      content: LONG_CONTENT,
    });
  }, [queryClient]);

  return <Story />;
};

export const LongDocument: Story = {
  decorators: [withPreloadedMemoryData],
  parameters: {
    msw: {
      handlers: [
        http.get('*/api/memory/docs', () =>
          HttpResponse.json({
            items: [{ nodeId, scope }],
          }),
        ),
        http.get(`*/api/memory/${nodeId}/${scope}/list`, ({ request }) => {
          const url = new URL(request.url);
          const path = url.searchParams.get('path') ?? '/';
          if (path === '/') {
            return HttpResponse.json({
              items: [{ name: 'long-doc.md', hasSubdocs: false }],
            });
          }
          return HttpResponse.json({ items: [] });
        }),
        http.get(`*/api/memory/${nodeId}/${scope}/stat`, ({ request }) => {
          const url = new URL(request.url);
          const path = url.searchParams.get('path') ?? '/';
          if (path === longDocPath) {
            return HttpResponse.json({ exists: true, hasSubdocs: false, contentLength: LONG_CONTENT.length });
          }
          return HttpResponse.json({ exists: true, hasSubdocs: true, contentLength: 0 });
        }),
        http.get(`*/api/memory/${nodeId}/${scope}/read`, ({ request }) => {
          const url = new URL(request.url);
          const path = url.searchParams.get('path') ?? '/';
          if (path === longDocPath) {
            return HttpResponse.json({ content: LONG_CONTENT });
          }
          return HttpResponse.json({ content: '' });
        }),
      ],
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.queryByText('Loading memory node…')).not.toBeInTheDocument();
    }, { timeout: 5000 });

    const header = canvas.getByTestId('memory-editor-header');
    const body = canvas.getByTestId('memory-editor-body');

    await waitFor(() => {
      expect(body.clientHeight).toBeGreaterThan(0);
    });

    await step('editor body is scrollable', async () => {
      await waitFor(() => {
        expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
      });
    });

    await step('header stays pinned while body scrolls', async () => {
      const initialTop = header.getBoundingClientRect().top;
      body.scrollTop = body.scrollHeight;
      await waitFor(() => {
        expect(body.scrollTop).toBeGreaterThan(0);
      });
      await waitFor(() => {
        expect(header.getBoundingClientRect().top).toBeCloseTo(initialTop, 1);
      });
    });
  },
};
