import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  "projectId": "gen-lang-client-0746903005",
  "appId": "1:19768956246:web:a6cc6b3ca6ffbd53e572f7",
  "apiKey": "AIzaSyB04AtEe56eeP40C4cDS7-uvvaPZHa3pkQ",
  "authDomain": "gen-lang-client-0746903005.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755",
  "storageBucket": "gen-lang-client-0746903005.firebasestorage.app",
  "messagingSenderId": "19768956246",
  "measurementId": ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const staffId = '1779427626308';
  const tenantId = 'LXn4O7u7yOUreqzZTtwC';

  console.log(`=== 1. users 컬렉션에 ID [${staffId}] 계정 동기화 시도 ===`);
  try {
    const userDocRef = doc(db, 'users', staffId);
    await setDoc(userDocRef, {
      uid: staffId,
      id: staffId,
      tenantId: tenantId,
      loginId: 'sr201',
      password: '123456',
      userName: '이영아',
      name: '이영아',
      role: 'staff',
      position: '과장',
      createdAt: new Date().toISOString()
    });

    console.log("-> 성공! 글로벌 users 컬렉션에 sr201 계정이 안전하게 입력되었습니다.");
  } catch (err) {
    console.error("동기화 중 오류 발생:", err);
  }
}

run();
