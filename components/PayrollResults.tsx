
import React, { useState, useMemo, useEffect } from 'react';
import { PayrollResult, DayShift, EmployeeSummary } from '../types';
import { format, differenceInMinutes, getDay, isValid } from 'date-fns';

interface Props {
  result: PayrollResult;
  auditReport: string | null;
}

const PayrollResults: React.FC<Props> = ({ result: initialResult, auditReport }) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'staff' | 'financials' | 'audit'>('ledger');
  
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All Employees');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [localLogs, setLocalLogs] = useState<DayShift[]>(initialResult.detailedLogs);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({
    name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    checkIn: '10:00',
    checkOut: '19:00',
    paid: '0',
    shiftOverride: 'AUTO' as 'AUTO' | 'A' | 'B' | 'C'
  });

  const entryPreview = useMemo(() => {
    if (!newEntry.date || !newEntry.checkIn || !newEntry.checkOut) return null;
    
    const [y, m, d] = newEntry.date.split('-').map(Number);
    const [inH, inM] = newEntry.checkIn.split(':').map(Number);
    const [outH, outM] = newEntry.checkOut.split(':').map(Number);

    const actualIn = new Date(y, m - 1, d, inH, inM);
    let actualOut = new Date(y, m - 1, d, outH, outM);
    if (actualOut < actualIn) actualOut.setDate(actualOut.getDate() + 1);

    const totalMinutesOfDay = inH * 60 + inM;
    let shiftType: 'A' | 'B' | 'C';
    let shiftStart: Date;
    const t1030 = 10 * 60 + 30;
    const t1230 = 12 * 60 + 30;

    if (newEntry.shiftOverride !== 'AUTO') {
      shiftType = newEntry.shiftOverride;
      if (shiftType === 'A') shiftStart = new Date(y, m - 1, d, 10, 0);
      else if (shiftType === 'C') shiftStart = new Date(y, m - 1, d, 11, 0);
      else shiftStart = new Date(y, m - 1, d, 14, 0);
    } else {
      if (totalMinutesOfDay < t1030) {
        shiftType = 'A';
        shiftStart = new Date(y, m - 1, d, 10, 0);
      } else if (totalMinutesOfDay <= t1230) {
        shiftType = 'C';
        shiftStart = new Date(y, m - 1, d, 11, 0);
      } else {
        shiftType = 'B';
        const dayOfWeek = getDay(new Date(y, m - 1, d));
        const isThuFri = dayOfWeek === 4 || dayOfWeek === 5; 
        shiftStart = new Date(y, m - 1, d, isThuFri ? 15 : 14, 0);
      }
    }

    const latenessMinutes = Math.max(0, differenceInMinutes(actualIn, shiftStart));
    let penalty = 0;
    if (latenessMinutes >= 60) penalty = 10;
    else if (latenessMinutes >= 20) penalty = 5;
    else if (latenessMinutes >= 10) penalty = 3;

    const workHours = (actualOut.getTime() - actualIn.getTime()) / (1000 * 60 * 60);
    const otPay = Math.max(0, workHours - 9) * 1.56;
    const netPay = 10.0 + otPay - penalty;
    const paid = parseFloat(newEntry.paid) || 0;

    return {
      shiftType,
      latenessMinutes,
      penalty,
      otPay,
      netPay,
      balance: netPay - paid,
      workHours
    };
  }, [newEntry]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    localLogs.forEach(log => {
      const parts = log.date.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (isValid(d)) months.add(format(d, 'MMMM'));
    });
    const monthsOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return Array.from(months).sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b));
  }, [localLogs]);

  const availableEmployees = useMemo(() => {
    const names = new Set<string>();
    localLogs.forEach(log => names.add(log.name));
    return Array.from(names).sort();
  }, [localLogs]);

  const filteredLogs = useMemo(() => {
    return localLogs.filter(log => {
      const parts = log.date.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const logMonth = isValid(d) ? format(d, 'MMMM') : '';
      const matchesMonth = selectedMonth === 'All Months' || logMonth === selectedMonth;
      const matchesEmployee = selectedEmployee === 'All Employees' || log.name === selectedEmployee;
      const matchesSearch = log.name.toLowerCase().includes(searchTerm.toLowerCase()) || log.date.includes(searchTerm);
      return matchesMonth && matchesEmployee && matchesSearch;
    });
  }, [localLogs, selectedMonth, selectedEmployee, searchTerm]);

  const filteredSummaries = useMemo(() => {
    const empMap: Record<string, EmployeeSummary> = {};
    filteredLogs.forEach(shift => {
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
      emp.netRemaining += (shift.netPay - shift.amountPaid);
      emp.shiftCounts[shift.shiftType]++;
    });
    return Object.values(empMap).sort((a, b) => b.netSalary - a.netSalary).map((s, i) => ({ ...s, rank: i + 1 }));
  }, [filteredLogs]);

  const tableTotals = useMemo(() => {
    return filteredLogs.reduce((acc, log) => ({
      workHours: acc.workHours + log.workHours,
      latenessMinutes: acc.latenessMinutes + log.latenessMinutes,
      penalties: acc.penalties + (log.attendancePenalty + log.manualAdjustment - log.penaltyWaiver),
      standard: acc.standard + log.standardPay,
      ot: acc.ot + log.otPay,
      net: acc.net + log.netPay,
      paid: acc.paid + log.amountPaid,
      remaining: acc.remaining + (log.netPay - log.amountPaid)
    }), { workHours: 0, latenessMinutes: 0, penalties: 0, standard: 0, ot: 0, net: 0, paid: 0, remaining: 0 });
  }, [filteredLogs]);

  const financials = useMemo(() => {
    const totalNetOwed = filteredLogs.reduce((a, b) => a + b.netPay, 0);
    const totalPaid = filteredLogs.reduce((a, b) => a + b.amountPaid, 0);
    const totalStandard = filteredLogs.reduce((a, b) => a + b.standardPay, 0);
    const totalOT = filteredLogs.reduce((a, b) => a + b.otPay, 0);
    const totalPenalties = filteredLogs.reduce((a, b) => a + (b.attendancePenalty - b.penaltyWaiver + b.manualAdjustment), 0);
    const totalHours = filteredLogs.reduce((a, b) => a + b.workHours, 0);
    const totalLatenessMins = filteredLogs.reduce((a, b) => a + b.latenessMinutes, 0);
    const totalDays = filteredLogs.length;
    
    return {
      totalNetOwed, totalPaid, totalStandard, totalOT, totalPenalties, totalHours, totalLatenessMins, totalDays,
      remaining: totalNetOwed - totalPaid,
      otPercentage: (totalOT / (totalNetOwed || 1)) * 100,
      penaltyDensity: (totalPenalties / (totalStandard || 1)) * 100,
      avgLateness: totalLatenessMins / (totalDays || 1),
      attendanceScore: Math.max(0, 100 - (totalLatenessMins / (totalDays || 1) * 2.5))
    };
  }, [filteredLogs]);

  const exportToExcel = () => {
    if (filteredLogs.length === 0) return;
    const headers = ["Employee", "Date", "Arrival", "Departure", "Hrs Worked", "Total Late (m)", "Penalty (JD)", "Standard (JD)", "OT (JD)", "Total Net (JD)", "Paid (JD)", "Remaining (JD)", "Notes"];
    const rows = filteredLogs.map(log => [
      log.name, log.date, format(log.actualIn, 'HH:mm'), format(log.actualOut, 'HH:mm'), log.workHours.toFixed(2), log.latenessMinutes,
      (log.attendancePenalty + log.manualAdjustment - log.penaltyWaiver).toFixed(2), log.standardPay.toFixed(2), log.otPay.toFixed(2),
      log.netPay.toFixed(2), log.amountPaid.toFixed(2), (log.netPay - log.amountPaid).toFixed(2), log.adjustmentNote || ""
    ]);
    const totalsRow = ["TOTALS", "", "", "", tableTotals.workHours.toFixed(2), tableTotals.latenessMinutes, tableTotals.penalties.toFixed(2), tableTotals.standard.toFixed(2), tableTotals.ot.toFixed(2), tableTotals.net.toFixed(2), tableTotals.paid.toFixed(2), tableTotals.remaining.toFixed(2), ""];
    const csvContent = [headers, ...rows, totalsRow].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Peekaboo_Payroll_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddEntry = () => {
    if (!newEntry.name || !entryPreview) return;
    const [y, m, d] = newEntry.date.split('-').map(Number);
    const [inH, inM] = newEntry.checkIn.split(':').map(Number);
    const [outH, outM] = newEntry.checkOut.split(':').map(Number);
    const actualIn = new Date(y, m - 1, d, inH, inM);
    let actualOut = new Date(y, m - 1, d, outH, outM);
    if (actualOut < actualIn) actualOut.setDate(actualOut.getDate() + 1);
    const newLog: DayShift = {
      id: Math.random().toString(36).substr(2, 9),
      name: newEntry.name, date: newEntry.date, actualIn, actualOut, shiftType: entryPreview.shiftType,
      shiftStart: actualIn, latenessMinutes: entryPreview.latenessMinutes, earlyMinutes: Math.max(0, (9 - entryPreview.workHours) * 60),
      workHours: entryPreview.workHours, otHours: Math.max(0, entryPreview.workHours - 9), otPay: entryPreview.otPay,
      standardPay: 10.0, attendancePenalty: entryPreview.penalty, manualAdjustment: 0, penaltyWaiver: 0, netPay: entryPreview.netPay,
      amountPaid: parseFloat(newEntry.paid) || 0, balanceRemaining: entryPreview.balance, adjustmentNote: `Manual Entry`
    };
    setLocalLogs(prev => [...prev, newLog].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)));
    setShowAddModal(false);
  };

  const applyOtherPenalty = (id: string) => {
    const amount = prompt("Apply manual deduction (JD):", "0");
    if (amount === null) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) return;
    const reason = prompt("Reason:");
    if (!reason) return;
    setLocalLogs(prev => prev.map(log => {
      if (log.id === id) {
        const newManual = log.manualAdjustment + parsed;
        const newNet = (log.standardPay + log.otPay - log.attendancePenalty + log.penaltyWaiver) - newManual;
        return { ...log, manualAdjustment: newManual, adjustmentNote: log.adjustmentNote ? `${log.adjustmentNote} | ${reason}` : reason, netPay: newNet, balanceRemaining: newNet - log.amountPaid };
      }
      return log;
    }));
  };

  const removePenalty = (id: string) => {
    setLocalLogs(prev => prev.map(l => {
      if (l.id === id) {
        if (l.penaltyWaiver > 0) {
          const newNet = (l.standardPay + l.otPay - l.attendancePenalty) - l.manualAdjustment;
          return { ...l, penaltyWaiver: 0, netPay: newNet, balanceRemaining: newNet - l.amountPaid };
        }
        const reason = prompt("Waiver Reason:");
        if (reason === null) return l;
        const newNet = (l.standardPay + l.otPay) - l.manualAdjustment;
        return { ...l, penaltyWaiver: l.attendancePenalty, adjustmentNote: l.adjustmentNote ? `${l.adjustmentNote} | Waived: ${reason}` : `Waived: ${reason}`, netPay: newNet, balanceRemaining: newNet - l.amountPaid };
      }
      return l;
    }));
  };

  return (
    <div className="mt-10 space-y-8 pb-20">
      {/* Peekaboo Branded HUD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <div className="bg-[#EE1C25] text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-[-20px] right-[-20px] w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Net Owed</p>
          <h2 className="text-3xl font-black">{financials.totalNetOwed.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-[#2EBB55] text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Paid</p>
          <h2 className="text-3xl font-black">{financials.totalPaid.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-white border-4 border-[#FFD700] p-7 rounded-[2.5rem] shadow-sm flex flex-col justify-center group hover:bg-[#FFD700] transition-colors">
          <p className="text-slate-400 group-hover:text-black/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Remaining</p>
          <h2 className="text-3xl font-black text-slate-900 group-hover:text-black">{financials.remaining.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-[#00AEEF] text-white p-7 rounded-[2.5rem] shadow-xl flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Work Days</p>
          <h2 className="text-3xl font-black">{financials.totalDays} <span className="text-xs uppercase">Shifts</span></h2>
        </div>
        <div className="bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-[#EE1C25] text-[10px] font-black uppercase tracking-[0.2em] mb-2">Lateness</p>
          <h2 className="text-3xl font-black text-slate-900">{financials.totalLatenessMins} <span className="text-xs text-slate-400">MINS</span></h2>
        </div>
        <div className="bg-[#F7941D] text-white p-7 rounded-[2.5rem] shadow-xl flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">OT Total</p>
          <h2 className="text-3xl font-black">{financials.totalOT.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
      </div>

      {/* Enhanced Filter Section */}
      <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row items-end gap-6">
        <div className="flex-1 w-full space-y-3">
          <label className="text-[11px] font-black text-slate-900 uppercase tracking-widest pl-2">Member Search</label>
          <div className="relative">
            <input type="text" placeholder="Search name or ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/5 transition-all" />
          </div>
        </div>
        <div className="w-full xl:w-[250px] space-y-3">
          <label className="text-[11px] font-black text-slate-900 uppercase tracking-widest pl-2">Filter Employee</label>
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none hover:bg-slate-100 transition-all cursor-pointer">
            <option>All Employees</option>
            {availableEmployees.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="w-full xl:w-[250px] space-y-3">
          <label className="text-[11px] font-black text-slate-900 uppercase tracking-widest pl-2">Pay Period</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none hover:bg-slate-100 transition-all cursor-pointer">
            <option>All Months</option>
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-4">
          <button onClick={exportToExcel} className="px-8 py-4 bg-white border-2 border-emerald-100 text-emerald-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-lg shadow-emerald-500/5">Extract Excel</button>
          <button onClick={() => setShowAddModal(true)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 shadow-xl shadow-blue-500/10 flex items-center gap-3">
             <span className="text-lg">+</span> Manual Shift
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[600px]">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100/50 p-3 m-6 rounded-[2.5rem] w-fit">
          {['ledger', 'staff', 'financials', 'audit'].map((id) => (
            <button key={id} onClick={() => setActiveTab(id as any)} className={`px-10 py-4 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === id ? 'bg-white text-[#00AEEF] shadow-xl scale-105' : 'text-slate-400 hover:text-slate-700'}`}>
              {id === 'ledger' ? 'Shift Ledger' : id === 'staff' ? 'Staff Rankings' : id === 'financials' ? 'Managerial Hub' : 'AI Forensic Audit'}
            </button>
          ))}
        </div>

        {activeTab === 'ledger' && (
          <div className="animate-in fade-in duration-500 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1900px]">
                <thead>
                  <tr className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 bg-slate-50/30">
                    <th className="py-8 pl-12">Staff Member / Date</th>
                    <th className="py-8">Arrival</th>
                    <th className="py-8">Departure</th>
                    <th className="py-8">Hrs Worked</th>
                    <th className="py-8 text-red-500">Lateness</th>
                    <th className="py-8 text-red-600">Penalty</th>
                    <th className="py-8 text-right">Standard</th>
                    <th className="py-8 text-right font-bold text-blue-500">OT</th>
                    <th className="py-8 text-right font-black bg-slate-50">Total Net</th>
                    <th className="py-8 text-right text-emerald-600">Paid</th>
                    <th className="py-8 text-right bg-slate-900 text-white pl-8 pr-12">Remaining</th>
                    <th className="py-8 text-right pr-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/40 group transition-colors">
                      <td className="py-7 pl-12">
                        <div className="flex flex-col">
                          <span className="text-[15px] font-black text-slate-900 tracking-tight">{log.name}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{log.date}</span>
                        </div>
                      </td>
                      <td className="py-7">
                        <div className="flex flex-col">
                          <span className="text-[14px] font-black text-slate-700">{format(log.actualIn, 'hh:mm a')}</span>
                          <span className="text-[9px] font-black uppercase text-slate-300">Shift {log.shiftType}</span>
                        </div>
                      </td>
                      <td className="py-7"><span className="text-[14px] font-black text-slate-700">{format(log.actualOut, 'hh:mm a')}</span></td>
                      <td className="py-7"><span className="text-[14px] font-black text-slate-900">{log.workHours.toFixed(2)} hrs</span></td>
                      <td className="py-7">
                        <span className={`text-[14px] font-black ${log.latenessMinutes > 0 ? 'text-[#EE1C25]' : 'text-[#2EBB55]'}`}>
                          {log.latenessMinutes} min
                        </span>
                      </td>
                      <td className="py-7">
                        <span className="text-[14px] font-black text-red-600">
                          {log.penaltyWaiver > 0 ? <span className="line-through text-slate-300">-{log.attendancePenalty.toFixed(2)}</span> : `-${(log.attendancePenalty + log.manualAdjustment).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="py-7 text-right font-bold text-slate-300">10.00</td>
                      <td className={`py-7 text-right font-black ${log.otPay > 0 ? 'text-[#00AEEF]' : 'text-slate-200'}`}>
                         {log.otPay > 0 ? `+${log.otPay.toFixed(2)}` : '0.00'}
                      </td>
                      <td className="py-7 text-right font-black text-slate-900 text-[16px] bg-slate-50/20">{log.netPay.toFixed(2)}</td>
                      <td className="py-7 text-right font-black text-[#2EBB55]">{log.amountPaid.toFixed(2)}</td>
                      <td className="py-7 text-right font-black text-white bg-slate-800/95 pl-8 pr-12">{(log.netPay - log.amountPaid).toFixed(2)}</td>
                      <td className="py-7 text-right pr-12">
                         <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => applyOtherPenalty(log.id)} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm">📝</button>
                            <button onClick={() => removePenalty(log.id)} className={`p-3 rounded-xl transition-all ${log.penaltyWaiver > 0 ? 'bg-emerald-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'} shadow-sm`}>⚖️</button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-4 border-slate-900 bg-slate-900 text-white font-black">
                   <tr>
                      <td className="py-8 pl-12 text-[16px] uppercase tracking-widest font-black">Grand Totals</td>
                      <td className="py-8"></td><td className="py-8"></td>
                      <td className="py-8 text-[14px]">{tableTotals.workHours.toFixed(2)} <span className="text-[10px] text-slate-500 uppercase">Hrs</span></td>
                      <td className="py-8 text-[14px]">{tableTotals.latenessMinutes} <span className="text-[10px] text-slate-500 uppercase">Min</span></td>
                      <td className="py-8 text-[14px] text-red-400">-{tableTotals.penalties.toFixed(2)} <span className="text-[10px] text-slate-500">JD</span></td>
                      <td className="py-8 text-right text-[14px] text-slate-500">{tableTotals.standard.toFixed(2)}</td>
                      <td className="py-8 text-right text-[14px] text-[#00AEEF]">+{tableTotals.ot.toFixed(2)}</td>
                      <td className="py-8 text-right text-[17px] bg-white/5">{tableTotals.net.toFixed(2)}</td>
                      <td className="py-8 text-right text-[17px] text-[#2EBB55]">{tableTotals.paid.toFixed(2)}</td>
                      <td className="py-8 text-right text-[18px] bg-white/10 pr-12">{tableTotals.remaining.toFixed(2)} <span className="text-[11px] text-slate-400">JD</span></td>
                      <td className="py-8"></td>
                   </tr>
                </tfoot>
              </table>
          </div>
        )}

        {/* Staff performance customized with brand rank colors */}
        {activeTab === 'staff' && (
          <div className="p-16 animate-in fade-in duration-500">
            <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-12 flex items-center gap-4">
              <span className="w-2 h-10 bg-[#FFD700] rounded-full"></span>
              Performance Leaderboard
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {filteredSummaries.map((emp, i) => (
                <div key={emp.name} className="bg-white border-2 border-slate-50 hover:border-slate-200 rounded-[2rem] p-8 flex items-center justify-between transition-all group">
                   <div className="flex items-center gap-8">
                      <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-lg ${i === 0 ? 'bg-[#FFD700] text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-[#F7941D] text-white' : 'bg-slate-50 text-slate-300'}`}>
                         {i + 1}
                      </div>
                      <div className="flex flex-col">
                        <h4 className="text-xl font-black text-slate-900">{emp.name}</h4>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{emp.workDays} Shifts Completed</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#00AEEF]">+ {emp.totalOTPay.toFixed(2)} JD OT</span>
                        </div>
                      </div>
                   </div>
                   <div className="flex items-center gap-12">
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Attendance</p>
                         <p className={`text-sm font-black ${emp.totalAttendancePenalties > 0 ? 'text-[#EE1C25]' : 'text-[#2EBB55]'}`}>
                            {emp.totalAttendancePenalties > 0 ? `-${emp.totalAttendancePenalties.toFixed(2)} JD` : 'Perfect Record'}
                         </p>
                      </div>
                      <div className="text-right pr-8">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Pay</p>
                         <p className="text-2xl font-black text-slate-900">{emp.netSalary.toFixed(2)} <span className="text-xs">JD</span></p>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Manual Entry Modal Rebranded */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl animate-in zoom-in duration-300 border border-slate-100 flex overflow-hidden">
             <div className="flex-1 p-12 space-y-8">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-12 h-12 bg-[#00AEEF] text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-blue-500/20 rotate-3">+</div>
                   <h3 className="text-3xl font-black text-slate-900 tracking-tight">Manual Shift Input</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 pl-2">Staff Member</label>
                      <input list="emp-list" value={newEntry.name} onChange={(e) => setNewEntry({...newEntry, name: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold outline-none focus:border-[#00AEEF]/20" placeholder="Type name..." />
                      <datalist id="emp-list">{availableEmployees.map(n => <option key={n} value={n} />)}</datalist>
                   </div>
                   <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 pl-2">Shift Date</label>
                      <input type="date" value={newEntry.date} onChange={(e) => setNewEntry({...newEntry, date: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold outline-none" />
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                   <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 pl-2">Check In</label>
                      <input type="time" value={newEntry.checkIn} onChange={(e) => setNewEntry({...newEntry, checkIn: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold outline-none" />
                   </div>
                   <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 pl-2">Check Out</label>
                      <input type="time" value={newEntry.checkOut} onChange={(e) => setNewEntry({...newEntry, checkOut: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold outline-none" />
                   </div>
                   <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 pl-2">Paid Out (JD)</label>
                      <input type="number" value={newEntry.paid} onChange={(e) => setNewEntry({...newEntry, paid: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold outline-none" />
                   </div>
                </div>

                <div className="flex gap-4 pt-10">
                   <button onClick={() => setShowAddModal(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                   <button onClick={handleAddEntry} className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest hover:bg-[#00AEEF] transition-all shadow-xl">Confirm Entry</button>
                </div>
             </div>
             <div className="w-[380px] bg-slate-50 p-12 border-l border-slate-100 flex flex-col justify-center">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-10">Shift Projection</h4>
                {entryPreview ? (
                  <div className="space-y-8">
                     <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Shift Model</p><p className="text-2xl font-black text-[#00AEEF]">Type {entryPreview.shiftType}</p></div>
                     <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Late Penalty</p><p className={`text-2xl font-black ${entryPreview.latenessMinutes > 0 ? 'text-[#EE1C25]' : 'text-[#2EBB55]'}`}>-{entryPreview.penalty.toFixed(2)} JD</p></div>
                     <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Net Outcome</p><p className="text-4xl font-black text-slate-900">{entryPreview.netPay.toFixed(2)} <span className="text-sm">JD</span></p></div>
                     <div className="pt-8 border-t-2 border-slate-200"><p className="text-[#00AEEF] text-[10px] font-black uppercase tracking-widest mb-1">Balance Due Today</p><h5 className="text-4xl font-black text-[#00AEEF]">{entryPreview.balance.toFixed(2)} JD</h5></div>
                  </div>
                ) : <p className="text-sm font-bold text-slate-400 italic">Configure times to generate real-time logic preview.</p>}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollResults;
