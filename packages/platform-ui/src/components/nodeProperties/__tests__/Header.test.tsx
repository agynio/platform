import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { Header } from '../Header';

describe('nodeProperties/Header', () => {
  it('renders status label and triggers provision action when allowed', async () => {
    const onProvision = vi.fn();
    render(
      <Header
        title="Agent Node"
        status="not_ready"
        canProvision
        onProvision={onProvision}
      />,
    );

    expect(screen.getByText('Node Properties')).toBeInTheDocument();
    expect(screen.getByText('Agent Node')).toBeInTheDocument();
    expect(screen.getByText('Not Ready')).toBeInTheDocument();

    const button = screen.getByRole('button');
    await userEvent.click(button);

    expect(onProvision).toHaveBeenCalledTimes(1);
  });

  it('triggers deprovision action when allowed', async () => {
    const onDeprovision = vi.fn();
    render(
      <Header
        title="Agent Node"
        status="ready"
        canDeprovision
        onDeprovision={onDeprovision}
      />,
    );

    const button = screen.getByRole('button');
    await userEvent.click(button);

    expect(onDeprovision).toHaveBeenCalledTimes(1);
  });

  it('disables action button while pending', async () => {
    const onDeprovision = vi.fn();
    render(
      <Header
        title="Agent Node"
        status="ready"
        canDeprovision
        isActionPending
        onDeprovision={onDeprovision}
      />,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onDeprovision).not.toHaveBeenCalled();
  });
});
