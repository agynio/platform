import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';

/**
 * Wraps entry routes (/, /errors/tools*) with a persistent top navigation.
 */
export function EntryLayout() {
  // Render TopNav for all child routes mounted under this layout.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
