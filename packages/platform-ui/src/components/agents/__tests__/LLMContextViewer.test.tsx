import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { LLMContextViewer } from '../LLMContextViewer';
import type { ContextItem } from '@/api/types/agents';

const useContextItemsMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/hooks/contextItems', () => ({
  useContextItems: useContextItemsMock,
}));

function makeContextItem(overrides: Partial<ContextItem> & { id: string; contentText?: string | null }): ContextItem {
  return {
    id: overrides.id,
    role: overrides.role ?? 'system',
    contentText: overrides.contentText ?? 'placeholder',
    contentJson: overrides.contentJson ?? null,
    metadata: overrides.metadata ?? null,
    sizeBytes: overrides.sizeBytes ?? 128,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  } satisfies ContextItem;
}

describe('LLMContextViewer', () => {
  beforeEach(() => {
    useContextItemsMock.mockReset();
  });

  it('renders the load-older button before context items', () => {
    useContextItemsMock.mockReturnValue({
      items: [makeContextItem({ id: 'ctx-2', contentText: 'Two' }), makeContextItem({ id: 'ctx-3', contentText: 'Three' })],
      total: 3,
      targetCount: 2,
      hasMore: true,
      isInitialLoading: false,
      isFetching: false,
      error: null,
      loadMore: vi.fn(),
    });

    const { container, getByRole } = render(<LLMContextViewer ids={['ctx-1', 'ctx-2', 'ctx-3']} />);
    const rootNode = container.firstElementChild as HTMLElement;

    expect(rootNode).toBeTruthy();
    expect(rootNode?.firstElementChild?.tagName).toBe('BUTTON');
    expect(getByRole('button', { name: /Load older context/ })).toBeInTheDocument();
  });

  it('prepends older context entries when the load-more handler resolves', () => {
    const allIds = ['ctx-1', 'ctx-2', 'ctx-3'];
    const state: {
      items: ContextItem[];
      total: number;
      targetCount: number;
      hasMore: boolean;
    } = {
      items: [
        makeContextItem({ id: 'ctx-2', contentText: 'Context Two', createdAt: '2024-01-01T00:02:00.000Z' }),
        makeContextItem({ id: 'ctx-3', contentText: 'Context Three', createdAt: '2024-01-01T00:03:00.000Z' }),
      ],
      total: allIds.length,
      targetCount: 2,
      hasMore: true,
    };

    let rerenderFn: ((ui: React.ReactElement) => void) | null = null;

    useContextItemsMock.mockImplementation(() => ({
      items: state.items,
      total: state.total,
      targetCount: state.targetCount,
      hasMore: state.hasMore,
      isInitialLoading: false,
      isFetching: false,
      error: null,
      loadMore: () => {
        state.items = [
          makeContextItem({ id: 'ctx-1', contentText: 'Context One', createdAt: '2024-01-01T00:01:00.000Z' }),
          ...state.items,
        ];
        state.targetCount = state.items.length;
        state.hasMore = false;
        rerenderFn?.(<LLMContextViewer ids={allIds} />);
      },
    }));

    const { container, rerender, getByRole } = render(<LLMContextViewer ids={allIds} />);
    rerenderFn = rerender;

    fireEvent.click(getByRole('button', { name: /Load older context/ }));

    const articles = container.querySelectorAll('article');
    expect(articles).toHaveLength(3);
    expect(articles[0].textContent).toContain('Context One');
    expect(articles[articles.length - 1].textContent).toContain('Context Three');
  });
});
