import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUuid } from '@/utils/getUuid';
import { v4 as uuidv4 } from 'uuid';

vi.mock('uuid', () => ({ v4: vi.fn() }));

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const uuidMock = vi.mocked(uuidv4);

function setCrypto(value: Crypto | undefined): void {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
  });
}

function restoreCrypto(): void {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'crypto');
  }
}

afterEach(() => {
  restoreCrypto();
  vi.clearAllMocks();
});

describe('getUuid', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => 'crypto-id');
    setCrypto({ randomUUID } as Crypto);

    expect(getUuid()).toBe('crypto-id');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(uuidMock).not.toHaveBeenCalled();
  });

  it('falls back to uuidv4 when crypto is unavailable', () => {
    setCrypto(undefined);
    uuidMock.mockReturnValue('fallback-id');

    expect(getUuid()).toBe('fallback-id');
    expect(uuidMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to uuidv4 when crypto.randomUUID throws', () => {
    const randomUUID = vi.fn(() => {
      throw new Error('blocked');
    });
    setCrypto({ randomUUID } as Crypto);
    uuidMock.mockReturnValue('fallback-id');

    expect(getUuid()).toBe('fallback-id');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(uuidMock).toHaveBeenCalledTimes(1);
  });
});
