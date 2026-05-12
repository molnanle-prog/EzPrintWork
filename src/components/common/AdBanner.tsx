
import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'vertical';
  type?: 'solid' | 'dashed'; // New prop for visual style
  size?: '300x250' | '336x280' | '250x250' | '200x200' | '234x60' | 'auto'; // AdSense standard sizes
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ 
  slot, 
  format = 'auto', 
  type = 'dashed',
  size = 'auto',
  className
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const { tenantPlan } = useAuth();

  useEffect(() => {
    if (tenantPlan === 'pro') return;

    const timeoutId = setTimeout(() => {
      try {
        if (adRef.current && !adRef.current.getAttribute('data-adsbygoogle-status')) {
          // @ts-ignore
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch (e: any) {
        if (!e.message || !e.message.includes('already have ads')) {
            console.error('Adsbygoogle error:', e);
        }
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [tenantPlan]);

  if (tenantPlan === 'pro') return null;

  const getSizeClasses = () => {
      switch (size) {
          case '300x250': return 'w-[300px] h-[250px]';
          case '336x280': return 'w-[336px] h-[280px]';
          case '250x250': return 'w-[250px] h-[250px]';
          case '200x200': return 'w-[200px] h-[200px]';
          case '234x60': return 'w-[234px] h-[60px]';
          default: return 'w-full min-h-[100px]';
      }
  };

  return (
    <div className={`
        relative group overflow-hidden rounded-xl border flex items-center justify-center transition-all mx-auto
        ${type === 'solid' ? 'bg-[#8e949e] border-slate-400 dark:border-slate-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'}
        ${getSizeClasses()}
        ${className}
    `}>
      {/* Placeholder UI */}
      {type === 'dashed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-700 m-2 rounded-lg opacity-60 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Advertisement</span>
              </div>
              <p className="text-[9px] text-slate-400/60 dark:text-slate-600 font-bold">Placeholder Area</p>
          </div>
      ) : (
          <div className="flex flex-col items-center justify-center text-slate-200/50">
              {/* Optional: Add icon or text for solid type */}
          </div>
      )}

      <ins 
           ref={adRef}
           className="adsbygoogle relative z-10"
           style={{ display: 'block', width: '100%', height: '100%' }}
           data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" 
           data-ad-slot={slot}
           data-ad-format={format === 'auto' ? undefined : format}
           data-full-width-responsive="true"></ins>
    </div>
  );
};
