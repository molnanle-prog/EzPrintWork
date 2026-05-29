import React, { useState, useEffect } from 'react';
import { db, formatPhoneNumber } from '../../services/dataService';
import { SmsConfig } from '../../types';
import { MessageSquare, Save, Smartphone, Server, CheckCircle2, Lock, HelpCircle, Send, AlertTriangle } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';
import { sendSmsViaSolapi } from '../../services/smsService';

export const SmsManager: React.FC = () => {
  const [config, setConfig] = useState<SmsConfig>({
    mode: 'app',
    provider: 'solapi',
    apiKey: '',
    apiSecret: '',
    senderNumber: '',
    completedMessageTemplate: `[{회사명}] {고객명}님, 주문하신 '{주문명}' 제품의 인쇄/작업이 완료되었습니다. 물건을 수령하러 방문해 주시기 바랍니다. 감사합니다.`,
    billingMessageTemplate: `[{회사명}] 입금 요청 안내: 주문하신 '{주문명}'의 결제 계좌 정보입니다. - 계좌: {계좌정보}`,
    sendOnComplete: true
  });
  
  const [testNumber, setTestNumber] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [showPhoneGuide, setShowPhoneGuide] = useState(true);
  const [showApiGuide, setShowApiGuide] = useState(true);
  
  const { showAlert, showConfirm } = useDialog();
  const { currentUser } = useAuth(); // 권한 체크용
 
  useEffect(() => {
    const savedConfig = db.getSmsConfig();
    setConfig({
      mode: savedConfig.mode || 'app',
      provider: savedConfig.provider || 'solapi',
      apiKey: savedConfig.apiKey || '',
      apiSecret: savedConfig.apiSecret || '',
      senderNumber: savedConfig.senderNumber || '',
      completedMessageTemplate: savedConfig.completedMessageTemplate || `[{회사명}] {고객명}님, 주문하신 '{주문명}' 제품의 인쇄/작업이 완료되었습니다. 물건을 수령하러 방문해 주시기 바랍니다. 감사합니다.`,
      billingMessageTemplate: savedConfig.billingMessageTemplate || `[{회사명}] 입금 요청 안내: 주문하신 '{주문명}'의 결제 계좌 정보입니다. - 계좌: {계좌정보}`,
      sendOnComplete: savedConfig.sendOnComplete !== undefined ? savedConfig.sendOnComplete : true,
      pfId: savedConfig.pfId || '',
      useAlimtalk: savedConfig.useAlimtalk || false,
      alimtalkTemplates: savedConfig.alimtalkTemplates || {}
    });
  }, []);

  const handleSave = async () => {
    // 권한 체크: 설정은 관리자만 가능
    if (currentUser?.role !== 'admin') {
      await showAlert('설정 저장 권한이 없습니다. 관리자 계정으로 로그인해 주세요.');
      return;
    }

    if (config.mode === 'api') {
      if (!config.apiKey || !config.apiSecret || !config.senderNumber) {
        await showAlert('API 연동 모드 사용 시 API Key, Secret Key, 발신번호는 필수입니다.');
        return;
      }
    }
    
    try {
      await db.saveSmsConfig(config);
      await showAlert('문자 발송 및 알림 설정이 안전하게 저장되었습니다.');
    } catch (e: any) {
      await showAlert(`설정 저장 중 오류가 발생했습니다: ${e.message}`);
    }
  };

  const handleTestSms = async () => {
    if (!testNumber) {
      await showAlert('테스트 수신 번호를 입력해 주세요.');
      return;
    }

    if (config.mode === 'api' && config.provider === 'solapi') {
      if (!config.apiKey || !config.apiSecret || !config.senderNumber) {
        await showAlert('테스트 발송을 위해서는 API 정보를 입력 후 저장해야 합니다.');
        return;
      }

      setIsTesting(true);
      try {
        const testContent = `[EzPrintWork] 문자 연동 테스트 발송 성공! 솔라피 API를 통해 실시간으로 정상 전송되었습니다.`;
        const res = await sendSmsViaSolapi(testNumber, testContent, config);
        
        if (res.success) {
          await showAlert('테스트 문자가 정상적으로 발송되었습니다. 수신 여부를 확인해 보세요!');
        } else {
          await showAlert(`발송 실패: ${res.message}`);
        }
      } catch (err: any) {
        await showAlert(`테스트 발송 오류: ${err.message}`);
      } finally {
        setIsTesting(false);
      }
    } else {
      // 그 외 API / 앱 모드 테스트
      await showAlert(`'${config.mode === 'app' ? '앱 연동(무료)' : config.provider + ' MOCK'}' 모드 테스트: 실제 고객 완료 시 발송 창(Confirm)을 통해 테스트를 진행해 주시기 바랍니다.`);
    }
  };

  const handleChange = (field: keyof SmsConfig, value: any) => {
    let finalValue = value;
    if (field === 'senderNumber') {
      finalValue = formatPhoneNumber(value);
    }
    if (field === 'provider') {
      setShowApiGuide(true);
    }
    setConfig(prev => ({ ...prev, [field]: finalValue }));
  };

  const inputClass = "w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-3xl transition-colors">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
           <MessageSquare className="text-blue-600 dark:text-blue-400" />
           완료 문자 및 알림 발송 설정
        </h3>
        {currentUser?.role !== 'admin' && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50">
            <AlertTriangle size={14} />
            읽기 전용 (관리자만 수정 가능)
          </span>
        )}
      </div>

      <div className="space-y-8">
          
          {/* 발송 방식 선택 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">문자 발송 방식</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={() => handleChange('mode', 'app')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative ${config.mode === 'app' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 dark:text-slate-100">
                        <Smartphone size={20} className={config.mode === 'app' ? 'text-blue-600' : 'text-slate-400'} />
                        기본 (휴대폰과 연결)
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Windows '휴대폰과 연결' 앱을 통해 개인 휴대폰으로 문자를 보냅니다.<br/>
                        <span className="font-bold text-blue-600 dark:text-blue-400">무료 (통신사 요금제 무제한 문자 사용)</span>
                    </p>
                    {config.mode === 'app' && <CheckCircle2 className="absolute top-4 right-4 text-blue-600" size={20} />}
                </button>

                <button 
                  onClick={() => handleChange('mode', 'api')}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative ${config.mode === 'api' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 dark:text-slate-100">
                        <Server size={20} className={config.mode === 'api' ? 'text-blue-600' : 'text-slate-400'} />
                        API 자동 발송 (솔라피 등)
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        유료 문자 서비스 API를 통해 즉시 서버로 자동 발송합니다.<br/>
                        <span className="font-bold text-orange-600 dark:text-orange-400">유료 (건당 약 8.4원 ~ 과금 발생)</span>
                    </p>
                    {config.mode === 'api' && <CheckCircle2 className="absolute top-4 right-4 text-blue-600" size={20} />}
                </button>
            </div>
          </div>

          {/* 휴대폰과 연결 상세 설명 가이드 */}
          {config.mode === 'app' && showPhoneGuide && (
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3 animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
                  <HelpCircle size={16} className="text-blue-500" />
                  무료 휴대폰 연동 방법 (Windows PC + 안드로이드 폰)
                </h4>
                <button onClick={() => setShowPhoneGuide(false)} className="text-xs text-slate-400 hover:text-slate-600">숨기기</button>
              </div>
              <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                <li><strong>PC 설정:</strong> Windows 시작 단추 누르고 <span className="font-semibold">"휴대폰과 연결" (Phone Link)</span> 앱을 찾아 실행한 뒤 [Android]를 선택합니다.</li>
                <li><strong>스마트폰 설정:</strong> 갤럭시폰 상단 바를 내려 <span className="font-semibold">'Windows와 연결'</span>을 꾹 누르고 PC 화면에 생성된 QR코드를 스캔해 연동을 마칩니다.</li>
                <li><strong>권한 허용:</strong> 스마트폰 화면에 나타나는 연락처, 문자 읽기/보내기 등 필수 권한을 모두 <span className="font-semibold text-blue-600 dark:text-blue-400">'허용'</span>해 줍니다.</li>
                <li><strong>작동 확인:</strong> 이제 프로그램에서 [납품/완료] 단계 이동 시 완료 문자가 팝업으로 나타나며, 클립보드 복사 및 문자 쓰기 창으로 자동 연결됩니다.</li>
              </ol>
            </div>
          )}

          {/* API Configuration Form */}
          {config.mode === 'api' && (
              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4 animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <Lock size={16} className="text-slate-400"/>
                      <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">문자 중계 사이트 API 계정 정보 입력</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">서비스 제공사</label>
                          <select 
                            value={config.provider}
                            onChange={(e) => handleChange('provider', e.target.value)}
                            className={inputClass}
                          >
                              <option value="solapi">Solapi (솔라피 - 추천)</option>
                              <option value="coolsms">CoolSMS (쿨에스엠에스)</option>
                              <option value="aligo">Aligo (알리고)</option>
                              <option value="munjavibe">문자바이브 (Munja Vibe - 최저가)</option>
                              <option value="gabia">가비아 (Gabia) SMS - 안정성</option>
                          </select>
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">발신번호 (사전등록된 번호만 가능)</label>
                          <input 
                            type="text"
                            value={config.senderNumber}
                            onChange={(e) => handleChange('senderNumber', e.target.value)}
                            className={inputClass}
                            placeholder="010-0000-0000"
                          />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">API Key</label>
                          <input 
                            type="text"
                            value={config.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                            className={inputClass}
                            placeholder="솔라피 등 가입 후 발급받은 API Key 입력"
                          />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">API Secret Key</label>
                          <input 
                            type="password"
                            value={config.apiSecret}
                            onChange={(e) => handleChange('apiSecret', e.target.value)}
                            className={inputClass}
                            placeholder="API Secret Key 입력"
                          />
                      </div>
                  </div>

                  {/* API 테스트 발송 */}
                  {config.provider === 'solapi' && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3 items-end">
                      <div className="flex-1 w-full space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">솔라피 실시간 발송 테스트 수신 번호</label>
                        <input 
                          type="text" 
                          value={testNumber} 
                          onChange={(e) => setTestNumber(formatPhoneNumber(e.target.value))} 
                          placeholder="010-XXXX-XXXX"
                          className="w-full p-2 h-9 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-700"
                        />
                      </div>
                      <button 
                        onClick={handleTestSms}
                        disabled={isTesting}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold h-9 px-4 rounded-lg text-xs flex items-center gap-1.5 shadow active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Send size={12} />
                        {isTesting ? '발송 중...' : '테스트 문자 발송'}
                      </button>
                    </div>
                  )}

                  {/* 동적 API 상세 가이드 */}
                  {showApiGuide && (() => {
                    const getProviderGuide = (provider: string) => {
                      switch (provider) {
                        case 'solapi':
                          return {
                            title: '🚀 솔라피(Solapi) 가입 및 세팅 방법',
                            url: 'https://solapi.com',
                            urlLabel: '솔라피 공식 홈페이지 (solapi.com)',
                            steps: [
                              '회원가입: 솔라피 사이트에 접속하여 회원가입을 완료합니다.',
                              '발신번호 등록: [발신번호 관리] 메뉴에서 문자를 보낼 발신번호(휴대폰, 유선전화 등)를 인증하여 등록합니다.',
                              '키 발급: [API Key 관리] 메뉴에서 연동을 위한 API Key와 API Secret Key를 생성하여 복사합니다.',
                              '포인트 충전: 캐시를 충전해야 정상적으로 문자가 발송됩니다.'
                            ]
                          };
                        case 'coolsms':
                          return {
                            title: '💬 쿨에스엠에스(CoolSMS) 가입 및 세팅 방법',
                            url: 'https://coolsms.co.kr',
                            urlLabel: 'CoolSMS 공식 홈페이지 (coolsms.co.kr)',
                            steps: [
                              '회원가입: CoolSMS 사이트에 회원가입 후 로그인을 진행합니다.',
                              '발신번호 승인: [발신번호 관리]에서 발신자 번호를 휴대폰/유선번호 인증으로 안전하게 등록합니다.',
                              'API 키 생성: [개발자 센터] > [API Key 관리] 메뉴에서 API Key와 API Secret을 발급받습니다.',
                              '머니 충전: 연동 발송을 진행하기 전에 선불 머니를 충전해 둡니다.'
                            ]
                          };
                        case 'aligo':
                          return {
                            title: '⚡ 알리고(Aligo) 가입 및 세팅 방법',
                            url: 'https://smartsms.aligo.in',
                            urlLabel: '알리고 SMS 서비스 (smartsms.aligo.in)',
                            steps: [
                              '회원가입: 알리고 SMS 홈페이지에 가입하고 로그인합니다.',
                              '발신번호 사전등록: [발신번호 관리]에서 발신번호를 휴대폰 인증 또는 통신서비스이용증명서 서류 제출로 등록합니다.',
                              'API 연동신청: [API 연동] 메뉴에서 연동 신청을 마친 뒤 API 인증키를 확인 및 복사합니다.',
                              '발송 허용 IP 설정: 보안 상 외부에서 API를 쏠 수 있도록 API 설정에서 접근 허용 IP 등록(필요 시 무제한 설정 가능)을 처리합니다.',
                              '충전하기: 건당 비용 결제를 위한 충전금을 입금합니다.'
                            ]
                          };
                        case 'munjavibe':
                          return {
                            title: '💸 문자바이브(Munja Vibe) [초저가] 가입 및 세팅 방법',
                            url: 'https://munjavibe.co.kr',
                            urlLabel: '문자바이브 공식 홈페이지 (munjavibe.co.kr)',
                            steps: [
                              '회원가입: 문자바이브 홈페이지 가입 후 사업자/개인 인증을 진행합니다.',
                              '발신번호 인증: [발신번호 관리] 메뉴를 통해 실제로 발신에 활용할 고정 번호를 사전 등록합니다.',
                              'API 연동: [API 연동 관리/문서] 메뉴에서 API 연동 키(API Key 및 Secret Key)를 신규 생성합니다.',
                              '단가 확인 및 충전: SMS 기준 8.4원~9원 수준의 업계 최저가를 적용받기 위해 소액 충전을 완료합니다.'
                            ]
                          };
                        case 'gabia':
                          return {
                            title: '🏢 가비아(Gabia) SMS [안정성] 가입 및 세팅 방법',
                            url: 'https://sms.gabia.com',
                            urlLabel: '가비아 SMS 호스팅 (sms.gabia.com)',
                            steps: [
                              '서비스 신청: 가비아 회원가입 후 [가비아 SMS 호스팅] 상품을 신청 및 개설합니다.',
                              '발신번호 등록: 가비아 SMS 관리콘솔 내 [발신번호 관리]에서 서류 제출 또는 휴대폰 인증을 마칩니다.',
                              'API 연동키 발급: [환경 설정] > [API 연동 키 발급] 메뉴에서 문자 연동 키를 복사합니다.',
                              '충전 및 IP 제한: 가비아 SMS 발송에 필요한 건수를 미리 선구매하고 API 연동 요청을 허용할 IP를 기재합니다.'
                            ]
                          };
                        default:
                          return null;
                      }
                    };

                    const guide = getProviderGuide(config.provider);
                    if (!guide) return null;

                    return (
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed animate-in fade-in duration-300">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-1.5 mb-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                            {guide.title}
                          </span>
                          <button onClick={() => setShowApiGuide(false)} className="text-[10px] text-slate-400 hover:text-slate-600">가이드 숨기기</button>
                        </div>
                        <ol className="list-decimal list-inside space-y-1.5">
                          <li>
                            <strong>홈페이지 바로가기:</strong>{' '}
                            <a href={guide.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 font-bold hover:underline">
                              {guide.urlLabel}
                            </a>
                          </li>
                          {guide.steps.map((step, idx) => {
                            const splitIdx = step.indexOf(':');
                            if (splitIdx !== -1) {
                              const stepTitle = step.substring(0, splitIdx + 1);
                              const stepDesc = step.substring(splitIdx + 1);
                              return (
                                <li key={idx}>
                                  <strong>{stepTitle}</strong>{stepDesc}
                                </li>
                              );
                            }
                            return <li key={idx}>{step}</li>;
                          })}
                        </ol>
                      </div>
                    );
                  })()}
              </div>
          )}

          {/* 완료 시 문자 발송 설정 */}
          <div className="bg-slate-50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500" />
              납품/완료 시 문자 자동화 설정
            </h4>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.sendOnComplete || false} 
                  onChange={(e) => handleChange('sendOnComplete', e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">작업이 [납품/완료]로 바뀔 때 알림 문자 발송 기능 활성화</span>
            </div>

            {config.sendOnComplete && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">완료 문자 내용 템플릿</label>
                  <textarea 
                    value={config.completedMessageTemplate}
                    onChange={(e) => handleChange('completedMessageTemplate', e.target.value)}
                    className={`${inputClass} h-20 text-xs font-medium leading-relaxed resize-y`}
                    placeholder="완료 시 고객에게 보낼 기본 메시지 내용을 입력하세요."
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">계좌번호 안내 문자 템플릿</label>
                  <textarea 
                    value={config.billingMessageTemplate}
                    onChange={(e) => handleChange('billingMessageTemplate', e.target.value)}
                    className={`${inputClass} h-20 text-xs font-medium leading-relaxed resize-y`}
                    placeholder="계좌번호 발송 시 고객에게 보낼 기본 메시지 내용을 입력하세요."
                  />
                </div>
                
                {/* 변수 치환 안내 배지 */}
                <div className="bg-blue-50/50 dark:bg-slate-800 p-3 rounded-lg border border-blue-100 dark:border-slate-700 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 block">사용 가능한 자동 치환 키워드 (괄호 포함하여 입력):</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-1 rounded font-bold border border-slate-200 dark:border-slate-600 select-all cursor-pointer" title="클릭하여 복사" onClick={() => navigator.clipboard.writeText('{고객명}')}>{'{고객명}'} : 담당자명/상호</span>
                    <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-1 rounded font-bold border border-slate-200 dark:border-slate-600 select-all cursor-pointer" title="클릭하여 복사" onClick={() => navigator.clipboard.writeText('{주문명}')}>{'{주문명}'} : 작업 이름</span>
                    <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-1 rounded font-bold border border-slate-200 dark:border-slate-600 select-all cursor-pointer" title="클릭하여 복사" onClick={() => navigator.clipboard.writeText('{회사명}')}>{'{회사명}'} : 우리 인쇄소 상호</span>
                    <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-1 rounded font-bold border border-slate-200 dark:border-slate-600 select-all cursor-pointer" title="클릭하여 복사" onClick={() => navigator.clipboard.writeText('{연락처}')}>{'{연락처}'} : 고객 연락처</span>
                    <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-1 rounded font-bold border border-slate-200 dark:border-slate-600 select-all cursor-pointer" title="클릭하여 복사" onClick={() => navigator.clipboard.writeText('{계좌정보}')}>{'{계좌정보}'} : 회사 계좌번호</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 설정 저장 버튼 (관리자만 활성화) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button 
                onClick={handleSave} 
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={currentUser?.role !== 'admin'}
                title={currentUser?.role === 'admin' ? '설정을 데이터베이스에 저장합니다' : '관리자 계정만 저장이 가능합니다'}
              >
                  <Save size={18} />
                  설정 저장
              </button>
          </div>
      </div>
    </div>
  );
};
