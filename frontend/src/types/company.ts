export interface Company {
  id: number;
  managerUserId: number;
  managerName: string;
  name: string;
  inn: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRequisites {
  id: number;
  name: string;
  bik: string;
  rs: string;
  ks: string;
}

export interface CompanyDetails extends Company {
  legalAddress: string | null;
  actualAddress: string | null;
  directorBirthDate: string | null;
  activity: string | null;
  revenueRub: number | null;
  negativeInfo: string | null;
  bik: string | null;
  rs: string | null;
  ks: string | null;

  taxSystemId: number | null;
  taxSystemName: string | null;

  preferredCommunicationChannelId: number | null;
  preferredCommunicationChannelName: string | null;
}

export interface CompanyFormValues {
  name: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  comment: string;
  nextContactAt: string;
  legalAddress: string;
  actualAddress: string;
  directorBirthDate: string;
  activity: string;
  revenueRub: string;
  negativeInfo: string;
  bik: string;
  rs: string;
  ks: string;
  taxSystemId: string;
  preferredCommunicationChannelId: string;
}
