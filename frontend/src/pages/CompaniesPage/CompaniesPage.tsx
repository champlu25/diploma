import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createCompany,
  deleteCompany,
  getCompaniesPage,
  getCompanyById,
  getCompanyLookups,
  transferCompany,
  updateCompany,
} from "../../api/companiesApi";
import { createDeal, getDealLookups } from "../../api/dealsApi";
import { getGroupLeadManagers, getTransferTargets, getUsers } from "../../api/usersApi";
import type { Company, CompanyDetails, CompanyFormValues } from "../../types/company";
import type { DealFormValues, DealLookups } from "../../types/deal";
import type { CurrentUser, User } from "../../types/user";
import { APP_ROUTES } from "../../constants/routes";
import { getApiErrorMessage } from "../../utils/httpError";
import {
  hasValidationErrors,
  sanitizeByMaxLength,
  sanitizeDecimal,
  sanitizeDigits,
  sanitizeEmail,
  sanitizePersonName,
  sanitizePhone,
  validateCompanyForm as validateCompanyFormShared,
  validateDealForm as validateDealFormShared,
  type ValidationErrors,
} from "../../utils/validation";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import {
  InputField,
  SelectField,
  TextAreaField,
  type SelectFieldOption,
} from "../../components/ui/Field/Field";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Icon } from "../../components/ui/Icon/Icon";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./CompaniesPage.module.scss";

interface CompaniesPageProps {
  currentUser: CurrentUser;
}

const PAGE_SIZE = 10;

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

const validateCompanyForm = (values: CompanyFormValues): CompanyValidationErrors =>
  validateCompanyFormShared(values);

type DealValidationErrors = ValidationErrors<keyof DealFormValues>;

const emptyDealForm: DealFormValues = {
  need: "",
  dealStatusId: "",
  plCostRub: "",
  leasingCompanyId: "",
  agentFeePercent: "",
  dealStageId: "",
  comment: "",
};

const validateDealForm = (values: DealFormValues): DealValidationErrors =>
  validateDealFormShared(values);

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
  const [companySortMode, setCompanySortMode] = useState("created_desc");
  const [managerFilterOptions, setManagerFilterOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "Все менеджеры" },
  ]);
  const [hasMoreCompanies, setHasMoreCompanies] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CompanyFormValues>(emptyForm);
  const [createErrors, setCreateErrors] = useState<CompanyValidationErrors>({});
  const [showCreateErrors, setShowCreateErrors] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CompanyFormValues>(emptyForm);
  const [editErrors, setEditErrors] = useState<CompanyValidationErrors>({});
  const [showEditErrors, setShowEditErrors] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isDeleteSubmittingId, setIsDeleteSubmittingId] = useState<number | null>(null);

  const [companyLookups, setCompanyLookups] = useState<{
    taxSystems: { id: number; name: string }[];
    communicationChannels: { id: number; name: string }[];
  } | null>(null);
  const [communicationChannelOptions, setCommunicationChannelOptions] = useState<
    SelectFieldOption[]
  >([{ value: "", label: "—" }]);
  const [taxSystemOptions, setTaxSystemOptions] = useState<SelectFieldOption[]>([
    { value: "", label: "—" },
  ]);

  const [creatingDealCompanyId, setCreatingDealCompanyId] = useState<number | null>(null);
  const [dealLookups, setDealLookups] = useState<DealLookups | null>(null);
  const [dealForm, setDealForm] = useState<DealFormValues>(emptyDealForm);
  const [dealErrors, setDealErrors] = useState<DealValidationErrors>({});
  const [showDealErrors, setShowDealErrors] = useState(false);
  const [isDealSubmitting, setIsDealSubmitting] = useState(false);

  const [transferTargets, setTransferTargets] = useState<User[] | null>(null);
  const [transferCompanyCandidate, setTransferCompanyCandidate] = useState<Company | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTransferSubmitting, setIsTransferSubmitting] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryVersionRef = useRef(0);

  const updateCreateForm = <K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) => {
    setCreateForm((prev) => {
      const next = { ...prev, [field]: value };
      if (showCreateErrors) {
        setCreateErrors(validateCompanyForm(next));
      }
      return next;
    });
  };

  const updateEditForm = <K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (showEditErrors) {
        setEditErrors(validateCompanyForm(next));
      }
      return next;
    });
  };

  const updateDealForm = <K extends keyof DealFormValues>(field: K, value: DealFormValues[K]) => {
    setDealForm((prev) => {
      const next = { ...prev, [field]: value };
      if (showDealErrors) {
        setDealErrors(validateDealForm(next));
      }
      return next;
    });
  };

  const creatingDealCompany = useMemo(
    () => companies.find((company) => company.id === creatingDealCompanyId) ?? null,
    [companies, creatingDealCompanyId],
  );

  const loadCompaniesPageChunk = useCallback(async (offset: number, append: boolean, version: number) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsInitialLoading(true);
      }
      setError(null);
      const data = await getCompaniesPage({
        searchName,
        searchInn,
        managerUserId: managerFilterUserId,
        sort: companySortMode,
        limit: PAGE_SIZE,
        offset,
      });
      if (version !== queryVersionRef.current) {
        return;
      }

      setCompanies((prev) => (append ? prev.concat(data.companies) : data.companies));
      setHasMoreCompanies(data.hasMore);
      setNextOffset(offset + data.companies.length);
    } catch (requestError) {
      if (version !== queryVersionRef.current) {
        return;
      }
      setError(getApiErrorMessage(requestError, "Не удалось загрузить компании."));
      if (!append) {
        setCompanies([]);
      }
      setHasMoreCompanies(false);
    } finally {
      if (version !== queryVersionRef.current) {
        return;
      }

      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, [companySortMode, managerFilterUserId, searchInn, searchName]);

  const resetCompanies = useCallback(async () => {
    const version = queryVersionRef.current + 1;
    queryVersionRef.current = version;
    setCompanies([]);
    setHasMoreCompanies(true);
    setNextOffset(0);
    setIsLoadingMore(false);
    await loadCompaniesPageChunk(0, false, version);
  }, [loadCompaniesPageChunk]);

  useEffect(() => {
    void resetCompanies();
  }, [resetCompanies]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMoreCompanies || isInitialLoading || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        observer.disconnect();
        void loadCompaniesPageChunk(nextOffset, true, queryVersionRef.current);
      },
      {
        rootMargin: "200px 0px",
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreCompanies, isInitialLoading, isLoadingMore, loadCompaniesPageChunk, nextOffset]);

  useEffect(() => {
    let isCancelled = false;

    const loadLookups = async () => {
      try {
        const lookups = await getCompanyLookups();
        if (isCancelled) return;
        setCompanyLookups({
          taxSystems: lookups.taxSystems.map((t) => ({ id: t.id, name: t.name })),
          communicationChannels: lookups.communicationChannels.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        });
        setCommunicationChannelOptions([
          { value: "", label: "—" },
          ...lookups.communicationChannels.map((item) => ({
            value: String(item.id),
            label: item.name,
          })),
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

  const companySortOptions: SelectFieldOption[] = [
    { value: "created_desc", label: "По дате создания (сначала новые)" },
    { value: "name_asc", label: "По наименованию (А–Я)" },
  ];

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
        const ownFilterOption: SelectFieldOption = {
          value: String(currentUser.id),
          label: "\u041c\u043e\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
        };

        if (currentUser.role === "owner") {
          const users = await getUsers();
          const options: SelectFieldOption[] = users
            .filter((user) => user.role === "manager" || user.role === "group_lead")
            .map((user) => ({ value: String(user.id), label: getUserLabel(user) }))
            .sort((a, b) => a.label.localeCompare(b.label, "ru"));
          options.unshift(ownFilterOption);

          if (!isCancelled) {
            setManagerFilterOptions([{ value: "", label: "Все менеджеры" }, ...options]);
          }
          return;
        }

        const managers = await getGroupLeadManagers();
        const options: SelectFieldOption[] = managers
          .map((manager) => ({ value: String(manager.id), label: getUserLabel(manager) }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru"));
        options.unshift(ownFilterOption);

        if (!isCancelled) {
          setManagerFilterOptions([{ value: "", label: "Все менеджеры" }, ...options]);
        }
      } catch {
        if (!isCancelled) {
          setManagerFilterOptions([
            { value: "", label: "Все менеджеры" },
            {
              value: String(currentUser.id),
              label: "\u041c\u043e\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
            },
          ]);
        }
      }
    };

    void loadManagers();

    return () => {
      isCancelled = true;
    };
  }, [currentUser.id, currentUser.role, showManagerFilter]);

  useEffect(() => {
    if (!showManagerFilter) return;
    if (!managerFilterUserId) return;
    const exists = managerFilterOptions.some((option) => option.value === managerFilterUserId);
    if (!exists) {
      setManagerFilterUserId("");
    }
  }, [managerFilterOptions, managerFilterUserId, showManagerFilter]);

  const filteredCompanies = companies;

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setShowCreateErrors(true);
    const validationErrors = validateCompanyForm(createForm);
    setCreateErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsCreateSubmitting(true);
      setError(null);
      await createCompany(createForm);
      await resetCompanies();
      setCreateForm(emptyForm);
      setCreateErrors({});
      setShowCreateErrors(false);
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
    setShowEditErrors(false);

    void (async () => {
      try {
        const [lookups, details] = await Promise.all([
          companyLookups ? Promise.resolve(companyLookups) : getCompanyLookups(),
          getCompanyById(company.id),
        ]);

        if (!companyLookups) {
          setCompanyLookups({
            taxSystems: lookups.taxSystems.map((t) => ({ id: t.id, name: t.name })),
            communicationChannels: lookups.communicationChannels.map((c) => ({
              id: c.id,
              name: c.name,
            })),
          });
          setCommunicationChannelOptions([
            { value: "", label: "—" },
            ...lookups.communicationChannels.map((item) => ({
              value: String(item.id),
              label: item.name,
            })),
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
          taxSystemId:
            companyDetails.taxSystemId === null ? "" : String(companyDetails.taxSystemId),
          preferredCommunicationChannelId:
            companyDetails.preferredCommunicationChannelId === null
              ? ""
              : String(companyDetails.preferredCommunicationChannelId),
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
    setShowEditErrors(false);
    setIsEditLoading(false);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCompany) {
      return;
    }

    setShowEditErrors(true);
    const validationErrors = validateCompanyForm(editForm);
    setEditErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsEditSubmitting(true);
      setError(null);
      await updateCompany(editingCompany.id, editForm);
      await resetCompanies();
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
    setShowDealErrors(false);
    setCreatingDealCompanyId(company.id);
    void ensureDealLookups();
  };

  const closeCreateDealModal = () => {
    if (isDealSubmitting) return;
    setCreatingDealCompanyId(null);
    setDealForm(emptyDealForm);
    setDealErrors({});
    setShowDealErrors(false);
  };

  const handleCreateDealSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!creatingDealCompany) return;

    setShowDealErrors(true);
    const validationErrors = validateDealForm(dealForm);
    setDealErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsDealSubmitting(true);
      setError(null);
      await createDeal(creatingDealCompany.id, dealForm);
      closeCreateDealModal();
      navigate(APP_ROUTES.deals);
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
      await resetCompanies();
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
      await resetCompanies();
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
            placeholder='Например: ООО "Ромашка"'
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
        <div className={styles.filtersGrow}>
          <SelectField
            label="Сортировка"
            value={companySortMode}
            onChange={(event) => setCompanySortMode(event.target.value)}
            options={companySortOptions}
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
            <Th style={{ width: showManagerColumn ? "13%" : "22%" }}>Наименование</Th>
            {showManagerColumn && <Th style={{ width: "10%" }}>Менеджер</Th>}
            <Th style={{ width: "9%" }}>ИНН</Th>
            <Th style={{ width: "10%" }}>Контакт</Th>
            <Th style={{ width: "9%" }}>Телефон</Th>
            <Th style={{ width: "15%" }}>Почта</Th>
            <Th style={{ width: "13%" }}>Комментарий</Th>
            <Th style={{ width: "11%" }}>Связаться</Th>
            <Th style={{ width: "12%" }}>Создано</Th>
            <Th style={{ width: "12%" }}>Обновлено</Th>
            <Th style={{ width: "10%", textAlign: "left" }}>Действия</Th>
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
                    onClick={() => navigate(APP_ROUTES.companyDetails(company.id))}
                    title="Открыть карточку компании"
                  >
                    {company.name}
                  </button>
                </Td>

                {showManagerColumn && <Td>{company.managerName}</Td>}

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
                              navigate(`${APP_ROUTES.deals}?${params.toString()}`, {
                                state: { companyName: company.name },
                              });
                            }}
                            title="Перейти к сделкам компании"
                          >
                            <Icon name="arrowRight" size={18} />
                          </IconButton>
                          <IconButton
                            tone="neutral"
                            onClick={() => openCreateDealModal(company)}
                            title="Создать сделку"
                          >
                            <Icon name="plus" size={18} />
                          </IconButton>
                          <IconButton
                            tone="neutral"
                            onClick={() => openEditModal(company)}
                            title="Редактировать"
                          >
                            <Icon name="edit" size={18} />
                          </IconButton>
                        </div>
                        <div className={styles.actionRow}>
                          {canTransferCompanies && (
                            <IconButton
                              tone="neutral"
                              onClick={() => void openTransferModal(company)}
                              title="Передать"
                            >
                              <Icon name="users" size={18} />
                            </IconButton>
                          )}
                          <IconButton
                            onClick={() => void handleDelete(company)}
                            disabled={isDeleteSubmitting}
                            title="Удалить"
                            tone="danger"
                          >
                            {isDeleteSubmitting ? (
                              <Spinner size={18} />
                            ) : (
                              <Icon name="trash" size={18} />
                            )}
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

      {hasMoreCompanies && <div ref={loadMoreRef} className={styles.loadMoreTrigger} aria-hidden="true" />}

      {(isInitialLoading || isLoadingMore) && (
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
          setShowCreateErrors(false);
        }}
      >
        <form className={styles.modalForm} onSubmit={handleCreateSubmit} noValidate>
          <InputField
            label="Наименование"
            value={createForm.name}
            onChange={(event) =>
              updateCreateForm("name", sanitizeByMaxLength(event.target.value, 255))
            }
            required
            error={showCreateErrors ? createErrors.name : undefined}
            disabled={isCreateSubmitting}
            maxLength={255}
          />

          <InputField
            label="ИНН"
            value={createForm.inn}
            onChange={(event) => updateCreateForm("inn", sanitizeDigits(event.target.value, 12))}
            required
            error={showCreateErrors ? createErrors.inn : undefined}
            disabled={isCreateSubmitting}
            inputMode="numeric"
            maxLength={12}
          />

          <InputField
            label="Контактное лицо"
            value={createForm.contactName}
            onChange={(event) => updateCreateForm("contactName", sanitizePersonName(event.target.value))}
            disabled={isCreateSubmitting}
            maxLength={100}
          />

          <InputField
            label="Телефон"
            value={createForm.phone}
            onChange={(event) => updateCreateForm("phone", sanitizePhone(event.target.value))}
            error={showCreateErrors ? createErrors.phone : undefined}
            disabled={isCreateSubmitting}
            maxLength={20}
          />

          <InputField
            label="Почта"
            value={createForm.email}
            onChange={(event) => updateCreateForm("email", sanitizeEmail(event.target.value))}
            error={showCreateErrors ? createErrors.email : undefined}
            disabled={isCreateSubmitting}
            maxLength={254}
          />

          <InputField
            label="Связаться"
            type="datetime-local"
            value={createForm.nextContactAt}
            onChange={(event) =>
              updateCreateForm("nextContactAt", event.target.value)
            }
            error={showCreateErrors ? createErrors.nextContactAt : undefined}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="Юридический адрес"
            value={createForm.legalAddress}
            onChange={(event) =>
              updateCreateForm("legalAddress", sanitizeByMaxLength(event.target.value, 500))
            }
            error={showCreateErrors ? createErrors.legalAddress : undefined}
            disabled={isCreateSubmitting}
            maxLength={500}
          />

          <InputField
            label="Фактический адрес"
            value={createForm.actualAddress}
            onChange={(event) =>
              updateCreateForm("actualAddress", sanitizeByMaxLength(event.target.value, 500))
            }
            error={showCreateErrors ? createErrors.actualAddress : undefined}
            disabled={isCreateSubmitting}
            maxLength={500}
          />

          <InputField
            label="День рождения директора"
            type="date"
            value={createForm.directorBirthDate}
            onChange={(event) =>
              updateCreateForm("directorBirthDate", event.target.value)
            }
            error={showCreateErrors ? createErrors.directorBirthDate : undefined}
            disabled={isCreateSubmitting}
          />

          <TextAreaField
            label="Вид деятельности"
            value={createForm.activity}
            onChange={(event) =>
              updateCreateForm("activity", sanitizeByMaxLength(event.target.value, 200))
            }
            error={showCreateErrors ? createErrors.activity : undefined}
            disabled={isCreateSubmitting}
            rows={3}
            maxLength={200}
          />

          <InputField
            label="Выручка, ₽"
            value={createForm.revenueRub}
            onChange={(event) =>
              updateCreateForm("revenueRub", sanitizeDigits(event.target.value))
            }
            disabled={isCreateSubmitting}
            error={showCreateErrors ? createErrors.revenueRub : undefined}
            inputMode="numeric"
          />

          <TextAreaField
            label="Выявленный негатив"
            value={createForm.negativeInfo}
            onChange={(event) =>
              updateCreateForm("negativeInfo", sanitizeByMaxLength(event.target.value, 2000))
            }
            error={showCreateErrors ? createErrors.negativeInfo : undefined}
            disabled={isCreateSubmitting}
            rows={3}
            maxLength={2000}
          />

          <SelectField
            label="Предпочитает общение через"
            value={createForm.preferredCommunicationChannelId}
            onChange={(event) =>
              updateCreateForm("preferredCommunicationChannelId", event.target.value)
            }
            options={communicationChannelOptions}
            error={showCreateErrors ? createErrors.preferredCommunicationChannelId : undefined}
            disabled={isCreateSubmitting}
          />

          <SelectField
            label="Система налогообложения"
            value={createForm.taxSystemId}
            onChange={(event) =>
              updateCreateForm("taxSystemId", event.target.value)
            }
            options={taxSystemOptions}
            error={showCreateErrors ? createErrors.taxSystemId : undefined}
            disabled={isCreateSubmitting}
          />

          <InputField
            label="БИК"
            value={createForm.bik}
            onChange={(event) => updateCreateForm("bik", sanitizeDigits(event.target.value, 9))}
            disabled={isCreateSubmitting}
            error={showCreateErrors ? createErrors.bik : undefined}
            inputMode="numeric"
            maxLength={9}
          />

          <InputField
            label="Р/С"
            value={createForm.rs}
            onChange={(event) => updateCreateForm("rs", sanitizeDigits(event.target.value, 20))}
            disabled={isCreateSubmitting}
            error={showCreateErrors ? createErrors.rs : undefined}
            inputMode="numeric"
            maxLength={20}
          />

          <InputField
            label="К/С"
            value={createForm.ks}
            onChange={(event) => updateCreateForm("ks", sanitizeDigits(event.target.value, 20))}
            disabled={isCreateSubmitting}
            error={showCreateErrors ? createErrors.ks : undefined}
            inputMode="numeric"
            maxLength={20}
          />

          <TextAreaField
            label="Комментарий"
            value={createForm.comment}
            onChange={(event) =>
              updateCreateForm("comment", sanitizeByMaxLength(event.target.value, 2000))
            }
            error={showCreateErrors ? createErrors.comment : undefined}
            disabled={isCreateSubmitting}
            rows={4}
            maxLength={2000}
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
          <form className={styles.modalForm} onSubmit={handleEditSubmit} noValidate>
            <InputField
              label="Наименование"
              value={editForm.name}
              onChange={(event) =>
                updateEditForm("name", sanitizeByMaxLength(event.target.value, 255))
              }
              required
              error={showEditErrors ? editErrors.name : undefined}
              disabled={isEditSubmitting}
              maxLength={255}
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
              onChange={(event) =>
                updateEditForm("nextContactAt", event.target.value)
              }
              error={showEditErrors ? editErrors.nextContactAt : undefined}
              disabled={isEditSubmitting}
            />

            <TextAreaField
              label="Комментарий"
              value={editForm.comment}
              onChange={(event) =>
                updateEditForm("comment", event.target.value)
              }
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
        title={
          creatingDealCompany ? `Создать сделку — ${creatingDealCompany.name}` : "Создать сделку"
        }
        onClose={closeCreateDealModal}
      >
        {creatingDealCompany && (
          <form className={styles.modalForm} onSubmit={handleCreateDealSubmit} noValidate>
            <TextAreaField
              label="Потребность"
              value={dealForm.need}
              onChange={(event) =>
                updateDealForm("need", sanitizeByMaxLength(event.target.value, 500))
              }
              required
              error={showDealErrors ? dealErrors.need : undefined}
              disabled={isDealSubmitting}
              rows={2}
              maxLength={500}
            />

            <SelectField
              label="Статус"
              value={dealForm.dealStatusId}
              onChange={(event) =>
                updateDealForm("dealStatusId", event.target.value)
              }
              required
              error={showDealErrors ? dealErrors.dealStatusId : undefined}
              disabled={isDealSubmitting || !dealLookups}
              options={dealStatusOptions}
            />

            <InputField
              label="Стоимость ПЛ, ₽"
              value={dealForm.plCostRub}
              onChange={(event) =>
                updateDealForm(
                  "plCostRub",
                  sanitizeDecimal(event.target.value, { maxLength: 18, allowComma: true }),
                )
              }
              required
              error={showDealErrors ? dealErrors.plCostRub : undefined}
              disabled={isDealSubmitting}
              inputMode="decimal"
            />

            <SelectField
              label="Лизинговая"
              value={dealForm.leasingCompanyId}
              onChange={(event) =>
                updateDealForm("leasingCompanyId", event.target.value)
              }
              required
              error={showDealErrors ? dealErrors.leasingCompanyId : undefined}
              disabled={isDealSubmitting || !dealLookups}
              options={leasingOptions}
            />

            <InputField
              label="АВ, %"
              value={dealForm.agentFeePercent}
              onChange={(event) =>
                updateDealForm(
                  "agentFeePercent",
                  sanitizeDecimal(event.target.value, { maxLength: 6, allowComma: true }),
                )
              }
              required
              error={showDealErrors ? dealErrors.agentFeePercent : undefined}
              disabled={isDealSubmitting}
              inputMode="decimal"
            />

            <InputField
              label="АВ, руб."
              value={String(
                Math.round(
                  (Number(dealForm.plCostRub.replace(",", ".")) || 0) *
                    ((Number(dealForm.agentFeePercent.replace(",", ".")) || 0) / 100),
                ),
              )}
              disabled
              inputMode="numeric"
            />

            <SelectField
              label="Этап сделки"
              value={dealForm.dealStageId}
              onChange={(event) =>
                updateDealForm("dealStageId", event.target.value)
              }
              required
              error={showDealErrors ? dealErrors.dealStageId : undefined}
              disabled={isDealSubmitting || !dealLookups}
              options={stageOptions}
            />

            <TextAreaField
              label="Комментарий"
              value={dealForm.comment}
              onChange={(event) =>
                updateDealForm("comment", sanitizeByMaxLength(event.target.value, 2000))
              }
              error={showDealErrors ? dealErrors.comment : undefined}
              disabled={isDealSubmitting}
              rows={2}
              maxLength={2000}
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
          <InputField
            label="Текущий менеджер"
            value={transferCompanyCandidate?.managerName ?? ""}
            disabled
          />

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






