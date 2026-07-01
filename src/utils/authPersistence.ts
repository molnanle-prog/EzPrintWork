import { auth } from '../services/firebase';
import { isStaffKeepLoggedIn } from './staffLoginPreferences';

/** Firebase Auth persistence — onAuthStateChanged 전에 호출해야 세션 복원이 안정적입니다. */
export async function configureAuthPersistenceFromPreferences(): Promise<void> {
  const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
  await setPersistence(
    auth,
    isStaffKeepLoggedIn() ? browserLocalPersistence : browserSessionPersistence
  );
}
