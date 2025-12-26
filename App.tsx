
import React, { useState, useEffect } from 'react';
import { processPayroll } from './services/payrollProcessor';
import { getPayrollAudit } from './services/geminiService';
import { AttendanceRecord, PayrollResult, ColumnMapping, CleansingLog } from './types';
import FileUploader from './components/FileUploader';
import PayrollResults from './components/PayrollResults';

const STORAGE_KEY = 'peekaboo_master_db_v7';
const MAPPING_KEY = 'peekaboo_mapping_v7';
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vROMiBMAzT_0tDRJHOQZrzyDAcyQ2ZC3OyFbDlJVtVdkSMKIiZli2GEUtR0KTNQNkQXIJVVutaTjj-g/pub?output=csv";

// --- STRICT COLUMN MAPPING (Aligned with Peekaboo Jordan Google Sheet) ---
const FORCE_MAPPING: ColumnMapping = {
  name: "Employee_Name",
  date: "Date",
  checkIn: "Check_In",
  checkOut: "Check_Out",
  paid: "Paid",
  penalty: "Penalty" // Column K
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [masterRawData, setMasterRawData] = useState<AttendanceRecord[]>([]);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping>(FORCE_MAPPING);
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; logs?: CleansingLog[] } | null>(null);

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setMasterRawData(parsed);
        handleDataReady(parsed, FORCE_MAPPING, false);
      } catch (e) {
        handleCloudSync();
      }
    } else {
      handleCloudSync();
    }
  }, []);

  const parseCSV = (csvText: string): { headers: string[], data: AttendanceRecord[] } => {
    const cleanText = csvText.replace(/^\uFEFF/, '').trim();
    if (cleanText.toLowerCase().startsWith('<!doctype') || cleanText.toLowerCase().startsWith('<html')) {
      throw new Error("ACCESS DENIED: Google Sheet is not publicly published. Use 'Publish to Web' as CSV.");
    }

    const allLines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (allLines.length < 2) throw new Error("EMPTY DATA: Spreadsheet contains no records.");

    const splitLine = (line: string) => {
      const result = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuote && line[i+1] === '"') { cur += '"'; i++; } 
          else inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          result.push(cur.trim());
          cur = "";
        } else cur += char;
      }
      result.push(cur.trim());
      return result;
    };

    const headers = splitLine(allLines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    const data: AttendanceRecord[] = [];
    for (let i = 1; i < allLines.length; i++) {
      const values = splitLine(allLines[i]);
      if (values.length < 2) continue;
      const record: any = {};
      headers.forEach((h, index) => {
        if (h) record[h] = (values[index] || '').replace(/^"|"$/g, '').trim();
      });
      data.push(record);
    }
    return { headers, data };
  };

  const handleCloudSync = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const syncUrl = `${GOOGLE_SHEET_CSV_URL}&cache_bust=${Date.now()}`;
      const res = await fetch(syncUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fetch failed (Status ${res.status})`);
      
      const csvText = await res.text();
      const { data } = parseCSV(csvText);
      await handleDataReady(data, FORCE_MAPPING, false);
    } catch (err: any) {
      setError({ message: err.message || "Cloud Synchronization Failed." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDataReady = async (data: AttendanceRecord[], mapping: ColumnMapping, isAppend: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      let finalData = data;
      if (isAppend && masterRawData.length > 0) {
        const recordMap = new Map<string, AttendanceRecord>();
        [...masterRawData, ...data].forEach(rec => {
          const n = rec[mapping.name]?.toLowerCase().trim();
          const d = rec[mapping.date]?.trim();
          if (n && d) recordMap.set(`${n}|${d}`, rec);
        });
        finalData = Array.from(recordMap.values());
      }

      const payrollResult = processPayroll(finalData, mapping);
      if (payrollResult.detailedLogs.length === 0) {
        throw new Error("FORENSIC ZERO: No valid attendance logs found. Verify column headers in Google Sheet.");
      }

      setMasterRawData(finalData);
      setCurrentMapping(mapping);
      setResult(payrollResult);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalData));
      localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
      
      const audit = await getPayrollAudit(payrollResult);
      setAuditReport(audit);
    } catch (err: any) {
      setError({ message: err.message || "Engine Error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm("Reset local vault?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const PeekabooLogo = () => (
    <div className="flex flex-col group cursor-pointer" onClick={() => window.location.reload()}>
      <div className="flex items-center gap-0 font-black text-5xl tracking-tighter select-none">
        <span className="text-[#FFD700]">P</span><span className="text-[#EE1C25]">E</span><span className="text-[#EE1C25]">E</span><span className="text-[#2EBB55]">K</span><span className="text-[#00AEEF]">A</span><span className="text-[#FFD700]">B</span><span className="text-[#EE1C25]">O</span><span className="text-[#F7941D]">O</span>
      </div>
      <div className="flex items-center gap-2 mt-[-4px] ml-1">
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 group-hover:text-slate-900 transition-colors">Jordan</span>
        <div className="flex gap-1 opacity-50 group-hover:opacity-100">
           <span className="text-red-500">🐾</span><span className="text-yellow-500">🐾</span><span className="text-green-500">🐾</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-12">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-16 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <PeekabooLogo />
          <div className="flex flex-wrap items-center gap-4">
             <button onClick={handleCloudSync} disabled={isLoading} className="bg-white p-5 rounded-[2rem] border border-[#00AEEF]/20 shadow-sm flex items-center gap-4 px-8 text-[#00AEEF] hover:bg-[#00AEEF] hover:text-white transition-all group disabled:opacity-50">
                <div className={`w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-[#00AEEF] font-bold group-hover:bg-white/20 transition-all ${isLoading ? 'animate-spin' : ''}`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
                </div>
                <div><p className="text-[9px] font-black uppercase tracking-widest mb-0.5 opacity-60">Synchronized</p><p className="text-sm font-black">Refresh Ledger</p></div>
             </button>
             <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 px-8 group">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-[#2EBB55] group-hover:text-white transition-all shadow-inner">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                </div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase mb-0.5 tracking-widest">Database</p><p className="text-sm font-black text-slate-900">{masterRawData.length} Records</p></div>
             </div>
             {masterRawData.length > 0 && (
               <button onClick={handleReset} className="bg-white p-5 rounded-[2rem] border border-red-50 shadow-sm flex items-center gap-4 px-8 text-red-500 hover:bg-red-500 hover:text-white transition-all group">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-500 font-bold group-hover:bg-white/20">🗑</div>
                  <div><p className="text-[9px] font-black uppercase tracking-widest mb-0.5 opacity-60">Vault</p><p className="text-sm font-black">Clear Session</p></div>
               </button>
             )}
          </div>
        </header>

        {error && (
          <div className="mb-12 p-10 bg-white border border-red-100 rounded-[3rem] shadow-2xl shadow-red-500/5 animate-in slide-in-from-top-4">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-red-500 text-white rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-lg rotate-3 shadow-red-500/20">!</div>
              <div className="flex-1">
                <h4 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Forensic Pipeline Warning</h4>
                <p className="text-base font-medium text-slate-500 leading-relaxed">{error.message}</p>
                <div className="mt-6 flex gap-4">
                  <button onClick={handleCloudSync} className="text-[11px] font-black bg-slate-900 text-white px-8 py-4 rounded-2xl uppercase tracking-widest hover:bg-slate-800 transition-all">Retry Sync</button>
                  <button onClick={() => setError(null)} className="text-[11px] font-black text-slate-400 px-8 py-4 rounded-2xl uppercase tracking-widest border border-slate-100 hover:bg-slate-50 transition-all">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="mb-12">
          {isLoading && !result ? (
            <div className="flex flex-col items-center justify-center py-48 animate-in fade-in duration-500">
               <div className="w-24 h-24 border-[10px] border-[#00AEEF] border-t-transparent rounded-full animate-spin mb-10"></div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tight">Accessing Peekaboo Vault...</h2>
               <p className="text-slate-400 font-bold uppercase tracking-[0.4em] mt-6 text-[10px] animate-pulse">Establishing Secure Connection</p>
            </div>
          ) : !result ? (
            <FileUploader onDataReady={(data, mapping) => handleDataReady(data, mapping, false)} isLoading={isLoading} onCloudSync={handleCloudSync} />
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <PayrollResults result={result} auditReport={auditReport} onAppendBulk={(data) => handleDataReady(data, currentMapping, true)} isLoading={isLoading} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default App;
