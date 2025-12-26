
import React, { useRef, useState, useEffect } from 'react';
import { AttendanceRecord, ColumnMapping } from '../types';

interface Props {
  onDataReady: (data: AttendanceRecord[], mapping: ColumnMapping) => void;
  isLoading: boolean;
  onCloudSync: () => void;
}

const FileUploader: React.FC<Props> = ({ onDataReady, isLoading, onCloudSync }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'map'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<AttendanceRecord[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [autoLoadStatus, setAutoLoadStatus] = useState<{ type: 'success' | 'error' | 'none'; message: string }>({ type: 'none', message: '' });
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '', date: '', checkIn: '', checkOut: '', paid: ''
  });

  const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
    const result = []; let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuote = !inQuote;
      else if (char === delimiter && !inQuote) { result.push(cur.trim()); cur = ""; }
      else { cur += char; }
    }
    result.push(cur.trim());
    return result;
  };

  const processCsvContent = (csvText: string) => {
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return;
    let delimiter = ',';
    let rawHeaders = parseCSVLine(lines[0], ',');
    if (rawHeaders.length < 2) {
      const semiHeaders = parseCSVLine(lines[0], ';');
      if (semiHeaders.length > rawHeaders.length) { delimiter = ';'; rawHeaders = semiHeaders; }
    }
    const data: AttendanceRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      const record: any = {};
      rawHeaders.forEach((rawHeader, index) => { if (rawHeader) record[rawHeader] = (values[index] || '').trim(); });
      data.push(record);
    }
    const guess: ColumnMapping = { name: '', date: '', checkIn: '', checkOut: '', paid: '' };
    rawHeaders.forEach(h => {
      const hl = h.toLowerCase().trim();
      if (hl === 'name') guess.name = h;
      else if (hl === 'date') guess.date = h;
      else if (hl === 'check in' || hl === 'arrival') guess.checkIn = h;
      else if (hl === 'check out' || hl === 'departure') guess.checkOut = h;
      else if (hl === 'paid') guess.paid = h;
    });
    setHeaders(rawHeaders); setRawData(data); setMapping(guess); setStep('map');
  };

  useEffect(() => {
    const autoLoad = async () => {
      setIsAutoLoading(true);
      try {
        const response = await fetch('data.csv');
        if (response.ok) {
          const text = await response.text();
          processCsvContent(text);
          setAutoLoadStatus({ type: 'success', message: 'Peekaboo standard data source detected.' });
        } else { setAutoLoadStatus({ type: 'error', message: 'Manual upload required.' }); }
      } catch (err) { setAutoLoadStatus({ type: 'error', message: 'Ready for ingestion.' }); }
      finally { setIsAutoLoading(false); }
    };
    autoLoad();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => processCsvContent(event.target?.result as string);
    reader.readAsText(file);
  };

  if (step === 'map') {
    return (
      <div className="bg-white border-2 border-slate-100 rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in duration-300">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Data Integrity Check</h3>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Found {rawData.length} Staff Attendance Entries</p>
          </div>
          <button onClick={() => setStep('upload')} className="text-[11px] font-black text-[#00AEEF] uppercase tracking-widest border-2 border-blue-50 py-3 px-6 rounded-2xl hover:bg-blue-50 transition-all">Restart</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          {(['name', 'date', 'checkIn', 'checkOut', 'paid'] as const).map((field) => (
            <div key={field} className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 pl-2">{field === 'checkIn' ? 'Arrival' : field === 'checkOut' ? 'Departure' : field === 'paid' ? 'Paid Today' : field}</label>
              <select value={mapping[field]} onChange={(e) => setMapping({...mapping, [field]: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] text-sm font-black text-slate-800 focus:border-[#00AEEF]/30 outline-none transition-all cursor-pointer hover:bg-white appearance-none">
                <option value="">Select Column</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button onClick={() => onDataReady(rawData, mapping)} disabled={isLoading} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs hover:bg-[#00AEEF] shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-4">
          {isLoading ? 'Processing Peekaboo Logic...' : 'Run Forensic Pipeline'}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 relative flex flex-col items-center justify-center p-20 border-4 border-dashed border-slate-200 rounded-[4rem] bg-white hover:border-[#00AEEF] hover:bg-blue-50/10 transition-all cursor-pointer group shadow-inner"
             onClick={() => !isLoading && fileInputRef.current?.click()}>
          <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
          {isLoading ? (
            <div className="flex flex-col items-center py-6">
               <div className="w-16 h-16 border-4 border-[#00AEEF] border-t-transparent rounded-full animate-spin mb-8"></div>
               <p className="text-[11px] font-black text-[#00AEEF] uppercase tracking-[0.4em]">Synching Records...</p>
            </div>
          ) : (
            <>
              <div className="w-28 h-28 bg-slate-50 text-slate-900 rounded-[2.5rem] flex items-center justify-center mb-10 group-hover:scale-110 group-hover:bg-[#00AEEF] group-hover:text-white transition-all shadow-lg border border-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Ingest Attendance Ledger</h3>
              <p className="text-sm text-slate-400 mt-4 text-center max-w-md font-bold uppercase tracking-widest leading-relaxed">Drop CSV exports from biometric or manual logs</p>
            </>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <button 
            onClick={onCloudSync}
            disabled={isLoading}
            className="flex-1 bg-[#00AEEF] text-white p-12 rounded-[4rem] flex flex-col items-center justify-center gap-6 group hover:bg-[#008cc1] transition-all shadow-xl shadow-blue-500/10 disabled:opacity-50"
          >
            <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
            </div>
            <div className="text-center">
              <h4 className="text-2xl font-black tracking-tight">Sync Cloud</h4>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mt-1">Google Sheets Data Link</p>
            </div>
          </button>
        </div>
      </div>

      {autoLoadStatus.type !== 'none' && (
        <div className={`p-6 rounded-[2rem] flex items-center gap-4 animate-in fade-in slide-in-from-top-4 border ${autoLoadStatus.type === 'success' ? 'bg-[#2EBB55]/10 text-[#2EBB55] border-[#2EBB55]/20 shadow-xl shadow-[#2EBB55]/5' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
          <div className={`w-3 h-3 rounded-full ${autoLoadStatus.type === 'success' ? 'bg-[#2EBB55] animate-pulse' : 'bg-slate-400'}`}></div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em]">{autoLoadStatus.message}</span>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
