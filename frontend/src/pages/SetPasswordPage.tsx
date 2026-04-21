import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  completePasswordSetup,
  getPasswordSetupSession,
  type PasswordSetupSession,
} from "../api/passwordSetupApi";
import { getApiErrorMessage } from "../utils/httpError";
import { getRoleLabel } from "../utils/roles";

export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [session, setSession] = useState<PasswordSetupSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadSession = async () => {
      if (!token) {
        setSessionError("Отсутствует токен установки пароля.");
        setIsSessionLoading(false);
        return;
      }

      try {
        setIsSessionLoading(true);
        setSessionError(null);
        const result = await getPasswordSetupSession(token);

        if (!isCancelled) {
          setSession(result);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setSessionError(
            getApiErrorMessage(requestError, "Не удалось проверить ссылку установки пароля."),
          );
        }
      } finally {
        if (!isCancelled) {
          setIsSessionLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setSubmitError("Заполните оба поля пароля.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Пароли не совпадают.");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);

      const result = await completePasswordSetup(token, password);
      setSubmitSuccess(result.message);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setSubmitError(
        getApiErrorMessage(
          requestError,
          "Не удалось установить пароль. Запросите новую ссылку.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card card--narrow">
      <h1 className="card__title">Установка пароля</h1>
      <p className="card__subtitle">
        Эта страница используется для приглашения при первом входе и смены пароля по запросу владельца.
      </p>

      {isSessionLoading && <p className="status">Проверка ссылки...</p>}

      {!isSessionLoading && sessionError && (
        <>
          <p className="status status--error">{sessionError}</p>
          <p className="form__helper">
            <Link className="link" to="/login">
              Перейти ко входу
            </Link>
          </p>
        </>
      )}

      {!isSessionLoading && session && (
        <>
          <div className="form" aria-live="polite">
            <p className="form__hint">
              Аккаунт: <strong>{session.email}</strong>
            </p>
            <p className="form__hint">
              Роль: <strong>{getRoleLabel(session.role)}</strong>
            </p>
            <p className="form__hint">
              Действует до: {new Date(session.expiresAt).toLocaleString()}
            </p>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label className="form__field">
              <span className="form__label">Новый пароль</span>
              <input
                className="form__input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting || Boolean(submitSuccess)}
                autoComplete="new-password"
              />
            </label>

            <label className="form__field">
              <span className="form__label">Повторите пароль</span>
              <input
                className="form__input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSubmitting || Boolean(submitSuccess)}
                autoComplete="new-password"
              />
            </label>

            {submitError && <p className="status status--error">{submitError}</p>}
            {submitSuccess && <p className="status status--success">{submitSuccess}</p>}

            {!submitSuccess && (
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Сохранение пароля..." : "Сохранить пароль"}
              </button>
            )}

            {submitSuccess && (
              <button
                className="button"
                type="button"
                onClick={() => navigate("/login", { replace: true })}
              >
                Перейти ко входу
              </button>
            )}
          </form>
        </>
      )}
    </section>
  );
}
