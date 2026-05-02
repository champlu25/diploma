import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { CompanyDetailsPage } from "./pages/CompanyDetailsPage/CompanyDetailsPage";
import { CompaniesPage } from "./pages/CompaniesPage/CompaniesPage";
import { DashboardsPage } from "./pages/DashboardsPage/DashboardsPage";
import { DealsPage } from "./pages/DealsPage/DealsPage";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
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
    return redirect("/login");
  }

  if (currentUser.mustChangePassword) {
    return redirect("/");
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
      path: "/login",
      element: currentUser ? redirect("/") : <LoginPage onLogin={onLogin} />,
    },
    {
      path: "/",
      element: currentUser ? (
        <AppShell
          currentUser={currentUser}
          onLogout={onLogout}
          sessionError={sessionError}
          onPasswordChanged={onPasswordChanged}
        />
      ) : (
        redirect("/login")
      ),
      children: [
        {
          index: true,
          element: currentUser?.mustChangePassword ? redirect("settings") : redirect("deals"),
        },
        {
          path: "companies",
          element: protectedPage(
            currentUser,
            currentUser && <CompaniesPage currentUser={currentUser} />,
          ),
        },
        {
          path: "companies/:companyId",
          element: protectedPage(
            currentUser,
            currentUser && <CompanyDetailsPage currentUser={currentUser} />,
          ),
        },
        {
          path: "deals",
          element: protectedPage(
            currentUser,
            currentUser && <DealsPage currentUser={currentUser} />,
          ),
        },
        {
          path: "dashboards",
          element: protectedPage(
            currentUser,
            currentUser && <DashboardsPage currentUser={currentUser} />,
          ),
        },
        {
          path: "settings",
          element: currentUser ? (
            <SettingsPage currentUser={currentUser} onCurrentUserUpdated={onCurrentUserUpdated} />
          ) : (
            redirect("/login")
          ),
        },
      ],
    },
    {
      path: "*",
      element: redirect(currentUser ? "/" : "/login"),
    },
  ]);
