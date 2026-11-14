import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { callAndroidNativeHttp } from './gasBridge';

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

export const GOOGLE_AUTH_PROJECT_ID = firebaseConfig.projectId || '';
export const LIVE_PWA_APP_URL =
  'https://ais-pre-hj7xd2hrjws6ngp5c3qqea-1001837723305.asia-east1.run.app';
export const DEV_PWA_APP_URL =
  'https://ais-dev-hj7xd2hrjws6ngp5c3qqea-1001837723305.asia-east1.run.app';

export function getApiBaseOrigin(): string {
  if (typeof window === 'undefined') return '';
  if (
    window.location.hostname === 'appassets.androidplatform.net' ||
    window.location.protocol === 'file:'
  ) {
    return LIVE_PWA_APP_URL;
  }
  return '';
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

function ensureFirebaseAuth(): Auth {
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(firebaseApp);
  }
  return firebaseAuth;
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedAndroidUser: User | null = null;

interface AndroidBlobBridgeHandle {
  openExternalBrowser?: (targetUrl: string) => void;
}

function getAndroidBridge(): AndroidBlobBridgeHandle | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidBlobBridge?: AndroidBlobBridgeHandle }).AndroidBlobBridge;
}

export function isAndroidWebViewOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname === 'appassets.androidplatform.net') return true;
  if (typeof getAndroidBridge() !== 'undefined') return true;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /; wv\)/i.test(ua);
}

export function hasOpenExternalBrowserBridge(): boolean {
  return typeof getAndroidBridge()?.openExternalBrowser === 'function';
}

export function openExternalBrowserIfAndroid(url: string): boolean {
  const bridge = getAndroidBridge();
  if (bridge?.openExternalBrowser) {
    bridge.openExternalBrowser(url);
    return true;
  }
  return false;
}

export function isInEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function formatGoogleAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    return `এই ওয়েবসাইটের ডোমেইন (${host || 'unknown'}) অনুমোদিত ডোমেইন তালিকায় যুক্ত নেই। Firebase Console (${GOOGLE_AUTH_PROJECT_ID}) → Authentication → Settings → Authorized domains-এ "${host}" যুক্ত করুন।`;
  }
  if (code === 'auth/popup-blocked' || rawMessage.includes('auth/popup-blocked')) {
    return 'ব্রাউজার লগইন পপআপ ব্লক করেছে। পপআপ অনুমতি দিন অথবা "নতুন ট্যাবে অ্যাপ খুলুন" লিংকে ক্লিক করে সরাসরি ব্রাউজারে সাইন-ইন করুন।';
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    rawMessage.includes('auth/popup-closed-by-user')
  ) {
    return 'গুগল লগইন সম্পন্ন হওয়ার আগেই পপআপ বন্ধ হয়েছে। অন্য শেয়ার করা জিমেইলে "Access blocked / Error 403" দেখালে Google Cloud Console-এর OAuth Test Users তালিকায় ওই ইমেইলটি যোগ করুন।';
  }
  if (code === 'auth/operation-not-allowed') {
    return `প্রোজেক্টে (${GOOGLE_AUTH_PROJECT_ID}) Google Sign-In চালু করা নেই।`;
  }
  if (code === 'auth/network-request-failed') {
    return 'ইন্টারনেট বা নেটওয়ার্ক সমস্যার কারণে গুগল সার্ভারে সংযোগ করা যায়নি।';
  }
  if (rawMessage) {
    return rawMessage;
  }
  return 'গুগল লগইন ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';
}

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  const auth = ensureFirebaseAuth();
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthSuccess?.(user, null);
      }
    } else if (cachedAndroidUser && cachedAccessToken) {
      onAuthSuccess?.(cachedAndroidUser, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      cachedAndroidUser = null;
      onAuthFailure?.();
    }
  });
};

function createRandomAuthState(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface AndroidAuthCallbackPayload {
  state?: string;
  accessToken?: string;
  email?: string;
  displayName?: string;
  uid?: string;
  photoUrl?: string;
}

export async function resolveReachablePwaOrigin(): Promise<string> {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'appassets.androidplatform.net' &&
    window.location.origin.startsWith('https://')
  ) {
    return window.location.origin;
  }

  try {
    const liveProbe = await callAndroidNativeHttp(
      'GET',
      `${LIVE_PWA_APP_URL}/api/android-auth/consume?state=preflight-check`
    );
    if (liveProbe.ok && liveProbe.status === 200 && liveProbe.text.includes('"pending"')) {
      return LIVE_PWA_APP_URL;
    }
  } catch {
    // ignore
  }

  try {
    const devProbe = await callAndroidNativeHttp('GET', `${DEV_PWA_APP_URL}/`);
    if (devProbe.status >= 200 && devProbe.status < 400) {
      return DEV_PWA_APP_URL;
    }
  } catch {
    // ignore
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const probe = await fetch(
      `${LIVE_PWA_APP_URL}/api/android-auth/consume?state=preflight-check`,
      { signal: controller.signal }
    );
    window.clearTimeout(timer);
    const ct = probe.headers.get('content-type') || '';
    if (probe.ok && ct.includes('application/json')) {
      return LIVE_PWA_APP_URL;
    }
  } catch {
    // Ignore
  }

  throw new Error(
    `লাইভ ওয়েব অ্যাপ (${LIVE_PWA_APP_URL}) এখনো পাবলিশ/শেয়ার করা হয়নি (404)। অনুগ্রহ করে Google AI Studio থেকে অ্যাপটি Share/Publish করুন অথবা নিচের Apps Script লিংক দিয়ে শিট সিঙ্ক করুন।`
  );
}

async function signInViaAndroidChromeBridge(): Promise<{ user: User; accessToken: string }> {
  if (!hasOpenExternalBrowserBridge()) {
    throw new Error(
      'আপনার ফোনে ইনস্টল করা পুরনো APK-তে Chrome-লগইন ব্রিজ নেই। নিচের «অ্যান্ড্রয়েড APK প্রজেক্ট (.zip)» ডাউনলোড করে নতুন APK ইনস্টল করুন।'
    );
  }

  const handoffOrigin = await resolveReachablePwaOrigin();
  const state = createRandomAuthState();
  const handoffUrl = `${handoffOrigin}/?android_auth=1&state=${encodeURIComponent(state)}`;

  if (!openExternalBrowserIfAndroid(handoffUrl)) {
    throw new Error('অ্যান্ড্রয়েড Chrome ব্রাউজার চালু করা যায়নি।');
  }

  return new Promise<{ user: User; accessToken: string }>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let inFlight = false;

    const cleanup = () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      delete (window as unknown as { __onAndroidAuthCallback?: unknown }).__onAndroidAuthCallback;
    };

    const completeWithAuth = (
      token: string,
      userInfo?: {
        uid?: string;
        email?: string | null;
        displayName?: string | null;
        photoURL?: string | null;
      }
    ) => {
      if (settled || !token) return;
      settled = true;
      cleanup();
      const profile = {
        uid: userInfo?.uid || `android-${state.slice(0, 8)}`,
        email: userInfo?.email || null,
        displayName: userInfo?.displayName || userInfo?.email || 'Google যুক্ত',
        photoURL: userInfo?.photoURL || null,
      } as unknown as User;
      cachedAccessToken = token;
      cachedAndroidUser = profile;
      resolve({ user: profile, accessToken: token });
    };

    const tryConsume = async () => {
      if (settled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `${handoffOrigin}/api/android-auth/consume?state=${encodeURIComponent(state)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          pending?: boolean;
          accessToken?: string;
          user?: {
            uid?: string;
            email?: string | null;
            displayName?: string | null;
            photoURL?: string | null;
          };
        };
        if (data.ok && !data.pending && data.accessToken) {
          completeWithAuth(data.accessToken, data.user);
        }
      } catch {
        // ignore
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tryConsume();
      }
    };

    (
      window as unknown as {
        __onAndroidAuthCallback?: (payload: string | AndroidAuthCallbackPayload) => void;
      }
    ).__onAndroidAuthCallback = (payload: string | AndroidAuthCallbackPayload) => {
      if (typeof payload === 'object' && payload !== null) {
        const returnedState = payload.state || '';
        if ((!returnedState || returnedState === state) && payload.accessToken) {
          completeWithAuth(payload.accessToken, {
            uid: payload.uid,
            email: payload.email || null,
            displayName: payload.displayName || null,
            photoURL: payload.photoUrl || null,
          });
          return;
        }
        if (!returnedState || returnedState === state) {
          void tryConsume();
        }
        return;
      }

      if (!payload || payload === state) {
        void tryConsume();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    pollTimer = window.setInterval(() => {
      void tryConsume();
    }, 1500);

    timeoutTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          'ব্রাউজার থেকে গুগল লগইনের সময়সীমা শেষ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
        )
      );
    }, 120_000);
  });
}

export async function submitAndroidAuthHandoff(
  state: string,
  user: User,
  accessToken: string
): Promise<void> {
  const res = await fetch('/api/android-auth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      accessToken,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    }),
  });
  if (!res.ok) {
    throw new Error('অ্যান্ড্রয়েড অ্যাপে লগইন সেশন পাঠানো যায়নি।');
  }
}

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  if (isAndroidWebViewOrigin()) {
    isSigningIn = true;
    try {
      return await signInViaAndroidChromeBridge();
    } finally {
      isSigningIn = false;
    }
  }

  const auth = ensureFirebaseAuth();
  const provider = createGoogleProvider();
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'গুগল অ্যাকাউন্ট থেকে Google Sheets অ্যাক্সেস টোকেন পাওয়া যায়নি। সাইন-ইনের সময় সকল অনুমতির টিক দিয়ে আবার চেষ্টা করুন।'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    throw new Error(formatGoogleAuthError(err));
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const clearGoogleAccessToken = () => {
  cachedAccessToken = null;
};

export const googleLogout = async (): Promise<void> => {
  const auth = ensureFirebaseAuth();
  cachedAccessToken = null;
  cachedAndroidUser = null;
  await auth.signOut();
};
