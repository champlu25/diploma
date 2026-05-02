import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import styles from "./CompanyDetailsPage.module.scss";

interface CompanyDetailsPageProps {
  currentUser: CurrentUser;
}

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

  // Accept both "YYYY-MM-DD" and ISO timestamps.
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

type CompanyValidationErrors = Partial<Record<keyof CompanyFormValues, string>>;

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

  const revenue = values.revenueRub.trim();
  if (revenue && !/^\d+$/.test(revenue)) {
    errors.revenueRub = "Выручка: число в рублях";
  }

  const hasAnyRequisites = Boolean(values.bik.trim() || values.rs.trim() || values.ks.trim());
  if (hasAnyRequisites && (!values.bik.trim() || !values.rs.trim() || !values.ks.trim())) {
    errors.bik = "Заполните БИК/РС/КС полностью";
    errors.rs = "Заполните БИК/РС/КС полностью";
    errors.ks = "Заполните БИК/РС/КС полностью";
  }

  return errors;
};

const hasValidationErrors = (errors: CompanyValidationErrors): boolean =>
  Object.values(errors).some(Boolean);

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
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [taxSystemOptions, setTaxSystemOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "—" },
  ]);
  const [communicationChannelOptions, setCommunicationChannelOptions] = useState<
    SelectFieldOption[]
  >([{ value: "", label: "—" }]);

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
        <Button type="button" variant="ghost" onClick={() => navigate("/companies")}>
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
        <Button type="button" variant="ghost" onClick={() => navigate("/companies")}>
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
                {company.revenueRub === null
                  ? "—"
                  : `${company.revenueRub.toLocaleString("ru-RU")} ₽`}
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
        }}
        className={styles.editModal}
      >
        <form className={styles.modalForm} onSubmit={handleEditSubmit} noValidate>
          <div className={styles.formGrid}>
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
              value={editForm.contactName}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, contactName: event.target.value }))
              }
              disabled={isEditSubmitting}
            />

            <InputField
              label="Телефон"
              value={editForm.phone}
              onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Почта"
              value={editForm.email}
              onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              error={editErrors.email}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Связаться"
              type="datetime-local"
              value={editForm.nextContactAt}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, nextContactAt: event.target.value }))
              }
              disabled={isEditSubmitting}
            />

            <InputField
              label="БИК"
              value={editForm.bik}
              onChange={(event) => setEditForm((prev) => ({ ...prev, bik: event.target.value }))}
              disabled={isEditSubmitting}
              error={editErrors.bik}
            />

            <InputField
              label="Р/С"
              value={editForm.rs}
              onChange={(event) => setEditForm((prev) => ({ ...prev, rs: event.target.value }))}
              disabled={isEditSubmitting}
              error={editErrors.rs}
            />

            <InputField
              label="К/С"
              value={editForm.ks}
              onChange={(event) => setEditForm((prev) => ({ ...prev, ks: event.target.value }))}
              disabled={isEditSubmitting}
              error={editErrors.ks}
            />

            <SelectField
              label="Система налогообложения"
              value={editForm.taxSystemId}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, taxSystemId: event.target.value }))
              }
              options={taxSystemOptions}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Юридический адрес"
              value={editForm.legalAddress}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, legalAddress: event.target.value }))
              }
              disabled={isEditSubmitting}
            />

            <InputField
              label="Фактический адрес"
              value={editForm.actualAddress}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, actualAddress: event.target.value }))
              }
              disabled={isEditSubmitting}
            />

            <InputField
              label="День рождения директора"
              type="date"
              value={editForm.directorBirthDate}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, directorBirthDate: event.target.value }))
              }
              disabled={isEditSubmitting}
            />

            <InputField
              label="Выручка, ₽"
              value={editForm.revenueRub}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, revenueRub: event.target.value }))
              }
              disabled={isEditSubmitting}
              error={editErrors.revenueRub}
              inputMode="numeric"
            />

            <SelectField
              label="Предпочитает общение через"
              value={editForm.preferredCommunicationChannelId}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  preferredCommunicationChannelId: event.target.value,
                }))
              }
              options={communicationChannelOptions}
              disabled={isEditSubmitting}
            />

            <TextAreaField
              label="Вид деятельности"
              value={editForm.activity}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, activity: event.target.value }))
              }
              disabled={isEditSubmitting}
              rows={3}
            />

            <TextAreaField
              label="Выявленный негатив"
              value={editForm.negativeInfo}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, negativeInfo: event.target.value }))
              }
              disabled={isEditSubmitting}
              rows={3}
            />

            <TextAreaField
              label="Комментарий"
              value={editForm.comment}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, comment: event.target.value }))
              }
              disabled={isEditSubmitting}
              rows={4}
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
              onClick={() => setIsEditOpen(false)}
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
