import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBwu-k1TBC94guKRGF8GEP4JmV8YJI_7BY",
  authDomain: "campuscupid-7fa51.firebaseapp.com",
  databaseURL: "https://campuscupid-7fa51-default-rtdb.firebaseio.com",
  projectId: "campuscupid-7fa51",
  storageBucket: "campuscupid-7fa51.firebasestorage.app",
  messagingSenderId: "323609683048",
  appId: "1:323609683048:web:60a177fc81c426dfcc47dd",
  measurementId: "G-NZH22XQTPY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, provider, db }; 