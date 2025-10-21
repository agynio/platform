export abstract class Reducer<S, C> {
  abstract invoke(state: S, ctx: C): Promise<S>;
}
