import { createElement, type ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { CompanyDetailsPage } from "./pages/CompanyDetailsPage/CompanyDetailsPage";
import { CompaniesPage } from "./pages/CompaniesPage/CompaniesPage";
import { DashboardsPage } from "./pages/DashboardsPage/DashboardsPage";
import { DealsPage } from "./pages/DealsPage/DealsPage";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
import type { AuthUser } from "./types/user";

interface CreateAppRouterOptions {
  currentUser: AuthUser | null;
  sessionError: string | null;
  onLogin: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void | Promise<void>;
  onCurrentUserUpdated: (user: AuthUser) => void;
}

const redirect = (to: string) => createElement(Navigate, { to, replace: true });

const protectedPage = (currentUser: AuthUser | null, page: ReactNode) => {
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
      element: currentUser ? redirect("/") : createElement(LoginPage, { onLogin }),
    },
    {
      path: "/",
      element: currentUser ? (
        createElement(AppShell, {
          currentUser,
          onLogout,
          sessionError,
          onPasswordChanged,
        })
      ) : (
        redirect("/login")
      ),
      children: [
        {
          index: true,
          element: currentUser?.mustChangePassword ? (
            redirect("settings")
          ) : (
            redirect("deals")
          ),
        },
        {
          path: "companies",
          element: protectedPage(
            currentUser,
            currentUser && createElement(CompaniesPage, { currentUser }),
          ),
        },
        {
          path: "companies/:companyId",
          element: protectedPage(
            currentUser,
            currentUser && createElement(CompanyDetailsPage, { currentUser }),
          ),
        },
        {
          path: "deals",
          element: protectedPage(
            currentUser,
            currentUser && createElement(DealsPage, { currentUser }),
          ),
        },
        {
          path: "dashboards",
          element: protectedPage(
            currentUser,
            currentUser && createElement(DashboardsPage, { currentUser }),
          ),
        },
        {
          path: "settings",
          element: currentUser ? (
            createElement(SettingsPage, { currentUser, onCurrentUserUpdated })
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
