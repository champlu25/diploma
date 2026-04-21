import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  createOwnerPasswordLink,
  getUsers,
  inviteUser,
  type InviteRole,
} from "../api/usersApi";
import type { AuthUser, User } from "../types/user";
import { getApiErrorMessage } from "../utils/httpError";
import { getRoleLabel } from "../utils/roles";

interface AdminPageProps {
  currentUser: AuthUser;
  onLogout: () => Promise<void>;
}

export function AdminPage({ currentUser, onLogout }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("manager");
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [isRowActionLoading, setIsRowActionLoading] = useState<number | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [rowActionSuccess, setRowActionSuccess] = useState<string | null>(null);
  const [manualPasswordLink, setManualPasswordLink] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setIsUsersLoading(true);
      setUsersError(null);
      const loadedUsers = await getUsers();
      setUsers(loadedUsers);
    } catch (requestError) {
      setUsersError(getApiErrorMessage(requestError, "Не удалось загрузить пользователей."));
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadUsers]);

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inviteEmail.trim()) {
      setInviteError("Введите email сотрудника.");
      return;
    }

    try {
      setIsInviteSubmitting(true);
      setInviteError(null);
      setInviteSuccess(null);
      setLastInviteLink(null);

      const result = await inviteUser(inviteEmail.trim(), inviteRole);
      setInviteSuccess(result.message);
      setLastInviteLink(result.inviteLink ?? null);
      setInviteEmail("");
      await loadUsers();
    } catch (requestError) {
      setInviteError(getApiErrorMessage(requestError, "Не удалось отправить приглашение."));
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleOpenPasswordPage = async (user: User) => {
    try {
      setIsRowActionLoading(user.id);
      setRowActionError(null);
      setRowActionSuccess(null);
      setManualPasswordLink(null);

      const result = await createOwnerPasswordLink(user.id);
      const popup = window.open(result.setupLink, "_blank", "noopener,noreferrer");

      if (!popup) {
        setManualPasswordLink(result.setupLink);
        setRowActionError(
          "Браузер заблокировал новую вкладку. Используйте ссылку ниже, чтобы открыть страницу пароля.",
        );
        return;
      }

      setRowActionSuccess(`Страница пароля открыта для ${result.user.email}.`);
    } catch (requestError) {
      setRowActionError(
        getApiErrorMessage(requestError, "Не удалось создать ссылку для смены пароля."),
      );
    } finally {
      setIsRowActionLoading(null);
    }
  };

  return (
    <section className="card card--wide">
      <header className="card__header">
        <div>
          <h1 className="card__title">Панель владельца</h1>
          <p className="card__subtitle">
            Вы вошли как <strong>{currentUser.email}</strong> ({getRoleLabel(currentUser.role)}).
          </p>
        </div>
        <button className="button button--ghost" onClick={() => void onLogout()}>
          Выйти
        </button>
      </header>

      <section className="section">
        <h2 className="section__title">Пригласить сотрудника</h2>
        <form className="form form--inline" onSubmit={handleInviteSubmit}>
          <label className="form__field">
            <span className="form__label">Эл. почта</span>
            <input
              className="form__input"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              disabled={isInviteSubmitting}
              placeholder="employee@company.com"
            />
          </label>

          <label className="form__field">
            <span className="form__label">Роль</span>
            <select
              className="form__input"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as InviteRole)}
              disabled={isInviteSubmitting}
            >
              <option value="manager">Менеджер</option>
              <option value="group_lead">Руководитель группы</option>
            </select>
          </label>

          <label className="form__field form__field--stretch">
            <button className="button" type="submit" disabled={isInviteSubmitting}>
              {isInviteSubmitting ? "Отправка..." : "Отправить приглашение"}
            </button>
          </label>
        </form>

        {inviteError && <p className="status status--error">{inviteError}</p>}
        {inviteSuccess && <p className="status status--success">{inviteSuccess}</p>}
        {lastInviteLink && (
          <p className="form__helper">
            Отладочная ссылка приглашения:{" "}
            <a className="link" href={lastInviteLink}>{lastInviteLink}</a>
          </p>
        )}
      </section>

      <section className="section">
        <header className="section__header">
          <h2 className="section__title">Пользователи</h2>
          <button className="button button--ghost" onClick={() => void loadUsers()}>
            Обновить
          </button>
        </header>

        <p className="form__hint">Действие: открыть страницу смены пароля для любого пользователя.</p>

        {isUsersLoading && <p className="status">Загрузка пользователей...</p>}
        {usersError && <p className="status status--error">{usersError}</p>}
        {rowActionError && <p className="status status--error">{rowActionError}</p>}
        {rowActionSuccess && <p className="status status--success">{rowActionSuccess}</p>}
        {manualPasswordLink && (
          <p className="form__helper">
            Ручная ссылка для смены пароля:{" "}
            <a className="link" href={manualPasswordLink}>{manualPasswordLink}</a>
          </p>
        )}

        {!isUsersLoading && !usersError && (
          <div className="users-table">
            <div className="users-table__row users-table__row--head">
              <span>ID</span>
              <span>Эл. почта</span>
              <span>Роль</span>
              <span>Действия</span>
            </div>

            {users.map((user) => {
              const isBusy = isRowActionLoading === user.id;

              return (
                <div className="users-table__row" key={user.id}>
                  <span>{user.id}</span>
                  <span>{user.email}</span>
                  <span>{getRoleLabel(user.role)}</span>
                  <div className="users-table__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleOpenPasswordPage(user)}
                    >
                      {isBusy ? "Создание ссылки..." : "Открыть страницу пароля"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
