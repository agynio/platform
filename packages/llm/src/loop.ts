import { Reducer } from './reducer';
import { Router } from './router';

export class Loop<S, C> {
  constructor(private reducers: Record<string, Reducer<S, C>>) {}

  async invoke(state: S, ctx: C, params: { start: string }): Promise<S> {
    let workingState: S = state;
    let currentId: string | null = params.start;

    while (currentId) {
      const reducer: Reducer<S, C> | undefined = this.reducers[currentId];
      if (!reducer) {
        throw new Error(`No reducer found for id: ${currentId}`);
      }

      // Run reducer
      workingState = await reducer.invoke(workingState, ctx);

      // Determine next
      if (!reducer.hasNext()) {
        break;
      }
      const router: Router<S, C> | undefined = reducer.getNextRouter();
      if (!router) break;

      const result: { state: S; next: string | null } = await router.route(workingState, ctx);
      workingState = result.state;
      const nextId: string | null = result.next;
      if (!nextId) break;

      // validate nextId exists
      if (!this.reducers[nextId]) {
        throw new Error(`No reducer found for next id: ${nextId}`);
      }
      currentId = nextId;
    }

    return workingState;
  }
}
