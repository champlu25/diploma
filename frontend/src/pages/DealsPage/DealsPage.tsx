import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDeal,
  getDealLookups,
  getDeals,
  getDealsByCompanyId,
  updateDeal,
  updateDealLifecycleStatus,
} from "../../api/dealsApi";
import { getGroupLeadManagers, getUsers } from "../../api/usersApi";
import type { Deal, DealFormValues, DealLookups } from "../../types/deal";
import type { CurrentUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Icon } from "../../components/ui/Icon/Icon";
import { InputField, SelectField, TextAreaField } from "../../components/ui/Field/Field";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { APP_ROUTES } from "../../constants/routes";
import styles from "./DealsPage.module.scss";

interface DealsPageProps {
  currentUser: CurrentUser;
}

type DealValidationErrors = Partial<Record<keyof DealFormValues, string>>;

const emptyForm: DealFormValues = {
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

const hasValidationErrors = (errors: DealValidationErrors): boolean =>
  Object.values(errors).some(Boolean);

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
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed.toLocaleString("ru-RU");
    }
    return value;
  }

  return "—";
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLifecycleStatusId, setSelectedLifecycleStatusId] = useState<number | null>(null);
  const [isLifecycleSubmittingId, setIsLifecycleSubmittingId] = useState<number | null>(null);

  const [searchCompanyName, setSearchCompanyName] = useState("");
  const [searchInn, setSearchInn] = useState("");
  const [managerFilterUserId, setManagerFilterUserId] = useState("");
  const [managerFilterOptions, setManagerFilterOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "Все менеджеры" }]);

  const [editingDealId, setEditingDealId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<DealFormValues>(emptyForm);
  const [editErrors, setEditErrors] = useState<DealValidationErrors>({});
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const [isDeleteSubmittingId, setIsDeleteSubmittingId] = useState<number | null>(null);

  const [detailsDealId, setDetailsDealId] = useState<number | null>(null);
  const [detailsNeed, setDetailsNeed] = useState("");
  const [detailsComment, setDetailsComment] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isDetailsSubmitting, setIsDetailsSubmitting] = useState(false);

  const editingDeal = useMemo(
    () => deals.find((deal) => deal.id === editingDealId) ?? null,
    [deals, editingDealId],
  );

  const detailsDeal = useMemo(
    () => deals.find((deal) => deal.id === detailsDealId) ?? null,
    [deals, detailsDealId],
  );

  const canManageDeal = useCallback(
    (deal: Deal): boolean =>
      currentUser.role === "owner" ||
      currentUser.role === "group_lead" ||
      deal.companyManagerUserId === currentUser.id,
    [currentUser],
  );

  const showManagerFilter = currentUser.role === "owner" || currentUser.role === "group_lead";

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
          label: "\u041c\u043e\u0438 \u0441\u0434\u0435\u043b\u043a\u0438",
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
              label: "\u041c\u043e\u0438 \u0441\u0434\u0435\u043b\u043a\u0438",
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

  const filteredDeals = useMemo(() => {
    const queryName = searchCompanyName.trim().toLowerCase();
    const queryInn = searchInn.trim();
    const hasFixedCompanyId = fixedCompany.companyId !== null;

    return deals.filter((deal) => {
      if (hasFixedCompanyId && String(deal.companyId) !== fixedCompany.companyId) {
        return false;
      }
      if (selectedLifecycleStatusId && deal.dealLifecycleStatusId !== selectedLifecycleStatusId) {
        return false;
      }
      if (managerFilterUserId && String(deal.companyManagerUserId) !== managerFilterUserId) {
        return false;
      }
      if (!hasFixedCompanyId) {
        if (queryName && !deal.companyName.toLowerCase().includes(queryName)) {
          return false;
        }
        if (queryInn && !deal.companyInn.includes(queryInn)) {
          return false;
        }
      }
      return true;
    });
  }, [
    deals,
    fixedCompany.companyId,
    managerFilterUserId,
    searchCompanyName,
    searchInn,
    selectedLifecycleStatusId,
  ]);

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

  const loadDeals = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [nextDeals, nextLookups] = await Promise.all([
        fixedCompany.companyId ? getDealsByCompanyId(Number(fixedCompany.companyId)) : getDeals(),
        getDealLookups(),
      ]);
      setDeals(nextDeals);
      setLookups(nextLookups);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить сделки."));
    } finally {
      setIsLoading(false);
    }
  }, [fixedCompany.companyId]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

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
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDeal) return;

    const validationErrors = validateDealForm(editForm);
    setEditErrors(validationErrors);
    if (hasValidationErrors(validationErrors)) {
      setError("Проверьте поля формы.");
      return;
    }

    try {
      setIsEditSubmitting(true);
      setError(null);

      const result = await updateDeal(editingDeal.id, editForm);
      setDeals((prev) => prev.map((item) => (item.id === editingDeal.id ? result.deal : item)));
      closeEditModal();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось обновить сделку."));
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const openDetailsModal = (deal: Deal) => {
    setDetailsError(null);
    setDetailsDealId(deal.id);
    setDetailsNeed(deal.need);
    setDetailsComment(deal.comment ?? "");
  };

  const closeDetailsModal = () => {
    if (isDetailsSubmitting) return;
    setDetailsDealId(null);
    setDetailsNeed("");
    setDetailsComment("");
    setDetailsError(null);
  };

  const handleDetailsSave = async () => {
    if (!detailsDeal) return;

    if (!detailsNeed.trim()) {
      setDetailsError("Потребность обязательна.");
      return;
    }

    try {
      setIsDetailsSubmitting(true);
      setDetailsError(null);

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

      const result = await updateDeal(detailsDeal.id, payload);
      setDeals((prev) => prev.map((item) => (item.id === detailsDeal.id ? result.deal : item)));
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
      setDeals((prev) => prev.filter((item) => item.id !== deal.id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось удалить сделку."));
    } finally {
      setIsDeleteSubmittingId(null);
    }
  };

  const handleLifecycleStatusChange = async (deal: Deal, nextValue: string) => {
    const parsed = Number(nextValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return;
    }

    if (parsed === deal.dealLifecycleStatusId) {
      return;
    }

    try {
      setIsLifecycleSubmittingId(deal.id);
      setError(null);

      const result = await updateDealLifecycleStatus(deal.id, parsed);
      setDeals((prev) => prev.map((item) => (item.id === deal.id ? result.deal : item)));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось изменить статус сделки."));
    } finally {
      setIsLifecycleSubmittingId(null);
    }
  };

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
            onChange={(event) => setSearchCompanyName(event.target.value)}
            placeholder="Например: ООО Ромашка"
            disabled={Boolean(fixedCompany.companyId)}
          />
        </div>
        <div className={styles.filtersGrow}>
          <InputField
            label="Фильтр по ИНН"
            value={searchInn}
            onChange={(event) => setSearchInn(event.target.value)}
            placeholder="10 или 12 цифр"
            inputMode="numeric"
            disabled={Boolean(fixedCompany.companyId)}
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
                disabled={isLoading}
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
                  <Td>
                    {deal.completedAt ? (
                      formatDateTime(deal.completedAt)
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </Td>
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
                            {isDeleteSubmitting ? (
                              <Spinner size={18} />
                            ) : (
                              <Icon name="trash" size={18} />
                            )}
                          </IconButton>
                        </div>
                        <select
                          className={styles.actionSelect}
                          value=""
                          onChange={(event) =>
                            void handleLifecycleStatusChange(deal, event.target.value)
                          }
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

      {isLoading && (
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
              onChange={(event) => setEditForm((prev) => ({ ...prev, need: event.target.value }))}
              required
              error={editErrors.need}
              disabled={isEditSubmitting}
              rows={3}
            />

            <SelectField
              label="Статус"
              value={editForm.dealStatusId}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, dealStatusId: event.target.value }))
              }
              required
              error={editErrors.dealStatusId}
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
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, plCostRub: event.target.value }))
              }
              required
              error={editErrors.plCostRub}
              disabled={isEditSubmitting}
              inputMode="numeric"
            />

            <SelectField
              label="Лизинговая"
              value={editForm.leasingCompanyId}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, leasingCompanyId: event.target.value }))
              }
              required
              error={editErrors.leasingCompanyId}
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
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, agentFeePercent: event.target.value }))
              }
              required
              error={editErrors.agentFeePercent}
              disabled={isEditSubmitting}
              inputMode="decimal"
            />

            <InputField
              label="АВ, руб."
              value={String(
                Math.round(
                  (Number(editForm.plCostRub) || 0) *
                    ((Number(editForm.agentFeePercent) || 0) / 100),
                ),
              )}
              disabled
              inputMode="numeric"
            />

            <SelectField
              label="Этап сделки"
              value={editForm.dealStageId}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, dealStageId: event.target.value }))
              }
              required
              error={editErrors.dealStageId}
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
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, comment: event.target.value }))
              }
              disabled={isEditSubmitting}
              rows={3}
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
              onChange={(event) => setDetailsNeed(event.target.value)}
              disabled={isDetailsSubmitting}
              rows={6}
              required
            />

            <TextAreaField
              label="Комментарий"
              value={detailsComment}
              onChange={(event) => setDetailsComment(event.target.value)}
              disabled={isDetailsSubmitting}
              rows={6}
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
