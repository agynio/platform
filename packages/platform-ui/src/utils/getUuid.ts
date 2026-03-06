import { v4 as uuidv4 } from 'uuid';

export function getUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback to uuid
    }
  }
  return uuidv4();
}
