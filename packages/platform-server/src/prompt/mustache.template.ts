import { Logger } from '@nestjs/common';
import Mustache from 'mustache';

const logger = new Logger('MustacheTemplate');

const identityEscape = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const identityEscapeFn: (value: string) => string = (value) => identityEscape(value);

export interface RenderMustacheOptions {
  escapeHtml?: boolean;
}

export function renderMustache<TContext>(
  template: string,
  context: TContext,
  options?: RenderMustacheOptions,
): string {
  if (!template) {
    return template;
  }

  const previousEscape: (value: string) => string = Mustache.escape;
  const escapeHtml = options?.escapeHtml ?? false;

  if (!escapeHtml) {
    Mustache.escape = identityEscapeFn;
  }

  try {
    return Mustache.render(template, context);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn(`Mustache render failed: ${err.message}`);
    return template;
  } finally {
    Mustache.escape = previousEscape;
  }
}
