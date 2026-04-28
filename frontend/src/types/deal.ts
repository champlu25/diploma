export interface Deal {
  id: number;
  companyId: number;
  companyManagerUserId: number;
  managerName: string;
  companyName: string;
  companyInn: string;
  need: string;
  dealStatusId: number;
  dealStatusName: string;
  dealLifecycleStatusId: number;
  dealLifecycleStatusName: string;
  completedAt: string | null;
  plCostRub: number;
  leasingCompanyId: number;
  leasingCompanyName: string;
  agentFeePercent: number;
  advanceTotalRub: number;
  dealStageId: number;
  dealStageName: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealLookupItem {
  id: number;
  name: string;
}

export interface DealLookups {
  dealStatuses: DealLookupItem[];
  dealLifecycleStatuses: DealLookupItem[];
  leasingCompanies: DealLookupItem[];
  dealStages: DealLookupItem[];
}

export interface DealFormValues {
  need: string;
  dealStatusId: string;
  plCostRub: string;
  leasingCompanyId: string;
  agentFeePercent: string;
  dealStageId: string;
  comment: string;
}

