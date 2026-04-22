import { useEffect, useState } from "react";
import { getGroupLeadManagers, type GroupManager } from "../api/usersApi";
import type { AuthUser } from "../types/user";
import { getApiErrorMessage } from "../utils/httpError";
import { getRoleLabel } from "../utils/roles";

interface UserHomePageProps {
  currentUser: AuthUser;
}

export function UserHomePage({ currentUser }: UserHomePageProps) {
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
    <section className="panel panel--narrow">
      <h1 className="panel__title">Главная</h1>
      <p className="panel__subtitle">Вы авторизованы.</p>

      <div className="form">
        <p className="form__hint form__hint--primary">
          Эл. почта: <strong>{currentUser.email}</strong>
        </p>
        <p className="form__hint form__hint--primary">
          Роль: <strong>{getRoleLabel(currentUser.role)}</strong>
        </p>
      </div>

      {currentUser.role === "group_lead" && (
        <section className="section">
          <h2 className="section__title">Мои менеджеры</h2>

          {isManagersLoading && <p className="status">Загрузка менеджеров...</p>}
          {managersError && <p className="status status--error">{managersError}</p>}

          {!isManagersLoading && !managersError && (
            <div className="users-table users-table--group-home">
              <div className="users-table__row users-table__row--head">
                <span>ID</span>
                <span>Эл. почта</span>
                <span>Компаний</span>
              </div>

              {managers.map((manager) => (
                <div className="users-table__row" key={manager.id}>
                  <span>{manager.id}</span>
                  <span>{manager.email}</span>
                  <span>{manager.companiesCount}</span>
                </div>
              ))}

              {managers.length === 0 && (
                <p className="status">За вами пока не закреплены менеджеры.</p>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
