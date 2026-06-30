import React, { useState, useEffect, useRef } from 'react';
import { db, formatPhoneNumber, formatBusinessNumber } from '../../services/dataService';
import { CompanyInfo, QuoteTemplateSettings } from '../../types';
import { Building, Save, Check, Copy, History, Search, Image, Upload } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';

export const CompanyInfoManager: React.FC = () => {
  const [info, setInfo] = useState<CompanyInfo>({ name: '' });
  const [quoteTemplate, setQuoteTemplate] = useState<QuoteTemplateSettings>({ headerHeightMm: 17 });
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const { showAlert } = useDialog();
  const { currentUser } = useAuth();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInfo(db.getCompanyInfo());
    setQuoteTemplate(db.getQuoteTemplate());
  }, []);

  const handleCopyCode = () => {
    if (currentUser?.tenantId) {
        navigator.clipboard.writeText(currentUser.tenantId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!info.name.trim()) {
        await showAlert('상호명은 필수 입력 항목입니다.');
        return;
    }
    try {
        await db.saveCompanyInfo(info);
        await db.saveQuoteTemplate(quoteTemplate);
        await showAlert('회사 정보가 저장되었습니다.\n화면 상단의 상호명이 업데이트됩니다.');
    } catch (error) {
        await showAlert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleHeaderImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      await showAlert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    setIsUploadingHeader(true);
    try {
      const url = await db.uploadQuoteHeaderImage(file);
      const next = { ...quoteTemplate, headerImageUrl: url };
      setQuoteTemplate(next);
      await db.saveQuoteTemplate(next);
      await showAlert('견적서 헤더 이미지가 업로드되었습니다.\n견적 문서마다 저장되지 않고 설정에서 불러옵니다.');
    } catch (error) {
      await showAlert('헤더 이미지 업로드에 실패했습니다.');
    } finally {
      setIsUploadingHeader(false);
    }
  };

  const handleChange = (field: keyof CompanyInfo, value: string) => {
      let finalValue = value;
      if (field === 'phone' || field === 'fax') {
          finalValue = formatPhoneNumber(value);
      } else if (field === 'businessNumber') {
          finalValue = formatBusinessNumber(value);
      }
      setInfo({ ...info, [field]: finalValue });
  };

  const handleAddressSearch = () => {
    const scriptId = 'daum-postcode-script';
    const existingScript = document.getElementById(scriptId);

    const openPostcode = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          let fullAddress = data.address;
          let extraAddress = '';

          if (data.addressType === 'R') { // 도로명 주소
            if (data.bname !== '') {
              extraAddress += data.bname;
            }
            if (data.buildingName !== '') {
              extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
            }
            fullAddress += extraAddress !== '' ? ` (${extraAddress})` : '';
          }

          setInfo(prev => ({ ...prev, address: fullAddress }));
        }
      }).open();
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload = openPostcode;
      script.onerror = () => {
        alert('주소 검색 서비스를 불러오는 데 실패했습니다. 네트워크 연결을 확인해주세요.');
      };
      document.body.appendChild(script);
    } else {
      openPostcode();
    }
  };

  const inputClass = "w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
         <Building className="text-blue-600 dark:text-blue-400" />
         회사 정보 관리 (사용자 정보)
      </h3>

      <div className="space-y-6">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 p-6 rounded-xl mb-6">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                    <Check size={18} /> 회사 입장 코드가 생성되었습니다
                </h4>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  직원들이 회원가입 후 '회사 참여하기' 단계에서 아래 코드를 입력하면 이 회사(테넌트)로 소속됩니다.
              </p>
              <div className="flex items-center gap-2">
                  <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-lg border-2 border-emerald-200 dark:border-emerald-800 font-mono text-lg font-bold flex-1 select-all text-emerald-600 dark:text-emerald-400">
                      {currentUser?.tenantId}
                  </div>
                  <button 
                    onClick={handleCopyCode}
                    className={`p-3 rounded-lg flex items-center gap-2 font-bold transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600'}`}
                  >
                      {copied ? <Check size={20} /> : <Copy size={20} />}
                      {copied ? '복사됨' : '코드 복사'}
                  </button>
              </div>
          </div>

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
                  <div className="flex gap-2">
                      <input 
                        type="text"
                        value={info.address || ''}
                        onChange={e => handleChange('address', e.target.value)}
                        className={inputClass}
                        placeholder="도로명 주소 검색 또는 상세 주소 입력"
                      />
                      <button
                        type="button"
                        onClick={handleAddressSearch}
                        className="px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-all flex items-center gap-1.5 active:scale-95 shrink-0 shadow-md"
                      >
                        <Search size={15} />
                        주소 검색
                      </button>
                  </div>
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

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Image size={18} className="text-indigo-500" />
              견적서 헤더 이미지 (관리자 전용)
            </h3>

            <div className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                견적서 <strong>맨 위 영역</strong>(「견적서」제목·작업번호·발행일이 나오는 부분)을 회사 이미지로 바꿉니다.
                이미지를 등록하지 않으면 지금처럼 기본 견적서 헤더가 표시됩니다.
              </p>
              <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 p-3 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                <p className="font-bold text-indigo-700 dark:text-indigo-300 mb-2">헤더 제작 기준 (A4 가로 210mm)</p>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li>
                    <strong>화면 예시 비율</strong>: 가로 <strong>828px × 세로 120px</strong>
                    <span className="text-slate-500"> (지금 견적서 상단과 같은 비율)</span>
                  </li>
                  <li>
                    <strong>인쇄·PDF용 권장</strong>: 가로 <strong>2480 × 360px</strong> (300dpi) 또는 <strong>1656 × 240px</strong> (200dpi)
                  </li>
                  <li>가로는 A4 전체 너비(210mm)에 맞추고, 세로는 위 비율을 유지하세요.</li>
                  <li>PNG·JPG·WEBP, 배경 포함 디자인 권장 (로고·상호·연락처·색상 등)</li>
                </ul>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                <strong>만드는 방법 예시</strong> — Canva·Photoshop·한글 등에서 캔버스 가로 828px·세로 120px로 만들고,
                디자인 후 PNG로 저장해 업로드하세요. 인쇄 품질이 필요하면 같은 비율로 2~3배 크게 제작해도 됩니다.
                업로드 후 견적서에서 잘리면 아래 <strong>헤더 높이(mm)</strong>를 17~35mm 사이에서 조절하세요.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                이미지는 회사 설정에 <strong>1장만</strong> 저장되며, 견적 문서마다 복사되지 않습니다.
              </p>
            </div>

            {quoteTemplate.headerImageUrl && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white">
                <img
                  src={quoteTemplate.headerImageUrl}
                  alt="견적서 헤더 미리보기"
                  className="w-full max-h-32 object-cover object-top"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={headerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleHeaderImageUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => headerInputRef.current?.click()}
                disabled={isUploadingHeader}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold flex items-center gap-2"
              >
                <Upload size={16} />
                {isUploadingHeader ? '업로드 중…' : '헤더 이미지 업로드'}
              </button>
              {quoteTemplate.headerImageUrl && (
                <button
                  type="button"
                  onClick={() => setQuoteTemplate((prev) => ({ ...prev, headerImageUrl: undefined }))}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300"
                >
                  헤더 제거
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                헤더 높이(mm)
                <input
                  type="number"
                  min={17}
                  max={80}
                  value={quoteTemplate.headerHeightMm ?? 17}
                  onChange={(e) =>
                    setQuoteTemplate((prev) => ({
                      ...prev,
                      headerHeightMm: Number(e.target.value) || 17,
                    }))
                  }
                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-center"
                />
              </label>
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
