import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { NasConfig } from '../../types';
import { Globe, CheckCircle, FolderOpen, RefreshCw, AlertTriangle, Laptop, Settings2, Power, Download, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const NasManager: React.FC = () => {
  const [config, setConfig] = useState<NasConfig>({ isEnabled: false, path: '', dbPath: '', status: 'disconnected' });
  const [isProcessing, setIsProcessing] = useState(false);
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.id === 'admin';

  // 환경 감지
  const isElectron = typeof window !== 'undefined' && 
                    !!window.electron && 
                    typeof window.electron.selectDirectory === 'function';

  // 연결 상태 검사 상태
  const [dbPathStatus, setDbPathStatus] = useState<{ checked: boolean; success: boolean; error?: string }>({ checked: false, success: false });

  // 로컬 연동 도우미 관련 상태
  const [isHelperRunning, setIsHelperRunning] = useState(false);
  
  // 사용자가 입력/선택하는 DB 경로 임시 상태
  const [dbPath, setDbPath] = useState('');
  
  // 마이그레이션(이전/합치기) 모달 오픈 상태
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  const checkHelperStatus = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const res = await fetch('http://127.0.0.1:23230/get-documents-path', { signal: controller.signal });
      clearTimeout(timeoutId);
      setIsHelperRunning(res.ok || res.status === 200);
    } catch (e) {
      setIsHelperRunning(false);
    }
  };

  useEffect(() => {
    if (!isElectron) {
      checkHelperStatus();
      const interval = setInterval(checkHelperStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isElectron]);

  const handleDownloadHelper = () => {
    const link = document.createElement('a');
    link.href = '/downloads/EzPrintWork-Helper.bin';
    link.setAttribute('download', 'EzPrintWork-Helper.exe');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExitHelper = async () => {
    if (confirm('브라우저 연동 도우미 프로그램을 종료하시겠습니까?')) {
      try {
        const res = await fetch('http://127.0.0.1:23230/exit');
        if (res.ok) {
          alert('도우미 프로그램 종료 요청이 전송되었습니다.');
          setIsHelperRunning(false);
        }
      } catch (e) {
        alert('도우미 종료 중 오류가 발생했거나 이미 종료되었습니다.');
      }
    }
  };

  const checkDbPathStatus = async (pathToCheck?: string) => {
    const target = pathToCheck !== undefined ? pathToCheck : dbPath;
    if (target) {
      setDbPathStatus({ checked: false, success: false });
      const res = await db.checkDirectoryStatus(target);
      setDbPathStatus({ checked: true, success: res.success, error: res.error });
    } else {
      setDbPathStatus({ checked: true, success: false, error: '경로가 지정되지 않았습니다.' });
    }
  };

  useEffect(() => {
    const loadConfig = () => {
        const currentConfig = db.getNasConfig();
        setConfig(currentConfig);
        setDbPath(currentConfig.dbPath || '');
        checkDbPathStatus(currentConfig.dbPath);
    };
    loadConfig();
    
    // 데이터 변경 시 자동 업데이트
    const unsubscribe = db.subscribe(() => {
        loadConfig();
    });
    return () => unsubscribe();
  }, []);

  const handleDisableSharing = async () => {
      if (confirm('클라우드 동기화 설정을 초기화하시겠습니까? (작업 데이터는 클라우드에 안전하게 보관됩니다)')) {
          localStorage.removeItem('ezpw_custom_db_path');
          // Reset Firestore dbPath
          if (currentUser?.tenantId) {
              try {
                  const { doc, updateDoc } = await import('firebase/firestore');
                  const { db: fsDb } = await import('../../services/firebase');
                  const tenantRef = doc(fsDb, 'tenants', currentUser.tenantId);
                  await updateDoc(tenantRef, { dbPath: '' });
              } catch (fsErr) {
                  console.error("Firestore dbPath 초기화 실패:", fsErr);
              }
          }
          await db.saveNasConfig({
              isEnabled: false,
              path: '',
              dbPath: '',
              status: 'disconnected'
          });
          window.location.reload();
      }
  };

  // 직원을 위한 간단한 상태 대시보드 렌더링
  if (!isAdmin) {
    const isConnected = config.isEnabled && config.status === 'connected';

    return (
      <div className="max-w-4xl p-6 space-y-6 animate-in fade-in duration-500">
        <div>
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Globe size={22} />
            </div>
            클라우드 / NAS 연결 상태
          </h3>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className={`px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider
              ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}
            >
              {isConnected ? '정상 연결됨' : '연결 대기 상태'}
            </div>
          </div>

          <div className="space-y-3">
             <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-2 pr-4 justify-between">
                 <div className="flex items-center gap-2">
                     <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Database Path</span>
                     <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 truncate">
                       {config.dbPath || '(미설정)'}
                     </span>
                 </div>
                 {config.dbPath && (
                     <div className="text-xs flex items-center gap-1 text-emerald-500 font-bold">
                         <CheckCircle size={12} /> 연결 상태 정상
                     </div>
                 )}
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                    <Globe size={22} />
                </div>
                데이터베이스 저장 폴더 설정
            </h3>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2
            ${isElectron ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}
          >
            {isElectron ? <Laptop size={14}/> : <Globe size={14}/>}
            {isElectron ? '데스크톱 전용 도우미' : '웹 브라우저 모드'}
          </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-700">
              <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-inner
                  ${config.status === 'connected' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}
              >
                  {config.status === 'connected' ? <Globe size={40} className="animate-pulse" /> : <Settings2 size={40} />}
              </div>
              <div className="flex-1 text-center md:text-left">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-widest
                      ${config.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}
                  >
                      {config.status === 'connected' ? '동기화 활성화됨' : '설정 대기 상태'}
                  </div>
                  <h4 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
                      {config.status === 'connected' ? '공동 데이터 폴더 동기화 중' : '저장 폴더 설정'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                      모든 인쇄 데이터베이스 자료(`jobs.json` 등)가 저장 및 공유될 로컬/네트워크(NAS) 경로를 지정합니다.
                  </p>
              </div>
          </div>
         
          <div className="space-y-6">
              {/* Database Path Config */}
              <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 dark:text-slate-400 block pl-1">데이터베이스 저장 폴더 (Database Path)</label>
                  <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2 pr-4">
                      <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Database Path</div>
                      <input 
                          type="text"
                          value={dbPath}
                          onChange={(e) => setDbPath(e.target.value)}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-mono text-slate-700 dark:text-slate-300 placeholder:text-slate-350 outline-none"
                          placeholder="데이터베이스 파일(jobs.json 등)이 보관될 폴더 경로"
                      />
                      {isAdmin && (
                          <button 
                              onClick={async () => {
                                  let selected = '';
                                  if (isElectron) {
                                      selected = (await window.electron.selectDirectory()) || '';
                                  } else if (isHelperRunning) {
                                      try {
                                          const res = await fetch('http://127.0.0.1:23230/select');
                                          const data = await res.json();
                                          if (data && data.path) selected = data.path;
                                      } catch (e) {
                                          alert('도우미 연결 중 오류가 발생했습니다.');
                                      }
                                  } else {
                                      alert('웹 버전에서는 폴더 선택을 위해 먼저 아래 [브라우저 연동 도우미 관리]에서 도우미 프로그램을 다운로드하여 실행해 주시기 바랍니다. 또는 폴더 경로를 직접 입력하셔도 됩니다.');
                                      return;
                                  }
                                  if (selected) {
                                      setDbPath(selected);
                                      checkDbPathStatus(selected);
                                  }
                              }}
                              className="px-4 py-2 bg-slate-150 hover:bg-slate-250 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 flex items-center gap-1 border border-slate-300/30 shadow-sm"
                          >
                              <FolderOpen size={14} /> 폴더 선택
                          </button>
                      )}
                  </div>
                  {/* 연결 상태 표시 */}
                  <div className="px-2 text-xs flex items-center justify-between">
                      <div>
                          {!dbPathStatus.checked ? (
                              <span className="text-slate-400">◌ 데이터베이스 폴더 연결성 확인 중...</span>
                          ) : dbPathStatus.success ? (
                              <span className="text-emerald-500 font-bold flex items-center gap-1">
                                  <CheckCircle2 size={12}/> 연결 성공 (읽기/쓰기 가능)
                              </span>
                          ) : (
                              <span className="text-rose-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={12}/> 연결 오류: {dbPathStatus.error}
                              </span>
                          )}
                      </div>
                      <button 
                          onClick={() => checkDbPathStatus(dbPath)}
                          className="text-xs text-blue-500 hover:underline font-bold"
                      >
                          다시 검사
                      </button>
                  </div>
              </div>
          </div>

          {isAdmin && (
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-5 border-t border-slate-100 dark:border-slate-700">
                  {/* DB 이전 및 합치기 버튼 (위에서 폴더를 선택하기 전에는 비활성화) */}
                  <button 
                      type="button"
                      disabled={!dbPath || dbPath.trim() === ''}
                      onClick={() => setIsMigrationModalOpen(true)}
                      className="w-full md:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:dark:bg-slate-800 disabled:text-slate-400 disabled:dark:text-slate-600 text-white font-extrabold rounded-2xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                      <RefreshCw size={16} />
                      DB폴더 이전 및 합치기
                  </button>
                  
                  <button 
                      onClick={handleDisableSharing}
                      className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors py-2"
                  >
                      설정 초기화
                  </button>
              </div>
          )}
      </div>

      {!isElectron && (
        <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-700">
                <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-inner
                    ${isHelperRunning ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-900/30 text-slate-400'}`}
                >
                    <Laptop size={40} />
                </div>
                <div className="flex-1 text-center md:text-left">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-widest
                        ${isHelperRunning ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}
                    >
                        {isHelperRunning ? '도우미 가동 중' : '도우미 미가동'}
                    </div>
                    <h4 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
                        브라우저 연동 도우미 관리
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        웹 브라우저 버전에서 로컬 폴더(NAS 등) 데이터를 연동하기 위한 백그라운드 프로그램입니다.
                    </p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                    {isHelperRunning ? (
                        <span className="flex items-center gap-2 text-emerald-500 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            로컬 연동 포트(23230)에 정상 연결되었습니다. 백그라운드에서 동작 중입니다.
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-amber-500 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            도우미 프로그램이 실행되지 않았습니다. 폴더 접근을 위해 먼저 다운로드 후 실행해주세요.
                        </span>
                    )}
                </div>
                <div className="flex gap-3">
                    {isHelperRunning ? (
                        <button
                            onClick={handleExitHelper}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95"
                        >
                            <Power size={14} /> 도우미 프로그램 종료
                        </button>
                    ) : (
                        <button
                            onClick={handleDownloadHelper}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 shadow-md shadow-blue-600/10"
                        >
                            <Download size={14} /> 도우미 다운로드 (Helper.exe)
                        </button>
                    )}
                </div>
            </div>
            
            {!isHelperRunning && (
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <p className="font-bold text-slate-700 dark:text-slate-300">💡 백그라운드(상주) 모드 실행 안내</p>
                    <p>• 다운로드 받은 <span className="font-mono font-bold">EzPrintWork-Helper.exe</span> 파일을 더블클릭하여 실행하십시오.</p>
                    <p>• 실행 시 터미널(검은색 창) 없이 **백그라운드에서 즉시 숨겨진 상태(상주)**로 동작합니다.</p>
                    <p>• 실행 여부는 윈도우 우측 하단 작업 표시줄의 **알림(Toast)** 메시지로 친절히 안내됩니다.</p>
                    <p>• 프로그램 종료를 원하실 때는 본 페이지에서 **[도우미 프로그램 종료]** 버튼을 클릭하시면 안전하게 자동 종료됩니다.</p>
                </div>
            )}
        </div>
      )}

      {/* DB 폴더 이전 및 합치기 전용 모달 */}
      <MigrationMergeModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        targetDbPath={dbPath}
        isElectron={isElectron}
        isHelperRunning={isHelperRunning}
      />
    </div>
  );
};

// --- DB 폴더 이전 및 합치기 모달 컴포넌트 정의 ---
interface MigrationMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDbPath: string;
  isElectron: boolean;
  isHelperRunning: boolean;
}

const MigrationMergeModal: React.FC<MigrationMergeModalProps> = ({ isOpen, onClose, targetDbPath, isElectron, isHelperRunning }) => {
  const [sourcePath, setSourcePath] = useState('');
  const [detectedFiles, setDetectedFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 기존 폴더 선택 브라우저
  const handleSelectSourceFolder = async () => {
    let selected = '';
    if (isElectron) {
      selected = (await window.electron.selectDirectory()) || '';
    } else if (isHelperRunning) {
      try {
        const res = await fetch('http://127.0.0.1:23230/select');
        const data = await res.json();
        if (data && data.path) selected = data.path;
      } catch (e) {
        alert('도우미 연결 중 오류가 발생했습니다.');
      }
    } else {
      alert('웹 버전에서는 폴더 선택을 위해 먼저 브라우저 연동 도우미를 다운로드하여 실행해 주시기 바랍니다. 또는 경로를 직접 입력하셔도 됩니다.');
    }
    if (selected) {
      setSourcePath(selected);
      detectFiles(selected);
    }
  };

  // 기존 폴더 내 파일 감지
  const detectFiles = async (folderPath: string) => {
    const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
    const found: string[] = [];
    const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
    const cleanFolder = folderPath.trim();
    const basePath = cleanFolder.endsWith(sep) ? cleanFolder : `${cleanFolder}${sep}`;

    for (const col of collections) {
      const filePath = `${basePath}${col}.json`;
      let exists = false;
      if (isElectron) {
        exists = await window.electron.exists(filePath);
      } else if (isHelperRunning) {
        try {
          const res = await fetch(`http://127.0.0.1:23230/read-file?path=${encodeURIComponent(filePath)}`);
          if (res.ok) {
            const data = await res.json();
            exists = data.success;
          }
        } catch (e) {}
      }
      if (exists) {
        found.push(`${col}.json`);
      }
    }
    setDetectedFiles(found);
  };

  const handleMergeAndMigrate = async () => {
    if (!sourcePath) {
      alert('기존 데이터 폴더를 먼저 선택해 주세요.');
      return;
    }
    
    // 대상 폴더와 원본 폴더가 같으면 오류
    if (sourcePath.trim() === targetDbPath.trim()) {
      alert('기존 데이터 폴더와 새 데이터베이스 폴더가 동일합니다. 서로 다른 폴더여야 복원 및 합치기가 가능합니다.');
      return;
    }

    if (!confirm('기존 데이터 폴더의 정보들을 불러와 새 데이터베이스 폴더로 복원 및 중복 제외 합치기를 진행하시겠습니까?')) {
      return;
    }

    setIsProcessing(true);
    try {
      const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
      const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
      const cleanSource = sourcePath.trim();
      const sourceBase = cleanSource.endsWith(sep) ? cleanSource : `${cleanSource}${sep}`;
      const cleanTarget = targetDbPath.trim();
      const targetBase = cleanTarget.endsWith(sep) ? cleanTarget : `${cleanTarget}${sep}`;

      // 1. 기존 데이터 폴더(좌측)의 데이터들을 개별적으로 읽기
      const sourceData: Record<string, any[]> = {};
      for (const col of collections) {
        const filePath = `${sourceBase}${col}.json`;
        let fileContent = '';
        if (isElectron) {
          const res = await window.electron.readFile(filePath);
          if (res.success && res.data) fileContent = res.data;
        } else if (isHelperRunning) {
          const res = await fetch(`http://127.0.0.1:23230/read-file?path=${encodeURIComponent(filePath)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data) fileContent = result.data;
          }
        }
        if (fileContent) {
          try {
            sourceData[col] = JSON.parse(fileContent);
          } catch (e) {
            console.error(`Error parsing source ${col}.json:`, e);
          }
        }
      }

      // 2. 현재 메모리에 있는 데이터베이스 값들 로드
      const memoryJobs = db.getAllJobs();
      const memoryStaff = db.getStaff();
      const memoryClients = db.getClients();
      const memoryQuotes = db.getQuotes();
      const memoryInstructions = db.getInstructions();
      const memoryMessages = db.getMessages();
      const memoryLeaves = db.getLeaves();
      const memoryPapers = db.getPapers();
      const memorySettings = db.getSettingsObj();

      const memoryData: Record<string, any> = {
        'jobs': memoryJobs,
        'staff': memoryStaff,
        'clients': memoryClients,
        'quotes': memoryQuotes,
        'instructions': memoryInstructions,
        'messages': memoryMessages,
        'leaves': memoryLeaves,
        'papers': memoryPapers,
        'settings': [memorySettings]
      };

      // 3. 중복 제거 병합(Merge) 로직 실행
      const mergedData: Record<string, any[]> = {};

      for (const col of collections) {
        const srcList = sourceData[col] || [];
        const memList = memoryData[col] || [];

        if (col === 'settings') {
          // 설정은 병합 시 하나로 합침
          const srcSetting = srcList[0] || {};
          const memSetting = memList[0] || {};
          mergedData[col] = [{ ...srcSetting, ...memSetting }];
        } else {
          const mergedMap = new Map();
          // 원본 파일 데이터 먼저 기입
          srcList.forEach((item: any) => {
            if (item && item.id) mergedMap.set(item.id, item);
          });
          // 메모리 데이터로 덮어쓰거나 추가 (id 기준 중복 제거)
          memList.forEach((item: any) => {
            if (item && item.id) {
              const srcItem = mergedMap.get(item.id);
              if (srcItem) {
                // 더 최신 수정일자를 가진 데이터 선택
                const srcTime = srcItem.updatedAt ? new Date(srcItem.updatedAt).getTime() : 0;
                const memTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
                if (memTime >= srcTime) {
                  mergedMap.set(item.id, { ...srcItem, ...item });
                } else {
                  mergedMap.set(item.id, { ...item, ...srcItem });
                }
              } else {
                mergedMap.set(item.id, item);
              }
            }
          });
          mergedData[col] = Array.from(mergedMap.values());
        }
      }

      // 4. 병합 결과를 우측 대상 폴더(targetBase)에 파일로 최종 쓰기 진행
      for (const col of collections) {
        const filePath = `${targetBase}${col}.json`;
        const jsonString = JSON.stringify(mergedData[col], null, 2);
        
        let success = false;
        let errorMsg = '';

        if (isElectron) {
          const result = await window.electron.saveFile(filePath, jsonString);
          success = result.success;
          errorMsg = result.error || '';
        } else if (isHelperRunning) {
          const res = await fetch('http://127.0.0.1:23230/save-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content: jsonString })
          });
          if (res.ok) {
            const result = await res.json();
            success = result.success;
            errorMsg = result.error || '';
          }
        }

        if (!success) {
          throw new Error(`파일 쓰기 실패 (${col}.json): ${errorMsg || '권한 부족 혹은 연결 끊김'}`);
        }
      }

      // 5. DB custom path 전역 설정 업데이트 및 NAS 설정 활성화
      localStorage.setItem('ezpw_custom_db_path', targetDbPath);
      await db.setCustomBasePath(targetDbPath);

      const currentConfig = db.getNasConfig();
      await db.saveNasConfig({
        ...currentConfig,
        isEnabled: true,
        dbPath: targetDbPath,
        status: 'connected'
      });

      // 6. Firestore dbPath 업데이트
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db: fsDb } = await import('../../services/firebase');
        const currentUser = db.getStaff().find(s => s.role === 'admin'); // 관리자 정보
        const tenantId = localStorage.getItem('ezpw_tenant_id') || (currentUser as any)?.tenantId;
        if (tenantId) {
          const tenantRef = doc(fsDb, 'tenants', tenantId);
          await updateDoc(tenantRef, { dbPath: targetDbPath });
        }
      } catch (fsErr) {
        console.error("Firestore dbPath 저장 실패:", fsErr);
      }

      alert(`🎉 데이터베이스 이전 및 합치기가 완료되었습니다!\n새 경로 "${targetDbPath}"에서 데이터를 안전하게 불러옵니다.`);
      window.location.reload();
    } catch (e: any) {
      console.error('Migration error:', e);
      alert(`이전 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              📂 DB 폴더 이전 및 합치기 (데이터 병합)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              기존에 사용하시던 로컬 데이터와 새로 설정한 저장소 경로의 데이터를 중복 없이 하나로 합칩니다.
            </p>
          </div>
          <button 
            disabled={isProcessing}
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            
            {/* 좌측: 기존 데이터 폴더 (가변) */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wide">
                  원본 (Source)
                </span>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">기존 데이터 폴더</h4>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  이전해서 합칠 데이터(`jobs.json` 등)가 저장되어 있는 원본 폴더를 찾아 선택하세요.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono break-all text-slate-600 dark:text-slate-400 min-h-[40px]">
                    {sourcePath || '(폴더를 선택해 주세요)'}
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSelectSourceFolder}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-200 hover:bg-slate-350 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-extrabold rounded-xl text-xs transition-all active:scale-[0.98]"
                  >
                    <FolderOpen size={14} /> 기존 폴더 선택...
                  </button>
                </div>

                {/* 감지 파일 표시 */}
                {sourcePath && (
                  <div className="bg-white dark:bg-slate-800/60 border border-slate-150 dark:border-slate-800 p-3 rounded-xl space-y-1.5">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-355">📁 감지된 데이터 파일 ({detectedFiles.length}개):</p>
                    {detectedFiles.length > 0 ? (
                      <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
                        {detectedFiles.map(f => (
                          <span key={f} className="bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200/50 dark:border-slate-700 font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-rose-500 font-bold flex items-center gap-1">
                        <AlertTriangle size={12}/> 데이터 파일이 발견되지 않았습니다. 폴더를 다시 확인하세요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 중간 화살표 데코레이션 */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 rounded-full border-4 border-white dark:border-slate-900 shadow-md items-center justify-center text-white z-10">
              ➜
            </div>

            {/* 우측: 대상 데이터 폴더 (고정) */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wide">
                  대상 (Target - 고정)
                </span>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">합쳐질 데이터베이스 저장 폴더</h4>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  상단 설정에서 지정하신 최신 데이터베이스 폴더 경로입니다. 데이터 꼬임 방지를 위해 변경이 불가능하도록 고정되어 있습니다.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono break-all text-slate-600 dark:text-slate-500 min-h-[40px] font-bold select-none cursor-not-allowed">
                    {targetDbPath}
                  </div>
                  <div className="py-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 bg-white dark:bg-slate-800/60 border border-slate-150 dark:border-slate-800 rounded-xl">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    안전하게 고정된 대상 저장소 경로
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 p-4 rounded-2xl text-xs text-blue-700 dark:text-blue-300 leading-relaxed space-y-1">
            <p className="font-bold text-sm text-blue-800 dark:text-blue-200 flex items-center gap-1.5 mb-1">
              💡 꼭 읽어보세요!
            </p>
            <p>• 이전 및 합치기 진행 시, 두 폴더의 동일 데이터(동일 ID를 가진 작업 등)는 최종 수정 시간(`updatedAt`)이 가장 최신인 데이터로 **중복 없이 스마트하게 자동 병합**됩니다.</p>
            <p>• 작업 도중 네트워크 끊김 등으로 인해 데이터가 유실되지 않도록 **전송이 끝날 때까지 앱을 종료하거나 컴퓨터 전원을 끄지 마십시오.**</p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button 
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-200 text-xs font-bold rounded-xl transition-all"
          >
            취소
          </button>
          <button 
            type="button"
            disabled={isProcessing || !sourcePath || detectedFiles.length === 0}
            onClick={handleMergeAndMigrate}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:dark:bg-slate-800 disabled:text-slate-400 disabled:dark:text-slate-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/10 transition-all active:scale-[0.98] flex items-center gap-1.5"
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                데이터 병합 및 이전 중...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                이전 및 병합(Merge) 실행
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
