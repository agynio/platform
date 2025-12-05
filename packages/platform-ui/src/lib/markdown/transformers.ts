import type {
  MultilineElementTransformer,
  Transformer,
  TextFormatTransformer,
} from '@lexical/markdown';
import { CODE, TRANSFORMERS } from '@lexical/markdown';
import { $isCodeNode } from '@lexical/code';
import { LineBreakNode } from 'lexical';

export const UNDERLINE_MARKER = '__LEXICAL_UNDERLINE__';

const UNDERLINE_TRANSFORMER: TextFormatTransformer = {
  format: ['underline'],
  tag: UNDERLINE_MARKER,
  type: 'text-format',
};

export function encodeUnderlinePlaceholders(markdown: string): string {
  if (!markdown.includes('<u>')) {
    return markdown;
  }

  const underlineHtmlPattern = /<u>([\s\S]*?)<\/u>/gi;

  return markdown.replace(underlineHtmlPattern, (_match, content) => {
    return `${UNDERLINE_MARKER}${content}${UNDERLINE_MARKER}`;
  });
}

export function decodeUnderlinePlaceholders(markdown: string): string {
  const escapedMarker = UNDERLINE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = markdown
    .split('\\_\\_LEXICAL\\_UNDERLINE\\_\\_')
    .join(UNDERLINE_MARKER)
    .replace(new RegExp(escapedMarker, 'gi'), UNDERLINE_MARKER);

  if (!normalized.includes(UNDERLINE_MARKER)) {
    return markdown;
  }

  const segments = normalized.split(UNDERLINE_MARKER);

  if (segments.length % 2 === 0) {
    return normalized;
  }

  let result = segments[0];

  for (let index = 1; index < segments.length; index += 2) {
    const content = segments[index];
    result += `<u>${content}</u>`;
    result += segments[index + 1] ?? '';
  }

  return result;
}

const CODE_LANGUAGES_WITHOUT_MARKER = new Set(['auto', 'plain', 'plaintext', 'text']);

const CUSTOM_CODE_TRANSFORMER: MultilineElementTransformer = {
  ...CODE,
  export: (node) => {
    if (!$isCodeNode(node)) {
      return null;
    }

    const children = node.getChildren();
    const rawTextContent = node.getTextContent();
    const leadingShouldBeTrimmed =
      rawTextContent.startsWith('\n') &&
      children.length >= 2 &&
      children[0] instanceof LineBreakNode &&
      !(children[1] instanceof LineBreakNode);
    const textContent = leadingShouldBeTrimmed
      ? rawTextContent.slice(1)
      : rawTextContent;
    const language = node.getLanguage();
    const languageSuffix = language && !CODE_LANGUAGES_WITHOUT_MARKER.has(language) ? language : '';

    return `\`\`\`${languageSuffix}${textContent ? `\n${textContent}` : ''}\n\`\`\``;
  },
};

const BASE_TRANSFORMERS: Transformer[] = TRANSFORMERS.map((transformer) => {
  return transformer === CODE ? CUSTOM_CODE_TRANSFORMER : transformer;
});

export const MARKDOWN_COMPOSER_TRANSFORMERS: Transformer[] = [
  ...BASE_TRANSFORMERS,
  UNDERLINE_TRANSFORMER,
];
