import React from 'react';
import { ArrowUpRight, Sparkles, Zap } from 'lucide-react';
import { EZIMPO_PROMO_URL } from '../../constants/ezimpoPromo';

const EZIMPO_ICON_SRC = '/ezimpo-icon.png';

const EzImpoIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img
    src={EZIMPO_ICON_SRC}
    alt=""
    aria-hidden
    className={`object-cover ${className}`}
    draggable={false}
  />
);

export type EzImpoPromoSize =
  | '300x250'
  | '336x280'
  | '250x250'
  | '200x200'
  | '234x60'
  | 'auto';

interface EzImpoPromoBannerProps {
  size?: EzImpoPromoSize;
  className?: string;
}

const sizeClasses: Record<EzImpoPromoSize, string> = {
  '300x250': 'w-[300px] h-[250px]',
  '336x280': 'w-[336px] h-[280px]',
  '250x250': 'w-[250px] h-[250px]',
  '200x200': 'w-[200px] h-[200px]',
  '234x60': 'w-[234px] h-[60px]',
  auto: 'w-full min-h-[100px]',
};

/** 광고 슬롯용 EzImpo 자체 홍보 배너 */
export const EzImpoPromoBanner: React.FC<EzImpoPromoBannerProps> = ({
  size = 'auto',
  className = '',
}) => {
  const isCompact = size === '234x60';

  if (isCompact) {
    return (
      <a
        href={EZIMPO_PROMO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`
          group relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-blue-500/25
          bg-gradient-to-r from-slate-900 via-[#0f172a] to-slate-900 px-2.5 py-1.5
          shadow-lg shadow-blue-900/20 transition-all duration-300
          hover:border-blue-400/50 hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-[0.99]
          ${sizeClasses[size]} ${className}
        `}
        aria-label="EzImpo Studio — PDF 하리꼬미 자동 터잡기 프로그램 소개"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_50%,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg shadow-md ring-1 ring-white/10">
          <EzImpoIcon className="h-full w-full" />
        </div>
        <div className="relative min-w-0 flex-1">
          <p className="truncate text-[11px] font-black tracking-tight text-white leading-none">
            EzImpo Studio
          </p>
          <p className="truncate text-[9px] font-semibold text-blue-200/80 mt-0.5">
            PDF 하리꼬미 · 몇 초면 끝
          </p>
        </div>
        <ArrowUpRight
          size={14}
          className="relative shrink-0 text-blue-300 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
        />
      </a>
    );
  }

  return (
    <a
      href={EZIMPO_PROMO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        group relative flex flex-col overflow-hidden rounded-xl border border-blue-500/20
        bg-gradient-to-br from-[#0b1220] via-[#111827] to-[#0f172a]
        shadow-xl shadow-blue-950/40 transition-all duration-300
        hover:border-blue-400/40 hover:shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.99]
        ${sizeClasses[size]} ${className}
      `}
      aria-label="EzImpo Studio — 인쇄 전문가용 자동 하리꼬미 프로그램 소개"
    >
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/15 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
      </div>

      <div className="relative flex flex-1 flex-col p-4">
        {/* 상단 라벨 */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-200/90">
            <Sparkles size={9} />
            Ez-Hub Pick
          </span>
          <span className="text-[9px] font-bold text-slate-500">DESKTOP</span>
        </div>

        {/* 로고 + 타이틀 */}
        <div className="mb-3 flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10">
            <EzImpoIcon className="h-full w-full" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-base font-black tracking-tight text-white leading-tight">
              EzImpo Studio
            </h3>
            <p className="mt-0.5 text-[10px] font-semibold text-teal-300/90">
              전문가용 자동 하리꼬미
            </p>
          </div>
        </div>

        {/* 카피 */}
        <p className="mb-3 text-[11px] font-medium leading-relaxed text-slate-300/95">
          복잡한 PDF 판형 배치를
          <span className="font-black text-white"> 클릭 한 번</span>으로.
          <br />
          합판·독판·터잡기, 한국 현장 맞춤 UI.
        </p>

        {/* 특징 칩 */}
        <div className="mb-auto flex flex-wrap gap-1.5">
          {['3초 조판', 'AI 분석', '영구 라이선스'].map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-blue-400/25 bg-gradient-to-r from-blue-600/90 to-violet-600/90 px-3 py-2 shadow-md shadow-blue-900/30 transition-colors group-hover:from-blue-500 group-hover:to-violet-500">
          <div className="flex items-center gap-1.5 min-w-0">
            <Zap size={13} className="shrink-0 fill-white text-white" />
            <span className="truncate text-[11px] font-black text-white">무료 체험 · 자세히 보기</span>
          </div>
          <ArrowUpRight
            size={15}
            className="shrink-0 text-white/90 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>
      </div>
    </a>
  );
};
