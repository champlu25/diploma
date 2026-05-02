import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { CurrentUser } from "../../types/user";
import { getRoleLabel } from "../../utils/roles";
import { Alert } from "../ui/Alert/Alert";
import { ChangePasswordModal } from "../ChangePasswordModal/ChangePasswordModal";
import { IconButton } from "../ui/IconButton/IconButton";
import { Icon } from "../ui/Icon/Icon";
import styles from "./AppShell.module.scss";

interface AppShellProps {
  currentUser: CurrentUser;
  onLogout: () => Promise<void>;
  sessionError: string | null;
  onPasswordChanged?: () => void | Promise<void>;
}

export function AppShell({
  currentUser,
  onLogout,
  sessionError,
  onPasswordChanged,
}: AppShellProps) {
  const location = useLocation();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const isCompaniesActive = location.pathname.startsWith("/companies");
  const isDealsActive = location.pathname.startsWith("/deals");
  const isDashboardsActive = location.pathname.startsWith("/dashboards");
  const isSettingsActive = location.pathname.startsWith("/settings");

  useEffect(() => {
    if (currentUser.mustChangePassword) {
      setIsPasswordModalOpen(true);
    }
  }, [currentUser.mustChangePassword]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>БЛИК CRM</div>

        <nav className={styles.nav} aria-label="Навигация">
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
          <Link
            to="/dashboards"
            className={clsx(styles.link, isDashboardsActive && styles.active)}
          >
            <Icon name="dashboards" size={16} />
            Дашборды
          </Link>
        </nav>

        <div className={styles.user}>
          <div className={styles.meta}>
            <div className={styles.email}>{currentUser.username}</div>
            <div className={styles.role}>{getRoleLabel(currentUser.role)}</div>
          </div>

          <Link
            to="/settings"
            className={clsx(styles.iconLink, isSettingsActive && styles.iconLinkActive)}
            aria-label="Настройки"
            title="Настройки"
          >
            <Icon name="settings" size={18} />
          </Link>

          <IconButton onClick={() => void onLogout()} aria-label="Выйти" title="Выйти">
            <Icon name="logout" size={18} />
          </IconButton>
        </div>
      </header>

      <main className={styles.main}>
        {sessionError && <Alert tone="error">{sessionError}</Alert>}
        <Outlet
          context={{
            openChangePassword: () => setIsPasswordModalOpen(true),
          }}
        />
      </main>

      <ChangePasswordModal
        currentUser={currentUser}
        open={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onPasswordChanged={onPasswordChanged}
      />
    </div>
  );
}
