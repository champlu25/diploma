import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDeal,
  getDealLookups,
  getDeals,
  updateDeal,
  updateDealLifecycleStatus,
} from "../../api/dealsApi";
import type { Deal, DealFormValues, DealLookups } from "../../types/deal";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { DataTable, Td, Th, Tr } from "../../components/DataTable/DataTable";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Icon } from "../../components/ui/Icon/Icon";
import { InputField, TextAreaField } from "../../components/ui/Field/Field";
import { Modal } from "../../components/ui/Modal/Modal";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./DealsPage.module.scss";

interface DealsPageProps {
  currentUser: AuthUser;
}

type DealValidationErrors = Partial<Record<keyof DealFormValues, string>>;

const emptyForm: DealFormValues = {
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
  const [deals, setDeals] = useState<Deal[]>([]);
  const [lookups, setLookups] = useState<DealLookups | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLifecycleStatusId, setSelectedLifecycleStatusId] = useState<number | null>(null);
  const [isLifecycleSubmittingId, setIsLifecycleSubmittingId] = useState<number | null>(null);

  const [searchCompanyName, setSearchCompanyName] = useState("");
  const [searchInn, setSearchInn] = useState("");

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

  const filteredDeals = useMemo(() => {
    const queryName = searchCompanyName.trim().toLowerCase();
    const queryInn = searchInn.trim();

    return deals.filter((deal) => {
      if (selectedLifecycleStatusId && deal.dealLifecycleStatusId !== selectedLifecycleStatusId) {
        return false;
      }
      if (queryName && !deal.companyName.toLowerCase().includes(queryName)) {
        return false;
      }
      if (queryInn && !deal.companyInn.includes(queryInn)) {
        return false;
      }
      return true;
    });
  }, [deals, searchCompanyName, searchInn, selectedLifecycleStatusId]);

  const selectedLifecycleStatusName = useMemo(() => {
    if (!lookups || !selectedLifecycleStatusId) return null;
    return lookups.dealLifecycleStatuses.find((item) => item.id === selectedLifecycleStatusId)?.name ?? null;
  }, [lookups, selectedLifecycleStatusId]);

  const showCompletionColumn = selectedLifecycleStatusName !== null && selectedLifecycleStatusName !== "Активные";
  const tableColSpan = showCompletionColumn ? 12 : 11;

  const loadDeals = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [nextDeals, nextLookups] = await Promise.all([getDeals(), getDealLookups()]);
      setDeals(nextDeals);
      setLookups(nextLookups);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось загрузить сделки."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    if (!lookups) return;

    if (selectedLifecycleStatusId) {
      const exists = lookups.dealLifecycleStatuses.some((item) => item.id === selectedLifecycleStatusId);
      if (exists) {
        return;
      }
    }

    const active = lookups.dealLifecycleStatuses.find((item) => item.name === "Активные");
    setSelectedLifecycleStatusId(active?.id ?? lookups.dealLifecycleStatuses[0]?.id ?? null);
  }, [lookups, selectedLifecycleStatusId]);

  const openInlineEdit = (deal: Deal) => {
    setError(null);
    setEditErrors({});
    setEditingDealId(deal.id);
    setEditForm({
      need: deal.need,
      dealStatusId: String(deal.dealStatusId),
      plCostRub: String(deal.plCostRub),
      leasingCompanyId: String(deal.leasingCompanyId),
      advancePercent: String(deal.advancePercent),
      advanceTotalRub: String(deal.advanceTotalRub),
      dealStageId: String(deal.dealStageId),
      comment: deal.comment ?? "",
    });
  };

  const cancelInlineEdit = () => {
    setEditingDealId(null);
    setEditForm(emptyForm);
    setEditErrors({});
  };

  const handleInlineSave = async () => {
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
      setEditingDealId(null);
      setEditForm(emptyForm);
      setEditErrors({});
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
        advancePercent: String(detailsDeal.advancePercent),
        advanceTotalRub: String(detailsDeal.advanceTotalRub),
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
      <PageHeader title="Сделки" subtitle="Воронка, расчёты и сопровождение." />

      {error && <Alert tone="error">{error}</Alert>}

      <div className={styles.filters}>
        <div className={styles.filtersGrow}>
          <InputField
            label="Фильтр по компании"
            value={searchCompanyName}
            onChange={(event) => setSearchCompanyName(event.target.value)}
            placeholder="Например: ООО Ромашка"
          />
        </div>
        <div className={styles.filtersGrow}>
          <InputField
            label="Фильтр по ИНН"
            value={searchInn}
            onChange={(event) => setSearchInn(event.target.value)}
            placeholder="10 или 12 цифр"
            inputMode="numeric"
          />
        </div>
        <div className={styles.filtersActions} />
      </div>

      {lookups && selectedLifecycleStatusId && (
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
      )}

      <DataTable>
        <thead>
          <Tr>
	            <Th style={{ width: "16%" }}>Компания</Th>
	            <Th style={{ width: "9%" }}>ИНН</Th>
	            <Th style={{ width: "10%" }}>Статус</Th>
            <Th style={{ width: "11%" }}>Стоимость ПЛ</Th>
            <Th style={{ width: "11%" }}>Лизинговая</Th>
            <Th style={{ width: "7%" }}>АВ, %</Th>
            <Th style={{ width: "11%" }}>Общий АВ</Th>
            <Th style={{ width: "14%" }}>Этап сделки</Th>
            <Th style={{ width: "13%" }}>Менеджер</Th>
            <Th style={{ width: "12%" }}>Создание</Th>
            {showCompletionColumn && <Th style={{ width: "12%" }}>Завершение</Th>}
	            <Th style={{ width: "12%", textAlign: "left" }}>Действия</Th>
          </Tr>
        </thead>
        <tbody>
          {filteredDeals.map((deal) => {
            const canManage = canManageDeal(deal);
            const isDeleteSubmitting = isDeleteSubmittingId === deal.id;
            const isEditing = deal.id === editingDealId;
            const isStatusSubmitting = isLifecycleSubmittingId === deal.id;

            return (
              <Tr key={deal.id}>
                  <Td>{deal.companyName}</Td>
                  <Td>{deal.companyInn}</Td>
                  <Td>
                    {isEditing ? (
                      <select
                        className={`${styles.cellSelect} ${editErrors.dealStatusId ? styles.cellError : ""}`}
                        value={editForm.dealStatusId}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, dealStatusId: event.target.value }))}
                        disabled={isEditSubmitting || !lookups}
                        aria-invalid={Boolean(editErrors.dealStatusId) || undefined}
                        title={editErrors.dealStatusId}
                      >
                        <option value="" disabled>
                          Выберите
                        </option>
                        {(lookups?.dealStatuses ?? []).map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      deal.dealStatusName
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.plCostRub ? styles.cellError : ""}`}
                        value={editForm.plCostRub}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, plCostRub: event.target.value }))}
                        disabled={isEditSubmitting}
                        inputMode="numeric"
                        aria-invalid={Boolean(editErrors.plCostRub) || undefined}
                        title={editErrors.plCostRub}
                      />
                    ) : (
                      formatNumberLike(deal.plCostRub)
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <select
                        className={`${styles.cellSelect} ${editErrors.leasingCompanyId ? styles.cellError : ""}`}
                        value={editForm.leasingCompanyId}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, leasingCompanyId: event.target.value }))}
                        disabled={isEditSubmitting || !lookups}
                        aria-invalid={Boolean(editErrors.leasingCompanyId) || undefined}
                        title={editErrors.leasingCompanyId}
                      >
                        <option value="" disabled>
                          Выберите
                        </option>
                        {(lookups?.leasingCompanies ?? []).map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      deal.leasingCompanyName
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.advancePercent ? styles.cellError : ""}`}
                        value={editForm.advancePercent}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, advancePercent: event.target.value }))}
                        disabled={isEditSubmitting}
                        inputMode="decimal"
                        aria-invalid={Boolean(editErrors.advancePercent) || undefined}
                        title={editErrors.advancePercent}
                      />
                    ) : (
                      formatNumberLike(deal.advancePercent)
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <input
                        className={`${styles.cellInput} ${editErrors.advanceTotalRub ? styles.cellError : ""}`}
                        value={editForm.advanceTotalRub}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, advanceTotalRub: event.target.value }))}
                        disabled={isEditSubmitting}
                        inputMode="numeric"
                        aria-invalid={Boolean(editErrors.advanceTotalRub) || undefined}
                        title={editErrors.advanceTotalRub}
                      />
                    ) : (
                      formatNumberLike(deal.advanceTotalRub)
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <select
                        className={`${styles.cellSelect} ${editErrors.dealStageId ? styles.cellError : ""}`}
                        value={editForm.dealStageId}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, dealStageId: event.target.value }))}
                        disabled={isEditSubmitting || !lookups}
                        aria-invalid={Boolean(editErrors.dealStageId) || undefined}
                        title={editErrors.dealStageId}
                      >
                        <option value="" disabled>
                          Выберите
                        </option>
                        {(lookups?.dealStages ?? []).map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      deal.dealStageName
                    )}
                  </Td>
	                  <Td>{deal.managerName}</Td>
                  <Td>{formatDateTime(deal.createdAt)}</Td>
                  {showCompletionColumn && (
                    <Td>{deal.completedAt ? formatDateTime(deal.completedAt) : <span className={styles.muted}>—</span>}</Td>
                  )}
                  <Td style={{ textAlign: "center" }}>
                    {canManage ? (
                      <div className={styles.actions}>
                        {isEditing ? (
                          <div className={styles.actionButtons}>
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
                          </div>
	                        ) : (
	                          <>
	                            <div className={styles.actionButtons}>
	                              <IconButton
	                                tone="neutral"
                                onClick={() => openDetailsModal(deal)}
                                title="Потребность и комментарий"
                                disabled={Boolean(editingDealId)}
                              >
                                <Icon name="search" size={18} />
                              </IconButton>
                              <IconButton
                                tone="neutral"
                                onClick={() => openInlineEdit(deal)}
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
                                Boolean(editingDealId) ||
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
                        )}
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
