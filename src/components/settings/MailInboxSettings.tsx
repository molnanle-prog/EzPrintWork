import React, { useEffect, useState } from 'react';
import { Inbox, Loader2, Mail, Save, Unplug } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

const PRESETS: Record<string, { label: string; host: string; port: number; help: string }> = {
  gmail: {
    label: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    help: 'Gmail 로그인 비밀번호는 쓸 수 없습니다. Google 계정에서 2단계 인증을 켠 뒤, 앱 비밀번호(16자리)를 만들어 넣으세요. 띄어쓰기는 있어도 됩니다.',
  },
  naver: {
    label: '네이버',
    host: 'imap.naver.com',
    port: 993,
    help: '네이버 메일 → 환경설정 → POP3/IMAP에서 IMAP 사용을 켠 뒤, 앱 비밀번호(또는 IMAP 비밀번호)를 넣으세요.',
  },
  daum: {
    label: '다음',
    host: 'imap.daum.net',
    port: 993,
    help: '다음 메일 설정에서 IMAP을 켠 뒤 비밀번호를 넣으세요.',
  },
  outlook: {
    label: 'Outlook',
    host: 'outlook.office365.com',
    port: 993,
    help: '회사 Outlook이면 IMAP이 허용돼 있어야 합니다. 필요하면 앱 비밀번호를 사용하세요.',
  },
  custom: {
    label: '직접 입력',
    host: '',
    port: 993,
    help: '회사 메일 서버의 IMAP 주소와 포트(보통 993)를 넣으세요.',
  },
};

const inputClass =
  'w-full p-2 text-sm border border-violet-200 dark:border-violet-800 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100';

export const MailInboxSettings: React.FC = () => {
  const { showAlert, showConfirm } = useDialog();
  const isElectron = typeof window !== 'undefined' && !!window.electron?.mailInboxGet;
  const [preset, setPreset] = useState('gmail');
  const [host, setHost] = useState(PRESETS.gmail.host);
  const [port, setPort] = useState(String(PRESETS.gmail.port));
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isElectron) return;
    void window.electron.mailInboxGet?.().then((res) => {
      if (!res?.ok) return;
      setConfigured(!!res.configured);
      setHasPassword(!!res.hasPassword);
      const nextPreset = res.preset && PRESETS[res.preset] ? res.preset : res.host ? 'custom' : 'gmail';
      setPreset(nextPreset);
      setHost(res.host || PRESETS[nextPreset].host);
      setPort(String(res.port || PRESETS[nextPreset].port));
      setUser(res.user || '');
    });
  }, [isElectron]);

  const applyPreset = (key: string) => {
    setPreset(key);
    if (key !== 'custom') {
      setHost(PRESETS[key].host);
      setPort(String(PRESETS[key].port));
    }
  };

  const handleSave = async () => {
    if (!window.electron?.mailInboxSave) return;
    setBusy(true);
    setStatus('');
    try {
      const saved = await window.electron.mailInboxSave({
        preset,
        host,
        port: Number(port) || 993,
        secure: true,
        user,
        mailbox: 'INBOX',
        password,
      });
      if (!saved.ok) {
        await showAlert(saved.error || '메일함 저장에 실패했습니다.');
        return;
      }
      setPassword('');
      setHasPassword(!!saved.hasPassword);
      setConfigured(!!saved.configured);
      const tested = await window.electron.mailInboxTest?.();
      if (tested?.ok) {
        setStatus(tested.message || '연결되었습니다.');
      } else {
        await showAlert(tested?.error || '저장은 됐지만 연결 확인에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!window.electron?.mailInboxClear) return;
    const ok = await showConfirm('이 PC에 저장된 메일함 연결을 삭제할까요?');
    if (!ok) return;
    const res = await window.electron.mailInboxClear();
    if (!res.ok) {
      await showAlert(res.error || '삭제에 실패했습니다.');
      return;
    }
    setConfigured(false);
    setHasPassword(false);
    setPassword('');
    setUser('');
    setStatus('');
  };

  if (!isElectron) {
    return (
      <div className="mt-4 rounded-lg border border-violet-100 dark:border-violet-900 bg-white/60 dark:bg-slate-900/40 px-3 py-2.5 text-[11px] text-violet-800/90 dark:text-violet-200/90 leading-relaxed">
        메일함에서 고르는 기능은 <strong>PC 프로그램</strong>에서만 됩니다. 설치본을 연 뒤 여기서 메일함을 연결하세요.
        웹에서는 지금처럼 메일 글을 복사해 붙여 넣으면 됩니다.
      </div>
    );
  }

  const help = PRESETS[preset]?.help || PRESETS.custom.help;

  return (
    <div className="mt-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-white/70 dark:bg-slate-900/40 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h5 className="text-xs font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
            <Inbox size={14} /> 받는 메일함 연결 (반자동)
          </h5>
          <p className="text-[11px] text-violet-800/80 dark:text-violet-300/80 mt-1 leading-relaxed">
            연결해 두면 신규 접수 창에서 메일을 골라 본문을 읽고, 지금처럼 분석한 뒤 칸을 채웁니다. 자동 접수는 하지 않습니다.
            암호는 이 PC에만 암호화되어 저장됩니다.
          </p>
        </div>
        {configured && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            연결됨
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(PRESETS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
              preset === key
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{help}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 space-y-1">
          <span>이메일</span>
          <input
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className={inputClass}
            placeholder="order@company.com"
            autoComplete="off"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 space-y-1">
          <span>앱 비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder={hasPassword ? '저장됨 · 바꾸려면 다시 입력' : '16자리 앱 비밀번호'}
            autoComplete="new-password"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 space-y-1">
          <span>IMAP 서버</span>
          <input
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              setPreset('custom');
            }}
            className={inputClass}
            placeholder="imap.gmail.com"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 space-y-1">
          <span>포트</span>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className={inputClass}
            inputMode="numeric"
          />
        </label>
      </div>

      {status && <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{status}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          저장하고 연결 확인
        </button>
        {configured && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
          >
            <Unplug size={14} /> 연결 삭제
          </button>
        )}
        {(preset === 'gmail' || /gmail\.com/i.test(host)) && (
          <button
            type="button"
            onClick={() => {
              const url = 'https://myaccount.google.com/apppasswords';
              if (window.electron?.openExternal) void window.electron.openExternal(url);
              else window.open(url, '_blank');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-200"
          >
            Gmail 앱 비밀번호 만들기
          </button>
        )}
        <span className="self-center text-[10px] text-slate-400 flex items-center gap-1">
          <Mail size={12} /> 신규 접수 → 문자·통화·이메일 넣기 → 메일함에서 넣기
        </span>
      </div>
    </div>
  );
};
