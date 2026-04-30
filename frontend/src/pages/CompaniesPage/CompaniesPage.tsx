import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  getCompanyById,
  getCompanyLookups,
  transferCompany,
  updateCompany,
} from "../../api/companiesApi";
import { createDeal, getDealLookups } from "../../api/dealsApi";
import { getGroupLeadManagers, getTransferTargets, getUsers } from "../../api/usersApi";
import type { Company, CompanyDetails, CompanyFormValues } from "../../types/company";
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

type DealValidationErrors = Partial<Record<keyof DealFormValues, string>>;

const emptyDealForm: DealFormValues = {
  need: "",
  dealStatusId: "",
  plCostRub: "",
  leasingCompanyId: "",
  agentFeePercent: "",
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

  if (!/^\d+(\.\d+)?$/.test(values.agentFeePercent.trim())) {
    errors.agentFeePercent = "Укажите процент";
  } else {
    const percent = Number(values.agentFeePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      errors.agentFeePercent = "0–100";
    }
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

const formatDateTime = (value: string) => {
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
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchName, setSearchName] = useState("");
  const [searchInn, setSearchInn] = useState("");
  const [managerFilterUserId, setManagerFilterUserId] = useState("");
  const [managerFilterOptions, setManagerFilterOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "Все менеджеры" },
  ]);
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
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isDeleteSubmittingId, setIsDeleteSubmittingId] = useState<number | null>(null);

  const [companyLookups, setCompanyLookups] = useState<{
    taxSystems: { id: number; name: string }[];
    communicationChannels: { id: number; name: string }[];
  } | null>(null);
  const [communicationChannelOptions, setCommunicationChannelOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "—" },
  ]);
  const [taxSystemOptions, setTaxSystemOptions] = useState<SelectFieldOption[]>([{ value: "", label: "—" }]);

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

  useEffect(() => {
    let isCancelled = false;

    const loadLookups = async () => {
      try {
        const lookups = await getCompanyLookups();
        if (isCancelled) return;
        setCompanyLookups({
          taxSystems: lookups.taxSystems.map((t) => ({ id: t.id, name: t.name })),
          communicationChannels: lookups.communicationChannels.map((c) => ({ id: c.id, name: c.name })),
        });
        setCommunicationChannelOptions([
          { value: "", label: "—" },
          ...lookups.communicationChannels.map((item) => ({ value: String(item.id), label: item.name })),
        ]);
        setTaxSystemOptions([
          { value: "", label: "—" },
          ...lookups.taxSystems.map((item) => ({ value: String(item.id), label: item.name })),
        ]);
      } catch {
        if (!isCancelled) {
          setCompanyLookups({ taxSystems: [], communicationChannels: [] });
          setCommunicationChannelOptions([{ value: "", label: "—" }]);
          setTaxSystemOptions([{ value: "", label: "—" }]);
        }
      }
    };

    void loadLookups();

    return () => {
      isCancelled = true;
    };
  }, []);

  const showManagerFilter = currentUser.role === "owner" || currentUser.role === "group_lead";

  useEffect(() => {
    if (!showManagerFilter) {
      return;
    }

    let isCancelled = false;

    const getUserLabel = (user: {
      username: string;
      lastName: string | null;
      firstName: string | null;
      middleName?: string | null;
    }) => {
      const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
      return fullName ? `${user.username} — ${fullName}` : user.username;
    };

    const loadManagers = async () => {
      try {
        if (currentUser.role === "owner") {
          const users = await getUsers();
          const options: SelectFieldOption[] = users
            .filter((user) => user.role === "manager" || user.role === "group_lead")
            .map((user) => ({ value: String(user.id), label: getUserLabel(user) }))
            .sort((a, b) => a.label.localeCompare(b.label, "ru"));

          if (!isCancelled) {
            setManagerFilterOptions([{ value: "", label: "Все менеджеры" }, ...options]);
          }
          return;
        }

        const managers = await getGroupLeadManagers();
        const options: SelectFieldOption[] = managers
          .map((manager) => ({ value: String(manager.id), label: getUserLabel(manager) }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru"));

        if (!isCancelled) {
          setManagerFilterOptions([{ value: "", label: "Все менеджеры" }, ...options]);
        }
      } catch {
        if (!isCancelled) {
          setManagerFilterOptions([{ value: "", label: "Все менеджеры" }]);
        }
      }
    };

    void loadManagers();

    return () => {
      isCancelled = true;
    };
  }, [currentUser.role, showManagerFilter]);

  useEffect(() => {
    if (!showManagerFilter) return;
    if (!managerFilterUserId) return;
    const exists = managerFilterOptions.some((option) => option.value === managerFilterUserId);
    if (!exists) {
      setManagerFilterUserId("");
    }
  }, [managerFilterOptions, managerFilterUserId, showManagerFilter]);

  const filteredCompanies = useMemo(() => {
    const nameFilter = searchName.trim().toLowerCase();
    const innFilter = searchInn.trim();

    return companies.filter((company) => {
      const matchesName = !nameFilter || company.name.toLowerCase().includes(nameFilter);
      const matchesInn = !innFilter || company.inn.includes(innFilter);
      const matchesManager =
        !managerFilterUserId || String(company.managerUserId) === managerFilterUserId;
      return matchesName && matchesInn && matchesManager;
    });
  }, [companies, managerFilterUserId, searchInn, searchName]);

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
    setIsEditLoading(true);
    setEditErrors({});

    void (async () => {
      try {
        const [lookups, details] = await Promise.all([
          companyLookups ? Promise.resolve(companyLookups) : getCompanyLookups(),
          getCompanyById(company.id),
        ]);

        if (!companyLookups) {
          setCompanyLookups({
            taxSystems: lookups.taxSystems.map((t) => ({ id: t.id, name: t.name })),
            communicationChannels: lookups.communicationChannels.map((c) => ({ id: c.id, name: c.name })),
          });
          setCommunicationChannelOptions([
            { value: "", label: "—" },
            ...lookups.communicationChannels.map((item) => ({ value: String(item.id), label: item.name })),
          ]);
          setTaxSystemOptions([
            { value: "", label: "—" },
            ...lookups.taxSystems.map((item) => ({ value: String(item.id), label: item.name })),
          ]);
        }

        const companyDetails: CompanyDetails = details;

        setEditForm({
          name: companyDetails.name,
          inn: companyDetails.inn,
          contactName: companyDetails.contactName ?? "",
          phone: companyDetails.phone ?? "",
          email: companyDetails.email ?? "",
          comment: companyDetails.comment ?? "",
          nextContactAt: toDatetimeLocal(companyDetails.nextContactAt),
          legalAddress: companyDetails.legalAddress ?? "",
          actualAddress: companyDetails.actualAddress ?? "",
          directorBirthDate: toDateInputValue(companyDetails.directorBirthDate),
          activity: companyDetails.activity ?? "",
          revenueRub: companyDetails.revenueRub === null ? "" : String(companyDetails.revenueRub),
          negativeInfo: companyDetails.negativeInfo ?? "",
          bik: companyDetails.bik ?? "",
          rs: companyDetails.rs ?? "",
          ks: companyDetails.ks ?? "",
          taxSystemId: companyDetails.taxSystemId === null ? "" : String(companyDetails.taxSystemId),
          preferredCommunicationChannelId:
            companyDetails.preferredCommunicationChannelId === null ? "" : String(companyDetails.preferredCommunicationChannelId),
        });
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Не удалось загрузить данные компании."));
      } finally {
        setIsEditLoading(false);
      }
    })();
  };

  const closeEditModal = () => {
    setEditingCompanyId(null);
    setEditForm(emptyForm);
    setEditErrors({});
    setIsEditLoading(false);
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
      return user.username;
    }

    return `${name} (${user.username})`;
  };

  const openTransferModal = async (company: Company) => {
    if (!canTransferCompanies) {
      return;
    }

    setError(null);
    setTransferCompanyCandidate(company);
    setTransferTargetUserId(String(company.managerUserId));
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
    company.managerUserId === currentUser.id;

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
        {showManagerFilter && (
          <div className={styles.filtersGrow}>
            <SelectField
              label="Менеджер"
              value={managerFilterUserId}
              onChange={(event) => setManagerFilterUserId(event.target.value)}
              options={managerFilterOptions}
            />
          </div>
        )}
        <div className={styles.filtersActions}>
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
              <Th style={{ width: showManagerColumn ? "13%" : "22%" }}>
                Наименование
              </Th>
              {showManagerColumn && (
                <Th style={{ width: "10%" }}>
                  Менеджер
                </Th>
              )}
              <Th style={{ width: "9%" }}>
                ИНН
              </Th>
              <Th style={{ width: "10%" }}>
                Контакт
              </Th>
              <Th style={{ width: "9%" }}>
                Телефон
              </Th>
              <Th style={{ width: "15%" }}>
                Почта
              </Th>
              <Th style={{ width: "13%" }}>
                Комментарий
              </Th>
              <Th style={{ width: "11%" }}>
                Связаться
              </Th>
              <Th style={{ width: "12%" }}>
                Создано
              </Th>
              <Th style={{ width: "12%" }}>
                Обновлено
              </Th>
              <Th style={{ width: "10%", textAlign: "left" }}>
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
                  <Td>
                    <button
                      type="button"
                      className={styles.companyLink}
                      onClick={() => navigate(`/companies/${company.id}`)}
                      title="Открыть карточку компании"
                    >
                      {company.name}
                    </button>
                  </Td>

                  {showManagerColumn && <Td>{company.managerName}</Td>}

                  <Td>
                    {company.inn}
                  </Td>

                  <Td>
                    {company.contactName || "—"}
                  </Td>

                  <Td>
                    {company.phone || "—"}
                  </Td>

                  <Td>
                    {company.email || "—"}
                  </Td>

                  <Td>
                    {company.comment || "—"}
                  </Td>

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

                  <Td>{formatDateTime(company.createdAt)}</Td>
                  <Td>{formatDateTime(company.updatedAt)}</Td>

                  <Td style={{ textAlign: "center" }}>
                    {canManage ? (
                      <div className={styles.actions}>
                        <>
                          <div className={styles.actionRow}>
                            <IconButton
                              tone="neutral"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  companyId: String(company.id),
                                });
                                navigate(`/deals?${params.toString()}`, {
                                  state: { companyName: company.name },
                                });
                              }}
                              title="Перейти к сделкам компании"
                            >
                              <Icon name="arrowRight" size={18} />
                            </IconButton>
                            <IconButton tone="neutral" onClick={() => openCreateDealModal(company)} title="Создать сделку">
                              <Icon name="plus" size={18} />
                            </IconButton>
                            <IconButton tone="neutral" onClick={() => openEditModal(company)} title="Редактировать">
                              <Icon name="edit" size={18} />
                            </IconButton>
                          </div>
                          <div className={styles.actionRow}>
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
                          </div>
                        </>
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
                  <Td colSpan={showManagerColumn ? 11 : 10} style={{ textAlign: "center" }}>
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

          <InputField
            label="Юридический адрес"
            value={createForm.legalAddress}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, legalAddress: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="Фактический адрес"
            value={createForm.actualAddress}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, actualAddress: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="День рождения директора"
            type="date"
            value={createForm.directorBirthDate}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, directorBirthDate: event.target.value }))}
            disabled={isCreateSubmitting}
          />

          <TextAreaField
            label="Вид деятельности"
            value={createForm.activity}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, activity: event.target.value }))}
            disabled={isCreateSubmitting}
            rows={3}
          />

          <InputField
            label="Выручка, ₽"
            value={createForm.revenueRub}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, revenueRub: event.target.value }))}
            disabled={isCreateSubmitting}
            error={createErrors.revenueRub}
            inputMode="numeric"
          />

          <TextAreaField
            label="Выявленный негатив"
            value={createForm.negativeInfo}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, negativeInfo: event.target.value }))}
            disabled={isCreateSubmitting}
            rows={3}
          />

          <SelectField
            label="Предпочитает общение через"
            value={createForm.preferredCommunicationChannelId}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, preferredCommunicationChannelId: event.target.value }))
            }
            options={communicationChannelOptions}
            disabled={isCreateSubmitting}
          />

          <SelectField
            label="Система налогообложения"
            value={createForm.taxSystemId}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, taxSystemId: event.target.value }))}
            options={taxSystemOptions}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="БИК"
            value={createForm.bik}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, bik: event.target.value }))}
            disabled={isCreateSubmitting}
            error={createErrors.bik}
          />

          <InputField
            label="Р/С"
            value={createForm.rs}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, rs: event.target.value }))}
            disabled={isCreateSubmitting}
            error={createErrors.rs}
          />

          <InputField
            label="К/С"
            value={createForm.ks}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, ks: event.target.value }))}
            disabled={isCreateSubmitting}
            error={createErrors.ks}
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
        open={Boolean(editingCompany)}
        title={editingCompany ? `Редактировать — ${editingCompany.name}` : "Редактировать компанию"}
        onClose={() => {
          if (isEditSubmitting) return;
          closeEditModal();
        }}
      >
        {editingCompany && isEditLoading && (
          <div className={styles.loadingBlock}>
            <Spinner size={26} />
          </div>
        )}

        {editingCompany && !isEditLoading && (
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
              value={editForm.contactName}
              onChange={(event) => setEditForm((prev) => ({ ...prev, contactName: event.target.value }))}
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
              onChange={(event) => setEditForm((prev) => ({ ...prev, nextContactAt: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Юридический адрес"
              value={editForm.legalAddress}
              onChange={(event) => setEditForm((prev) => ({ ...prev, legalAddress: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <InputField
              label="Фактический адрес"
              value={editForm.actualAddress}
              onChange={(event) => setEditForm((prev) => ({ ...prev, actualAddress: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <InputField
              label="День рождения директора"
              type="date"
              value={editForm.directorBirthDate}
              onChange={(event) => setEditForm((prev) => ({ ...prev, directorBirthDate: event.target.value }))}
              disabled={isEditSubmitting}
            />

            <TextAreaField
              label="Вид деятельности"
              value={editForm.activity}
              onChange={(event) => setEditForm((prev) => ({ ...prev, activity: event.target.value }))}
              disabled={isEditSubmitting}
              rows={3}
            />

            <InputField
              label="Выручка, ₽"
              value={editForm.revenueRub}
              onChange={(event) => setEditForm((prev) => ({ ...prev, revenueRub: event.target.value }))}
              disabled={isEditSubmitting}
              error={editErrors.revenueRub}
              inputMode="numeric"
            />

            <TextAreaField
              label="Выявленный негатив"
              value={editForm.negativeInfo}
              onChange={(event) => setEditForm((prev) => ({ ...prev, negativeInfo: event.target.value }))}
              disabled={isEditSubmitting}
              rows={3}
            />

            <SelectField
              label="Предпочитает общение через"
              value={editForm.preferredCommunicationChannelId}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, preferredCommunicationChannelId: event.target.value }))
              }
              options={communicationChannelOptions}
              disabled={isEditSubmitting}
            />

            <SelectField
              label="Система налогообложения"
              value={editForm.taxSystemId}
              onChange={(event) => setEditForm((prev) => ({ ...prev, taxSystemId: event.target.value }))}
              options={taxSystemOptions}
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

            <TextAreaField
              label="Комментарий"
              value={editForm.comment}
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
              value={dealForm.agentFeePercent}
              onChange={(event) => setDealForm((prev) => ({ ...prev, agentFeePercent: event.target.value }))}
              required
              error={dealErrors.agentFeePercent}
              disabled={isDealSubmitting}
              inputMode="decimal"
            />

            <InputField
              label="АВ, руб."
              value={String(
                Math.round(
                  (Number(dealForm.plCostRub) || 0) * ((Number(dealForm.agentFeePercent) || 0) / 100),
                ),
              )}
              disabled
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
          <InputField label="Текущий менеджер" value={transferCompanyCandidate?.managerName ?? ""} disabled />

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
