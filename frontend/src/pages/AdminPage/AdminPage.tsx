import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createOwnerPasswordLink,
  getUsers,
  inviteUser,
  type InviteRole,
} from "../../api/usersApi";
import type { AuthUser, User } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { getRoleLabel } from "../../utils/roles";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Badge } from "../../components/ui/Badge/Badge";
import { Button } from "../../components/ui/Button/Button";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField, SelectField } from "../../components/ui/Field/Field";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./AdminPage.module.scss";

interface AdminPageProps {
  currentUser: AuthUser;
}

export function AdminPage({ currentUser }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("manager");
  const [inviteGroupLeadUserId, setInviteGroupLeadUserId] =
    useState<string>("");
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [isRowActionLoading, setIsRowActionLoading] = useState<number | null>(
    null
  );
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [rowActionSuccess, setRowActionSuccess] = useState<string | null>(null);
  const [manualPasswordLink, setManualPasswordLink] = useState<string | null>(
    null
  );

  const groupLeads = useMemo(
    () => users.filter((user) => user.role === "group_lead"),
    [users]
  );

  const loadUsers = useCallback(async () => {
    try {
      setIsUsersLoading(true);
      setUsersError(null);
      const loadedUsers = await getUsers();
      setUsers(loadedUsers);
    } catch (requestError) {
      setUsersError(
        getApiErrorMessage(requestError, "Не удалось загрузить пользователей.")
      );
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (
      inviteRole === "manager" &&
      !inviteGroupLeadUserId &&
      groupLeads.length > 0
    ) {
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

      const groupLeadUserId =
        inviteRole === "manager" ? Number(inviteGroupLeadUserId) : null;
      const result = await inviteUser(
        inviteEmail.trim(),
        inviteRole,
        groupLeadUserId
      );

      setInviteSuccess(result.message);
      setLastInviteLink(result.inviteLink ?? null);
      setInviteEmail("");
      await loadUsers();
    } catch (requestError) {
      setInviteError(
        getApiErrorMessage(requestError, "Не удалось отправить приглашение.")
      );
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
      const popup = window.open(
        result.setupLink,
        "_blank",
        "noopener,noreferrer"
      );

      if (!popup) {
        setManualPasswordLink(result.setupLink);
        setRowActionError(
          "Браузер заблокировал новую вкладку. Используйте ссылку ниже, чтобы открыть страницу настройки аккаунта."
        );
        return;
      }

      setRowActionSuccess(
        `Страница настройки аккаунта открыта для ${result.user.email}.`
      );
    } catch (requestError) {
      setRowActionError(
        getApiErrorMessage(
          requestError,
          "Не удалось создать ссылку для настройки аккаунта."
        )
      );
    } finally {
      setIsRowActionLoading(null);
    }
  };

  const usersMessages = useMemo(
    () =>
      Boolean(
        usersError || rowActionError || rowActionSuccess || manualPasswordLink
      ),
    [manualPasswordLink, rowActionError, rowActionSuccess, usersError]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Администрирование"
        subtitle={`Вы вошли как ${currentUser.email} (${getRoleLabel(currentUser.role)}).`}
      />

      <h2 className={styles.sectionTitle}>Пригласить сотрудника</h2>
      <form className={styles.inviteRow} onSubmit={handleInviteSubmit}>
        <InputField
          className={styles.inviteItem}
          label="Эл. почта"
          type="email"
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          disabled={isInviteSubmitting}
          placeholder="employee@company.com"
        />

        <SelectField
          className={styles.inviteItem}
          label="Роль"
          value={inviteRole}
          onChange={(event) => {
            const nextRole = event.target.value as InviteRole;
            setInviteRole(nextRole);
            if (nextRole === "group_lead") setInviteGroupLeadUserId("");
          }}
          disabled={isInviteSubmitting}
          options={[
            { value: "manager", label: "Менеджер" },
            { value: "group_lead", label: "Руководитель группы" },
          ]}
        />

        <SelectField
          className={styles.inviteItem}
          label="Руководитель группы"
          value={inviteRole === "manager" ? inviteGroupLeadUserId : ""}
          onChange={(event) => setInviteGroupLeadUserId(event.target.value)}
          disabled={isInviteSubmitting || inviteRole !== "manager" || groupLeads.length === 0}
          options={
            inviteRole !== "manager"
              ? [{ value: "", label: "Не требуется", disabled: true }]
              : groupLeads.length === 0
                ? [{ value: "", label: "Сначала создайте руководителя группы", disabled: true }]
                : groupLeads.map((lead) => ({ value: String(lead.id), label: lead.email }))
          }
        />

        <div className={styles.inviteButtonItem}>
          <Button type="submit" fullWidth disabled={isInviteSubmitting}>
            {isInviteSubmitting ? <Spinner size={20} /> : "Отправить приглашение"}
          </Button>
        </div>
      </form>

      <div className={styles.messages}>
        {inviteError && <Alert tone="error">{inviteError}</Alert>}
        {inviteSuccess && <Alert tone="success">{inviteSuccess}</Alert>}
        {lastInviteLink && (
          <div>
            Ссылка приглашения:{" "}
            <a
              className={styles.link}
              href={lastInviteLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {lastInviteLink}
            </a>
          </div>
        )}
      </div>

      <Divider />

      <div className={styles.toolbar}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          Пользователи
        </h2>
        <Button type="button" variant="text" onClick={() => void loadUsers()}>
          Обновить
        </Button>
      </div>

      {isUsersLoading && (
        <div className={styles.loadingRow}>
          <Spinner size={22} />
          <div>Загрузка пользователей...</div>
        </div>
      )}

      {usersMessages && (
        <div className={styles.messages}>
          {usersError && <Alert tone="error">{usersError}</Alert>}
          {rowActionError && <Alert tone="error">{rowActionError}</Alert>}
          {rowActionSuccess && <Alert tone="success">{rowActionSuccess}</Alert>}
          {manualPasswordLink && (
            <div>
              Ручная ссылка для настройки аккаунта:{" "}
              <a
                className={styles.link}
                href={manualPasswordLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {manualPasswordLink}
              </a>
            </div>
          )}
        </div>
      )}

      {!isUsersLoading && !usersError && (
        <DataTable>
            <thead>
              <Tr>
                <Th style={{ width: "28%" }}>
                  Почта
                </Th>
                <Th style={{ width: "28%" }}>
                  ФИО
                </Th>
                <Th style={{ width: "18%" }}>
                  Роль
                </Th>
                <Th style={{ width: "26%", textAlign: "left" }}>
                  Действия
                </Th>
              </Tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <Tr>
                  <Td colSpan={4} style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>
                    Пользователей пока нет.
                  </Td>
                </Tr>
              )}

              {users.map((user) => {
                const isBusyPassword = isRowActionLoading === user.id;
                const roleLabel = getRoleLabel(user.role);

                return (
                  <Tr key={user.id}>
                    <Td>{user.email}</Td>
                    <Td>
                      {[user.lastName, user.firstName, user.middleName]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </Td>
                    <Td>
                      <Badge>{roleLabel}</Badge>
                    </Td>
                    <Td>
                      <Button
                        className={styles.fullWidthButton}
                        variant="ghost"
                        onClick={() => void handleOpenPasswordPage(user)}
                        disabled={isBusyPassword}
                      >
                        {isBusyPassword ? (
                          <Spinner size={18} />
                        ) : (
                          "Настроить аккаунт"
                        )}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
        </DataTable>
      )}

      {/* модал выбора руководителя не нужен: выбираем по почте */}
    </div>
  );
}
