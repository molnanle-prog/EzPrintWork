
import React, { useState, useEffect } from 'react';
import { Job } from '../../types';
import { db } from '../../services/dataService';
import { X, MessageCircle, Copy, Send, Check, Mail, Save, Settings, RotateCcw, AlertCircle } from 'lucide-react';

interface ClientContactModalProps {
  job: Job;
  onClose: () => void;
}

// Updated: Short Message Templates (Under 90 Bytes)
const DEFAULT_TEMPLATES = [
  { label: '접수 안내', content: '[접수] {고객명}님 {작업명} 정상접수. 일정맞춰 제작하겠습니다.' },
  { label: '시안 확인', content: '[시안] {고객명}님 {작업명} 시안 전송됨. 확인후 회신부탁드립니다.' },
  { label: '인쇄 진행', content: '[진행] {고객명}님 {작업명} 시안확정. 인쇄/제작 시작합니다.' },
  { label: '제작 완료', content: '[완료] {고객명}님 {작업명} 제작완료. 방문/퀵 수령 가능합니다.' },
  { label: '계좌 안내', content: '[계좌] OO은행 123-456-7890 (예금주) / {금액}원 입금요망' },
];

// Helper to calculate EUC-KR byte length
const getByteLength = (s: string) => {
    let b = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        b += (c >> 7) ? 2 : 1;
    }
    return b;
};

export const ClientContactModal: React.FC<ClientContactModalProps> = ({ job, onClose }) => {
  const [prefix, setPrefix] = useState('[EzPrintWork]');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditingTemplates, setIsEditingTemplates] = useState(false);
  
  // SMS Config
  const smsConfig = db.getSmsConfig();
  const currentByteLength = getByteLength(`${prefix} ${body}`);
  const isLMS = currentByteLength > 90;

  // Load saved settings on mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem('pm_msg_templates');
    const savedPrefix = localStorage.getItem('pm_msg_prefix');
    
    if (savedTemplates) {
        setTemplates(JSON.parse(savedTemplates));
    }
    
    if (savedPrefix) {
        setPrefix(savedPrefix);
    } else {
        // Automatically use Company Name if no custom prefix is saved
        const companyName = db.getCompanyInfo().name;
        if (companyName) {
            setPrefix(`[${companyName}]`);
        }
    }
  }, []);

  // Update body when template selection changes
  useEffect(() => {
    if (!isEditingTemplates) {
        applyTemplate(selectedIdx);
    }
  }, [selectedIdx, templates, job, isEditingTemplates]);

  const applyTemplate = (index: number) => {
      let content = templates[index].content;
      // Replace placeholders
      content = content.replace(/{고객명}/g, job.clientName || '고객');
      content = content.replace(/{작업명}/g, job.title || '작업');
      content = content.replace(/{금액}/g, job.price.toLocaleString() || '0');
      
      setBody(content);
  };

  const getFullMessage = () => {
      return `${prefix} ${body}`;
  };

  const handleSaveTemplate = () => {
      localStorage.setItem('pm_msg_templates', JSON.stringify(templates));
      localStorage.setItem('pm_msg_prefix', prefix);
      alert('템플릿과 접두사가 저장되었습니다.');
      setIsEditingTemplates(false);
  };

  const handleResetTemplates = () => {
      if(confirm('기본 템플릿으로 초기화하시겠습니까?')) {
          setTemplates(DEFAULT_TEMPLATES);
          localStorage.removeItem('pm_msg_templates');
          localStorage.removeItem('pm_msg_prefix');
          
          // Reset prefix to Company Name default
          const companyName = db.getCompanyInfo().name;
          setPrefix(companyName ? `[${companyName}]` : '[EzPrintWork]');
      }
  }

  const updateTemplateContent = (idx: number, val: string) => {
      const newTemplates = [...templates];
      newTemplates[idx].content = val;
      setTemplates(newTemplates);
  };

  const updateTemplateLabel = (idx: number, val: string) => {
      const newTemplates = [...templates];
      newTemplates[idx].label = val;
      setTemplates(newTemplates);
  };

  const handleSendSMS = () => {
    if (!job.clientPhone) {
      alert('고객 연락처가 없습니다.');
      return;
    }
    const phone = job.clientPhone.replace(/[^0-9]/g, '');
    const fullMsg = getFullMessage();

    if (smsConfig.mode === 'api') {
        // API Sending Logic (Mocked)
        if (!smsConfig.apiKey || !smsConfig.senderNumber) {
            alert("API 키 또는 발신번호가 설정되지 않았습니다. [설정 > 문자 설정]을 확인해주세요.");
            return;
        }
        
        const type = isLMS ? 'LMS' : 'SMS';
        if(confirm(`[API 발송] 아래 내용으로 전송하시겠습니까?\n\n수신: ${phone}\n타입: ${type} (${currentByteLength} Byte)\n내용: ${fullMsg}`)) {
            // TODO: Actual API Call would go here
            console.log("Sending API Message:", {
                to: phone,
                from: smsConfig.senderNumber,
                text: fullMsg,
                type: type
            });
            alert("전송 요청되었습니다. (실제 전송은 백엔드/API 연동 필요)");
            onClose();
        }
    } else {
        // App Link Logic (Existing)
        const encodedBody = encodeURIComponent(fullMsg);
        window.location.href = `sms:${phone}?body=${encodedBody}`; 
    }
  };

  const handleEmail = () => {
      const subject = encodeURIComponent(`[알림] ${job.title} 건 관련 안내입니다.`);
      const body = encodeURIComponent(getFullMessage());
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCopyForKakao = async () => {
    try {
      await navigator.clipboard.writeText(getFullMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      alert('메시지가 복사되었습니다.\n카카오톡을 열어 붙여넣기(Ctrl+V) 하세요.');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transform transition-all scale-100 max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MessageCircle size={20} className="text-blue-600 dark:text-blue-400" />
            고객 알림 발송 ({smsConfig.mode === 'api' ? 'API 자동발송' : '앱 연동'})
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          {/* Header Info */}
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 mb-4">
            <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-base">{job.clientName} 님</span>
                <span className="text-xs bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300">{job.status}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-600/80 dark:text-blue-300/80">
                <span>{job.clientPhone || '연락처 없음'}</span>
                <span>•</span>
                <span className="truncate">{job.title}</span>
            </div>
          </div>

          {/* Edit Mode Toggle */}
          <div className="flex justify-end mb-2">
              {isEditingTemplates ? (
                  <div className="flex gap-2">
                      <button 
                        onClick={handleResetTemplates}
                        className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 underline"
                      >
                          <RotateCcw size={12}/> 초기화
                      </button>
                      <button 
                        onClick={handleSaveTemplate}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold hover:bg-blue-700 flex items-center gap-1 transition-colors"
                      >
                          <Save size={12}/> 저장 및 완료
                      </button>
                  </div>
              ) : (
                  <button 
                    onClick={() => setIsEditingTemplates(true)}
                    className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                  >
                      <Settings size={12}/> 문구 관리/수정
                  </button>
              )}
          </div>

          {isEditingTemplates ? (
              <div className="space-y-4 mb-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400">접두사 (모든 메시지 공통)</label>
                      <input 
                          type="text" 
                          value={prefix} 
                          onChange={(e) => setPrefix(e.target.value)}
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                  </div>
                  <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">템플릿 내용 수정 ({'{고객명}, {작업명}, {금액}'} 사용가능)</label>
                      {templates.map((tpl, idx) => (
                          <div key={idx} className="flex gap-2">
                              <input 
                                  value={tpl.label} 
                                  onChange={(e) => updateTemplateLabel(idx, e.target.value)}
                                  className="w-20 p-2 border border-slate-300 dark:border-slate-600 rounded text-xs font-bold text-center shrink-0 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  placeholder="제목"
                              />
                              <input 
                                  value={tpl.content} 
                                  onChange={(e) => updateTemplateContent(idx, e.target.value)}
                                  className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  placeholder="내용"
                              />
                          </div>
                      ))}
                  </div>
                  <p className="text-[10px] text-slate-400 text-right">* 저장 버튼을 눌러야 반영됩니다.</p>
              </div>
          ) : (
              <div className="space-y-4">
                {/* 1. Prefix & Template Selector */}
                <div className="flex gap-2">
                    <div className="w-1/3 space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">접두사</label>
                        <input 
                            type="text"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-center font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>
                    <div className="w-2/3 space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">내용 선택 (5개 등록가능)</label>
                        <select 
                            value={selectedIdx}
                            onChange={(e) => setSelectedIdx(Number(e.target.value))}
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                            {templates.map((tpl, idx) => (
                                <option key={idx} value={idx}>{tpl.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 2. Message Body */}
                <div className="relative">
                    <div className="flex justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">발송 내용 (직접 수정 가능)</label>
                        <span className={`text-[10px] font-mono ${isLMS ? 'text-orange-500 font-bold' : 'text-slate-400'}`}>
                            {currentByteLength} / 90 Byte ({isLMS ? 'LMS 장문' : 'SMS 단문'})
                        </span>
                    </div>
                    <div className="relative">
                        <div className="absolute top-3 left-3 text-slate-400 dark:text-slate-500 text-sm select-none pointer-events-none font-medium">
                            {prefix}
                        </div>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className={`w-full h-32 p-3 pl-[6.5rem] bg-white dark:bg-slate-800 border rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed ${isLMS ? 'border-orange-300 dark:border-orange-700' : 'border-slate-300 dark:border-slate-600'}`}
                            style={{ paddingLeft: `${prefix.length * 0.6 + 1.5}rem` }}
                        />
                    </div>
                    {isLMS && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-orange-500">
                            <AlertCircle size={10} /> 90 Byte 초과 시 장문(LMS) 요금이 적용되거나 분할 발송될 수 있습니다.
                        </div>
                    )}
                </div>
              </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isEditingTemplates && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={handleSendSMS}
                        className="flex flex-col items-center justify-center gap-1 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm active:scale-95"
                    >
                        <Send size={18} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold">문자 전송</span>
                    </button>
                    
                    <button
                        onClick={handleEmail}
                        className="flex flex-col items-center justify-center gap-1 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm active:scale-95"
                    >
                        <Mail size={18} className="text-blue-500 dark:text-blue-400" />
                        <span className="text-xs font-bold">이메일</span>
                    </button>

                    <button
                        onClick={handleCopyForKakao}
                        className="flex flex-col items-center justify-center gap-1 py-3 bg-[#FEE500] border border-[#FEE500] text-[#3c1e1e] rounded-lg hover:bg-[#ffeb3b] transition-colors shadow-sm active:scale-95"
                    >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                        <span className="text-xs font-bold">{copied ? '복사됨' : '카톡 복사'}</span>
                    </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center">
                    * 카카오톡 전송 시 [복사] 후 PC 카톡창에 붙여넣기(Ctrl+V) 하세요.
                </p>
            </div>
        )}
      </div>
    </div>
  );
};
