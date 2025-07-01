import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA_R0k0U7S4sa8nTYqPPvGku6G1hA8nfGY",
  authDomain: "wrkn-fca0f.firebaseapp.com",
  projectId: "wrkn-fca0f",
  storageBucket: "wrkn-fca0f.appspot.com",
  messagingSenderId: "909517080226",
  appId: "1:909517080226:web:31d86e47887e8d08e179fb",
  measurementId: "G-HTLFN37K0G"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { app, auth, provider, signInWithPopup, signOut }; 