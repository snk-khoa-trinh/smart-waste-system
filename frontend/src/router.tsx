import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  lazyRouteComponent,
  Link,
} from "@tanstack/react-router";
import App from "@/App";
const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: () => (
    <div className="page-heading">
      <div>
        <h1>Page not found</h1>
        <p>This address doesn’t match a page.</p>
        <Link to="/" className="underline">
          Back to overview
        </Link>
      </div>
    </div>
  ),
});
const overview = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("@/pages/overview"),
    "OverviewPage",
  ),
});
const bins = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bins",
  component: lazyRouteComponent(() => import("@/pages/bins"), "BinsPage"),
});
const bin = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bins/$stationId",
  component: lazyRouteComponent(() => import("@/pages/bins"), "BinPage"),
});
function stationSearch(search: Record<string, unknown>): { station?: string } {
  return {
    station: typeof search.station === "string" ? search.station : undefined,
  };
}
const records = createRoute({
  getParentRoute: () => rootRoute,
  path: "/records",
  validateSearch: (search: Record<string, unknown>) => ({
    ...stationSearch(search),
    view:
      search.view === "collections"
        ? ("collections" as const)
        : ("sorting" as const),
  }),
  component: lazyRouteComponent(() => import("@/pages/records"), "RecordsPage"),
});
const inference = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inference",
  validateSearch: stationSearch,
  component: lazyRouteComponent(
    () => import("@/pages/inference"),
    "InferencePage",
  ),
});
// Preserve saved links while keeping the public navigation consistent.
const legacyStations = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stations",
  beforeLoad: () => {
    throw redirect({ to: "/bins", replace: true });
  },
});
const legacyStation = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stations/$stationId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/bins/$stationId", params, replace: true });
  },
});
const legacyCollections = createRoute({
  getParentRoute: () => rootRoute,
  path: "/collections",
  validateSearch: stationSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/records",
      search: { ...search, view: "collections" },
      replace: true,
    });
  },
});
export const router = createRouter({
  routeTree: rootRoute.addChildren([
    overview,
    bins,
    bin,
    records,
    legacyStations,
    legacyStation,
    legacyCollections,
    inference,
  ]),
  scrollRestoration: true,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
