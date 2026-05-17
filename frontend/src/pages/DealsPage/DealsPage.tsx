import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { APP_ROUTES } from "../../constants/routes";
import {
  deleteDeal,
  getDealLookups,
  getDealsPage,
  updateDeal,
  updateDealLifecycleStatus,
} from "../../api/dealsApi";
import { getGroupLeadManagers, getUsers } from "../../api/usersApi";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { InputField, SelectField, TextAreaField } from "../../components/ui/Field/Field";
import { Icon } from "../../components/ui/Icon/Icon";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import type { Deal, DealFormValues, DealLookups } from "../../types/deal";
import type { CurrentUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import {
  DEAL_COMMENT_MAX_LENGTH,
  DEAL_NEED_MAX_LENGTH,
  hasValidationErrors,
  sanitizeByMaxLength,
  sanitizeDecimal,
  sanitizeDigits,
  validateDealForm,
  type ValidationErrors,
} from "../../utils/validation";
import styles from "./DealsPage.module.scss";

interface DealsPageProps {
  currentUser: CurrentUser;
}

const PAGE_SIZE = 10;

type DealValidationErrors = ValidationErrors<keyof DealFormValues>;

const emptyForm: DealFormValues = {
  need: "",
  dealStatusId: "",
  plCostRub: "",
  leasingCompanyId: "",
  agentFeePercent: "",
  dealStageId: "",
  comment: "",
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

const formatNumberLike = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ru-RU");
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed.toLocaleString("ru-RU");
    }
    return value;
  }

  return "—";
};

const formatAdvanceRub = (plCostRub: string, agentFeePercent: string): string => {
  const cost = Number(plCostRub.replace(",", "."));
  const percent = Number(agentFeePercent.replace(",", "."));
  const advance = (Number.isFinite(cost) ? cost : 0) * ((Number.isFinite(percent) ? percent : 0) / 100);
  return String(Math.round(advance));
};

export function DealsPage({ currentUser }: DealsPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const locationCompanyName =
    typeof (location.state as { companyName?: unknown } | null)?.companyName === "string"
      ? ((location.state as { companyName: string }).companyName ?? "").trim()
      : "";

  const fixedCompany = useMemo(() => {
    const companyIdParam = searchParams.get("companyId");
    const normalizedCompanyId = companyIdParam?.trim() ?? "";
    const hasCompanyId = /^\d+$/.test(normalizedCompanyId) && Number(normalizedCompanyId) > 0;

    return {
      companyId: hasCompanyId ? normalizedCompanyId : null,
    };
  }, [searchParams]);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [lookups, setLookups] = useState<DealLookups | null>(null);
  const [hasMoreDeals, setHasMoreDeals] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLifecycleStatusId, setSelectedLifecycleStatusId] = useState<number | null>(null);
  const [isLifecycleSubmittingId, setIsLifecycleSubmittingId] = useState<number | null>(null);

  const [searchCompanyName, setSearchCompanyName] = useState("");
  const [searchInn, setSearchInn] = useState("");
  const [managerFilterUserId, setManagerFilterUserId] = useState("");
  const [dealSortMode, setDealSortMode] = useState("created_desc");
  const [hotColdFilter, setHotColdFilter] = useState("");
  const [dealStageFilter, setDealStageFilter] = useState("");
  const [managerFilterOptions, setManagerFilterOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "Все менеджеры" }]);

  const [editingDealId, setEditingDealId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<DealFormValues>(emptyForm);
  const [editErrors, setEditErrors] = useState<DealValidationErrors>({});
  const [showEditErrors, setShowEditErrors] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const [isDeleteSubmittingId, setIsDeleteSubmittingId] = useState<number | null>(null);

  const [detailsDealId, setDetailsDealId] = useState<number | null>(null);
  const [detailsNeed, setDetailsNeed] = useState("");
  const [detailsComment, setDetailsComment] = useState("");
  const [showDetailsErrors, setShowDetailsErrors] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isDetailsSubmitting, setIsDetailsSubmitting] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryVersionRef = useRef(0);

  const editingDeal = useMemo(
    () => deals.find((deal) => deal.id === editingDealId) ?? null,
    [deals, editingDealId],
  );

  const detailsDeal = useMemo(
    () => deals.find((deal) => deal.id === detailsDealId) ?? null,
    [deals, detailsDealId],
  );

  const updateEditForm = <K extends keyof DealFormValues>(field: K, value: DealFormValues[K]) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (showEditErrors) {
        setEditErrors(validateDealForm(next));
      }
      return next;
    });
  };

  const canManageDeal = useCallback(
    (deal: Deal): boolean =>
      currentUser.role === "owner" ||
      currentUser.role === "group_lead" ||
      deal.companyManagerUserId === currentUser.id,
    [currentUser],
  );

  const showManagerFilter = currentUser.role === "owner" || currentUser.role === "group_lead";
  const dealSortOptions = useMemo(
    () => [
      { value: "created_desc", label: "По дате создания (сначала новые)" },
      { value: "company_asc", label: "По компании (А–Я)" },
      { value: "advance_desc", label: "По АВ руб (сначала больше)" },
    ],
    [],
  );
  const dealStageOptions = useMemo(
    () => [
      { value: "", label: "Все этапы" },
      ...(lookups?.dealStages ?? []).map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    ],
    [lookups],
  );

  useEffect(() => {
    if (!showManagerFilter) return;

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
        const ownFilterOption = {
          value: String(currentUser.id),
          label: "Мои сделки",
        };

        if (currentUser.role === "owner") {
          const users = await getUsers();
          const options = users
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
        const options = managers
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
              label: "Мои сделки",
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
    if (!showManagerFilter || !managerFilterUserId) return;
    const exists = managerFilterOptions.some((option) => option.value === managerFilterUserId);
    if (!exists) {
      setManagerFilterUserId("");
    }
  }, [managerFilterOptions, managerFilterUserId, showManagerFilter]);

  useEffect(() => {
    let isCancelled = false;

    const loadLookups = async () => {
      try {
        const nextLookups = await getDealLookups();
        if (!isCancelled) {
          setLookups(nextLookups);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setError(getApiErrorMessage(requestError, "Не удалось загрузить справочники сделок."));
        }
      }
    };

    void loadLookups();

    return () => {
      isCancelled = true;
    };
  }, []);

  const filteredDeals = deals;

  const fixedCompanyTitle = useMemo(() => {
    if (!fixedCompany.companyId) return null;
    if (locationCompanyName) return locationCompanyName;
    return (
      deals.find((deal) => String(deal.companyId) === fixedCompany.companyId)?.companyName ?? null
    );
  }, [deals, fixedCompany.companyId, locationCompanyName]);

  const selectedLifecycleStatusName = useMemo(() => {
    if (!lookups || !selectedLifecycleStatusId) return null;
    return (
      lookups.dealLifecycleStatuses.find((item) => item.id === selectedLifecycleStatusId)?.name ??
      null
    );
  }, [lookups, selectedLifecycleStatusId]);

  const activeLifecycleLabel = "Активные";
  const showActiveColumns =
    selectedLifecycleStatusName === null || selectedLifecycleStatusName === activeLifecycleLabel;
  const showCompletionColumn =
    selectedLifecycleStatusName !== null && selectedLifecycleStatusName !== activeLifecycleLabel;
  const tableColSpan = (showActiveColumns ? 12 : 10) + (showCompletionColumn ? 1 : 0);

  const loadDealsPageChunk = useCallback(async (offset: number, append: boolean, version: number) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsInitialLoading(true);
      }
      setError(null);

      const data = await getDealsPage({
        companyId: fixedCompany.companyId ? Number(fixedCompany.companyId) : undefined,
        searchCompanyName,
        searchInn,
        managerUserId: managerFilterUserId,
        lifecycleStatusId: selectedLifecycleStatusId,
        dealStageId: dealStageFilter,
        hotCold: hotColdFilter,
        sort: dealSortMode,
        limit: PAGE_SIZE,
        offset,
      });

      if (version !== queryVersionRef.current) {
        return;
      }

      setDeals((prev) => (append ? prev.concat(data.deals) : data.deals));
      setHasMoreDeals(data.hasMore);
      setNextOffset(offset + data.deals.length);
    } catch (requestError) {
      if (version !== queryVersionRef.current) {
        return;
      }
      setError(getApiErrorMessage(requestError, "Не удалось загрузить сделки."));
      if (!append) {
        setDeals([]);
      }
      setHasMoreDeals(false);
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
  }, [
    dealSortMode,
    dealStageFilter,
    fixedCompany.companyId,
    hotColdFilter,
    managerFilterUserId,
    searchCompanyName,
    searchInn,
    selectedLifecycleStatusId,
  ]);

  const resetDeals = useCallback(async () => {
    const version = queryVersionRef.current + 1;
    queryVersionRef.current = version;
    setDeals([]);
    setHasMoreDeals(true);
    setNextOffset(0);
    setIsLoadingMore(false);
    await loadDealsPageChunk(0, false, version);
  }, [loadDealsPageChunk]);

  useEffect(() => {
    void resetDeals();
  }, [resetDeals]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMoreDeals || isInitialLoading || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        observer.disconnect();
        void loadDealsPageChunk(nextOffset, true, queryVersionRef.current);
      },
      {
        rootMargin: "200px 0px",
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreDeals, isInitialLoading, isLoadingMore, loadDealsPageChunk, nextOffset]);

  useEffect(() => {
    if (fixedCompany.companyId) {
      setSelectedLifecycleStatusId(null);
    }
  }, [fixedCompany.companyId]);

  useEffect(() => {
    if (!lookups) return;

    const active = lookups.dealLifecycleStatuses.find((item) => item.name === "Активные");
    const fallbackId = active?.id ?? lookups.dealLifecycleStatuses[0]?.id ?? null;

    if (fixedCompany.companyId) {
      if (selectedLifecycleStatusId) {
        return;
      }

      const companyDeals = deals.filter(
        (deal) => String(deal.companyId) === fixedCompany.companyId,
      );
      const companyStatusIds = new Set(companyDeals.map((deal) => deal.dealLifecycleStatusId));
      const activeId = active?.id ?? null;
      const desiredId =
        (activeId && companyStatusIds.has(activeId) ? activeId : null) ??
        companyDeals[0]?.dealLifecycleStatusId ??
        fallbackId;

      if (desiredId) {
        setSelectedLifecycleStatusId(desiredId);
      }

      return;
    }

    if (selectedLifecycleStatusId) {
      const exists = lookups.dealLifecycleStatuses.some(
        (item) => item.id === selectedLifecycleStatusId,
      );
      if (exists) {
        return;
      }
    }

    setSelectedLifecycleStatusId(fallbackId);
  }, [deals, fixedCompany.companyId, lookups, selectedLifecycleStatusId]);

  const openEditModal = (deal: Deal) => {
    setError(null);
    setEditErrors({});
    setShowEditErrors(false);
    setEditingDealId(deal.id);
    setEditForm({
      need: deal.need,
      dealStatusId: String(deal.dealStatusId),
      plCostRub: String(deal.plCostRub),
      leasingCompanyId: String(deal.leasingCompanyId),
      agentFeePercent: String(deal.agentFeePercent),
      dealStageId: String(deal.dealStageId),
      comment: deal.comment ?? "",
    });
  };

  const closeEditModal = () => {
    setEditingDealId(null);
    setEditForm(emptyForm);
    setEditErrors({});
    setShowEditErrors(false);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDeal) return;

    setShowEditErrors(true);
    const validationErrors = validateDealForm(editForm);
    setEditErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsEditSubmitting(true);
      setError(null);

      await updateDeal(editingDeal.id, editForm);
      await resetDeals();
      closeEditModal();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось обновить сделку."));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const openDetailsModal = (deal: Deal) => {
    setDetailsError(null);
    setShowDetailsErrors(false);
    setDetailsDealId(deal.id);
    setDetailsNeed(deal.need);
    setDetailsComment(deal.comment ?? "");
  };

  const closeDetailsModal = () => {
    if (isDetailsSubmitting) return;
    setDetailsDealId(null);
    setDetailsNeed("");
    setDetailsComment("");
    setShowDetailsErrors(false);
    setDetailsError(null);
  };

  const handleDetailsSave = async () => {
    if (!detailsDeal) return;

    try {
      setIsDetailsSubmitting(true);
      setDetailsError(null);
      setShowDetailsErrors(true);

      const payload: DealFormValues = {
        need: detailsNeed,
        comment: detailsComment,
        dealStatusId: String(detailsDeal.dealStatusId),
        plCostRub: String(detailsDeal.plCostRub),
        leasingCompanyId: String(detailsDeal.leasingCompanyId),
        agentFeePercent: String(detailsDeal.agentFeePercent),
        dealStageId: String(detailsDeal.dealStageId),
      };

      const validationErrors = validateDealForm(payload);
      if (hasValidationErrors(validationErrors)) {
        setDetailsError("Проверьте поля формы.");
        return;
      }

      await updateDeal(detailsDeal.id, payload);
      await resetDeals();
      closeDetailsModal();
    } catch (requestError) {
      setDetailsError(getApiErrorMessage(requestError, "Не удалось обновить сделку."));
    } finally {
      setIsDetailsSubmitting(false);
    }
  };

  const handleDelete = async (deal: Deal) => {
    const confirmed = window.confirm(`Удалить сделку по компании «${deal.companyName}»?`);
    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      setIsDeleteSubmittingId(deal.id);
      await deleteDeal(deal.id);
      await resetDeals();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось удалить сделку."));
    } finally {
      setIsDeleteSubmittingId(null);
    }
  };

  const handleLifecycleStatusChange = async (deal: Deal, nextValue: string) => {
    const parsed = Number(nextValue);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed === deal.dealLifecycleStatusId) {
      return;
    }

    try {
      setIsLifecycleSubmittingId(deal.id);
      setError(null);

      await updateDealLifecycleStatus(deal.id, parsed);
      await resetDeals();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось изменить статус сделки."));
    } finally {
      setIsLifecycleSubmittingId(null);
    }
  };

  const detailValidation = validateDealForm({
    need: detailsNeed,
    comment: detailsComment,
    dealStatusId: detailsDeal ? String(detailsDeal.dealStatusId) : "1",
    plCostRub: detailsDeal ? String(detailsDeal.plCostRub) : "0",
    leasingCompanyId: detailsDeal ? String(detailsDeal.leasingCompanyId) : "1",
    agentFeePercent: detailsDeal ? String(detailsDeal.agentFeePercent) : "0",
    dealStageId: detailsDeal ? String(detailsDeal.dealStageId) : "1",
  });

  return (
    <div className={styles.page}>
      <PageHeader
        title={fixedCompanyTitle ? `Сделки — ${fixedCompanyTitle}` : "Сделки"}
        subtitle="Воронка, расчёты и сопровождение."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className={styles.filters}>
        <div className={styles.filtersGrow}>
          <InputField
            label="Фильтр по компании"
            value={searchCompanyName}
            onChange={(event) => setSearchCompanyName(sanitizeByMaxLength(event.target.value, 255))}
            placeholder='Например: ООО "Ромашка"'
            disabled={Boolean(fixedCompany.companyId)}
            maxLength={255}
          />
        </div>
        <div className={styles.filtersGrow}>
          <InputField
            label="Фильтр по ИНН"
            value={searchInn}
            onChange={(event) => setSearchInn(sanitizeDigits(event.target.value, 12))}
            placeholder="10 или 12 цифр"
            inputMode="numeric"
            disabled={Boolean(fixedCompany.companyId)}
            maxLength={12}
          />
        </div>
        <div className={styles.filtersGrow}>
          <SelectField
            label="Сортировка"
            value={dealSortMode}
            onChange={(event) => setDealSortMode(event.target.value)}
            options={dealSortOptions}
          />
        </div>
        <div className={styles.filtersGrow}>
          <SelectField
            label="Горячие / холодные"
            value={hotColdFilter}
            onChange={(event) => setHotColdFilter(event.target.value)}
            options={[
              { value: "", label: "Все сделки" },
              { value: "hot", label: "Горячие" },
              { value: "cold", label: "Холодные" },
            ]}
          />
        </div>
        <div className={styles.filtersGrow}>
          <SelectField
            label="Этап"
            value={dealStageFilter}
            onChange={(event) => setDealStageFilter(event.target.value)}
            options={dealStageOptions}
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
        <div className={styles.filtersActions} />
      </div>

      {lookups && selectedLifecycleStatusId && (
        <div className={styles.statusBar}>
          <nav className={styles.statusNav} aria-label="Статусы сделок">
            {lookups.dealLifecycleStatuses.map((status) => (
              <button
                key={status.id}
                type="button"
                className={`${styles.statusLink} ${status.id === selectedLifecycleStatusId ? styles.statusActive : ""}`}
                onClick={() => setSelectedLifecycleStatusId(status.id)}
                disabled={isInitialLoading || isLoadingMore}
              >
                {status.name}
              </button>
            ))}
          </nav>

          {fixedCompany.companyId && (
            <Button type="button" variant="primary" onClick={() => navigate(APP_ROUTES.deals)}>
              Все сделки
            </Button>
          )}
        </div>
      )}

      <DataTable>
        <thead>
          <Tr>
            <Th style={{ width: "16%" }}>Компания</Th>
            <Th style={{ width: "10%" }}>ИНН</Th>
            {showActiveColumns && <Th style={{ width: "10%" }}>Статус</Th>}
            <Th style={{ width: "11%" }}>Стоимость ПЛ</Th>
            <Th style={{ width: "11%" }}>Лизинговая</Th>
            <Th style={{ width: "7%" }}>АВ, %</Th>
            <Th style={{ width: "11%" }}>АВ, руб.</Th>
            {showActiveColumns && <Th style={{ width: "13%" }}>Этап сделки</Th>}
            <Th style={{ width: "13%" }}>Менеджер</Th>
            <Th style={{ width: "12%" }}>Создание</Th>
            <Th style={{ width: "12%" }}>Обновление</Th>
            {showCompletionColumn && <Th style={{ width: "12%" }}>Завершение</Th>}
            <Th style={{ width: "12%", textAlign: "left" }}>Действия</Th>
          </Tr>
        </thead>
        <tbody>
          {filteredDeals.map((deal) => {
            const canManage = canManageDeal(deal);
            const isDeleteSubmitting = isDeleteSubmittingId === deal.id;
            const isStatusSubmitting = isLifecycleSubmittingId === deal.id;

            return (
              <Tr key={deal.id}>
                <Td>{deal.companyName}</Td>
                <Td>{deal.companyInn}</Td>
                {showActiveColumns && <Td>{deal.dealStatusName}</Td>}
                <Td>{formatNumberLike(deal.plCostRub)}</Td>
                <Td>{deal.leasingCompanyName}</Td>
                <Td>{formatNumberLike(deal.agentFeePercent)}</Td>
                <Td>{formatNumberLike(deal.advanceTotalRub)}</Td>
                {showActiveColumns && <Td>{deal.dealStageName}</Td>}
                <Td>{deal.managerName}</Td>
                <Td>{formatDateTime(deal.createdAt)}</Td>
                <Td>{formatDateTime(deal.updatedAt)}</Td>
                {showCompletionColumn && (
                  <Td>{deal.completedAt ? formatDateTime(deal.completedAt) : <span className={styles.muted}>—</span>}</Td>
                )}
                <Td style={{ textAlign: "center" }}>
                  {canManage ? (
                    <div className={styles.actions}>
                      <>
                        <div className={styles.actionButtons}>
                          <IconButton
                            tone="neutral"
                            onClick={() => openDetailsModal(deal)}
                            title="Потребность и комментарий"
                          >
                            <Icon name="details" size={18} />
                          </IconButton>
                          <IconButton
                            tone="neutral"
                            onClick={() => openEditModal(deal)}
                            title="Редактировать"
                            disabled={!lookups}
                          >
                            <Icon name="edit" size={18} />
                          </IconButton>
                          <IconButton
                            onClick={() => void handleDelete(deal)}
                            disabled={isDeleteSubmitting}
                            title="Удалить"
                            tone="danger"
                          >
                            {isDeleteSubmitting ? <Spinner size={18} /> : <Icon name="trash" size={18} />}
                          </IconButton>
                        </div>
                        <select
                          className={styles.actionSelect}
                          value=""
                          onChange={(event) => void handleLifecycleStatusChange(deal, event.target.value)}
                          disabled={
                            isStatusSubmitting ||
                            !lookups ||
                            lookups.dealLifecycleStatuses.length === 0
                          }
                          title="Результат"
                        >
                          <option value="" disabled>
                            Результат
                          </option>
                          {(lookups?.dealLifecycleStatuses ?? [])
                            .filter((item) => item.id !== deal.dealLifecycleStatusId)
                            .map((item) => (
                              <option key={item.id} value={String(item.id)}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </>
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </Td>
              </Tr>
            );
          })}

          {filteredDeals.length === 0 && (
            <Tr>
              <Td colSpan={tableColSpan} style={{ textAlign: "center" }}>
                <span className={styles.muted}>Сделок нет</span>
              </Td>
            </Tr>
          )}
        </tbody>
      </DataTable>

      {hasMoreDeals && <div ref={loadMoreRef} className={styles.loadMoreTrigger} aria-hidden="true" />}

      {(isInitialLoading || isLoadingMore) && (
        <div className={styles.loadingBlock}>
          <Spinner size={26} />
        </div>
      )}

      <Modal
        open={Boolean(editingDeal)}
        title={editingDeal ? `Редактировать — ${editingDeal.companyName}` : "Редактировать сделку"}
        onClose={() => {
          if (isEditSubmitting) return;
          closeEditModal();
        }}
      >
        {editingDeal && (
          <form className={styles.modalForm} onSubmit={handleEditSubmit} noValidate>
            <TextAreaField
              label="Потребность"
              value={editForm.need}
              onChange={(event) => updateEditForm("need", sanitizeByMaxLength(event.target.value, DEAL_NEED_MAX_LENGTH))}
              required
              error={showEditErrors ? editErrors.need : undefined}
              disabled={isEditSubmitting}
              rows={3}
              maxLength={DEAL_NEED_MAX_LENGTH}
            />

            <SelectField
              label="Статус"
              value={editForm.dealStatusId}
              onChange={(event) => updateEditForm("dealStatusId", event.target.value)}
              required
              error={showEditErrors ? editErrors.dealStatusId : undefined}
              disabled={isEditSubmitting || !lookups}
              options={[
                { value: "", label: "Выберите", disabled: true },
                ...(lookups?.dealStatuses ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.name,
                })),
              ]}
            />

            <InputField
              label="Стоимость ПЛ"
              value={editForm.plCostRub}
              onChange={(event) => updateEditForm("plCostRub", sanitizeDecimal(event.target.value, { maxLength: 18, allowComma: true }))}
              required
              error={showEditErrors ? editErrors.plCostRub : undefined}
              disabled={isEditSubmitting}
              inputMode="decimal"
            />

            <SelectField
              label="Лизинговая"
              value={editForm.leasingCompanyId}
              onChange={(event) => updateEditForm("leasingCompanyId", event.target.value)}
              required
              error={showEditErrors ? editErrors.leasingCompanyId : undefined}
              disabled={isEditSubmitting || !lookups}
              options={[
                { value: "", label: "Выберите", disabled: true },
                ...(lookups?.leasingCompanies ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.name,
                })),
              ]}
            />

            <InputField
              label="АВ, %"
              value={editForm.agentFeePercent}
              onChange={(event) => updateEditForm("agentFeePercent", sanitizeDecimal(event.target.value, { maxLength: 6, allowComma: true }))}
              required
              error={showEditErrors ? editErrors.agentFeePercent : undefined}
              disabled={isEditSubmitting}
              inputMode="decimal"
            />

            <InputField
              label="АВ, руб."
              value={formatAdvanceRub(editForm.plCostRub, editForm.agentFeePercent)}
              disabled
              inputMode="numeric"
            />

            <SelectField
              label="Этап сделки"
              value={editForm.dealStageId}
              onChange={(event) => updateEditForm("dealStageId", event.target.value)}
              required
              error={showEditErrors ? editErrors.dealStageId : undefined}
              disabled={isEditSubmitting || !lookups}
              options={[
                { value: "", label: "Выберите", disabled: true },
                ...(lookups?.dealStages ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.name,
                })),
              ]}
            />

            <TextAreaField
              label="Комментарий"
              value={editForm.comment}
              onChange={(event) => updateEditForm("comment", sanitizeByMaxLength(event.target.value, DEAL_COMMENT_MAX_LENGTH))}
              error={showEditErrors ? editErrors.comment : undefined}
              disabled={isEditSubmitting}
              rows={3}
              maxLength={DEAL_COMMENT_MAX_LENGTH}
            />

            <div className={styles.modalActions}>
              <Button
                type="button"
                onClick={closeEditModal}
                disabled={isEditSubmitting}
                variant="ghost"
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isEditSubmitting}>
                {isEditSubmitting ? <Spinner size={20} /> : "Сохранить"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(detailsDeal)}
        title={detailsDeal ? `Сделка: ${detailsDeal.companyName}` : "Сделка"}
        onClose={closeDetailsModal}
      >
        {detailsDeal && (
          <div className={styles.modalForm}>
            {detailsError && <Alert tone="error">{detailsError}</Alert>}
            <TextAreaField
              label="Потребность"
              value={detailsNeed}
              onChange={(event) => setDetailsNeed(sanitizeByMaxLength(event.target.value, DEAL_NEED_MAX_LENGTH))}
              error={showDetailsErrors ? detailValidation.need : undefined}
              disabled={isDetailsSubmitting}
              rows={6}
              required
              maxLength={DEAL_NEED_MAX_LENGTH}
            />

            <TextAreaField
              label="Комментарий"
              value={detailsComment}
              onChange={(event) => setDetailsComment(sanitizeByMaxLength(event.target.value, DEAL_COMMENT_MAX_LENGTH))}
              error={showDetailsErrors ? detailValidation.comment : undefined}
              disabled={isDetailsSubmitting}
              rows={6}
              maxLength={DEAL_COMMENT_MAX_LENGTH}
            />

            <div className={styles.modalActions}>
              <Button onClick={closeDetailsModal} disabled={isDetailsSubmitting} variant="ghost">
                Отмена
              </Button>
              <Button onClick={() => void handleDetailsSave()} disabled={isDetailsSubmitting}>
                {isDetailsSubmitting ? <Spinner size={20} /> : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
