import React, { useState } from 'react';
import { APP_PRODUCT_NAME, TRIAL_PERIOD_DAYS } from '../../constants';
import { getWebMachineId } from '../../lib/machineId';

export const ActivationScreen = ({ licenseInfo, onActivationSuccess }: { licenseInfo: any, onActivationSuccess: () => void }) => {
    const [inputKey, setInputKey] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [userName, setUserName] = useState('');
    const [pin, setPin] = useState('');
    const [authContact, setAuthContact] = useState('');
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState('');

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        const rawKey = inputKey.trim();

        if (!rawKey || !companyName || !userName || !pin || !authContact) {
            setError('모든 정보(상호, 사용자, 키, 연락처, PIN)를 입력해주세요.');
            return;
        }
        if (pin.length < 4) { setError('PIN 번호는 4자리 이상이어야 합니다.'); return; }

        setIsActivating(true);
        setError('');

        const keyToSend = rawKey.toUpperCase() === 'TRIAL'
            ? 'TRIAL'
            : (rawKey.replace(/-/g, '').startsWith('EZPW')
                ? rawKey.replace(/-/g, '')
                : `EZPW${rawKey.replace(/-/g, '')}`);

        if (window.electron) {
            try {
                const result = await window.electron.activateLicense({
                    key: keyToSend,
                    company: companyName,
                    user: userName,
                    pin: pin,
                    contact: authContact
                });

                if (result.success) {
                    alert('인증이 완료되었습니다! 프로그램을 다시 시작합니다.');
                    onActivationSuccess();
                } else {
                    setError(result.msg || '인증에 실패했습니다.');
                }
            } catch (e: any) {
                setError('통신 오류: ' + e.message);
            } finally {
                setIsActivating(false);
            }
        } else {
            // Web environment logic
            try {
                await new Promise(resolve => setTimeout(resolve, 800));
                const webMachineId = getWebMachineId();
                const isTrial = keyToSend === 'TRIAL';
                const mockLicense = {
                    key: keyToSend,
                    company: companyName,
                    user: userName,
                    contact: authContact,
                    machineId: webMachineId,
                    product: APP_PRODUCT_NAME,
                    activatedAt: Date.now(),
                    expiry: isTrial ? Date.now() + (TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000) : undefined
                };
                localStorage.setItem('pm_web_license', JSON.stringify(mockLicense));
                if (isTrial) {
                    localStorage.setItem('pm_trial_start', Date.now().toString());
                }
                alert('[웹 환경] 인증이 완료되었습니다.\n(브라우저 캐시 삭제 시 초기화됩니다)');
                onActivationSuccess();
            } catch (e) {
                setError('웹 인증 처리 중 오류가 발생했습니다.');
            } finally {
                setIsActivating(false);
            }
        }
    };

    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white">
            <div className="bg-slate-800 p-8 rounded-lg shadow-xl max-w-md w-full">
                <h1 className="text-2xl font-bold text-center mb-2">라이선스 인증</h1>
                <p className="text-center text-slate-400 mb-6">EzPrintWork를 사용하려면 인증이 필요합니다.</p>
                
                {licenseInfo.status === 'EXPIRED' && (
                    <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 px-4 py-3 rounded-md mb-4 text-sm">
                        {licenseInfo.message}
                    </div>
                )}
                {licenseInfo.status === 'INVALID' && (
                     <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md mb-4 text-sm">
                        {licenseInfo.message}
                    </div>
                )}

                <form onSubmit={handleActivate} className="space-y-4">
                    <input type="text" placeholder="라이선스 키" value={inputKey} onChange={e => setInputKey(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="상호명" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="사용자명" value={userName} onChange={e => setUserName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="연락처" value={authContact} onChange={e => setAuthContact(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="password" placeholder="PIN (4자리 이상)" value={pin} onChange={e => setPin(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    
                    <button type="submit" disabled={isActivating} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50">
                        {isActivating ? '인증 중...' : '인증하기'}
                    </button>
                    {error && <p className="text-red-400 mt-2 text-center">{error}</p>}
                </form>
            </div>
        </div>
    );
};
