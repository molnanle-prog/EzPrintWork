import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { Building2, UserPlus, ArrowRight, Loader2, LogOut, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export const OnboardingPage: React.FC = () => {
  const { firebaseUser, logout, refreshUser } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [step, setStep] = useState<'choice' | 'create' | 'join'>('choice');
  const navigate = useNavigate();

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleCreateCompany called', { companyName, hasUser: !!firebaseUser });
    if (!companyName.trim() || !firebaseUser) {
      console.log('Validation failed', { companyName: companyName.trim(), hasUser: !!firebaseUser });
      return;
    }

    if (!joinCode.trim() || joinCode.trim().length < 6) {
      toast.error('회사 입장 코드는 최소 6글자 이상이어야 합니다.');
      return;
    }

    setIsCreating(true);
    try {
      await db.createTenant(companyName.trim(), firebaseUser.uid, businessNumber.trim(), joinCode.trim());
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await db.searchTenants(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) toast.error('검색 결과가 없습니다.');
    } catch (error) {
      toast.error('회사 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRequestJoin = async (tenantId: string, tenantName: string) => {
    if (!firebaseUser) return;
    try {
      await db.submitJoinRequest(tenantId, {
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email || '',
        userName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '사용자',
      });
      toast.success(`${tenantName}에 가입 요청을 보냈습니다. 관리자 승인을 기다려 주세요.`);
      setHasRequested(true);
    } catch (error) {
      toast.error('가입 요청 중 오류가 발생했습니다.');
    }
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
              onClick={() => setStep('join')}
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
              <div className="space-y-2 text-center pb-2 border-b border-slate-800">
                <h3 className="text-xl font-black">회사(워크스페이스) 개설</h3>
                <p className="text-xs text-slate-500 font-medium">관리자 정보와 사내 연동 코드를 설정합니다.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">회사명 *</label>
                <input 
                  autoFocus
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="예: 상록인쇄기획"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">사업자등록번호</label>
                <input 
                  type="text"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(e.target.value)}
                  placeholder="예: 123-45-67890 (선택 사항)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">회사 입장 코드 (직원 가입용 고유 키) *</label>
                <input 
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="직원 연동을 위한 6자 이상의 코드 입력"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                  required
                  minLength={6}
                />
                <span className="text-[10px] text-slate-500 block pl-1 font-medium">직원들이 본인의 사내 아이디를 생성하여 해당 회사로 소속될 때 사용하는 필수 암호 코드입니다.</span>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button 
                  disabled={isCreating}
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
                >
                  {isCreating ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                  워크스페이스 생성 완료
                </button>
                <button 
                  type="button"
                  onClick={() => setStep('choice')}
                  className="text-slate-500 hover:text-white text-sm transition-colors py-2 font-bold"
                >
                  뒤로 가기
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'join' && (
          <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {!hasRequested ? (
              <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">기존 회사 찾기</h3>
                  <p className="text-slate-400 text-sm">소속된 회사의 이름을 검색하여 가입 요청을 보낼 수 있습니다.</p>
                </div>
                
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="회사 이름 검색..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button 
                    disabled={isSearching}
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="animate-spin" /> : '검색'}
                  </button>
                </form>

                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  {searchResults.map(tenant => (
                    <div key={tenant.id} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                          <Building2 size={20} className="text-slate-500" />
                        </div>
                        <div className="font-bold">{tenant.name}</div>
                      </div>
                      <button 
                        onClick={() => handleRequestJoin(tenant.id, tenant.name)}
                        className="px-4 py-2 bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-lg text-sm font-bold transition-all"
                      >
                        가입 요청
                      </button>
                    </div>
                  ))}
                  {searchQuery && searchResults.length === 0 && !isSearching && (
                    <p className="text-center py-8 text-slate-500 italic">검색 결과가 없습니다.</p>
                  )}
                </div>

                <button 
                  onClick={() => setStep('choice')}
                  className="w-full text-slate-500 hover:text-white text-sm transition-colors py-2"
                >
                  뒤로 가기
                </button>
              </div>
            ) : (
              <div className="bg-slate-900 p-10 rounded-3xl border border-slate-800 text-center space-y-8">
                <div className="flex justify-center">
                  <div className="relative">
                    <Loader2 className="animate-spin text-emerald-500" size={64} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CheckCircle2 className="text-emerald-500" size={24} />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold">관리자의 승인을 기다리는 중</h3>
                  <p className="text-slate-400">
                    가입 요청이 전송되었습니다. 관리자가 승인하면 <br />
                    즉시 워크스페이스에 입장할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => window.location.reload()}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all"
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
