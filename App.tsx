
import React, { useState } from 'react';
import { processPayroll } from './services/payrollProcessor';
import { getPayrollAudit } from './services/geminiService';
import { AttendanceRecord, PayrollResult, ColumnMapping, CleansingLog } from './types';
import FileUploader from './components/FileUploader';
import PayrollResults from './components/PayrollResults';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; logs?: CleansingLog[] } | null>(null);

  const handleDataReady = async (data: AttendanceRecord[], mapping: ColumnMapping) => {
    setIsLoading(true);
    setResult(null);
    setAuditReport(null);
    setError(null);

    try {
      const payrollResult = processPayroll(data, mapping);
      if (payrollResult.detailedLogs.length === 0) {
        throw { 
          message: "Zero valid attendance records found. Your date or time formats might not be recognized.",
          logs: payrollResult.cleansingLogs 
        };
      }
      setResult(payrollResult);
      const audit = await getPayrollAudit(payrollResult);
      setAuditReport(audit);
    } catch (err: any) {
      console.error("Payroll Processing Failed", err);
      setError({
        message: err.message || "Unknown processing error. Verify your CSV mapping.",
        logs: err.logs
      });
    } finally {
      setIsLoading(false);
    }
  };

  const PeekabooLogo = () => (
    <div className="flex flex-col">
      <div className="flex items-center gap-0 font-black text-5xl tracking-tighter cursor-default select-none">
        <span className="text-[#FFD700]">P</span>
        <span className="text-[#EE1C25]">E</span>
        <span className="text-[#EE1C25]">E</span>
        <span className="text-[#2EBB55]">K</span>
        <span className="text-[#00AEEF]">A</span>
        <span className="text-[#FFD700]">B</span>
        <span className="text-[#EE1C25]">O</span>
        <span className="text-[#F7941D]">O</span>
      </div>
      <div className="flex items-center gap-2 mt-[-4px] ml-1">
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Jordan</span>
        <div className="flex gap-1">
           <span className="text-red-500">🐾</span>
           <span className="text-yellow-500">🐾</span>
           <span className="text-green-500">🐾</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-12 selection:bg-blue-100 selection:text-blue-900">
      <div className="max-w-[1600px] mx-auto">
        {/* Peekaboo Branded Header */}
        <header className="mb-16 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <PeekabooLogo />
          
          <div className="flex flex-wrap items-center gap-4">
             <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 px-8 group hover:shadow-md transition-all">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5 tracking-widest">Internal Security</p>
                  <p className="text-sm font-black text-slate-900">Payroll Engine Pro v2.5</p>
                </div>
             </div>
             <div className="bg-slate-900 p-5 rounded-[2rem] shadow-xl flex items-center gap-4 px-8 text-white">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white font-bold">JD</div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Currency Base</p>
                   <p className="text-sm font-black">Jordanian Dinar</p>
                </div>
             </div>
          </div>
        </header>

        {error && (
          <div className="mb-12 p-10 bg-white border border-red-100 rounded-[3rem] shadow-2xl shadow-red-500/5 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-6 mb-8">
              <div className="w-16 h-16 bg-red-500 text-white rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-lg rotate-3 shadow-red-500/20 shrink-0">!</div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Pipeline Processing Alert</h4>
                <p className="text-base font-medium text-slate-500">{error.message}</p>
              </div>
            </div>
            {error.logs && error.logs.length > 0 && (
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Internal Diagnostics:</p>
                <div className="space-y-3">
                  {error.logs.slice(0, 5).map((log, i) => (
                    <div key={i} className="flex gap-4 text-xs font-bold font-mono p-3 bg-white rounded-xl border border-slate-100">
                      <span className="text-blue-500 shrink-0">[{log.type}]</span>
                      <span className="text-slate-600">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <section className="mb-12">
          <FileUploader onDataReady={handleDataReady} isLoading={isLoading} />
        </section>

        {result && (
          <section className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            <PayrollResults result={result} auditReport={auditReport} />
          </section>
        )}

        {!result && !isLoading && (
          <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 opacity-80 pb-20">
            {[
              { color: 'bg-red-50 text-red-600', title: "Smart Penalty Logic", desc: "Automated deductions for 10m, 20m, and 60m lateness based on Jordan labor standards." },
              { color: 'bg-green-50 text-green-600', title: "Overtime Accelerator", desc: "Instantly identifies hours past the 9-hour shift mark and applies the 1.56 JD OT rate." },
              { color: 'bg-blue-50 text-blue-600', title: "Flexible Shifts", desc: "Intelligently identifies Shift A, B, or C based on arrival patterns and weekend rules." }
            ].map((tip, i) => (
              <div key={i} className="bg-white p-12 rounded-[3rem] border border-slate-200 hover:border-blue-200 transition-all shadow-sm hover:shadow-xl group">
                <div className={`w-14 h-14 ${tip.color} rounded-2xl flex items-center justify-center mb-8 font-black text-xl group-hover:scale-110 transition-all shadow-inner`}>{i+1}</div>
                <h4 className="font-black text-slate-900 uppercase tracking-[0.2em] text-[11px] mb-4">{tip.title}</h4>
                <p className="text-sm font-medium text-slate-500 leading-relaxed">{tip.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
