import React from 'react';
import { Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useUpdateNotice } from '../../contexts/UpdateNoticeContext';
import { applyWebUpdate } from '../../utils/autoUpdate';
import { hasElectronUpdater } from '../../hooks/useElectronUpdater';

export const PersistentUpdateNotice: React.FC = () => {
  const { notice } = useUpdateNotice();
  if (!notice) return null;

  if (notice.kind === 'web') {
    return (
      <div
        className="fixed top-4 right-4 z-[10050] w-[min(100vw-2rem,22rem)] animate-in slide-in-from-top-2 fade-in duration-300"
        role="alert"
        aria-live="assertive"
      >
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-2xl shadow-blue-500/10 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center gap-2">
            <Sparkles size={18} className="shrink-0" />
            <span className="font-bold text-sm">새 버전 v{notice.version}</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              업데이트를 적용할 때까지 이 알림이 유지됩니다. 최신 기능·수정 사항을 사용하려면 지금 업데이트해 주세요.
            </p>
            <button
              type="button"
              onClick={() => applyWebUpdate()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors active:scale-[0.98]"
            >
              <RefreshCw size={15} />
              지금 업데이트
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { phase, version, percent, message } = notice;

  if (phase === 'downloading') {
    return (
      <div className="fixed top-4 right-4 z-[10050] w-[min(100vw-2rem,22rem)]" role="status" aria-live="polite">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            PC 앱 업데이트 다운로드 중…
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{Math.round(percent ?? 0)}% — 완료될 때까지 잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  if (phase === 'downloaded') {
    return (
      <div className="fixed top-4 right-4 z-[10050] w-[min(100vw-2rem,22rem)]" role="alert" aria-live="assertive">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-600 text-white font-bold text-sm">v{version} 다운로드 완료</div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              설치를 완료해야 최신 PC 앱을 사용할 수 있습니다. 지금 설치하면 앱이 자동으로 재시작됩니다.
            </p>
            <button
              type="button"
              onClick={() => void window.electron?.updaterInstall?.()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
            >
              <Download size={15} />
              지금 설치
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="fixed top-4 right-4 z-[10050] w-[min(100vw-2rem,22rem)]" role="alert" aria-live="assertive">
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-rose-600 text-white font-bold text-sm">PC 업데이트 실패</div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">{message || '네트워크를 확인한 뒤 다시 시도해 주세요.'}</p>
            <button
              type="button"
              onClick={() => void window.electron?.updaterCheck?.()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
            >
              <RefreshCw size={15} />
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  // available
  return (
    <div className="fixed top-4 right-4 z-[10050] w-[min(100vw-2rem,22rem)]" role="alert" aria-live="assertive">
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-2">
          <Download size={18} />
          <span className="font-bold text-sm">PC 앱 v{version} 업데이트</span>
        </div>
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            새 설치본이 있습니다. 업데이트를 받을 때까지 이 알림이 유지됩니다. (바탕화면에 파일이 생기지 않습니다)
          </p>
          <button
            type="button"
            onClick={() => void window.electron?.updaterDownload?.()}
            disabled={!hasElectronUpdater()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold"
          >
            <Download size={15} />
            업데이트 시작
          </button>
        </div>
      </div>
    </div>
  );
};
