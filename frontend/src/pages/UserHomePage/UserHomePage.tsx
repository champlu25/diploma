import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getGroupLeadManagers, type GroupManager } from "../../api/usersApi";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { getRoleLabel } from "../../utils/roles";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Divider } from "../../components/ui/Divider/Divider";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./UserHomePage.module.scss";

interface UserHomePageProps {
  currentUser: AuthUser;
}

interface AppShellOutletContext {
  openChangePassword: () => void;
}

export function UserHomePage({ currentUser }: UserHomePageProps) {
  const { openChangePassword } = useOutletContext<AppShellOutletContext>();
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
        const data = await getGroupLeadManagers();
        if (!isCancelled) {
          setManagers(data);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setManagersError(
            getApiErrorMessage(requestError, "Не удалось загрузить менеджеров вашей группы."),
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

  return (
    <div className={styles.page}>
      <PageHeader title="Главная" subtitle="Вы авторизованы." />

      <div className={styles.meta}>
        <div>
          Логин: <strong>{currentUser.username}</strong>
        </div>
        <div>
          Роль: <strong>{getRoleLabel(currentUser.role)}</strong>
        </div>
        {currentUser.role === "manager" && (
          <div>
            Руководитель:{" "}
            <strong>{currentUser.groupLeadUsername ?? "—"}</strong>
          </div>
        )}
      </div>

      <div className={styles.actionsRow}>
        <Button type="button" variant="ghost" onClick={openChangePassword}>
          Сменить пароль
        </Button>
      </div>

      {currentUser.role === "group_lead" && (
        <>
          <Divider />
          <h2 className={styles.sectionTitle}>Мои менеджеры</h2>

          {isManagersLoading && (
            <div className={styles.loadingRow}>
              <Spinner size={22} />
              <div>Загрузка менеджеров...</div>
            </div>
          )}

          {managersError && <Alert tone="error">{managersError}</Alert>}

          {!isManagersLoading && !managersError && (
            <>
              <DataTable>
                  <thead>
                    <Tr>
                      <Th style={{ width: "20%" }}>
                        ID
                      </Th>
                      <Th style={{ width: "55%" }}>
                        Логин
                      </Th>
                      <Th style={{ width: "25%" }}>
                        Компаний
                      </Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {managers.map((manager) => (
                      <Tr key={manager.id}>
                        <Td>{manager.id}</Td>
                        <Td>{manager.username}</Td>
                        <Td>{manager.companiesCount}</Td>
                      </Tr>
                    ))}
                  </tbody>
              </DataTable>

              {managers.length === 0 && (
                <div className={styles.emptyText}>За вами пока не закреплены менеджеры.</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
