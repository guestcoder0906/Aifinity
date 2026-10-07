import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Use the canonical Firebase auth domain from config (gen-lang-client-0320558179.firebaseapp.com)
// where Firebase Auth's handler /__/auth/handler is hosted and managed by Google.
const effectiveConfig = firebaseConfig;

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(effectiveConfig) : getApp();

// Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Ensure Google auth prompts account selection
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Firestore instance targeting the configured database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

export { firebaseConfig };

export default app;
