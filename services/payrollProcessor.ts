
import { differenceInMinutes, addDays, format, isValid, getDay, isAfter, startOfToday, parse, isBefore } from 'date-fns';
import { AttendanceRecord, DayShift, EmployeeSummary, PayrollResult, MonthlyStat, ColumnMapping, CleansingLog } from '../types';

const BREAK_HOURS = 1;

const setTimeOnDate = (date: Date, hours: number, minutes: number, seconds: number = 0): Date => {
  const d = new Date(date);
  d.setHours(hours, minutes, seconds, 0);
  return d;
};

const startOfDayNative = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const extractTimeComponents = (timeStr: string) => {
  if (!timeStr || timeStr.trim() === '') return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?\s*(AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = match[3] ? parseInt(match[3]) : 0;
    const ampm = match[4]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return { hours, minutes, seconds };
  }
  return null;
};

const robustParseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().replace(/^"(.*)"$/, '$1').replace(/\s+/g, ' ');
  
  const native = new Date(cleaned);
  if (isValid(native)) return native;

  const formats = [
    'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'd/M/yyyy', 'dd-MM-yyyy',
    'dd.MM.yyyy', 'MMMM d, yyyy', 'MMM d, yyyy'
  ];
  
  for (const f of formats) {
    try {
      const d = parse(cleaned, f, new Date());
      if (isValid(d) && d.getFullYear() > 2000) return d;
    } catch (e) {}
  }

  const parts = cleaned.split(/[-/.\s,]+/);
  if (parts.length >= 3) {
    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);
    const p2 = parseInt(parts[2]);
    if (p0 > 1000) { const d = new Date(p0, p1 - 1, p2); if (isValid(d)) return d; }
    if (p2 > 1000) { const d = new Date(p2, p1 - 1, p0); if (isValid(d)) return d; }
  }
  
  return null;
};

const parseCurrency = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export const processPayroll = (rawRecords: AttendanceRecord[], mapping: ColumnMapping): PayrollResult => {
  const dayShifts: DayShift[] = [];
  const cleansingLogs: CleansingLog[] = [];
  const grouped: Record<string, AttendanceRecord[]> = {};
  const today = startOfToday();
  
  rawRecords.forEach((record) => {
    let nameVal = (record[mapping.name] || '').trim().replace(/\s+/g, ' ');
    if (!nameVal || nameVal.toLowerCase() === 'name' || nameVal.toLowerCase() === 'employee_name') return;
    
    const dateVal = (record[mapping.date] || '').trim();
    if (!dateVal) return;
    
    const dateObj = robustParseDate(dateVal);
    
    if (!dateObj || !isValid(dateObj)) {
      cleansingLogs.push({ 
        type: 'TIME_INTERPOLATION', 
        message: `Skipping record for ${nameVal} due to unparseable date: "${dateVal}"` 
      });
      return;
    }
    
    const normDate = format(dateObj, 'yyyy-MM-dd');
    const key = `${nameVal.toLowerCase()}|${normDate}`;
    if (!grouped[key]) {
      grouped[key] = [];
      (grouped[key] as any).displayName = nameVal;
      (grouped[key] as any).parsedDate = dateObj;
    }
    grouped[key].push(record);
  });

  Object.entries(grouped).forEach(([key, records]) => {
    const displayName = (records as any).displayName;
    const dateObj = (records as any).parsedDate;
    
    const checkInTimes = records.map(r => extractTimeComponents(r[mapping.checkIn])).filter(t => t !== null);
    const checkOutTimes = records.map(r => extractTimeComponents(r[mapping.checkOut])).filter(t => t !== null);
    
    const dailyPaid = records.reduce((sum, r) => sum + parseCurrency(r[mapping.paid]), 0);
    const manualPenalty = records.reduce((sum, r) => sum + parseCurrency(r[mapping.penalty || 'Penalty']), 0);

    const hasCheckIn = checkInTimes.length > 0;
    
    if (!hasCheckIn) {
      dayShifts.push({
        id: Math.random().toString(36).substr(2, 9),
        name: displayName, date: format(dateObj, 'yyyy-MM-dd'), actualIn: dateObj, actualOut: dateObj, 
        shiftType: 'A', shiftStart: dateObj, latenessMinutes: 0, earlyMinutes: 0, workHours: 0, durationHours: 0,
        otHours: 0, otPay: 0, standardPay: 0, attendancePenalty: 0, manualPenalty, manualAdjustment: 0, penaltyWaiver: 0, 
        netPay: 0, amountPaid: dailyPaid, balanceRemaining: -dailyPaid
      });
      return;
    }

    const datesIn = checkInTimes.map(t => setTimeOnDate(dateObj, t!.hours, t!.minutes, t!.seconds));
    const datesOut = checkOutTimes.map(t => setTimeOnDate(dateObj, t!.hours, t!.minutes, t!.seconds));
    
    const actualIn = new Date(Math.min(...datesIn.map(d => d.getTime())));
    let actualOut = datesOut.length > 0 ? new Date(Math.max(...datesOut.map(d => d.getTime()))) : addDays(actualIn, 0.375);
    if (actualOut < actualIn) actualOut = addDays(actualOut, 1);

    const totalMinutesOfDay = actualIn.getHours() * 60 + actualIn.getMinutes();
    let shiftType: 'A' | 'B' | 'C';
    let shiftStart: Date;
    
    if (totalMinutesOfDay < (10 * 60 + 30)) {
      shiftType = 'A';
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), 10, 0);
    } else if (totalMinutesOfDay <= (12 * 60 + 30)) {
      shiftType = 'C';
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), 11, 0);
    } else {
      shiftType = 'B';
      const isThuFri = getDay(actualIn) === 4 || getDay(actualIn) === 5; 
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), isThuFri ? 15 : 14, 0);
    }

    const latenessMinutes = Math.max(0, differenceInMinutes(actualIn, shiftStart));
    let attendancePenalty = 0;
    if (latenessMinutes >= 60) attendancePenalty = 10;
    else if (latenessMinutes >= 20) attendancePenalty = 5;
    else if (latenessMinutes >= 10) attendancePenalty = 3;

    const rawWorkHours = (actualOut.getTime() - actualIn.getTime()) / (1000 * 60 * 60);
    const durationHours = Math.max(0, rawWorkHours - BREAK_HOURS);
    
    const otHours = Math.max(0, rawWorkHours - 9);
    const otPay = otHours * 1.56;
    const netPay = 10.0 + otPay - attendancePenalty - manualPenalty;

    dayShifts.push({
      id: Math.random().toString(36).substr(2, 9),
      name: displayName, date: format(dateObj, 'yyyy-MM-dd'), actualIn, actualOut, shiftType, shiftStart,
      latenessMinutes, earlyMinutes: Math.max(0, (9 - rawWorkHours) * 60), 
      workHours: rawWorkHours, durationHours, otHours, otPay, standardPay: 10.0, 
      attendancePenalty, manualPenalty, manualAdjustment: 0, penaltyWaiver: 0, 
      netPay, amountPaid: dailyPaid, balanceRemaining: netPay - dailyPaid
    });
  });

  const empMap: Record<string, EmployeeSummary> = {};
  const monthMap: Record<string, MonthlyStat> = {};
  let totalFutureLiability = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  dayShifts.forEach(shift => {
    const shiftDate = new Date(shift.date);
    if (!minDate || isBefore(shiftDate, minDate)) minDate = shiftDate;
    if (!maxDate || isAfter(shiftDate, maxDate)) maxDate = shiftDate;

    if (!empMap[shift.name]) {
      empMap[shift.name] = { 
        name: shift.name, workDays: 0, totalStandardPay: 0, totalOTPay: 0, 
        totalAttendancePenalties: 0, totalManualPenalties: 0,
        totalManualAdjustments: 0, totalPenaltyWaivers: 0, netSalary: 0, amountPaid: 0, netRemaining: 0, 
        shiftCounts: { A: 0, B: 0, C: 0 }, penaltyFreeDays: 0
      };
    }
    const emp = empMap[shift.name];
    
    if (shift.netPay > 0 || shift.workHours > 0) emp.workDays++;

    emp.totalStandardPay += shift.standardPay;
    emp.totalOTPay += shift.otPay;
    emp.totalAttendancePenalties += shift.attendancePenalty;
    emp.totalManualPenalties += shift.manualPenalty;
    emp.netSalary += shift.netPay;
    emp.amountPaid += shift.amountPaid;
    emp.netRemaining += shift.balanceRemaining;
    
    if (shift.workHours > 0) emp.shiftCounts[shift.shiftType]++;
    if (shift.attendancePenalty === 0 && (shift.netPay > 0 || shift.workHours > 0)) emp.penaltyFreeDays++;
    if (isAfter(shiftDate, today)) totalFutureLiability += shift.netPay;

    const monthKey = format(shiftDate, 'yyyy-MM');
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { 
        month: format(shiftDate, 'MMMM yyyy'), daysWorked: 0, standardPay: 0, otPay: 0, penalties: 0, netPay: 0, totalPaid: 0 
      };
    }
    const m = monthMap[monthKey];
    if (shift.netPay > 0 || shift.workHours > 0) m.daysWorked++; 
    m.standardPay += shift.standardPay; 
    m.otPay += shift.otPay; 
    m.penalties += shift.attendancePenalty + shift.manualPenalty; 
    m.netPay += shift.netPay;
    m.totalPaid += shift.amountPaid;
  });

  const summaries = Object.values(empMap).sort((a, b) => b.netSalary - a.netSalary).map((s, i) => ({ ...s, rank: i + 1 }));
  const totalLateMins = dayShifts.reduce((a, b) => a + b.latenessMinutes, 0);
  const totalPenalties = dayShifts.reduce((a, b) => a + b.attendancePenalty + b.manualPenalty, 0);
  const totalOTPay = summaries.reduce((a, b) => a + b.totalOTPay, 0);
  const totalNetOwed = summaries.reduce((a, b) => a + b.netSalary, 0);
  const totalPaid = summaries.reduce((a, b) => a + b.amountPaid, 0);

  return {
    summaries,
    totalStandardOwed: summaries.reduce((a, b) => a + b.totalStandardPay, 0),
    totalOTPayout: totalOTPay,
    totalPenalties,
    totalManualAdjustments: 0,
    totalPenaltyWaivers: 0,
    totalNetOwed,
    totalPaidDisbursed: totalPaid,
    totalRemainingBalance: totalNetOwed - totalPaid,
    totalDaysWorked: dayShifts.filter(s => s.netPay > 0 || s.workHours > 0).length,
    totalLatenessMins: totalLateMins,
    efficiencyScore: 1 - (totalPenalties / (dayShifts.filter(s => s.netPay > 0 || s.workHours > 0).length * 10 || 1)),
    monthlyStats: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
    insights: {
      mostReliable: { name: (summaries.reduce((a, b) => a.penaltyFreeDays > b.penaltyFreeDays ? a : b, summaries[0])?.name || 'N/A'), penaltyFreeDays: (summaries.reduce((a, b) => a.penaltyFreeDays > b.penaltyFreeDays ? a : b, summaries[0])?.penaltyFreeDays || 0) },
      topLateOffender: { name: (summaries.reduce((a, b) => a.totalAttendancePenalties > b.totalAttendancePenalties ? a : b, summaries[0])?.name || 'N/A'), totalAttendancePenalties: (summaries.reduce((a, b) => a.totalAttendancePenalties > b.totalAttendancePenalties ? a : b, summaries[0])?.totalAttendancePenalties || 0) },
      penaltyRecoveryRate: totalPenalties / ((totalPenalties + totalOTPay) || 1),
      totalOTHours: dayShifts.reduce((a, b) => a + b.otHours, 0),
      shiftAUsage: dayShifts.filter(s => s.shiftType === 'A' && s.workHours > 0).length / (dayShifts.filter(s => s.workHours > 0).length || 1),
      shiftBUsage: dayShifts.filter(s => s.shiftType === 'B' && s.workHours > 0).length / (dayShifts.filter(s => s.workHours > 0).length || 1),
      shiftCUsage: dayShifts.filter(s => s.shiftType === 'C' && s.workHours > 0).length / (dayShifts.filter(s => s.workHours > 0).length || 1),
      perfectAttendanceStaff: summaries.filter(s => s.totalAttendancePenalties === 0 && s.workDays > 0).map(s => s.name),
      totalFutureLiability
    },
    detailedLogs: dayShifts,
    cleansingLogs,
    dateRange: {
      start: minDate ? format(minDate, 'MMM d, yyyy') : 'N/A',
      end: maxDate ? format(maxDate, 'MMM d, yyyy') : 'N/A'
    }
  };
};
