import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  assignManagerToGroupLead,
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
}

export function AdminPage({ currentUser }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("manager");
  const [inviteGroupLeadUserId, setInviteGroupLeadUserId] = useState<string>("");
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [isRowActionLoading, setIsRowActionLoading] = useState<number | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [rowActionSuccess, setRowActionSuccess] = useState<string | null>(null);
  const [manualPasswordLink, setManualPasswordLink] = useState<string | null>(null);
  const [assigningManagerId, setAssigningManagerId] = useState<number | null>(null);

  const groupLeads = useMemo(
    () => users.filter((user) => user.role === "group_lead"),
    [users],
  );

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
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (inviteRole === "manager" && !inviteGroupLeadUserId && groupLeads.length > 0) {
      setInviteGroupLeadUserId(String(groupLeads[0].id));
    }
  }, [groupLeads, inviteRole, inviteGroupLeadUserId]);

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inviteEmail.trim()) {
      setInviteError("Введите email сотрудника.");
      return;
    }

    if (inviteRole === "manager" && !inviteGroupLeadUserId) {
      setInviteError("Для менеджера нужно выбрать руководителя группы.");
      return;
    }

    try {
      setIsInviteSubmitting(true);
      setInviteError(null);
      setInviteSuccess(null);
      setLastInviteLink(null);

      const groupLeadUserId = inviteRole === "manager" ? Number(inviteGroupLeadUserId) : null;
      const result = await inviteUser(inviteEmail.trim(), inviteRole, groupLeadUserId);

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

  const handleAssignGroupLead = async (manager: User, nextGroupLeadUserId: string) => {
    const parsed = Number(nextGroupLeadUserId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setRowActionError("Выберите корректного руководителя группы.");
      return;
    }

    try {
      setAssigningManagerId(manager.id);
      setRowActionError(null);
      setRowActionSuccess(null);
      await assignManagerToGroupLead(manager.id, parsed);
      setRowActionSuccess(`Менеджер ${manager.email} закреплен за руководителем группы.`);
      await loadUsers();
    } catch (requestError) {
      setRowActionError(
        getApiErrorMessage(requestError, "Не удалось закрепить менеджера за руководителем группы."),
      );
    } finally {
      setAssigningManagerId(null);
    }
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <h1 className="panel__title">Администрирование</h1>
        <p className="panel__subtitle">
          Вы вошли как <strong>{currentUser.email}</strong> ({getRoleLabel(currentUser.role)}).
        </p>
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
              onChange={(event) => {
                const nextRole = event.target.value as InviteRole;
                setInviteRole(nextRole);
                if (nextRole === "group_lead") {
                  setInviteGroupLeadUserId("");
                }
              }}
              disabled={isInviteSubmitting}
            >
              <option value="manager">Менеджер</option>
              <option value="group_lead">Руководитель группы</option>
            </select>
          </label>

          {inviteRole === "manager" && (
            <label className="form__field">
              <span className="form__label">Руководитель группы</span>
              <select
                className="form__input"
                value={inviteGroupLeadUserId}
                onChange={(event) => setInviteGroupLeadUserId(event.target.value)}
                disabled={isInviteSubmitting || groupLeads.length === 0}
              >
                {groupLeads.length === 0 ? (
                  <option value="">Сначала создайте руководителя группы</option>
                ) : (
                  groupLeads.map((lead) => (
                    <option value={lead.id} key={lead.id}>
                      {lead.email}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

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
            <a className="link" href={lastInviteLink}>
              {lastInviteLink}
            </a>
          </p>
        )}
      </section>

      <section className="section">
        <header className="section__header">
          <h2 className="section__title">Пользователи и группы</h2>
          <button className="button button--ghost" onClick={() => void loadUsers()}>
            Обновить
          </button>
        </header>

        {isUsersLoading && <p className="status">Загрузка пользователей...</p>}
        {usersError && <p className="status status--error">{usersError}</p>}
        {rowActionError && <p className="status status--error">{rowActionError}</p>}
        {rowActionSuccess && <p className="status status--success">{rowActionSuccess}</p>}
        {manualPasswordLink && (
          <p className="form__helper">
            Ручная ссылка для смены пароля:{" "}
            <a className="link" href={manualPasswordLink}>
              {manualPasswordLink}
            </a>
          </p>
        )}

        {!isUsersLoading && !usersError && (
          <div className="users-table users-table--groups">
            <div className="users-table__row users-table__row--head">
              <span>ID</span>
              <span>Эл. почта</span>
              <span>Роль</span>
              <span>Руководитель группы</span>
              <span>Действия</span>
            </div>

            {users.map((user) => {
              const isBusyPassword = isRowActionLoading === user.id;
              const isBusyAssign = assigningManagerId === user.id;

              return (
                <div className="users-table__row" key={user.id}>
                  <span>{user.id}</span>
                  <span>{user.email}</span>
                  <span>{getRoleLabel(user.role)}</span>
                  <span>
                    {user.role === "manager" ? (
                      <select
                        className="form__input users-table__select"
                        value={user.groupLeadUserId ? String(user.groupLeadUserId) : ""}
                        onChange={(event) => void handleAssignGroupLead(user, event.target.value)}
                        disabled={isBusyAssign || groupLeads.length === 0}
                      >
                        {groupLeads.length === 0 ? (
                          <option value="">Нет руководителей группы</option>
                        ) : (
                          groupLeads.map((lead) => (
                            <option value={lead.id} key={lead.id}>
                              {lead.email}
                            </option>
                          ))
                        )}
                      </select>
                    ) : (
                      user.groupLeadEmail || "—"
                    )}
                  </span>
                  <div className="users-table__actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      disabled={isBusyPassword}
                      onClick={() => void handleOpenPasswordPage(user)}
                    >
                      {isBusyPassword ? "Создание ссылки..." : "Открыть страницу пароля"}
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
