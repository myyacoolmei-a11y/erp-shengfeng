export type StatsPeriodPreset = 'month' | 'quarter' | 'year' | 'custom';

export interface GetEmployeePerformanceParams {
  period?: StatsPeriodPreset;
  month?: string;
  quarter?: string;
  year?: string;
  from?: string;
  to?: string;
}
