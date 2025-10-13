// Deterministic 3-emoji id from an input string.
// - Hash: FNV-1a 32-bit
// - PRNG: simple LCG to derive 3 indices

// Curated alphabet (~64). Prefer simple, single-codepoint emojis to avoid
// substring/variation selector traps and keep rendering consistent.
export const emojiAlphabet: string[] = [
  '😀','😁','😂','😃','😄','😅','😆','😉',
  '😊','😎','😍','😘','😗','😙','😚','🙂',
  '🤗','🤔','😐','😑','😶','🙄','😏','😣',
  '😥','😮','🤐','😯','😪','😫','😴','😌',
  '😛','😜','😝','🤤','😒','😓','😔','😕',
  '🙃','🤑','😲','🙁','😖','😞','😟','😡',
  '😤','😢','😭','😦','😧','😨','😩','🤯',
  '😬','😰','😱','😳','🤪','🤨','🤩','🤠'
];

// FNV-1a 32-bit
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime 16777619
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // ensure unsigned 32-bit
}

// LCG parameters (Numerical Recipes):
// X_{n+1} = (a * X_n + c) mod 2^32
const LCG_A = 1664525;
const LCG_C = 1013904223;

function lcgNext(x: number): number {
  return (Math.imul(x, LCG_A) + LCG_C) >>> 0;
}

// Returns 3 indices in [0, alphabet.length)
function emojiHash3Indexes(input: string, alphabetSize = emojiAlphabet.length): [number, number, number] {
  // Defensive guard to surface misuse early
  if (alphabetSize <= 0) {
    throw new Error('emojiHash3: emoji alphabet must not be empty');
  }
  let x = fnv1a32(input);
  const i0 = x % alphabetSize;
  x = lcgNext(x);
  const i1 = x % alphabetSize;
  x = lcgNext(x);
  const i2 = x % alphabetSize;
  return [i0, i1, i2];
}

export function emojiHash3(input: string): string {
  const [i0, i1, i2] = emojiHash3Indexes(input);
  return `${emojiAlphabet[i0]}${emojiAlphabet[i1]}${emojiAlphabet[i2]}`;
}
