import Mustache from 'mustache';

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

export function renderMustacheTemplate<TContext>(
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Mustache render failed: ${message}`);
    return template;
  } finally {
    Mustache.escape = previousEscape;
  }
}
