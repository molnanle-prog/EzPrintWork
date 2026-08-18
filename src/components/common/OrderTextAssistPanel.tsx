import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Sparkles, Check, X, Calculator, Package, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Job, JobTypeDefinition } from '../../types';
import { db } from '../../services/dataService';
import {
  applyOrderTextParse,
  formatParseFieldValue,
  parseOrderText,
  OrderTextParseResult,
} from '../../utils/orderTextParse';

interface OrderTextAssistPanelProps {
  job: Job;
  productDefs: JobTypeDefinition[];
  processingOptions: string[];
  onApply: (next: Job) => void;
}

export const OrderTextAssistPanel: React.FC<OrderTextAssistPanelProps> = ({
  job,
  productDefs,
  processingOptions,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<OrderTextParseResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canUseMail = typeof window !== 'undefined' && !!window.electron?.mailInboxList;
  const [mailOpen, setMailOpen] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailReading, setMailReading] = useState<number | null>(null);
  const [mailError, setMailError] = useState('');
  const [mailRows, setMailRows] = useState<{ uid: number; from: string; subject: string; date: string | null }[]>([]);

  const analyzeFrom = (raw: string) => {
    const parsed = parseOrderText(raw, {
      products: productDefs,
      processingOptions,
      clientNames: db.getClients().map((c) => c.name),
      ownCompanyName: db.getCompanyInfo()?.name,
    });
    setResult(parsed);
  };

  const handleAnalyze = () => analyzeFrom(text);

  const loadMailList = async () => {
    if (!window.electron?.mailInboxList) return;
    setMailLoading(true);
    setMailError('');
    try {
      const cfg = await window.electron.mailInboxGet?.();
      if (!cfg?.configured || !cfg.hasPassword) {
        setMailError('회사 정보에서 받는 메일함을 먼저 연결해 주세요.');
        setMailRows([]);
        return;
      }
      const res = await window.electron.mailInboxList({ limit: 40 });
      if (!res.ok) {
        setMailError(res.error || '메일 목록을 가져오지 못했습니다.');
        setMailRows([]);
        return;
      }
      setMailRows(res.messages || []);
      if (!res.messages?.length) setMailError('받은편지함이 비어 있습니다.');
    } finally {
      setMailLoading(false);
    }
  };

  const pickMail = async (uid: number) => {
    if (!window.electron?.mailInboxRead) return;
    setMailReading(uid);
    setMailError('');
    try {
      const res = await window.electron.mailInboxRead(uid);
      if (!res.ok || !res.text) {
        setMailError(res.error || '메일 본문을 읽지 못했습니다.');
        return;
      }
      setText(res.text);
      analyzeFrom(res.text);
    } finally {
      setMailReading(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleItemField = (itemIdx: number, fieldIdx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) => {
        if (i !== itemIdx) return item;
        return {
          ...item,
          fields: item.fields.map((f, fi) => (fi === fieldIdx ? { ...f, included: !f.included } : f)),
        };
      });
      return { ...prev, items };
    });
  };

  const toggleJobField = (fieldIdx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const jobFields = prev.jobFields.map((f, i) => (i === fieldIdx ? { ...f, included: !f.included } : f));
      return { ...prev, jobFields };
    });
  };

  const handleApply = () => {
    if (!result) return;
    onApply(applyOrderTextParse(job, result, productDefs));
    setOpen(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const plain = e.clipboardData.getData('text/plain');
    if (!plain) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const inserted = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const next = text.slice(0, start) + inserted + text.slice(end);
    setText(next);
    setResult(null);
    requestAnimationFrame(() => {
      const pos = start + inserted.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const hasHits = !!result && (result.items.length > 0 || result.jobFields.length > 0);
  const canAnalyze = text.trim().length >= 4 && productDefs.length > 0;

  return (
    <div className="bg-white border border-violet-100 rounded-lg p-2 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-1 py-0.5 text-left"
      >
        <span className="text-[11px] font-bold text-violet-700 flex items-center gap-1">
          <ClipboardPaste size={11} /> 문자·통화·이메일 넣기
        </span>
        <span className="text-[9px] font-bold text-violet-500">
          {text.trim() ? '다시 열기' : '창 열기'}
        </span>
      </button>
      <p className="px-1 pt-0.5 text-[9px] text-slate-400 leading-snug">
        이메일·문자·통화 글을 붙여 넣거나, PC에서는 메일함에서 골라 분석합니다.
      </p>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center p-4 backdrop-blur-sm">
          <div
            className="bg-white w-full max-w-6xl h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200 flex items-start justify-between gap-3 bg-violet-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ClipboardPaste className="text-violet-600" size={20} />
                  문자·통화·이메일 넣기
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  글자만 가져옵니다. 굵기·색·표 모양은 무시하고, 줄바꿈은 그대로 둡니다.
                  PC에서 메일함을 연결했다면 목록에서 고를 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-violet-100"
                title="닫기"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 p-4 gap-2">
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <label className="text-xs font-bold text-slate-600">원문</label>
                  {canUseMail && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !mailOpen;
                          setMailOpen(next);
                          if (next && mailRows.length === 0) void loadMailList();
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100"
                      >
                        <Inbox size={12} /> 메일함에서 넣기
                      </button>
                      {mailOpen && (
                        <button
                          type="button"
                          onClick={() => void loadMailList()}
                          disabled={mailLoading}
                          className="p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                          title="목록 새로고침"
                        >
                          {mailLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {mailOpen && canUseMail && (
                  <div className="shrink-0 max-h-44 overflow-y-auto custom-scrollbar rounded-lg border border-violet-100 bg-violet-50/50">
                    {mailError && <p className="px-2.5 py-2 text-[11px] text-amber-800">{mailError}</p>}
                    {!mailError && mailLoading && (
                      <p className="px-2.5 py-2 text-[11px] text-slate-500">메일 목록을 불러오는 중…</p>
                    )}
                    {mailRows.map((row) => (
                      <button
                        key={row.uid}
                        type="button"
                        onClick={() => void pickMail(row.uid)}
                        disabled={mailReading !== null}
                        className="w-full text-left px-2.5 py-1.5 border-b border-violet-50 last:border-b-0 hover:bg-white disabled:opacity-50"
                      >
                        <p className="text-[11px] font-bold text-slate-800 truncate">
                          {mailReading === row.uid ? '읽는 중… ' : ''}
                          {row.subject}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {row.from}
                          {row.date ? ` · ${new Date(row.date).toLocaleString('ko-KR')}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setResult(null);
                  }}
                  onPaste={handlePaste}
                  spellCheck={false}
                  className="flex-1 min-h-[240px] w-full p-3 rounded-lg border border-slate-300 bg-slate-50 text-[13px] leading-relaxed text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500 whitespace-pre-wrap break-words resize-none font-sans"
                  placeholder={'받은 이메일, 문자, 통화 글을 그대로 붙여 넣으세요.\n줄바꿈은 유지되고 글자 꾸미기는 빠집니다.'}
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                  >
                    <Sparkles size={14} /> 분석
                  </button>
                  {text.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setText('');
                        setResult(null);
                        textareaRef.current?.focus();
                      }}
                      className="px-2.5 py-1.5 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100"
                    >
                      비우기
                    </button>
                  )}
                  {result && (
                    <span className="text-xs text-slate-500">
                      {result.intent === 'quote' ? '견적의뢰' : '작업 발주'}
                      {hasHits ? ` · 품목 ${result.items.length}개` : ' · 채울 칸 없음'}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full lg:w-[40%] min-h-0 flex flex-col p-4 bg-slate-50/80">
                <p className="text-xs font-bold text-slate-600 mb-2 shrink-0">분석 결과</p>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
                  {!result && (
                    <div className="text-[11px] text-slate-400 leading-relaxed space-y-1.5">
                      <p>왼쪽 글을 붙여 넣거나, 메일함에서 고른 뒤 분석을 누르세요.</p>
                      <p className="font-bold text-slate-500">찾는 항목</p>
                      <p>거래처 · 담당자 · 연락처 · 제목 · 납기 · 우선순위 · 총액</p>
                      <p>품목 · 규격 · 수량 · 용지 · 평량 · 인쇄도수 · 후가공</p>
                      <p>견적의뢰와 작업 발주는 따로 표시됩니다.</p>
                    </div>
                  )}
                  {result && (
                    <div
                      className={`rounded-md border p-2 ${
                        result.intent === 'quote'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-emerald-200 bg-emerald-50'
                      }`}
                    >
                      <p className={`text-[11px] font-bold flex items-center gap-1 ${
                        result.intent === 'quote' ? 'text-amber-800' : 'text-emerald-800'
                      }`}>
                        {result.intent === 'quote' ? <Calculator size={13} /> : <Package size={13} />}
                        {result.intent === 'quote' ? '견적의뢰' : '작업 발주'}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${
                        result.intent === 'quote' ? 'text-amber-700/90' : 'text-emerald-700/90'
                      }`}>
                        {result.intent === 'quote'
                          ? `견적으로 보입니다 (${result.intentEvidence}). 칸은 채우고 금액은 확정하지 않습니다.`
                          : `작업 접수로 보입니다 (${result.intentEvidence}).`}
                      </p>
                    </div>
                  )}
                  {result && !hasHits && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-2">
                      채울 칸을 찾지 못했습니다. 품목명·수량·용지가 글에 들어 있는지 확인해 주세요.
                    </p>
                  )}
                  {result && result.jobFields.length > 0 && (
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-700 mb-1">접수 정보</p>
                      <div className="space-y-0.5">
                        {result.jobFields.map((field, fieldIdx) => (
                          <label key={field.key} className="flex items-start gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.included}
                              onChange={() => toggleJobField(fieldIdx)}
                              className="mt-0.5 rounded border-slate-300 text-violet-600"
                            />
                            <span>
                              <span className="font-bold text-slate-700">{field.label}</span>{' '}
                              {typeof field.value === 'number' ? `${field.value.toLocaleString()}원` : String(field.value)}
                              <span className="text-slate-400 ml-1">({field.evidence})</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {result && hasHits && result.items.map((item, itemIdx) => (
                    <div key={`${item.type}-${itemIdx}`} className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-700 mb-1">품목 {itemIdx + 1}. {item.type}</p>
                      <div className="space-y-0.5">
                        {item.fields.map((field, fieldIdx) => (
                          <label key={field.key} className="flex items-start gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.included}
                              onChange={() => toggleItemField(itemIdx, fieldIdx)}
                              className="mt-0.5 rounded border-slate-300 text-violet-600"
                            />
                            <span>
                              <span className="font-bold text-slate-700">{field.label}</span>{' '}
                              {formatParseFieldValue(field)}
                              <span className="text-slate-400 ml-1">({field.evidence})</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {result && result.skipped.length > 0 && (
                    <div className="rounded-md border border-amber-100 bg-amber-50/70 p-2 space-y-0.5">
                      <p className="text-[11px] font-bold text-amber-800">넣지 않은 내용</p>
                      {result.skipped.map((row, idx) => (
                        <p key={`${row.label}-${idx}`} className="text-[10px] text-amber-800/90">
                          {row.label}: {row.reason} ({row.evidence})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {result && hasHits && (
                  <div className="pt-3 shrink-0 space-y-1.5">
                    <button
                      type="button"
                      onClick={handleApply}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold bg-violet-600 text-white hover:bg-violet-700"
                    >
                      <Check size={15} />
                      {result.intent === 'quote' ? '견적 내용으로 칸 채우기' : '선택한 칸 채우기'}
                    </button>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      저장은 되지 않습니다. 칸을 확인한 뒤 접수 저장을 누르세요. 원문은 추가 메모에 남깁니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
