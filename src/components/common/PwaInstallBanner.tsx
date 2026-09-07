import React, { useEffect, useMemo, useState } from 'react';
import { Smartphone, Share, X } from 'lucide-react';
import { isMobileWebClient } from '../../utils/touchDevice';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'ezpw_pwa_install_dismissed';

export const PwaInstallBanner: React.FC = () => {
  const mobile = useMemo(() => isMobileWebClient(), []);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!mobile) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      setHidden(true);
      return;
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setHidden(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) setShowIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [mobile]);

  if (!mobile || hidden) return null;
  if (!deferred && !showIosHint) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
    setHidden(true);
  };

  return (
    <div className="mx-3 mt-2 mb-1 rounded-xl border border-blue-400/30 bg-blue-600/15 px-3 py-2 flex items-start gap-2 text-sm">
      <Smartphone size={18} className="shrink-0 mt-0.5 text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-100">홈 화면에 추가하면 앱처럼 실행됩니다</p>
        {deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            className="mt-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
          >
            홈 화면에 추가
          </button>
        ) : (
          <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">
            Safari 하단 <Share size={12} className="inline mb-0.5" /> 공유 → <strong>홈 화면에 추가</strong>
          </p>
        )}
      </div>
      <button type="button" onClick={dismiss} className="p-1 text-slate-400" aria-label="닫기">
        <X size={16} />
      </button>
    </div>
  );
};
