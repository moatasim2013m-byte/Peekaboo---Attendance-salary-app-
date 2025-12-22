
import { differenceInMinutes, addDays, format, isValid, getDay } from 'date-fns';
import { AttendanceRecord, DayShift, EmployeeSummary, PayrollResult, MonthlyStat, ColumnMapping, CleansingLog } from '../types';

// Fix: Native implementation for missing date-fns/setHours, setMinutes, setSeconds
const setTimeOnDate = (date: Date, hours: number, minutes: number, seconds: number = 0): Date => {
  const d = new Date(date);
  d.setHours(hours, minutes, seconds, 0);
  return d;
};

// Fix: Native implementation for missing date-fns/startOfDay
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

// Fix: Robust parser that avoids the missing 'parse' function from date-fns
const robustParseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().replace(/^"(.*)"$/, '$1'); 
  
  // Try native parsing first (handles ISO and many standard formats)
  const native = new Date(cleaned);
  if (isValid(native)) return native;

  // Manual fallback for common non-standard formats (DD/MM/YYYY or YYYY-MM-DD)
  const parts = cleaned.split(/[-/.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);
    const p2 = parseInt(parts[2]);
    
    // YYYY-MM-DD
    if (p0 > 1000) {
      const d = new Date(p0, p1 - 1, p2);
      if (isValid(d)) return d;
    }
    // DD-MM-YYYY
    if (p2 > 1000) {
      const d = new Date(p2, p1 - 1, p0);
      if (isValid(d)) return d;
    }
    // MM-DD-YYYY
    const dMMDD = new Date(p2, p0 - 1, p1);
    if (isValid(dMMDD)) return dMMDD;
  }

  return null;
};

export const processPayroll = (rawRecords: AttendanceRecord[], mapping: ColumnMapping): PayrollResult => {
  const dayShifts: DayShift[] = [];
  const cleansingLogs: CleansingLog[] = [];
  const grouped: Record<string, AttendanceRecord[]> = {};

  rawRecords.forEach((record, index) => {
    const nameVal = (record[mapping.name] || '').trim().replace(/\s+/g, ' ');
    if (!nameVal || nameVal.toLowerCase() === 'name') return;
    const dateVal = (record[mapping.date] || '').trim();
    const dateObj = robustParseDate(dateVal);
    if (!dateObj || !isValid(dateObj)) {
      if (index < 20) cleansingLogs.push({ type: 'HEADER_FIX', message: `Row ${index + 1}: Could not parse date "${dateVal}".` });
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
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const checkInTimes = records.map(r => extractTimeComponents(r[mapping.checkIn])).filter(t => t !== null);
    const checkOutTimes = records.map(r => extractTimeComponents(r[mapping.checkOut])).filter(t => t !== null);

    const dailyPaid = records.reduce((sum, r) => {
      const pStr = r[mapping.paid] || '0';
      const p = parseFloat(pStr.replace(/[^\d.-]/g, ''));
      return sum + (isNaN(p) ? 0 : p);
    }, 0);

    if (checkInTimes.length === 0) return;

    // Fix: Using native setTimeOnDate to replace setHours, setMinutes, setSeconds
    const datesIn = checkInTimes.map(t => setTimeOnDate(dateObj, t!.hours, t!.minutes, t!.seconds));
    const datesOut = checkOutTimes.map(t => setTimeOnDate(dateObj, t!.hours, t!.minutes, t!.seconds));
    
    const actualIn = new Date(Math.min(...datesIn.map(d => d.getTime())));
    let actualOut = datesOut.length > 0 ? new Date(Math.max(...datesOut.map(d => d.getTime()))) : addDays(actualIn, 0.375);
    if (actualOut < actualIn) actualOut = addDays(actualOut, 1);

    const hour = actualIn.getHours();
    const minute = actualIn.getMinutes();
    const totalMinutesOfDay = hour * 60 + minute;
    let shiftType: 'A' | 'B' | 'C';
    let shiftStart: Date;
    const t1030 = 10 * 60 + 30;
    const t1230 = 12 * 60 + 30;

    if (totalMinutesOfDay < t1030) {
      shiftType = 'A';
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), 10, 0);
    } else if (totalMinutesOfDay <= t1230) {
      shiftType = 'C';
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), 11, 0);
    } else {
      shiftType = 'B';
      const dayOfWeek = getDay(actualIn);
      const isThuFri = dayOfWeek === 4 || dayOfWeek === 5; 
      shiftStart = setTimeOnDate(startOfDayNative(actualIn), isThuFri ? 15 : 14, 0);
    }

    const latenessMinutes = Math.max(0, differenceInMinutes(actualIn, shiftStart));
    let attendancePenalty = 0;
    if (latenessMinutes >= 60) attendancePenalty = 10;
    else if (latenessMinutes >= 20) attendancePenalty = 5;
    else if (latenessMinutes >= 10) attendancePenalty = 3;

    const workHours = (actualOut.getTime() - actualIn.getTime()) / (1000 * 60 * 60);
    const otHours = Math.max(0, workHours - 9);
    const otPay = otHours * 1.56;
    const standardPay = 10.0;
    const netPay = standardPay + otPay - attendancePenalty;

    dayShifts.push({
      id: Math.random().toString(36).substr(2, 9),
      name: displayName,
      date: dateStr,
      actualIn,
      actualOut,
      shiftType,
      shiftStart,
      latenessMinutes,
      earlyMinutes: Math.max(0, (9 - workHours) * 60),
      workHours,
      otHours,
      otPay,
      standardPay,
      attendancePenalty,
      manualAdjustment: 0,
      penaltyWaiver: 0,
      netPay,
      amountPaid: dailyPaid, 
      balanceRemaining: netPay - dailyPaid
    });
  });

  dayShifts.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const empMap: Record<string, EmployeeSummary> = {};
  const monthMap: Record<string, MonthlyStat> = {};

  dayShifts.forEach(shift => {
    if (!empMap[shift.name]) {
      empMap[shift.name] = { 
        name: shift.name, workDays: 0, totalStandardPay: 0, totalOTPay: 0, totalAttendancePenalties: 0, 
        totalManualAdjustments: 0, totalPenaltyWaivers: 0, netSalary: 0, amountPaid: 0, netRemaining: 0, shiftCounts: { A: 0, B: 0, C: 0 }
      };
    }
    const emp = empMap[shift.name];
    emp.workDays++;
    emp.totalStandardPay += shift.standardPay;
    emp.totalOTPay += shift.otPay;
    emp.totalAttendancePenalties += shift.attendancePenalty;
    emp.totalManualAdjustments += shift.manualAdjustment;
    emp.totalPenaltyWaivers += shift.penaltyWaiver;
    emp.netSalary += shift.netPay;
    emp.amountPaid += shift.amountPaid;
    emp.netRemaining += shift.balanceRemaining;
    emp.shiftCounts[shift.shiftType]++;

    const [year, month, day] = shift.date.split('-').map(Number);
    const dateForMonth = new Date(year, month - 1, day);
    const monthName = format(dateForMonth, 'MMMM');
    
    if (!monthMap[monthName]) monthMap[monthName] = { month: monthName, daysWorked: 0, standardPay: 0, otPay: 0, penalties: 0, netPay: 0 };
    const m = monthMap[monthName];
    m.daysWorked++; m.standardPay += shift.standardPay; m.otPay += shift.otPay; m.penalties += (shift.attendancePenalty - shift.penaltyWaiver); m.netPay += shift.netPay;
  });

  const summaries = Object.values(empMap).sort((a, b) => b.netSalary - a.netSalary).map((s, i) => ({ ...s, rank: i + 1 }));
  
  return {
    summaries,
    totalStandardOwed: summaries.reduce((a, b) => a + b.totalStandardPay, 0),
    totalOTPayout: summaries.reduce((a, b) => a + b.totalOTPay, 0),
    totalPenalties: summaries.reduce((a, b) => a + b.totalAttendancePenalties, 0),
    totalManualAdjustments: summaries.reduce((a, b) => a + b.totalManualAdjustments, 0),
    totalPenaltyWaivers: summaries.reduce((a, b) => a + b.totalPenaltyWaivers, 0),
    totalNetOwed: summaries.reduce((a, b) => a + b.netSalary, 0),
    totalPaidDisbursed: summaries.reduce((a, b) => a + b.amountPaid, 0),
    totalRemainingBalance: summaries.reduce((a, b) => a + b.netRemaining, 0),
    totalDaysWorked: dayShifts.length,
    totalLatenessMins: dayShifts.reduce((a, b) => a + b.latenessMinutes, 0), // Added calculation
    efficiencyScore: 1 - (summaries.reduce((a,b) => a+b.totalAttendancePenalties - b.totalPenaltyWaivers, 0) / (summaries.reduce((a,b) => a+b.totalStandardPay, 0) || 1)),
    monthlyStats: Object.values(monthMap),
    insights: {
      mostReliable: summaries.reduce((a, b) => (a.workDays > b.workDays ? a : b), { name: 'N/A', workDays: 0 }) as any,
      topLateOffender: summaries.reduce((a, b) => (a.totalAttendancePenalties > b.totalAttendancePenalties ? a : b), { name: 'N/A', totalAttendancePenalties: 0 }) as any,
      penaltyRate: 0,
      totalOTHours: dayShifts.reduce((a, b) => a + b.otHours, 0),
      totalEarlyEvents: dayShifts.filter(d => d.earlyMinutes > 15).length,
      totalLateEvents: dayShifts.filter(d => d.latenessMinutes >= 10).length
    },
    detailedLogs: dayShifts,
    cleansingLogs
  };
};
