import React, { useEffect, useMemo, useState } from 'react';
import { Share, Smartphone } from 'lucide-react';
import { isMobileWebClient } from '../../utils/touchDevice';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 휴대폰·태블릿 웹에서만. 누르면 홈 화면 아이콘으로 바로 들어오게 한다. */
export const HomeScreenAddButton: React.FC = () => {
  const mobile = useMemo(() => isMobileWebClient(), []);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (!mobile) return;
    setStandalone(isStandaloneDisplay());
    setIos(isIosBrowser());

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [mobile]);

  if (!mobile || standalone) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
    if (isStandaloneDisplay()) setStandalone(true);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-300 flex items-center justify-center shrink-0">
        <Smartphone size={18} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-extrabold text-slate-100">홈 화면에 아이콘 추가</p>
        {deferred ? (
          <p className="text-[11px] text-slate-400 font-medium leading-snug">누르면 다음부터 아이콘으로 바로 들어옵니다.</p>
        ) : ios ? (
          <p className="text-[11px] text-slate-400 font-medium leading-snug">
            Safari <Share size={11} className="inline mb-0.5" /> 공유 → 홈 화면에 추가
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 font-medium leading-snug">브라우저 메뉴에서 홈 화면에 추가를 누르세요.</p>
        )}
      </div>
      {deferred ? (
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold"
        >
          추가
        </button>
      ) : null}
    </div>
  );
};
