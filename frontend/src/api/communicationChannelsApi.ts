import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";

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
  const { data } = await httpClient.get<GetCommunicationChannelsResponse>(
    API_ROUTES.ownerCommunicationChannels,
  );
  return data.communicationChannels;
};

export const createOwnerCommunicationChannel = async (
  name: string,
): Promise<CommunicationChannel> => {
  const { data } = await httpClient.post<CreateCommunicationChannelResponse>(
    API_ROUTES.ownerCommunicationChannels,
    { name },
  );
  return data.communicationChannel;
};

export const updateOwnerCommunicationChannel = async (
  id: number,
  name: string,
): Promise<CommunicationChannel> => {
  const { data } = await httpClient.patch<UpdateCommunicationChannelResponse>(
    API_ROUTES.ownerCommunicationChannelById(id),
    {
      name,
    },
  );
  return data.communicationChannel;
};

export const setOwnerCommunicationChannelActive = async (
  id: number,
  isActive: boolean,
): Promise<CommunicationChannel> => {
  const { data } = await httpClient.patch<UpdateCommunicationChannelResponse>(
    API_ROUTES.ownerCommunicationChannelById(id),
    {
      isActive,
    },
  );
  return data.communicationChannel;
};

export const deleteOwnerCommunicationChannel = async (id: number): Promise<void> => {
  await httpClient.delete(API_ROUTES.ownerCommunicationChannelById(id));
};
