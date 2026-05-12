
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { NasConfig } from '../../types';
import { Server, CheckCircle2, XCircle, RefreshCw, FolderOpen, Save, Search, Info, AlertTriangle, FileJson, FilePlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const NasManager: React.FC = () => {
  const [config, setConfig] = useState<NasConfig>({ isEnabled: false, path: '', status: 'disconnected' });
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPickerOpening, setIsPickerOpening] = useState(false);
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.id === 'admin';

  // 환경 감지
  const isElectron = typeof window !== 'undefined' && !!window.electron;

  useEffect(() => {
    const currentConfig = db.getNasConfig();
    setConfig(currentConfig);
    if (currentConfig.isEnabled && currentConfig.status === 'connected') {
        setStatus('success');
    }
  }, []);

  const handleOpenFolderPicker = async () => {
      if (isElectron && window.electron?.selectDirectory) {
          setIsPickerOpening(true);
          try {
              const path = await window.electron.selectDirectory();
              if (path) {
                  setConfig({ ...config, path, status: 'disconnected' });
                  setStatus('idle');
              }
          } catch (e) {
              console.error("[NasManager] 파일 선택 중 오류 발생:", e);
              alert('파일 선택 창을 여는 중 오류가 발생했습니다.');
          } finally {
              setIsPickerOpening(false);
          }
      } 
      else {
          const mockPath = "C:\\EzPrintWork_TestData\\ezpw_db_v2.json";
          if (confirm(`[웹 테스트 모드]\n실제 파일 선택은 데스크탑 앱에서만 가능합니다.\n\n테스트를 위해 가상 파일 경로 '${mockPath}'를 입력하시겠습니까?`)) {
              setConfig({ ...config, path: mockPath, status: 'disconnected' });
              setStatus('idle');
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
          const currentData = db.exportData(); // 현재 메모리의 데이터를 초기값으로 사용
          const newPath = await window.electron.createDatabaseFile(currentData);
          
          if (newPath) {
              setConfig({ ...config, path: newPath, status: 'disconnected' });
              setStatus('idle');
              alert(`새 데이터 파일이 생성되었습니다.\n${newPath}\n\n[연결 및 저장] 버튼을 눌러 동기화를 시작하세요.`);
          }
      } catch (e) {
          console.error("파일 생성 실패:", e);
          alert('파일 생성 중 오류가 발생했습니다.');
      } finally {
          setIsPickerOpening(false);
      }
  };

  const handleSaveAndConnect = async () => {
    if (!config.path) {
        alert('NAS 경로를 선택하거나 입력해주세요.');
        return;
    }
    
    // Validate path looks somewhat like a path
    if (config.path.length < 3) {
        alert('유효한 경로를 입력해주세요.');
        return;
    }

    setStatus('saving');
    setErrorMessage('');

    try {
        // This smart function handles connecting to existing data or initializing new data.
        await db.saveNasConfig(config);
        
        // After the operation, check the result from the source of truth (dataService).
        const syncStatus = db.getSyncStatus();
        const finalConfig = db.getNasConfig();

        if (syncStatus === 'synced' && finalConfig.status === 'connected') {
            setStatus('success');
            setConfig(finalConfig); // Re-fetch config to get updated status
            alert('연결 성공! 선택하신 데이터 파일을 불러왔습니다.');
        } else {
            setStatus('error');
            setErrorMessage('저장/동기화에 실패했습니다. 폴더 권한, 네트워크 상태 또는 경로를 다시 확인해주세요.');
        }
    } catch (e: any) {
        setStatus('error');
        setErrorMessage(`오류 발생: ${e.message}`);
        console.error(e);
    }
  };


  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-3xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
         <Server className="text-blue-600 dark:text-blue-400" />
         NAS 서버 / 네트워크 연결 설정
      </h3>

      <div className="space-y-8">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
              <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-lg shrink-0">1</div>
                  <div className="flex-1">
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">데이터 파일 선택 또는 생성</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          NAS/공유 폴더 내의 <strong>JSON 데이터 파일</strong>을 선택하거나, 새로 생성하세요.<br/>
                      </p>
                  </div>
              </div>

              <div className="pl-14">
                  <div className="flex gap-2">
                      <div className="relative flex-1 group">
                        <FileJson className="absolute left-3 top-3 text-slate-400 z-10" size={20} />
                        <input 
                            type="text"
                            value={config.path}
                            readOnly={isElectron}
                            onClick={isElectron ? handleOpenFolderPicker : undefined}
                            onChange={(e) => !isElectron && setConfig({ ...config, path: e.target.value, status: 'disconnected' })}
                            className={`w-full pl-10 pr-48 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono transition-colors focus:ring-2 focus:ring-blue-500 outline-none
                                ${isElectron ? 'cursor-pointer hover:border-blue-500 dark:hover:border-blue-400' : ''}`}
                            placeholder={isElectron ? "파일을 선택하거나 생성하세요" : "공유 폴더 경로 (예: \\\\Server\\Data 또는 /Volumes/Data)"}
                        />
                        <div className="absolute right-1 top-1 flex gap-1 h-9">
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenFolderPicker(); }}
                                disabled={isPickerOpening}
                                className="px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-600 rounded-md transition-colors shadow-sm flex items-center gap-1 disabled:opacity-70 disabled:cursor-wait"
                                title="기존 파일 찾기"
                            >
                                {isPickerOpening ? <RefreshCw size={14} className="animate-spin"/> : <Search size={14} />}
                                <span className="text-xs font-bold px-1">찾기</span>
                            </button>
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleCreateFile(); }}
                                disabled={isPickerOpening}
                                className="px-3 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-700 rounded-md transition-colors shadow-sm flex items-center gap-1 disabled:opacity-70 disabled:cursor-wait"
                                title="새 데이터 파일 생성"
                            >
                                <FilePlus size={14} />
                                <span className="text-xs font-bold px-1">생성</span>
                            </button>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
          
          <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
              <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-lg shrink-0">2</div>
                  <div className="flex-1">
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">연결 및 동기화</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          선택한 파일을 불러와 시스템에 적용하고 실시간 동기화를 시작합니다.
                      </p>
                  </div>
              </div>

              <div className="pl-14">
                  <button 
                    type="button"
                    onClick={handleSaveAndConnect}
                    disabled={status === 'saving' || !config.path}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 text-base disabled:opacity-50 disabled:cursor-wait"
                  >
                     {status === 'saving' ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>}
                     {status === 'saving' ? '파일 읽기 및 확인 중...' : '연결 및 저장'}
                  </button>
                  
                  <div className="mt-4 min-h-[40px]">
                      {status === 'saving' && (
                          <div className="text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                              <RefreshCw size={14} className="animate-spin"/> 경로를 확인하고 서버 데이터를 동기화합니다...
                          </div>
                      )}
                      {status === 'success' && (
                          <div className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-100 dark:border-emerald-800 animate-in slide-in-from-left-2">
                              <CheckCircle2 size={16} /> 연결 성공! 데이터가 실시간으로 동기화됩니다.
                          </div>
                      )}
                      {status === 'error' && (
                          <div className="text-red-500 dark:text-red-400 text-sm font-bold flex flex-col gap-2 p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-100 dark:border-red-800 animate-in slide-in-from-left-2">
                            <div className="flex items-center gap-2">
                              <XCircle size={16} /> 연결 실패
                            </div>
                            <p className="font-normal text-xs pl-6">{errorMessage}</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>

          {!isAdmin && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-start gap-3 text-orange-800 dark:text-orange-200">
                <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-bold mb-1">주의사항</p>
                    <p>
                        NAS 폴더에 접근하려면 윈도우 탐색기에서 해당 폴더에 미리 접근하여 로그인(자격증명 저장)이 되어 있어야 합니다.
                        연결이 안 될 경우 윈도우 탐색기로 해당 파일을 열 수 있는지 먼저 확인해주세요.
                    </p>
                </div>
            </div>
          )}
      </div>
    </div>
  );
};
