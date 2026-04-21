import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, logout } from "./api/authApi";
import { AdminPage } from "./pages/AdminPage";
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
      <main className="auth-layout">
        <section className="card">
          <p className="status">Проверка сессии...</p>
        </section>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <main className="auth-layout">
        {sessionError && <p className="status status--error">{sessionError}</p>}

        <Routes>
          <Route path="/set-password" element={<SetPasswordPage />} />

          <Route
            path="/login"
            element={
              currentUser ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage onLogin={setCurrentUser} />
              )
            }
          />

          <Route
            path="/"
            element={
              !currentUser ? (
                <Navigate to="/login" replace />
              ) : currentUser.role === "owner" ? (
                <AdminPage currentUser={currentUser} onLogout={handleLogout} />
              ) : (
                <UserHomePage currentUser={currentUser} onLogout={handleLogout} />
              )
            }
          />

          <Route
            path="*"
            element={<Navigate to={currentUser ? "/" : "/login"} replace />}
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
