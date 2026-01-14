import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderMustache } from '../src/prompt/mustache.template';

describe('renderMustache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns original string when no tokens are present', () => {
    const template = 'static text block';
    const result = renderMustache(template, {});
    expect(result).toBe(template);
  });

  it('renders without HTML escaping by default', () => {
    const result = renderMustache('value: {{content}}', { content: '<b>bold</b>' });
    expect(result).toBe('value: <b>bold</b>');
  });

  it('returns original template when Mustache rendering throws', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const template = '{{#broken}}';

    const result = renderMustache(template, {});

    expect(result).toBe(template);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Mustache render failed:'));
  });
});
