import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@agyn/ui';
import WorkspaceConfigView from '@/components/configViews/WorkspaceConfigView';

describe('WorkspaceConfigView payload', () => {
  it('emits aligned schema shape', () => {
    let cfg: any = {};
    render(
      <TooltipProvider delayDuration={0}>
        <WorkspaceConfigView
          templateName="workspace"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
        />
      </TooltipProvider>,
    );
    // Query the exact label as in UI
    const img = screen.getByLabelText('Image') as HTMLInputElement;
    fireEvent.change(img, { target: { value: 'node:20' } });
    fireEvent.click(screen.getByText('Add env'));
    fireEvent.change(screen.getByTestId('env-name-0'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('env-value-0'), { target: { value: '1' } });
    const cpuLimit = screen.getByLabelText('CPU limit') as HTMLInputElement;
    fireEvent.change(cpuLimit, { target: { value: '750m' } });
    const memoryLimit = screen.getByLabelText('Memory limit') as HTMLInputElement;
    fireEvent.change(memoryLimit, { target: { value: '512Mi' } });
    fireEvent.click(screen.getByLabelText('Enable Docker-in-Docker sidecar'));
    fireEvent.click(screen.getByLabelText('Enable persistent workspace volume'));
    const mountPath = screen.getByLabelText('Mount path') as HTMLInputElement;
    fireEvent.change(mountPath, { target: { value: '/data' } });
    const ttl = screen.getByLabelText('Workspace TTL (seconds)') as HTMLInputElement;
    fireEvent.change(ttl, { target: { value: '123' } });

    expect(cfg.image).toBe('node:20');
    expect(Array.isArray(cfg.env)).toBe(true);
    expect(cfg.env[0]).toEqual({ name: 'A', value: '1', source: 'static' });
    expect(cfg.cpu_limit).toBe('750m');
    expect(cfg.memory_limit).toBe('512Mi');
    expect(cfg.enableDinD).toBe(true);
    expect(cfg.ttlSeconds).toBe(123);
    expect(cfg.volumes).toEqual({ enabled: true, mountPath: '/data' });
  });
});
