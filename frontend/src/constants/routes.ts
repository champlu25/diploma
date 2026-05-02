export const APP_ROUTES = {
  root: "/",
  login: "/login",
  companies: "/companies",
  companyDetails: (companyId: number | string) => `/companies/${companyId}`,
  deals: "/deals",
  dashboards: "/dashboards",
  settings: "/settings",
} as const;

export const APP_ROUTE_SEGMENTS = {
  companies: "companies",
  companyDetails: "companies/:companyId",
  deals: "deals",
  dashboards: "dashboards",
  settings: "settings",
} as const;
