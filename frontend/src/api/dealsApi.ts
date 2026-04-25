import { httpClient } from "./httpClient";
import type { Deal, DealFormValues, DealLookups } from "../types/deal";

interface DealDto {
  id: number;
  company_id: number;
  company_owner_user_id: number;
  manager_email: string;
  company_name: string;
  company_inn: string;
  need: string;
  deal_status_id: number;
  deal_status_name: string;
  pl_cost_rub: number;
  leasing_company_id: number;
  leasing_company_name: string;
  advance_percent: number;
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

interface LookupsResponse extends DealLookups {}

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
  companyOwnerUserId: dto.company_owner_user_id,
  managerEmail: dto.manager_email,
  companyName: dto.company_name,
  companyInn: dto.company_inn,
  need: dto.need,
  dealStatusId: dto.deal_status_id,
  dealStatusName: dto.deal_status_name,
  plCostRub: dto.pl_cost_rub,
  leasingCompanyId: dto.leasing_company_id,
  leasingCompanyName: dto.leasing_company_name,
  advancePercent: dto.advance_percent,
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
  advancePercent: values.advancePercent,
  advanceTotalRub: values.advanceTotalRub,
  dealStageId: values.dealStageId,
  comment: values.comment,
});

export const getDeals = async (): Promise<Deal[]> => {
  const { data } = await httpClient.get<ListDealsResponse>("/api/deals");
  return data.deals.map(toDeal);
};

export const getDealLookups = async (): Promise<DealLookups> => {
  const { data } = await httpClient.get<LookupsResponse>("/api/deals/lookups");
  return data;
};

export const createDeal = async (companyId: number, values: DealFormValues): Promise<DealResponse> => {
  const { data } = await httpClient.post<DealDtoResponse>(
    `/api/companies/${companyId}/deals`,
    toPayload(values),
  );

  return {
    ...data,
    deal: toDeal(data.deal),
  };
};

export const updateDeal = async (dealId: number, values: DealFormValues): Promise<DealResponse> => {
  const { data } = await httpClient.patch<DealDtoResponse>(`/api/deals/${dealId}`, toPayload(values));
  return {
    ...data,
    deal: toDeal(data.deal),
  };
};

export const deleteDeal = async (dealId: number): Promise<DeleteDealResponse> => {
  const { data } = await httpClient.delete<DeleteDealResponse>(`/api/deals/${dealId}`);
  return data;
};

