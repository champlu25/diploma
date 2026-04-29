import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthUser, User } from "../../types/user";
import { updateCurrentUserProfile } from "../../api/authApi";
import {
  createUser,
  getGroupLeadManagers,
  getUsers,
  resetUserPassword,
  type CreateUserRole,
  type GroupManager,
} from "../../api/usersApi";
import { createOwnerLeasingCompany, getOwnerLeasingCompanies } from "../../api/leasingCompaniesApi";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Badge } from "../../components/ui/Badge/Badge";
import { Button } from "../../components/ui/Button/Button";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField, SelectField } from "../../components/ui/Field/Field";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { getApiErrorMessage } from "../../utils/httpError";
import { getRoleLabel } from "../../utils/roles";
import type { DealLookupItem } from "../../types/deal";
import styles from "./SettingsPage.module.scss";

interface SettingsPageProps {
  currentUser: AuthUser;
  onCurrentUserUpdated: (nextUser: AuthUser) => void;
}

interface AppShellOutletContext {
  openChangePassword: () => void;
}

const getFullName = (person: {
  lastName: string | null;
  firstName: string | null;
  middleName?: string | null;
}): string => {
  const fullName = [person.lastName, person.firstName, person.middleName]
    .filter(Boolean)
    .join(" ");
  return fullName || "—";
};

export function SettingsPage({ currentUser, onCurrentUserUpdated }: SettingsPageProps) {
  const { openChangePassword } = useOutletContext<AppShellOutletContext>();

  const [lastName, setLastName] = useState(currentUser.lastName ?? "");
  const [firstName, setFirstName] = useState(currentUser.firstName ?? "");
  const [middleName, setMiddleName] = useState(currentUser.middleName ?? "");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLastName(currentUser.lastName ?? "");
    setFirstName(currentUser.firstName ?? "");
    setMiddleName(currentUser.middleName ?? "");
  }, [currentUser.firstName, currentUser.lastName, currentUser.middleName]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsProfileSaving(true);
      setProfileError(null);
      setProfileSuccess(null);

      const updated = await updateCurrentUserProfile({
        lastName: lastName.trim() ? lastName.trim() : null,
        firstName: firstName.trim() ? firstName.trim() : null,
        middleName: middleName.trim() ? middleName.trim() : null,
      });

      onCurrentUserUpdated(updated);
      setProfileSuccess("Профиль обновлён.");
    } catch (requestError) {
      setProfileError(getApiErrorMessage(requestError, "Не удалось обновить профиль."));
    } finally {
      setIsProfileSaving(false);
    }
  };

  const [managers, setManagers] = useState<GroupManager[]>([]);
  const [isManagersLoading, setIsManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser.role !== "group_lead") {
      return;
    }

    let isCancelled = false;

    const loadManagers = async () => {
      try {
        setIsManagersLoading(true);
        setManagersError(null);
        const loadedManagers = await getGroupLeadManagers();
        if (!isCancelled) {
          setManagers(loadedManagers);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setManagersError(
            getApiErrorMessage(requestError, "Не удалось загрузить менеджеров группы."),
          );
        }
      } finally {
        if (!isCancelled) {
          setIsManagersLoading(false);
        }
      }
    };

    void loadManagers();

    return () => {
      isCancelled = true;
    };
  }, [currentUser.role]);

  const isOwner = currentUser.role === "owner";

  const [users, setUsers] = useState<User[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [leasingCompanies, setLeasingCompanies] = useState<DealLookupItem[]>([]);
  const [isLeasingCompaniesLoading, setIsLeasingCompaniesLoading] = useState(false);
  const [leasingCompaniesError, setLeasingCompaniesError] = useState<string | null>(null);
  const [leasingCompanyName, setLeasingCompanyName] = useState("");
  const [isLeasingCompanyCreating, setIsLeasingCompanyCreating] = useState(false);
  const [leasingCompanyCreateError, setLeasingCompanyCreateError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createRole, setCreateRole] = useState<CreateUserRole>("manager");
  const [createGroupLeadUserId, setCreateGroupLeadUserId] = useState<string>("");
  const [createLastName, setCreateLastName] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createMiddleName, setCreateMiddleName] = useState("");
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [isRowActionLoading, setIsRowActionLoading] = useState<number | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalTitle, setPasswordModalTitle] = useState<string | null>(null);
  const [passwordModalKind, setPasswordModalKind] = useState<"create" | "reset">("create");
  const [passwordModalUsername, setPasswordModalUsername] = useState<string | null>(null);
  const [passwordModalValue, setPasswordModalValue] = useState<string | null>(null);

  const groupLeads = useMemo(
    () => users.filter((user) => user.role === "group_lead"),
    [users],
  );

  const loadUsers = useCallback(async () => {
    if (!isOwner) {
      return;
    }

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
  }, [isOwner]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const loadLeasingCompanies = useCallback(async () => {
    if (!isOwner) {
      return;
    }

    try {
      setIsLeasingCompaniesLoading(true);
      setLeasingCompaniesError(null);
      const loaded = await getOwnerLeasingCompanies();
      setLeasingCompanies(loaded);
    } catch (requestError) {
      setLeasingCompaniesError(
        getApiErrorMessage(requestError, "Не удалось загрузить лизинговые компании."),
      );
    } finally {
      setIsLeasingCompaniesLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    void loadLeasingCompanies();
  }, [loadLeasingCompanies]);

  const openTempPasswordModal = (params: {
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

  const handleCreateLeasingCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!leasingCompanyName.trim()) {
      setLeasingCompanyCreateError("Введите название лизинговой компании.");
      return;
    }

    try {
      setIsLeasingCompanyCreating(true);
      setLeasingCompanyCreateError(null);
      await createOwnerLeasingCompany(leasingCompanyName.trim());
      setLeasingCompanyName("");
      await loadLeasingCompanies();
    } catch (requestError) {
      setLeasingCompanyCreateError(
        getApiErrorMessage(requestError, "Не удалось добавить лизинговую компанию."),
      );
    } finally {
      setIsLeasingCompanyCreating(false);
    }
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
        groupLeadUserId: createRole === "manager" ? Number(createGroupLeadUserId) : null,
        lastName: createLastName.trim(),
        firstName: createFirstName.trim(),
        middleName: createMiddleName.trim(),
      });

      openTempPasswordModal({
        title: "Временный пароль создан",
        username: result.user.username,
        tempPassword: result.tempPassword,
        kind: "create",
      });

      setCreateUsername("");
      setCreateRole("manager");
      setCreateGroupLeadUserId("");
      setCreateLastName("");
      setCreateFirstName("");
      setCreateMiddleName("");
      setCreateModalOpen(false);

      await loadUsers();
    } catch (requestError) {
      setCreateError(getApiErrorMessage(requestError, "Не удалось создать сотрудника."));
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      setIsRowActionLoading(user.id);
      setRowActionError(null);

      const result = await resetUserPassword(user.id);

      openTempPasswordModal({
        title: "Сбросить пароль",
        username: user.username,
        tempPassword: result.tempPassword,
        kind: "reset",
      });

      await loadUsers();
    } catch (requestError) {
      setRowActionError(getApiErrorMessage(requestError, "Не удалось сбросить пароль."));
    } finally {
      setIsRowActionLoading(null);
    }
  };

  const usersMessages = useMemo(() => Boolean(usersError || rowActionError), [rowActionError, usersError]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Настройки"
      />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Профиль</h2>
        <form className={styles.profileForm} onSubmit={handleProfileSubmit} noValidate>
          <div className={styles.profileRow}>
            <InputField
              label="Фамилия"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={isProfileSaving}
              placeholder="необязательно"
            />
            <InputField
              label="Имя"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={isProfileSaving}
              placeholder="необязательно"
            />
            <InputField
              label="Отчество"
              value={middleName}
              onChange={(event) => setMiddleName(event.target.value)}
              disabled={isProfileSaving}
              placeholder="необязательно"
            />
          </div>

          {(profileError || profileSuccess) && (
            <div className={styles.messages}>
              {profileError && <Alert tone="error">{profileError}</Alert>}
              {profileSuccess && <Alert tone="success">{profileSuccess}</Alert>}
            </div>
          )}

          <div className={styles.actionsRow}>
            <Button type="submit" disabled={isProfileSaving}>
              {isProfileSaving ? <Spinner size={20} /> : "Сохранить"}
            </Button>
            <Button type="button" variant="ghost" onClick={openChangePassword}>
              Сменить пароль
            </Button>
          </div>
        </form>
      </section>

      {currentUser.role === "group_lead" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Мои менеджеры</h2>

          {isManagersLoading && (
            <div className={styles.loadingRow}>
              <Spinner size={22} />
              <div>Загрузка менеджеров...</div>
            </div>
          )}

          {managersError && (
            <div className={styles.messages}>
              <Alert tone="error">{managersError}</Alert>
            </div>
          )}

          {!isManagersLoading && !managersError && (
            <div className={styles.managersWidget}>
              {managers.length === 0 ? (
                <div className={styles.emptyText}>Менеджеров пока нет.</div>
              ) : (
                <div className={styles.managersList}>
                  {managers.map((manager) => (
                    <div key={manager.id} className={styles.managerRow}>
                      <div className={styles.managerLogin}>{manager.username}</div>
                      <div className={styles.managerName}>{getFullName(manager)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {isOwner && (
        <section className={styles.section}>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
              Пользователи
            </h2>
            <div className={styles.toolbarActions}>
              <Button
                type="button"
                onClick={() => {
                  if (createRole === "manager" && !createGroupLeadUserId && groupLeads.length > 0) {
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
              {users.length === 0 && <div className={styles.emptyText}>Пользователей пока нет.</div>}

              {users.map((user) => {
                const isBusyPassword = isRowActionLoading === user.id;
                const roleLabel = getRoleLabel(user.role);
                const fullName = getFullName(user);

                return (
                  <div key={user.id} className={styles.userCard}>
                    <div className={styles.userCardTop}>
                      <div className={styles.userCardTitleRow}>
                        <div className={styles.userCardUsername}>{user.username}</div>
                        <Badge>{roleLabel}</Badge>
                      </div>
                      <div className={styles.userCardName}>{fullName}</div>

                      {user.role === "manager" && user.groupLeadUsername && (
                        <div className={styles.userCardMeta}>
                          Руководитель: <strong>{user.groupLeadUsername}</strong>
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
                disabled={isCreateSubmitting || createRole !== "manager" || groupLeads.length === 0}
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

          <Modal
            open={passwordModalOpen}
            title={passwordModalTitle ?? "Временный пароль"}
            onClose={() => setPasswordModalOpen(false)}
            className={styles.setupModal}
          >
            <div className={styles.setupTop}>
              {passwordModalKind === "create" && (
                <div className={styles.setupHint}>
                  Передайте сотруднику логин и временный пароль. При первом входе система попросит
                  сменить пароль.
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
        </section>
      )}

      {isOwner && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Лизинговые компании</h2>

          {isLeasingCompaniesLoading && (
            <div className={styles.loadingRow}>
              <Spinner size={22} />
              <div>Загрузка лизинговых...</div>
            </div>
          )}

          {leasingCompaniesError && (
            <div className={styles.messages}>
              <Alert tone="error">{leasingCompaniesError}</Alert>
            </div>
          )}

          {!isLeasingCompaniesLoading && !leasingCompaniesError && (
            <div className={styles.leasingList}>
              {leasingCompanies.length === 0 ? (
                <div className={styles.emptyText}>Лизинговых компаний пока нет.</div>
              ) : (
                leasingCompanies.map((company) => (
                  <div key={company.id} className={styles.leasingRow}>
                    <div className={styles.leasingName}>{company.name}</div>
                  </div>
                ))
              )}
            </div>
          )}

          <Divider />

          <form className={styles.leasingCreateForm} onSubmit={handleCreateLeasingCompany} noValidate>
            <div className={styles.leasingCreateRow}>
              <InputField
                label="Новая лизинговая"
                value={leasingCompanyName}
                onChange={(event) => setLeasingCompanyName(event.target.value)}
                disabled={isLeasingCompanyCreating}
                placeholder="например: ВТБ Лизинг"
                required
              />
              <Button type="submit" disabled={isLeasingCompanyCreating}>
                {isLeasingCompanyCreating ? <Spinner size={20} /> : "Добавить"}
              </Button>
            </div>

            {leasingCompanyCreateError && (
              <div className={styles.messages}>
                <Alert tone="error">{leasingCompanyCreateError}</Alert>
              </div>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
