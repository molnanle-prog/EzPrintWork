import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Printer, LogIn, Chrome, ShieldCheck, Loader2, Monitor, Lock, User, Building2, KeyRound, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export const LoginPage: React.FC = () => {
    const { loginCustomSession } = useAuth();
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [companyName, setCompanyName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isStaffLoggingIn, setIsStaffLoggingIn] = useState(false);

    // B2B Staff Self-Signup States
    const [isStaffSignup, setIsStaffSignup] = useState(false);
    const [staffName, setStaffName] = useState('');
    const [staffRole, setStaffRole] = useState('디자이너');
    const [isStaffSigningUp, setIsStaffSigningUp] = useState(false);

    // B2B Company Search States
    const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
    const [isSearchingCompany, setIsSearchingCompany] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // 구글 시트 연동 웹훅 URL (대표님께서 발급받으신 주소로 나중에 교체해주세요)
    const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyv8iMZs_3Pb-Dk3gJO7YEeFAOPA_DzD93YPHxyMHMQXN5-Xt0iQnRe1AoJiSY8EPuE/exec";


    const handleDownloadShortcut = () => {
        const isConfirmed = window.confirm('바탕화면 바로가기 아이콘 파일을 다운로드하시겠습니까?\n\n다운로드 후, 다운로드 폴더의 파일을 컴퓨터 바탕화면에 마우스로 끌어다(드래그) 놓고 사용하세요!');
        if (!isConfirmed) return;

        const shortcutContent = `[InternetShortcut]
URL=https://ez-hub.kr/ezpw/
IDList=
HotKey=0
IconIndex=0
IconFile=https://ez-hub.kr/favicon.ico
`;
        const blob = new Blob([shortcutContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'EzPrintWork 바탕화면 바로가기.url';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });

        // 25초 후 자동 타임아웃 해제 장치
        const timeoutId = setTimeout(() => {
            setIsLoggingIn((current) => {
                if (current) {
                    toast.error('구글 로그인 응답이 지연되어 로딩을 초기화합니다.');
                    return false;
                }
                return current;
            });
        }, 25000);

        // Electron 등에서 팝업 닫힘 이벤트를 감지하기 어려운 경우를 대비해 
        // 메인 윈도우 포커스 복귀 시 로딩 해제 처리
        let focusTimeoutId: any;
        const onFocus = () => {
            focusTimeoutId = setTimeout(() => {
                setIsLoggingIn((current) => {
                    if (current) {
                        toast.error('구글 로그인 창이 닫혔습니다.');
                        clearTimeout(timeoutId);
                        return false;
                    }
                    return current;
                });
            }, 1000);
            window.removeEventListener('focus', onFocus);
        };
        
        setTimeout(() => {
            window.addEventListener('focus', onFocus);
        }, 1000);

        try {
            await signInWithPopup(auth, provider);
            window.removeEventListener('focus', onFocus);
            if (focusTimeoutId) clearTimeout(focusTimeoutId);
            clearTimeout(timeoutId);
            toast.success('환영합니다! 성공적으로 로그인되었습니다.');
        } catch (error: any) {
            window.removeEventListener('focus', onFocus);
            if (focusTimeoutId) clearTimeout(focusTimeoutId);
            clearTimeout(timeoutId);
            console.error(error);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                toast.error('구글 로그인 창이 닫혔습니다.');
            } else {
                toast.error('로그인 중 오류가 발생했습니다: ' + error.message);
            }
        } finally {
            window.removeEventListener('focus', onFocus);
            if (focusTimeoutId) clearTimeout(focusTimeoutId);
            clearTimeout(timeoutId);
            setIsLoggingIn(false);
        }
    };

    const handleStaffLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) {
            toast.error('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setIsStaffLoggingIn(true);

        try {
            const { collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            
            // Query Firestore for the user matching loginId and password globally
            const userQuery = query(
                collection(db, 'users'),
                where('loginId', '==', loginId.trim()),
                where('password', '==', password.trim())
            );

            const userSnapshot = await getDocs(userQuery);
            if (userSnapshot.empty) {
                toast.error('아이디 또는 비밀번호가 올바르지 않습니다.');
                setIsStaffLoggingIn(false);
                return;
            }

            const userDoc = userSnapshot.docs[0];
            const userData = userDoc.data();
            const tenantId = userData.tenantId;

            if (!tenantId) {
                toast.error('등록된 회사 정보가 없는 직원 계정입니다.');
                setIsStaffLoggingIn(false);
                return;
            }

            // Retrieve the tenant's plan info
            const tenantDocRef = doc(db, 'tenants', tenantId);
            const tenantDocSnap = await getDoc(tenantDocRef);
            let tenantPlan = 'free';
            let tenantName = '';
            if (tenantDocSnap.exists()) {
                const tenantData = tenantDocSnap.data();
                tenantPlan = (tenantData.plan === 'pro_plus' ? 'pro' : tenantData.plan) || 'free';
                tenantName = tenantData.name || '';
            }

            // Set custom session in AuthContext
            const appUser = {
                uid: userDoc.id,
                id: userDoc.id,
                email: userData.email || '',
                displayName: userData.userName || userData.name || '사원',
                name: userData.userName || userData.name || '사원',
                photoURL: '',
                avatarUrl: '',
                tenantId: tenantId,
                role: 'staff' as const
            };

            loginCustomSession(appUser, tenantPlan as 'free' | 'pro');
            toast.success(tenantName ? `[${tenantName}] 직원 로그인에 성공했습니다! 환영합니다.` : '직원 로그인에 성공했습니다! 환영합니다.');
        } catch (error: any) {
            console.error("Staff login error:", error);
            toast.error('로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setIsStaffLoggingIn(false);
        }
    };

    const handleStaffSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !joinCode.trim() || !loginId.trim() || !password.trim() || !staffName.trim()) {
            toast.error('모든 정보를 입력해주세요.');
            return;
        }

        if (joinCode.trim().length < 6) {
            toast.error('회사 입장 코드는 6자 이상이어야 합니다.');
            return;
        }

        if (loginId.trim().length < 4) {
            toast.error('직원 아이디는 4자 이상이어야 합니다.');
            return;
        }

        if (password.trim().length < 4) {
            toast.error('비밀번호는 4자 이상이어야 합니다.');
            return;
        }

        setIsStaffSigningUp(true);

        try {
            const { collection, query, where, getDocs, doc, setDoc } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');

            // 1. Query Firestore for the tenant matching companyName & joinCode
            const tenantQuery = query(
                collection(db, 'tenants'),
                where('name', '==', companyName.trim()),
                where('joinCode', '==', joinCode.trim())
            );
            
            const tenantSnapshot = await getDocs(tenantQuery);
            if (tenantSnapshot.empty) {
                toast.error('회사명 또는 회사입장코드가 일치하는 워크스페이스가 없습니다.');
                setIsStaffSigningUp(false);
                return;
            }

            const tenantDoc = tenantSnapshot.docs[0];
            const tenantId = tenantDoc.id;
            const tenantData = tenantDoc.data();

            // 2. Check if loginId is already taken inside global users for this tenant
            const userCheckQuery = query(
                collection(db, 'users'),
                where('tenantId', '==', tenantId),
                where('loginId', '==', loginId.trim())
            );
            const userCheckSnapshot = await getDocs(userCheckQuery);
            if (!userCheckSnapshot.empty) {
                toast.error('이 아이디는 해당 회사에 이미 등록되어 사용 중입니다.');
                setIsStaffSigningUp(false);
                return;
            }

            // 3. Create document reference in users
            const newUserRef = doc(collection(db, 'users'));
            const newUserId = newUserRef.id;

            // 4. Save to global users collection
            await setDoc(newUserRef, {
                uid: newUserId,
                id: newUserId,
                tenantId: tenantId,
                loginId: loginId.trim(),
                password: password.trim(),
                userName: staffName.trim(),
                name: staffName.trim(),
                role: 'staff',
                position: staffRole,
                createdAt: new Date().toISOString()
            });

            // 5. Save to tenants/{tenantId}/staff collection
            const staffRef = doc(db, `tenants/${tenantId}/staff`, newUserId);
            await setDoc(staffRef, {
                id: newUserId,
                uid: newUserId,
                name: staffName.trim(),
                role: staffRole,
                phone: '',
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staffName.trim()}`,
                active: true,
                email: '',
                loginId: loginId.trim(),
                password: password.trim(),
                joinDate: new Date().toISOString()
            });

            // 6. 구글 시트로 데이터 전송 (Upsert 로직을 통해 시트와 동기화)
            try {
                await fetch(GAS_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: "signup_staff",
                        companyName: companyName.trim(),
                        loginId: loginId.trim(),
                        password: password.trim(),
                        staffName: staffName.trim(),
                        staffRole: staffRole,
                        contact: ''
                    })
                });
            } catch (err) {
                console.error("Google Sheets Sync Error:", err);
                // 구글 시트 전송이 일시적으로 실패해도, 파이어베이스에는 이미 안전하게 저장됨
            }

            toast.success(`[${companyName}] 직원 가입이 성공적으로 완료되었습니다! 로그인 해보세요.`);
            setIsStaffSignup(false);
            // Reset fields
            setStaffName('');
            setLoginId('');
            setPassword('');
        } catch (error: any) {
            console.error("Staff signup error:", error);
            toast.error('직원 가입 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setIsStaffSigningUp(false);
        }
    };

    const handleSearchCompany = async () => {
        if (!companyName.trim()) {
            toast.error('검색할 회사명을 입력해주세요.');
            return;
        }

        setIsSearchingCompany(true);
        setHasSearched(true);
        try {
            const { collection, getDocs, query } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            
            const q = query(collection(db, 'tenants'));
            const snap = await getDocs(q);
            const term = companyName.trim().toLowerCase();
            
            const matches = snap.docs
                .map(doc => ({ id: doc.id, name: (doc.data().name || '') as string }))
                .filter(t => t.name.toLowerCase().includes(term));
                
            setSearchResults(matches);
        } catch (error: any) {
            console.error("Search company error:", error);
            toast.error('회사 검색 중 오류가 발생했습니다.');
        } finally {
            setIsSearchingCompany(false);
        }
    };

    const handleSelectCompany = (name: string) => {
        setCompanyName(name);
        setSearchResults([]);
        setHasSearched(false);
        toast.success(`[${name}] 소속 회사가 선택되었습니다.`);
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-6 font-sans">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[25%] -left-[10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute -bottom-[25%] -right-[10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[100px]"></div>
            </div>
 
            <div className="max-w-xl w-full z-10 space-y-6 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Printer className="text-white" size={40} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">EzPrintWork</h1>
                        <p className="text-slate-500 font-medium tracking-tight">인쇄소 업무 관리의 새로운 기준 (v1.2.1)</p>
                    </div>
                </div>
 
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl space-y-6">
                    <div className="space-y-1.5 text-center">
                        <h2 className="text-xl font-bold text-white">
                            {isStaffSignup ? '사내 직원 가입 신청' : '클라우드 시작하기'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {isStaffSignup ? '소속 회사의 입장 코드를 입력하고 가입하세요.' : '별도의 설치 없이 브라우저에서 바로 관리하세요.'}
                        </p>
                    </div>
 
                    {!isStaffSignup && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={handleGoogleLogin}
                                        disabled={isLoggingIn}
                                        className="w-full h-full min-h-[56px] group relative flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-950 py-2.5 rounded-2xl transition-all active:scale-[0.98] shadow-xl hover:shadow-white/5 disabled:opacity-50"
                                    >
                                        {isLoggingIn ? (
                                            <Loader2 className="animate-spin text-blue-600" size={24} />
                                        ) : (
                                            <Chrome className="text-blue-600 group-hover:scale-110 transition-transform" size={24} />
                                        )}
                                        <div className="flex flex-col items-start leading-tight text-left">
                                            <span className="text-[14px] font-extrabold text-slate-900">구글로 시작하기</span>
                                            <span className="text-[10px] font-bold text-slate-500 tracking-tight">가입 및 로그인 (관리자)</span>
                                        </div>
                                    </button>

                                    {isLoggingIn && (
                                        <button
                                            type="button"
                                            onClick={() => setIsLoggingIn(false)}
                                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold py-1.5 transition-colors animate-pulse text-center bg-rose-950/20 rounded-xl border border-rose-900/30"
                                        >
                                            로딩 멈춤 초기화
                                        </button>
                                    )}
                                </div>

                                <button 
                                    onClick={handleDownloadShortcut}
                                    className="w-full h-full min-h-[56px] flex items-center justify-center gap-2 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700 text-slate-300 font-bold py-3 rounded-2xl transition-all active:scale-[0.98] text-[13px]"
                                >
                                    <Monitor size={15} className="text-blue-400" />
                                    바탕화면 아이콘 만들기
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="relative flex items-center justify-center py-2">
                                <div className="border-t border-slate-800/80 w-full"></div>
                                <span className="absolute bg-slate-900 px-3 text-[10px] font-black text-slate-500 tracking-widest uppercase">
                                    또는 직원 로그인 및 가입
                                </span>
                            </div>
                        </>
                    )}

                    {!isStaffSignup ? (
                        /* Staff Login Form */
                        <form onSubmit={handleStaffLogin} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">직원 아이디 (ID)</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <User size={16} />
                                        </span>
                                        <input 
                                            type="text" 
                                            value={loginId}
                                            onChange={(e) => setLoginId(e.target.value)}
                                            placeholder="등록한 직원 아이디"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">비밀번호 (Password)</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <Lock size={16} />
                                        </span>
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="비밀번호 입력"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isStaffLoggingIn}
                                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/15"
                            >
                                {isStaffLoggingIn ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    <LogIn size={20} />
                                )}
                                직원 로그인
                            </button>
                        </form>
                    ) : (
                        /* Staff Self-Signup Form */
                        <form onSubmit={handleStaffSignup} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5 relative col-span-1 sm:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">소속 회사명 *</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                                <Building2 size={16} />
                                            </span>
                                            <input 
                                                type="text" 
                                                value={companyName}
                                                onChange={(e) => {
                                                    setCompanyName(e.target.value);
                                                    if (hasSearched) setHasSearched(false);
                                                }}
                                                placeholder="가입하려는 소속 회사 이름 입력"
                                                className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                                required
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSearchCompany}
                                            disabled={isSearchingCompany}
                                            className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl border border-slate-700 text-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                                        >
                                            {isSearchingCompany ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Search size={16} />
                                            )}
                                            검색
                                        </button>
                                    </div>

                                    {/* Search Results Dropdown/Box */}
                                    {hasSearched && (
                                        <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl p-3 z-50 shadow-2xl space-y-2 max-h-48 overflow-y-auto">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1 mb-1">검색 결과</div>
                                            {searchResults.length === 0 ? (
                                                <div className="text-xs text-slate-500 py-2 text-center">검색 결과가 없습니다. 회사명을 다시 확인해주세요.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-1">
                                                    {searchResults.map((res) => (
                                                        <button
                                                            key={res.id}
                                                            type="button"
                                                            onClick={() => handleSelectCompany(res.name)}
                                                            className="w-full text-left px-3 py-2.5 bg-slate-950/40 hover:bg-blue-600/20 hover:border-blue-600/50 border border-slate-800 rounded-xl text-slate-200 text-xs font-semibold transition-all flex items-center justify-between group"
                                                        >
                                                            <span>{res.name}</span>
                                                            <span className="text-[10px] text-blue-400 group-hover:text-blue-300 font-bold flex items-center gap-0.5">
                                                                선택
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">회사 입장 코드 (6자 이상) *</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <KeyRound size={16} />
                                        </span>
                                        <input 
                                            type="text" 
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(e.target.value)}
                                            placeholder="입장 코드 입력"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">직원 이름 *</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <User size={16} />
                                        </span>
                                        <input 
                                            type="text" 
                                            value={staffName}
                                            onChange={(e) => setStaffName(e.target.value)}
                                            placeholder="본인 이름 (예: 홍길동)"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">사내 아이디 (4자 이상) *</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <User size={16} />
                                        </span>
                                        <input 
                                            type="text" 
                                            value={loginId}
                                            onChange={(e) => setLoginId(e.target.value)}
                                            placeholder="원하는 로그인 아이디"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">비밀번호 *</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                            <Lock size={16} />
                                        </span>
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="비밀번호 (4자 이상)"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 col-span-1 sm:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 block pl-1">직책 / 역할 *</label>
                                    <select 
                                        value={staffRole}
                                        onChange={(e) => setStaffRole(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-bold text-sm cursor-pointer appearance-none animate-none"
                                    >
                                        <option value="디자이너" className="bg-slate-950 text-slate-200">디자이너</option>
                                        <option value="인쇄기장" className="bg-slate-950 text-slate-200">인쇄기장</option>
                                        <option value="후가공" className="bg-slate-950 text-slate-200">후가공</option>
                                        <option value="배송" className="bg-slate-950 text-slate-200">배송</option>
                                        <option value="관리자" className="bg-slate-950 text-slate-200">관리부서</option>
                                    </select>
                                    <p className="text-[11px] text-slate-500 font-semibold pl-1 mt-1 leading-relaxed">
                                        ※ 본인의 정확한 직책이 없는 경우 임의 선택해 주세요. 가입 완료 후 언제든지 수정 가능합니다.
                                    </p>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isStaffSigningUp}
                                className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/15"
                            >
                                {isStaffSigningUp ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    <UserPlus size={20} />
                                )}
                                사내 직원 가입 신청
                            </button>
                        </form>
                    )}

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsStaffSignup(!isStaffSignup);
                                setLoginId('');
                                setPassword('');
                                setCompanyName('');
                                setJoinCode('');
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors underline bg-transparent border-none cursor-pointer"
                        >
                            {isStaffSignup ? '이미 계정이 있나요? 직원 로그인하기' : '소속 회사에 신규 직원으로 직접 가입하기'}
                        </button>
                    </div>

                    <div className="pt-4 flex flex-col gap-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-600 text-xs font-bold uppercase tracking-widest">
                            <ShieldCheck size={14} className="text-emerald-500" />
                            Enterprise Security Active
                        </div>
                    </div>
                </div>

                <footer className="text-center relative">
                    <p className="text-slate-600 text-sm font-medium">
                        © 2026 EzPrintWork Cloud. All rights reserved.
                        <span 
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = '/downloads/EzPrintWork-Setup.exe';
                                link.download = 'EzPrintWork-Setup.exe';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }} 
                            className="inline-block ml-1 text-slate-800/10 hover:text-slate-500/30 cursor-default select-none text-[8px] transition-colors"
                            title=""
                        >ⓓ</span>
                    </p>
                </footer>
            </div>
        </div>
    );
};
