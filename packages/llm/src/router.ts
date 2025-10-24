export abstract class Router<S, C> {
  abstract route(state: S, ctx: C): Promise<{ state: S; next: string | null }>;
}
