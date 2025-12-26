
export interface AttendanceRecord {
  [key: string]: string;
}

export interface ColumnMapping {
  name: string;
  date: string;
  checkIn: string;
  checkOut: string;
  paid: string; 
  penalty?: string; // Added to map Column K (Manual Penalties)
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
  durationHours: number; 
  otHours: number;
  otPay: number;
  standardPay: number; 
  attendancePenalty: number; 
  manualPenalty: number; // For manual deduction from Column K
  manualAdjustment: number; 
  penaltyWaiver: number; 
  adjustmentNote?: string; 
  netPay: number; 
  amountPaid: number; 
  balanceRemaining: number; 
}

export interface EmployeeSummary {
  name: string;
  workDays: number;
  shiftCounts: { A: number; B: number; C: number };
  totalStandardPay: number;
  totalOTPay: number;
  totalAttendancePenalties: number;
  totalManualPenalties: number;
  totalManualAdjustments: number;
  totalPenaltyWaivers: number;
  netSalary: number;
  amountPaid: number;
  netRemaining: number;
  rank?: number;
  penaltyFreeDays: number;
}

export interface MonthlyStat {
  month: string;
  daysWorked: number;
  standardPay: number;
  otPay: number;
  penalties: number;
  netPay: number;
  totalPaid: number;
}

export interface StrategicInsights {
  mostReliable: { name: string; penaltyFreeDays: number };
  topLateOffender: { name: string; totalAttendancePenalties: number };
  penaltyRecoveryRate: number; 
  totalOTHours: number;
  shiftAUsage: number;
  shiftBUsage: number;
  shiftCUsage: number;
  perfectAttendanceStaff: string[];
  totalFutureLiability: number; 
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
  totalLatenessMins: number; 
  efficiencyScore: number;
  monthlyStats: MonthlyStat[];
  insights: StrategicInsights;
  detailedLogs: DayShift[];
  cleansingLogs: CleansingLog[];
  dateRange: { start: string; end: string };
}
