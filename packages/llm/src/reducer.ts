import { Router } from './router';

/**
 * Base Reducer: performs a transformation over state given a context.
 * Supports chaining via an optional next Router.
 */
export abstract class Reducer<S, C> {
  // Next router to determine the following reducer id
  protected nextRouter?: Router<S, C>;

  /**
   * Attach the next router in the chain.
   */
  next(router: Router<S, C>): this {
    this.nextRouter = router;
    return this;
  }

  /**
   * Whether a next router is configured.
   */
  hasNext(): boolean {
    return !!this.nextRouter;
  }

  /**
   * Typed accessor for the next router.
   */
  getNextRouter(): Router<S, C> | undefined {
    return this.nextRouter;
  }

  /**
   * Execute reducer logic, returning the updated state.
   */
  abstract invoke(state: S, ctx: C): Promise<S>;
}
