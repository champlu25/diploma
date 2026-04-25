import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, logout } from "../api/authApi";
import { AppShell } from "../components/AppShell/AppShell";
import { AdminPage } from "../pages/AdminPage/AdminPage";
import { CompaniesPage } from "../pages/CompaniesPage/CompaniesPage";
import { DealsPage } from "../pages/DealsPage/DealsPage";
import { LoginPage } from "../pages/LoginPage/LoginPage";
import { SetPasswordPage } from "../pages/SetPasswordPage/SetPasswordPage";
import { UserHomePage } from "../pages/UserHomePage/UserHomePage";
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
        <Route path="/set-password" element={<SetPasswordPage />} />

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
              />
            )
          }
        >
          <Route
            index
            element={
              currentUser?.role === "owner" ? (
                <AdminPage currentUser={currentUser!} />
              ) : (
                <UserHomePage currentUser={currentUser!} />
              )
            }
          />
          <Route path="companies" element={<CompaniesPage currentUser={currentUser!} />} />
          <Route path="deals" element={<DealsPage currentUser={currentUser!} />} />
        </Route>

        <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
