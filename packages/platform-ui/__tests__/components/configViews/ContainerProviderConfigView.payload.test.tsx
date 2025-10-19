import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@hautech/ui';
import ContainerProviderConfigView from '@/components/configViews/ContainerProviderConfigView';

describe('ContainerProviderConfigView payload', () => {
  it('emits aligned schema shape', () => {
    let cfg: any = {};
    render(
      <TooltipProvider delayDuration={0}>
        <ContainerProviderConfigView
          templateName="containerProvider"
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
    fireEvent.change(screen.getByTestId('env-key-0'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('env-value-0'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Enable Docker-in-Docker sidecar'));
    const ttl = screen.getByLabelText('Workspace TTL (seconds)') as HTMLInputElement;
    fireEvent.change(ttl, { target: { value: '123' } });

    expect(cfg.image).toBe('node:20');
    expect(Array.isArray(cfg.env)).toBe(true);
    expect(cfg.env[0]).toEqual({ key: 'A', value: '1', source: 'static' });
    expect(cfg.enableDinD).toBe(true);
    expect(cfg.ttlSeconds).toBe(123);
  });
});
