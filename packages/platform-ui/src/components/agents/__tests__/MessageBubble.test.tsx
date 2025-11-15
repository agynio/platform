import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

describe('MessageBubble', () => {
  it('uses shared content classes for text and raw blocks', () => {
    render(
      <MessageBubble
        id="msg-1"
        role="user"
        timestamp="2024-01-01T00:00:00.000Z"
        text={'line1\nline2'}
        source={{ foo: 'bar' }}
        side="left"
        showJson
        onToggleJson={() => {}}
      />,
    );

    const textBlock = screen.getByText(/line1/);
    expect(textBlock).toHaveClass('content-wrap');

    const rawBlock = screen.getByTestId('raw-json');
    expect(rawBlock).toHaveClass('content-pre');
  });
});
