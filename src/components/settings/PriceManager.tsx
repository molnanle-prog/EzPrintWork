
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { PricingConfig } from '../../types';
import { Calculator, Save } from 'lucide-react';

export const PriceManager: React.FC = () => {
  const [config, setConfig] = useState<PricingConfig>({ baseLaborCost: 0, printColorCost: 0, marginRate: 0 });

  useEffect(() => {
    setConfig(db.getPricingConfig());
  }, []);

  const handleSave = () => {
    db.savePricingConfig(config);
    alert('저장되었습니다.');
  };

  const inputClass = "w-full p-2 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
         <Calculator className="text-blue-600 dark:text-blue-400" />
         견적 기초 단가 관리
      </h3>

      <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">기본 공임 (시작 단가)</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        value={config.baseLaborCost}
                        onChange={e => setConfig({...config, baseLaborCost: Number(e.target.value)})}
                        className={inputClass}
                      />
                      <span className="text-slate-500 dark:text-slate-400 font-bold">원</span>
                  </div>
                  <p className="text-xs text-slate-400">모든 견적에 기본적으로 포함되는 최소 공임비입니다.</p>
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">도수당 인쇄비 (Click Charge)</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        value={config.printColorCost}
                        onChange={e => setConfig({...config, printColorCost: Number(e.target.value)})}
                        className={inputClass}
                      />
                      <span className="text-slate-500 dark:text-slate-400 font-bold">원</span>
                  </div>
                  <p className="text-xs text-slate-400">디지털 인쇄 시 1도당 추가되는 비용입니다.</p>
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">기본 마진율</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        step="0.1"
                        value={config.marginRate}
                        onChange={e => setConfig({...config, marginRate: Number(e.target.value)})}
                        className={inputClass}
                      />
                      <span className="text-slate-500 dark:text-slate-400 font-bold">배</span>
                  </div>
                  <p className="text-xs text-slate-400">원가 대비 권장 소비자가 비율 (예: 1.6 = 60% 마진)</p>
              </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-colors">
                  <Save size={18} />
                  설정 저장
              </button>
          </div>
      </div>
    </div>
  );
};
