// tsc can't read .astro files; the Container API only needs them to be component factories.
declare module '*.astro' {
  const Component: import('astro/runtime/server/index.js').AstroComponentFactory;
  export default Component;
}
