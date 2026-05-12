import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
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
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app);

// Connection test
async function testConnection() {
  try {
    const testDoc = doc(db, '_connection_test_', 'ping');
    await getDocFromServer(testDoc).catch(() => {});
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Firebase connection test failed:", error);
  }
}

// testConnection();
