// Боевой бэкенд: Firebase Auth + Cloud Firestore (+ Cloud Messaging для push).
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, doc, writeBatch,
} from 'firebase/firestore';
import { firebaseConfig, VAPID_KEY } from '../../config';

const ERRORS = {
  'auth/invalid-credential': 'Неверная почта или пароль.',
  'auth/wrong-password': 'Неверный пароль.',
  'auth/user-not-found': 'Такого аккаунта нет.',
  'auth/too-many-requests': 'Слишком много попыток. Подождите пару минут.',
  'auth/network-request-failed': 'Нет связи с сервером. Проверьте интернет.',
};

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createFirebaseBackend() {
  const app = initializeApp(firebaseConfig);
  // Сессия хранится на устройстве: вошли один раз — дальше вход автоматический.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }

  const snapToList = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));

  return {
    mode: 'firebase',
    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase() } : null));
    },
    async signIn(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (e) {
        throw new Error(ERRORS[e.code] || e.message);
      }
    },
    signOut: () => fbSignOut(auth),
    getIdToken: () => auth.currentUser?.getIdToken() ?? Promise.resolve(null),
    listen(col, cb, onError) {
      return onSnapshot(collection(db, col), (s) => cb(snapToList(s)), (e) => { console.error(col, e); onError?.(e); });
    },
    async add(col, data) {
      const ref = await addDoc(collection(db, col), data);
      return ref.id;
    },
    async addMany(col, items) {
      const ids = [];
      for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(db);
        items.slice(i, i + 400).forEach((it) => {
          const ref = doc(collection(db, col));
          ids.push(ref.id);
          batch.set(ref, it);
        });
        await batch.commit();
      }
      return ids;
    },
    set: (col, id, data) => setDoc(doc(db, col, id), data, { merge: true }),
    update: (col, id, patch) => updateDoc(doc(db, col, id), patch),
    remove: (col, id) => deleteDoc(doc(db, col, id)),
    async removeMany(col, ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, col, id)));
        await batch.commit();
      }
    },
    /** Подписывает это устройство на push. На iPhone работает только из приложения на экране «Домой». */
    async enablePush(uid) {
      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
      if (!(await isSupported())) {
        return { ok: false, error: 'На этом устройстве push недоступен. На iPhone откройте приложение с экрана «Домой» (iOS 16.4+).' };
      }
      if (!VAPID_KEY) return { ok: false, error: 'Не задан VAPID-ключ (VITE_FIREBASE_VAPID_KEY).' };
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, error: 'Разрешение на уведомления не выдано. Включите его в настройках устройства.' };
      const reg = await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) return { ok: false, error: 'Не удалось получить токен устройства.' };
      const id = (await sha256Hex(token)).slice(0, 40);
      await setDoc(doc(db, 'devices', id), {
        uid, token, ua: navigator.userAgent.slice(0, 180),
        platform: /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop',
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    },
  };
}
