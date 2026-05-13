// TypeScript resolves @devvit/client to its panic-file stub because the
// package exports map has no "types" condition (only "browser" and "default").
// This shim exposes the navigateTo function that exists at runtime.
declare module '@devvit/client' {
  export function navigateTo(thingOrUrl: string | { readonly url: string }): void;
}
