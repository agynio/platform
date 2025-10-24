import { describe, it, expect } from 'vitest';
import { Reducer } from '../src/reducer';
import { Router } from '../src/router';
import { Loop } from '../src/loop';

type S = { n: number };
type C = {};

class IncReducer extends Reducer<S, C> {
  private by = 1;
  init(p?: { by?: number }) { this.by = p?.by ?? 1; return this; }
  async invoke(state: S): Promise<S> { return { n: state.n + this.by }; }
}

class StaticRouter extends Router<S, C> {
  constructor(private nextId: string | null) { super(); }
  async route(state: S) { return { state, next: this.nextId }; }
}

class ConditionalRouter extends Router<S, C> {
  constructor(private fn: (s: S) => string | null) { super(); }
  async route(state: S) { return { state, next: this.fn(state) }; }
}

describe('Loop and Routers', () => {
  it('chains reducers via next router and terminates on null', async () => {
    const reducers = {
      a: new IncReducer().init({ by: 2 }).next(new StaticRouter('b')),
      b: new IncReducer().init({ by: 3 }).next(new StaticRouter(null)),
    } as Record<string, Reducer<S, C>>;

    const loop = new Loop<S, C>(reducers);
    const out = await loop.invoke({ n: 1 }, {}, { start: 'a' });
    expect(out.n).toBe(1 + 2 + 3);
  });

  it('routes conditionally to next id', async () => {
    const reducers = {
      start: new IncReducer().init({ by: 1 }).next(new ConditionalRouter((s) => (s.n >= 2 ? null : 'start'))),
    } as Record<string, Reducer<S, C>>;
    const loop = new Loop<S, C>(reducers);
    const out = await loop.invoke({ n: 0 }, {}, { start: 'start' });
    expect(out.n).toBeGreaterThanOrEqual(2);
  });

  it('throws on missing reducer id', async () => {
    const loop = new Loop<S, C>({});
    await expect(loop.invoke({ n: 0 }, {}, { start: 'missing' })).rejects.toThrow(/No reducer found/);
  });

  it('throws on missing next reducer id', async () => {
    const reducers = {
      a: new IncReducer().next(new StaticRouter('b')),
    } as Record<string, Reducer<S, C>>;
    const loop = new Loop<S, C>(reducers);
    await expect(loop.invoke({ n: 0 }, {}, { start: 'a' })).rejects.toThrow(/No reducer found for next id: b/);
  });

  it('detects cycles', async () => {
    const reducers = {
      a: new IncReducer().next(new StaticRouter('a')),
    } as Record<string, Reducer<S, C>>;
    const loop = new Loop<S, C>(reducers);
    await expect(loop.invoke({ n: 0 }, {}, { start: 'a' })).rejects.toThrow(/Cycle detected/);
  });
});
