import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, logout } from "./api/authApi";
import { AppShell } from "./components/AppShell";
import { AdminPage } from "./pages/AdminPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { LoginPage } from "./pages/LoginPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { UserHomePage } from "./pages/UserHomePage";
import type { AuthUser } from "./types/user";
import { getApiErrorMessage } from "./utils/httpError";

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
    }
  }, []);

  if (isSessionLoading) {
    return (
      <div className="app-loading">
        <p className="status">Проверка сессии...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/set-password"
          element={
            <main className="auth-layout">
              <SetPasswordPage />
            </main>
          }
        />

        <Route
          path="/login"
          element={
            currentUser ? (
              <Navigate to="/" replace />
            ) : (
              <main className="auth-layout">
                <LoginPage onLogin={setCurrentUser} />
              </main>
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
        </Route>

        <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
