import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { APP_ROUTES } from "../../constants/routes";
import { getCompanyById, getCompanyLookups, updateCompany } from "../../api/companiesApi";
import { getDealsByCompanyId } from "../../api/dealsApi";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Divider } from "../../components/ui/Divider/Divider";
import {
  InputField,
  SelectField,
  TextAreaField,
  type SelectFieldOption,
} from "../../components/ui/Field/Field";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import type { CompanyDetails, CompanyFormValues } from "../../types/company";
import type { Deal } from "../../types/deal";
import type { CurrentUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import {
  COMPANY_COMMENT_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
  hasValidationErrors,
  sanitizeByMaxLength,
  sanitizeDigits,
  sanitizeEmail,
  sanitizePersonName,
  sanitizePhone,
  validateCompanyForm,
  type ValidationErrors,
} from "../../utils/validation";
import styles from "./CompanyDetailsPage.module.scss";

interface CompanyDetailsPageProps {
  currentUser: CurrentUser;
}

type CompanyValidationErrors = ValidationErrors<keyof CompanyFormValues>;

const emptyForm: CompanyFormValues = {
  name: "",
  inn: "",
  contactName: "",
  phone: "",
  email: "",
  comment: "",
  nextContactAt: "",
  legalAddress: "",
  actualAddress: "",
  directorBirthDate: "",
  activity: "",
  revenueRub: "",
  negativeInfo: "",
  bik: "",
  rs: "",
  ks: "",
  taxSystemId: "",
  preferredCommunicationChannelId: "",
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
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

const formatDateOnly = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
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

const toDateInputValue = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes("T")) {
    const prefix = trimmed.slice(0, trimmed.indexOf("T"));
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefix)) {
      return prefix;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

export function CompanyDetailsPage({ currentUser }: CompanyDetailsPageProps) {
  const navigate = useNavigate();
  const params = useParams();
  const companyId = useMemo(() => Number(params.companyId), [params.companyId]);

  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CompanyFormValues>(emptyForm);
  const [editErrors, setEditErrors] = useState<CompanyValidationErrors>({});
  const [showEditErrors, setShowEditErrors] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [taxSystemOptions, setTaxSystemOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "—" },
  ]);
  const [communicationChannelOptions, setCommunicationChannelOptions] = useState<
    SelectFieldOption[]
  >([{ value: "", label: "—" }]);

  const updateEditForm = <K extends keyof CompanyFormValues>(
    field: K,
    value: CompanyFormValues[K],
  ) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (showEditErrors) {
        setEditErrors(validateCompanyForm(next));
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      setError("Некорректный id компании.");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [loadedCompany, loadedDeals] = await Promise.all([
        getCompanyById(companyId),
        getDealsByCompanyId(companyId),
      ]);
      setCompany(loadedCompany);
      setDeals(loadedDeals);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить карточку компании."));
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const openEditModal = useCallback(async () => {
    if (!company) return;

    setIsEditOpen(true);
    setEditError(null);
    setEditErrors({});
    setShowEditErrors(false);
    setEditForm({
      name: company.name,
      inn: company.inn,
      contactName: company.contactName ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      comment: company.comment ?? "",
      nextContactAt: toDatetimeLocal(company.nextContactAt),
      legalAddress: company.legalAddress ?? "",
      actualAddress: company.actualAddress ?? "",
      directorBirthDate: toDateInputValue(company.directorBirthDate),
      activity: company.activity ?? "",
      revenueRub: company.revenueRub === null ? "" : String(company.revenueRub),
      negativeInfo: company.negativeInfo ?? "",
      bik: company.bik ?? "",
      rs: company.rs ?? "",
      ks: company.ks ?? "",
      taxSystemId: company.taxSystemId === null ? "" : String(company.taxSystemId),
      preferredCommunicationChannelId:
        company.preferredCommunicationChannelId === null
          ? ""
          : String(company.preferredCommunicationChannelId),
    });

    try {
      const lookups = await getCompanyLookups();
      setTaxSystemOptions([
        { value: "", label: "—" },
        ...lookups.taxSystems.map((item) => ({ value: String(item.id), label: item.name })),
      ]);
      setCommunicationChannelOptions([
        { value: "", label: "—" },
        ...lookups.communicationChannels.map((item) => ({
          value: String(item.id),
          label: item.name,
        })),
      ]);
    } catch {
      setTaxSystemOptions([{ value: "", label: "—" }]);
      setCommunicationChannelOptions([{ value: "", label: "—" }]);
    }
  }, [company]);

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!company) return;

    setShowEditErrors(true);
    const validationErrors = validateCompanyForm(editForm);
    setEditErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setEditError("Проверьте поля формы.");
      return;
    }

    try {
      setIsEditSubmitting(true);
      setEditError(null);
      await updateCompany(company.id, editForm);
      await load();
      setIsEditOpen(false);
    } catch (requestError) {
      setEditError(getApiErrorMessage(requestError, "Не удалось обновить компанию."));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size={26} />
        <div>Загрузка компании...</div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className={styles.page}>
        <PageHeader title="Компания" />
        <div className={styles.messages}>
          <Alert tone="error">{error ?? "Компания не найдена."}</Alert>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate(APP_ROUTES.companies)}>
          Назад к компаниям
        </Button>
      </div>
    );
  }

  const canManage =
    currentUser.role === "owner" ||
    currentUser.role === "group_lead" ||
    String(company.managerUserId) === String(currentUser.id);

  return (
    <div className={styles.page}>
      <PageHeader title={company.name} />

      <div className={styles.topActions}>
        <Button type="button" variant="ghost" onClick={() => navigate(APP_ROUTES.companies)}>
          Назад
        </Button>
        <div className={styles.topRight}>
          <div className={styles.meta}>
            <span className={styles.muted}>Менеджер:</span> {company.managerName}
          </div>
          {canManage && (
            <Button type="button" onClick={() => void openEditModal()}>
              Редактировать
            </Button>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Основное</h2>
          <div className={styles.kv}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>ИНН</span>
              <span className={styles.kvValue}>{company.inn}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Контактное лицо</span>
              <span className={styles.kvValue}>{company.contactName || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Телефон</span>
              <span className={styles.kvValue}>{company.phone || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Почта</span>
              <span className={styles.kvValue}>{company.email || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Связаться</span>
              <span className={styles.kvValue}>{formatDateTime(company.nextContactAt)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Комментарий</span>
              <span className={styles.kvValue}>{company.comment || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Создано</span>
              <span className={styles.kvValue}>{formatDateTime(company.createdAt)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Обновлено</span>
              <span className={styles.kvValue}>{formatDateTime(company.updatedAt)}</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Дополнительная информация</h2>
          <div className={styles.kv}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Система налогообложения</span>
              <span className={styles.kvValue}>{company.taxSystemName || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Юридический адрес</span>
              <span className={styles.kvValue}>{company.legalAddress || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Фактический адрес</span>
              <span className={styles.kvValue}>{company.actualAddress || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>День рождения директора</span>
              <span className={styles.kvValue}>{formatDateOnly(company.directorBirthDate)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Вид деятельности</span>
              <span className={styles.kvValue}>{company.activity || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Выручка</span>
              <span className={styles.kvValue}>
                {company.revenueRub === null ? "—" : `${company.revenueRub.toLocaleString("ru-RU")} ₽`}
              </span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Выявленный негатив</span>
              <span className={styles.kvValue}>{company.negativeInfo || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Предпочитает общение через</span>
              <span className={styles.kvValue}>
                {company.preferredCommunicationChannelName || "—"}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Реквизиты</h2>
          <div className={styles.kv}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>БИК</span>
              <span className={styles.kvValue}>{company.bik || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Р/С</span>
              <span className={styles.kvValue}>{company.rs || "—"}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>К/С</span>
              <span className={styles.kvValue}>{company.ks || "—"}</span>
            </div>
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Сделки компании</h2>
        <DataTable>
          <thead>
            <Tr>
              <Th style={{ width: "24%" }}>Потребность</Th>
              <Th style={{ width: "12%" }}>Статус</Th>
              <Th style={{ width: "14%" }}>ЖЦ</Th>
              <Th style={{ width: "12%" }}>ЛК</Th>
              <Th style={{ width: "10%" }}>АВ, ₽</Th>
              <Th style={{ width: "12%" }}>Этап</Th>
              <Th style={{ width: "12%" }}>Создано</Th>
            </Tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <Tr>
                <Td colSpan={7} style={{ textAlign: "center" }}>
                  <span className={styles.muted}>Сделок пока нет</span>
                </Td>
              </Tr>
            ) : (
              deals.map((deal) => (
                <Tr key={deal.id}>
                  <Td>{deal.need}</Td>
                  <Td>{deal.dealStatusName}</Td>
                  <Td>{deal.dealLifecycleStatusName}</Td>
                  <Td>{deal.leasingCompanyName}</Td>
                  <Td>{deal.advanceTotalRub.toLocaleString("ru-RU")}</Td>
                  <Td>{deal.dealStageName}</Td>
                  <Td>{formatDateTime(deal.createdAt)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
        {!canManage && (
          <div className={styles.muted}>У вас нет прав на редактирование этой компании.</div>
        )}
      </section>

      <Modal
        open={isEditOpen}
        title={company ? `Редактировать — ${company.name}` : "Редактировать компанию"}
        onClose={() => {
          if (isEditSubmitting) return;
          setIsEditOpen(false);
          setEditError(null);
          setEditErrors({});
          setShowEditErrors(false);
        }}
        className={styles.editModal}
      >
        <form className={styles.modalForm} onSubmit={handleEditSubmit} noValidate>
          <div className={styles.formGrid}>
            <InputField
              label="Наименование"
              value={editForm.name}
              onChange={(event) => updateEditForm("name", sanitizeByMaxLength(event.target.value, COMPANY_NAME_MAX_LENGTH))}
              required
              error={showEditErrors ? editErrors.name : undefined}
              disabled={isEditSubmitting}
              maxLength={COMPANY_NAME_MAX_LENGTH}
            />

            <InputField
              label="ИНН"
              value={editForm.inn}
              onChange={(event) => updateEditForm("inn", sanitizeDigits(event.target.value, 12))}
              required
              error={showEditErrors ? editErrors.inn : undefined}
              disabled={isEditSubmitting}
              inputMode="numeric"
              maxLength={12}
            />

            <InputField
              label="Контактное лицо"
              value={editForm.contactName}
              onChange={(event) => updateEditForm("contactName", sanitizePersonName(event.target.value))}
              error={showEditErrors ? editErrors.contactName : undefined}
              disabled={isEditSubmitting}
              maxLength={100}
            />

            <InputField
              label="Телефон"
              value={editForm.phone}
              onChange={(event) => updateEditForm("phone", sanitizePhone(event.target.value))}
              error={showEditErrors ? editErrors.phone : undefined}
              disabled={isEditSubmitting}
              maxLength={20}
            />

            <InputField
              label="Почта"
              value={editForm.email}
              onChange={(event) => updateEditForm("email", sanitizeEmail(event.target.value))}
              error={showEditErrors ? editErrors.email : undefined}
              disabled={isEditSubmitting}
              maxLength={254}
            />

            <InputField
              label="Связаться"
              type="datetime-local"
              value={editForm.nextContactAt}
              onChange={(event) => updateEditForm("nextContactAt", event.target.value)}
              error={showEditErrors ? editErrors.nextContactAt : undefined}
              disabled={isEditSubmitting}
            />

            <InputField
              label="БИК"
              value={editForm.bik}
              onChange={(event) => updateEditForm("bik", sanitizeDigits(event.target.value, 9))}
              disabled={isEditSubmitting}
              error={showEditErrors ? editErrors.bik : undefined}
              inputMode="numeric"
              maxLength={9}
            />

            <InputField
              label="Р/С"
              value={editForm.rs}
              onChange={(event) => updateEditForm("rs", sanitizeDigits(event.target.value, 20))}
              disabled={isEditSubmitting}
              error={showEditErrors ? editErrors.rs : undefined}
              inputMode="numeric"
              maxLength={20}
            />

            <InputField
              label="К/С"
              value={editForm.ks}
              onChange={(event) => updateEditForm("ks", sanitizeDigits(event.target.value, 20))}
              disabled={isEditSubmitting}
              error={showEditErrors ? editErrors.ks : undefined}
              inputMode="numeric"
              maxLength={20}
            />

            <SelectField
              label="Система налогообложения"
              value={editForm.taxSystemId}
              onChange={(event) => updateEditForm("taxSystemId", event.target.value)}
              options={taxSystemOptions}
              error={showEditErrors ? editErrors.taxSystemId : undefined}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Юридический адрес"
              value={editForm.legalAddress}
              onChange={(event) => updateEditForm("legalAddress", sanitizeByMaxLength(event.target.value, 500))}
              error={showEditErrors ? editErrors.legalAddress : undefined}
              disabled={isEditSubmitting}
              maxLength={500}
            />

            <InputField
              label="Фактический адрес"
              value={editForm.actualAddress}
              onChange={(event) => updateEditForm("actualAddress", sanitizeByMaxLength(event.target.value, 500))}
              error={showEditErrors ? editErrors.actualAddress : undefined}
              disabled={isEditSubmitting}
              maxLength={500}
            />

            <InputField
              label="День рождения директора"
              type="date"
              value={editForm.directorBirthDate}
              onChange={(event) => updateEditForm("directorBirthDate", event.target.value)}
              error={showEditErrors ? editErrors.directorBirthDate : undefined}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Выручка, ₽"
              value={editForm.revenueRub}
              onChange={(event) => updateEditForm("revenueRub", sanitizeDigits(event.target.value))}
              disabled={isEditSubmitting}
              error={showEditErrors ? editErrors.revenueRub : undefined}
              inputMode="numeric"
            />

            <SelectField
              label="Предпочитает общение через"
              value={editForm.preferredCommunicationChannelId}
              onChange={(event) => updateEditForm("preferredCommunicationChannelId", event.target.value)}
              options={communicationChannelOptions}
              error={showEditErrors ? editErrors.preferredCommunicationChannelId : undefined}
              disabled={isEditSubmitting}
            />

            <TextAreaField
              label="Вид деятельности"
              value={editForm.activity}
              onChange={(event) => updateEditForm("activity", sanitizeByMaxLength(event.target.value, 200))}
              error={showEditErrors ? editErrors.activity : undefined}
              disabled={isEditSubmitting}
              rows={3}
              maxLength={200}
            />

            <TextAreaField
              label="Выявленный негатив"
              value={editForm.negativeInfo}
              onChange={(event) => updateEditForm("negativeInfo", sanitizeByMaxLength(event.target.value, 2000))}
              error={showEditErrors ? editErrors.negativeInfo : undefined}
              disabled={isEditSubmitting}
              rows={3}
              maxLength={2000}
            />

            <TextAreaField
              label="Комментарий"
              value={editForm.comment}
              onChange={(event) => updateEditForm("comment", sanitizeByMaxLength(event.target.value, COMPANY_COMMENT_MAX_LENGTH))}
              error={showEditErrors ? editErrors.comment : undefined}
              disabled={isEditSubmitting}
              rows={4}
              maxLength={COMPANY_COMMENT_MAX_LENGTH}
            />
          </div>

          {editError && (
            <div className={styles.messages}>
              <Alert tone="error">{editError}</Alert>
            </div>
          )}

          <Divider />

          <div className={styles.modalActions}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsEditOpen(false);
                setEditError(null);
                setEditErrors({});
                setShowEditErrors(false);
              }}
              disabled={isEditSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isEditSubmitting}>
              {isEditSubmitting ? <Spinner size={20} /> : "Сохранить"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
