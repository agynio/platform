import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';
// @ts-ignore - matchers is module namespace; cast to any for extend
expect.extend(matchers as any);
