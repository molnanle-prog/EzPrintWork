import { auth } from '../services/firebase';
import { isStaffKeepLoggedIn } from './staffLoginPreferences';

function isDesktopElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
}

/** Firebase Auth persistence — onAuthStateChanged 전에 호출해야 세션 복원이 안정적입니다. */
export async function configureAuthPersistenceFromPreferences(): Promise<void> {
  const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
  // 매장 PC는 업데이트·재실행 후에도 세션이 남아 있어야 함. 웹만 아이디 저장 여부를 따름.
  const persistLocal = isDesktopElectron() || isStaffKeepLoggedIn();
  await setPersistence(auth, persistLocal ? browserLocalPersistence : browserSessionPersistence);
}
