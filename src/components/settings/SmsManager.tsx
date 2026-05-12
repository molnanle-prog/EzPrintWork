
import React, { useState, useEffect } from 'react';
import { db, formatPhoneNumber } from '../../services/dataService';
import { SmsConfig } from '../../types';
import { MessageSquare, Save, Smartphone, Server, CheckCircle2, Lock } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const SmsManager: React.FC = () => {
  const [config, setConfig] = useState<SmsConfig>({
    mode: 'app',
    provider: 'coolsms',
    apiKey: '',
    apiSecret: '',
    senderNumber: '',
    useAlimtalk: false,
    pfId: '',
    alimtalkTemplates: {}
  });
  const [statuses, setStatuses] = useState(db.getStatusDefinitions());
  const { showAlert } = useDialog();

  useEffect(() => {
    setConfig({
      ...db.getSmsConfig(),
      alimtalkTemplates: db.getSmsConfig().alimtalkTemplates || {}
    });
    setStatuses(db.getStatusDefinitions());
  }, []);

  const handleSave = async () => {
    if (config.mode === 'api') {
      if (!config.apiKey || !config.apiSecret || !config.senderNumber) {
        await showAlert('API 연동 모드 사용 시 API Key, Secret Key, 발신번호는 필수입니다.');
        return;
      }
    }
    db.saveSmsConfig(config);
    await showAlert('문자 발송 설정이 저장되었습니다.');
  };

  const handleChange = (field: keyof SmsConfig, value: string) => {
    let finalValue = value;
    if (field === 'senderNumber') {
      finalValue = formatPhoneNumber(value);
    }
    setConfig({ ...config, [field]: finalValue });
  };

  const inputClass = "w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
        <MessageSquare className="text-blue-600 dark:text-blue-400" />
        문자 발송 설정 (SMS/LMS)
      </h3>

      <div className="space-y-8">

        {/* Mode Selection */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setConfig({ ...config, mode: 'app' })}
            className={`p-4 rounded-xl border-2 text-left transition-all relative ${config.mode === 'app' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 dark:text-slate-100">
              <Smartphone size={20} className={config.mode === 'app' ? 'text-blue-600' : 'text-slate-400'} />
              기본 (앱 연동)
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Windows '휴대폰과 연결' 앱을 통해 개인 휴대폰으로 문자를 발송합니다. <br />
              <span className="font-bold text-blue-600 dark:text-blue-400">무료 (통신사 요금제 사용)</span>
            </p>
            {config.mode === 'app' && <CheckCircle2 className="absolute top-4 right-4 text-blue-600" size={20} />}
          </button>

          <button
            onClick={() => setConfig({ ...config, mode: 'api' })}
            className={`p-4 rounded-xl border-2 text-left transition-all relative ${config.mode === 'api' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 dark:text-slate-100">
              <Server size={20} className={config.mode === 'api' ? 'text-blue-600' : 'text-slate-400'} />
              API 연동 (자동발송)
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              문자 중계 서비스(CoolSMS/알리고)를 통해 즉시 전송합니다. <br />
              <span className="font-bold text-orange-600 dark:text-orange-400">유료 (건당 과금)</span>
            </p>
            {config.mode === 'api' && <CheckCircle2 className="absolute top-4 right-4 text-blue-600" size={20} />}
          </button>
        </div>

        {/* API Configuration Form */}
        {config.mode === 'api' && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700 mb-2">
              <Lock size={16} className="text-slate-400" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">API 계정 정보 입력</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">서비스 제공사</label>
                <select
                  value={config.provider}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  className={inputClass}
                >
                  <option value="coolsms">CoolSMS (쿨에스엠에스)</option>
                  <option value="aligo">Aligo (알리고)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">발신번호 (사전등록 필수)</label>
                <input
                  type="text"
                  value={config.senderNumber}
                  onChange={(e) => handleChange('senderNumber', e.target.value)}
                  className={inputClass}
                  placeholder="02-000-0000"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">API Key</label>
                <input
                  type="text"
                  value={config.apiKey}
                  onChange={(e) => handleChange('apiKey', e.target.value)}
                  className={inputClass}
                  placeholder="발급받은 API Key 입력"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">API Secret Key</label>
                <input
                  type="password"
                  value={config.apiSecret}
                  onChange={(e) => handleChange('apiSecret', e.target.value)}
                  className={inputClass}
                  placeholder="발급받은 API Secret 입력"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
              * API Key는 해당 서비스 홈페이지 &gt; 개발자 센터에서 발급받을 수 있습니다.<br />
              * 발신번호는 반드시 해당 사이트에서 사전에 등록된 번호여야 전송됩니다.
            </div>
          </div>
        )}

        {/* AlimTalk Configuration Form */}
        {config.mode === 'api' && (
          <div className="bg-yellow-50 dark:bg-slate-900 border border-yellow-200 dark:border-slate-700 rounded-xl p-5 space-y-4 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-2 border-b border-yellow-200 dark:border-slate-700 mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-yellow-600 dark:text-yellow-500" />
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">카카오 알림톡 자동 발송 설정</h4>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.useAlimtalk || false}
                  onChange={(e) => handleChange('useAlimtalk', e.target.checked as any)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600"
                />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">알림톡 사용</span>
              </label>
            </div>

            {config.useAlimtalk && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">플러스친구 ID (카카오톡 채널 검색용 아이디)</label>
                  <input
                    type="text"
                    value={config.pfId || ''}
                    onChange={(e) => handleChange('pfId', e.target.value)}
                    className={inputClass}
                    placeholder="@플러스친구아이디"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-yellow-200 dark:border-slate-700">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">주문 상태별 알림톡 템플릿 코드 매핑</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700">
                    {statuses.map(status => (
                      <div key={status.key} className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">[{status.label}] 상태 변경 시</span>
                        <input
                          type="text"
                          value={config.alimtalkTemplates?.[status.key] || ''}
                          onChange={(e) => {
                            setConfig(prev => ({
                              ...prev,
                              alimtalkTemplates: {
                                ...(prev.alimtalkTemplates || {}),
                                [status.key]: e.target.value
                              }
                            }));
                          }}
                          className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          placeholder="템플릿 코드 입력 (예: template_01)"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">※ 템플릿 코드가 비어있는 상태로 변경 시 문자가 발송되지 않습니다.</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-all active:scale-95"
          >
            <Save size={18} />
            설정 저장
          </button>
        </div>
      </div>
    </div>
  );
};
