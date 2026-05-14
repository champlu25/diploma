import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";
import type { Deal, DealFormValues, DealLookups } from "../types/deal";

export interface GetDealsParams {
  companyId?: number;
  searchCompanyName?: string;
  searchInn?: string;
  managerUserId?: string;
  lifecycleStatusId?: number | null;
  dealStageId?: string;
  hotCold?: string;
  sort?: string;
}

interface DealDto {
  id: number;
  company_id: number;
  company_manager_user_id: number;
  manager_name: string;
  company_name: string;
  company_inn: string;
  need: string;
  deal_status_id: number;
  deal_status_name: string;
  deal_lifecycle_status_id: number;
  deal_lifecycle_status_name: string;
  completed_at: string | null;
  pl_cost_rub: number;
  leasing_company_id: number;
  leasing_company_name: string;
  agent_fee_percent: number;
  advance_total_rub: number;
  deal_stage_id: number;
  deal_stage_name: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

interface ListDealsResponse {
  deals: DealDto[];
}

type LookupsResponse = DealLookups;

interface DealDtoResponse {
  message: string;
  deal: DealDto;
}

interface DeleteDealResponse {
  message: string;
}

interface DealResponse {
  message: string;
  deal: Deal;
}

const toDeal = (dto: DealDto): Deal => ({
  id: dto.id,
  companyId: dto.company_id,
  companyManagerUserId: dto.company_manager_user_id,
  managerName: dto.manager_name,
  companyName: dto.company_name,
  companyInn: dto.company_inn,
  need: dto.need,
  dealStatusId: dto.deal_status_id,
  dealStatusName: dto.deal_status_name,
  dealLifecycleStatusId: dto.deal_lifecycle_status_id,
  dealLifecycleStatusName: dto.deal_lifecycle_status_name,
  completedAt: dto.completed_at,
  plCostRub: dto.pl_cost_rub,
  leasingCompanyId: dto.leasing_company_id,
  leasingCompanyName: dto.leasing_company_name,
  agentFeePercent: dto.agent_fee_percent,
  advanceTotalRub: dto.advance_total_rub,
  dealStageId: dto.deal_stage_id,
  dealStageName: dto.deal_stage_name,
  comment: dto.comment,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

const toPayload = (values: DealFormValues) => ({
  need: values.need,
  dealStatusId: values.dealStatusId,
  plCostRub: values.plCostRub,
  leasingCompanyId: values.leasingCompanyId,
  agentFeePercent: values.agentFeePercent,
  dealStageId: values.dealStageId,
  comment: values.comment,
});

export const getDeals = async (params?: GetDealsParams): Promise<Deal[]> => {
  const { data } = await httpClient.get<ListDealsResponse>(API_ROUTES.deals, {
    params,
  });
  return data.deals.map(toDeal);
};

export const getDealsByCompanyId = async (companyId: number): Promise<Deal[]> => {
  return getDeals({ companyId });
};

export const getDealLookups = async (): Promise<DealLookups> => {
  const { data } = await httpClient.get<LookupsResponse>(API_ROUTES.dealLookups);
  return data;
};

export const createDeal = async (
  companyId: number,
  values: DealFormValues,
): Promise<DealResponse> => {
  const { data } = await httpClient.post<DealDtoResponse>(
    API_ROUTES.companyDeals(companyId),
    toPayload(values),
  );

  return {
    ...data,
    deal: toDeal(data.deal),
  };
};

export const updateDeal = async (dealId: number, values: DealFormValues): Promise<DealResponse> => {
  const { data } = await httpClient.patch<DealDtoResponse>(
    API_ROUTES.dealById(dealId),
    toPayload(values),
  );
  return {
    ...data,
    deal: toDeal(data.deal),
  };
};

export const deleteDeal = async (dealId: number): Promise<DeleteDealResponse> => {
  const { data } = await httpClient.delete<DeleteDealResponse>(API_ROUTES.dealById(dealId));
  return data;
};

export const updateDealLifecycleStatus = async (
  dealId: number,
  dealLifecycleStatusId: number,
): Promise<DealResponse> => {
  const { data } = await httpClient.patch<DealDtoResponse>(API_ROUTES.dealLifecycleStatus(dealId), {
    dealLifecycleStatusId,
  });

  return {
    ...data,
    deal: toDeal(data.deal),
  };
};
