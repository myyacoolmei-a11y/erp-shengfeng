import type { SalesPerformance } from './salesPerformance';
import type { TechnicianPerformance } from './technicianPerformance';

export interface EmployeePerformance {
  employeeId: number;
  employeeName: string;
  position: string;
  month: string;
  period?: string;
  sales: SalesPerformance;
  technician: TechnicianPerformance;
}
