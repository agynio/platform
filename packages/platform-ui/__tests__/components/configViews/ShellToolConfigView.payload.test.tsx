import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@hautech/ui';
import ShellToolConfigView from '@/components/configViews/ShellToolConfigView';

describe('ShellToolConfigView payload', () => {
  it('emits aligned schema shape', () => {
    let cfg: any = {};
    render(
      <TooltipProvider delayDuration={0}>
        <ShellToolConfigView
          templateName="shellTool"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
        />
      </TooltipProvider>,
    );
    const wd = screen.getByDisplayValue('/workspace') as HTMLInputElement;
    fireEvent.change(wd, { target: { value: '/work' } });
    fireEvent.click(screen.getByText('Add env'));
    fireEvent.change(screen.getByTestId('env-key-0'), { target: { value: 'FOO' } });
    fireEvent.change(screen.getByTestId('env-value-0'), { target: { value: 'bar' } });
    const exec = screen.getByLabelText('Execution timeout (ms)') as HTMLInputElement;
    fireEvent.change(exec, { target: { value: '0' } });
    const idle = screen.getByLabelText('Idle timeout (ms)') as HTMLInputElement;
    fireEvent.change(idle, { target: { value: '2000' } });

    expect(cfg.workdir).toBe('/work');
    expect(Array.isArray(cfg.env)).toBe(true);
    expect(cfg.env[0]).toEqual({ key: 'FOO', value: 'bar', source: 'static' });
    expect(cfg.executionTimeoutMs).toBe(0);
    expect(cfg.idleTimeoutMs).toBe(2000);
  });
});
