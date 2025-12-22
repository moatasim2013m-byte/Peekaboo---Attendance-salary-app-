
export interface AttendanceRecord {
  [key: string]: string;
}

export interface ColumnMapping {
  name: string;
  date: string;
  checkIn: string;
  checkOut: string;
  paid: string; 
}

export interface CleansingLog {
  type: 'MIDNIGHT_ADJUST' | 'HEADER_FIX' | 'TIME_INTERPOLATION' | 'NAME_NORMALIZATION';
  message: string;
}

export interface DayShift {
  id: string;
  date: string;
  name: string;
  actualIn: Date;
  actualOut: Date;
  shiftType: 'A' | 'B' | 'C';
  shiftStart: Date;
  latenessMinutes: number;
  earlyMinutes: number; 
  workHours: number;
  otHours: number;
  otPay: number;
  standardPay: number; // Always 10 JD
  attendancePenalty: number; // 3, 5, or 10 JD
  manualAdjustment: number; // For "Other" penalties
  penaltyWaiver: number; // New: To remove/waive penalties
  adjustmentNote?: string; // New: Reason for the change
  netPay: number; // (10 - attendancePenalty + otPay) - manualAdjustment + penaltyWaiver
  amountPaid: number; // From Column L
  balanceRemaining: number; // netPay - amountPaid
}

export interface EmployeeSummary {
  name: string;
  workDays: number;
  shiftCounts: { A: number; B: number; C: number };
  totalStandardPay: number;
  totalOTPay: number;
  totalAttendancePenalties: number;
  totalManualAdjustments: number;
  totalPenaltyWaivers: number;
  netSalary: number;
  amountPaid: number;
  netRemaining: number;
  rank?: number;
}

export interface MonthlyStat {
  month: string;
  daysWorked: number;
  standardPay: number;
  otPay: number;
  penalties: number;
  netPay: number;
}

export interface StrategicInsights {
  mostReliable: { name: string; days: number };
  topLateOffender: { name: string; amount: number };
  penaltyRate: number;
  totalOTHours: number;
  totalEarlyEvents: number;
  totalLateEvents: number;
}

export interface PayrollResult {
  summaries: EmployeeSummary[];
  totalStandardOwed: number;
  totalOTPayout: number; 
  totalPenalties: number; 
  totalManualAdjustments: number;
  totalPenaltyWaivers: number;
  totalNetOwed: number;
  totalPaidDisbursed: number;
  totalRemainingBalance: number;
  totalDaysWorked: number;
  totalLatenessMins: number; // New: aggregate lateness
  efficiencyScore: number;
  monthlyStats: MonthlyStat[];
  insights: StrategicInsights;
  detailedLogs: DayShift[];
  cleansingLogs: CleansingLog[];
}
