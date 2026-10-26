import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { Printer, LogIn, Chrome, ShieldCheck, Loader2, Lock, User, Building2, Search, Minus, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { GAS_WEBHOOK_URL } from '../constants';
import { db } from '../services/dataService';
import { useInstalledAppVersion } from '../hooks/useInstalledAppVersion';
import { getWindowsStartupEnabled, setWindowsStartupEnabled } from '../utils/windowsStartup';
import { HomeScreenAddButton } from '../components/auth/HomeScreenAddButton';
import { resolveAppRoleFromStaff } from '../utils/adminAccess';
import { normalizeStaffLoginEmail } from '../utils/staffAuthProvision';
import { resolveStaffLogin } from '../services/membershipService';
import { signInStaffWithFirebaseAuth } from '../utils/staffFirebaseSignIn';
import { useAuth, determineTenantPlan } from '../contexts/AuthContext';
import { setPendingStaffProfile, clearPendingStaffProfile } from '../utils/staffLoginSession';
import { rememberStaffLoginTenant } from '../utils/resolveStaffTenantProfile';
import { loadStaffLoginPreferences, saveStaffLoginPreferences, disableStaffAutoLoginPrefs } from '../utils/staffLoginPreferences';
import { abortIncompleteStaffLogin, retryStaffProfileUpsert } from '../utils/staffLoginRecovery';
import {
    createStaffSessionId,
    getLocalStaffSessionId,
    setLocalStaffSessionId,
    isRemoteStaffSessionActive,
    claimStaffSessionOnNas,
    setSessionClaimPending,
    touchSessionClaimGrace,
} from '../utils/staffSession';
import { presenceSessionService } from '../services/presenceSessionService';
import { readLastKnownArchiveRootPath } from '../utils/lastKnownTenantPlan';
import { setCompanyArchiveRootOverride } from '../utils/archiveStorage';
import { useDialog } from '../contexts/DialogContext';
import type { AppUser } from '../types';

const formatSearchError = (error: any): string => {
    const code = error?.code || '';
    if (code === 'permission-denied') {
        return '회사 검색 권한이 없습니다. Ctrl+Shift+R로 강력 새로고침 후 다시 시도해 주세요.';
    }
    if (code === 'resource-exhausted') {
        return 'Firestore 일일 한도에 도달했습니다. 내일 자동 복구되거나 관리자에게 문의하세요.';
    }
    if (code === 'unavailable') {
        return 'Firestore 서버에 일시적으로 연결할 수 없습니다. 인터넷·방화벽 설정을 확인해 주세요.';
    }
    return '회사 검색 중 오류가 발생했습니다.';
};

const consumePostLoginPath = (): string => {
    if (sessionStorage.getItem('ezpw_remote_view') === '1') {
        sessionStorage.removeItem('ezpw_remote_view');
        return '/remote';
    }
    return '/';
};

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { loginCustomSession, loading: authLoading, currentUser } = useAuth();
    const { showConfirm } = useDialog();
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [companyName, setCompanyName] = useState('');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isStaffLoggingIn, setIsStaffLoggingIn] = useState(false);

    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [rememberCompany, setRememberCompany] = useState(false);
    const [saveCredentials, setSaveCredentials] = useState(false);
    const [isSearchingLoginCompany, setIsSearchingLoginCompany] = useState(false);
    const [hasSearchedLogin, setHasSearchedLogin] = useState(false);
    const [loginCompanySearchResults, setLoginCompanySearchResults] = useState<{ id: string; name: string }[]>([]);

    const [isElectron, setIsElectron] = useState(false);
    const [openAtLogin, setOpenAtLogin] = useState(false);
    const installedAppVersion = useInstalledAppVersion();

    const persistLoginPrefs = (
        overrides?: Partial<{
            rememberCompany: boolean;
            keepLoggedIn: boolean;
            companyName: string;
            tenantId: string;
            loginId: string;
            loginPassword: string;
        }>
    ) => {
        saveStaffLoginPreferences({
            rememberCompany: overrides?.rememberCompany ?? rememberCompany,
            keepLoggedIn: overrides?.keepLoggedIn ?? saveCredentials,
            companyName: overrides?.companyName ?? companyName,
            tenantId: overrides?.tenantId ?? selectedTenantId,
            loginId: overrides?.loginId ?? loginId,
            loginPassword: overrides?.loginPassword ?? password,
        });
    };

    useEffect(() => {
        const notice = sessionStorage.getItem('ezpw_auth_notice');
        if (!notice) return;
        sessionStorage.removeItem('ezpw_auth_notice');
        toast.message(notice, { duration: 8000 });
    }, []);

    useEffect(() => {
        if (authLoading || currentUser) return;
        // 로그아웃 직후 Firebase 세션·동기화 잔여 — 회사 검색·재로그인 방해 제거
        if (auth.currentUser) {
            void signOut(auth).catch(() => {});
        }
        db.clearSession();
    }, [authLoading, currentUser]);

    useEffect(() => {
        setIsElectron(typeof window !== 'undefined' && !!window.electron);

        if (typeof window !== 'undefined' && window.electron?.getOpenAtLogin) {
            void getWindowsStartupEnabled().then(setOpenAtLogin).catch(() => setOpenAtLogin(false));
        }

        const prefs = loadStaffLoginPreferences();
        if ((prefs.rememberCompany || prefs.keepLoggedIn) && prefs.companyName && prefs.tenantId) {
            setCompanyName(prefs.companyName);
            setSelectedTenantId(prefs.tenantId);
        }
        if (prefs.keepLoggedIn && prefs.loginId) {
            setLoginId(prefs.loginId);
        }
        if (prefs.keepLoggedIn && prefs.loginPassword) {
            setPassword(prefs.loginPassword);
        }
        setRememberCompany(prefs.rememberCompany);
        setSaveCredentials(prefs.keepLoggedIn);
    }, []);

    useEffect(() => {
        // 로그인 페이지는 테마 모드와 관계없이 항상 오리지널 다크 스타일로 고정
        const root = document.documentElement;
        root.classList.remove('light', 'trello');
        root.classList.add('dark');

        return () => {
            root.classList.remove('light', 'dark', 'trello');
            root.classList.add(theme);
        };
    }, [theme]);

    const handleToggleOpenAtLogin = async (checked: boolean) => {
        setOpenAtLogin(checked);
        const result = await setWindowsStartupEnabled(checked);
        if (result.ok) {
            toast.success(result.message);
        } else {
            setOpenAtLogin(!checked);
            toast.error(result.message || '시작 프로그램 설정에 실패했습니다.');
        }
    };

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        setSessionClaimPending(true);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account',
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
            // Electron은 session persistence면 외부 이동 시 로그아웃됨 → 데스크톱은 local 고정
            const { setPersistence, browserSessionPersistence, browserLocalPersistence } = await import('firebase/auth');
            const isDesktop = typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
            await setPersistence(auth, isDesktop ? browserLocalPersistence : browserSessionPersistence);

            const preferRedirect = !isElectron && ('ontouchstart' in window || /iPad|iPhone|iPod|Android/i.test(navigator.userAgent));
            if (preferRedirect) {
                await signInWithRedirect(auth, provider);
                return;
            }

            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            window.removeEventListener('focus', onFocus);
            if (focusTimeoutId) clearTimeout(focusTimeoutId);
            clearTimeout(timeoutId);

            // 관리자(구글)도 단일 접속 — 다른 PC 로그인 중이면 확인 후 claim
            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const { db: firestoreDb } = await import('../services/firebase');
                const userDocSnap = await getDoc(doc(firestoreDb, 'users', user.uid));
                const tenantId = userDocSnap.exists() ? String(userDocSnap.data()?.tenantId || '') : '';
                if (tenantId) {
                    let sessionRecord = null as Awaited<ReturnType<typeof presenceSessionService.readEntry>>;
                    try {
                        sessionRecord = await presenceSessionService.readEntry(
                            tenantId,
                            user.uid,
                            db.getStoreGatewayUrls()
                        );
                    } catch {
                        /* optional */
                    }
                    if (isRemoteStaffSessionActive(sessionRecord, getLocalStaffSessionId())) {
                        const proceed = await showConfirm(
                            '현재 다른 곳에서 같은 계정으로 로그인되어 있습니다.\n기존 접속을 종료하고 여기에서 로그인하시겠습니까?'
                        );
                        if (!proceed) {
                            setSessionClaimPending(false);
                            await signOut(auth);
                            setIsLoggingIn(false);
                            toast.info('로그인을 취소했습니다.');
                            return;
                        }
                    }
                    const newSessionId = createStaffSessionId();
                    setLocalStaffSessionId(newSessionId, isDesktop);
                    const claimed = await claimStaffSessionOnNas({
                        uid: user.uid,
                        tenantId,
                        staffDocId: user.uid,
                        sessionId: newSessionId,
                        loginId: user.email || null,
                        name: user.displayName || null,
                        email: user.email || null,
                        gatewayBaseUrl: db.getStoreGatewayUrls(),
                        force: true, // 확인 후 이 PC가 승자 — 기존 접속 덮어씀
                    });
                    // claimedAt을 claim 시각 이후로 맞춤 (하트비트 lastActive와 비교 오판 방지)
                    if (claimed !== false) {
                        setLocalStaffSessionId(newSessionId, isDesktop);
                        touchSessionClaimGrace();
                    }
                }
            } catch (sessionErr) {
                console.warn('[Login] Google session claim skipped:', sessionErr);
            } finally {
                setSessionClaimPending(false);
            }

            toast.success('환영합니다! 성공적으로 로그인되었습니다.');
            navigate(consumePostLoginPath(), { replace: true });

            // 구글 시트 대표자 로그인 웹훅 비동기 전송
            if (user) {
                (async () => {
                    try {
                        const { doc, getDoc } = await import('firebase/firestore');
                        const { db: firestoreDb } = await import('../services/firebase');
                        
                        // 1. users/{uid} 에서 tenantId 획득
                        const userDocRef = doc(firestoreDb, 'users', user.uid);
                        const userDocSnap = await getDoc(userDocRef);
                        
                        let tenantId = '';
                        let userName = user.displayName || '';
                        if (userDocSnap.exists()) {
                            const uData = userDocSnap.data();
                            tenantId = uData.tenantId || '';
                            if (uData.name) userName = uData.name;
                        }
                        
                        if (tenantId) {
                            // 2. tenants/{tenantId} 에서 회사명 획득
                            const tenantDocRef = doc(firestoreDb, 'tenants', tenantId);
                            const tenantDocSnap = await getDoc(tenantDocRef);
                            if (tenantDocSnap.exists()) {
                                const tenantData = tenantDocSnap.data();
                                const companyNameVal = tenantData.name || '';
                                
                                await fetch(GAS_WEBHOOK_URL, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                    body: JSON.stringify({
                                        action: "login_owner",
                                        companyName: companyNameVal,
                                        ownerEmail: user.email || '',
                                        ownerName: userName
                                    })
                                });
                            }
                        }
                    } catch (err) {
                        console.error("Google Sheets Sync Error (login_owner):", err);
                    }
                })();
            }
        } catch (error: any) {
            setSessionClaimPending(false);
            window.removeEventListener('focus', onFocus);
            if (focusTimeoutId) clearTimeout(focusTimeoutId);
            clearTimeout(timeoutId);
            console.error(error);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                toast.error('구글 로그인 창이 닫혔습니다.');
            } else if (
                error.code === 'auth/popup-blocked' ||
                error.code === 'auth/operation-not-supported-in-this-environment'
            ) {
                try {
                    await signInWithRedirect(auth, provider);
                    return;
                } catch (redirectError: any) {
                    toast.error('로그인 중 오류가 발생했습니다: ' + redirectError.message);
                }
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

    const handleSearchLoginCompany = async () => {
        if (!companyName.trim()) {
            toast.error('검색할 회사명을 입력해주세요.');
            return;
        }

        setIsSearchingLoginCompany(true);
        setHasSearchedLogin(true);
        try {
            const results = await db.searchTenants(companyName.trim());
            setLoginCompanySearchResults(results.map(t => ({ id: t.id, name: t.name })));
        } catch (error: any) {
            console.error("Search login company error:", error);
            toast.error(formatSearchError(error));
        } finally {
            setIsSearchingLoginCompany(false);
        }
    };

    const handleSelectLoginCompany = (id: string, name: string) => {
        setCompanyName(name);
        setSelectedTenantId(id);
        setLoginCompanySearchResults([]);
        setHasSearchedLogin(false);
        persistLoginPrefs({ companyName: name, tenantId: id });
        toast.success(`[${name}] 회사가 선택되었습니다.`);
    };

    const handleToggleRememberCompany = (checked: boolean) => {
        setRememberCompany(checked);
        const nextKeep = checked ? saveCredentials : false;
        if (!checked) {
            setSaveCredentials(false);
        }
        persistLoginPrefs({ rememberCompany: checked, keepLoggedIn: nextKeep });
    };

    const handleToggleSaveCredentials = (checked: boolean) => {
        setSaveCredentials(checked);
        const nextRemember = checked ? true : rememberCompany;
        if (checked) {
            setRememberCompany(true);
        }
        persistLoginPrefs({ rememberCompany: nextRemember, keepLoggedIn: checked });
        if (checked) {
            toast.info('아이디·비밀번호가 이 PC에 저장됩니다. 로그아웃 후에도 입력칸에 채워 둡니다.');
        } else {
            toast.success('저장된 아이디·비밀번호가 삭제되었습니다.');
        }
    };

    const handleStaffLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantId) {
            toast.error('먼저 회사를 검색하고 선택해주세요.');
            return;
        }
        if (!loginId.trim() || !password.trim()) {
            toast.error('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setIsStaffLoggingIn(true);

        try {
            const { doc, getDoc, setDoc } = await import('firebase/firestore');
            const { db: firestoreDb } = await import('../services/firebase');
            const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');

            persistLoginPrefs({
                companyName: companyName.trim() || companyName,
                tenantId: selectedTenantId,
                loginId: loginId.trim().toLowerCase(),
                loginPassword: password,
            });

            await setPersistence(
                auth,
                (typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron) || saveCredentials
                    ? browserLocalPersistence
                    : browserSessionPersistence
            );

            const loginNorm = loginId.trim().toLowerCase();
            let resolvedStaff;
            try {
                resolvedStaff = await resolveStaffLogin(selectedTenantId, loginNorm);
            } catch {
                toast.error('아이디를 찾을 수 없거나 선택한 회사와 일치하지 않습니다.');
                setIsStaffLoggingIn(false);
                return;
            }
            const userDoc = { id: resolvedStaff.staffDocId };
            const userData: Record<string, any> = {
                uid: resolvedStaff.uid,
                loginId: resolvedStaff.loginId,
                email: resolvedStaff.authEmail,
                name: resolvedStaff.name,
                role: resolvedStaff.role,
                isCompanyAdmin: resolvedStaff.isCompanyAdmin,
                avatarUrl: resolvedStaff.avatarUrl || '',
            };

            const tenantId = selectedTenantId; // 서브컬렉션 소속이므로 selectedTenantId가 곧 tenantId가 됩니다.

            const knownArchive = readLastKnownArchiveRootPath(tenantId);
            if (knownArchive) setCompanyArchiveRootOverride(knownArchive);

            let sessionRecord = null as Awaited<ReturnType<typeof presenceSessionService.readEntry>>;
            try {
                const uidHint = typeof userData.uid === 'string' ? userData.uid : '';
                if (uidHint) {
                    sessionRecord = await presenceSessionService.readEntry(
                        tenantId,
                        uidHint,
                        db.getStoreGatewayUrls()
                    );
                }
            } catch {
                /* NAS session lookup optional */
            }

            setSessionClaimPending(true);
            if (isRemoteStaffSessionActive(sessionRecord, getLocalStaffSessionId())) {
                const proceed = await showConfirm(
                    '현재 다른 곳에서 같은 아이디로 로그인되어 있습니다.\n기존 접속을 종료하고 여기에서 로그인하시겠습니까?'
                );
                if (!proceed) {
                    setSessionClaimPending(false);
                    setIsStaffLoggingIn(false);
                    return;
                }
            }

            const isDesktopStaff = typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
            const persistStaffSession = isDesktopStaff || saveCredentials;
            const newSessionId = createStaffSessionId();
            setLocalStaffSessionId(newSessionId, persistStaffSession);

            // Firebase Auth 로그인 (Firestore rules isMember 통과에 필수)
            // ※ tenants get은 프로필 upsert 이후(멤버)에만 가능 — 비로그인 get 차단 규칙과 맞춤
            const rawLoginId = (userData.loginId || loginId.trim()).toLowerCase();
            const primaryAuthEmail = normalizeStaffLoginEmail(rawLoginId);
            const legacyAuthEmail = userData.email?.includes('@') && !userData.email.endsWith('@ez-hub.kr')
                ? userData.email.trim().toLowerCase()
                : null;
            const staffRoleForAuth = userData.role || userData.position;
            const resolvedRole = resolveAppRoleFromStaff({
                role: String(staffRoleForAuth || ''),
                isCompanyAdmin: userData.isCompanyAdmin === true,
            });
            const staffDisplayName = userData.userName || userData.name || '사원';

            setPendingStaffProfile({
                tenantId,
                loginId: rawLoginId,
                name: staffDisplayName,
                role: resolvedRole,
                staffDocId: userDoc.id,
                email: legacyAuthEmail || primaryAuthEmail,
            });
            rememberStaffLoginTenant(tenantId);

            const authResult = await signInStaffWithFirebaseAuth(
                auth,
                {
                    loginId: rawLoginId,
                    email: userData.email,
                    uid: userData.uid,
                },
                loginId.trim(),
                password
            );

            if (!authResult) {
                clearPendingStaffProfile();
                toast.error('아이디 또는 비밀번호가 올바르지 않습니다. 관리자에게 문의해 주세요.');
                setIsStaffLoggingIn(false);
                return;
            }

            const { authEmail } = authResult;

            setPendingStaffProfile({
                tenantId,
                loginId: rawLoginId,
                name: staffDisplayName,
                role: resolvedRole,
                staffDocId: userDoc.id,
                email: auth.currentUser?.email?.trim().toLowerCase() || authEmail,
            });

            const firebaseUid = auth.currentUser?.uid;
            if (!firebaseUid) {
                clearPendingStaffProfile();
                toast.error('로그인 세션을 확인할 수 없습니다. 다시 시도해 주세요.');
                setIsStaffLoggingIn(false);
                return;
            }

            let tenantName = companyName.trim();
            try {
                let latestStaffRole = staffRoleForAuth;
                let latestIsCompanyAdmin = userData.isCompanyAdmin === true;
                try {
                    const staffDocSnap = await getDoc(doc(firestoreDb, `tenants/${tenantId}/staff`, userDoc.id));
                    if (staffDocSnap.exists()) {
                        const staffData = staffDocSnap.data();
                        latestStaffRole = staffData.role || latestStaffRole;
                        latestIsCompanyAdmin = staffData.isCompanyAdmin === true;
                    }
                } catch {
                    /* staff role lookup optional */
                }

                const appRole = resolveAppRoleFromStaff({
                    role: String(latestStaffRole || ''),
                    isCompanyAdmin: latestIsCompanyAdmin,
                });

                const staffProfile = {
                    tenantId,
                    role: appRole,
                    name: staffDisplayName,
                    loginId: rawLoginId,
                    staffDocId: userDoc.id,
                };

                const profileSaved = await retryStaffProfileUpsert(auth.currentUser!, staffProfile);
                if (!profileSaved) {
                    throw new Error('회사 소속 정보 저장에 실패했습니다.');
                }

                const claimed = await claimStaffSessionOnNas({
                    uid: firebaseUid,
                    tenantId,
                    staffDocId: userDoc.id,
                    sessionId: newSessionId,
                    loginId: rawLoginId,
                    name: staffDisplayName,
                    email: auth.currentUser?.email || authEmail,
                    gatewayBaseUrl: db.getStoreGatewayUrls(),
                    force: true, // 확인 후 이 PC가 승자 — 기존 접속 덮어씀
                });
                if (claimed !== false) {
                    setLocalStaffSessionId(newSessionId, persistStaffSession);
                    touchSessionClaimGrace();
                }

                try {
                    await setDoc(doc(firestoreDb, `tenants/${tenantId}/staff`, userDoc.id), {
                        uid: firebaseUid,
                        active: true,
                    }, { merge: true });
                } catch (staffLinkErr) {
                    console.warn('Staff uid link skipped (non-blocking):', staffLinkErr);
                }

                let tenantData: Record<string, any> = {};
                try {
                    const tenantDocSnap = await getDoc(doc(firestoreDb, 'tenants', tenantId));
                    if (tenantDocSnap.exists()) {
                        tenantData = tenantDocSnap.data() || {};
                        tenantName = tenantData.name || tenantName;
                    }
                } catch (tenantReadErr) {
                    console.warn('Tenant plan read after login skipped:', tenantReadErr);
                }
                const tenantPlan = determineTenantPlan(tenantData);
                const tenantPlanCode = String(tenantData?.plan || 'free');
                const tenantPaymentStatus = String(tenantData?.paymentStatus || 'UNPAID').toUpperCase();

                const appUser: AppUser = {
                    uid: firebaseUid,
                    id: firebaseUid,
                    email: auth.currentUser?.email || authEmail,
                    displayName: staffDisplayName,
                    name: staffDisplayName,
                    photoURL: '',
                    avatarUrl: userData.avatarUrl || '',
                    tenantId,
                    role: appRole,
                    loginId: rawLoginId,
                };

                loginCustomSession(appUser, tenantPlan, tenantPlanCode, tenantPaymentStatus);
                persistLoginPrefs({
                    companyName: tenantName || companyName,
                    tenantId,
                    loginId: rawLoginId,
                    loginPassword: password,
                });
                clearPendingStaffProfile();
            } catch (profileErr) {
                console.error('Staff users profile upsert failed:', profileErr);
                await abortIncompleteStaffLogin();
                setSaveCredentials(false);
                disableStaffAutoLoginPrefs();
                toast.error(
                    '직원 프로필 연동에 실패했습니다. 저장된 로그인 정보를 해제했으니, 회사 선택 후 다시 로그인해 주세요.'
                );
                setIsStaffLoggingIn(false);
                return;
            }

            // 아이디 소문자 자동 마이그레이션 (평문 password는 더 이상 저장하지 않음)
            const currentLoginIdInDb = userData.loginId || '';
            const needsIdMigration = currentLoginIdInDb && currentLoginIdInDb !== currentLoginIdInDb.toLowerCase();
            const hadPlainPassword = !!(userData.password || '').trim();

            if (needsIdMigration || hadPlainPassword) {
                const lowerId = currentLoginIdInDb.toLowerCase();
                (async () => {
                    try {
                        const { doc, updateDoc, deleteField } = await import('firebase/firestore');
                        const { db: fsDb } = await import('../services/firebase');
                        
                        const staffDocRef = doc(fsDb, `tenants/${selectedTenantId}/staff`, userDoc.id);
                        const staffPatch: Record<string, unknown> = {};
                        if (needsIdMigration) staffPatch.loginId = lowerId;
                        if (hadPlainPassword) staffPatch.password = deleteField();
                        if (Object.keys(staffPatch).length > 0) {
                            await updateDoc(staffDocRef, staffPatch);
                        }
                        
                        const userDocRef = doc(fsDb, 'users', userDoc.id);
                        const userSnap = await getDoc(userDocRef);
                        if (userSnap.exists()) {
                            const userPatch: Record<string, unknown> = {};
                            if (needsIdMigration) userPatch.loginId = lowerId;
                            if (hadPlainPassword) userPatch.password = deleteField();
                            if (Object.keys(userPatch).length > 0) {
                                await updateDoc(userDocRef, userPatch);
                            }
                        }
                        console.log(`[Self-Healing] Migrated staff ${userDoc.id} (loginId / cleared plaintext password).`);
                    } catch (migrationErr) {
                        console.warn("[Self-Healing] Failed to migrate credentials:", migrationErr);
                    }
                })();
            }

            // 회사명·tenantId 상태 동기화 (화면 복원용)
            setCompanyName(tenantName || companyName);
            setSelectedTenantId(tenantId);

            localStorage.setItem('ezprint_active_tab', 'kanban');
            toast.success(tenantName ? `[${tenantName}] 직원 로그인에 성공했습니다! 환영합니다.` : '직원 로그인에 성공했습니다! 환영합니다.');
            navigate(consumePostLoginPath());

            // 구글 시트 직원 로그인 웹훅 비동기 전송
            (async () => {
                try {
                    let realRole = userData.position || userData.role || '사원';
                    
                    try {
                        const { doc, getDoc } = await import('firebase/firestore');
                        const { db: firestoreDb } = await import('../services/firebase');
                        const staffDocRef = doc(firestoreDb, `tenants/${tenantId}/staff`, userDoc.id);
                        const staffDocSnap = await getDoc(staffDocRef);
                        if (staffDocSnap.exists()) {
                            const staffData = staffDocSnap.data();
                            realRole = staffData.role || realRole;
                        }
                    } catch (roleErr) {
                        console.warn("Failed to fetch custom staff role for webhook, using fallback:", roleErr);
                    }

                    await fetch(GAS_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: "login_staff",
                            companyName: tenantName || '',
                            loginId: loginId.trim(),
                            staffName: userData.userName || userData.name || '사원',
                            staffRole: realRole
                        })
                    });
                } catch (err) {
                    console.error("Google Sheets Sync Error (login_staff):", err);
                }
            })();
        } catch (error: any) {
            console.error("Staff login error:", error);
            toast.error('로그인 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setSessionClaimPending(false);
            setIsStaffLoggingIn(false);
        }
    };

    useEffect(() => {
        if (!authLoading && currentUser?.tenantId) {
            navigate(consumePostLoginPath(), { replace: true });
        }
    }, [authLoading, currentUser?.tenantId, navigate]);

    return (
        <div className="h-full min-h-0 w-full bg-slate-950 flex flex-col font-sans">
            {/* 데스크톱 앱 프레임리스 타이틀바 (Electron 전용 — 모바일/웹에서는 숨김) */}
            {isElectron && (
            <div 
                className="shrink-0 h-10 bg-slate-950 border-b border-slate-900 flex justify-between items-center select-none z-[100]"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 px-4 text-slate-400">
                    <Printer size={16} className="text-blue-500" />
                    <span className="text-xs font-bold tracking-wide">EzPrintWork Cloud</span>
                </div>
                
                <div 
                    className="flex items-center h-full text-slate-400" 
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <button 
                        type="button"
                        onClick={() => {
                            if (window.electron?.minimize) {
                                window.electron.minimize();
                            } else {
                                toast.info('최소화는 데스크톱 전용 앱에서 지원됩니다.');
                            }
                        }}
                        className="w-12 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                        title="최소화"
                    >
                        <Minus size={14} />
                    </button>
                    <button 
                        type="button"
                        onClick={() => {
                            if (window.electron?.maximize) {
                                window.electron.maximize();
                            } else {
                                if (!document.fullscreenElement) {
                                    document.documentElement.requestFullscreen().catch(() => {});
                                } else {
                                    document.exitFullscreen();
                                }
                            }
                        }}
                        className="w-12 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                        title="최대화"
                    >
                        <Square size={12} />
                    </button>
                    <button 
                        type="button"
                        onClick={() => {
                            if (window.electron?.close) {
                                window.electron.close();
                            } else {
                                if (confirm('로그인 화면을 닫거나 종료하시겠습니까?')) {
                                    window.close();
                                }
                            }
                        }}
                        className="w-12 h-full flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
                        title="닫기"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
            )}
            <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[25%] -left-[10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute -bottom-[25%] -right-[10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[100px]"></div>
            </div>
 
            <div className="relative min-h-full flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-10">
            <div className="max-w-xl w-full z-10 space-y-4 sm:space-y-6 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 bg-blue-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Printer className="text-white" size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter mb-1 sm:mb-2">EzPrintWork</h1>
                        <p className="text-slate-500 font-medium tracking-tight text-sm sm:text-base">인쇄소 업무 관리의 새로운 기준 (v{installedAppVersion})</p>
                    </div>
                </div>
 
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl space-y-4 sm:space-y-6">
                    <div className="space-y-1.5 text-center">
                        <h2 className="text-xl font-bold text-white">클라우드 시작하기</h2>
                    </div>

                    <div className="space-y-3">
                                <button
                                    onClick={handleGoogleLogin}
                                    disabled={isLoggingIn}
                                    className="w-full min-h-[56px] group relative flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-950 py-2.5 rounded-2xl transition-all active:scale-[0.98] shadow-xl hover:shadow-white/5 disabled:opacity-50"
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
                                        className="w-full text-[10px] text-rose-400 hover:text-rose-300 font-bold py-1.5 transition-colors animate-pulse text-center bg-rose-950/20 rounded-xl border border-rose-900/30"
                                    >
                                        로딩 멈춤 초기화
                                    </button>
                                )}

                                {isElectron ? (
                                    <label className="w-full min-h-[48px] flex items-center justify-center gap-2 px-3 rounded-2xl border border-slate-700 bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer select-none transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={openAtLogin}
                                            onChange={(e) => void handleToggleOpenAtLogin(e.target.checked)}
                                            className="w-3.5 h-3.5 shrink-0 rounded bg-slate-950 border-slate-700 text-blue-600 accent-blue-500 focus:ring-blue-600 cursor-pointer"
                                        />
                                        <span className="text-[12px] font-bold text-slate-300 whitespace-nowrap">
                                            Windows 시작 시 자동실행
                                        </span>
                                    </label>
                                ) : null}

                                <HomeScreenAddButton />
                            </div>

                            {/* Divider */}
                            <div className="relative flex items-center justify-center py-2">
                                <div className="border-t border-slate-800/80 w-full"></div>
                                <span className="absolute bg-slate-900 px-3 text-[10px] font-black text-slate-500 tracking-widest uppercase">
                                    또는 직원 로그인
                                </span>
                            </div>

                        <form onSubmit={handleStaffLogin} className="space-y-4">
                            {/* 회사 선택 및 검색 영역 */}
                            <div className="space-y-2 relative">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pl-1">
                                    <label className="text-xs font-bold text-slate-400 block shrink-0">소속 회사 선택 *</label>
                                    
                                    {/* "선택회사 저장" 및 "아이디·비밀번호 저장" 체크박스 */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="checkbox"
                                                id="rememberCompanyCheckbox"
                                                checked={rememberCompany}
                                                onChange={(e) => handleToggleRememberCompany(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-950 text-blue-500 accent-blue-500 focus:ring-blue-600 cursor-pointer"
                                            />
                                            <label htmlFor="rememberCompanyCheckbox" className="text-[11px] text-slate-400 font-bold cursor-pointer select-none whitespace-nowrap">
                                                선택회사 저장
                                            </label>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="checkbox"
                                                id="saveCredentialsCheckbox"
                                                checked={saveCredentials}
                                                onChange={(e) => handleToggleSaveCredentials(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-950 text-blue-500 accent-blue-500 focus:ring-blue-600 cursor-pointer"
                                            />
                                            <label htmlFor="saveCredentialsCheckbox" className="text-[11px] text-slate-400 font-bold cursor-pointer select-none whitespace-nowrap">
                                                아이디·비밀번호 저장
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                
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
                                                setSelectedTenantId('');
                                                if (hasSearchedLogin) setHasSearchedLogin(false);
                                            }}
                                            placeholder="회사 이름을 입력하고 검색하세요"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSearchLoginCompany}
                                        disabled={isSearchingLoginCompany}
                                        className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl border border-slate-700 text-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                                    >
                                        {isSearchingLoginCompany ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Search size={16} />
                                        )}
                                        검색
                                    </button>
                                </div>

                                {selectedTenantId && companyName.trim() && (
                                    <div className="text-xs text-emerald-400 font-semibold pl-1">
                                        ✓ {companyName} 선택됨
                                    </div>
                                )}

                                {/* 회사 검색 결과 드롭다운 */}
                                {hasSearchedLogin && !selectedTenantId && (
                                    <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl p-3 z-50 shadow-2xl space-y-2 max-h-48 overflow-y-auto">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1 mb-1">회사 검색 결과</div>
                                        {loginCompanySearchResults.length === 0 ? (
                                            <div className="text-xs text-slate-500 py-2 text-center">검색 결과가 없습니다. 회사명을 다시 확인해주세요.</div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-1">
                                                {loginCompanySearchResults.map((res) => (
                                                    <button
                                                        key={res.id}
                                                        type="button"
                                                        onClick={() => handleSelectLoginCompany(res.id, res.name)}
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
                                            placeholder={selectedTenantId ? "회사 전용 아이디 입력" : "회사를 먼저 선택해 주세요"}
                                            disabled={!selectedTenantId}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                                            disabled={!selectedTenantId}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isStaffLoggingIn || !selectedTenantId}
                                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/15"
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
                    </p>
                </footer>
            </div>
            </div>
            </div>
        </div>
    );
};
