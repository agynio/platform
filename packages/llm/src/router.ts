export abstract class Router<S, C> {
  abstract invoke(state: S, ctx: C): Promise<{ state: S; next: string | null }>;
}
