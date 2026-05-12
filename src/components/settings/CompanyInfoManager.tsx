
import React, { useState, useEffect } from 'react';
import { db, formatPhoneNumber } from '../../services/dataService';
import { CompanyInfo } from '../../types';
import { Building, Save, Check } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const CompanyInfoManager: React.FC = () => {
  const [info, setInfo] = useState<CompanyInfo>({ name: '' });
  const { showAlert } = useDialog();

  useEffect(() => {
    setInfo(db.getCompanyInfo());
  }, []);

  const handleSave = async () => {
    if (!info.name.trim()) {
        await showAlert('상호명은 필수 입력 항목입니다.');
        return;
    }
    db.saveCompanyInfo(info);
    await showAlert('회사 정보가 저장되었습니다.\n화면 상단의 상호명이 업데이트됩니다.');
  };

  const handleChange = (field: keyof CompanyInfo, value: string) => {
      let finalValue = value;
      if (field === 'phone' || field === 'fax') {
          finalValue = formatPhoneNumber(value);
      }
      setInfo({ ...info, [field]: finalValue });
  };

  const inputClass = "w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
         <Building className="text-blue-600 dark:text-blue-400" />
         회사 정보 관리 (사용자 정보)
      </h3>

      <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-300 mb-6">
              이곳에 입력된 정보는 프로그램 상단의 로고 텍스트, 견적서, 거래명세서 등의 공급자 정보로 사용됩니다.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">상호명 (필수)</label>
                  <input 
                    type="text"
                    value={info.name}
                    onChange={e => handleChange('name', e.target.value)}
                    className={`${inputClass} font-bold`}
                    placeholder="예: 우리인쇄"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">대표자명</label>
                  <input 
                    type="text"
                    value={info.ceoName || ''}
                    onChange={e => handleChange('ceoName', e.target.value)}
                    className={inputClass}
                    placeholder="예: 홍길동"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">사업자등록번호</label>
                  <input 
                    type="text"
                    value={info.businessNumber || ''}
                    onChange={e => handleChange('businessNumber', e.target.value)}
                    className={`${inputClass} font-mono`}
                    placeholder="000-00-00000"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">이메일</label>
                  <input 
                    type="email"
                    value={info.email || ''}
                    onChange={e => handleChange('email', e.target.value)}
                    className={inputClass}
                    placeholder="print@example.com"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">전화번호</label>
                  <input 
                    type="text"
                    value={info.phone || ''}
                    onChange={e => handleChange('phone', e.target.value)}
                    className={inputClass}
                    placeholder="02-000-0000"
                  />
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">팩스번호</label>
                  <input 
                    type="text"
                    value={info.fax || ''}
                    onChange={e => handleChange('fax', e.target.value)}
                    className={inputClass}
                    placeholder="02-000-0000"
                  />
              </div>

              <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">주소</label>
                  <input 
                    type="text"
                    value={info.address || ''}
                    onChange={e => handleChange('address', e.target.value)}
                    className={inputClass}
                    placeholder="서울시 ..."
                  />
              </div>

              <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">계좌정보 (견적서 표시용)</label>
                  <input 
                    type="text"
                    value={info.bankAccount || ''}
                    onChange={e => handleChange('bankAccount', e.target.value)}
                    className={inputClass}
                    placeholder="OO은행 123-456-7890 (예금주: 홍길동)"
                  />
              </div>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button 
                onClick={handleSave} 
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-all active:scale-95"
              >
                  <Save size={18} />
                  저장하기
              </button>
          </div>
      </div>
    </div>
  );
};
