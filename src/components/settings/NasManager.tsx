import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { NasConfig } from '../../types';
import { Globe, CheckCircle, FolderOpen, RefreshCw, AlertTriangle, Laptop, Settings2, Download } from 'lucide-react';
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
  const [hasHelper, setHasHelper] = useState(db.getHasHelper());

  // 연결 상태 검사 상태
  const [dbPathStatus, setDbPathStatus] = useState<{ checked: boolean; success: boolean; error?: string }>({ checked: false, success: false });
  const [storagePathStatus, setStoragePathStatus] = useState<{ checked: boolean; success: boolean; error?: string }>({ checked: false, success: false });

  const checkPathsStatus = async (dbPathVal?: string, storagePathVal?: string) => {
      const dbToCheck = dbPathVal !== undefined ? dbPathVal : config.dbPath || '';
      const storageToCheck = storagePathVal !== undefined ? storagePathVal : config.path || '';

      if (dbToCheck) {
          setDbPathStatus({ checked: false, success: false });
          const res = await db.checkDirectoryStatus(dbToCheck);
          setDbPathStatus({ checked: true, success: res.success, error: res.error });
      } else {
          setDbPathStatus({ checked: true, success: false, error: '경로가 지정되지 않았습니다.' });
      }

      if (storageToCheck) {
          setStoragePathStatus({ checked: false, success: false });
          const res = await db.checkDirectoryStatus(storageToCheck);
          setStoragePathStatus({ checked: true, success: res.success, error: res.error });
      } else {
          setStoragePathStatus({ checked: true, success: false, error: '경로가 지정되지 않았습니다.' });
      }
  };

  useEffect(() => {
    const loadConfig = async () => {
        const currentConfig = db.getNasConfig();
        setConfig(currentConfig);
        checkPathsStatus(currentConfig.dbPath, currentConfig.path);

        const helperActive = await db.refreshHelperStatus();
        setHasHelper(helperActive);
    };
    loadConfig();
    
    // 데이터 변경 시 자동 업데이트
    const unsubscribe = db.subscribe(() => {
        loadConfig();
    });
    return () => unsubscribe();
  }, []);

  const handleSetupSharedFolder = async (inputPath?: string) => {
      setIsProcessing(true);
      try {
          let finalPath = typeof inputPath === 'string' ? inputPath : config.path;
          
          if (isElectron && !finalPath) {
              const selectedPath = await window.electron.selectDirectory();
              if (selectedPath) finalPath = selectedPath;
          }

          if (finalPath) {
              await db.saveNasConfig({
                  ...config,
                  isEnabled: true,
                  path: finalPath,
                  status: 'connected'
              });
              const newConfig = db.getNasConfig();
              setConfig(newConfig);
              checkPathsStatus(newConfig.dbPath, newConfig.path);
              alert('인쇄 파일 보관 폴더 설정이 저장되었습니다.');
          }
      } catch (e) {
          console.error("공유 설정 오류:", e);
          alert('저장 폴더 설정 중 문제가 발생했습니다.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSetupDatabaseFolder = async (inputPath?: string) => {
      setIsProcessing(true);
      try {
          let finalPath = typeof inputPath === 'string' ? inputPath : config.dbPath || '';
          
          if (isElectron && !finalPath) {
              const selectedPath = await window.electron.selectDirectory();
              if (selectedPath) finalPath = selectedPath;
          }

          if (finalPath) {
              // .json 파일 경로로 들어온 경우 자동으로 부모 폴더 경로로 보정
              let cleanedPath = finalPath.trim();
              while (cleanedPath.toLowerCase().endsWith('.json')) {
                  const sep = cleanedPath.includes('/') ? '/' : '\\';
                  const lastIdx = cleanedPath.lastIndexOf(sep);
                  if (lastIdx > -1) {
                      cleanedPath = cleanedPath.substring(0, lastIdx);
                  } else {
                      break;
                  }
              }
              finalPath = cleanedPath;
              const allJobs = db.getAllJobs();
              const allStaff = db.getStaff();
              const allClients = db.getClients();
              const allQuotes = db.getQuotes();
              const allInstructions = db.getInstructions();
              const allMessages = db.getMessages();
              const allLeaves = db.getLeaves();
              const allPapers = db.getPapers();
              const currentSettings = db.getSettingsObj();

              const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
              const newBasePath = finalPath.endsWith(sep) ? finalPath : `${finalPath}${sep}`;
              
              if (isElectron && window.electron) {
                  const collections = {
                      'jobs': allJobs,
                      'staff': allStaff,
                      'clients': allClients,
                      'quotes': allQuotes,
                      'instructions': allInstructions,
                      'messages': allMessages,
                      'leaves': allLeaves,
                      'papers': allPapers,
                      'settings': [currentSettings]
                  };
                  
                  for (const [col, data] of Object.entries(collections)) {
                      const filePath = `${newBasePath}${col}.json`;
                      const result = await window.electron.saveFile(filePath, JSON.stringify(data, null, 2));
                      if (!result.success) {
                          throw new Error(`파일 이전 실패 (${col}.json): ${result.error}`);
                      }
                  }
              }

              localStorage.setItem('ezpw_custom_db_path', finalPath);
              await db.setCustomBasePath(finalPath);

              await db.saveNasConfig({
                  ...config,
                  isEnabled: true,
                  dbPath: finalPath,
                  status: 'connected'
              });

              // Save dbPath to Firestore tenants/{tenantId}
              if (currentUser?.tenantId) {
                  try {
                      const { doc, updateDoc } = await import('firebase/firestore');
                      const { db: fsDb } = await import('../../services/firebase');
                      const tenantRef = doc(fsDb, 'tenants', currentUser.tenantId);
                      await updateDoc(tenantRef, { dbPath: finalPath });
                  } catch (fsErr) {
                      console.error("Firestore dbPath 저장 실패:", fsErr);
                  }
              }

              alert(`🎉 데이터베이스 저장 폴더가 "${finalPath}"(으)로 설정되었으며, 기존 데이터가 유실 없이 마이그레이션되었습니다!`);
              window.location.reload();
          }
      } catch (e: any) {
          console.error("데이터베이스 설정 오류:", e);
          alert(`데이터베이스 폴더 변경 중 문제가 발생했습니다: ${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

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
                     <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Storage Path</span>
                     <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 truncate">
                       {config.path || '(미설정)'}
                     </span>
                 </div>
                 {config.path && (
                     <div className="text-xs shrink-0 font-bold">
                         {storagePathStatus.success ? (
                             <span className="text-emerald-500">● 연결 성공 (읽기/쓰기 가능)</span>
                         ) : (
                             <span className="text-rose-500">▲ 연결 오류: {storagePathStatus.error || '접근 불가'}</span>
                         )}
                     </div>
                 )}
             </div>

             <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-2 pr-4 justify-between">
                 <div className="flex items-center gap-2">
                     <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Database Path</span>
                     <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 truncate">
                       {config.dbPath || '(미설정)'}
                     </span>
                 </div>
                 {config.dbPath && (
                     <div className="text-xs shrink-0 font-bold">
                         {dbPathStatus.success ? (
                             <span className="text-emerald-500">● 연결 성공 (읽기/쓰기 가능)</span>
                         ) : (
                             <span className="text-rose-500">▲ 연결 오류: {dbPathStatus.error || '접근 불가'}</span>
                         )}
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
                서버 및 데이터 저장 폴더 설정
            </h3>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2
            ${isElectron 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
              : hasHelper 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                : 'bg-amber-50 border-amber-200 text-amber-600'}`}
          >
            {isElectron ? <Laptop size={14}/> : <Globe size={14}/>}
            {isElectron 
              ? '데스크탑 전용 도우미' 
              : hasHelper 
                ? '웹 브라우저 모드 (도우미 작동중)' 
                : '웹 브라우저 모드 (도우미 미연결)'}
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
              </div>
          </div>
         
          <div className="space-y-6">
              {!isElectron && !hasHelper && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
                      <div className="flex gap-3">
                          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                          <div>
                              <h5 className="text-sm font-bold text-amber-800 dark:text-amber-400">
                                  로컬 연동 도우미(헬퍼) 프로그램이 구동되지 않고 있습니다.
                              </h5>
                              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 leading-relaxed">
                                  사무실 내부 NAS 공유 폴더나 로컬 데이터베이스에 접근하려면 도우미 프로그램 설치 및 실행이 필수적입니다.
                                  아래 다운로드 버튼을 눌러 설치 후 바탕화면 바로가기로 실행해 주세요.
                              </p>
                          </div>
                      </div>
                      <a 
                          href="/downloads/EzPrintWork-Helper.zip" 
                          download
                          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/10 transition-all active:scale-95 whitespace-nowrap"
                      >
                          <Download size={14} />
                          도우미 설치파일 다운로드
                      </a>
                  </div>
              )}

              {/* Storage Path Config */}
              <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 dark:text-slate-400 block pl-1">작업 파일 보관 폴더 (Storage Path)</label>
                  <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2 pr-4">
                      <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Storage Path</div>
                      <input 
                          type="text"
                          value={config.path || ''}
                          onChange={(e) => setConfig({ ...config, path: e.target.value })}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-mono text-slate-700 dark:text-slate-300 placeholder:text-slate-300 outline-none"
                          placeholder="인쇄 원본 파일 등이 보관될 NAS 또는 로컬 공유 폴더 경로"
                      />
                      {isAdmin && (
                          <button 
                              onClick={() => handleSetupSharedFolder(config.path)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95"
                          >
                              저장
                          </button>
                      )}
                  </div>
                  {/* 연결 상태 표시 */}
                  <div className="px-2 text-xs flex items-center justify-between">
                      <div>
                          {!storagePathStatus.checked ? (
                              <span className="text-slate-400">◌ 작업 폴더 연결성 확인 중...</span>
                          ) : storagePathStatus.success ? (
                              <span className="text-emerald-500 font-bold">● 연결 성공 (읽기/쓰기 가능)</span>
                          ) : (
                              <span className="text-rose-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={12}/> 연결 오류: {storagePathStatus.error}
                              </span>
                          )}
                      </div>
                      <button 
                          onClick={() => checkPathsStatus(config.dbPath, config.path)}
                          className="text-xs text-blue-500 hover:underline font-bold"
                      >
                          다시 검사
                      </button>
                  </div>
              </div>

              {/* Database Path Config */}
              <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 dark:text-slate-400 block pl-1">데이터베이스 저장 폴더 (Database Path)</label>
                  <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2 pr-4">
                      <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Database Path</div>
                      <input 
                          type="text"
                          value={config.dbPath || ''}
                          onChange={(e) => setConfig({ ...config, dbPath: e.target.value })}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-mono text-slate-700 dark:text-slate-300 placeholder:text-slate-300 outline-none"
                          placeholder="데이터베이스 파일(jobs.json 등)이 보관될 폴더 경로"
                      />
                      {isAdmin && (
                          <button 
                              onClick={() => handleSetupDatabaseFolder(config.dbPath)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95"
                          >
                              저장 및 이전
                          </button>
                      )}
                  </div>
                  {/* 연결 상태 표시 */}
                  <div className="px-2 text-xs flex items-center justify-between">
                      <div>
                          {!dbPathStatus.checked ? (
                              <span className="text-slate-400">◌ 데이터베이스 폴더 연결성 확인 중...</span>
                          ) : dbPathStatus.success ? (
                              <span className="text-emerald-500 font-bold">● 연결 성공 (읽기/쓰기 가능)</span>
                          ) : (
                              <span className="text-rose-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={12}/> 연결 오류: {dbPathStatus.error}
                              </span>
                          )}
                      </div>
                      <button 
                          onClick={() => checkPathsStatus(config.dbPath, config.path)}
                          className="text-xs text-blue-500 hover:underline font-bold"
                      >
                          다시 검사
                      </button>
                  </div>
              </div>
          </div>

          {isAdmin && (
              <div className="flex flex-wrap justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex gap-4">
                      {isElectron && (
                          <>
                              <button 
                                  onClick={() => handleSetupSharedFolder()}
                                  className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
                              >
                                  <FolderOpen size={14} /> 작업 폴더 선택...
                              </button>
                              <button 
                                  onClick={() => handleSetupDatabaseFolder()}
                                  className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                              >
                                  <FolderOpen size={14} /> DB 폴더 선택 및 이전...
                              </button>
                          </>
                      )}
                  </div>
                  <button 
                      onClick={handleDisableSharing}
                      className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                      설정 초기화
                  </button>
              </div>
          )}
      </div>
    </div>
  );
};
