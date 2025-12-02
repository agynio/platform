const Module = require('module');

const originalLoad = Module._load;
const { expect: playwrightExpect } = require('@playwright/test');
const matcherSymbol = Symbol.for('$$jest-matchers-object');
const originalDefineProperty = Object.defineProperty;

if (!globalThis.__vitest_worker__) {
  globalThis.__vitest_worker__ = {
    filepath: 'playwright-stub',
    providedContext: {},
    environment: { name: 'node' },
    moduleCache: new Map(),
    config: {},
  };
}

Object.defineProperty = function (target, property, descriptor) {
  if (property === matcherSymbol) {
    try {
      return originalDefineProperty(target, property, descriptor);
    } catch (error) {
      if (error instanceof TypeError) {
        console.warn('[playwright-setup] suppressing matcher redefinition');
        return target && target[matcherSymbol];
      }
      throw error;
    }
  }
  return originalDefineProperty(target, property, descriptor);
};

console.log('[playwright-setup] installed');

Module._load = function (request, parent, isMain) {
  if (request === '@testing-library/jest-dom/vitest') {
    console.log('[playwright-setup] skipping jest-dom import');
    return {};
  }
  if (request === 'vitest') {
    console.log('[playwright-setup] providing vitest stub');
    return { expect: playwrightExpect };
  }
  if (request === '@vitest/expect' || request.startsWith('@vitest/expect/')) {
    console.log('[playwright-setup] providing @vitest/expect stub');
    return playwrightExpect;
  }
  return originalLoad.call(this, request, parent, isMain);
};

module.exports = async () => {};
