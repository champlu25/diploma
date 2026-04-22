import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  updateCompany,
} from "../api/companiesApi";
import type { Company, CompanyFormValues } from "../types/company";
import type { AuthUser } from "../types/user";
import { getApiErrorMessage } from "../utils/httpError";

interface CompaniesPageProps {
  currentUser: AuthUser;
}

const iconProps = {
  className: "icon-button__icon",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
  <svg
    {...iconProps}
    className={spinning ? "icon-button__icon icon-button__icon--spin" : "icon-button__icon"}
  >
    <path d="M21 12a9 9 0 1 1-3.2-6.9" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

const PlusIcon = () => (
  <svg {...iconProps}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const MinusIcon = () => (
  <svg {...iconProps}>
    <path d="M5 12h14" />
  </svg>
);

const EditIcon = () => (
  <svg {...iconProps}>
    <path
      fill="currentColor"
      stroke="none"
      d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25Zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0L15.13 4.95l3.75 3.75 1.83-1.49Z"
    />
  </svg>
);

const DeleteIcon = () => (
  <svg {...iconProps}>
    <path
      fill="currentColor"
      stroke="none"
      d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h.62l.86 12.13A2 2 0 0 0 8.47 21h7.06a2 2 0 0 0 1.99-1.87L18.38 7H19a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm2 2h2V5h-2V5Zm-1 4a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm5 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg {...iconProps}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const emptyForm: CompanyFormValues = {
  name: "",
  inn: "",
  contactName: "",
  phone: "",
  email: "",
  comment: "",
  nextContactAt: "",
};

const validateCompanyForm = (values: CompanyFormValues): string | null => {
  if (!values.name.trim()) {
    return "Наименование компании обязательно.";
  }

  const inn = values.inn.trim();
  if (!/^\d{10}(\d{2})?$/.test(inn)) {
    return "ИНН должен содержать только цифры и иметь длину 10 или 12.";
  }

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Некорректный формат email.";
  }

  return null;
};

const toDatetimeLocal = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - tzOffsetMs);
  return localDate.toISOString().slice(0, 16);
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function CompaniesPage({ currentUser }: CompaniesPageProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchName, setSearchName] = useState("");
  const [searchInn, setSearchInn] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CompanyFormValues>(emptyForm);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CompanyFormValues>(emptyForm);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isDeleteSubmittingId, setIsDeleteSubmittingId] = useState<number | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getCompanies();
      setCompanies(data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить компании."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const editingCompany = useMemo(
    () => companies.find((item) => item.id === editingCompanyId) ?? null,
    [companies, editingCompanyId],
  );
  const filteredCompanies = useMemo(() => {
    const nameFilter = searchName.trim().toLowerCase();
    const innFilter = searchInn.trim();

    return companies.filter((company) => {
      const matchesName = !nameFilter || company.name.toLowerCase().includes(nameFilter);
      const matchesInn = !innFilter || company.inn.includes(innFilter);
      return matchesName && matchesInn;
    });
  }, [companies, searchInn, searchName]);

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateCompanyForm(createForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsCreateSubmitting(true);
      const result = await createCompany(createForm);
      setCompanies((prev) => [...prev, result.company]);
      setCreateForm(emptyForm);
      setSuccess(result.message);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось создать компанию."));
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const openEditModal = (company: Company) => {
    setError(null);
    setSuccess(null);
    setEditingCompanyId(company.id);
    setEditForm({
      name: company.name,
      inn: company.inn,
      contactName: company.contactName ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      comment: company.comment ?? "",
      nextContactAt: toDatetimeLocal(company.nextContactAt),
    });
  };

  const closeEditModal = () => {
    setEditingCompanyId(null);
    setEditForm(emptyForm);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCompany) {
      return;
    }

    setError(null);
    setSuccess(null);

    const validationError = validateCompanyForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsEditSubmitting(true);
      const result = await updateCompany(editingCompany.id, editForm);
      setCompanies((prev) =>
        prev.map((item) => (item.id === editingCompany.id ? result.company : item)),
      );
      closeEditModal();
      setSuccess(result.message);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось обновить компанию."));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDelete = async (company: Company) => {
    const confirmed = window.confirm(`Удалить компанию «${company.name}»?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      setIsDeleteSubmittingId(company.id);
      const result = await deleteCompany(company.id);
      setCompanies((prev) => prev.filter((item) => item.id !== company.id));
      setSuccess(result.message);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось удалить компанию."));
    } finally {
      setIsDeleteSubmittingId(null);
    }
  };

  const canManageCompany = (company: Company): boolean =>
    currentUser.role === "owner" ||
    currentUser.role === "group_lead" ||
    company.ownerUserId === currentUser.id;
  const showManagerColumn = currentUser.role !== "manager";

  return (
    <section className="companies-page">
      <h1 className="companies-page__title">Компании</h1>

      <section className="companies-toolbar">
        <input
          className="form__input companies-toolbar__search"
          type="text"
          placeholder="Поиск по наименованию"
          value={searchName}
          onChange={(event) => setSearchName(event.target.value)}
        />
        <input
          className="form__input companies-toolbar__search"
          type="text"
          placeholder="Поиск по ИНН"
          value={searchInn}
          onChange={(event) => setSearchInn(event.target.value)}
        />

        <button
          className="icon-button icon-button--toolbar"
          type="button"
          title="Обновить"
          aria-label="Обновить список компаний"
          onClick={() => void loadCompanies()}
        >
          <RefreshIcon spinning={isLoading} />
        </button>
        <button
          className="icon-button icon-button--toolbar"
          type="button"
          title={showCreateForm ? "Скрыть форму добавления" : "Показать форму добавления"}
          aria-label="Показать или скрыть форму добавления компании"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? <MinusIcon /> : <PlusIcon />}
        </button>
      </section>

      <section className="section">
        {showCreateForm && (
          <div className="companies-create">
            <h2 className="section__title">Добавить компанию</h2>
            <form className="form form--inline companies-form" onSubmit={handleCreateSubmit}>
              <label className="form__field">
                <span className="form__label">Наименование компании</span>
                <input
                  className="form__input"
                  type="text"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                  required
                />
              </label>

              <label className="form__field">
                <span className="form__label">ИНН</span>
                <input
                  className="form__input"
                  type="text"
                  value={createForm.inn}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, inn: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                  required
                />
              </label>

              <label className="form__field">
                <span className="form__label">Имя</span>
                <input
                  className="form__input"
                  type="text"
                  value={createForm.contactName}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Телефон</span>
                <input
                  className="form__input"
                  type="text"
                  value={createForm.phone}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Почта</span>
                <input
                  className="form__input"
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Комментарий</span>
                <input
                  className="form__input"
                  type="text"
                  value={createForm.comment}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, comment: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Связаться</span>
                <input
                  className="form__input"
                  type="datetime-local"
                  value={createForm.nextContactAt}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, nextContactAt: event.target.value }))
                  }
                  disabled={isCreateSubmitting}
                />
              </label>

              <label className="form__field form__field--stretch">
                <button className="button" type="submit" disabled={isCreateSubmitting}>
                  {isCreateSubmitting ? "Сохранение..." : "Добавить"}
                </button>
              </label>
            </form>
          </div>
        )}

        {error && <p className="status status--error">{error}</p>}
        {success && <p className="status status--success">{success}</p>}
      </section>

      <section className="section">
        <header className="section__header">
          <h2 className="section__title">Список компаний</h2>
          <button className="button button--ghost" onClick={() => void loadCompanies()}>
            Обновить
          </button>
        </header>

        {isLoading ? (
          <p className="status">Загрузка компаний...</p>
        ) : (
          <div className="companies-table-wrap">
            <table className="companies-table">
              <thead>
                <tr>
                  <th>Наименование компании</th>
                  {showManagerColumn && <th>Менеджер</th>}
                  <th>ИНН</th>
                  <th>Имя</th>
                  <th>Телефон</th>
                  <th>Почта</th>
                  <th>Комментарий</th>
                  <th>Связаться</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id}>
                    <td>{company.name}</td>
                    {showManagerColumn && <td>{company.ownerEmail}</td>}
                    <td>{company.inn}</td>
                    <td>{company.contactName || "—"}</td>
                    <td>{company.phone || "—"}</td>
                    <td>{company.email || "—"}</td>
                    <td>{company.comment || "—"}</td>
                    <td>{formatDateTime(company.nextContactAt)}</td>
                    <td>
                      {canManageCompany(company) ? (
                        <div className="companies-table__actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Редактировать компанию ${company.name}`}
                            title="Редактировать"
                            onClick={() => openEditModal(company)}
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="icon-button icon-button--danger"
                            type="button"
                            aria-label={`Удалить компанию ${company.name}`}
                            title="Удалить"
                            disabled={isDeleteSubmittingId === company.id}
                            onClick={() => void handleDelete(company)}
                          >
                            {isDeleteSubmittingId === company.id ? (
                              <RefreshIcon spinning />
                            ) : (
                              <DeleteIcon />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="companies-table__read-only">Только просмотр</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td className="companies-table__empty" colSpan={showManagerColumn ? 9 : 8}>
                      Компании не найдены.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingCompany && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card">
            <header className="modal-card__header">
              <h3 className="modal-card__title">Редактирование компании</h3>
              <button
                className="icon-button"
                type="button"
                aria-label="Закрыть"
                onClick={closeEditModal}
              >
                <CloseIcon />
              </button>
            </header>

            <form className="form" onSubmit={handleEditSubmit}>
              <label className="form__field">
                <span className="form__label">Наименование компании</span>
                <input
                  className="form__input"
                  type="text"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                  required
                />
              </label>

              <label className="form__field">
                <span className="form__label">ИНН</span>
                <input
                  className="form__input"
                  type="text"
                  value={editForm.inn}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, inn: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                  required
                />
              </label>

              <label className="form__field">
                <span className="form__label">Имя</span>
                <input
                  className="form__input"
                  type="text"
                  value={editForm.contactName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Телефон</span>
                <input
                  className="form__input"
                  type="text"
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Почта</span>
                <input
                  className="form__input"
                  type="email"
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Комментарий</span>
                <textarea
                  className="form__input form__textarea"
                  value={editForm.comment}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, comment: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                  rows={4}
                />
              </label>

              <label className="form__field">
                <span className="form__label">Связаться</span>
                <input
                  className="form__input"
                  type="datetime-local"
                  value={editForm.nextContactAt}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, nextContactAt: event.target.value }))
                  }
                  disabled={isEditSubmitting}
                />
              </label>

              <div className="modal-card__actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={closeEditModal}
                  disabled={isEditSubmitting}
                >
                  Отмена
                </button>
                <button className="button" type="submit" disabled={isEditSubmitting}>
                  {isEditSubmitting ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
