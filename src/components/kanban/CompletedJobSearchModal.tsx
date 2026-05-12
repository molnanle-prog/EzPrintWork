
import React, { useState, useEffect } from 'react';
// FIX: Removed JobStatus, added JobStatusDefinition
import { Job, JobStatusDefinition } from '../../types';
import { db } from '../../services/dataService';
import { X, Search, Calendar, User, FileText, ArrowRight } from 'lucide-react';

interface CompletedJobSearchModalProps {
  onClose: () => void;
  onSelectJob: (job: Job) => void;
}

export const CompletedJobSearchModal: React.FC<CompletedJobSearchModalProps> = ({ onClose, onSelectJob }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Job[]>([]);
  // FIX: Add state for status definitions to show labels
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);

  useEffect(() => {
    // FIX: Load status definitions
    setStatusDefinitions(db.getStatusDefinitions());
    if (query.length >= 2) {
       const allFound = db.searchJobs(query);
       setResults(allFound); 
    } else {
        setResults([]);
    }
  }, [query]);

  // FIX: Helper to get status label
  const getStatusLabel = (key: string) => {
    return statusDefinitions.find(s => s.key === key)?.label || key;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Search className="text-blue-600" />
                    작업 이력 통합 검색
                </h3>
                <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors"><X className="text-slate-500" /></button>
            </div>
            <div className="p-4 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                    <input 
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 placeholder-slate-400"
                        placeholder="고객명, 작업명, 전화번호로 검색..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50 custom-scrollbar">
                {results.length === 0 && query.length > 0 && (
                    <div className="text-center text-slate-400 py-10">검색 결과가 없습니다.</div>
                )}
                {results.length === 0 && query.length === 0 && (
                     <div className="text-center text-slate-400 py-10 flex flex-col items-center gap-2">
                        <Search size={32} className="opacity-20" />
                        <span>2글자 이상 입력하여 검색하세요.</span>
                        <span className="text-xs text-slate-300">완료된 작업을 포함한 모든 이력을 검색합니다.</span>
                     </div>
                )}
                {results.map(job => (
                    <div 
                        key={job.id} 
                        onClick={() => onSelectJob(job)}
                        className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group"
                    >
                        <div className="flex justify-between items-start mb-2">
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${job.status === 'DELIVERY' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'}`}>
                                    {/* FIX: Show label instead of key */}
                                    {getStatusLabel(job.status)}
                                </span>
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                    <User size={12} className="text-slate-400"/> {job.clientName}
                                </span>
                             </div>
                             <span className="text-xs text-slate-400">{new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-bold text-base text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">{job.title}</h4>
                        <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                             <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{job.specs.paperType}</span>
                             <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{job.specs.size}</span>
                             <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{job.specs.quantity}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                             <span className="text-xs text-slate-400">{job.clientPhone}</span>
                             <button className="text-xs flex items-center gap-1 text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                                상세보기 <ArrowRight size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};
