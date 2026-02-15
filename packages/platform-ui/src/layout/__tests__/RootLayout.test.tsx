import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

let capturedProps: { menuItems: any; selectedMenuItem?: string } | null = null;

vi.mock('../../components/layouts/MainLayout', () => ({
  MainLayout: (props: any) => {
    capturedProps = { menuItems: props.menuItems, selectedMenuItem: props.selectedMenuItem };
    return <div data-testid="main-layout">{props.children}</div>;
  },
}));

import { RootLayout } from '../RootLayout';

function renderAt(pathname: string) {
  capturedProps = null;
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="*" element={<div>child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return capturedProps!;
}

describe('RootLayout navigation', () => {
  it('exposes agents nav with memory entry', () => {
    const props = renderAt('/agents/memory');
    const agentsSection = props.menuItems.find((item: any) => item.id === 'agents');
    expect(agentsSection?.items?.map((item: any) => item.id)).toEqual([
      'agentsTeam',
      'agentsThreads',
      'agentsReminders',
      'agentsMemory',
    ]);
    expect(props.selectedMenuItem).toBe('agentsMemory');
  });

  it('includes entities section entries and selects agents list by default', () => {
    const props = renderAt('/agents');
    const entitiesSection = props.menuItems.find((item: any) => item.id === 'entities');
    expect(entitiesSection?.items?.map((item: any) => item.id)).toEqual([
      'entitiesTriggers',
      'entitiesAgents',
      'entitiesTools',
      'entitiesWorkspaces',
      'entitiesMemory',
    ]);
    expect(props.selectedMenuItem).toBe('entitiesAgents');
  });

  it('highlights entities memory when visiting the memory list', () => {
    const props = renderAt('/memory');
    expect(props.selectedMenuItem).toBe('entitiesMemory');
  });
});
