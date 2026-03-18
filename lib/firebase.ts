import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAc9WUQzLLGXdjCXXpvi7paqTFRHwc0E5M",
  authDomain: "bootcamp-platform-27d16.firebaseapp.com",
  projectId: "bootcamp-platform-27d16",
  storageBucket: "bootcamp-platform-27d16.firebasestorage.app",
  messagingSenderId: "780790284759",
  appId: "1:780790284759:web:b5bc273be0392d60ff8b92",
  measurementId: "G-Q9M4V6XK1R"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// 🔥 persist login
setPersistence(auth, browserLocalPersistence);