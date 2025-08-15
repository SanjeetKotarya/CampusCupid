import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDuyZ4c86XDIbCGixjPJ6r648dDu15DoI0",
  authDomain: "campuscupid-a5ccb.firebaseapp.com",
  databaseURL: "https://campuscupid-a5ccb-default-rtdb.firebaseio.com",
  projectId: "campuscupid-a5ccb",
  storageBucket: "campuscupid-a5ccb.firebasestorage.app",
  messagingSenderId: "1096055137821",
  appId: "1:1096055137821:web:ec582a5e2b8e021bce48f4",
  measurementId: "G-NKNGYG4ML8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
export { auth, provider, db };