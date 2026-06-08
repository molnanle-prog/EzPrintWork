
import React, { useState } from 'react';
import { X, Server, FolderOpen, RefreshCw, Search, CheckCircle2, XCircle, HardDrive, FileJson, FilePlus } from 'lucide-react';
import { db } from '../../services/dataService';

interface NetworkPathPickerProps {
  onClose: () => void;
  onSelect: (path: string) => void;
}

export const NetworkPathPicker: React.FC<NetworkPathPickerProps> = ({ onClose, onSelect }) => {
  const [path, setPath] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [isPickerOpening, setIsPickerOpening] = useState(false);

  // 환경 감지
  const isElectron = typeof window !== 'undefined' && !!window.electron;

  const handleOpenFolderPicker = async () => {
      // 1. Electron Desktop App Environment
      if (isElectron && window.electron?.selectDirectory) {
          setIsPickerOpening(true);
          try {
              const selectedPath = await window.electron.selectDirectory();
              if (selectedPath) {
                  setPath(selectedPath);
                  setTestStatus('idle');
              }
          } catch (e) {
              console.error("파일 선택 중 오류:", e);
              alert('파일 선택 창을 여는 중 오류가 발생했습니다.');
          } finally {
              setIsPickerOpening(false);
          }
      } 
      // 2. Web Browser Fallback (자동완성)
      else {
          const mockPath = "Z:\\Shared_Data\\pm_db_v2.json";
          if (confirm(`[웹 테스트 모드] 가상 데이터 파일 경로 '${mockPath}'를 입력하시겠습니까?`)) {
              setPath(mockPath);
              setTestStatus('idle');
          }
      }
  };

  const handleCreateFile = async () => {
      if (!isElectron || !window.electron?.createDatabaseFile) {
          alert('이 기능은 데스크탑 앱 환경에서만 지원됩니다.');
          return;
      }

      setIsPickerOpening(true);
      try {
          const currentData = db.exportData(); 
          const newPath = await window.electron.createDatabaseFile(currentData);
          
          if (newPath) {
              setPath(newPath);
              setTestStatus('idle');
              alert('새 데이터 파일이 생성되었습니다. [연결] 버튼을 눌러주세요.');
          }
      } catch (e) {
          console.error("파일 생성 실패:", e);
          alert('파일 생성 중 오류가 발생했습니다.');
      } finally {
          setIsPickerOpening(false);
      }
  };

  const handleTestConnection = async () => {
    if (!path) {
        alert('데이터 파일 경로를 선택하거나 입력해주세요.');
        return;
    }
    
    setTestStatus('checking');
    
    if (isElectron && window.electron) {
        const exists = await window.electron.exists(path);
        if (exists) {
            setTestStatus('success');
            // Auto connect after short delay if success
            setTimeout(() => {
                onSelect(path);
                onClose();
            }, 1000);
        } else {
            setTestStatus('error');
        }
    } else {
        // Web Fallback (Simulated)
        setTimeout(() => {
            if (path.length > 2) {
                setTestStatus('success');
                // Mock notification
                // alert("가상 서버에 연결되었습니다. 테스트용 데이터를 불러옵니다.");
                setTimeout(() => {
                    onSelect(path);
                    onClose();
                }, 1000);
            } else {
                setTestStatus('error');
            }
        }, 800);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-lg">
            <Server className="text-blue-600 dark:text-blue-400" />
            데이터 저장소 연결 (NAS)
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-8">
            <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xl shrink-0 shadow-sm">
                    1
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1">데이터 파일 선택 또는 생성</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        공유 폴더 안에 있는 <strong>.json 데이터 파일</strong>을 선택하거나, 새로 생성하세요.<br/>
                        <span className="text-xs text-blue-500 font-bold">예: \\NAS\Data\pm_db_v2.json</span>
                    </p>
                </div>
            </div>

            <div className="pl-16">
                <div className="flex gap-2">
                    <div className="relative flex-1 group">
                        <FileJson className="absolute left-3 top-3.5 text-slate-400 z-10" size={20} />
                        <input 
                            type="text"
                            value={path}
                            readOnly={isElectron} // 앱에서는 탐색기만 허용, 웹에서는 입력 허용
                            onClick={isElectron ? handleOpenFolderPicker : undefined}
                            onChange={(e) => !isElectron && setPath(e.target.value)}
                            className={`w-full pl-10 pr-36 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono transition-colors focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-sm shadow-sm
                                ${isElectron ? 'cursor-pointer hover:border-blue-500 dark:hover:border-blue-400' : ''}`}
                            placeholder={isElectron ? "파일 선택 또는 생성..." : "웹 테스트: 경로 직접 입력"}
                        />
                        <div className="absolute right-1 top-1 flex gap-1 h-9">
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenFolderPicker(); }}
                                disabled={isPickerOpening}
                                className="px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-600 rounded-lg transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait z-20"
                            >
                                {isPickerOpening ? <RefreshCw size={14} className="animate-spin"/> : <Search size={14} />}
                                <span className="text-xs font-bold whitespace-nowrap">찾기</span>
                            </button>
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleCreateFile(); }}
                                disabled={isPickerOpening}
                                className="px-3 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-1 disabled:opacity-70 disabled:cursor-wait z-20"
                            >
                                <FilePlus size={14} />
                                <span className="text-xs font-bold whitespace-nowrap">생성</span>
                            </button>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testStatus === 'checking' || !path}
                        className={`px-6 rounded-xl font-bold text-white shadow-md transition-all flex items-center gap-2 min-w-[110px] justify-center
                            ${testStatus === 'success' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600'}
                            disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                    >
                        {testStatus === 'checking' ? <RefreshCw className="animate-spin" size={18}/> : 
                         testStatus === 'success' ? <CheckCircle2 size={18}/> : <HardDrive size={18}/>}
                        {testStatus === 'success' ? '완료' : '연결'}
                    </button>
                </div>
                
                {/* Status Messages */}
                <div className="mt-4 min-h-[24px]">
                    {testStatus === 'checking' && (
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-bold flex items-center gap-2 animate-in fade-in">
                            <RefreshCw size={14} className="animate-spin"/> 경로를 확인하고 있습니다...
                        </span>
                    )}
                    {testStatus === 'success' && (
                        <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-left-2">
                            <CheckCircle2 size={16} /> 연결 성공! 데이터를 불러옵니다...
                        </span>
                    )}
                    {testStatus === 'error' && (
                        <span className="text-red-500 dark:text-red-400 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-left-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800">
                            <XCircle size={16} /> 파일에 접근할 수 없습니다. 경로가 존재하지 않거나 권한이 없습니다.
                        </span>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
