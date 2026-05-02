import { useCallback, useEffect, useMemo, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { getCurrentUser, logout } from "./api/authApi";
import { Spinner } from "./components/ui/Spinner/Spinner";
import { createAppRouter } from "./router";
import type { CurrentUser } from "./types/user";
import { getApiErrorMessage } from "./utils/httpError";
import styles from "./styles/App.module.scss";

function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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

  const handleLogin = useCallback((user: CurrentUser) => {
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

  const handleCurrentUserUpdated = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
  }, []);

  const router = useMemo(
    () =>
      createAppRouter({
        currentUser,
        sessionError,
        onLogin: handleLogin,
        onLogout: handleLogout,
        onPasswordChanged: handlePasswordChanged,
        onCurrentUserUpdated: handleCurrentUserUpdated,
      }),
    [
      currentUser,
      handleCurrentUserUpdated,
      handleLogin,
      handleLogout,
      handlePasswordChanged,
      sessionError,
    ],
  );

  if (isSessionLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size={28} />
        <div className={styles.loadingText}>Проверка сессии...</div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default App;
