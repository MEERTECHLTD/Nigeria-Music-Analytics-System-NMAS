import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

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

/**
 * Analytics is best-effort and must never surface as an error.
 *
 * getAnalytics() used to run unconditionally at module load. Where the
 * measurement endpoint is unreachable — a network that blocks trackers, which
 * describes most government networks, or simply an offline client — the beacon
 * rejected and printed "TypeError: Failed to fetch" into the console of an
 * otherwise healthy page. isSupported() gates the environments that cannot run
 * it at all, and the catch absorbs the rest; nothing here is on the render path,
 * and no caller reads this export.
 */
export let analytics: Analytics | null = null;

void isSupported()
  .then((supported) => {
    if (supported) analytics = getAnalytics(app);
  })
  .catch(() => {
    /* analytics unavailable — the dashboard does not depend on it */
  });
