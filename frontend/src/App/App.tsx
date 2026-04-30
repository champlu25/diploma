import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, logout } from "../api/authApi";
import { AppShell } from "../components/AppShell/AppShell";
import { CompanyDetailsPage } from "../pages/CompanyDetailsPage/CompanyDetailsPage";
import { CompaniesPage } from "../pages/CompaniesPage/CompaniesPage";
import { DashboardsPage } from "../pages/DashboardsPage/DashboardsPage";
import { DealsPage } from "../pages/DealsPage/DealsPage";
import { LoginPage } from "../pages/LoginPage/LoginPage";
import { SettingsPage } from "../pages/SettingsPage/SettingsPage";
import type { AuthUser } from "../types/user";
import { getApiErrorMessage } from "../utils/httpError";
import { Spinner } from "../components/ui/Spinner/Spinner";
import styles from "./App.module.scss";

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapSession = async () => {
      try {
        setSessionError(null);
        const user = await getCurrentUser();

        if (!isCancelled) {
          setCurrentUser(user);
        }
      } catch (error) {
        if (!isCancelled) {
          setSessionError(getApiErrorMessage(error, "Не удалось проверить текущую сессию."));
        }
      } finally {
        if (!isCancelled) {
          setIsSessionLoading(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setSessionError(null);
    }
  }, []);

  const handleLogin = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setSessionError(null);
  }, []);

  const handlePasswordChanged = useCallback(async () => {
    try {
      const refreshed = await getCurrentUser();
      setCurrentUser(refreshed);
    } catch {
      // ignore
    }
  }, []);

  const handleCurrentUserUpdated = useCallback((nextUser: AuthUser) => {
    setCurrentUser(nextUser);
  }, []);

  if (isSessionLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size={28} />
        <div className={styles.loadingText}>Проверка сессии...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            currentUser ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )
          }
        />

        <Route
          path="/"
          element={
            !currentUser ? (
              <Navigate to="/login" replace />
            ) : (
              <AppShell
                currentUser={currentUser}
                onLogout={handleLogout}
                sessionError={sessionError}
                onPasswordChanged={handlePasswordChanged}
              />
            )
          }
        >
          <Route
            index
            element={
              currentUser?.mustChangePassword ? (
                <Navigate to="settings" replace />
              ) : (
                <Navigate to="deals" replace />
              )
            }
          />
          <Route
            path="companies"
            element={
              currentUser?.mustChangePassword ? (
                <Navigate to="/" replace />
              ) : (
                <CompaniesPage currentUser={currentUser!} />
              )
            }
          />
          <Route
            path="companies/:companyId"
            element={
              currentUser?.mustChangePassword ? (
                <Navigate to="/" replace />
              ) : (
                <CompanyDetailsPage currentUser={currentUser!} />
              )
            }
          />
          <Route
            path="deals"
            element={
              currentUser?.mustChangePassword ? (
                <Navigate to="/" replace />
              ) : (
                <DealsPage currentUser={currentUser!} />
              )
            }
          />
          <Route
            path="dashboards"
            element={
              currentUser?.mustChangePassword ? (
                <Navigate to="/" replace />
              ) : (
                <DashboardsPage currentUser={currentUser!} />
              )
            }
          />
          <Route
            path="settings"
            element={
              <SettingsPage
                currentUser={currentUser!}
                onCurrentUserUpdated={handleCurrentUserUpdated}
              />
            }
          />
        </Route>

        <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
