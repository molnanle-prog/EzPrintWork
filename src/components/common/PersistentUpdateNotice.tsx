import React from 'react';
import { Download, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useUpdateNotice } from '../../contexts/UpdateNoticeContext';
import { applyWebUpdate } from '../../utils/autoUpdate';
import { hasElectronUpdater } from '../../hooks/useElectronUpdater';

/** Electron 커스텀 타이틀바(h-10)와 겹치지 않도록 아래로 내림 */
const NOTICE_POSITION = hasElectronUpdater()
  ? 'fixed top-12 lg:top-14 right-4'
  : 'fixed top-4 right-4';

const noticeShellClass =
  'z-[10050] w-[min(100vw-2rem,22rem)] animate-in slide-in-from-top-2 fade-in duration-300';

function NoticeCloseButton({ onClose, label = '닫기' }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute top-2.5 right-2.5 p-1 rounded-md text-white/80 hover:text-white hover:bg-white/15 transition-colors"
      aria-label={label}
      title={label}
    >
      <X size={16} />
    </button>
  );
}

export const PersistentUpdateNotice: React.FC = () => {
  const { notice, clearWebNotice, clearDesktopNotice } = useUpdateNotice();
  if (!notice) return null;

  const positionClass = `${NOTICE_POSITION} ${noticeShellClass}`;

  if (notice.kind === 'web') {
    return (
      <div className={positionClass} role="alert" aria-live="assertive">
        <div className="relative rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-2xl shadow-blue-500/10 overflow-hidden">
          <div className="px-4 py-3 pr-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center gap-2">
            <Sparkles size={18} className="shrink-0" />
            <span className="font-bold text-sm">새 버전 v{notice.version}</span>
          </div>
          <NoticeCloseButton onClose={clearWebNotice} />
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              새 버전이 있습니다. 업데이트하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyWebUpdate()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors active:scale-[0.98]"
              >
                <RefreshCw size={15} />
                확인
              </button>
              <button
                type="button"
                onClick={clearWebNotice}
                className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { phase, version, currentVersion, percent, message } = notice;

  const desktopUpdateTitle =
    currentVersion && version && currentVersion !== version
      ? `v${currentVersion} → v${version} 업데이트`
      : `PC 앱 v${version} 업데이트`;

  if (phase === 'downloading') {
    const pct = Math.min(100, Math.max(0, percent ?? 0));
    const statusText =
      pct >= 99.5
        ? '다운로드 완료 — 설치 준비 중…'
        : `${Math.round(pct)}% — 다운로드 중입니다.`;
    return (
      <div className={positionClass} role="status" aria-live="polite">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            {currentVersion && version && currentVersion !== version
              ? `v${currentVersion} → v${version} 다운로드 중…`
              : `PC 앱 v${version} 다운로드 중…`}
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{statusText}</p>
        </div>
      </div>
    );
  }

  if (phase === 'downloaded' || phase === 'installing') {
    return (
      <div className={positionClass} role="status" aria-live="polite">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 shadow-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-2">
            <Loader2 size={16} className="animate-spin" />
            {currentVersion && version && currentVersion !== version
              ? `v${currentVersion} → v${version}`
              : `v${version}`}{' '}
            {phase === 'downloaded' ? '다운로드 완료 — 자동 설치 중…' : '설치 프로그램 실행 중…'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {message || '기존 프로그램을 닫고 업데이트를 적용합니다. 설치가 끝나면 EzPrintWork가 다시 실행됩니다.'}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={positionClass} role="alert" aria-live="assertive">
        <div className="relative rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 pr-10 bg-rose-600 text-white font-bold text-sm">PC 업데이트 실패</div>
          <NoticeCloseButton onClose={clearDesktopNotice} />
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

  // available — 확인 전까지 다운로드·설치하지 않음
  return (
    <div className={positionClass} role="alert" aria-live="assertive">
      <div className="relative rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 pr-10 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-2">
          <Download size={18} />
          <span className="font-bold text-sm">{desktopUpdateTitle}</span>
        </div>
        <NoticeCloseButton onClose={clearDesktopNotice} label="나중에" />
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {currentVersion && version && currentVersion !== version
              ? `현재 설치된 v${currentVersion}에서 새 버전 v${version}으로 업데이트할 수 있습니다.`
              : '새 버전이 있습니다. 업데이트 시작을 누르면 다운로드가 시작되며, 완료 후 자동으로 설치됩니다.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void window.electron?.updaterDownload?.().then((result) => {
                  if (result?.alreadyLatest) {
                    clearDesktopNotice();
                  }
                });
              }}
              disabled={!hasElectronUpdater()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold"
            >
              <Download size={15} />
              업데이트 시작
            </button>
            <button
              type="button"
              onClick={clearDesktopNotice}
              className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              나중에
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
