import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@agyn/ui';
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
    fireEvent.change(screen.getByTestId('env-name-0'), { target: { value: 'FOO' } });
    fireEvent.change(screen.getByTestId('env-value-0'), { target: { value: 'bar' } });
    const exec = screen.getByLabelText('Execution timeout (ms)') as HTMLInputElement;
    fireEvent.change(exec, { target: { value: '0' } });
    const idle = screen.getByLabelText('Idle timeout (ms)') as HTMLInputElement;
    fireEvent.change(idle, { target: { value: '2000' } });
    const outLimit = screen.getByLabelText('Output limit (characters)') as HTMLInputElement;
    fireEvent.change(outLimit, { target: { value: '12345' } });

    expect(cfg.workdir).toBe('/work');
    expect(Array.isArray(cfg.env)).toBe(true);
    expect(cfg.env[0]).toEqual({ name: 'FOO', value: 'bar', source: 'static' });
    expect(cfg.executionTimeoutMs).toBe(0);
    expect(cfg.idleTimeoutMs).toBe(2000);
    expect(cfg.outputLimitChars).toBe(12345);
  });

  it('validates outputLimitChars: accepts 0 and large positive, rejects negative', () => {
    let cfg: any = {};
    let errors: string[] = [];
    render(
      <TooltipProvider delayDuration={0}>
        <ShellToolConfigView
          templateName="shellTool"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
          onValidate={(e) => (errors = e)}
        />
      </TooltipProvider>,
    );
    const outLimit = screen.getByLabelText('Output limit (characters)') as HTMLInputElement;

    // Accept 0
    fireEvent.change(outLimit, { target: { value: '0' } });
    expect(cfg.outputLimitChars).toBe(0);
    expect(errors.includes('outputLimitChars must be 0 or a positive integer')).toBe(false);

    // Accept large value
    fireEvent.change(outLimit, { target: { value: '10000000' } });
    expect(cfg.outputLimitChars).toBe(10000000);
    expect(errors.includes('outputLimitChars must be 0 or a positive integer')).toBe(false);

    // Reject negative
    fireEvent.change(outLimit, { target: { value: '-1' } });
    // Validation should surface error
    expect(errors.includes('outputLimitChars must be 0 or a positive integer')).toBe(true);
  });
});
