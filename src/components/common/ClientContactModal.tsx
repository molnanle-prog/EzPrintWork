import React, { useState, useEffect, useRef } from 'react';
import { Job } from '../../types';
import { db } from '../../services/dataService';
import { X, MessageCircle, Copy, Send, Check, Mail, Save, Settings, RotateCcw, AlertCircle, Smartphone, Wifi, Battery, Smile, Paperclip, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getStaffIdForUser } from '../../utils/staffMatch';

interface ClientContactModalProps {
  job: Job;
  onClose: () => void;
  onUpdate?: (job: Job) => void;
}

// 기본 메시지 템플릿 (90 바이트 이하 추천)
const DEFAULT_TEMPLATES = [
  { label: '접수 안내', content: '[접수] {고객명}님 {작업명} 정상접수. 일정맞춰 제작하겠습니다.' },
  { label: '시안 확인', content: '[시안] {고객명}님 {작업명} 시안 전송됨. 확인후 회신부탁드립니다.' },
  { label: '인쇄 진행', content: '[진행] {고객명}님 {작업명} 시안확정. 인쇄/제작 시작합니다.' },
  { label: '제작 완료', content: '[완료] {고객명}님 {작업명} 제작완료. 방문/퀵 수령 가능합니다.' },
  { label: '계좌 안내', content: '[계좌] {계좌정보} / {금액}원 입금요망' },
];

// EUC-KR 바이트 길이 계산 헬퍼
const getByteLength = (s: string) => {
    let b = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        b += (c >> 7) ? 2 : 1;
    }
    return b;
};

export const ClientContactModal: React.FC<ClientContactModalProps> = ({ job, onClose, onUpdate }) => {
  const [prefix, setPrefix] = useState('[EzPrintWork]');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditingTemplates, setIsEditingTemplates] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const historyActorId = getStaffIdForUser(db.getStaff(), currentUser) || currentUser?.id || 'system';

  // 이전 문자 발송 이력 필터링 및 가공
  const smsHistory = (job.history || [])
      .filter(log => log.action.includes('문자 발송') || log.action.includes('문자 전송'))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // SMS Config
  const smsConfig = db.getSmsConfig();
  const currentByteLength = getByteLength(`${prefix} ${body}`);
  const isLMS = currentByteLength > 90;

  // 실시간 시간 업데이트
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load saved settings & auto-select template based on job status on mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem('pm_msg_templates');
    const savedPrefix = localStorage.getItem('pm_msg_prefix');
    
    let loadedTemplates = [...DEFAULT_TEMPLATES];
    if (savedTemplates) {
        try {
            loadedTemplates = JSON.parse(savedTemplates);
        } catch (e) {
            console.error('Failed to parse saved templates:', e);
        }
    }

    // DB의 문자 설정에 커스텀 계좌 안내 템플릿이 정의되어 있다면 덮어쓰기
    const savedSmsConfig = db.getSmsConfig();
    if (savedSmsConfig && savedSmsConfig.billingMessageTemplate) {
        const billingIdx = loadedTemplates.findIndex(t => t.label === '계좌 안내');
        if (billingIdx !== -1) {
            loadedTemplates[billingIdx].content = savedSmsConfig.billingMessageTemplate;
        }
    }

    setTemplates(loadedTemplates);
    
    if (savedPrefix) {
        setPrefix(savedPrefix);
    } else {
        const companyName = db.getCompanyInfo().name;
        if (companyName) {
            setPrefix(`[${companyName}]`);
        }
    }

    // --- 칸반 보드 상태(job.status)에 따른 자동 템플릿 선택 매핑 ---
    let autoSelectedIdx = 0; // 기본값: 접수 안내 (job.status === 'RECEIVED')
    
    if (job.status === 'DESIGN') {
        const idx = loadedTemplates.findIndex(t => t.label.includes('시안') || t.label.includes('확인'));
        if (idx !== -1) autoSelectedIdx = idx;
    } else if (job.status === 'PRINTING' || job.status === 'POST_PROCESSING') {
        const idx = loadedTemplates.findIndex(t => t.label.includes('인쇄') || t.label.includes('진행'));
        if (idx !== -1) autoSelectedIdx = idx;
    } else if (job.status === 'DELIVERY') {
        const idx = loadedTemplates.findIndex(t => t.label.includes('완료') || t.label.includes('제작'));
        if (idx !== -1) autoSelectedIdx = idx;
    }

    setSelectedIdx(autoSelectedIdx);
  }, [job.status, job.id]);

  // 템플릿 선택 변경 시 본문 업데이트
  useEffect(() => {
    if (!isEditingTemplates) {
        applyTemplate(selectedIdx);
    }
  }, [selectedIdx, templates, job, isEditingTemplates]);

  // 대화창 최하단 스크롤
  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [body, prefix, isEditingTemplates]);

  const applyTemplate = (index: number) => {
      let content = templates[index].content;
      const companyInfo = db.getCompanyInfo();
      const companyName = companyInfo.name || '';
      const bankAccount = companyInfo.bankAccount || '계좌번호 미등록';
      
      content = content.replace(/{고객명}/g, job.contactPerson || job.clientName || '고객');
      content = content.replace(/{거래처}/g, job.clientName || '');
      content = content.replace(/{작업명}/g, job.title || '작업');
      content = content.replace(/{주문명}/g, job.title || '작업');
      content = content.replace(/{금액}/g, job.price.toLocaleString() || '0');
      content = content.replace(/{회사명}/g, companyName);
      content = content.replace(/{연락처}/g, job.clientPhone || '');
      content = content.replace(/{계좌정보}/g, bankAccount);
      content = content.replace(/{계좌번호}/g, bankAccount);
      
      setBody(content);
  };

  const getFullMessage = () => {
      return `${prefix} ${body}`;
  };

  const handleSaveTemplate = () => {
      localStorage.setItem('pm_msg_templates', JSON.stringify(templates));
      localStorage.setItem('pm_msg_prefix', prefix);
      alert('템플릿과 접두사가 안전하게 저장되었습니다.');
      setIsEditingTemplates(false);
  };

  const handleResetTemplates = () => {
      if(confirm('기본 템플릿으로 초기화하시겠습니까?')) {
          setTemplates(DEFAULT_TEMPLATES);
          localStorage.removeItem('pm_msg_templates');
          localStorage.removeItem('pm_msg_prefix');
          
          const companyName = db.getCompanyInfo().name;
          setPrefix(companyName ? `[${companyName}]` : '[EzPrintWork]');
      }
  };

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
        if (!smsConfig.apiKey || !smsConfig.senderNumber) {
            alert("API 키 또는 발신번호가 설정되지 않았습니다. [설정 > 문자 설정]을 확인해주세요.");
            return;
        }
        
        const type = isLMS ? 'LMS' : 'SMS';
        if(confirm(`[API 발송] 아래 내용으로 전송하시겠습니까?\n\n수신: ${phone}\n타입: ${type} (${currentByteLength} Byte)\n내용: ${fullMsg}`)) {
            console.log("Sending API Message:", {
                to: phone,
                from: smsConfig.senderNumber,
                text: fullMsg,
                type: type
            });
            
            // 실제 솔라피/API 발송 연동
            import('../../services/smsService').then((smsServiceModule) => {
                smsServiceModule.sendSmsViaSolapi(phone, fullMsg, smsConfig).then((res: any) => {
                    if (res.success) {
                        alert("문자가 성공적으로 전송되었습니다!");
                        
                        const updatedHistory = [
                            ...(job.history || []),
                            {
                                timestamp: new Date().toISOString(),
                                staffId: historyActorId,
                                action: '문자 발송',
                                details: `완료 문자 발송 성공 (수신: ${phone})\n내용: ${fullMsg}`
                            }
                        ];
                        const updatedJob = { ...job, history: updatedHistory };
                        db.updateJob(updatedJob).then(() => {
                            if (onUpdate) onUpdate(updatedJob);
                            onClose();
                        });
                    } else {
                        alert(`발송 실패: ${res.message}`);
                        
                        const updatedHistory = [
                            ...(job.history || []),
                            {
                                timestamp: new Date().toISOString(),
                                staffId: historyActorId,
                                action: '문자 발송 실패',
                                details: `발송 실패: ${res.message} (수신: ${phone})`
                            }
                        ];
                        const updatedJob = { ...job, history: updatedHistory };
                        db.updateJob(updatedJob).then(() => {
                            if (onUpdate) onUpdate(updatedJob);
                        });
                    }
                }).catch((err: any) => {
                    alert(`오류: ${err.message}`);
                });
            });
        }
    } else {
        const encodedBody = encodeURIComponent(fullMsg);
        
        const updatedHistory = [
            ...(job.history || []),
            {
                timestamp: new Date().toISOString(),
                staffId: historyActorId,
                action: '문자 발송',
                details: `앱 연동(휴대폰과 연결) 문자 발송 시도 (수신: ${phone})\n내용: ${fullMsg}`
            }
        ];
        const updatedJob = { ...job, history: updatedHistory };
        db.updateJob(updatedJob).then(() => {
            if (onUpdate) onUpdate(updatedJob);
            window.location.href = `sms:${phone}?body=${encodedBody}`; 
        });
    }
  };

  const handleEmail = () => {
      const subject = encodeURIComponent(`[알림] ${job.title} 건 관련 안내입니다.`);
      const bodyText = encodeURIComponent(getFullMessage());
      window.location.href = `mailto:?subject=${subject}&body=${bodyText}`;
  };

  const handleCopyForKakao = async () => {
    try {
      await navigator.clipboard.writeText(getFullMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      alert('메시지가 복사되었습니다.\n카카오톡 대화창을 열어 붙여넣기(Ctrl+V) 하세요.');

      const phone = job.clientPhone ? job.clientPhone.replace(/[^0-9]/g, '') : '연락처 없음';
      const updatedHistory = [
          ...(job.history || []),
          {
              timestamp: new Date().toISOString(),
              staffId: historyActorId,
              action: '문자 발송 (카톡 복사)',
              details: `카카오톡 전송용 클립보드 복사 완료 (수신: ${phone})\n내용: ${getFullMessage()}`
          }
      ];
      const updatedJob = { ...job, history: updatedHistory };
      db.updateJob(updatedJob).then(() => {
          if (onUpdate) onUpdate(updatedJob);
      });
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      {/* 스마트폰 목업 프레임 */}
      <div 
        className="bg-slate-900 rounded-[50px] shadow-2xl w-full max-w-[390px] flex flex-col h-[780px] border-[12px] border-slate-800 relative overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        
        {/* 상단 펀치홀/카메라 및 스피커 데코 */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-full z-30 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-1 bg-slate-700 rounded-full mr-2"></div>
          <div className="w-2.5 h-2.5 bg-slate-950 rounded-full border border-slate-800"></div>
        </div>

        {/* 상단 시스템 바 (시간, 네트워크, 배터리) */}
        <div className="bg-white dark:bg-slate-900 pt-9 pb-2 px-6 flex justify-between items-center text-[10px] font-black text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 select-none shrink-0 z-20">
          <span>{currentTime}</span>
          <div className="flex items-center gap-1.5">
            <Wifi size={10} />
            <span className="text-[9px] font-extrabold tracking-tighter">LTE</span>
            <Battery size={13} className="rotate-0" />
          </div>
        </div>

        {/* 대화방 스마트 헤더 */}
        <div className="bg-white dark:bg-slate-800 py-3 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 shadow-sm shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* 프로필 아바타 */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-md">
              {job.clientName ? job.clientName.substring(0, 2) : '고'}
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span className="truncate max-w-[120px]">{job.clientName} 님</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[8px] font-black">{job.status}</span>
              </h4>
              <p className="text-[9px] text-slate-400 font-mono font-bold mt-0.5">{job.clientPhone || '연락처 없음'}</p>
            </div>
          </div>
          
          {/* 닫기 버튼 */}
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-slate-200/50 dark:border-slate-600 shadow-sm"
          >
            <X size={14} className="font-black" />
          </button>
        </div>

        {/* 템플릿 선택 및 접두사 관리 가로형 띠지 (카카오톡 공지사항 형태) */}
        {!isEditingTemplates && (
          <div className="bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md px-3 py-2 border-b border-slate-200/50 dark:border-slate-700 flex gap-2 items-center shrink-0 z-10 select-none shadow-xs">
            <div className="w-1/4">
              <input 
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="w-full px-1.5 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-black text-center text-slate-700 dark:text-slate-200 focus:outline-none"
                  placeholder="접두사"
                  title="메시지 맨 앞에 추가될 공통 문구"
              />
            </div>
            <div className="flex-1">
              <select 
                  value={selectedIdx}
                  onChange={(e) => setSelectedIdx(Number(e.target.value))}
                  className="w-full px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-black text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                  {templates.map((tpl, idx) => (
                      <option key={idx} value={idx}>{tpl.label}</option>
                  ))}
              </select>
            </div>
            <button 
              onClick={() => setIsEditingTemplates(true)}
              className="p-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-400 hover:text-blue-500 transition-colors"
              title="템플릿 문구 편집"
            >
              <Settings size={12} />
            </button>
          </div>
        )}

        {/* 대화방 본문 스크롤 영역 (카카오톡 특유의 파란색 배경 #BACEE0 채택!) */}
        <div className="flex-1 bg-[#BACEE0] dark:bg-slate-900 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0 relative">
          
          {isEditingTemplates ? (
            /* 문구 관리/수정 모드 */
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in duration-200 shadow-lg my-auto">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="font-black text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1">
                    <Settings size={14} className="text-blue-600" />
                    메시지 문구 관리
                  </span>
                  <div className="flex gap-2">
                    <button onClick={handleResetTemplates} className="text-[10px] text-slate-400 hover:text-red-500 font-bold flex items-center gap-0.5 underline"><RotateCcw size={10}/> 초기화</button>
                    <button onClick={handleSaveTemplate} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-bold hover:bg-blue-700 flex items-center gap-0.5"><Save size={10}/> 저장</button>
                  </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">공통 접두사</label>
                    <input 
                        type="text" 
                        value={prefix} 
                        onChange={(e) => setPrefix(e.target.value)}
                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded text-xs bg-slate-50 dark:bg-slate-700 text-slate-950 dark:text-slate-100 font-bold"
                    />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    <label className="text-[10px] font-bold text-slate-500 block">메시지 템플릿 ({'{고객명}, {작업명}, {금액}'})</label>
                    {templates.map((tpl, idx) => (
                        <div key={idx} className="flex gap-1.5 items-center">
                            <input 
                                value={tpl.label} 
                                onChange={(e) => updateTemplateLabel(idx, e.target.value)}
                                className="w-16 p-1.5 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-black text-center bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                placeholder="제목"
                            />
                            <input 
                                value={tpl.content} 
                                onChange={(e) => updateTemplateContent(idx, e.target.value)}
                                className="flex-1 p-1.5 border border-slate-300 dark:border-slate-600 rounded text-[10px] bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                placeholder="메시지 내용"
                            />
                        </div>
                    ))}
                </div>
                <button 
                  onClick={() => setIsEditingTemplates(false)}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-bold text-[10px]"
                >
                  수정 취소 및 대화창 돌아가기
                </button>
            </div>
          ) : (
            /* 실제 카톡 대화창 화면 */
            <div className="flex flex-col space-y-4 flex-1 justify-end min-h-0">
              
              {/* 왼쪽 상대방 말풍선 (시스템 가이드) */}
              <div className="flex justify-start items-start gap-2 animate-in slide-in-from-left-3 duration-300">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white shrink-0 shadow-sm border border-slate-600">
                  <MessageSquare size={14} />
                </div>
                <div className="flex flex-col items-start max-w-[70%]">
                  <span className="text-[9px] font-black text-slate-600 dark:text-slate-400 ml-1 mb-0.5">알림 서비스</span>
                  <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2.5 rounded-2xl rounded-tl-none text-[11px] leading-relaxed shadow-sm font-medium">
                    {job.clientName}님께 완료 알림톡/문자를 보낼 준비가 되었습니다.<br/>
                    상단에서 메시지 양식을 선택하시거나 하단 창에서 자유롭게 편집 후 전송해 주세요!
                  </div>
                </div>
              </div>

              {/* 이전 발송 기록 목록 */}
              {smsHistory.length > 0 && (
                <>
                  <div className="text-center py-1 select-none">
                    <span className="bg-slate-500/15 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 font-extrabold text-[8px] px-2.5 py-0.5 rounded-full">
                      이전 발송 이력 ({smsHistory.length}건)
                    </span>
                  </div>
                  {smsHistory.map((log, hidx) => {
                    const logTime = new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const logDate = log.timestamp.split('T')[0];
                    
                    let displayDetails = log.details;
                    const contentIndex = log.details.indexOf('내용:');
                    if (contentIndex !== -1) {
                      displayDetails = log.details.substring(contentIndex + 4).trim();
                    } else {
                      const detailIdx = log.details.indexOf('\n');
                      if (detailIdx !== -1) displayDetails = log.details.substring(detailIdx).trim();
                    }

                    const isSuccess = !log.action.includes('실패');

                    return (
                      <div key={hidx} className="flex justify-end items-end gap-1.5 animate-in slide-in-from-right-2 duration-300">
                        <div className="flex flex-col items-end text-[8px] font-bold text-slate-500 select-none mr-0.5">
                          <span className={isSuccess ? 'text-emerald-600' : 'text-rose-600'}>
                            {isSuccess ? '발송완료' : '발송실패'}
                          </span>
                          <span>{logDate}</span>
                        </div>
                        <div className="flex flex-col items-end max-w-[75%] relative">
                          <div className={`p-2.5 rounded-2xl rounded-tr-none text-[11px] leading-relaxed shadow-sm break-all whitespace-pre-wrap font-sans font-medium text-left border ${isSuccess ? 'bg-amber-100/80 text-slate-700 border-amber-200' : 'bg-rose-50 text-slate-600 border-rose-100'}`}>
                            {displayDetails}
                          </div>
                          <span className="text-[8px] font-bold text-slate-500/80 mt-0.5 select-none mr-1">
                            {logTime}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* 시간 구분선 */}
              <div className="text-center py-2 select-none border-t border-dashed border-slate-400/30 mt-2">
                <span className="bg-slate-500/20 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-black text-[9px] px-3 py-1 rounded-full">
                  전송 대기중인 메시지 미리보기
                </span>
              </div>

              {/* 오른쪽 내 노란색 카톡 말풍선 (실시간 메시지 미리보기!) */}
              <div className="flex justify-end items-end gap-1.5 animate-in slide-in-from-right-3 duration-300">
                {/* 바이트 수 및 문자 정보 */}
                <div className="flex flex-col items-end text-[9px] font-bold text-slate-500/90 dark:text-slate-400 select-none mr-0.5">
                  <span className={isLMS ? 'text-orange-600 font-extrabold' : 'text-slate-600'}>
                    {isLMS ? 'LMS 장문' : 'SMS 단문'}
                  </span>
                  <span>{currentByteLength} / 90 Byte</span>
                </div>
                
                <div className="flex flex-col items-end max-w-[75%] relative">
                  {/* 카톡 고유의 옐로우 말풍선 */}
                  <div className="bg-[#FEE500] text-slate-900 p-3 rounded-2xl rounded-tr-none text-[11px] leading-relaxed shadow-md break-all whitespace-pre-wrap font-sans font-medium text-left border border-[#e0ca00]">
                    {getFullMessage()}
                  </div>
                  
                  {/* 말풍선 아래 시간 표시 */}
                  <span className="text-[8px] font-bold text-slate-500/80 mt-1 select-none mr-1">
                    {currentTime}
                  </span>
                </div>
              </div>

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* 하단 입력 / 버튼 영역 */}
        {!isEditingTemplates && (
          <div className="bg-white dark:bg-slate-800 border-t border-slate-200/80 dark:border-slate-700 shrink-0 pb-6">
            
            {/* 1. 카카오톡 스타일 메시지 본문 입력 필드 */}
            <div className="p-3 flex items-end gap-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="보낼 문구 직접 입력 및 편집..."
                rows={2}
                className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none leading-normal font-sans shadow-inner max-h-24"
              />
              <div className="flex flex-col gap-1.5 justify-end">
                <Smile size={20} className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
                <Paperclip size={18} className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors" />
              </div>
            </div>

            {/* 2. 하단 3가지 기능 액션 버튼 바 (디자인 업그레이드!) */}
            <div className="p-3 bg-white dark:bg-slate-800 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                
                {/* 문자 전송 */}
                <button
                    onClick={handleSendSMS}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow transition-all active:scale-95 border border-slate-950"
                >
                    <Send size={15} className="text-emerald-400" />
                    <span className="text-[10px] font-black tracking-tight">문자 전송</span>
                </button>
                
                {/* 이메일 */}
                <button
                    onClick={handleEmail}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl shadow-sm transition-all active:scale-95 border border-slate-200 dark:border-slate-600"
                >
                    <Mail size={15} className="text-blue-500 dark:text-blue-400" />
                    <span className="text-[10px] font-black tracking-tight">이메일</span>
                </button>

                {/* 카톡 복사 (카톡 옐로우 포인트) */}
                <button
                    onClick={handleCopyForKakao}
                    className="flex flex-col items-center justify-center gap-1 py-2.5 bg-[#FEE500] hover:bg-[#FADA0A] text-[#3c1e1e] rounded-xl shadow transition-all active:scale-95 border border-[#e2cc00]"
                >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    <span className="text-[10px] font-black tracking-tight">{copied ? '복사완료' : '카톡 복사'}</span>
                </button>
              </div>
              <p className="text-[9px] font-bold text-slate-400 text-center select-none mt-1">
                * 카톡 전송: [카톡 복사] 후 PC 카톡 대화창에 붙여넣기(Ctrl+V) 하세요.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
