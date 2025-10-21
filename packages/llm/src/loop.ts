import { Router } from './router';

export class Loop<S, C> {
  constructor(private routers: Map<string, Router<S, C>>) {}

  async invoke(state: S, ctx: C, params: { route: string }) {
    let workingState = state;
    let next: string | null = params.route;
    while (next) {
      const router = this.routers.get(next);
      if (!router) {
        throw new Error(`No router found for key: ${next}`);
      }
      const result = await router.invoke(workingState, ctx);
      workingState = result.state;
      next = result.next;
    }
    return workingState;
  }
}
