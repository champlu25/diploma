import { NavLink, Outlet } from "react-router-dom";
import type { AuthUser } from "../types/user";
import { getRoleLabel } from "../utils/roles";

interface AppShellProps {
  currentUser: AuthUser;
  onLogout: () => Promise<void>;
  sessionError: string | null;
}

export function AppShell({ currentUser, onLogout, sessionError }: AppShellProps) {
  const homeLabel = currentUser.role === "owner" ? "Пользователи" : "Главная";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">Лизинг CRM</div>
        <nav className="app-header__nav">
          <NavLink
            end
            to="/"
            className={({ isActive }) =>
              isActive ? "app-header__link app-header__link--active" : "app-header__link"
            }
          >
            {homeLabel}
          </NavLink>
          <NavLink
            to="/companies"
            className={({ isActive }) =>
              isActive ? "app-header__link app-header__link--active" : "app-header__link"
            }
          >
            Компании
          </NavLink>
        </nav>
        <div className="app-header__user">
          <div className="app-header__meta">
            <strong>{currentUser.email}</strong>
            <span>{getRoleLabel(currentUser.role)}</span>
          </div>
          <button className="button button--ghost" onClick={() => void onLogout()}>
            Выйти
          </button>
        </div>
      </header>

      <main className="app-main">
        {sessionError && <p className="status status--error">{sessionError}</p>}
        <Outlet />
      </main>
    </div>
  );
}
