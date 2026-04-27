import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useOutletContext } from "react-router-dom";
import {
  createUser,
  getUsers,
  resetUserPassword,
  type CreateUserRole,
} from "../../api/usersApi";
import type { AuthUser, User } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { getRoleLabel } from "../../utils/roles";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Badge } from "../../components/ui/Badge/Badge";
import { Button } from "../../components/ui/Button/Button";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField, SelectField } from "../../components/ui/Field/Field";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { Modal } from "../../components/ui/Modal/Modal";
import styles from "./AdminPage.module.scss";

interface AdminPageProps {
  currentUser: AuthUser;
}

interface AppShellOutletContext {
  openChangePassword: () => void;
}

export function AdminPage({ currentUser }: AdminPageProps) {
  const { openChangePassword } = useOutletContext<AppShellOutletContext>();
  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createRole, setCreateRole] = useState<CreateUserRole>("manager");
  const [createGroupLeadUserId, setCreateGroupLeadUserId] =
    useState<string>("");
  const [createLastName, setCreateLastName] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createMiddleName, setCreateMiddleName] = useState("");
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [isRowActionLoading, setIsRowActionLoading] = useState<number | null>(
    null
  );
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalTitle, setPasswordModalTitle] = useState<string | null>(
    null
  );
  const [passwordModalKind, setPasswordModalKind] = useState<
    "create" | "reset"
  >("create");
  const [passwordModalUsername, setPasswordModalUsername] = useState<
    string | null
  >(null);
  const [passwordModalValue, setPasswordModalValue] = useState<string | null>(
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

  const openPasswordModal = (params: {
    title: string;
    username: string;
    tempPassword: string;
    kind: "create" | "reset";
  }) => {
    setPasswordModalTitle(params.title);
    setPasswordModalUsername(params.username);
    setPasswordModalValue(params.tempPassword);
    setPasswordModalKind(params.kind);
    setPasswordModalOpen(true);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createUsername.trim()) {
      setCreateError("Введите логин сотрудника.");
      return;
    }

    if (createRole === "manager" && !createGroupLeadUserId) {
      setCreateError("Для менеджера нужно выбрать руководителя группы.");
      return;
    }

    try {
      setIsCreateSubmitting(true);
      setCreateError(null);

      const result = await createUser({
        username: createUsername.trim(),
        role: createRole,
        groupLeadUserId:
          createRole === "manager" ? Number(createGroupLeadUserId) : null,
        lastName: createLastName.trim(),
        firstName: createFirstName.trim(),
        middleName: createMiddleName.trim(),
      });

      openPasswordModal({
        title: "Временный пароль создан",
        username: result.user.username,
        tempPassword: result.tempPassword,
        kind: "create",
      });

      setCreateModalOpen(false);
      setCreateUsername("");
      setCreateLastName("");
      setCreateFirstName("");
      setCreateMiddleName("");
      setCreateRole("manager");
      setCreateGroupLeadUserId(groupLeads[0] ? String(groupLeads[0].id) : "");

      await loadUsers();
    } catch (requestError) {
      setCreateError(
        getApiErrorMessage(requestError, "Не удалось создать пользователя.")
      );
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      setIsRowActionLoading(user.id);
      setRowActionError(null);

      const result = await resetUserPassword(user.id);

      openPasswordModal({
        title: "Сбросить пароль",
        username: user.username,
        tempPassword: result.tempPassword,
        kind: "reset",
      });

      await loadUsers();
    } catch (requestError) {
      setRowActionError(
        getApiErrorMessage(requestError, "Не удалось сбросить пароль.")
      );
    } finally {
      setIsRowActionLoading(null);
    }
  };

  const usersMessages = useMemo(
    () => Boolean(usersError || rowActionError),
    [rowActionError, usersError]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Администрирование"
        subtitle={`Вы вошли как ${currentUser.username} (${getRoleLabel(currentUser.role)}).`}
      />

      <div className={styles.topActions}>
        <Button type="button" variant="ghost" onClick={openChangePassword}>
          Сменить пароль
        </Button>
      </div>

      <div className={styles.toolbar}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          Пользователи
        </h2>
        <div className={styles.toolbarActions}>
          <Button
            type="button"
            onClick={() => {
              if (
                createRole === "manager" &&
                !createGroupLeadUserId &&
                groupLeads.length > 0
              ) {
                setCreateGroupLeadUserId(String(groupLeads[0].id));
              }

              setCreateModalOpen(true);
            }}
          >
            Создать сотрудника
          </Button>
        </div>
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
        </div>
      )}

      {!isUsersLoading && !usersError && (
        <div className={styles.usersGrid}>
          {users.length === 0 && (
            <div className={styles.emptyText}>Пользователей пока нет.</div>
          )}

          {users.map((user) => {
            const isBusyPassword = isRowActionLoading === user.id;
            const roleLabel = getRoleLabel(user.role);
            const fullName =
              [user.lastName, user.firstName, user.middleName]
                .filter(Boolean)
                .join(" ") || "—";

            return (
              <div key={user.id} className={styles.userCard}>
                <div className={styles.userCardTop}>
                  <div className={styles.userCardTitleRow}>
                    <div className={styles.userCardUsername}>
                      {user.username}
                    </div>
                    <Badge>{roleLabel}</Badge>
                  </div>
                  <div className={styles.userCardName}>{fullName}</div>

                  {user.role === "manager" && user.groupLeadUsername && (
                    <div className={styles.userCardMeta}>
                      Руководитель:{" "}
                      <strong>{user.groupLeadUsername}</strong>
                    </div>
                  )}
                </div>

                <div className={styles.userCardActions}>
                  <Button
                    className={styles.fullWidthButton}
                    variant="ghost"
                    onClick={() => void handleResetPassword(user)}
                    disabled={isBusyPassword || user.role === "owner"}
                  >
                    {isBusyPassword ? <Spinner size={18} /> : "Сбросить пароль"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createModalOpen}
        title="Создать сотрудника"
        onClose={() => setCreateModalOpen(false)}
        className={styles.createModal}
      >
        <form className={styles.createForm} onSubmit={handleCreateSubmit} noValidate>
          <InputField
            label="Логин"
            value={createUsername}
            onChange={(event) => setCreateUsername(event.target.value)}
            disabled={isCreateSubmitting}
            placeholder="например: ivanov"
            required
          />

          <SelectField
            label="Роль"
            value={createRole}
            onChange={(event) => {
              const nextRole = event.target.value as CreateUserRole;
              setCreateRole(nextRole);
              if (nextRole === "group_lead") {
                setCreateGroupLeadUserId("");
                return;
              }

              if (!createGroupLeadUserId && groupLeads.length > 0) {
                setCreateGroupLeadUserId(String(groupLeads[0].id));
              }
            }}
            disabled={isCreateSubmitting}
            options={[
              { value: "manager", label: "Менеджер" },
              { value: "group_lead", label: "Руководитель группы" },
            ]}
          />

          <SelectField
            label="Руководитель группы"
            value={createRole === "manager" ? createGroupLeadUserId : ""}
            onChange={(event) => setCreateGroupLeadUserId(event.target.value)}
            disabled={
              isCreateSubmitting || createRole !== "manager" || groupLeads.length === 0
            }
            options={
              createRole !== "manager"
                ? [{ value: "", label: "Не требуется", disabled: true }]
                : groupLeads.length === 0
                  ? [
                      {
                        value: "",
                        label: "Сначала создайте руководителя группы",
                        disabled: true,
                      },
                    ]
                  : groupLeads.map((lead) => ({
                      value: String(lead.id),
                      label: lead.username,
                    }))
            }
          />

          <div className={styles.createNameRow}>
            <InputField
              label="Фамилия"
              value={createLastName}
              onChange={(event) => setCreateLastName(event.target.value)}
              disabled={isCreateSubmitting}
              placeholder="необязательно"
            />

            <InputField
              label="Имя"
              value={createFirstName}
              onChange={(event) => setCreateFirstName(event.target.value)}
              disabled={isCreateSubmitting}
              placeholder="необязательно"
            />

            <InputField
              label="Отчество"
              value={createMiddleName}
              onChange={(event) => setCreateMiddleName(event.target.value)}
              disabled={isCreateSubmitting}
              placeholder="необязательно"
            />
          </div>

          {createError && <Alert tone="error">{createError}</Alert>}

          <Divider />

          <div className={styles.createActions}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateModalOpen(false)}
              disabled={isCreateSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isCreateSubmitting}>
              {isCreateSubmitting ? <Spinner size={20} /> : "Создать"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* модал выбора руководителя не нужен: выбираем по почте */}
      <Modal
        open={passwordModalOpen}
        title={passwordModalTitle ?? "Временный пароль"}
        onClose={() => setPasswordModalOpen(false)}
        className={styles.setupModal}
      >
        <div className={styles.setupTop}>
          {passwordModalKind === "create" && (
            <div className={styles.setupHint}>
              Передайте сотруднику логин и временный пароль. При первом входе система попросит сменить пароль.
            </div>
          )}

          <div>
            Логин: <strong>{passwordModalUsername ?? "—"}</strong>
          </div>

          <div>
            Временный пароль:{" "}
            <strong className={styles.link}>{passwordModalValue ?? "—"}</strong>
          </div>

          {passwordModalKind === "create" && passwordModalValue && (
            <div className={styles.setupLinks}>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(passwordModalValue);
                  } catch {
                    // ignore
                  }
                }}
              >
                Скопировать пароль
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
