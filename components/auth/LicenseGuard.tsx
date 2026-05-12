
import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Lock, Key, Loader2, X, ShoppingCart, CreditCard, Phone, Building, Clock, Copy, Mail, User, Sparkles, Send, Database, Info, Server, FolderOpen, Gift } from 'lucide-react';
import { formatPhoneNumber, db } from '../../services/dataService'; // db import 추가

// =========================================================
// [설정] 웹 모드용 통신 상수 (Electron과 동일하게 유지)
// =========================================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxFWYTfEQN0dh8MelBk00ki2JAYbLXkCax47N4O0YQqhqqaykmKfzIkk9GfKucsAzuANg/exec";
const SECRET_TOKEN = "EzImpo_Secure_Handshake_Token_v3_X9Z";
const APP_PRODUCT_NAME = "EzPrintWork";
const TRIAL_PERIOD_DAYS = 50; // 체험판 기간

// =========================================================
// [개발용 설정] 라이선스 화면 건너뛰기
// 개발 완료 후 이 값을 false로 변경하면 라이선스 화면이 다시 활성화됩니다.
// =========================================================
const DEV_BYPASS_LICENSE = false;

interface LicenseGuardProps {
    children: React.ReactNode;
}

export const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
    const [isValid, setIsValid] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hwid, setHwid] = useState('');
    const [statusMsg, setStatusMsg] = useState('라이선스 확인 중...');
    const [appVersion, setAppVersion] = useState('1.2.0');

    // Connection Info
    const [connInfo, setConnInfo] = useState<{ sheetId: string, sheetUrl: string, scriptUrl: string } | null>(null);

    // Tab State
    const [activeTab, setActiveTab] = useState<'auth' | 'nas_auth' | 'buy'>('auth');

    // License Data State
    const [licenseData, setLicenseData] = useState<any>(null);
    const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

    // Registration Form State
    const [inputKey, setInputKey] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [userName, setUserName] = useState('');
    const [authContact, setAuthContact] = useState('');
    const [pin, setPin] = useState('');
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState('');

    // Purchase Request State
    const [buyCompany, setBuyCompany] = useState('');
    const [buyDepositor, setBuyDepositor] = useState('');
    const [buyContact, setBuyContact] = useState('');
    const [isRequesting, setIsRequesting] = useState(false);
    const [requestMsg, setRequestMsg] = useState('');

    // NAS Connect State
    const [nasPath, setNasPath] = useState('');
    const [nasStatus, setNasStatus] = useState('');

    useEffect(() => {
        if (DEV_BYPASS_LICENSE) {
            setIsValid(true);
            setIsLoading(false);
            return;
        }

        checkLicense();
        if (window.electron && window.electron.getLicenseInfo) {
            window.electron.getLicenseInfo().then((info) => setConnInfo(info));
        } else {
            setConnInfo({
                scriptUrl: GOOGLE_SCRIPT_URL,
                sheetId: "1DBSYg8Lqp-Z0o4e35vGsU00XhJeClua-cirsH32xRFQ",
                sheetUrl: "https://docs.google.com/spreadsheets/d/1DBSYg8Lqp-Z0o4e35vGsU00XhJeClua-cirsH32xRFQ/edit"
            });
        }
    }, []);

    const getWebMachineId = () => {
        let id = localStorage.getItem('pm_license_hwid');
        if (!id) {
            id = 'WEB-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            localStorage.setItem('pm_license_hwid', id);
        }
        return id;
    };

    const checkLicense = async () => {
        let licenseFound = false;

        // 1. Electron Environment Check
        if (window.electron) {
            try {
                const id = await window.electron.getMachineId();
                setHwid(id);
                const ver = await window.electron.getAppVersion();
                setAppVersion(ver);

                // Check Local License File
                const result = await window.electron.verifyLicense();
                if (result.isValid) {
                    setIsValid(true);
                    setLicenseData(result.data);
                    licenseFound = true;

                    // [추가] TRIAL 키인 경우 체험판 배너 표시
                    if (result.data.key === 'TRIAL' && result.data.expiry) {
                        const diffTime = Math.abs(result.data.expiry - Date.now());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        setTrialDaysLeft(diffDays);
                    }
                }
            } catch (e) {
                console.error(e);
                setStatusMsg('라이선스 모듈 통신 오류');
            }
        }
        // 2. Web Environment Check
        else {
            const savedLicense = localStorage.getItem('pm_web_license');
            const webHwid = getWebMachineId();
            setHwid(webHwid);

            if (savedLicense) {
                try {
                    const parsed = JSON.parse(savedLicense);
                    if (parsed.machineId === webHwid && parsed.product === APP_PRODUCT_NAME) {
                        setIsValid(true);
                        setLicenseData(parsed);
                        licenseFound = true;
                    }
                } catch (e) { }
            }
        }

        // 3. Trial Check (Only if no real license found)
        if (!licenseFound) {
            const trialStart = localStorage.getItem('pm_trial_start');
            if (trialStart) {
                const startDate = parseInt(trialStart);
                const now = Date.now();
                const diffTime = Math.abs(now - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const remaining = TRIAL_PERIOD_DAYS - diffDays;

                if (remaining >= 0) {
                    setIsValid(true);
                    setTrialDaysLeft(remaining);
                } else {
                    setIsValid(false);
                    setTrialDaysLeft(-1); // Expired
                    setStatusMsg('무료 체험 기간이 만료되었습니다.');
                }
            } else {
                setIsValid(false);
                setStatusMsg('라이선스 또는 체험판 인증이 필요합니다.');
            }
        }

        setIsLoading(false);
    };

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.toUpperCase();

        if (raw.includes('TRIAL')) {
            setInputKey(raw);
            return;
        }

        const val = raw.replace(/[^A-Z0-9]/gi, '');

        if (raw.startsWith('EZPW')) {
            // New format: EZPW-XXXX-XXXX-XXXX
            const cleanVal = val.slice(0, 16); // EZPW + 12 chars
            const coreVal = cleanVal.substring(4);
            const parts = coreVal.match(/.{1,4}/g);
            let formatted = 'EZPW' + (parts && parts.length > 0 ? '-' + parts.join('-') : '');
            setInputKey(formatted);
        } else {
            // Old format: XXXX-XXXX-XXXX-XXXX
            const cleanVal = val.slice(0, 16);
            const parts = cleanVal.match(/.{1,4}/g);
            let formatted = parts ? parts.join('-') : '';
            setInputKey(formatted);
        }
    };

    const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // 휴대폰 번호 자동 하이픈
        setAuthContact(formatPhoneNumber(e.target.value));
    };

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
                    window.location.reload();
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
                window.location.reload();
            } catch (e) {
                setError('웹 인증 처리 중 오류가 발생했습니다.');
            } finally {
                setIsActivating(false);
            }
        }
    };

    // --- Purchase Logic ---
    const handleCopyBank = () => {
        navigator.clipboard.writeText("3333-35-8219913");
        alert("계좌번호가 복사되었습니다.");
    };

    const handlePurchaseRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!buyCompany || !buyDepositor || !buyContact) {
            alert('상호명, 입금자명, 연락처를 모두 입력해주세요.');
            return;
        }

        setIsRequesting(true);

        if (window.electron) {
            try {
                const result = await window.electron.requestPurchase({
                    company: buyCompany,
                    depositor: buyDepositor,
                    contact: buyContact
                });

                if (result.success) {
                    alert('구매 요청이 서버로 전송되었습니다.\n\n[입금 확인 후] 관리자가 문자로 라이선스 키를 발송해 드립니다.\n(영업일 기준 24시간 이내 처리)');
                    setActiveTab('auth');
                } else {
                    alert('전송 실패: ' + result.msg);
                }
            } catch (e: any) {
                alert('통신 오류: ' + e.message);
            }
        } else {
            // Web Mock
            setTimeout(() => {
                alert('[주의: 웹 테스트 모드]\n실제 전송되지 않았습니다. PC 앱에서 실행해주세요.\n\n(모의 전송 완료)');
                setActiveTab('auth');
            }, 500);
        }
        setIsRequesting(false);
    };

    const handleAppClose = () => { if (window.electron) window.electron.close(); };

    // --- New Logic: NAS Group License Connect ---
    const handleNasSelect = async () => {
        if (!window.electron) return;
        try {
            const path = await window.electron.selectDirectory();
            if (path) setNasPath(path);
        } catch (e) { console.error(e); }
    };

    const handleNasConnect = async () => {
        if (!nasPath) return;
        setNasStatus('연결 및 검증 중...');

        try {
            await db.saveNasConfig({ isEnabled: true, path: nasPath, status: 'connected' });
            const currentData = JSON.parse(db.exportData());

            if (currentData.licenseConfig && currentData.licenseConfig.key) {
                const { key, maxUsers, companyName } = currentData.licenseConfig;
                const registered = await db.registerLicenseDevice(key, maxUsers, companyName);

                if (registered) {
                    alert(`그룹 라이선스 인증 성공!\n업체명: ${companyName}\n(최대 ${maxUsers}대 허용)`);
                    setIsValid(true);
                } else {
                    setNasStatus(`라이선스 허용 인원(${maxUsers}명)을 초과하였습니다.\n관리자에게 문의하여 미사용 기기를 삭제하세요.`);
                    db.saveNasConfig({ isEnabled: false, path: '', status: 'disconnected' });
                }
            } else {
                setNasStatus('선택한 파일에 그룹 라이선스 정보가 없습니다.\n메인 PC에서 먼저 정품 인증을 진행해주세요.');
                db.saveNasConfig({ isEnabled: false, path: '', status: 'disconnected' });
            }
        } catch (e: any) {
            setNasStatus('오류 발생: ' + e.message);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-6">
                <Loader2 size={48} className="animate-spin text-blue-500" />
                <p>Loading...</p>
            </div>
        );
    }

    if (isValid) {
        return (
            <>
                {trialDaysLeft !== null && (
                    <div className="bg-indigo-600 text-white text-xs font-bold text-center py-1 absolute top-0 w-full z-[100] shadow-md pointer-events-none">
                        🚀 무료 체험 중: {trialDaysLeft}일 남았습니다. 정품 전환 시 데이터는 유지됩니다.
                    </div>
                )}
                {children}
            </>
        );
    }

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-[#1a1a1a] font-sans text-slate-200">
            {/* Top Drag Region - Z-index fixed LOW (10) to not cover modal inputs */}
            <div className="absolute top-0 left-0 w-full h-8 z-[10]" style={{ WebkitAppRegion: 'drag' } as any}></div>

            {/* Modal Container - Z-index set HIGHER (50) than drag region */}
            <div className="absolute inset-0 flex items-center justify-center p-4 z-[50]">
                <div className="bg-[#222] rounded-xl shadow-2xl border border-[#333] w-full max-w-[600px] overflow-hidden relative flex flex-col max-h-[95vh]" style={{ WebkitAppRegion: 'no-drag' } as any}>

                    {/* Header */}
                    <div className="flex justify-between items-center p-5 border-b border-[#333]">
                        <div className="flex items-center gap-2 text-white font-bold text-xl">
                            <ShieldAlert className="text-blue-500" size={24} />
                            Ez라이선스 관리 (EzPrintWork)
                        </div>
                        <button onClick={handleAppClose} className="text-slate-500 hover:text-white transition-colors p-1"><X size={24} /></button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-[#333] overflow-x-auto">
                        <button onClick={() => setActiveTab('auth')} className={`flex-1 py-4 px-2 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'auth' ? 'text-white bg-[#2a2a2a]' : 'text-slate-500 hover:text-slate-300'}`}>
                            정품 인증 (메인)
                            {activeTab === 'auth' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>}
                        </button>
                        <button onClick={() => setActiveTab('nas_auth')} className={`flex-1 py-4 px-2 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'nas_auth' ? 'text-emerald-500 bg-[#2a2a2a]' : 'text-slate-500 hover:text-slate-300'}`}>
                            그룹 연결 (서브)
                            {activeTab === 'nas_auth' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500"></div>}
                        </button>
                        <button onClick={() => setActiveTab('buy')} className={`flex-1 py-4 px-2 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'buy' ? 'text-orange-500 bg-[#2a2a2a]' : 'text-slate-500 hover:text-slate-300'}`}>
                            구매 요청
                            {activeTab === 'buy' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500"></div>}
                        </button>
                    </div>

                    <div className="p-7 overflow-y-auto custom-scrollbar flex-1 bg-[#1e1e1e]">

                        {/* AUTH TAB (Main PC) */}
                        {activeTab === 'auth' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <form onSubmit={handleActivate} className="space-y-5">
                                    {/* TRIAL Banner */}
                                    <div className="bg-indigo-900/30 border border-indigo-500/30 p-3 rounded-lg flex items-start gap-3">
                                        <div className="bg-indigo-600 p-1.5 rounded-full mt-0.5 shrink-0">
                                            <Gift size={16} className="text-white" />
                                        </div>
                                        <div className="text-sm">
                                            <p className="text-indigo-200 font-bold mb-0.5">무료 체험판을 찾으시나요?</p>
                                            <p className="text-slate-300 text-xs leading-relaxed">
                                                라이선스 키 입력란에 <span className="text-yellow-400 font-bold bg-indigo-900 px-1 rounded">TRIAL</span>을 입력하고 인증하면 <br />
                                                50일간 모든 기능을 무료로 사용하실 수 있습니다.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-xl text-sm text-blue-200">
                                        <p className="font-bold mb-1">📢 메인 PC(관리자) 인증</p>
                                        <p className="text-xs text-blue-300/70">
                                            최초 1회, 관리자가 라이선스 키를 입력하여 인증합니다. 인증 후 생성된 데이터 파일을 NAS에 공유하면 다른 PC도 연결할 수 있습니다.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-400">상호명</label>
                                            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-blue-500 outline-none" placeholder="예: 에이에스컴" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-400">사용자</label>
                                            <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-blue-500 outline-none" placeholder="예: 관리자" />
                                        </div>
                                    </div>

                                    {/* License Key & Phone Row */}
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-400">라이선스 키</label>
                                            <input
                                                type="text"
                                                value={inputKey}
                                                onChange={handleKeyChange}
                                                maxLength={19}
                                                className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-blue-500 outline-none font-mono uppercase placeholder-slate-500"
                                                placeholder="키 또는 TRIAL"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-400">관리자 연락처</label>
                                            <input
                                                type="text"
                                                value={authContact}
                                                onChange={handleContactChange}
                                                className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-blue-500 outline-none placeholder-slate-500"
                                                placeholder="010-0000-0000"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-400">PIN 번호 (재설치 확인용)</label>
                                        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-blue-500 outline-none text-center tracking-widest" placeholder="****" />
                                    </div>
                                    {error && <div className="text-red-400 text-sm font-bold p-2 bg-red-900/20 rounded">{error}</div>}
                                    <button type="submit" disabled={isActivating} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2">
                                        {isActivating ? <Loader2 className="animate-spin" /> : '정품 인증하기'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* NAS AUTH TAB (Sub PC) */}
                        {activeTab === 'nas_auth' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                                <div className="bg-emerald-900/20 border border-emerald-800/50 p-4 rounded-xl text-sm text-emerald-200">
                                    <p className="font-bold mb-1">🔗 그룹 라이선스 연결 (직원용)</p>
                                    <p className="text-xs text-emerald-300/70">
                                        이미 인증된 메인 PC의 데이터 파일(NAS 공유)을 선택하면, 별도 인증 없이 그룹 라이선스로 접속됩니다.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><FolderOpen size={16} /> 공유 데이터 파일 선택</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={nasPath}
                                            readOnly
                                            onClick={handleNasSelect}
                                            className="flex-1 p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white text-xs cursor-pointer hover:border-emerald-500 transition-colors truncate"
                                            placeholder="클릭하여 파일 선택 (예: Z:\Data\ezprint_data.json)"
                                        />
                                        <button onClick={handleNasSelect} className="bg-[#333] hover:bg-[#444] text-white p-3 rounded-lg"><FolderOpen size={18} /></button>
                                    </div>
                                </div>

                                {nasStatus && (
                                    <div className={`p-4 rounded-lg text-sm font-bold border ${nasStatus.includes('성공') ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900' : 'bg-red-900/20 text-red-400 border-red-900'} whitespace-pre-line`}>
                                        {nasStatus}
                                    </div>
                                )}

                                <button
                                    onClick={handleNasConnect}
                                    disabled={!nasPath}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Server size={20} /> 서버 연결 및 접속
                                </button>
                            </div>
                        )}

                        {/* BUY TAB (Restored & Fixed Layout) */}
                        {activeTab === 'buy' && (
                            <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                <form onSubmit={handlePurchaseRequest} className="space-y-5">
                                    <div className="bg-orange-900/20 border border-orange-800/50 p-4 rounded-xl text-sm text-orange-200 flex gap-3">
                                        <Sparkles size={20} className="shrink-0 text-yellow-400 mt-0.5" />
                                        <div>
                                            <p className="font-bold mb-1 text-orange-100">라이선스 구매 안내</p>
                                            <p className="text-xs text-orange-300/80 leading-relaxed">
                                                아래 정보들을 입력하여 구매 요청을 보내주시면, 입금 확인 후 <span className="text-yellow-400 font-bold">문자</span>로 라이선스 키를 발송해 드립니다.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-400 flex items-center gap-1"><Building size={14} className="text-orange-500" /> 업체명 (상호) <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            value={buyCompany}
                                            onChange={(e) => setBuyCompany(e.target.value)}
                                            className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-orange-500 outline-none"
                                            placeholder="예: 에이에스컴 기획"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-400 flex items-center gap-1"><User size={14} className="text-orange-500" /> 입금자명 (실제 입금자) <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            value={buyDepositor}
                                            onChange={(e) => setBuyDepositor(e.target.value)}
                                            className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-orange-500 outline-none"
                                            placeholder="예: 홍길동"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-400 flex items-center gap-1"><Phone size={14} className="text-orange-500" /> 휴대폰 <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            value={buyContact}
                                            onChange={(e) => setBuyContact(formatPhoneNumber(e.target.value))}
                                            className="block w-full p-3 bg-[#2a2a2a] border border-[#444] rounded-lg text-white focus:border-orange-500 outline-none"
                                            placeholder="010-1234-5678"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isRequesting}
                                        className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 mb-2 text-xl"
                                    >
                                        {isRequesting ? <Loader2 className="animate-spin" /> : <><Send size={24} className="-mt-0.5" /> 구매 요청 전송하기</>}
                                    </button>

                                    {/* Bank Info moved to bottom - COMPACT VERSION */}
                                    <div className="mt-4">
                                        <label className="text-sm font-bold text-slate-500 block mb-2 text-center">입금 계좌 안내</label>
                                        <div className="bg-[#111] border border-[#333] p-4 rounded-xl shadow-inner text-center">
                                            <p className="text-lg font-bold text-white mb-3">에이에스컴 종합몰 (개발자)</p>

                                            <div
                                                onClick={handleCopyBank}
                                                className="bg-[#1f1f1f] border border-[#333] rounded-lg p-3 cursor-pointer hover:bg-[#252525] hover:border-orange-500/50 transition-all group"
                                            >
                                                <div className="flex items-center justify-center gap-2 text-yellow-400 font-bold text-xl mb-1">
                                                    <Copy size={18} className="opacity-70 group-hover:opacity-100" />
                                                    카카오뱅크 3333-35-8219913
                                                </div>
                                                <div className="text-orange-400 font-bold text-base mb-1">에이에스컴 종합몰</div>
                                                <div className="text-xs text-slate-500">(클릭하면 복사가 완료됩니다)</div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 mt-3 text-sm font-bold text-blue-400">
                                                <span className="flex items-center gap-1.5"><Phone size={14} /> 010-6767-4580</span>
                                                <span className="hidden sm:inline text-slate-600">/</span>
                                                <span className="flex items-center gap-1.5"><Mail size={14} /> asmall77@naver.com</span>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
