import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/authApi";
import type { AuthUser } from "../types/user";
import { getApiErrorMessage } from "../utils/httpError";

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Введите email и пароль.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const user = await login(email.trim(), password);
      onLogin(user);
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось выполнить вход."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card card--narrow">
      <h1 className="card__title">Вход в Лизинг CRM</h1>
      <p className="card__subtitle">Используйте email и пароль для входа.</p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="form__field">
          <span className="form__label">Эл. почта</span>
          <input
            className="form__input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            placeholder="employee@company.com"
            disabled={isSubmitting}
          />
        </label>

        <label className="form__field">
          <span className="form__label">Пароль</span>
          <input
            className="form__input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Введите пароль"
            disabled={isSubmitting}
          />
        </label>

        {error && <p className="status status--error">{error}</p>}

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Выполняется вход..." : "Войти"}
        </button>
      </form>
    </section>
  );
}
