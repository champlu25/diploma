import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { CompanyDetailsPage } from "./pages/CompanyDetailsPage/CompanyDetailsPage";
import { CompaniesPage } from "./pages/CompaniesPage/CompaniesPage";
import { DashboardsPage } from "./pages/DashboardsPage/DashboardsPage";
import { DealsPage } from "./pages/DealsPage/DealsPage";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
import { APP_ROUTES, APP_ROUTE_SEGMENTS } from "./constants/routes";
import type { CurrentUser } from "./types/user";

interface CreateAppRouterOptions {
  currentUser: CurrentUser | null;
  sessionError: string | null;
  onLogin: (user: CurrentUser) => void;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void | Promise<void>;
  onCurrentUserUpdated: (user: CurrentUser) => void;
}

const redirect = (to: string) => <Navigate to={to} replace />;

const protectedPage = (currentUser: CurrentUser | null, page: ReactNode) => {
  if (!currentUser) {
    return redirect(APP_ROUTES.login);
  }

  if (currentUser.mustChangePassword) {
    return redirect(APP_ROUTES.root);
  }

  return page;
};

export const createAppRouter = ({
  currentUser,
  sessionError,
  onLogin,
  onLogout,
  onPasswordChanged,
  onCurrentUserUpdated,
}: CreateAppRouterOptions) =>
  createBrowserRouter([
    {
      path: APP_ROUTES.login,
      element: currentUser ? redirect(APP_ROUTES.root) : <LoginPage onLogin={onLogin} />,
    },
    {
      path: APP_ROUTES.root,
      element: currentUser ? (
        <AppShell
          currentUser={currentUser}
          onLogout={onLogout}
          sessionError={sessionError}
          onPasswordChanged={onPasswordChanged}
        />
      ) : (
        redirect(APP_ROUTES.login)
      ),
      children: [
        {
          index: true,
          element: currentUser?.mustChangePassword
            ? redirect(APP_ROUTE_SEGMENTS.settings)
            : redirect(APP_ROUTE_SEGMENTS.deals),
        },
        {
          path: APP_ROUTE_SEGMENTS.companies,
          element: protectedPage(
            currentUser,
            currentUser && <CompaniesPage currentUser={currentUser} />,
          ),
        },
        {
          path: APP_ROUTE_SEGMENTS.companyDetails,
          element: protectedPage(
            currentUser,
            currentUser && <CompanyDetailsPage currentUser={currentUser} />,
          ),
        },
        {
          path: APP_ROUTE_SEGMENTS.deals,
          element: protectedPage(
            currentUser,
            currentUser && <DealsPage currentUser={currentUser} />,
          ),
        },
        {
          path: APP_ROUTE_SEGMENTS.dashboards,
          element: protectedPage(
            currentUser,
            currentUser && <DashboardsPage currentUser={currentUser} />,
          ),
        },
        {
          path: APP_ROUTE_SEGMENTS.settings,
          element: currentUser ? (
            <SettingsPage currentUser={currentUser} onCurrentUserUpdated={onCurrentUserUpdated} />
          ) : (
            redirect(APP_ROUTES.login)
          ),
        },
      ],
    },
    {
      path: "*",
      element: redirect(currentUser ? APP_ROUTES.root : APP_ROUTES.login),
    },
  ]);
