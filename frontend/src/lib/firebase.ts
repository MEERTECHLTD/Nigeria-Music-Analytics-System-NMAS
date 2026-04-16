import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBuyf1w1NfUXvTwMt6bcoW4V1rS8Ena9QI",
  authDomain: "nmas-2026.firebaseapp.com",
  projectId: "nmas-2026",
  storageBucket: "nmas-2026.firebasestorage.app",
  messagingSenderId: "55341373039",
  appId: "1:55341373039:web:b59f41ff38a7709ab0df9a",
  measurementId: "G-D7XZ6MHBDW"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
