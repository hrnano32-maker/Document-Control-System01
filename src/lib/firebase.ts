import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyC8fZsa1FY3-NMbMXcr9PpqvnhzlHpJwUA',
  authDomain: 'dar-online-form.firebaseapp.com',
  projectId: 'dar-online-form',
  storageBucket: 'dar-online-form.firebasestorage.app',
  messagingSenderId: '850027048943',
  appId: '1:850027048943:web:b907d73ff1f2973f2d101a',
  measurementId: 'G-K52YMLQG5K',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const firebaseFunctions = getFunctions(firebaseApp, 'asia-southeast1');

export const usernameToInternalEmail = (username: string) => {
  const normalized = username.trim().toLowerCase();
  return normalized.includes('@') ? normalized : `${normalized}@dar-online-form.app`;
};
