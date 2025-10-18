import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Top navigation for entry pages.
 * - Semantic <nav> with links.
 * - Active state via NavLink.
 * - Preserves ?from&?to when already under /errors/tools*.
 */
export function TopNav() {
  const location = useLocation();
  const isErrorsTools = location.pathname.startsWith('/errors/tools');

  const errorsToolsHref = useMemo(() => {
    if (!isErrorsTools) return '/errors/tools';
    const sp = new URLSearchParams(location.search);
    const from = sp.get('from');
    const to = sp.get('to');
    if (from && to) return `/errors/tools?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return '/errors/tools';
  }, [isErrorsTools, location.search]);

  const linkBase: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    color: '#222',
    textDecoration: 'none',
    outlineOffset: 2,
  };

  return (
    <nav aria-label="Primary" data-testid="obsui-topnav" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      borderBottom: '1px solid #eee',
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NavLink to="/" end data-testid="obsui-link-traces" style={({ isActive }) => ({
          ...linkBase,
          fontWeight: isActive ? 600 : 500,
          background: isActive ? '#f7f9fa' : undefined,
        })}>
          Traces
        </NavLink>
        <NavLink to={errorsToolsHref} data-testid="obsui-link-errors-tools" style={({ isActive }) => ({
          ...linkBase,
          fontWeight: isActive ? 600 : 500,
          background: isActive ? '#f7f9fa' : undefined,
        })}>
          Error tools
        </NavLink>
      </div>
    </nav>
  );
}
