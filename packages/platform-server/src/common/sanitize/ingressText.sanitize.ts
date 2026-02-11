export type IngressSanitizeState = {
  seenContent: boolean;
  strippedBom: boolean;
  strippedReplacementPrefix: boolean;
  strippedNullCount: number;
};

export type IngressSanitizeResult = {
  text: string;
  strippedBom: boolean;
  strippedReplacementPrefix: boolean;
  strippedNullCount: number;
};

const BOM_CHAR = '\uFEFF';
const REPLACEMENT = '\uFFFD';
const NULL_REGEX = /\u0000+/g;

export function createIngressSanitizeState(): IngressSanitizeState {
  return {
    seenContent: false,
    strippedBom: false,
    strippedReplacementPrefix: false,
    strippedNullCount: 0,
  };
}

export function sanitizeIngressChunk(input: string, state: IngressSanitizeState): string {
  if (!input) return '';
  let text = input;

  if (!state.seenContent) {
    if (text.startsWith(BOM_CHAR)) {
      state.strippedBom = true;
      text = text.replace(/^\uFEFF+/, '');
    }
    if (text.startsWith(REPLACEMENT.repeat(2))) {
      state.strippedReplacementPrefix = true;
      text = text.slice(2);
    }
  }

  if (!text) return '';

  text = text.replace(NULL_REGEX, (match) => {
    state.strippedNullCount += match.length;
    return '';
  });

  if (text.length > 0) {
    state.seenContent = true;
  }

  return text;
}

export function sanitizeIngressText(input: string): IngressSanitizeResult {
  const state = createIngressSanitizeState();
  const text = sanitizeIngressChunk(input, state);
  return {
    text,
    strippedBom: state.strippedBom,
    strippedReplacementPrefix: state.strippedReplacementPrefix,
    strippedNullCount: state.strippedNullCount,
  };
}
