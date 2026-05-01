import { httpClient } from "./httpClient";

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
  const { data } = await httpClient.get<GetChartViewSettingsResponse>("/api/dashboards/chart-view-settings");
  return data;
};

export const saveChartViewSetting = async (
  chartKey: string,
  chartTypeId: number,
): Promise<SaveChartViewSettingResponse> => {
  const { data } = await httpClient.put<SaveChartViewSettingResponse>(
    `/api/dashboards/chart-view-settings/${encodeURIComponent(chartKey)}`,
    { chartTypeId },
  );
  return data;
};
