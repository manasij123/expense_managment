import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getMessaging, getToken as getFcmToken, onMessage } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

// Same project/config the server-rendered app already used (functions/templates/login.html, base.html).
const firebaseConfig = {
  apiKey: "AIzaSyBB1lT-Kh0OkJtnC1tKT2RQlvsFuHNlWEE",
  authDomain: "expensemanagement-178bf.firebaseapp.com",
  projectId: "expensemanagement-178bf",
  storageBucket: "expensemanagement-178bf.firebasestorage.app",
  messagingSenderId: "853835589338",
  appId: "1:853835589338:web:a8a909cc0d8c510a22a7e3",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Popups are unreliable inside the Capacitor-wrapped Android app's WebView
// (Google actively blocks sign-in in many embedded contexts), so the native
// build uses a full-page redirect instead. The regular website keeps the
// popup flow unchanged, since that's already proven to work well there.
export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    await signInWithRedirect(auth, googleProvider);
    return null; // page is navigating away; nothing more to return here
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user.getIdToken();
}

// Call once on app startup — completes a sign-in that was left in progress
// by signInWithRedirect (a no-op if we didn't just come back from one).
export async function completeRedirectSignIn() {
  if (!Capacitor.isNativePlatform()) return null;
  const result = await getRedirectResult(auth);
  if (!result) return null;
  return result.user.getIdToken();
}

export function signOut() {
  return firebaseSignOut(auth);
}

// Same VAPID key + service worker path the server-rendered app used (dashboard.html).
const VAPID_KEY = 'BDUxpgI8t4NQ-_JItkwP2zRp3E_jH9A9Md4u8JaeLjLE1dF-vU2ufYxIByiqY4X4hpDAltvTYghCsMH-Qjxjqgg';

let messagingInstance = null;
function getMessagingInstance() {
  if (!messagingInstance) messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}

export async function requestNotificationToken() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.register('/static/firebase-messaging-sw.js');
  return getFcmToken(getMessagingInstance(), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

export function watchForegroundMessages(callback) {
  return onMessage(getMessagingInstance(), callback);
}
