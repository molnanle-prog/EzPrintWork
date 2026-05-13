
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { NasConfig } from '../../types';
import { Globe, CheckCircle, FolderOpen, RefreshCw, Info, Settings2, Laptop } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const NasManager: React.FC = () => {
  const [config, setConfig] = useState<NasConfig>({ isEnabled: false, path: '', status: 'disconnected' });
  const [isProcessing, setIsProcessing] = useState(false);
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.id === 'admin';

  // 환경 감지
  const isElectron = typeof window !== 'undefined' && 
                    !!window.electron && 
                    typeof window.electron.selectDirectory === 'function';

  useEffect(() => {
    const loadConfig = () => {
        const currentConfig = db.getNasConfig();
        setConfig(currentConfig);
    };
    loadConfig();
    
    // 데이터 변경 시 자동 업데이트
    const unsubscribe = db.subscribe(() => {
        loadConfig();
    });
    return () => unsubscribe();
  }, []);

  const handleSetupSharedFolder = async () => {
      if (!isElectron && !config.path) return;

      setIsProcessing(true);
      try {
          let finalPath = config.path;
          
          if (isElectron && !finalPath) {
              const selectedPath = await window.electron.selectDirectory();
              if (selectedPath) finalPath = selectedPath;
          }

          if (finalPath) {
              await db.saveNasConfig({
                  isEnabled: true,
                  path: finalPath,
                  status: 'connected'
              });
              const newConfig = db.getNasConfig();
              setConfig(newConfig);
          }
      } catch (e) {
          console.error("공유 설정 오류:", e);
          alert('저장 폴더 설정 중 문제가 발생했습니다.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDisableSharing = async () => {
      if (confirm('클라우드 동기화 설정을 초기화하시겠습니까? (작업 데이터는 클라우드에 안전하게 보관됩니다)')) {
          await db.saveNasConfig({
              isEnabled: false,
              path: '',
              status: 'disconnected'
          });
      }
  };

  return (
    <div className="max-w-5xl p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                    <Globe size={22} />
                </div>
                클라우드 서비스 동기화 (Cloud Hub)
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
                모든 작업 데이터가 실시간으로 클라우드 허브에 안전하게 보관 및 동기화됩니다.
            </p>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2
            ${isElectron ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}
          >
            {isElectron ? <Laptop size={14}/> : <Globe size={14}/>}
            {isElectron ? '데스크탑 전용 도우미' : '웹 브라우저 모드'}
          </div>
      </div>

      {/* Main Connection Card */}
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-10">
            {!config.isEnabled ? (
                /* 1. 연결 전 상태 */
                <div className="text-center space-y-8">
                    <div className="w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-3xl mx-auto flex items-center justify-center text-slate-300 dark:text-slate-700 border-4 border-dashed border-slate-100 dark:border-slate-800">
                        <RefreshCw size={48} className="animate-spin-slow" />
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100">클라우드 허브 연결 대기 중</h4>
                        <p className="text-slate-500 dark:text-slate-400 max-lg mx-auto leading-relaxed">
                            작업 파일을 관리할 로컬 저장소(NAS 또는 공용 폴더)를 설정해 주세요. <br/>
                            데이터는 클라우드에, 실제 파일은 지정한 폴더에 보관됩니다.
                        </p>
                    </div>

                    {isElectron ? (
                        <div className="space-y-6">
                            <button 
                                onClick={handleSetupSharedFolder}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-3 px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xl transition-all shadow-xl shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                            >
                                {isProcessing ? <RefreshCw className="animate-spin" /> : <FolderOpen size={24} />}
                                작업 폴더 지정하고 시작하기
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="inline-block p-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-[2rem] text-blue-800 dark:text-blue-300 text-left max-w-xl shadow-sm">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                                        <Globe size={24} />
                                    </div>
                                    <div className="space-y-3">
                                        <h5 className="text-lg font-bold">클라우드 동기화 안내</h5>
                                        <p className="text-sm leading-relaxed opacity-90">
                                            별도의 설정 없이 웹에서 즉시 클라우드 데이터를 사용할 수 있습니다. <br/>
                                            로컬 폴더와 연동하여 실제 파일을 열려면 <strong>데스크탑 앱(심부름꾼)</strong>을 실행해 주세요.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* 2. 연결 완료 상태 또는 수동 입력 모드 */
                <div className="flex flex-col md:flex-row items-center gap-10">
                    <div className={`w-32 h-32 rounded-[2.5rem] flex items-center justify-center shrink-0 shadow-inner
                        ${config.status === 'connected' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}
                    >
                        {config.status === 'connected' ? <Globe size={64} className="animate-pulse" /> : <Settings2 size={64} />}
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-5">
                        <div className="flex flex-col md:flex-row items-center md:items-end gap-3">
                            <div className="space-y-1">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-widest
                                    ${config.status === 'connected' ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-600' : 'bg-blue-50 dark:bg-blue-900/50 text-blue-600'}`}
                                >
                                    <CheckCircle size={10} /> 
                                    {config.status === 'connected' ? 'Cloud Hub Connected' : 'Manual Setup Mode'}
                                </div>
                                <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">
                                    {config.status === 'connected' ? '클라우드 허브 동기화 중' : '저장 폴더 설정'}
                                </h4>
                            </div>
                            {isElectron && config.status === 'connected' && (
                                <div className="mb-1.5 px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-md">
                                    실시간 보안 연결 활성
                                </div>
                            )}
                        </div>
                       
                        <div className="space-y-3">
                            <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2 pr-4">
                                <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Storage Path</div>
                                <input 
                                    type="text"
                                    value={config.path || ''}
                                    onChange={(e) => setConfig({ ...config, path: e.target.value })}
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-mono text-slate-700 dark:text-slate-300 placeholder:text-slate-300"
                                    placeholder="인쇄 파일이 보관된 NAS 또는 로컬 폴더 경로"
                                />
                            </div>
                        </div>

                        {isAdmin && (
                            <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-1">
                                {isElectron && (
                                    <button 
                                        onClick={handleSetupSharedFolder}
                                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
                                    >
                                        <FolderOpen size={16} /> 폴더 변경하기
                                    </button>
                                )}
                                <button 
                                    onClick={handleDisableSharing}
                                    className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    설정 초기화
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
        
        {/* Bottom Tips */}
        <div className="bg-slate-50 dark:bg-slate-900/50 px-10 py-6 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
                <Info size={16} className="text-blue-500" />
                <span>데이터는 클라우드Hub에 안전하게 저장되며, 위 경로는 실제 파일을 열기 위한 용도로만 사용됩니다.</span>
            </div>
            <a href="#" className="text-blue-600 font-bold text-sm hover:underline">클라우드 보안 가이드 보기</a>
        </div>
      </div>
    </div>
  );
};
