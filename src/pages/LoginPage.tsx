import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { Printer, LogIn, Chrome, ShieldCheck, Loader2, Monitor, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isStaffLoggingIn, setIsStaffLoggingIn] = useState(false);

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
                    toast.error('구글 로그인 창이 닫혔거나 응답이 지연되어 로딩을 초기화합니다.');
                    return false;
                }
                return current;
            });
        }, 25000);

        try {
            await signInWithPopup(auth, provider);
            clearTimeout(timeoutId);
            toast.success('환영합니다! 성공적으로 로그인되었습니다.');
        } catch (error: any) {
            clearTimeout(timeoutId);
            console.error(error);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                toast.error('구글 로그인 창이 닫혔습니다.');
            } else {
                toast.error('로그인 중 오류가 발생했습니다: ' + error.message);
            }
        } finally {
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
        const email = loginId.includes('@') ? loginId.trim() : `${loginId.trim()}@ez-hub.kr`;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast.success('직원 로그인에 성공했습니다! 환영합니다.');
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                toast.error('아이디 또는 비밀번호가 올바르지 않습니다.');
            } else {
                toast.error('로그인 오류: ' + error.message);
            }
        } finally {
            setIsStaffLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-6 font-sans">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[25%] -left-[10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute -bottom-[25%] -right-[10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[100px]"></div>
            </div>
 
            <div className="max-w-md w-full z-10 space-y-8 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Printer className="text-white" size={40} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">EzPrintWork</h1>
                        <p className="text-slate-500 font-medium tracking-tight">인쇄소 업무 관리의 새로운 기준 (v1.2.1)</p>
                    </div>
                </div>
 
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-10 rounded-[3rem] shadow-2xl space-y-8">
                    <div className="space-y-2 text-center">
                        <h2 className="text-xl font-bold text-white">클라우드 시작하기</h2>
                        <p className="text-sm text-slate-500">별도의 설치 없이 브라우저에서 바로 관리하세요.</p>
                    </div>
 
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleGoogleLogin}
                            disabled={isLoggingIn}
                            className="w-full group relative flex items-center justify-center gap-4 bg-white hover:bg-slate-50 text-slate-950 font-bold py-5 rounded-2xl transition-all active:scale-[0.98] shadow-xl hover:shadow-white/5 disabled:opacity-50"
                        >
                            {isLoggingIn ? (
                                <Loader2 className="animate-spin text-blue-600" size={24} />
                            ) : (
                                <Chrome className="text-blue-600 group-hover:scale-110 transition-transform" size={24} />
                            )}
                            구글 계정으로 로그인 (관리자)
                        </button>

                        {isLoggingIn && (
                            <button
                                type="button"
                                onClick={() => setIsLoggingIn(false)}
                                className="text-xs text-rose-400 hover:text-rose-300 font-bold py-1.5 transition-colors animate-pulse text-center bg-rose-950/20 rounded-xl border border-rose-900/30"
                            >
                                로그인 창을 닫았거나 로딩이 멈췄나요? [여기]를 눌러 초기화
                            </button>
                        )}

                        <button 
                            onClick={handleDownloadShortcut}
                            className="w-full flex items-center justify-center gap-2 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all active:scale-[0.98] text-xs"
                        >
                            <Monitor size={15} className="text-blue-400" />
                            바탕화면에 아이콘 만들기 (다운로드)
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center py-2">
                        <div className="border-t border-slate-800/80 w-full"></div>
                        <span className="absolute bg-slate-900 px-3 text-[10px] font-black text-slate-500 tracking-widest uppercase">또는 직원 로그인</span>
                    </div>

                    {/* Staff Login Form */}
                    <form onSubmit={handleStaffLogin} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 block pl-1">직원 아이디 (ID)</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                    <User size={18} />
                                </span>
                                <input 
                                    type="text" 
                                    value={loginId}
                                    onChange={(e) => setLoginId(e.target.value)}
                                    placeholder="관리자가 생성한 ID 입력"
                                    className="w-full pl-11 pr-4 py-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 block pl-1">비밀번호 (Password)</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                    <Lock size={18} />
                                </span>
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력"
                                    className="w-full pl-11 pr-4 py-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                />
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
