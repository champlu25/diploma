import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  transferCompany,
  updateCompany,
} from "../../api/companiesApi";
import { createDeal, getDealLookups } from "../../api/dealsApi";
import { getTransferTargets } from "../../api/usersApi";
import type { Company, CompanyFormValues } from "../../types/company";
import type { DealFormValues, DealLookups } from "../../types/deal";
import type { AuthUser, User } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { InputField, SelectField, TextAreaField, type SelectFieldOption } from "../../components/ui/Field/Field";
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

type DealValidationErrors = Partial<Record<keyof DealFormValues, string>>;

const emptyDealForm: DealFormValues = {
  need: "",
  dealStatusId: "",
  plCostRub: "",
  leasingCompanyId: "",
  advancePercent: "",
  advanceTotalRub: "",
  dealStageId: "",
  comment: "",
};

const validateDealForm = (values: DealFormValues): DealValidationErrors => {
  const errors: DealValidationErrors = {};

  if (!values.need.trim()) {
    errors.need = "Потребность обязательна";
  }

  if (!values.dealStatusId) {
    errors.dealStatusId = "Выберите статус";
  }

  if (!values.leasingCompanyId) {
    errors.leasingCompanyId = "Выберите лизинговую";
  }

  if (!values.dealStageId) {
    errors.dealStageId = "Выберите этап";
  }

  if (!/^\d+$/.test(values.plCostRub.trim())) {
    errors.plCostRub = "Укажите стоимость в рублях";
  }

  if (!/^\d+(\.\d+)?$/.test(values.advancePercent.trim())) {
    errors.advancePercent = "Укажите процент";
  } else {
    const percent = Number(values.advancePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      errors.advancePercent = "0–100";
    }
  }

  if (!/^\d+$/.test(values.advanceTotalRub.trim())) {
    errors.advanceTotalRub = "Укажите сумму в рублях";
  }

  return errors;
};

const hasDealValidationErrors = (errors: DealValidationErrors): boolean =>
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
  const navigate = useNavigate();

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

  const [creatingDealCompanyId, setCreatingDealCompanyId] = useState<number | null>(null);
  const [dealLookups, setDealLookups] = useState<DealLookups | null>(null);
  const [dealForm, setDealForm] = useState<DealFormValues>(emptyDealForm);
  const [dealErrors, setDealErrors] = useState<DealValidationErrors>({});
  const [isDealSubmitting, setIsDealSubmitting] = useState(false);

  const [transferTargets, setTransferTargets] = useState<User[] | null>(null);
  const [transferCompanyCandidate, setTransferCompanyCandidate] = useState<Company | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTransferSubmitting, setIsTransferSubmitting] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState("");

  const creatingDealCompany = useMemo(
    () => companies.find((company) => company.id === creatingDealCompanyId) ?? null,
    [companies, creatingDealCompanyId],
  );

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

  const openInlineEdit = (company: Company) => {
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

  const cancelInlineEdit = () => {
    setEditingCompanyId(null);
    setEditForm(emptyForm);
    setEditErrors({});
  };

  const handleInlineSave = async () => {
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
      cancelInlineEdit();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось обновить компанию."));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const ensureDealLookups = useCallback(async () => {
    if (dealLookups) {
      return;
    }

    try {
      const data = await getDealLookups();
      setDealLookups(data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить справочники сделок."));
    }
  }, [dealLookups]);

  const openCreateDealModal = (company: Company) => {
    setError(null);
    setDealForm(emptyDealForm);
    setDealErrors({});
    setCreatingDealCompanyId(company.id);
    void ensureDealLookups();
  };

  const closeCreateDealModal = () => {
    if (isDealSubmitting) return;
    setCreatingDealCompanyId(null);
    setDealForm(emptyDealForm);
    setDealErrors({});
  };

  const handleCreateDealSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!creatingDealCompany) return;

    const validationErrors = validateDealForm(dealForm);
    setDealErrors(validationErrors);
    if (hasDealValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsDealSubmitting(true);
      setError(null);
      await createDeal(creatingDealCompany.id, dealForm);
      closeCreateDealModal();
      navigate("/deals");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось создать сделку."));
    } finally {
      setIsDealSubmitting(false);
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

  const canTransferCompanies = currentUser.role === "owner" || currentUser.role === "group_lead";

  const formatTransferTargetLabel = (user: User): string => {
    const name = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
    if (!name) {
      return user.email;
    }

    return `${name} (${user.email})`;
  };

  const openTransferModal = async (company: Company) => {
    if (!canTransferCompanies) {
      return;
    }

    setError(null);
    setTransferCompanyCandidate(company);
    setTransferTargetUserId(String(company.ownerUserId));
    setIsTransferModalOpen(true);

    if (transferTargets) {
      return;
    }

    try {
      const targets = await getTransferTargets();
      setTransferTargets(targets);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить список пользователей."));
    }
  };

  const closeTransferModal = (force = false) => {
    if (isTransferSubmitting && !force) {
      return;
    }

    setIsTransferModalOpen(false);
    setTransferCompanyCandidate(null);
    setTransferTargetUserId("");
  };

  const handleTransferSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!transferCompanyCandidate) {
      return;
    }

    const targetUserId = Number(transferTargetUserId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      setError("Выберите пользователя для передачи.");
      return;
    }

    setError(null);

    try {
      setIsTransferSubmitting(true);
      await transferCompany(transferCompanyCandidate.id, targetUserId);
      closeTransferModal(true);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось передать компанию."));
    } finally {
      setIsTransferSubmitting(false);
    }
  };

  const canManageCompany = (company: Company): boolean =>
    currentUser.role === "owner" ||
    currentUser.role === "group_lead" ||
    company.ownerUserId === currentUser.id;

  const showManagerColumn = currentUser.role !== "manager";

  const dealStatusOptions = useMemo(() => {
    const base: SelectFieldOption[] = [{ value: "", label: "Выберите статус", disabled: true }];
    if (!dealLookups) return base;
    return base.concat(
      dealLookups.dealStatuses.map((item) => ({ value: String(item.id), label: item.name })),
    );
  }, [dealLookups]);

  const leasingOptions = useMemo(() => {
    const base: SelectFieldOption[] = [{ value: "", label: "Выберите лизинговую", disabled: true }];
    if (!dealLookups) return base;
    return base.concat(
      dealLookups.leasingCompanies.map((item) => ({ value: String(item.id), label: item.name })),
    );
  }, [dealLookups]);

  const stageOptions = useMemo(() => {
    const base: SelectFieldOption[] = [{ value: "", label: "Выберите этап", disabled: true }];
    if (!dealLookups) return base;
    return base.concat(
      dealLookups.dealStages.map((item) => ({ value: String(item.id), label: item.name })),
    );
  }, [dealLookups]);

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
              const isEditing = company.id === editingCompanyId;

              return (
                <Tr key={company.id}>
                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.name ? styles.cellError : ""}`}
                        value={editForm.name}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                        disabled={isEditSubmitting}
                        required
                        aria-invalid={Boolean(editErrors.name) || undefined}
                        title={editErrors.name}
                      />
                    ) : (
                      company.name
                    )}
                  </Td>

                  {showManagerColumn && <Td>{company.ownerEmail}</Td>}

                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.inn ? styles.cellError : ""}`}
                        value={editForm.inn}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, inn: event.target.value }))}
                        disabled={isEditSubmitting}
                        required
                        inputMode="numeric"
                        aria-invalid={Boolean(editErrors.inn) || undefined}
                        title={editErrors.inn}
                      />
                    ) : (
                      company.inn
                    )}
                  </Td>

                  <Td>
                    {isEditing ? (
                      <input
                        className={styles.cellInput}
                        value={editForm.contactName}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, contactName: event.target.value }))}
                        disabled={isEditSubmitting}
                      />
                    ) : (
                      company.contactName || "—"
                    )}
                  </Td>

                  <Td>
                    {isEditing ? (
                      <input
                        className={styles.cellInput}
                        value={editForm.phone}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                        disabled={isEditSubmitting}
                      />
                    ) : (
                      company.phone || "—"
                    )}
                  </Td>

                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.email ? styles.cellError : ""}`}
                        value={editForm.email}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                        disabled={isEditSubmitting}
                        aria-invalid={Boolean(editErrors.email) || undefined}
                        title={editErrors.email}
                      />
                    ) : (
                      company.email || "—"
                    )}
                  </Td>

                  <Td>
                    {isEditing ? (
                      <textarea
                        className={styles.cellTextarea}
                        value={editForm.comment}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, comment: event.target.value }))}
                        disabled={isEditSubmitting}
                        rows={2}
                      />
                    ) : (
                      company.comment || "—"
                    )}
                  </Td>

                  <Td>
                    {isEditing ? (
                      <input
                        className={styles.cellInput}
                        type="datetime-local"
                        value={editForm.nextContactAt}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, nextContactAt: event.target.value }))}
                        disabled={isEditSubmitting}
                      />
                    ) : contact.text === "—" ? (
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
                        {isEditing ? (
                          <>
                            {canTransferCompanies && (
                              <IconButton tone="neutral" onClick={() => void openTransferModal(company)} title="Передать">
                                <Icon name="users" size={18} />
                              </IconButton>
                            )}
                            <IconButton
                              tone="neutral"
                              onClick={() => void handleInlineSave()}
                              disabled={isEditSubmitting}
                              title="Сохранить"
                            >
                              {isEditSubmitting ? <Spinner size={18} /> : <Icon name="check" size={18} />}
                            </IconButton>
                            <IconButton
                              tone="neutral"
                              onClick={cancelInlineEdit}
                              disabled={isEditSubmitting}
                              title="Отменить"
                            >
                              <Icon name="x" size={18} />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton tone="neutral" onClick={() => openCreateDealModal(company)} title="Создать сделку">
                              <Icon name="deals" size={18} />
                            </IconButton>
                            <IconButton tone="neutral" onClick={() => openInlineEdit(company)} title="Редактировать">
                              <Icon name="edit" size={18} />
                            </IconButton>
                            {canTransferCompanies && (
                              <IconButton tone="neutral" onClick={() => void openTransferModal(company)} title="Передать">
                                <Icon name="users" size={18} />
                              </IconButton>
                            )}
                            <IconButton
                              onClick={() => void handleDelete(company)}
                              disabled={isDeleteSubmitting}
                              title="Удалить"
                              tone="danger"
                            >
                              {isDeleteSubmitting ? <Spinner size={18} /> : <Icon name="trash" size={18} />}
                            </IconButton>
                          </>
                        )}
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

      <Modal
        open={Boolean(creatingDealCompany)}
        title={creatingDealCompany ? `Создать сделку — ${creatingDealCompany.name}` : "Создать сделку"}
        onClose={closeCreateDealModal}
      >
        {creatingDealCompany && (
          <form className={styles.modalForm} onSubmit={handleCreateDealSubmit}>
            <TextAreaField
              label="Потребность"
              value={dealForm.need}
              onChange={(event) => setDealForm((prev) => ({ ...prev, need: event.target.value }))}
              required
              error={dealErrors.need}
              disabled={isDealSubmitting}
              rows={2}
            />

            <SelectField
              label="Статус"
              value={dealForm.dealStatusId}
              onChange={(event) => setDealForm((prev) => ({ ...prev, dealStatusId: event.target.value }))}
              required
              error={dealErrors.dealStatusId}
              disabled={isDealSubmitting || !dealLookups}
              options={dealStatusOptions}
            />

            <InputField
              label="Стоимость ПЛ, ₽"
              value={dealForm.plCostRub}
              onChange={(event) => setDealForm((prev) => ({ ...prev, plCostRub: event.target.value }))}
              required
              error={dealErrors.plCostRub}
              disabled={isDealSubmitting}
              inputMode="numeric"
            />

            <SelectField
              label="Лизинговая"
              value={dealForm.leasingCompanyId}
              onChange={(event) => setDealForm((prev) => ({ ...prev, leasingCompanyId: event.target.value }))}
              required
              error={dealErrors.leasingCompanyId}
              disabled={isDealSubmitting || !dealLookups}
              options={leasingOptions}
            />

            <InputField
              label="АВ, %"
              value={dealForm.advancePercent}
              onChange={(event) => setDealForm((prev) => ({ ...prev, advancePercent: event.target.value }))}
              required
              error={dealErrors.advancePercent}
              disabled={isDealSubmitting}
              inputMode="decimal"
            />

            <InputField
              label="Общий АВ, ₽"
              value={dealForm.advanceTotalRub}
              onChange={(event) => setDealForm((prev) => ({ ...prev, advanceTotalRub: event.target.value }))}
              required
              error={dealErrors.advanceTotalRub}
              disabled={isDealSubmitting}
              inputMode="numeric"
            />

            <SelectField
              label="Этап сделки"
              value={dealForm.dealStageId}
              onChange={(event) => setDealForm((prev) => ({ ...prev, dealStageId: event.target.value }))}
              required
              error={dealErrors.dealStageId}
              disabled={isDealSubmitting || !dealLookups}
              options={stageOptions}
            />

            <TextAreaField
              label="Комментарий"
              value={dealForm.comment}
              onChange={(event) => setDealForm((prev) => ({ ...prev, comment: event.target.value }))}
              disabled={isDealSubmitting}
              rows={2}
            />

            <div className={styles.modalActions}>
              <Button type="submit" disabled={isDealSubmitting}>
                {isDealSubmitting ? <Spinner size={20} /> : "Создать"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={isTransferModalOpen} title="Передать компанию" onClose={closeTransferModal}>
        <form className={styles.modalForm} onSubmit={handleTransferSubmit}>
          <InputField label="Компания" value={transferCompanyCandidate?.name ?? ""} disabled />
          <InputField label="ИНН" value={transferCompanyCandidate?.inn ?? ""} disabled />
          <InputField label="Текущий владелец" value={transferCompanyCandidate?.ownerEmail ?? ""} disabled />

          <SelectField
            label="Передать пользователю"
            value={transferTargetUserId}
            onChange={(event) => setTransferTargetUserId(event.target.value)}
            required
            disabled={isTransferSubmitting || !transferTargets}
            options={[
              { value: "", label: "Выберите пользователя", disabled: true },
              ...(transferTargets ?? []).map((user) => ({
                value: String(user.id),
                label: formatTransferTargetLabel(user),
              })),
            ]}
          />

          <div className={styles.modalActions}>
            <Button type="submit" disabled={isTransferSubmitting || !transferTargets}>
              {isTransferSubmitting ? <Spinner size={20} /> : "Передать"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
