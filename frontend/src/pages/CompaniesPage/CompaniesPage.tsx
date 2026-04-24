import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  updateCompany,
} from "../../api/companiesApi";
import type { Company, CompanyFormValues } from "../../types/company";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { InputField, TextAreaField } from "../../components/ui/Field/Field";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Icon } from "../../components/ui/Icon/Icon";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./CompaniesPage.module.scss";

interface CompaniesPageProps {
  currentUser: AuthUser;
}

type CompanyValidationErrors = Partial<Record<keyof CompanyFormValues, string>>;

const emptyForm: CompanyFormValues = {
  name: "",
  inn: "",
  contactName: "",
  phone: "",
  email: "",
  comment: "",
  nextContactAt: "",
};

const validateCompanyForm = (values: CompanyFormValues): CompanyValidationErrors => {
  const errors: CompanyValidationErrors = {};

  if (!values.name.trim()) {
    errors.name = "Наименование обязательно";
  }

  const inn = values.inn.trim();
  if (!/^\d{10}(\d{2})?$/.test(inn)) {
    errors.inn = "ИНН: 10 или 12 цифр";
  }

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Некорректный email";
  }

  return errors;
};

const hasValidationErrors = (errors: CompanyValidationErrors): boolean =>
  Object.values(errors).some(Boolean);

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

const getRussianMonth = (monthIndex: number): string => {
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];

  return months[monthIndex] ?? "";
};

const getDayText = (days: number): string => {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "дней";
  }

  switch (lastDigit) {
    case 1:
      return "день";
    case 2:
    case 3:
    case 4:
      return "дня";
    default:
      return "дней";
  }
};

type ContactStatusTone = "overdue" | "soon" | "future";

const getContactStatusTone = (diffDays: number): ContactStatusTone => {
  if (diffDays < 0) return "overdue";
  if (diffDays <= 1) return "soon";
  return "future";
};

const formatContactDate = (dateString: string | null) => {
  if (!dateString) {
    return { text: "—", statusText: null as string | null, tone: null as ContactStatusTone | null };
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return { text: "—", statusText: null, tone: null };
  }

  const day = date.getDate();
  const month = getRussianMonth(date.getMonth());
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const time = `${hours}:${minutes}`;
  const text = `${day} ${month} в ${time}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const contactDate = new Date(dateString);
  contactDate.setHours(0, 0, 0, 0);
  const diffTime = contactDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let statusText = "";
  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    statusText = `${days} ${getDayText(days)} просрочено`;
  } else if (diffDays === 0) {
    statusText = "Сегодня";
  } else if (diffDays === 1) {
    statusText = "Завтра";
  } else {
    statusText = `Через ${diffDays} ${getDayText(diffDays)}`;
  }

  return { text, statusText, tone: getContactStatusTone(diffDays) };
};

export function CompaniesPage({ currentUser }: CompaniesPageProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchName, setSearchName] = useState("");
  const [searchInn, setSearchInn] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CompanyFormValues>(emptyForm);
  const [createErrors, setCreateErrors] = useState<CompanyValidationErrors>({});
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CompanyFormValues>(emptyForm);
  const [editErrors, setEditErrors] = useState<CompanyValidationErrors>({});
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

    const validationErrors = validateCompanyForm(createForm);
    setCreateErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsCreateSubmitting(true);
      setError(null);
      const result = await createCompany(createForm);
      setCompanies((prev) => [...prev, result.company]);
      setCreateForm(emptyForm);
      setCreateErrors({});
      setIsCreateModalOpen(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось создать компанию."));
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const editingCompany = useMemo(
    () => companies.find((item) => item.id === editingCompanyId) ?? null,
    [companies, editingCompanyId],
  );

  const openEditModal = (company: Company) => {
    setError(null);
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
    setEditErrors({});
  };

  const closeEditModal = () => {
    setEditingCompanyId(null);
    setEditForm(emptyForm);
    setEditErrors({});
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCompany) {
      return;
    }

    const validationErrors = validateCompanyForm(editForm);
    setEditErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsEditSubmitting(true);
      setError(null);
      const result = await updateCompany(editingCompany.id, editForm);
      setCompanies((prev) => prev.map((item) => (item.id === editingCompany.id ? result.company : item)));
      closeEditModal();
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

    try {
      setIsDeleteSubmittingId(company.id);
      await deleteCompany(company.id);
      setCompanies((prev) => prev.filter((item) => item.id !== company.id));
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
    <div className={styles.page}>
      <PageHeader title="Компании" subtitle="Поиск, добавление и сопровождение клиентов." />

      {error && <Alert tone="error">{error}</Alert>}

      <div className={styles.filters}>
        <div className={styles.filtersGrow}>
          <InputField
            label="Поиск по наименованию"
            value={searchName}
            onChange={(event) => setSearchName(event.target.value)}
            placeholder="Например: ООО Ромашка"
          />
        </div>
        <div className={styles.filtersGrow}>
          <InputField
            label="Поиск по ИНН"
            value={searchInn}
            onChange={(event) => setSearchInn(event.target.value)}
            placeholder="10 или 12 цифр"
            inputMode="numeric"
          />
        </div>
        <div className={styles.filtersActions}>
          <IconButton onClick={() => void loadCompanies()} title="Обновить">
            <Icon name="refresh" size={18} />
          </IconButton>
          <IconButton
            onClick={() => {
              setError(null);
              setCreateForm(emptyForm);
              setCreateErrors({});
              setIsCreateModalOpen(true);
            }}
            title="Добавить компанию"
          >
            <Icon name="plus" size={18} />
          </IconButton>
        </div>
      </div>

      <DataTable>
        <thead>
          <Tr>
              <Th style={{ width: showManagerColumn ? "18%" : "20%" }}>
                Наименование
              </Th>
              {showManagerColumn && (
                <Th style={{ width: "14%" }}>
                  Владелец
                </Th>
              )}
              <Th style={{ width: "9%" }}>
                ИНН
              </Th>
              <Th style={{ width: "11%" }}>
                Контакт
              </Th>
              <Th style={{ width: "10%" }}>
                Телефон
              </Th>
              <Th style={{ width: "13%" }}>
                Почта
              </Th>
              <Th style={{ width: "15%" }}>
                Комментарий
              </Th>
              <Th style={{ width: "12%" }}>
                Связаться
              </Th>
              <Th style={{ width: "8%", textAlign: "left" }}>
                Действия
              </Th>
            </Tr>
          </thead>
          <tbody>
            {filteredCompanies.map((company) => {
              const canManage = canManageCompany(company);
              const isDeleteSubmitting = isDeleteSubmittingId === company.id;
              const contact = formatContactDate(company.nextContactAt);

                return (
                  <Tr key={company.id}>
                    <Td>{company.name}</Td>
                    {showManagerColumn && <Td>{company.ownerEmail}</Td>}
                    <Td>{company.inn}</Td>
                    <Td>{company.contactName || "—"}</Td>
                    <Td>{company.phone || "—"}</Td>
                    <Td>{company.email || "—"}</Td>
                    <Td>{company.comment || "—"}</Td>
                    <Td>
                      {contact.text === "—" ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        <div className={styles.contact}>
                          <div className={styles.contactDate}>{contact.text}</div>
                        {contact.statusText && contact.tone && (
                          <div
                            className={`${styles.contactStatus} ${
                              contact.tone === "overdue"
                                ? styles.statusOverdue
                                : contact.tone === "soon"
                                  ? styles.statusSoon
                                  : styles.statusFuture
                            }`}
                          >
                            {contact.statusText}
                          </div>
                        )}
                      </div>
                      )}
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      {canManage ? (
                        <div className={styles.actions}>
                          <IconButton tone="neutral" onClick={() => openEditModal(company)} title="Редактировать">
                            <Icon name="edit" size={20} />
                          </IconButton>
                          <IconButton
                            onClick={() => void handleDelete(company)}
                            disabled={isDeleteSubmitting}
                            title="Удалить"
                            tone="danger"
                          >
                            {isDeleteSubmitting ? (
                              <Spinner size={18} />
                            ) : (
                              <Icon name="trash" size={20} />
                            )}
                          </IconButton>
                        </div>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}

              {filteredCompanies.length === 0 && (
                <Tr>
                  <Td colSpan={showManagerColumn ? 9 : 8} style={{ textAlign: "center" }}>
                    <span className={styles.muted}>Компаний нет</span>
                  </Td>
                </Tr>
              )}
            </tbody>
      </DataTable>

      {isLoading && (
        <div className={styles.loadingBlock}>
          <Spinner size={26} />
        </div>
      )}

      <Modal
        open={isCreateModalOpen}
        title="Добавить компанию"
        onClose={() => {
          if (isCreateSubmitting) return;
          setIsCreateModalOpen(false);
          setCreateErrors({});
        }}
      >
        <form className={styles.modalForm} onSubmit={handleCreateSubmit}>
          <InputField
            label="Наименование"
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            required
            error={createErrors.name}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="ИНН"
            value={createForm.inn}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, inn: event.target.value }))}
            required
            error={createErrors.inn}
            disabled={isCreateSubmitting}
            inputMode="numeric"
          />

          <InputField
            label="Контактное лицо"
            value={createForm.contactName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, contactName: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="Телефон"
            value={createForm.phone}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="Почта"
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            error={createErrors.email}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="Связаться"
            type="datetime-local"
            value={createForm.nextContactAt}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, nextContactAt: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <TextAreaField
            label="Комментарий"
            value={createForm.comment}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, comment: event.target.value }))}
            disabled={isCreateSubmitting}
            rows={4}
          />

          <div className={styles.modalActions}>
            <Button type="submit" disabled={isCreateSubmitting}>
              {isCreateSubmitting ? <Spinner size={20} /> : "Добавить"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editingCompany)} title="Редактировать компанию" onClose={closeEditModal}>
        {editingCompany && (
          <form className={styles.modalForm} onSubmit={handleEditSubmit}>
            <InputField
              label="Наименование"
              value={editForm.name}
              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              error={editErrors.name}
              disabled={isEditSubmitting}
            />

            <InputField
              label="ИНН"
              value={editForm.inn}
              onChange={(event) => setEditForm((prev) => ({ ...prev, inn: event.target.value }))}
              required
              error={editErrors.inn}
              disabled={isEditSubmitting}
              inputMode="numeric"
            />

            <InputField
              label="Контактное лицо"
              value={editForm.contactName || ""}
              onChange={(event) => setEditForm((prev) => ({ ...prev, contactName: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Телефон"
              value={editForm.phone || ""}
              onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={isEditSubmitting}
            />

              <InputField
                label="Почта"
                value={editForm.email || ""}
                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                error={editErrors.email}
                disabled={isEditSubmitting}
              />

              <InputField
                label="Связаться"
                type="datetime-local"
                value={editForm.nextContactAt || ""}
                onChange={(event) => setEditForm((prev) => ({ ...prev, nextContactAt: event.target.value }))}
                disabled={isEditSubmitting}
              />

              <TextAreaField
                label="Комментарий"
                value={editForm.comment || ""}
                onChange={(event) => setEditForm((prev) => ({ ...prev, comment: event.target.value }))}
                disabled={isEditSubmitting}
                rows={4}
              />

            <div className={styles.modalActions}>
              <Button type="submit" disabled={isEditSubmitting}>
                {isEditSubmitting ? <Spinner size={20} /> : "Сохранить"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
