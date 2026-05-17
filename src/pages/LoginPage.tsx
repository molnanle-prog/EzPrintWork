import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Printer, LogIn, Chrome, ShieldCheck, Loader2, Monitor } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleDownloadShortcut = () => {
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
        link.download = 'EzPrintWork 바로가기.url';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('바탕화면 아이콘 파일이 다운로드되었습니다. 바탕화면에 드래그하여 사용하세요!');
    };

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            toast.success('환영합니다! 성공적으로 로그인되었습니다.');
        } catch (error: any) {
            console.error(error);
            toast.error('로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setIsLoggingIn(false);
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
                            구글 계정으로 로그인
                        </button>

                        <button 
                            onClick={handleDownloadShortcut}
                            className="w-full flex items-center justify-center gap-2 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all active:scale-[0.98] text-xs"
                        >
                            <Monitor size={15} className="text-blue-400" />
                            바탕화면에 아이콘 만들기 (다운로드)
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
