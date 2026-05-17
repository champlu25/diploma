export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const API_ROUTES = {
  authLogin: "/api/auth/login",
  authLogout: "/api/auth/logout",
  authMe: "/api/auth/me",
  authChangePassword: "/api/auth/change-password",

  companies: "/api/companies",
  companyById: (companyId: number) => `/api/companies/${companyId}`,
  companyLookups: "/api/companies/lookups",
  companyStaticLookups: "/api/companies/static-lookups",
  companyDynamicLookups: "/api/companies/dynamic-lookups",
  companyTransfer: (companyId: number) => `/api/companies/${companyId}/transfer`,

  deals: "/api/deals",
  dealById: (dealId: number) => `/api/deals/${dealId}`,
  dealLookups: "/api/deals/lookups",
  dealStaticLookups: "/api/deals/static-lookups",
  dealDynamicLookups: "/api/deals/dynamic-lookups",
  companyDeals: (companyId: number) => `/api/companies/${companyId}/deals`,
  dealLifecycleStatus: (dealId: number) => `/api/deals/${dealId}/lifecycle-status`,

  dashboardsChartViewSettings: "/api/dashboards/chart-view-settings",
  dashboardsChartViewSettingByKey: (chartKey: string) =>
    `/api/dashboards/chart-view-settings/${encodeURIComponent(chartKey)}`,

  ownerCommunicationChannels: "/api/owner/communication-channels",
  ownerCommunicationChannelById: (id: number) => `/api/owner/communication-channels/${id}`,

  ownerLeasingCompanies: "/api/owner/leasing-companies",
  ownerLeasingCompanyById: (id: number) => `/api/owner/leasing-companies/${id}`,

  users: "/api/users",
  ownerUsers: "/api/owner/users",
  ownerUserResetPassword: (userId: number) => `/api/owner/users/${userId}/reset-password`,
  groupLeadManagers: "/api/group-lead/managers",
  usersTransferTargets: "/api/users/transfer-targets",
} as const;
