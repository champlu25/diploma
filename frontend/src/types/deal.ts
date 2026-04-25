export interface Deal {
  id: number;
  companyId: number;
  companyOwnerUserId: number;
  managerEmail: string;
  companyName: string;
  companyInn: string;
  need: string;
  dealStatusId: number;
  dealStatusName: string;
  plCostRub: number;
  leasingCompanyId: number;
  leasingCompanyName: string;
  advancePercent: number;
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
  leasingCompanies: DealLookupItem[];
  dealStages: DealLookupItem[];
}

export interface DealFormValues {
  need: string;
  dealStatusId: string;
  plCostRub: string;
  leasingCompanyId: string;
  advancePercent: string;
  advanceTotalRub: string;
  dealStageId: string;
  comment: string;
}

