declare module 'cloudflare:workers' {
  // The Worker uses only the Durable Object constructor and its HTTP handler.
  export class DurableObject<Env> {
    constructor(state: unknown, env: Env);
  }
}
