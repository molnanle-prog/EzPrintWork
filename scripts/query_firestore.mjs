import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
  console.log("=== 1. '상록인쇄기획' 테넌트 조회 ===");
  try {
    const tenantsSnap = await getDocs(collection(db, 'tenants'));
    let targetTenantId = null;
    let targetTenantName = '';

    tenantsSnap.forEach((doc) => {
      const data = doc.data();
      console.log(`테넌트 ID: ${doc.id}, 이름: ${data.name}`);
      if (data.name && data.name.includes('상록인쇄기획')) {
        targetTenantId = doc.id;
        targetTenantName = data.name;
      }
    });

    if (targetTenantId) {
      console.log(`\n-> 찾음! 테넌트: [${targetTenantName}] (ID: ${targetTenantId})`);
      
      console.log(`\n=== 2. 테넌트 [${targetTenantId}] 에 소속된 사용자 (users 컬렉션) 조회 ===`);
      const usersQuery = query(collection(db, 'users'), where('tenantId', '==', targetTenantId));
      const usersSnap = await getDocs(usersQuery);
      
      if (usersSnap.empty) {
        console.log("해당 테넌트에 등록된 사용자가 'users' 컬렉션에 없습니다.");
      } else {
        usersSnap.forEach((doc) => {
          const data = doc.data();
          console.log(`사용자 ID: ${doc.id}, 이름: ${data.name || data.userName}, loginId: ${data.loginId}, password: ${data.password}, role: ${data.role}`);
        });
      }

      console.log(`\n=== 3. 테넌트 서브컬렉션 [tenants/${targetTenantId}/staff] 조회 ===`);
      const staffSnap = await getDocs(collection(db, `tenants/${targetTenantId}/staff`));
      if (staffSnap.empty) {
        console.log("해당 테넌트의 staff 서브컬렉션이 비어 있습니다.");
      } else {
        staffSnap.forEach((doc) => {
          const data = doc.data();
          console.log(`직원 ID: ${doc.id}, 이름: ${data.name}, loginId: ${data.loginId}, password: ${data.password}, role: ${data.role}`);
        });
      }
    } else {
      console.log("상록인쇄기획 테넌트를 찾을 수 없습니다.");
    }
  } catch (err) {
    console.error("오류 발생:", err);
  }
}

run();
