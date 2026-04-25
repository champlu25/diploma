import { Link, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import type { AuthUser } from "../../types/user";
import { getRoleLabel } from "../../utils/roles";
import { Alert } from "../ui/Alert/Alert";
import { IconButton } from "../ui/IconButton/IconButton";
import { Icon } from "../ui/Icon/Icon";
import styles from "./AppShell.module.scss";

interface AppShellProps {
  currentUser: AuthUser;
  onLogout: () => Promise<void>;
  sessionError: string | null;
}

export function AppShell({ currentUser, onLogout, sessionError }: AppShellProps) {
  const location = useLocation();
  const homeLabel = currentUser.role === "owner" ? "Пользователи" : "Главная";
  const isHomeActive = location.pathname === "/";
  const isCompaniesActive = location.pathname.startsWith("/companies");
  const isDealsActive = location.pathname.startsWith("/deals");
  const homeIcon = currentUser.role === "owner" ? "users" : "home";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>БЛИК CRM</div>

        <nav className={styles.nav} aria-label="Навигация">
          <Link to="/" className={clsx(styles.link, isHomeActive && styles.active)}>
            <Icon name={homeIcon} size={16} />
            {homeLabel}
          </Link>
          <Link
            to="/companies"
            className={clsx(styles.link, isCompaniesActive && styles.active)}
          >
            <Icon name="companies" size={16} />
            Компании
          </Link>
          <Link to="/deals" className={clsx(styles.link, isDealsActive && styles.active)}>
            <Icon name="deals" size={16} />
            Сделки
          </Link>
        </nav>

        <div className={styles.user}>
          <div className={styles.meta}>
            <div className={styles.email}>{currentUser.email}</div>
            <div className={styles.role}>{getRoleLabel(currentUser.role)}</div>
          </div>
          <IconButton
            onClick={() => void onLogout()}
            aria-label="Выйти"
            title="Выйти"
          >
            <Icon name="logout" size={18} />
          </IconButton>
        </div>
      </header>

      <main className={styles.main}>
        {sessionError && <Alert tone="error">{sessionError}</Alert>}
        <Outlet />
      </main>
    </div>
  );
}
