import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { Building2, UserPlus, ArrowRight, Loader2, LogOut, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export const OnboardingPage: React.FC = () => {
  const { firebaseUser, logout, refreshUser } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [step, setStep] = useState<'choice' | 'create' | 'join'>('choice');
  const navigate = useNavigate();

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !firebaseUser) return;

    setIsCreating(true);
    try {
      await db.createTenant(companyName.trim(), firebaseUser.uid);
      toast.success('회사가 성공적으로 생성되었습니다!');
      await refreshUser();
      navigate('/', { replace: true });
    } catch (error) {
      console.error(error);
      toast.error('회사 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRequest = () => {
    setStep('join');
    toast.info('관리자에게 초대를 요청해 주세요. 초대가 완료되면 자동으로 로그인됩니다.');
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="absolute top-8 right-8">
        <button 
          onClick={logout}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          로그아웃
        </button>
      </div>

      <div className="max-w-4xl w-full flex flex-col items-center gap-12">
        {/* Header */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600/20 rounded-2xl mb-2">
            <Building2 className="text-blue-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent">
            시작하기 전에, 소속을 확인해 주세요
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
            EzPrintWork는 회사 단위로 데이터를 관리합니다. <br className="hidden md:block" />
            새로운 회사를 생성하거나, 기존 회사로부터 초대를 받아야 합니다.
          </p>
        </div>

        {step === 'choice' && (
          <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl animate-in fade-in zoom-in-95 duration-500 delay-200">
            {/* Create Company Card */}
            <button 
              onClick={() => setStep('create')}
              className="group relative bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 p-10 rounded-[2.5rem] text-left transition-all hover:bg-slate-900 hover:shadow-[0_0_60px_-15px_rgba(59,130,246,0.3)] active:scale-[0.98]"
            >
              <div className="mb-8 inline-flex p-5 bg-blue-500/10 rounded-2xl text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                <Building2 size={32} />
              </div>
              <h3 className="text-3xl font-bold mb-4">회사 새로 만들기</h3>
              <p className="text-slate-400 text-lg leading-relaxed mb-10">
                회사의 관리자가 되어 워크스페이스를 직접 개설하고 직원을 초대할 수 있습니다.
              </p>
              <div className="flex items-center gap-2 text-blue-400 text-lg font-bold group-hover:gap-3 transition-all">
                생성하기 <ArrowRight size={22} />
              </div>
            </button>

            {/* Join Company Card */}
            <button 
              onClick={handleJoinRequest}
              className="group relative bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 p-10 rounded-[2.5rem] text-left transition-all hover:bg-slate-900 hover:shadow-[0_0_60px_-15px_rgba(16,185,129,0.3)] active:scale-[0.98]"
            >
              <div className="mb-8 inline-flex p-5 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                <UserPlus size={32} />
              </div>
              <h3 className="text-3xl font-bold mb-4">초대 대기하기</h3>
              <p className="text-slate-400 text-lg leading-relaxed mb-10">
                이미 다른 관리자가 생성한 회사에 소속되어 있다면, 초대를 기다려 주세요.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 text-lg font-bold group-hover:gap-3 transition-all">
                상태 확인하기 <ArrowRight size={22} />
              </div>
            </button>
          </div>
        )}

        {step === 'create' && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
            <form onSubmit={handleCreateCompany} className="space-y-6 bg-slate-900 p-8 rounded-3xl border border-slate-800">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400 ml-1">회사명 (워크스페이스 이름)</label>
                <input 
                  autoFocus
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="예: (주)이지프린트"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  disabled={isCreating}
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isCreating ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                  워크스페이스 생성 완료
                </button>
                <button 
                  type="button"
                  onClick={() => setStep('choice')}
                  className="text-slate-500 hover:text-white text-sm transition-colors py-2"
                >
                  뒤로 가기
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'join' && (
          <div className="w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 bg-slate-900 p-10 rounded-3xl border border-slate-800">
            <div className="flex justify-center">
              <div className="relative">
                <Loader2 className="animate-spin text-emerald-500" size={64} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <UserPlus className="text-emerald-200" size={24} />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-bold">관리자의 승인을 기다리는 중</h3>
              <p className="text-slate-400">
                가입하신 이메일(<span className="text-slate-200 font-medium">{firebaseUser?.email}</span>)로 <br />
                관리자가 초대를 완료하면 즉시 입장이 가능합니다.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all"
              >
                새로고침하여 상태 확인
              </button>
              <button 
                onClick={() => setStep('choice')}
                className="text-slate-500 hover:text-white text-sm transition-colors"
              >
                다른 방법 선택하기
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-slate-600 text-sm">
          문제가 발생했나요? <a href="#" className="text-blue-500 hover:underline">고객센터 문의하기</a>
        </p>
      </div>
    </div>
  );
};
