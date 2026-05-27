
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { NasConfig } from '../../types';
import { Globe, CheckCircle, FolderOpen, RefreshCw, Info, Settings2, Laptop } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const NasManager: React.FC = () => {
  const [config, setConfig] = useState<NasConfig>({ isEnabled: false, path: '', status: 'disconnected' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
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

  // 직원을 위한 간단한 상태 대시보드 렌더링
  if (!isAdmin) {
    const isConnected = config.isEnabled && config.status === 'connected';

    return (
      <div className="max-w-4xl p-8 space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Globe size={22} />
              </div>
              클라우드 / NAS 연결 상태
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
              상위 관리자가 지정한 클라우드 및 사내 NAS 연동 상태를 실시간으로 모니터링합니다.
            </p>
          </div>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shrink-0 shadow-inner
                ${isConnected ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-900/30 text-slate-400'}`}
              >
                <Globe size={48} className={isConnected ? "animate-pulse" : ""} />
              </div>
              <div className="flex-1 text-center md:text-left space-y-4">
                <div className="space-y-1.5">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider
                    ${isConnected ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-600' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-400'}`}
                  >
                    <CheckCircle size={10} /> 
                    {isConnected ? '정상 작동 중' : '연결 대기 상태'}
                  </div>
                  <h4 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {isConnected ? '클라우드 허브 정상 연결됨' : '관리자 설정 대기 중'}
                  </h4>
                </div>

                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                  {isConnected 
                    ? '상위 관리자가 설정한 회사의 공동 클라우드 및 NAS 연결이 정상 작동 중입니다. 작업 데이터가 실시간으로 안전하게 동기화됩니다.' 
                    : '회사의 클라우드 동기화 또는 NAS 저장소가 아직 연결되지 않았거나 연동 대기 상태입니다. 상위 관리자가 시스템 설정을 완료하면 자동으로 동기화가 활성화됩니다.'}
                </p>

                {isConnected && config.path && (
                  <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <div className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0 border border-slate-100 dark:border-slate-700">Storage Path</div>
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 truncate">
                      {config.path}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-900/50 px-8 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 text-slate-500 dark:text-slate-400 text-xs">
            <Info size={14} className="text-blue-500 shrink-0" />
            <span>본 화면은 일반 직원 계정용 조회 전용 뷰입니다. 서버 폴더 경로 변경은 관리자(대표자) 계정으로 로그인해야 가능합니다.</span>
          </div>
        </div>
      </div>
    );
  }

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
                        <div className="space-y-6 flex flex-col items-center w-full">
                            <div className="inline-block p-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-[2rem] text-blue-800 dark:text-blue-300 text-left max-w-xl shadow-sm w-full">
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

                            {isAdmin && (
                                <div className="w-full max-w-xl bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mt-4 space-y-4 text-left animate-in fade-in duration-300">
                                    <h5 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                        <Settings2 size={16} className="text-blue-600"/>
                                        수동 폴더 경로 입력 (관리자용)
                                    </h5>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        웹 브라우저의 보안 정책상 폴더 선택창을 직접 띄울 수 없습니다. 아래에 사내 NAS 경로 또는 공용 공유 폴더의 절대 경로(예: <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">\\192.168.0.100\EzPrintShared</code> 또는 <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">C:\EzPrintShared</code>)를 직접 입력해 주세요.
                                    </p>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text"
                                            value={config.path || ''}
                                            onChange={(e) => setConfig({ ...config, path: e.target.value })}
                                            placeholder="예: \\192.168.0.100\EzPrintShared 또는 C:\EzPrintShared"
                                            className="flex-1 p-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={handleSetupSharedFolder}
                                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95"
                                        >
                                            경로 저장
                                        </button>
                                    </div>
                                </div>
                            )}
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

            {/* 공용 공유 폴더 가이드 상시 노출 */}
            <div className="mt-8 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 text-left text-xs text-slate-600 dark:text-slate-400 space-y-3 shadow-inner">
                <h5 className="font-extrabold text-amber-800 dark:text-amber-400 flex items-center gap-1.5 text-sm">
                    📁 사내 공용 공유 폴더 설정 방법 안내 (공유 가이드)
                </h5>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    작업 데이터를 직원들이 함께 열고 공유하려면 사내 PC 한 대를 메인으로 지정해 폴더를 공유하거나 NAS를 도입하셔야 합니다.
                </p>
                <ol className="list-decimal list-inside space-y-1.5 leading-relaxed text-slate-600 dark:text-slate-400">
                    <li><strong>폴더 생성:</strong> 메인 PC의 C: 또는 D드라이브 경로에 <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">EzPrintShared</code> 폴더를 만듭니다.</li>
                    <li><strong>네트워크 공유:</strong> 폴더 우클릭 &gt; [속성] &gt; [공유] 탭 &gt; [공유(S)...]를 누른 후 <span className="font-bold text-amber-800 dark:text-amber-400">Everyone</span>을 추가하고 권한을 <strong>읽기/쓰기</strong>로 부여합니다.</li>
                    <li><strong>공유 경로 파악:</strong> 같은 네트워크 내의 직원 PC에서 접속 가능한 윈도우 네트워크 경로(예: <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">\\메인PC이름\EzPrintShared</code> 또는 메인PC의 고정 IP인 <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">\\192.168.0.XX\EzPrintShared</code>)를 메모합니다.</li>
                    <li><strong>경로 입력 및 저장:</strong> 위 경로를 이곳 저장 폴더(Storage Path) 란에 저장하고 모든 직원들도 동일한 경로를 적용하면, 실시간 공유 및 작업 파일 자동 열기 기능이 완벽하게 작동합니다!</li>
                </ol>
            </div>
        </div>
        
        {/* Bottom Tips */}
        <div className="bg-slate-50 dark:bg-slate-900/50 px-10 py-6 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
                <Info size={16} className="text-blue-500" />
                <span>데이터는 클라우드Hub에 안전하게 저장되며, 위 경로는 실제 파일을 열기 위한 용도로만 사용됩니다.</span>
            </div>
            <button onClick={() => setShowSecurityModal(true)} className="text-blue-600 font-bold text-sm hover:underline">클라우드 보안 가이드 보기</button>
        </div>
      </div>

      {/* 클라우드 보안 가이드 모달 */}
      {showSecurityModal && (
        <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowSecurityModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h4 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Globe size={20} className="text-blue-600" />
                🛡️ Cloud Hub 보안 및 공유 기술 가이드
              </h4>
              <button onClick={() => setShowSecurityModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1">닫기</button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] custom-scrollbar text-left text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="space-y-2">
                <h5 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">🔑 1. 데이터 보안 및 실시간 암호화</h5>
                <p className="text-xs">
                  클라우드 허브(Cloud Hub)와 로컬 PC/NAS 간의 모든 데이터 전송은 SSL/TLS 256비트 표준 군용 수준 암호화 터널을 통해 안전하게 암호화 전송됩니다. 외부 해킹이나 스니핑 공격으로부터 철저히 보호받습니다.
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">📁 2. 하이브리드 로컬-클라우드 아키텍처</h5>
                <p className="text-xs">
                  작업 파일(일반 대용량 원본 파일 등)은 사용자가 직접 설정한 사내의 안전한 <strong>로컬 디스크/NAS 또는 공용 공유 폴더</strong>에 그대로 머무릅니다. 클라우드 허브는 파일의 위치 경로 메타데이터와 중요 작업 정보만 동기화하므로, 대용량 파일이 무단 외부로 업로드되거나 유출될 우려가 전혀 없는 지능적인 하이브리드 모델을 채택하고 있습니다.
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">💻 3. 사내 공유 폴더 구축 방법 (다자간 동시 공유 권장)</h5>
                <p className="text-xs">
                  회사의 메인 PC 또는 NAS에 공용 공유 폴더를 생성하면 모든 직원이 동일한 실제 파일을 언제든 더블 클릭하여 열 수 있어 협업 시 최고의 효율을 낼 수 있습니다.
                </p>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-2">
                  <p className="font-bold text-slate-700 dark:text-slate-300">💡 윈도우(Windows) 공유 폴더 설정 4단계:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>[1단계]</strong> 메인 PC의 C: 또는 D드라이브 등 안전한 경로에 <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">EzPrintShared</code> 폴더 생성</li>
                    <li><strong>[2단계]</strong> 생성한 폴더 우클릭 &gt; [속성] &gt; [공유] 탭 선택 &gt; [공유] 단추 클릭</li>
                    <li><strong>[3단계]</strong> 선택 창에서 <span className="font-bold">Everyone</span>을 추가하고, 사용 권한 수준을 <strong>읽기/쓰기</strong>로 변경 및 저장</li>
                    <li><strong>[4단계]</strong> 네트워크 경로(예: <code className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">\\사용자PC이름\EzPrintShared</code>)를 복사하여 대표님/직원 설정에 입력</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">🔐 4. 접근 통제 및 접근 로그 관리</h5>
                <p className="text-xs">
                  등록된 인가 직원(SaaS Tenant 테넌트 내 사용자)만이 파일 동기화 경로에 접근할 수 있으며, 관리자 설정 페이지의 모든 이력은 데이터베이스에 안전하게 기록 및 로그화됩니다.
                </p>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button 
                onClick={() => setShowSecurityModal(false)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              >
                가이드 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
