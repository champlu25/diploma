import type { AuthUser } from "../types/user";
import { getRoleLabel } from "../utils/roles";

interface UserHomePageProps {
  currentUser: AuthUser;
  onLogout: () => Promise<void>;
}

export function UserHomePage({ currentUser, onLogout }: UserHomePageProps) {
  return (
    <section className="card card--narrow">
      <h1 className="card__title">Профиль</h1>
      <p className="card__subtitle">Вы авторизованы.</p>

      <div className="form">
        <p className="form__hint">
          Эл. почта: <strong>{currentUser.email}</strong>
        </p>
        <p className="form__hint">
          Роль: <strong>{getRoleLabel(currentUser.role)}</strong>
        </p>
      </div>

      <button className="button button--ghost" onClick={() => void onLogout()}>
        Выйти
      </button>
    </section>
  );
}
