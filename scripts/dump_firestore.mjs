import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

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

async function dumpTenant(tenantId, tenantName) {
  console.log(`\n=== 테넌트 [${tenantName}] (${tenantId}) Firestore 데이터 백업 시작 ===`);
  const backup = {};

  const collectionNames = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'requests'];
  
  for (const col of collectionNames) {
    try {
      const snap = await getDocs(collection(db, `tenants/${tenantId}/${col}`));
      backup[col] = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      console.log(`  [컬렉션] ${col}: ${backup[col].length}개 항목 완료`);
    } catch (e) {
      console.error(`  [컬렉션] ${col} 오류:`, e.message);
      backup[col] = [];
    }
  }

  // settings 서브컬렉션 백업
  try {
    const settingsObj = {};
    const settingNames = ['productDefinitions', 'statusDefinitions', 'pricing', 'companyInfo', 'smsConfig', 'roles', 'nasConfig', 'processingDefinitions'];
    
    for (const sName of settingNames) {
      const docSnap = await getDoc(doc(db, `tenants/${tenantId}/settings/${sName}`));
      if (docSnap.exists()) {
        settingsObj[sName] = docSnap.data();
      }
    }
    backup['settings'] = [settingsObj];
    console.log(`  [설정] settings 완료`);
  } catch (e) {
    console.error('  [설정] settings 오류:', e.message);
    backup['settings'] = [];
  }

  const outputDir = 'C:\\Users\\CEO\\Documents';
  const outputPath = path.join(outputDir, `firestore_backup_${tenantId}.json`);
  
  try {
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`  -> 파일 저장 완료: ${outputPath}`);
  } catch (e) {
    console.error('  -> 파일 저장 실패:', e.message);
  }
}

async function run() {
  try {
    const tenantsSnap = await getDocs(collection(db, 'tenants'));
    for (const doc of tenantsSnap.docs) {
      const data = doc.data();
      await dumpTenant(doc.id, data.name || '이름 없음');
    }
    console.log('\n=== 모든 테넌트 백업 프로세스 완료 ===');
  } catch (err) {
    console.error("실행 오류:", err);
  }
}

run();
