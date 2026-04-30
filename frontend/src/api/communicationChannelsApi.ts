import { httpClient } from "./httpClient";

export interface CommunicationChannel {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GetCommunicationChannelsResponse {
  communicationChannels: CommunicationChannel[];
}

interface CreateCommunicationChannelResponse {
  communicationChannel: CommunicationChannel;
}

interface UpdateCommunicationChannelResponse {
  communicationChannel: CommunicationChannel;
}

export const getOwnerCommunicationChannels = async (): Promise<CommunicationChannel[]> => {
  const { data } = await httpClient.get<GetCommunicationChannelsResponse>("/api/owner/communication-channels");
  return data.communicationChannels;
};

export const createOwnerCommunicationChannel = async (name: string): Promise<CommunicationChannel> => {
  const { data } = await httpClient.post<CreateCommunicationChannelResponse>("/api/owner/communication-channels", { name });
  return data.communicationChannel;
};

export const updateOwnerCommunicationChannel = async (id: number, name: string): Promise<CommunicationChannel> => {
  const { data } = await httpClient.patch<UpdateCommunicationChannelResponse>(`/api/owner/communication-channels/${id}`, {
    name,
  });
  return data.communicationChannel;
};

export const setOwnerCommunicationChannelActive = async (id: number, isActive: boolean): Promise<CommunicationChannel> => {
  const { data } = await httpClient.patch<UpdateCommunicationChannelResponse>(`/api/owner/communication-channels/${id}`, {
    isActive,
  });
  return data.communicationChannel;
};

export const deleteOwnerCommunicationChannel = async (id: number): Promise<void> => {
  await httpClient.delete(`/api/owner/communication-channels/${id}`);
};

