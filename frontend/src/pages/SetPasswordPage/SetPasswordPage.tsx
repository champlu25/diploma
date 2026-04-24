import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  completePasswordSetup,
  getPasswordSetupSession,
  type PasswordSetupSession,
} from "../../api/passwordSetupApi";
import { getApiErrorMessage } from "../../utils/httpError";
import { getRoleLabel } from "../../utils/roles";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField } from "../../components/ui/Field/Field";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./SetPasswordPage.module.scss";

export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [session, setSession] = useState<PasswordSetupSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setLastName((session.lastName ?? "").trim());
      setFirstName((session.firstName ?? "").trim());
      setMiddleName((session.middleName ?? "").trim());
    }
  }, [session]);

  useEffect(() => {
    let isCancelled = false;

    const loadSession = async () => {
      if (!token) {
        setSessionError("Отсутствует токен настройки аккаунта.");
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
            getApiErrorMessage(requestError, "Не удалось проверить ссылку настройки аккаунта."),
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

    if (!lastName.trim() || !firstName.trim()) {
      setSubmitError("Фамилия и имя обязательны.");
      return;
    }

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

      const normalizedLastName = lastName.trim();
      const normalizedFirstName = firstName.trim();
      const normalizedMiddleName = middleName.trim();
      const result = await completePasswordSetup(
        token,
        password,
        normalizedLastName,
        normalizedFirstName,
        normalizedMiddleName ? normalizedMiddleName : null,
      );
      setSubmitSuccess(result.message);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setSubmitError(
        getApiErrorMessage(requestError, "Не удалось сохранить настройки аккаунта. Запросите новую ссылку."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Card>
          <div className={styles.header}>
            <h1 className={styles.title}>Настройка аккаунта</h1>
            <p className={styles.subtitle}>Проверьте ФИО и задайте новый пароль.</p>
          </div>

          <Divider />

          {isSessionLoading && (
            <div className={styles.row}>
              <Spinner size={22} />
              <div>Проверка ссылки...</div>
            </div>
          )}

          {!isSessionLoading && sessionError && (
            <div className={styles.form}>
              <Alert tone="error">{sessionError}</Alert>
              <RouterLink to="/login" className={styles.link}>
                Перейти ко входу
              </RouterLink>
            </div>
          )}

          {!isSessionLoading && session && (
            <div className={styles.form}>
              <div className={styles.meta}>
                <div>
                  Аккаунт: <strong>{session.email}</strong>
                </div>
                <div>
                  Роль: <strong>{getRoleLabel(session.role)}</strong>
                </div>
                <div>
                  Действует до: <strong>{new Date(session.expiresAt).toLocaleString("ru-RU")}</strong>
                </div>
              </div>

              <form className={styles.form} onSubmit={handleSubmit}>
                <InputField
                  label="Фамилия"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isSubmitting || Boolean(submitSuccess)}
                  autoComplete="family-name"
                  required
                />

                <InputField
                  label="Имя"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={isSubmitting || Boolean(submitSuccess)}
                  autoComplete="given-name"
                  required
                />

                <InputField
                  label="Отчество"
                  value={middleName}
                  onChange={(event) => setMiddleName(event.target.value)}
                  disabled={isSubmitting || Boolean(submitSuccess)}
                  autoComplete="additional-name"
                />

                <InputField
                  label="Новый пароль"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting || Boolean(submitSuccess)}
                  autoComplete="new-password"
                />

                <InputField
                  label="Повторите пароль"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSubmitting || Boolean(submitSuccess)}
                  autoComplete="new-password"
                />

                {submitError && <Alert tone="error">{submitError}</Alert>}
                {submitSuccess && <Alert tone="success">{submitSuccess}</Alert>}

                {!submitSuccess && (
                  <Button type="submit" fullWidth disabled={isSubmitting}>
                    {isSubmitting ? <Spinner size={22} /> : "Сохранить"}
                  </Button>
                )}

                {submitSuccess && (
                  <Button
                    type="button"
                    fullWidth
                    onClick={() => navigate("/login", { replace: true })}
                  >
                    Перейти ко входу
                  </Button>
                )}
              </form>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
