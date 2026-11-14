import type { DriveSpreadsheetFile } from '../types/grain';
import { callAndroidNativeHttp } from './gasBridge';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Google সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে পুনরায় Google Sign-In করুন।') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

export class PublicSheetAccessError extends Error {
  constructor(
    message = 'এই গুগল শিটটি এখনো পাবলিক লিংক শেয়ার করা নেই। Google Sheet-এ Share → General access → «Anyone with the link» (Viewer) অন করে আবার সিঙ্ক করুন।'
  ) {
    super(message);
    this.name = 'PublicSheetAccessError';
  }
}

export function extractSpreadsheetId(rawInput: string): string {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

async function googleApiFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new GoogleAuthExpiredError();
  }

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Google API HTTP ${res.status}`);
  }

  if (!res.ok) {
    const errObj = parsed.error as { message?: string } | undefined;
    throw new Error(errObj?.message || `Google API ত্রুটি (HTTP ${res.status})`);
  }

  return parsed as T;
}

export async function listUserSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetFile[]> {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const url = `${DRIVE_API_BASE}?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=30`;
  const data = await googleApiFetch<{ files?: DriveSpreadsheetFile[] }>(url, accessToken);
  return data.files || [];
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheetTitles: string[];
  sheetIdMap: Record<string, number>;
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  rawSpreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID খালি রয়েছে।');
  }
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets(properties(sheetId,title))`;
  const data = await googleApiFetch<{
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(url, accessToken);

  const sheetTitles: string[] = [];
  const sheetIdMap: Record<string, number> = {};
  for (const s of data.sheets || []) {
    const title = s.properties?.title;
    const sheetId = s.properties?.sheetId;
    if (title) {
      sheetTitles.push(title);
      if (typeof sheetId === 'number') {
        sheetIdMap[title] = sheetId;
      }
    }
  }

  return {
    spreadsheetId,
    title: data.properties?.title || spreadsheetId,
    sheetTitles,
    sheetIdMap,
  };
}

export function parseCsvToRows(csvText: string): string[][] {
  const clean = String(csvText || '').replace(/^\uFEFF/, '');
  if (!clean.trim()) return [];
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
}

function isAndroidNativeHttpAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    AndroidBlobBridge?: { httpRequest?: unknown };
  };
  return typeof w.AndroidBlobBridge?.httpRequest === 'function';
}

async function fetchPublicGoogleUrl(
  url: string
): Promise<{ ok: boolean; status: number; text: string; privateSheet?: boolean }> {
  if (isAndroidNativeHttpAvailable()) {
    const res = await callAndroidNativeHttp('GET', url);
    const body = res.text || '';
    const isPrivate =
      res.status === 401 ||
      res.status === 403 ||
      body.includes('accounts.google.com/ServiceLogin') ||
      /<title>\s*Sign in/i.test(body);
    return {
      ok: res.ok && !isPrivate,
      status: res.status,
      text: body,
      privateSheet: isPrivate,
    };
  }

  const res = await fetch('/api/public-sheets/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    status?: number;
    text?: string;
    error?: string;
  };
  if (data.code === 'PRIVATE_SHEET') {
    return {
      ok: false,
      status: Number(data.status || 403),
      text: '',
      privateSheet: true,
    };
  }
  if (!res.ok) {
    throw new Error(data.error || `Google Sheet পড়া যায়নি (HTTP ${res.status})`);
  }
  return {
    ok: Boolean(data.ok),
    status: Number(data.status || 200),
    text: String(data.text || ''),
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeJsQuotedString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')}"`);
  } catch {
    return raw;
  }
}

export async function getPublicSpreadsheetMetadata(
  rawSpreadsheetId: string
): Promise<{ meta: SpreadsheetMetadata; gidMap: Record<string, string> }> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID খালি রয়েছে।');
  }

  const htmlRes = await fetchPublicGoogleUrl(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/htmlview`
  );
  if (htmlRes.privateSheet) {
    throw new PublicSheetAccessError();
  }
  if (!htmlRes.ok || !htmlRes.text) {
    throw new Error(
      `Google Sheet পাওয়া যায়নি (HTTP ${htmlRes.status})। লিংক/ID সঠিক কিনা ও Share অপশন চালু আছে কিনা দেখুন।`
    );
  }

  const html = htmlRes.text;
  if (
    html.includes('accounts.google.com/ServiceLogin') ||
    /<title>\s*Sign in/i.test(html)
  ) {
    throw new PublicSheetAccessError();
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]
    ? decodeHtmlEntities(titleMatch[1].replace(/\s*-\s*Google Sheets\s*$/i, '').trim())
    : spreadsheetId;

  const sheetTitles: string[] = [];
  const sheetIdMap: Record<string, number> = {};
  const gidMap: Record<string, string> = {};

  const pushTab = (name: string, gid: string) => {
    const cleanName = name.trim();
    if (!cleanName || !gid) return;
    if (!gidMap[cleanName]) {
      sheetTitles.push(cleanName);
      gidMap[cleanName] = gid;
      const numGid = Number(gid);
      if (Number.isFinite(numGid)) {
        sheetIdMap[cleanName] = numGid;
      }
    }
  };

  const jsRegex = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid(?:=|\\x3d|\\u003d)(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = jsRegex.exec(html)) !== null) {
    pushTab(decodeJsQuotedString(m[1]), m[2]);
  }

  if (sheetTitles.length === 0) {
    const domRegex = /id=["']sheet-button-(\d+)["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = domRegex.exec(html)) !== null) {
      pushTab(decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '')), m[1]);
    }
  }

  return {
    meta: {
      spreadsheetId,
      title,
      sheetTitles,
      sheetIdMap,
    },
    gidMap,
  };
}
