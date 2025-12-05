export interface SelectionRange {
  start: number;
  end: number;
}

export interface FormatResult {
  value: string;
  selection: SelectionRange;
}

interface FormatterInput {
  value: string;
  selection: SelectionRange;
}

type InlineWrapper = {
  prefix: string;
  suffix?: string;
  placeholder?: string;
};

const clampSelection = ({ value, selection }: FormatterInput): SelectionRange => {
  const start = Math.min(Math.max(selection.start, 0), value.length);
  const end = Math.min(Math.max(selection.end, 0), value.length);
  return start <= end ? { start, end } : { start: end, end: start };
};

const withSelection = ({ value, selection }: FormatterInput): FormatterInput => ({
  value,
  selection: clampSelection({ value, selection }),
});

const toggleInlineWrapper = (
  input: FormatterInput,
  wrapper: InlineWrapper,
): FormatResult => {
  const { value, selection } = withSelection(input);
  const { start, end } = selection;
  const { prefix, suffix = wrapper.prefix, placeholder = '' } = wrapper;
  const selectedText = value.slice(start, end);
  const hasPrefix = start >= prefix.length && value.slice(start - prefix.length, start) === prefix;
  const hasSuffix = value.slice(end, end + suffix.length) === suffix;

  if (hasPrefix && hasSuffix) {
    const unwrappedValue = `${value.slice(0, start - prefix.length)}${selectedText}${value.slice(
      end + suffix.length,
    )}`;
    const nextStart = start - prefix.length;
    const nextEnd = nextStart + selectedText.length;
    return { value: unwrappedValue, selection: { start: nextStart, end: nextEnd } };
  }

  const content = selectedText || placeholder;
  const wrapped = `${prefix}${content}${suffix}`;
  const nextValue = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
  const selectionStart = start + prefix.length;
  const selectionEnd = selectionStart + content.length;
  return { value: nextValue, selection: { start: selectionStart, end: selectionEnd } };
};

const splitLines = (value: string, selection: SelectionRange) => {
  const start = selection.start;
  const end = selection.end;

  const blockStart = start > 0 ? value.lastIndexOf('\n', start - 1) + 1 : 0;

  let blockEnd = end;
  if (blockEnd < value.length) {
    while (blockEnd < value.length && value[blockEnd] !== '\n') {
      blockEnd += 1;
    }
  }

  const block = value.slice(blockStart, blockEnd);
  const lines = block.split('\n');

  return { blockStart, blockEnd, lines };
};

const joinLines = (value: string, blockStart: number, blockEnd: number, lines: string[]): FormatResult => {
  const nextBlock = lines.join('\n');
  const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;
  return {
    value: nextValue,
    selection: {
      start: blockStart,
      end: blockStart + nextBlock.length,
    },
  };
};

const prefixForLine = (line: string): string => {
  const match = /^\s*/.exec(line);
  return match ? match[0] ?? '' : '';
};

export const toggleBold = (input: FormatterInput): FormatResult =>
  toggleInlineWrapper(input, { prefix: '**' });

export const toggleItalic = (input: FormatterInput): FormatResult =>
  toggleInlineWrapper(input, { prefix: '*', placeholder: 'text' });

export const toggleUnderline = (input: FormatterInput): FormatResult =>
  toggleInlineWrapper(input, { prefix: '<u>', suffix: '</u>' });

export const toggleInlineCode = (input: FormatterInput): FormatResult =>
  toggleInlineWrapper(input, { prefix: '`' });

export const toggleBlockquote = (input: FormatterInput): FormatResult => {
  const { value, selection } = withSelection(input);
  const { blockStart, blockEnd, lines } = splitLines(value, selection);
  const quotePattern = /^\s*>\s?/;
  const allQuoted = lines.every((line) => line.trim().length === 0 || quotePattern.test(line));

  const nextLines = allQuoted
    ? lines.map((line) => line.replace(quotePattern, ''))
    : lines.map((line) => {
        if (line.trim().length === 0) {
          return line;
        }
        const indent = prefixForLine(line);
        return `${indent}> ${line.slice(indent.length)}`;
      });

  return joinLines(value, blockStart, blockEnd, nextLines);
};

export const toggleBulletedList = (input: FormatterInput): FormatResult => {
  const { value, selection } = withSelection(input);
  const { blockStart, blockEnd, lines } = splitLines(value, selection);
  const bulletPattern = /^\s*[-*+]\s+/;
  const allBulleted = lines.every((line) => line.trim().length === 0 || bulletPattern.test(line));

  const nextLines = allBulleted
    ? lines.map((line) => line.replace(bulletPattern, ''))
    : lines.map((line) => {
        if (line.trim().length === 0) {
          return line;
        }
        const indent = prefixForLine(line);
        return `${indent}- ${line.slice(indent.length)}`;
      });

  return joinLines(value, blockStart, blockEnd, nextLines);
};

export const toggleNumberedList = (input: FormatterInput): FormatResult => {
  const { value, selection } = withSelection(input);
  const { blockStart, blockEnd, lines } = splitLines(value, selection);
  const numberedPattern = /^\s*\d+\.\s+/;
  const allNumbered = lines.every((line) => line.trim().length === 0 || numberedPattern.test(line));

  const nextLines = allNumbered
    ? lines.map((line) => line.replace(numberedPattern, ''))
    : lines.map((line, index) => {
        if (line.trim().length === 0) {
          return line;
        }
        const indent = prefixForLine(line);
        return `${indent}${index + 1}. ${line.slice(indent.length)}`;
      });

  return joinLines(value, blockStart, blockEnd, nextLines);
};

export const toggleCodeBlock = (input: FormatterInput): FormatResult => {
  const { value, selection } = withSelection(input);
  const { start, end } = selection;
  const selectedText = value.slice(start, end);

  const prefixDirectMatch = start >= 4 ? value.slice(start - 4, start) === '```\n' : false;
  const prefixWithBreakMatch = start >= 5 ? value.slice(start - 5, start) === '\n```\n' : false;
  const suffixDirectMatch = value.slice(end, end + 4) === '\n```';
  const suffixWithBreakMatch = value.slice(end, end + 5) === '\n```\n';

  if ((prefixDirectMatch || prefixWithBreakMatch) && (suffixDirectMatch || suffixWithBreakMatch)) {
    const leadingOffset = prefixWithBreakMatch ? 5 : 4;
    const trailingOffset = suffixWithBreakMatch ? 5 : 4;
    const blockStart = start - leadingOffset;
    const blockEnd = end + trailingOffset;
    const nextValue = `${value.slice(0, blockStart)}${selectedText}${value.slice(blockEnd)}`;
    const nextSelectionStart = blockStart;
    const nextSelectionEnd = nextSelectionStart + selectedText.length;
    return {
      value: nextValue,
      selection: { start: nextSelectionStart, end: nextSelectionEnd },
    };
  }

  const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
  const needsTrailingBreak = end < value.length && value[end] !== '\n';
  const leadingBreak = needsLeadingBreak ? '\n' : '';
  const trailingBreak = needsTrailingBreak ? '\n' : '';

  const fencePrefix = '```\n';
  const fenceSuffix = '\n```';
  const nextValue = `${value.slice(0, start)}${leadingBreak}${fencePrefix}${selectedText}${fenceSuffix}${trailingBreak}${value.slice(
    end,
  )}`;
  const selectionStart = start + leadingBreak.length + fencePrefix.length;
  const selectionEnd = selectionStart + selectedText.length;
  return {
    value: nextValue,
    selection: { start: selectionStart, end: selectionEnd },
  };
};
