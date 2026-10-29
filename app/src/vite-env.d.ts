/// <reference types="vite/client" />
declare module "virtual:recommand-file-based-router" {
  interface Route {
    route: string;
    relativePath: string;
    pageFilePath: string | null;
    PageComponent: React.ComponentType | null;
    layoutFilePath: string | null;
    LayoutComponent: React.ComponentType | null;
    children: Route[];
  }  
  export const routes: Route[];
  export const entrypoints: React.ComponentType<{ children?: React.ReactNode }>[];
  export default routes;
}

declare module "virtual:recommand-app" {
  /** The deployment's app identity; file entries are asset URLs. */
  const app: {
    name: string;
    supportEmail?: string;
    website?: string;
    favicon?: string;
    logo?: string;
    logoDark?: string;
    sidebarLogo?: string;
  };
  export { app };
  export default app;
}
