import { describe, it, expect, beforeEach } from 'vitest';
import { clearRegistry, getConfigView, hasConfigView, registerConfigView } from '@/components/configViews/registry';
import type { StaticConfigViewComponent } from '@/components/configViews/types';

function Dummy(): null { return null; }

describe('ConfigViews registry', () => {
  beforeEach(() => clearRegistry());

  it('register/get/has work for static', () => {
    registerConfigView({ template: 'x', mode: 'static', component: Dummy as unknown as StaticConfigViewComponent });
    expect(hasConfigView('x', 'static')).toBe(true);
    const comp = getConfigView('x', 'static');
    expect(comp).toBeTypeOf('function');
  });

  it('clear removes all', () => {
    registerConfigView({ template: 'a', mode: 'static', component: Dummy as unknown as StaticConfigViewComponent });
    clearRegistry();
    expect(hasConfigView('a', 'static')).toBe(false);
    expect(getConfigView('a', 'static')).toBeUndefined();
  });
});

