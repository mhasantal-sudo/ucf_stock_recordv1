import {
  DEFAULT_MAIN_APPS_SCRIPT_URL,
  type GasAppData,
  type ProductCategory,
} from '../types/grain';

export const GAS_BRIDGE_SNIPPET = `// ১. বিদ্যমান Code.gs ফাইলের doGet(e) ফাংশনের একদম শুরুতে এই ৩ লাইন বসান:
if (e && e.parameter && e.parameter.api === '1') {
  return gasApiJson_(handleGasApiAction_(e.parameter.action || 'getAppData', e.parameter));
}

// ২. Code.gs-এর একদম নিচে এই অংশটি পেস্ট করে নতুন Deployment করুন (বিদ্যমান কোনো লজিক বদলাবে না):
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return gasApiJson_(handleGasApiAction_(body.action, body.payload || body));
  } catch (err) {
    return gasApiJson_({ ok: false, error: err.message || String(err) });
  }
}

function handleGasApiAction_(action, p) {
  switch (action) {
    case 'getAppData': return { ok: true, data: getAppData(p.fy || null) };
    default: return { ok: false, error: 'Unknown action: ' + action };
  }
}

function gasApiJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function bnToEnDigits(val: unknown): string {
  return String(val ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
}

export function enToBnDigits(val: unknown): string {
  return String(val ?? '').replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] || d);
}

export function parseGasNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = bnToEnDigits(val).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function itemNameBnToProduct(item: string): ProductCategory {
  const s = String(item || '').trim();
  if (s === 'ধান') return 'paddy';
  if (s === 'গম') return 'wheat';
  if (s.includes('৩০')) return 'bosta_30';
  if (s.includes('৫০') || s.includes('বস্তা')) return 'bosta_50';
  return 'rice';
}

export function productToItemNameBn(product: ProductCategory): string {
  switch (product) {
    case 'paddy':
      return 'ধান';
    case 'rice':
      return 'চাল';
    case 'wheat':
      return 'গম';
    case 'bosta_50':
      return '৫০ কেজির বস্তা';
    case 'bosta_30':
      return '৩০ কেজির বস্তা';
  }
}

export function allocateBagsByWeight(totalBags: number, weights: number[]): number[] {
  const cleanTotal = Math.max(0, Math.round(totalBags));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || weights.length === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (cleanTotal * w) / sum);
  const res = raw.map((r) => Math.floor(r));
  let left = cleanTotal - res.reduce((a, b) => a + b, 0);

  raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f)
    .forEach((o) => {
      if (left > 0) {
        res[o.i] += 1;
        left -= 1;
      }
    });

  return res;
}

export interface GasProxyResult<T = unknown> {
  ok: boolean;
  code?: 'HTML_NOT_JSON' | 'NETWORK_ERROR' | 'API_ERROR';
  data?: T;
  message?: string;
  error?: string;
}

interface AndroidBridgeWindow {
  AndroidBlobBridge?: {
    saveBase64File?: (base64Data: string, fileName: string, mimeType: string) => void;
    printCurrentPage?: () => void;
    httpRequest?: (requestId: string, method: string, url: string, body: string) => void;
  };
  __androidHttpCallback?: (
    requestId: string,
    payload: { ok?: boolean; status?: number; text?: string; error?: string }
  ) => void;
}

export function callAndroidNativeHttp(
  method: 'GET' | 'POST',
  url: string,
  body = ''
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as AndroidBridgeWindow;
    const bridge = w.AndroidBlobBridge;
    if (!bridge || typeof bridge.httpRequest !== 'function') {
      reject(new Error('No Android HTTP bridge'));
      return;
    }

    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prevCallback = w.__androidHttpCallback;
    type NativeHttpResult = { ok: boolean; status: number; text: string; error?: string };
    const winTyped = w as unknown as {
      __androidHttpPending?: Map<string, (res: NativeHttpResult) => void>;
    };
    const pendingMap: Map<string, (res: NativeHttpResult) => void> =
      winTyped.__androidHttpPending || new Map<string, (res: NativeHttpResult) => void>();
    winTyped.__androidHttpPending = pendingMap;

    if (!prevCallback) {
      w.__androidHttpCallback = (id, payload) => {
        const cb = pendingMap.get(id);
        if (cb) {
          pendingMap.delete(id);
          cb({
            ok: Boolean(payload?.ok),
            status: Number(payload?.status || 0),
            text: String(payload?.text || ''),
            error: payload?.error,
          });
        }
      };
    }

    const timeout = window.setTimeout(() => {
      if (pendingMap.has(reqId)) {
        pendingMap.delete(reqId);
        resolve({ ok: false, status: 0, text: '', error: 'সংযোগের সময়সীমা শেষ হয়েছে।' });
      }
    }, 30000);

    pendingMap.set(reqId, (res) => {
      window.clearTimeout(timeout);
      resolve(res);
    });

    bridge.httpRequest(reqId, method, url, body);
  });
}

export async function callGasAction<T = unknown>(
  url: string,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<GasProxyResult<T>> {
  const targetUrl = (url || DEFAULT_MAIN_APPS_SCRIPT_URL).trim();
  const isAndroidOfflineOrigin =
    typeof window !== 'undefined' &&
    window.location.hostname === 'appassets.androidplatform.net';

  try {
    if (isAndroidOfflineOrigin) {
      let text = '';
      const w = typeof window !== 'undefined' ? (window as unknown as AndroidBridgeWindow) : null;
      const hasNativeHttp = Boolean(w?.AndroidBlobBridge?.httpRequest);

      if (hasNativeHttp) {
        let nativeRes: { ok: boolean; status: number; text: string; error?: string };
        if (action === 'getAppData') {
          const u = new URL(targetUrl);
          u.searchParams.set('api', '1');
          u.searchParams.set('action', 'getAppData');
          if (payload.fy) u.searchParams.set('fy', String(payload.fy));
          nativeRes = await callAndroidNativeHttp('GET', u.toString());
        } else {
          nativeRes = await callAndroidNativeHttp(
            'POST',
            targetUrl,
            JSON.stringify({ action, payload })
          );
        }
        if (!nativeRes.ok && !nativeRes.text) {
          return {
            ok: false,
            code: 'NETWORK_ERROR',
            error: nativeRes.error || `HTTP ${nativeRes.status || 'Error'}`,
          };
        }
        text = nativeRes.text;
      } else {
        let res: Response;
        if (action === 'getAppData') {
          const u = new URL(targetUrl);
          u.searchParams.set('api', '1');
          u.searchParams.set('action', 'getAppData');
          if (payload.fy) u.searchParams.set('fy', String(payload.fy));
          res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
        } else {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload }),
            redirect: 'follow',
          });
        }
        text = await res.text();
      }

      if (text.trim().startsWith('<')) {
        return {
          ok: false,
          code: 'HTML_NOT_JSON',
          error: 'মেইন ওয়েব অ্যাপে Code.gs JSON ব্রিজ এখনো যুক্ত করা হয়নি।',
        };
      }
      const parsed = JSON.parse(text) as GasProxyResult<T> & Partial<GasAppData>;
      if (parsed && parsed.ok === false) {
        return { ok: false, code: 'API_ERROR', error: parsed.error || 'অ্যাপ স্ক্রিপ্ট ত্রুটি' };
      }
      if (parsed && 'data' in parsed && parsed.data !== undefined) {
        return { ok: true, data: parsed.data, message: parsed.message };
      }
      return { ok: true, data: parsed as unknown as T, message: parsed.message };
    }

    const res = await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, action, payload }),
    });

    const json = (await res.json()) as GasProxyResult<T>;
    return json;
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      error: err instanceof Error ? err.message : 'নেটওয়ার্ক সংযোগ ব্যর্থ হয়েছে।',
    };
  }
}
