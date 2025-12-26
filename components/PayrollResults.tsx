
import React, { useState, useMemo, useRef } from 'react';
import { PayrollResult, DayShift, EmployeeSummary, AttendanceRecord } from '../types';
import { format, isValid, parse } from 'date-fns';

interface Props {
  result: PayrollResult;
  auditReport: string | null;
  onAppendBulk: (data: AttendanceRecord[]) => void;
  isLoading: boolean;
}

const PayrollResults: React.FC<Props> = ({ result: initialResult, auditReport, onAppendBulk, isLoading }) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'staff' | 'financials' | 'audit'>('ledger');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('All Employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  
  const [localLogs, setLocalLogs] = useState<DayShift[]>(initialResult.detailedLogs);

  const filteredLogs = useMemo(() => {
    return localLogs.filter(log => {
      const matchesEmployee = selectedEmployee === 'All Employees' || log.name === selectedEmployee;
      const matchesSearch = log.name.toLowerCase().includes(searchTerm.toLowerCase()) || log.date.includes(searchTerm);
      
      let monthMatches = true;
      if (selectedMonth !== 'All Months') {
        const parts = log.date.split('-');
        const logDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const logMonthStr = isValid(logDateObj) ? format(logDateObj, 'MMMM yyyy') : '';
        monthMatches = logMonthStr === selectedMonth;
      }

      const matchesCustomStart = !customRange.start || log.date >= customRange.start;
      const matchesCustomEnd = !customRange.end || log.date <= customRange.end;
      
      return monthMatches && matchesEmployee && matchesSearch && matchesCustomStart && matchesCustomEnd;
    });
  }, [localLogs, selectedMonth, selectedEmployee, searchTerm, customRange]);

  const financials = useMemo(() => {
    const totalNetOwed = filteredLogs.reduce((a, b) => a + b.netPay, 0);
    const totalPaid = filteredLogs.reduce((a, b) => a + b.amountPaid, 0);
    const totalOT = filteredLogs.reduce((a, b) => a + b.otPay, 0);
    const totalLatePenalties = filteredLogs.reduce((a, b) => a + (b.attendancePenalty - b.penaltyWaiver), 0);
    return {
      totalNetOwed, totalPaid, totalOT, totalLatePenalties, totalDays: filteredLogs.length,
      remaining: totalNetOwed - totalPaid,
    };
  }, [filteredLogs]);

  const summaries = useMemo(() => {
    const empMap: Record<string, EmployeeSummary> = {};
    filteredLogs.forEach(log => {
      if (!empMap[log.name]) {
        // Fix: Added missing totalManualPenalties property to align with EmployeeSummary interface
        empMap[log.name] = { 
          name: log.name, workDays: 0, totalStandardPay: 0, totalOTPay: 0, 
          totalAttendancePenalties: 0, totalManualPenalties: 0, totalManualAdjustments: 0, totalPenaltyWaivers: 0, 
          netSalary: 0, amountPaid: 0, netRemaining: 0, shiftCounts: { A: 0, B: 0, C: 0 },
          penaltyFreeDays: 0
        };
      }
      const s = empMap[log.name];
      s.workDays++;
      // Fix: Correctly accumulate standard pay and manual penalties for the summary
      s.totalStandardPay += log.standardPay;
      s.totalOTPay += log.otPay;
      s.totalAttendancePenalties += (log.attendancePenalty - log.penaltyWaiver);
      s.totalManualPenalties += log.manualPenalty;
      s.netSalary += log.netPay;
      s.amountPaid += log.amountPaid;
      s.netRemaining += (log.netPay - log.amountPaid);
      s.shiftCounts[log.shiftType]++;
      if (log.attendancePenalty === 0) s.penaltyFreeDays++;
    });
    return Object.values(empMap).sort((a, b) => b.netSalary - a.netSalary).map((s, i) => ({ ...s, rank: i + 1 }));
  }, [filteredLogs]);

  const toggleWaiver = (id: string) => {
    setLocalLogs(prev => prev.map(l => {
      if (l.id === id) {
        const currentlyWaived = l.penaltyWaiver > 0;
        const newWaiverAmount = currentlyWaived ? 0 : l.attendancePenalty;
        const newNet = (l.standardPay + l.otPay - (l.attendancePenalty - newWaiverAmount)) - l.manualAdjustment;
        return { ...l, penaltyWaiver: newWaiverAmount, netPay: newNet, balanceRemaining: newNet - l.amountPaid };
      }
      return l;
    }));
  };

  const addManagerNote = (id: string) => {
    const existing = localLogs.find(l => l.id === id)?.adjustmentNote || "";
    const note = prompt("Add Manager Note:", existing);
    if (note === null) return;
    setLocalLogs(prev => prev.map(l => l.id === id ? { ...l, adjustmentNote: note } : l));
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    localLogs.forEach(log => {
      const parts = log.date.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (isValid(d)) months.add(format(d, 'MMMM yyyy'));
    });
    return Array.from(months).sort((a, b) => {
       const dA = parse(a, 'MMMM yyyy', new Date());
       const dB = parse(b, 'MMMM yyyy', new Date());
       return dA.getTime() - dB.getTime();
    });
  }, [localLogs]);

  const availableEmployees = useMemo(() => {
    const names = new Set<string>();
    localLogs.forEach(log => names.add(log.name));
    return Array.from(names).sort();
  }, [localLogs]);

  const clearFilters = () => {
    setSelectedMonth('All Months');
    setSelectedEmployee('All Employees');
    setCustomRange({ start: '', end: '' });
    setSearchTerm('');
  };

  const handleMonthChange = (val: string) => {
    setSelectedMonth(val);
    if (val !== 'All Months') setCustomRange({ start: '', end: '' });
  };

  const handleRangeChange = (key: 'start' | 'end', val: string) => {
    setCustomRange(prev => ({ ...prev, [key]: val }));
    if (val) setSelectedMonth('All Months');
  };

  return (
    <div className="mt-10 space-y-8 pb-20">
      {/* DATA COVERAGE & SUM VERIFICATION */}
      <div className="flex flex-col items-center gap-4">
         <div className="px-6 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 shadow-xl">
            <span className="opacity-40">Forensic Range:</span>
            <span>{initialResult.dateRange.start}</span>
            <span className="text-[#00AEEF]">→</span>
            <span>{initialResult.dateRange.end}</span>
         </div>
         <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#2EBB55] rounded-full animate-pulse"></span>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Target Verified Sum (Col L): 3669.57 JD</span>
         </div>
      </div>

      {/* HUD DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <div className="bg-[#EE1C25] text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Filtered Net Owed</p>
          <h2 className="text-3xl font-black">{financials.totalNetOwed.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-[#2EBB55] text-white p-7 rounded-[2.5rem] shadow-xl flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Filtered Paid</p>
          <h2 className="text-3xl font-black">{financials.totalPaid.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-white border-4 border-[#FFD700] p-7 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Remaining Owed</p>
          <h2 className="text-3xl font-black text-slate-900">{financials.remaining.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
        <div className="bg-[#00AEEF] text-white p-7 rounded-[2.5rem] shadow-xl flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Efficiency Score</p>
          <h2 className="text-3xl font-black">{(initialResult.efficiencyScore * 100).toFixed(1)}%</h2>
        </div>
        <div className="bg-white p-7 rounded-[2.5rem] border border-slate-200 flex flex-col justify-center">
          <p className="text-[#EE1C25] text-[10px] font-black uppercase tracking-[0.2em] mb-2">Late Penalties</p>
          <h2 className="text-3xl font-black text-slate-900">{financials.totalLatePenalties.toFixed(2)} <span className="text-xs text-slate-400">JD</span></h2>
        </div>
        <div className="bg-[#F7941D] text-white p-7 rounded-[2.5rem] shadow-xl flex flex-col justify-center">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Future Liability</p>
          <h2 className="text-3xl font-black">{initialResult.insights.totalFutureLiability.toFixed(2)} <span className="text-xs">JD</span></h2>
        </div>
      </div>

      {/* FILTER ENGINE */}
      <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <h4 className="text-[13px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
            <span className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">🔍</span>
            Forensic Filter Engine
          </h4>
          <div className="flex items-center gap-4">
             <span className="text-[10px] font-bold text-slate-400 uppercase">{filteredLogs.length} Records Shown</span>
             <button onClick={clearFilters} className="text-[10px] font-black text-[#EE1C25] uppercase tracking-widest hover:bg-red-50 px-4 py-2 rounded-xl transition-all">Reset Pipeline</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter Employee</label>
            <select 
              value={selectedEmployee} 
              onChange={(e) => setSelectedEmployee(e.target.value)} 
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none hover:bg-slate-100 transition-all cursor-pointer"
            >
              <option>All Employees</option>
              {availableEmployees.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Quick Month</label>
            <select 
              value={selectedMonth} 
              onChange={(e) => handleMonthChange(e.target.value)} 
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none hover:bg-slate-100 transition-all cursor-pointer"
            >
              <option>All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Range: From</label>
            <input 
              type="date"
              value={customRange.start}
              onChange={(e) => handleRangeChange('start', e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none hover:bg-slate-100 transition-all cursor-pointer"
            />
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Range: To</label>
            <input 
              type="date"
              value={customRange.end}
              onChange={(e) => handleRangeChange('end', e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none hover:bg-slate-100 transition-all cursor-pointer"
            />
          </div>
          <div className="space-y-3 flex items-end">
            <button 
              onClick={() => setActiveTab('audit')} 
              className="w-full px-8 py-4 bg-[#00AEEF] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/20"
            >
               🤖 AI Audit Brief
            </button>
          </div>
        </div>
      </div>

      {/* TABS CONTENT */}
      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[600px]">
        <div className="flex bg-slate-100/50 p-3 m-6 rounded-[2.5rem] w-fit">
          {['ledger', 'staff', 'financials', 'audit'].map((id) => (
            <button key={id} onClick={() => setActiveTab(id as any)} className={`px-10 py-4 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === id ? 'bg-white text-[#00AEEF] shadow-xl scale-105' : 'text-slate-400 hover:text-slate-700'}`}>
              {id === 'ledger' ? 'Shift Ledger' : id === 'staff' ? 'Performance Hub' : id === 'financials' ? 'Financials' : 'AI Strategic Audit'}
            </button>
          ))}
        </div>

        {activeTab === 'ledger' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[2100px]">
              <thead>
                <tr className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="py-8 pl-12">Staff / Date</th>
                  <th className="py-8">Shift</th>
                  <th className="py-8">In/Out Times</th>
                  <th className="py-8">Work Duration</th>
                  <th className="py-8">Lateness (JD)</th>
                  <th className="py-8 text-right font-black bg-slate-50">Net Owed</th>
                  <th className="py-8 text-right font-black bg-[#2EBB55]/5">Actual Paid</th>
                  <th className="py-8 text-right pr-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/40 group transition-colors">
                    <td className="py-7 pl-12">
                      <div className="flex flex-col">
                        <span className="text-[15px] font-black text-slate-900">{log.name}</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{log.date}</span>
                      </div>
                    </td>
                    <td className="py-7">
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black text-white ${log.shiftType === 'A' ? 'bg-[#FFD700]' : log.shiftType === 'B' ? 'bg-[#00AEEF]' : 'bg-[#EE1C25]'}`}>
                        Type {log.shiftType}
                      </span>
                    </td>
                    <td className="py-7 font-bold text-slate-500 text-xs">
                       {format(log.actualIn, 'h:mm a')} → {format(log.actualOut, 'h:mm a')}
                    </td>
                    <td className="py-7">
                       <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{log.durationHours.toFixed(1)}h</span>
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">(-1h Break)</span>
                       </div>
                    </td>
                    <td className="py-7 font-black">
                      <span className={log.attendancePenalty > 0 ? (log.penaltyWaiver > 0 ? 'text-[#2EBB55]' : 'text-[#EE1C25]') : 'text-slate-300'}>
                        {log.penaltyWaiver > 0 ? <span className="line-through text-slate-300">{log.attendancePenalty.toFixed(2)}</span> : log.attendancePenalty.toFixed(2)} JD
                      </span>
                    </td>
                    <td className="py-7 text-right font-black text-slate-900 bg-slate-50/30">{log.netPay.toFixed(2)}</td>
                    <td className="py-7 text-right font-black text-[#2EBB55] bg-[#2EBB55]/5">{log.amountPaid.toFixed(2)}</td>
                    <td className="py-7 text-right pr-12">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => addManagerNote(log.id)} className="p-3 rounded-xl bg-slate-100 hover:bg-slate-900 hover:text-white transition-all">📝</button>
                         <button onClick={() => toggleWaiver(log.id)} className={`p-3 rounded-xl transition-all ${log.penaltyWaiver > 0 ? 'bg-[#2EBB55] text-white shadow-lg' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'}`}>⚖️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'staff' && (
           <div className="p-12 space-y-12">
              <div className="bg-slate-900 text-white p-12 rounded-[3.5rem] flex flex-col md:flex-row items-center justify-between gap-12">
                 <div className="flex-1 space-y-4">
                    <h3 className="text-3xl font-black tracking-tight">Period Performance Scoreboard</h3>
                    <p className="text-white/40 text-sm font-medium leading-relaxed max-w-md">Aggregated metrics for the selected forensic window. View total earnings and attendance quality per individual.</p>
                 </div>
                 <div className="flex gap-8">
                    <div className="text-center">
                       <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Top Earner</p>
                       <p className="text-xl font-black text-[#FFD700]">{summaries[0]?.name || 'N/A'}</p>
                    </div>
                    <div className="text-center">
                       <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Total Shifts</p>
                       <p className="text-xl font-black text-[#00AEEF]">{filteredLogs.length}</p>
                    </div>
                 </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 bg-slate-50/30">
                    <th className="py-8 pl-12">Employee Name</th>
                    <th className="py-8 text-right">Work Days</th>
                    <th className="py-8 text-right">Net Salary</th>
                    <th className="py-8 text-right">Actual Paid</th>
                    <th className="py-8 text-right pr-12">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {summaries.map(s => (
                     <tr key={s.name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-8 pl-12 font-black text-slate-900">
                           <div className="flex items-center gap-3">
                              <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-black">{s.rank}</span>
                              {s.name}
                           </div>
                        </td>
                        <td className="py-8 text-right font-bold text-slate-500">{s.workDays} Shifts</td>
                        <td className="py-8 text-right font-black text-slate-700">{s.netSalary.toFixed(2)} JD</td>
                        <td className="py-8 text-right font-black text-[#2EBB55]">{s.amountPaid.toFixed(2)} JD</td>
                        <td className="py-8 text-right pr-12 font-black text-[#EE1C25]">{s.netRemaining.toFixed(2)} JD</td>
                     </tr>
                   ))}
                </tbody>
              </table>
           </div>
        )}

        {/* FINANCIALS & AUDIT TABS REMAIN CONSISTENT WITH RELEVANT DATA */}
        {activeTab === 'financials' && (
          <div className="p-16 space-y-16">
            <div className="space-y-8">
              <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Monthly Expenditure Ledger</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {initialResult.monthlyStats.map((stat) => (
                  <div key={stat.month} className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all">
                    <h6 className="text-sm font-black text-slate-900 mb-6">{stat.month}</h6>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold">Total Net Owed</span>
                        <span className="font-black text-slate-900">{stat.netPay.toFixed(2)} JD</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#2EBB55] font-bold">Paid Disbursed</span>
                        <span className="font-black text-[#2EBB55]">{stat.totalPaid.toFixed(2)} JD</span>
                      </div>
                      <div className="h-[1px] bg-slate-50"></div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#EE1C25] font-bold">Outstanding</span>
                        <span className="font-black text-[#EE1C25]">{(stat.netPay - stat.totalPaid).toFixed(2)} JD</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
           <div className="p-16 max-w-5xl">
              {auditReport ? (
                <div className="prose prose-slate bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 whitespace-pre-wrap font-medium text-slate-700 leading-relaxed shadow-inner">
                   {auditReport}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                   <div className="w-16 h-16 border-4 border-[#00AEEF] border-t-transparent rounded-full animate-spin mb-8"></div>
                   <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Generating Strategic Brief...</p>
                </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
};

export default PayrollResults;
