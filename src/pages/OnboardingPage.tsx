import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, formatBusinessNumber, formatPhoneNumber, isValidPhoneNumber } from '../services/dataService';
import { Building2, ArrowRight, Loader2, LogOut, CheckCircle2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { AD_TIER_MAX } from '../utils/planLimits';
import { SetupBriefing } from '../components/auth/SetupBriefing';
import { clearPostCreateBriefingPending, isPostCreateBriefingPending, markPostCreateBriefingPending } from '../utils/postCreateBriefing';

function describeCompanyCreateError(error: unknown): { title: string; detail: string } {
  const err = error as {
    code?: string;
    message?: string;
    details?: unknown;
    customData?: { message?: string; details?: unknown };
  };
  const code = String(err?.code || '').replace(/^functions\//, '');
  const serverMessage = String(err?.customData?.message || err?.message || '').trim();
  const details = err?.details ?? err?.customData?.details;
  const detailText = details == null || details === ''
    ? ''
    : typeof details === 'string'
      ? details
      : JSON.stringify(details);
  const kind: Record<string, string> = {
    internal: '서버 내부 오류입니다. 회사 생성 처리가 서버에서 중간에 멈췄습니다. 회사명·사업자번호·연락처 형식 문제가 아닙니다.',
    unauthenticated: '로그인이 풀렸습니다. Google로 다시 로그인한 뒤 회사를 만들어 주세요.',
    'failed-precondition': '이메일 인증이 끝나지 않았거나, 서버가 생성을 거절했습니다.',
    'already-exists': '이 Google 계정은 이미 다른 회사에 소속되어 있습니다.',
    'invalid-argument': '서버가 입력값을 거절했습니다. 회사명, 사업자등록번호, 연락처를 확인해 주세요.',
    unavailable: '회사 생성 서버에 연결하지 못했습니다.',
    'not-found': '회사 생성 기능을 서버에서 찾지 못했습니다.',
    'permission-denied': '회사 생성 권한이 없습니다.',
    'deadline-exceeded': '회사 생성 서버 응답 시간이 초과되었습니다.',
  };
  const title = kind[code]
    || (serverMessage && serverMessage !== 'internal' ? serverMessage : '회사를 만들지 못했습니다.');
  const lines = [
    code ? `오류 코드: ${code}` : '',
    serverMessage && serverMessage !== code && serverMessage !== 'internal' ? `서버 메시지: ${serverMessage}` : '',
    detailText && detailText !== serverMessage ? `상세: ${detailText}` : '',
  ].filter(Boolean);
  return { title, detail: lines.join('\n') };
}

function createInternalJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export const OnboardingPage: React.FC = () => {
  const { firebaseUser, logout, refreshUser } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [initialStaffCount, setInitialStaffCount] = useState(AD_TIER_MAX);
  const AD_MAX = AD_TIER_MAX;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [step, setStep] = useState<'choice' | 'create' | 'join' | 'briefing'>(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('briefing-preview')) {
      return 'briefing';
    }
    if (typeof window !== 'undefined' && window.location.hash.includes('onboarding-preview')) {
      return 'create';
    }
    if (isPostCreateBriefingPending()) return 'briefing';
    return 'choice';
  });
  const navigate = useNavigate();

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('회사명은 필수입니다.');
      return;
    }

    const businessDigits = businessNumber.replace(/\D/g, '');
    if (businessDigits.length !== 10) {
      toast.error('사업자등록번호는 필수입니다. 10자리를 입력해 주세요. (예: 123-45-67890)');
      return;
    }

    if (!ownerPhone.trim()) {
      toast.error('관리자 연락처는 필수입니다. 문제 발생 시 연락드릴 번호를 입력해 주세요.');
      return;
    }

    const formattedPhone = formatPhoneNumber(ownerPhone.trim());
    if (!isValidPhoneNumber(formattedPhone)) {
      toast.error('관리자 연락처를 올바르게 입력해주세요. (예: 010-1234-5678)');
      return;
    }

    if (!firebaseUser) {
      if (window.location.hash.includes('onboarding-preview') || window.location.hash.includes('briefing-preview')) {
        setStep('briefing');
        return;
      }
      toast.error('Google 로그인 후 회사를 만들 수 있습니다.');
      return;
    }

    setIsCreating(true);
    const joinCode = createInternalJoinCode();
    try {
      await db.createTenant(
        companyName.trim(),
        firebaseUser.uid,
        businessNumber.trim(),
        joinCode,
        initialStaffCount,
        formattedPhone
      );
      
      // 구글 시트 대표 가입 웹훅 비동기 전송
      try {
        const { GAS_WEBHOOK_URL } = await import('../constants');
        await fetch(GAS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: "signup_owner",
            companyName: companyName.trim(),
            businessNumber: businessNumber.trim(),
            joinCode,
            ownerUid: firebaseUser.uid,
            ownerEmail: firebaseUser.email || '',
            ownerName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '대표',
            contact: formattedPhone
          })
        });
      } catch (err) {
        console.error("Google Sheets Sync Error (signup_owner):", err);
      }

      toast.success('회사가 성공적으로 생성되었습니다!');
      const preview = window.location.hash.includes('onboarding-preview') || window.location.hash.includes('briefing-preview');
      const onPcApp = typeof window !== 'undefined' && !!window.electron;
      if (onPcApp || preview) {
        markPostCreateBriefingPending();
        if (!preview) await refreshUser();
        setStep('briefing');
      } else {
        await refreshUser();
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error(error);
      const described = describeCompanyCreateError(error);
      toast.error(described.title, described.detail ? { description: described.detail } : undefined);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBriefingDone = async () => {
    const preview = window.location.hash.includes('onboarding-preview') || window.location.hash.includes('briefing-preview');
    clearPostCreateBriefingPending();
    if (preview) {
      toast.success('미리보기입니다. 실제로는 이 확인 뒤에 작업 화면으로 들어갑니다.');
      return;
    }
    await refreshUser();
    navigate('/', { replace: true });
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
    <div className="h-full min-h-0 w-full bg-slate-950 text-white flex flex-col items-center justify-start sm:justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain p-6 font-sans py-10">
      <div className="absolute top-8 right-8 z-20">
        <button 
          onClick={logout}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          로그아웃
        </button>
      </div>

      <div className="max-w-4xl w-full flex flex-col items-center gap-12">
        {step !== 'briefing' && (
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600/20 rounded-2xl mb-2">
            <Building2 className="text-blue-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent">
            시작하기 전에, 소속을 확인해 주세요
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
            회사를 지금 만들거나, 종료했다가 다음에 만들 수 있습니다.
          </p>
        </div>
        )}

        {step === 'briefing' && (
          <SetupBriefing onDone={() => { void handleBriefingDone(); }} />
        )}

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
              <h3 className="text-3xl font-bold mb-4">회사 생성하기</h3>
              <p className="text-slate-400 text-lg leading-relaxed mb-10">
                회사명, 사업자등록번호, 관리자 연락처를 입력하고 워크스페이스를 만듭니다.
              </p>
              <div className="flex items-center gap-2 text-blue-400 text-lg font-bold group-hover:gap-3 transition-all">
                생성하기 <ArrowRight size={22} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.electron?.close) {
                  window.electron.close();
                  return;
                }
                void logout();
              }}
              className="group relative bg-slate-900/50 border border-slate-800 hover:border-slate-500 p-10 rounded-[2.5rem] text-left transition-all hover:bg-slate-900 active:scale-[0.98]"
            >
              <div className="mb-8 inline-flex p-5 bg-slate-800 rounded-2xl text-slate-300 group-hover:bg-slate-700 group-hover:text-white transition-all duration-300">
                <LogOut size={32} />
              </div>
              <h3 className="text-3xl font-bold mb-4">종료하기</h3>
              <p className="text-slate-400 text-lg leading-relaxed mb-10">
                지금은 만들지 않습니다. 다음에 다시 실행하면 이어서 만들 수 있습니다.
              </p>
              <div className="flex items-center gap-2 text-slate-300 text-lg font-bold group-hover:gap-3 transition-all">
                종료 <ArrowRight size={22} />
              </div>
            </button>
          </div>
        )}

        {step === 'create' && (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
            <form onSubmit={handleCreateCompany} className="space-y-6 bg-slate-900 p-8 rounded-3xl border border-slate-800">
              <div className="space-y-2 text-center pb-2 border-b border-slate-800">
                <h3 className="text-xl font-black">회사(워크스페이스) 개설</h3>
                <p className="text-xs text-slate-500 font-medium">회사명, 사업자등록번호, 관리자 연락처는 필수입니다. 직원 아이디는 가입 후 관리자가 만들어 전달합니다.</p>
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
                <label className="text-xs font-bold text-slate-400 ml-1">사업자등록번호 *</label>
                <input 
                  type="text"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(formatBusinessNumber(e.target.value))}
                  placeholder="예: 123-45-67890"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1 flex items-center gap-1.5">
                  <Phone size={12} className="text-blue-400" />
                  관리자 연락처 *
                </label>
                <input 
                  type="tel"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(formatPhoneNumber(e.target.value))}
                  placeholder="010-1234-5678"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                  required
                  autoComplete="tel"
                />
                <span className="text-[10px] text-amber-500/90 block pl-1 font-medium">
                  필수입니다. 서비스 장애·요금제 문의 시 통화할 대표(관리자) 휴대폰 번호입니다.
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">예상 직원 수 (대표 포함) *</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setInitialStaffCount(c => Math.max(1, c - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white font-bold"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-2xl font-black">{initialStaffCount}명</span>
                  <button
                    type="button"
                    onClick={() => setInitialStaffCount(c => Math.min(AD_MAX, c + 1))}
                    className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white font-bold"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 block pl-1 font-medium">
                  신규 가입은 「광고형」으로 시작합니다 (최대 {AD_MAX}인, 광고 표시). 지인 선물·유료 PRO는 가입 후 설정에서 변경할 수 있습니다.
                </span>
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
