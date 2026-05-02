import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";

export interface ChartTypeDto {
  id: number;
  name: string;
}

export interface ChartViewSettingDto {
  chartKey: string;
  chartTypeId: number;
}

interface GetChartViewSettingsResponse {
  chartTypes: ChartTypeDto[];
  settings: ChartViewSettingDto[];
}

interface SaveChartViewSettingResponse {
  message: string;
  setting: ChartViewSettingDto;
}

export const getChartViewSettings = async (): Promise<GetChartViewSettingsResponse> => {
  const { data } = await httpClient.get<GetChartViewSettingsResponse>(
    API_ROUTES.dashboardsChartViewSettings,
  );
  return data;
};

export const saveChartViewSetting = async (
  chartKey: string,
  chartTypeId: number,
): Promise<SaveChartViewSettingResponse> => {
  const { data } = await httpClient.put<SaveChartViewSettingResponse>(
    API_ROUTES.dashboardsChartViewSettingByKey(chartKey),
    { chartTypeId },
  );
  return data;
};
