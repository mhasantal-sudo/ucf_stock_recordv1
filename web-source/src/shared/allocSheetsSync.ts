import {
  DEFAULT_OFFICER_PROFILE,
  createDefaultTemplatesMap,
  type AllocationCategory,
  type AllocationDatabase,
  type CategoryRate,
  type ChairmanEntry,
  type ChallanRecord,
  type DCAllocation,
  type DOBook,
  type DOIssue,
  type DealerSuballocation,
  type FireServiceEntry,
  type FoodDealer,
  type MinistryAllocation,
  type OMSDealer,
  type ProjectEntry,
  type UNOSuballocation,
} from '../types/allocation';
import type { DriveSpreadsheetFile } from '../types/grain';
import { bnToEnDigits, memosLikelyMatch, namesFuzzyMatch, namesLikelyMatch, normMemoNo, parseNum, round2, round3, uid } from './bnUtils';
import { callAndroidNativeHttp } from './gasBridge';
import {
  GoogleAuthExpiredError,
  PublicSheetAccessError,
  extractSpreadsheetId,
  getPublicSpreadsheetMetadata,
  getSpreadsheetMetadata,
  listUserSpreadsheets,
  parseCsvToRows,
  type SpreadsheetMetadata,
} from './googleSheetsSync';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const ALLOC_SHEET_TABS = {
  ministry: {
    name: 'Ministry_Allocations',
    aliases: [
      'ministry_allocations',
      'ministry_alloc',
      'ministry',
      'allocations',
      'মন্ত্রণালয়_বরাদ্দ',
      'মন্ত্রণালয়',
      'বরাদ্দ',
    ],
    headers: ['ID', 'Category', 'Memo_No', 'Memo_Date', 'Allocation_Qty', 'Grain', 'Phase', 'Comment', 'Created_At'],
  },
  dc: {
    name: 'DC_Allocations',
    aliases: ['dc_allocations', 'dc_alloc', 'dc', 'জেলা_প্রশাসক', 'ডিসি_বরাদ্দ', 'ডিসি'],
    headers: ['ID', 'Category', 'Ministry_Memo', 'DC_Memo', 'DC_Date', 'Allocation_Qty', 'Created_At'],
  },
  dealerSub: {
    name: 'Dealer_Suballocations',
    aliases: [
      'dealer_suballocations',
      'dealer_suballocation',
      'suballocations',
      'sub_allocations',
      'dealer_sub',
      'ucf_suballocations',
      'ডিলার_উপবরাদ্দ',
      'উপবরাদ্দ',
    ],
    headers: ['ID', 'Category', 'Source_Memo', 'UNO_Memo', 'UNO_Date', 'Dealer_Name', 'Union_Name', 'Sales_Center', 'Card_Count', 'Unused_Cards', 'Allocation_Qty', 'Total_Amount', 'Tax_Amount', 'Created_At'],
  },
  projects: {
    name: 'Projects',
    aliases: ['projects', 'gr_projects', 'kabikha_projects', 'প্রকল্প', 'প্রকল্প_তালিকা'],
    headers: ['ID', 'Category', 'DC_Memo', 'Project_No', 'Project_Name', 'President_Name', 'Union_Name', 'Allocation_Qty', 'Created_At'],
  },
  unoSub: {
    name: 'UNO_Suballocations',
    aliases: [
      'uno_suballocations',
      'uno_sub',
      'uno',
      'relief_suballocations',
      'ইউএনও_উপবরাদ্দ',
      'ত্রাণ_উপবরাদ্দ',
    ],
    headers: ['ID', 'Category', 'Ministry_Memo', 'DC_Memo', 'UNO_Memo', 'UNO_Date', 'Union_Name', 'Recipient_Name', 'Project_No', 'Project_Name', 'Allocation_Qty', 'Created_At'],
  },
  doBooks: {
    name: 'DO_Books',
    aliases: ['do_books', 'dobooks', 'dobook', 'ডিও_বই'],
    headers: ['ID', 'Book_No', 'Start_Page', 'End_Page', 'Total_Count', 'Created_At'],
  },
  doIssue: {
    name: 'DO_Issue',
    aliases: ['do_issue', 'doissue', 'do_issues', 'do_register', 'ডিও_ইস্যু', 'ডিও'],
    headers: ['doNo', 'issueDate', 'category', 'unionName', 'recipientName', 'salesCenter', 'quantity', 'ministryMemo', 'dcMemo', 'unoMemo', 'projectNo', 'challanNo', 'challanDate', 'challanAmount', 'taxChallanNo', 'taxChallanDate', 'taxChallanAmount', 'requiredAmount', 'requiredTaxAmount', 'createdAt', 'id'],
  },
  challans: {
    name: 'Challans',
    aliases: [
      'challans',
      'challan',
      'challan_entry',
      'challan_register',
      'treasury_challan',
      'treasury_challans',
      'চালান',
      'ট্রেজারি_চালান',
      'চালান_এন্ট্রি',
      'চালান_রেজিস্টার',
    ],
    headers: ['ID', 'Challan_No', 'Challan_Date', 'Category', 'Dealer_Name', 'Challan_Type', 'Bank_Name', 'DO_No', 'Recorded_Amount', 'Deposited_Amount', 'Note', 'Created_At'],
  },
  foodDealers: {
    name: 'Food_Dealers',
    aliases: ['food_dealers', 'dealers_food', 'food_dealer', 'খাদ্য_বান্ধব_ডিলার', 'খাদ্যবান্ধব_ডিলার'],
    headers: ['ID', 'Dealer_Name', 'Father_Name', 'NID', 'Mobile', 'Union_Name', 'Sales_Center', 'Card_Count', 'Total_Qty', 'PO_No', 'PO_Date', 'Bank_Name', 'Amount', 'Supervisor_Name', 'Supervisor_Designation', 'Supervisor_Mobile'],
  },
  omsDealers: {
    name: 'OMS_Dealers',
    aliases: ['oms_dealers', 'dealers_oms', 'oms_dealer', 'ওএমএস_ডিলার'],
    headers: ['ID', 'Dealer_Name', 'Father_Name', 'NID', 'Mobile', 'Area_Type', 'Union_Name', 'Municipality', 'Sales_Center', 'PO_No', 'PO_Date', 'Bank_Name', 'Amount', 'Supervisor_Name', 'Supervisor_Designation', 'Supervisor_Mobile'],
  },
  chairmen: {
    name: 'Chairmen',
    aliases: ['chairmen', 'chairman', 'চেয়ারম্যান', 'ইউপি_চেয়ারম্যান'],
    headers: ['ID', 'Union_Name', 'Chairman_Name', 'Mobile', 'Supervisor_Name', 'Supervisor_Mobile'],
  },
  fireServices: {
    name: 'Fire_Service',
    aliases: ['fire_service', 'fireservice', 'ep_offices', 'ফায়ার_সার্ভিস'],
    headers: ['ID', 'Office_Name', 'Division_Name', 'Rice_Rate', 'Wheat_Rate'],
  },
  rates: {
    name: 'Category_Rates',
    aliases: ['category_rates', 'rates', 'price_rates', 'দর', 'একক_মূল্য'],
    headers: ['ID', 'Category', 'Unit_Price', 'Tax_Rate'],
  },
  settings: {
    name: 'Alloc_Settings',
    aliases: ['alloc_settings', 'settings', 'report_settings', 'config', 'সেটিংস'],
    headers: ['Key', 'Value'],
  },
} as const;

function normKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/**
 * Detect whether a sheet table predominantly uses US M/D/YYYY dates (e.g. 7/19/2026, 8/27/2026)
 * vs D/M/YYYY dates. Returns true if MDY markers appear strictly without DMY markers.
 */
function detectPreferMdy(rows: unknown[][]): boolean {
  let mdyHits = 0;
  let dmyHits = 0;
  const maxRows = Math.min(rows.length, 250);
  for (let i = 1; i < maxRows; i++) {
    const r = rows[i] || [];
    for (const cell of r) {
      if (typeof cell !== 'string') continue;
      const s = bnToEnDigits(cell).trim();
      const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (!slash) continue;
      const a = Number(slash[1]);
      const b = Number(slash[2]);
      if (b > 12 && a >= 1 && a <= 12) mdyHits += 1;
      else if (a > 12 && b >= 1 && b <= 12) dmyHits += 1;
    }
  }
  return mdyHits > dmyHits;
}

function parseDateStr(val: unknown, preferMdy = false): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = bnToEnDigits(String(val)).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = slash[3];
    let mon: number;
    let day: number;
    if (a > 12) {
      day = a;
      mon = b;
    } else if (b > 12) {
      mon = a;
      day = b;
    } else if (preferMdy) {
      mon = a;
      day = b;
    } else {
      day = a;
      mon = b;
    }
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function normalizeCategoryName(raw: unknown, hintText?: string): AllocationCategory {
  const s = String(raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = s.replace(/\s+/g, '').toLowerCase();
  const valid: AllocationCategory[] = [
    'খাদ্য বান্ধব',
    'ওএমএস সাধারণ',
    'ওএমএস বিশেষ',
    'ওএমএস টিসিবি',
    'ইপি চাল',
    'ইপি গম',
    'ভিজিএফ মৎস্য',
    'ভিজিএফ ঈদ',
    'জি আর',
    'কাবিখা সাধারণ চাল',
    'কাবিখা সাধারণ গম',
    'কাবিখা বিশেষ চাল',
    'কাবিখা বিশেষ গম',
    'ভিডাব্লিউভি',
  ];
  const hit = valid.find((v) => v === s || v.replace(/\s+/g, '') === compact);
  if (hit) return hit;

  const classify = (txt: string): AllocationCategory | null => {
    const n = txt.normalize('NFC').trim();
    if (!n) return null;
    const low = n.toLowerCase();
    const cmp = low.replace(/\s+/g, '');

    if ((n.includes('খাদ্য') && n.includes('বান্ধব')) || low.includes('food friendly') || cmp.includes('khadya')) {
      return 'খাদ্য বান্ধব';
    }
    if (n.includes('টিসিবি') || low.includes('tcb')) return 'ওএমএস টিসিবি';
    if (n.includes('বিশেষ') && (n.includes('ওএমএস') || low.includes('oms'))) return 'ওএমএস বিশেষ';
    if (n.includes('ওএমএস') || low.includes('oms')) return 'ওএমএস সাধারণ';
    if ((n.includes('ইপি') || n.includes('ফায়ার') || low.includes('fire') || cmp === 'ep' || low.includes('ep ') || low.includes('ep-')) && (n.includes('গম') || low.includes('wheat'))) {
      return 'ইপি গম';
    }
    if (n.includes('ইপি') || n.includes('ফায়ার') || low.includes('fire') || cmp === 'ep' || low.includes('ep ') || low.includes('ep-')) {
      return 'ইপি চাল';
    }
    if (n.includes('মৎস্য') || low.includes('fish')) return 'ভিজিএফ মৎস্য';
    if (n.includes('ঈদ') || low.includes('eid')) return 'ভিজিএফ ঈদ';
    if (cmp === 'জিআর' || (n.includes('জি') && n.includes('আর')) || cmp === 'gr' || /\bgr\b/i.test(n)) {
      return 'জি আর';
    }
    if (n.includes('কাবিখা') && n.includes('বিশেষ') && (n.includes('গম') || low.includes('wheat'))) {
      return 'কাবিখা বিশেষ গম';
    }
    if (n.includes('কাবিখা') && n.includes('বিশেষ')) return 'কাবিখা বিশেষ চাল';
    if (n.includes('কাবিখা') && (n.includes('গম') || low.includes('wheat'))) return 'কাবিখা সাধারণ গম';
    if (n.includes('কাবিখা') || low.includes('kabikha')) return 'কাবিখা সাধারণ চাল';
    const noDots = low.replace(/[.\-_\s]+/g, '');
    if (
      n.includes('ভিডাব্লিউ') ||
      n.includes('ভিডব্লিউ') ||
      n.includes('ভিজিডি') ||
      n.includes('ভিজিডব্লিউ') ||
      n.includes('জিডব্লিউ') ||
      n.includes('জি ডব্লিউ') ||
      noDots.includes('vwb') ||
      noDots.includes('vgd') ||
      noDots.includes('vwd') ||
      noDots.includes('gwb')
    ) {
      return 'ভিডাব্লিউভি';
    }
    return null;
  };

  return classify(s) || (hintText ? classify(hintText) : null) || 'খাদ্য বান্ধব';
}

const CATEGORY_FIELD_KEYS = [
  'category',
  'khath',
  'khat',
  'খাত',
  'খাতেরনাম',
  'কর্মসূচি',
  'কর্মসূচিরনাম',
  'program',
  'scheme',
  'sector',
  'head',
  'type',
];

function makeUniqueId(rawId: string, prefix: string, index: number, seenIds: Set<string>): string {
  const base = rawId.trim() || `${prefix}-${index}`;
  if (!seenIds.has(base)) {
    seenIds.add(base);
    return base;
  }
  let suffix = 1;
  while (seenIds.has(`${base}-${suffix}`)) suffix++;
  const unique = `${base}-${suffix}`;
  seenIds.add(unique);
  return unique;
}

const HEADER_HINT_TOKENS = [
  'id', 'category', 'khath', 'khat', 'খাত', 'খাতেরনাম', 'কর্মসূচি', 'program', 'scheme', 'sector', 'head',
  'memo', 'স্মারক', 'date', 'তারিখ',
  'qty', 'quantity', 'allocationqty', 'পরিমাণ', 'dealer', 'ডিলার', 'union', 'ইউনিয়ন',
  'dono', 'ডিও', 'challan', 'চালান', 'bookno', 'বইনং', 'amount', 'টাকা',
  'recipient', 'প্রাপক', 'project', 'প্রকল্প', 'bank', 'ব্যাংক', 'chairman', 'চেয়ারম্যান',
];

function findHeaderRowIndex(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 8);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const r = rows[i] || [];
    const nonEmpty = r.filter((c) => String(c ?? '').trim() !== '');
    if (nonEmpty.length < 2) continue;
    let score = nonEmpty.length;
    for (const cell of nonEmpty) {
      const nk = normKey(cell);
      if (!nk) continue;
      if (HEADER_HINT_TOKENS.some((tok) => nk === tok || nk.includes(tok))) {
        score += 5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function mapRowsByHeader(rows: unknown[][]): Array<Record<string, unknown>> {
  if (!rows || rows.length < 2) return [];
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx >= rows.length - 1) return [];
  const rawHeaders = (rows[headerIdx] || []).map((h) => String(h ?? '').trim());
  const normHeaders = rawHeaders.map((h) => normKey(h));
  const out: Array<Record<string, unknown>> = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const hasAny = r.some((c) => String(c ?? '').trim() !== '');
    if (!hasAny) continue;
    const obj: Record<string, unknown> = {};
    normHeaders.forEach((nh, idx) => {
      if (nh) obj[nh] = r[idx];
      if (rawHeaders[idx]) obj[rawHeaders[idx]] = r[idx];
    });
    out.push(obj);
  }
  return out;
}

function pickField(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const nk = normKey(k);
    if (obj[nk] !== undefined && obj[nk] !== null && String(obj[nk]).trim() !== '') {
      return String(obj[nk]).trim();
    }
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
      return String(obj[k]).trim();
    }
  }
  return '';
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number {
  const s = pickField(obj, keys);
  return s ? parseNum(s) : 0;
}

function findMatchingSheetTitle(
  titles: string[],
  primary: string,
  aliases: readonly string[]
): string | undefined {
  const normTitles = titles.map((t) => ({ raw: t, norm: normKey(t) }));
  const targets = [primary, ...aliases].map(normKey);
  for (const target of targets) {
    const exact = normTitles.find((t) => t.norm === target);
    if (exact) return exact.raw;
  }
  for (const target of targets) {
    if (target.length < 3) continue;
    const part = normTitles.find((t) => t.norm.includes(target) || target.includes(t.norm));
    if (part) return part.raw;
  }
  return undefined;
}

async function googleFetch<T>(
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
  if (res.status === 401) throw new GoogleAuthExpiredError();
  const txt = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Google Sheets HTTP ${res.status}`);
  }
  if (!res.ok) {
    const e = json.error as { message?: string } | undefined;
    throw new Error(e?.message || `Google API ত্রুটি (HTTP ${res.status})`);
  }
  return json as T;
}

async function fetchPublicUrlRaw(url: string): Promise<{ ok: boolean; text: string }> {
  if (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { AndroidBlobBridge?: { httpRequest?: unknown } }).AndroidBlobBridge
      ?.httpRequest === 'function'
  ) {
    const r = await callAndroidNativeHttp('GET', url);
    if (r.status === 401 || r.status === 403 || (r.text || '').includes('accounts.google.com/ServiceLogin')) {
      throw new PublicSheetAccessError();
    }
    return { ok: Boolean(r.ok && r.text && !r.text.trim().startsWith('<')), text: r.text || '' };
  }

  const res = await fetch('/api/public-sheets/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    text?: string;
  };
  if (data.code === 'PRIVATE_SHEET') throw new PublicSheetAccessError();
  return {
    ok: Boolean(data.ok && data.text && !data.text.trim().startsWith('<')),
    text: String(data.text || ''),
  };
}

async function fetchPublicCsvSheet(
  spreadsheetId: string,
  gid?: string,
  sheetName?: string
): Promise<unknown[][]> {
  if (gid) {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId
    )}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const r = await fetchPublicUrlRaw(exportUrl);
    if (r.ok) return parseCsvToRows(r.text);
  }
  if (sheetName) {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId
    )}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const r = await fetchPublicUrlRaw(gvizUrl);
    if (r.ok) return parseCsvToRows(r.text);
  }
  return [];
}

function buildAllocationDbFromRawTables(
  tables: Partial<Record<keyof typeof ALLOC_SHEET_TABS, unknown[][]>>,
  matchedTabs: Set<keyof typeof ALLOC_SHEET_TABS>,
  currentDb?: AllocationDatabase
): AllocationDatabase {
  const workbookPreferMdy = Object.values(tables).some((t) => (t ? detectPreferMdy(t) : false));

  const mdyOf = (key: keyof typeof ALLOC_SHEET_TABS) => {
    const t = tables[key] || [];
    return t.length > 1 ? detectPreferMdy(t) || workbookPreferMdy : workbookPreferMdy;
  };

  const ministryRows = mapRowsByHeader(tables.ministry || []);
  const dcRows = mapRowsByHeader(tables.dc || []);
  const dealerSubRows = mapRowsByHeader(tables.dealerSub || []);
  const projectRows = mapRowsByHeader(tables.projects || []);
  const unoSubRows = mapRowsByHeader(tables.unoSub || []);
  const doBookRows = mapRowsByHeader(tables.doBooks || []);
  const doIssueRows = mapRowsByHeader(tables.doIssue || []);
  const foodDealerRows = mapRowsByHeader(tables.foodDealers || []);
  const omsDealerRows = mapRowsByHeader(tables.omsDealers || []);
  const chairmanRows = mapRowsByHeader(tables.chairmen || []);
  const fireRows = mapRowsByHeader(tables.fireServices || []);
  const rateRows = mapRowsByHeader(tables.rates || []);

  const settingsMap: Record<string, string> = {};
  for (let i = 1; i < (tables.settings?.length || 0); i++) {
    const r = tables.settings?.[i] || [];
    const k = String(r[0] ?? '').trim();
    if (k) settingsMap[k] = String(r[1] ?? '');
  }

  const seenIds = new Set<string>();

  const minMdy = mdyOf('ministry');
  const ministryAllocations: MinistryAllocation[] = ministryRows
    .map((o, i) => {
      const memoNo = pickField(o, ['memono', 'memo', 'ministrymemo', 'স্মারক', 'স্মারকনং']);
      const comment = pickField(o, ['comment', 'note', 'remarks', 'মন্তব্য']);
      return {
        id: makeUniqueId(pickField(o, ['id']), 'min-s', i, seenIds),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), `${memoNo} ${comment}`),
        memoNo,
        memoDate: parseDateStr(pickField(o, ['memodate', 'date', 'তারিখ', 'স্মারকতারিখ', 'createdat']), minMdy),
        allocationQty: pickNum(o, ['allocationqty', 'qty', 'quantity', 'পরিমাণ', 'বরাদ্দ']),
        grain: (pickField(o, ['grain', 'শস্য', 'পণ্য']) || 'চাল') as 'চাল' | 'গম' | 'আটা',
        phase: pickNum(o, ['phase', 'পর্যায়']) || undefined,
        comment,
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.memoNo || x.allocationQty > 0);

  const dcMdy = mdyOf('dc');
  const dcAllocations: DCAllocation[] = dcRows
    .map((o, i) => {
      const ministryMemo = pickField(o, ['ministrymemo', 'sourcememo', 'মন্ত্রণালয়স্মারক']);
      const dcMemo = pickField(o, ['dcmemo', 'ডিসিস্মারক', 'স্মারক']);
      return {
        id: makeUniqueId(pickField(o, ['id']), 'dc-s', i, seenIds),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), `${ministryMemo} ${dcMemo}`),
        ministryMemo,
        dcMemo,
        dcMemoDate: parseDateStr(pickField(o, ['dcdate', 'dcmemodate', 'date', 'তারিখ', 'createdat']), dcMdy),
        allocationQty: pickNum(o, ['allocationqty', 'qty', 'quantity', 'পরিমাণ', 'বরাদ্দ']),
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.dcMemo || x.allocationQty > 0);

  const subMdy = mdyOf('dealerSub');
  const dealerSuballocations: DealerSuballocation[] = dealerSubRows
    .map((o, i) => {
      const dealerName = pickField(o, ['dealername', 'recipientname', 'dealer', 'ডিলার', 'ডিলারেরনাম', 'প্রাপক']);
      const sourceMemo = pickField(o, ['sourcememo', 'ministrymemo', 'dcmemo', 'স্মারক', 'উৎসস্মারক']);
      const grainHint = pickField(o, ['grain', 'product', 'item', 'শস্য', 'পণ্য']);
      return {
        id: makeUniqueId(pickField(o, ['id']), 'ds-s', i, seenIds),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), `${dealerName} ${sourceMemo} ${grainHint}`),
        sourceMemo,
        unoMemo: pickField(o, ['unomemo', 'ucfmemo', 'sourcememo', 'dcmemo', 'ইউসিএফস্মারক', 'উপবরাদ্দস্মারক']),
        unoDate: parseDateStr(pickField(o, ['unodate', 'date', 'তারিখ', 'createdat']), subMdy),
        dealerName,
        unionName: pickField(o, ['unionname', 'municipality', 'area', 'union', 'ইউনিয়ন']),
        salesCenter: pickField(o, ['salescenter', 'center', 'বিক্রয়কেন্দ্র']),
        cardCount: pickNum(o, ['cardcount', 'cards', 'কার্ড', 'কার্ডসংখ্যা']),
        unusedCards: pickNum(o, ['unusedcards', 'অবিক্রিতকার্ড']),
        allocationQty: pickNum(o, ['allocationqty', 'qty', 'quantity', 'পরিমাণ', 'উপবরাদ্দ']),
        totalAmount: pickNum(o, ['totalamount', 'amount', 'টাকা', 'মোটটাকা']),
        taxAmount: pickNum(o, ['taxamount', 'tax', 'আয়কর']),
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.dealerName || x.allocationQty > 0);

  const projects: ProjectEntry[] = projectRows
    .map((o, i) => {
      const projectName = pickField(o, ['projectname', 'প্রকল্পেরনাম', 'প্রকল্পনাম', 'প্রনাম', 'নাম']);
      return {
        id: makeUniqueId(pickField(o, ['id']), 'prj-s', i, seenIds),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), projectName),
        dcMemo: pickField(o, ['dcmemo', 'ডিসিস্মারক']),
        projectNo: pickField(o, ['projectno', 'প্রকল্পনং', 'প্রনং', 'প্রকল্পনম্বর']),
        projectName,
        presidentName: pickField(o, [
          'presidentname',
          'president',
          'secretaryname',
          'secretary',
          'সভাপতি',
          'সম্পাদক',
          'প্রকল্পসভাপতি',
          'সভাপতিসম্পাদক',
        ]),
        unionName: pickField(o, ['unionname', 'ইউনিয়ন']),
        allocationQty: pickNum(o, ['allocationqty', 'qty', 'quantity', 'বরাদ্দ']),
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.projectNo || x.projectName);

  const unoMdy = mdyOf('unoSub');
  const unoSuballocations: UNOSuballocation[] = unoSubRows
    .map((o, i) => {
      const recipientName = pickField(o, [
        'recipientname',
        'chairmanname',
        'presidentname',
        'president',
        'secretaryname',
        'secretary',
        'প্রাপক',
        'সভাপতি',
        'সম্পাদক',
        'প্রকল্পসভাপতি',
        'সভাপতিসম্পাদক',
      ]);
      const projectName = pickField(o, ['projectname', 'প্রকল্পেরনাম', 'প্রকল্পনাম', 'প্রনাম']);
      return {
        id: makeUniqueId(pickField(o, ['id']), 'uno-s', i, seenIds),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), `${recipientName} ${projectName}`),
        ministryMemo: pickField(o, [
          'ministrymemo',
          'sourcememo',
          'মন্ত্রণালয়স্মারক',
          'উৎসস্মারক',
          'বরাদ্দস্মারক',
        ]),
        dcMemo: pickField(o, ['dcmemo', 'ডিসিস্মারক']),
        unoMemo: pickField(o, ['unomemo', 'ইউএনওস্মারক', 'স্মারক']),
        unoDate: parseDateStr(pickField(o, ['unodate', 'date', 'তারিখ', 'createdat']), unoMdy),
        unionName: pickField(o, ['unionname', 'ইউনিয়ন']),
        recipientName,
        projectNo: pickField(o, ['projectno', 'প্রকল্পনং', 'প্রনং', 'প্রকল্পনম্বর']),
        projectName,
        allocationQty: pickNum(o, ['allocationqty', 'qty', 'quantity', 'পরিমাণ']),
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.recipientName || x.allocationQty > 0);

  const doBooks: DOBook[] = doBookRows
    .map((o, i) => {
      const startPage = Math.round(pickNum(o, ['startpage', 'start', 'শুরুপাতা']));
      const endPage = Math.round(pickNum(o, ['endpage', 'end', 'শেষপাতা']));
      return {
        id: makeUniqueId(pickField(o, ['id']), 'book-s', i, seenIds),
        bookNo: Math.round(pickNum(o, ['bookno', 'book', 'বইনং'])),
        startPage,
        endPage,
        totalCount: Math.round(pickNum(o, ['totalcount', 'total', 'মোটডিও'])) || Math.max(0, endPage - startPage + 1),
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.bookNo > 0 && x.endPage >= x.startPage);

  const doMdy = mdyOf('doIssue');
  const doIssues: DOIssue[] = doIssueRows
    .map((o, i) => {
      const recipientName = pickField(o, ['recipientname', 'dealername', 'dealer', 'প্রাপক', 'ডিলার', 'প্রতিষ্ঠান']);
      const ministryMemo = pickField(o, ['ministrymemo', 'sourcememo', 'মন্ত্রণালয়স্মারক', 'উৎসস্মারক', 'বরাদ্দস্মারক']);
      const grainHint = pickField(o, ['grain', 'product', 'item', 'শস্য', 'পণ্য']);
      const dealerAllocationId = pickField(o, ['dealerallocationid', 'suballocationid', 'allocationid']) || undefined;
      return {
        id: makeUniqueId(pickField(o, ['id']), 'doi-s', i, seenIds),
        doNo: pickField(o, ['dono', 'donumber', 'do', 'ডিওনং', 'ডিওনম্বর', 'ডিও']),
        issueDate: parseDateStr(pickField(o, ['issuedate', 'date', 'dodate', 'createdat', 'তারিখ', 'ইস্যুতারিখ']), doMdy),
        category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS), `${recipientName} ${ministryMemo} ${grainHint}`),
        unionName: pickField(o, ['unionname', 'union', 'area', 'municipality', 'ইউনিয়ন', 'এলাকা']),
        recipientName,
        salesCenter: pickField(o, ['salescenter', 'center', 'বিক্রয়কেন্দ্র']),
        allocationQty: pickNum(o, ['quantity', 'allocationqty', 'qty', 'doqty', 'পরিমাণ', 'বরাদ্দ']),
        ministryMemo,
        dcMemo: pickField(o, ['dcmemo', 'ডিসিস্মারক']),
        unoMemo: pickField(o, ['unomemo', 'ucfmemo', 'suballocationmemo', 'memono', 'memo', 'ইউসিএফস্মারক', 'ইউএনওস্মারক', 'উপবরাদ্দস্মারক', 'স্মারক']),
        projectNo: pickField(o, ['projectno', 'প্রকল্পনং']),
        dealerAllocationId,
        challanNo: pickField(o, ['challanno', 'mainchallanno', 'মূলচালান', 'মূলচালাননং', 'চালাননং']),
        challanDate: parseDateStr(pickField(o, ['challandate', 'mainchallandate', 'চালানেরতারিখ']), doMdy),
        challanAmount: pickNum(o, ['challanamount', 'mainchallanamount', 'depositedamount', 'amount', 'totalamount', 'মূলচালানেরটাকা', 'জমাকৃতটাকা', 'মোটটাকা', 'টাকা']) || undefined,
        taxChallanNo: pickField(o, ['taxchallanno', 'incometaxchallanno', 'আয়করচালান', 'আয়করচালাননং']),
        taxChallanDate: parseDateStr(pickField(o, ['taxchallandate', 'incometaxdate', 'আয়করতারিখ']), doMdy),
        taxChallanAmount: pickNum(o, ['taxchallanamount', 'incometaxamount', 'taxamount', 'আয়করটাকা', 'আয়করেরপরিমাণ']) || undefined,
        requiredAmount: pickNum(o, ['requiredamount', 'recordedamount']) || undefined,
        requiredTaxAmount: pickNum(o, ['requiredtaxamount']) || undefined,
        createdAt: pickField(o, ['createdat']) || new Date().toISOString(),
      };
    })
    .filter((x) => x.doNo);

  const challans = tables.challans ? parseChallanRowsFromTable(tables.challans, workbookPreferMdy) : [];

  const dedupByKey = <T>(items: T[], getKey: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
      const k = getKey(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  };

  const foodMdy = mdyOf('foodDealers');
  const foodDealers: FoodDealer[] = dedupByKey(
    foodDealerRows
      .map((o, i) => ({
        id: makeUniqueId(pickField(o, ['id']), 'fd-s', i, seenIds),
        dealerName: pickField(o, ['dealername', 'dealer', 'ডিলারেরনাম', 'ডিলার', 'নাম', 'name']),
        fatherName: pickField(o, ['fathername', 'পিতারনাম']),
        nid: pickField(o, ['nid', 'এনআইডি']),
        mobile: pickField(o, ['mobile', 'phone', 'মোবাইল']),
        unionName: pickField(o, ['unionname', 'union', 'ইউনিয়নেরনাম', 'ইউনিয়ন']),
        salesCenter: pickField(o, ['salescenter', 'center', 'বিক্রয়কেন্দ্র', 'কেন্দ্র']),
        cardCount: pickNum(o, ['cardcount', 'cards', 'কার্ড', 'কার্ডসংখ্যা']),
        totalQty: pickNum(o, ['totalqty', 'মোটপরিমাণ', 'পরিমাণ']) || Number((pickNum(o, ['cardcount', 'cards', 'কার্ড', 'কার্ডসংখ্যা']) * 0.03).toFixed(3)),
        poNo: pickField(o, ['pono', 'পেঅর্ডারনং']),
        poDate: parseDateStr(pickField(o, ['podate', 'পেঅর্ডারতারিখ']), foodMdy),
        bankName: pickField(o, ['bankname', 'ব্যাংক', 'ব্যাংকেরনাম']),
        amount: pickNum(o, ['amount', 'টাকারপরিমাণ']),
        supervisorName: pickField(o, ['supervisorname', 'তদারকিকর্মকর্তা']),
        supervisorDesignation: pickField(o, ['supervisordesignation', 'পদবী', 'পদবি']),
        supervisorMobile: pickField(o, ['supervisormobile']),
      }))
      .filter((x) => x.dealerName),
    (d) => `${normKey(d.dealerName)}::${normKey(d.unionName)}`
  );

  const omsMdy = mdyOf('omsDealers');
  const omsDealers: OMSDealer[] = dedupByKey(
    omsDealerRows
      .map((o, i) => ({
        id: makeUniqueId(pickField(o, ['id']), 'od-s', i, seenIds),
        dealerName: pickField(o, ['dealername', 'dealer', 'ডিলারেরনাম', 'ডিলার', 'নাম', 'name']),
        fatherName: pickField(o, ['fathername', 'পিতারনাম']),
        nid: pickField(o, ['nid', 'এনআইডি']),
        mobile: pickField(o, ['mobile', 'phone', 'মোবাইল']),
        areaType: (pickField(o, ['areatype', 'এলাকারধরন']) === 'পৌরসভা' ? 'পৌরসভা' : 'ইউনিয়ন') as 'ইউনিয়ন' | 'পৌরসভা',
        unionName: pickField(o, ['unionname', 'union', 'ইউনিয়নেরনাম', 'ইউনিয়ন']),
        municipality: pickField(o, ['municipality', 'পৌরসভা']),
        salesCenter: pickField(o, ['salescenter', 'center', 'বিক্রয়কেন্দ্র', 'কেন্দ্র']),
        poNo: pickField(o, ['pono', 'পেঅর্ডারনং']),
        poDate: parseDateStr(pickField(o, ['podate']), omsMdy),
        bankName: pickField(o, ['bankname', 'ব্যাংক', 'ব্যাংকেরনাম']),
        amount: pickNum(o, ['amount', 'টাকারপরিমাণ']),
        supervisorName: pickField(o, ['supervisorname', 'তদারকিকর্মকর্তা']),
        supervisorDesignation: pickField(o, ['supervisordesignation', 'পদবী', 'পদবি']),
        supervisorMobile: pickField(o, ['supervisormobile']),
      }))
      .filter((x) => x.dealerName),
    (d) => `${normKey(d.dealerName)}::${normKey(d.unionName || d.municipality)}`
  );

  const chairmen: ChairmanEntry[] = dedupByKey(
    chairmanRows
      .map((o, i) => ({
        id: makeUniqueId(pickField(o, ['id']), 'ch-s', i, seenIds),
        unionName: pickField(o, ['unionname', 'union', 'ইউনিয়নেরনাম', 'ইউনিয়ন', 'ইউনিয়ন/পৌরসভা', 'এলাকা']),
        chairmanName: pickField(o, ['chairmanname', 'chairman', 'চেয়ারম্যানেরনাম', 'চেয়ারম্যান', 'চেয়ারম্যান/প্রাপক', 'প্রাপক', 'নাম', 'name']),
        mobile: pickField(o, ['mobile', 'phone', 'মোবাইল']),
        supervisorName: pickField(o, ['supervisorname', 'তদারকিকর্মকর্তা']),
        supervisorMobile: pickField(o, ['supervisormobile']),
      }))
      .filter((x) => x.chairmanName),
    (c) => `${normKey(c.unionName)}::${normKey(c.chairmanName)}`
  );

  const fireServices: FireServiceEntry[] = dedupByKey(
    fireRows
      .map((o, i) => ({
        id: makeUniqueId(pickField(o, ['id']), 'fs-s', i, seenIds),
        officeName: pickField(o, ['officename', 'office', 'অফিস']),
        divisionName: pickField(o, ['divisionname', 'division', 'বিভাগীয়কার্যালয়']),
        riceRate: pickNum(o, ['ricerate']),
        wheatRate: pickNum(o, ['wheatrate']),
      }))
      .filter((x) => x.officeName),
    (f) => normKey(f.officeName)
  );

  const rates: CategoryRate[] = dedupByKey(
    rateRows.map((o, i) => ({
      id: makeUniqueId(pickField(o, ['id']), 'rt-s', i, seenIds),
      category: normalizeCategoryName(pickField(o, CATEGORY_FIELD_KEYS)),
      unitPrice: pickNum(o, ['unitprice', 'price', 'rate', 'এককমূল্য', 'দর']),
      taxRate: pickNum(o, ['taxrate', 'tax', 'আয়কর']),
    })),
    (r) => r.category
  );

  let officer = currentDb?.officer || { ...DEFAULT_OFFICER_PROFILE };
  if (settingsMap.officer) {
    try {
      officer = { ...officer, ...(JSON.parse(settingsMap.officer) as Partial<typeof officer>) };
    } catch {
      // ignore invalid JSON
    }
  }
  let templates = currentDb?.templates || createDefaultTemplatesMap(officer);
  if (settingsMap.templates) {
    try {
      templates = { ...templates, ...(JSON.parse(settingsMap.templates) as typeof templates) };
    } catch {
      // ignore
    }
  }

  const isRealAllocationSheet = matchedTabs.size >= 2;
  const resolveTab = <T>(key: keyof typeof ALLOC_SHEET_TABS, parsed: T[], fallback: T[], keepFallbackWhenMissing = false): T[] => {
    if (matchedTabs.has(key)) return parsed;
    if (isRealAllocationSheet && !keepFallbackWhenMissing) return [];
    return parsed.length > 0 ? parsed : fallback;
  };

  const built: AllocationDatabase = {
    ministryAllocations: resolveTab('ministry', ministryAllocations, currentDb?.ministryAllocations || []),
    dcAllocations: resolveTab('dc', dcAllocations, currentDb?.dcAllocations || []),
    dealerSuballocations: resolveTab('dealerSub', dealerSuballocations, currentDb?.dealerSuballocations || []),
    projects: resolveTab('projects', projects, currentDb?.projects || []),
    unoSuballocations: resolveTab('unoSub', unoSuballocations, currentDb?.unoSuballocations || []),
    doBooks: resolveTab('doBooks', doBooks, currentDb?.doBooks || []),
    doIssues: resolveTab('doIssue', doIssues, currentDb?.doIssues || []),
    challans: resolveTab('challans', challans, currentDb?.challans || [], true),
    foodDealers: resolveTab('foodDealers', foodDealers, currentDb?.foodDealers || [], true),
    omsDealers: resolveTab('omsDealers', omsDealers, currentDb?.omsDealers || [], true),
    chairmen: resolveTab('chairmen', chairmen, currentDb?.chairmen || [], true),
    fireServices: resolveTab('fireServices', fireServices, currentDb?.fireServices || [], true),
    rates: resolveTab('rates', rates, currentDb?.rates || [], true),
    officer,
    templates,
    reportMemos: currentDb?.reportMemos || {},
  };

  return reconcileChallansAndDOs(built);
}

/**
 * Links external Challan rows (including dealerAllocationId) with DealerSuballocations
 * and enriches DOIssues that lack embedded challan metadata.
 */
export function reconcileChallansAndDOs(db: AllocationDatabase): AllocationDatabase {
  const rateMap = new Map(db.rates.map((r) => [r.category, r]));

  const getEffectiveUnitPrice = (cat: AllocationCategory): number => {
    const r = rateMap.get(cat);
    if (r && r.unitPrice > 0) return r.unitPrice;
    return cat === 'খাদ্য বান্ধব' ? 13000 : 0;
  };

  const getEffectiveTaxRate = (cat: AllocationCategory): number => {
    const r = rateMap.get(cat);
    if (r && r.taxRate > 0) return r.taxRate;
    return cat === 'খাদ্য বান্ধব' ? 200 : 0;
  };

  const monthKey = (iso?: string): string => {
    const s = (iso || '').trim();
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  };

  const daysDiff = (a?: string, b?: string): number => {
    const tA = a ? Date.parse(a) : NaN;
    const tB = b ? Date.parse(b) : NaN;
    if (Number.isNaN(tA) || Number.isNaN(tB)) return 9999;
    return Math.abs(tA - tB) / 86400000;
  };

  const enrichedSubs: DealerSuballocation[] = db.dealerSuballocations.map((s) => {
    const unitPrice = getEffectiveUnitPrice(s.category);
    const taxRate = getEffectiveTaxRate(s.category);
    const totalAmount = s.totalAmount > 0 ? s.totalAmount : round2(s.allocationQty * unitPrice);
    const taxAmount = s.taxAmount > 0 ? s.taxAmount : round2(s.allocationQty * taxRate);
    if (totalAmount === s.totalAmount && taxAmount === s.taxAmount) return s;
    return { ...s, totalAmount, taxAmount };
  });

  const subById = new Map<string, DealerSuballocation>();
  for (const s of enrichedSubs) {
    if (s.id) subById.set(s.id.trim(), s);
  }

  // Deduplicate challans safely when challanNo + challanType (+ dealerAllocationId) match
  const dedupMap = new Map<string, ChallanRecord>();
  for (const c of db.challans) {
    const normChallan = normMemoNo(c.challanNo);
    const dedupKey = normChallan
      ? `${normChallan}::${c.challanType}::${normMemoNo(c.dealerAllocationId || '')}`
      : `id::${c.id}`;
    const existing = dedupMap.get(dedupKey);
    if (!existing) {
      dedupMap.set(dedupKey, c);
    } else {
      const pickNew =
        (c.recordedAmount > 0 && existing.recordedAmount <= 0) ||
        (Boolean(c.doNo) && !existing.doNo) ||
        (Boolean(c.doDate) && !existing.doDate) ||
        (Boolean(c.allocationQty) && !existing.allocationQty) ||
        (Boolean(c.dealerAllocationId) && !existing.dealerAllocationId) ||
        c.depositedAmount > existing.depositedAmount;
      if (pickNew) dedupMap.set(dedupKey, c);
    }
  }
  const uniqueChallans = Array.from(dedupMap.values());

  const pickBestDO = (
    candidates: DOIssue[],
    targetDate: string,
    targetQty: number
  ): DOIssue | undefined => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    const targetMonth = monthKey(targetDate);
    const sameMonth = targetMonth
      ? candidates.filter((d) => monthKey(d.issueDate) === targetMonth)
      : [];
    const pool = sameMonth.length > 0 ? sameMonth : candidates;
    return [...pool].sort((a, b) => {
      if (targetQty > 0) {
        const qDiffA = Math.abs((a.allocationQty || 0) - targetQty);
        const qDiffB = Math.abs((b.allocationQty || 0) - targetQty);
        if (Math.abs(qDiffA - qDiffB) > 0.01) return qDiffA - qDiffB;
      }
      return daysDiff(a.issueDate, targetDate) - daysDiff(b.issueDate, targetDate);
    })[0];
  };

  const enrichedChallans: ChallanRecord[] = uniqueChallans.map((c) => {
    const linkedSub = c.dealerAllocationId ? subById.get(c.dealerAllocationId.trim()) : undefined;
    let resolvedCat = linkedSub?.category || c.category;
    const resolvedDealer = c.dealerName || linkedSub?.dealerName || '';
    const refDate = c.challanDate || linkedSub?.unoDate || '';
    const refQty = c.allocationQty || linkedSub?.allocationQty || 0;

    let matchingDo: DOIssue | undefined =
      (c.doNo && db.doIssues.find((d) => normMemoNo(d.doNo) === normMemoNo(c.doNo))) ||
      (c.dealerAllocationId
        ? db.doIssues.find(
            (d) => d.dealerAllocationId && normMemoNo(d.dealerAllocationId) === normMemoNo(c.dealerAllocationId)
          )
        : undefined) ||
      (c.challanNo
        ? db.doIssues.find(
            (d) =>
              (c.challanType === 'মূল চালান' &&
                d.challanNo &&
                normMemoNo(d.challanNo) === normMemoNo(c.challanNo)) ||
              (c.challanType === 'আয়কর চালান' &&
                d.taxChallanNo &&
                normMemoNo(d.taxChallanNo) === normMemoNo(c.challanNo))
          )
        : undefined);

    if (!matchingDo && linkedSub) {
      const subMatched = db.doIssues.filter(
        (d) =>
          d.category === linkedSub.category &&
          namesFuzzyMatch(d.recipientName, linkedSub.dealerName)
      );
      const exactMemo = subMatched.filter(
        (d) =>
          (linkedSub.unoMemo &&
            (memosLikelyMatch(d.unoMemo, linkedSub.unoMemo) ||
              memosLikelyMatch(d.ministryMemo, linkedSub.unoMemo))) ||
          (linkedSub.sourceMemo &&
            (memosLikelyMatch(d.ministryMemo, linkedSub.sourceMemo) ||
              memosLikelyMatch(d.dcMemo, linkedSub.sourceMemo) ||
              memosLikelyMatch(d.unoMemo, linkedSub.sourceMemo)))
      );
      const subRefDate = linkedSub.unoDate || refDate;
      if (exactMemo.length > 0) {
        matchingDo = pickBestDO(exactMemo, subRefDate, refQty);
      } else {
        const refMonth = monthKey(subRefDate);
        const sameMonth = refMonth
          ? subMatched.filter((d) => monthKey(d.issueDate) === refMonth)
          : [];
        if (sameMonth.length > 0) {
          matchingDo = pickBestDO(sameMonth, subRefDate, refQty);
        } else {
          const nearby = subMatched.filter(
            (d) =>
              daysDiff(d.issueDate, subRefDate) <= 45 ||
              (c.challanDate ? daysDiff(d.issueDate, c.challanDate) <= 45 : false)
          );
          matchingDo = pickBestDO(nearby, subRefDate, refQty);
        }
      }
    }

    if (!matchingDo && resolvedDealer) {
      const catDealerMatched = db.doIssues.filter(
        (d) => d.category === resolvedCat && namesFuzzyMatch(d.recipientName, resolvedDealer)
      );
      const dealerPool =
        catDealerMatched.length > 0
          ? catDealerMatched
          : db.doIssues.filter((d) => namesFuzzyMatch(d.recipientName, resolvedDealer));

      const refMonth = monthKey(refDate);
      const sameMonth = refMonth
        ? dealerPool.filter((d) => monthKey(d.issueDate) === refMonth)
        : [];
      if (sameMonth.length > 0) {
        matchingDo = pickBestDO(sameMonth, refDate, refQty);
      } else {
        const nearby = dealerPool.filter((d) => daysDiff(d.issueDate, refDate) <= 45);
        matchingDo = pickBestDO(
          nearby.length > 0 ? nearby : dealerPool.length === 1 ? dealerPool : [],
          refDate,
          refQty
        );
      }
    }

    if (matchingDo && !linkedSub) {
      resolvedCat = matchingDo.category;
    }

    const resolvedDoNo = c.doNo || matchingDo?.doNo || undefined;
    const resolvedDoDate = c.doDate || matchingDo?.issueDate || undefined;

    if (c.recordedAmount > 0) {
      if (
        resolvedCat !== c.category ||
        resolvedDealer !== c.dealerName ||
        resolvedDoNo !== c.doNo ||
        resolvedDoDate !== c.doDate
      ) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
        };
      }
      return c;
    }

    if (linkedSub) {
      const rec =
        c.challanType === 'আয়কর চালান'
          ? linkedSub.taxAmount ||
            round2((linkedSub.allocationQty || c.allocationQty || 0) * getEffectiveTaxRate(linkedSub.category))
          : linkedSub.totalAmount ||
            round2((linkedSub.allocationQty || c.allocationQty || 0) * getEffectiveUnitPrice(linkedSub.category));
      if (rec > 0) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
          recordedAmount: round2(rec),
        };
      }
    }

    if (matchingDo) {
      const matchedSub = enrichedSubs.find(
        (s) =>
          s.category === matchingDo.category &&
          normMemoNo(s.unoMemo) === normMemoNo(matchingDo.unoMemo) &&
          namesLikelyMatch(s.dealerName, matchingDo.recipientName)
      );
      const rec =
        c.challanType === 'আয়কর চালান'
          ? matchingDo.requiredTaxAmount ||
            matchedSub?.taxAmount ||
            round2(
              (matchedSub?.allocationQty || c.allocationQty || matchingDo.allocationQty || 0) *
                getEffectiveTaxRate(matchingDo.category)
            )
          : matchingDo.requiredAmount ||
            matchedSub?.totalAmount ||
            round2(
              (matchedSub?.allocationQty || c.allocationQty || matchingDo.allocationQty || 0) *
                getEffectiveUnitPrice(matchingDo.category)
            );
      if (rec > 0) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
          recordedAmount: round2(rec),
        };
      }
    }

    const refMonth = monthKey(refDate);
    const sameCatSubs = resolvedDealer
      ? enrichedSubs.filter(
          (s) => s.category === resolvedCat && namesFuzzyMatch(s.dealerName, resolvedDealer)
        )
      : [];
    const anyCatSubs =
      resolvedDealer && sameCatSubs.length === 0
        ? enrichedSubs.filter((s) => namesFuzzyMatch(s.dealerName, resolvedDealer))
        : [];
    const dealerSubs = sameCatSubs.length > 0 ? sameCatSubs : anyCatSubs;
    const monthSub =
      (refMonth ? dealerSubs.find((s) => monthKey(s.unoDate) === refMonth) : undefined) ||
      (c.allocationQty && c.allocationQty > 0
        ? dealerSubs.find((s) => Math.abs((s.allocationQty || 0) - c.allocationQty!) < 0.02)
        : undefined) ||
      (c.depositedAmount > 0 && dealerSubs.length > 1
        ? dealerSubs.find(
            (s) =>
              (c.challanType === 'মূল চালান' && s.totalAmount > 0 && Math.abs(s.totalAmount - c.depositedAmount) <= Math.max(500, s.totalAmount * 0.05)) ||
              (c.challanType === 'আয়কর চালান' && s.taxAmount > 0 && Math.abs(s.taxAmount - c.depositedAmount) <= Math.max(50, s.taxAmount * 0.1))
          )
        : undefined);

    if (monthSub) {
      resolvedCat = monthSub.category;
      const rec =
        c.challanType === 'আয়কর চালান'
          ? monthSub.taxAmount ||
            round2((monthSub.allocationQty || c.allocationQty || 0) * getEffectiveTaxRate(monthSub.category))
          : monthSub.totalAmount ||
            round2((monthSub.allocationQty || c.allocationQty || 0) * getEffectiveUnitPrice(monthSub.category));
      if (rec > 0) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer || monthSub.dealerName,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
          recordedAmount: round2(rec),
        };
      }
    }

    // Prefer Challan sheet's own quantity if present before falling back to an arbitrary-month suballocation
    if (c.allocationQty && c.allocationQty > 0) {
      const rec =
        c.challanType === 'আয়কর চালান'
          ? round2(c.allocationQty * getEffectiveTaxRate(resolvedCat))
          : round2(c.allocationQty * getEffectiveUnitPrice(resolvedCat));
      if (rec > 0) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
          recordedAmount: rec,
        };
      }
    }

    const fallbackSub =
      dealerSubs.length === 1
        ? dealerSubs[0]
        : resolvedDealer
        ? enrichedSubs.find((s) => namesLikelyMatch(s.dealerName, resolvedDealer))
        : undefined;

    if (fallbackSub) {
      resolvedCat = fallbackSub.category;
      const rec =
        c.challanType === 'আয়কর চালান'
          ? fallbackSub.taxAmount ||
            round2((fallbackSub.allocationQty || 0) * getEffectiveTaxRate(fallbackSub.category))
          : fallbackSub.totalAmount ||
            round2((fallbackSub.allocationQty || 0) * getEffectiveUnitPrice(fallbackSub.category));
      if (rec > 0) {
        return {
          ...c,
          category: resolvedCat,
          dealerName: resolvedDealer || fallbackSub.dealerName,
          doNo: resolvedDoNo,
          doDate: resolvedDoDate,
          recordedAmount: round2(rec),
        };
      }
    }

    if (
      resolvedCat !== c.category ||
      resolvedDealer !== c.dealerName ||
      resolvedDoNo !== c.doNo ||
      resolvedDoDate !== c.doDate
    ) {
      return {
        ...c,
        category: resolvedCat,
        dealerName: resolvedDealer,
        doNo: resolvedDoNo,
        doDate: resolvedDoDate,
      };
    }
    return c;
  });

  const enrichedDos: DOIssue[] = db.doIssues.map((d) => {
    const hasMainAmt = Boolean(d.challanAmount && d.challanAmount > 0);
    const hasTaxAmt = Boolean(d.taxChallanAmount && d.taxChallanAmount > 0);
    const hasReqAmt = Boolean(d.requiredAmount && d.requiredAmount > 0);
    const hasReqTax = Boolean(d.requiredTaxAmount && d.requiredTaxAmount > 0);
    if (d.challanNo && hasMainAmt && d.taxChallanNo && hasTaxAmt && hasReqAmt && hasReqTax) {
      return d;
    }

    const doMonth = monthKey(d.issueDate);
    const findSubMatch = (c: ChallanRecord) => {
      if (d.dealerAllocationId && c.dealerAllocationId) {
        if (normMemoNo(d.dealerAllocationId) === normMemoNo(c.dealerAllocationId)) return true;
      }
      if (!c.dealerAllocationId) return false;
      const sub = subById.get(c.dealerAllocationId.trim());
      if (!sub) return false;
      if (sub.category !== d.category || !namesFuzzyMatch(sub.dealerName, d.recipientName)) {
        return false;
      }
      if (d.unoMemo && (memosLikelyMatch(sub.unoMemo, d.unoMemo) || memosLikelyMatch(sub.sourceMemo, d.unoMemo))) {
        return true;
      }
      if (d.ministryMemo && (memosLikelyMatch(sub.sourceMemo, d.ministryMemo) || memosLikelyMatch(sub.unoMemo, d.ministryMemo))) {
        return true;
      }
      if (d.dcMemo && memosLikelyMatch(sub.sourceMemo, d.dcMemo)) {
        return true;
      }
      return (
        Math.abs((sub.allocationQty || 0) - (d.allocationQty || 0)) <= 0.02 &&
        daysDiff(sub.unoDate, d.issueDate) <= 35
      );
    };

    const pickBestChallan = (type: 'মূল চালান' | 'আয়কর চালান'): ChallanRecord | undefined => {
      const targetNo = type === 'মূল চালান' ? d.challanNo : d.taxChallanNo;
      if (targetNo) {
        const byNo =
          enrichedChallans.find(
            (c) => c.challanType === type && normMemoNo(c.challanNo) === normMemoNo(targetNo)
          ) ||
          enrichedChallans.find((c) => normMemoNo(c.challanNo) === normMemoNo(targetNo));
        if (byNo) return byNo;
      }

      const byDoOrSub = enrichedChallans.find(
        (c) =>
          c.challanType === type &&
          ((c.doNo && normMemoNo(c.doNo) === normMemoNo(d.doNo)) || findSubMatch(c))
      );
      if (byDoOrSub) return byDoOrSub;

      const catPool = enrichedChallans.filter(
        (c) => c.challanType === type && c.category === d.category && namesFuzzyMatch(c.dealerName, d.recipientName)
      );
      const pool =
        catPool.length > 0
          ? catPool
          : enrichedChallans.filter(
              (c) =>
                c.challanType === type &&
                namesFuzzyMatch(c.dealerName, d.recipientName) &&
                (!c.dealerAllocationId ||
                  (d.dealerAllocationId && normMemoNo(c.dealerAllocationId) === normMemoNo(d.dealerAllocationId)))
            );
      if (pool.length === 0) return undefined;
      if (pool.length === 1) {
        const only = pool[0];
        if (
          !d.issueDate ||
          !only.challanDate ||
          daysDiff(only.challanDate, d.issueDate) <= 45 ||
          (d.allocationQty > 0 && only.allocationQty && Math.abs(only.allocationQty - d.allocationQty) <= 0.02)
        ) {
          return only;
        }
        return undefined;
      }

      const nearby = pool.filter(
        (c) =>
          (doMonth && monthKey(c.challanDate) === doMonth) ||
          daysDiff(c.challanDate, d.issueDate) <= 35
      );
      const searchPool = nearby.length > 0 ? nearby : pool;
      return [...searchPool].sort((a, b) => {
        if (d.allocationQty > 0) {
          const qa = a.allocationQty ? Math.abs(a.allocationQty - d.allocationQty) : 999;
          const qb = b.allocationQty ? Math.abs(b.allocationQty - d.allocationQty) : 999;
          if (Math.abs(qa - qb) > 0.01) return qa - qb;
        }
        return daysDiff(a.challanDate, d.issueDate) - daysDiff(b.challanDate, d.issueDate);
      })[0];
    };

    const mainMatch = pickBestChallan('মূল চালান');
    const taxMatch = pickBestChallan('আয়কর চালান');

    const resolvedReqMain =
      (d.requiredAmount && d.requiredAmount > 0 ? d.requiredAmount : undefined) ??
      (mainMatch?.recordedAmount && mainMatch.recordedAmount > 0 ? mainMatch.recordedAmount : undefined) ??
      (d.allocationQty > 0 ? round2(d.allocationQty * getEffectiveUnitPrice(d.category)) || undefined : undefined);

    const resolvedReqTax =
      (d.requiredTaxAmount && d.requiredTaxAmount > 0 ? d.requiredTaxAmount : undefined) ??
      (taxMatch?.recordedAmount && taxMatch.recordedAmount > 0 ? taxMatch.recordedAmount : undefined) ??
      (d.allocationQty > 0 ? round2(d.allocationQty * getEffectiveTaxRate(d.category)) || undefined : undefined);

    return {
      ...d,
      challanNo: d.challanNo || mainMatch?.challanNo,
      challanDate: d.challanDate || mainMatch?.challanDate,
      challanAmount: hasMainAmt ? d.challanAmount : mainMatch?.depositedAmount ?? d.challanAmount,
      taxChallanNo: d.taxChallanNo || taxMatch?.challanNo,
      taxChallanDate: d.taxChallanDate || taxMatch?.challanDate,
      taxChallanAmount: hasTaxAmt ? d.taxChallanAmount : taxMatch?.depositedAmount ?? d.taxChallanAmount,
      requiredAmount: resolvedReqMain,
      requiredTaxAmount: resolvedReqTax,
    };
  });

  const vwbMinistryMemos = db.ministryAllocations.filter((m) => m.category === 'ভিডাব্লিউভি');
  const enrichedUnoSubs: UNOSuballocation[] = db.unoSuballocations.map((u) => {
    if (u.category !== 'ভিডাব্লিউভি' || u.ministryMemo.trim()) return u;
    const fromDc = u.dcMemo.trim()
      ? vwbMinistryMemos.find((m) => memosLikelyMatch(m.memoNo, u.dcMemo))
      : undefined;
    if (fromDc) {
      return { ...u, ministryMemo: fromDc.memoNo };
    }
    if (vwbMinistryMemos.length === 1) {
      return { ...u, ministryMemo: vwbMinistryMemos[0].memoNo };
    }
    return u;
  });

  return {
    ...db,
    unoSuballocations: enrichedUnoSubs,
    dealerSuballocations: enrichedSubs,
    challans: enrichedChallans,
    doIssues: enrichedDos,
  };
}

export async function fetchAllocationFromPublicSheet(
  rawSpreadsheetId: string,
  currentDb?: AllocationDatabase
): Promise<{ db: AllocationDatabase; title: string; tabsFound: string[]; matchedTabNames: string[] }> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) throw new Error('Google Sheet ID বা লিংক দিন।');

  const { meta, gidMap } = await getPublicSpreadsheetMetadata(spreadsheetId);
  const rawTables: Partial<Record<keyof typeof ALLOC_SHEET_TABS, unknown[][]>> = {};
  const matchedTabs = new Set<keyof typeof ALLOC_SHEET_TABS>();
  const matchedTabNames: string[] = [];

  const entries = Object.entries(ALLOC_SHEET_TABS) as Array<
    [keyof typeof ALLOC_SHEET_TABS, (typeof ALLOC_SHEET_TABS)[keyof typeof ALLOC_SHEET_TABS]]
  >;

  await Promise.all(
    entries.map(async ([key, def]) => {
      const matched = findMatchingSheetTitle(meta.sheetTitles, def.name, def.aliases);
      const sheetNameToFetch = matched || (meta.sheetTitles.length === 0 ? def.name : undefined);
      if (!sheetNameToFetch) return;
      const gid = matched ? gidMap[matched] : undefined;
      const rows = await fetchPublicCsvSheet(spreadsheetId, gid, sheetNameToFetch);
      if (matched || rows.length > 0) {
        matchedTabs.add(key);
        matchedTabNames.push(sheetNameToFetch);
        rawTables[key] = rows;
      }
    })
  );

  if (matchedTabs.size === 0 && meta.sheetTitles.length > 0) {
    throw new Error(
      `"${meta.title}" শিটে বরাদ্দ/ডিও-এর কাঙ্ক্ষিত ট্যাব পাওয়া যায়নি (পাওয়া ট্যাব: ${meta.sheetTitles.slice(0, 6).join(', ')}).`
    );
  }

  return {
    db: buildAllocationDbFromRawTables(rawTables, matchedTabs, currentDb),
    title: meta.title,
    tabsFound: meta.sheetTitles,
    matchedTabNames,
  };
}

function parseChallanRowsFromTable(rows: unknown[][], workbookPreferMdy = false): ChallanRecord[] {
  const challanRows = mapRowsByHeader(rows);
  const preferMdy = detectPreferMdy(rows) || workbookPreferMdy;
  const out: ChallanRecord[] = [];

  challanRows.forEach((r, i) => {
    const dealerName = pickField(r, [
      'Dealer_Name', 'dealerName', 'dealer', 'Dealer',
      'Recipient_Name', 'recipientName', 'recipient', 'partyName', 'party', 'name',
      'ডিলার', 'ডিলারের নাম', 'প্রাপক', 'প্রাপকের নাম', 'প্রতিষ্ঠান', 'নাম',
    ]);
    const dealerAllocationId = pickField(r, [
      'dealerAllocationId', 'dealer_allocation_id', 'suballocationId', 'allocationId',
    ]);
    const note = pickField(r, ['Note', 'note', 'remarks', 'comment', 'মন্তব্য']);
    const baseCategory = normalizeCategoryName(
      pickField(r, CATEGORY_FIELD_KEYS),
      `${dealerName} ${note}`
    );
    const bankName = pickField(r, ['Bank_Name', 'bankName', 'bank', 'Bank', 'branch', 'ব্যাংক', 'ব্যাংকের নাম', 'ব্যাংক ও শাখা']);
    const doNo = pickField(r, ['DO_No', 'doNo', 'doNumber', 'ডিও নং', 'ডিও নম্বর', 'ডিও']);
    const createdAt = pickField(r, ['Created_At', 'createdAt', 'timestamp']) || new Date().toISOString();

    const mainNo = pickField(r, [
      'Challan_No', 'challanNo', 'Challan Number', 'ChallanNumber', 'Challan',
      'Main_Challan_No', 'mainChallanNo', 'trxId', 'voucherNo',
      'চালান নং', 'চালান নম্বর', 'চালান', 'মূল চালান নং', 'মূল চালান', 'ট্রেজারি চালান নং',
    ]);
    const taxNoExplicit = pickField(r, [
      'Tax_Challan_No', 'taxChallanNo', 'IncomeTaxChallanNo', 'incomeTaxChallanNo',
      'আয়কর চালান নং', 'আয়কর চালান', 'ভ্যাট/আয়কর চালান', 'ট্যাক্স চালান',
    ]);

    const mainDate = parseDateStr(
      pickField(r, ['Challan_Date', 'challanDate', 'mainChallanDate', 'date', 'Date', 'entryDate', 'timestamp', 'তারিখ', 'চালানের তারিখ', 'জমার তারিখ']),
      preferMdy
    );
    const taxDate =
      parseDateStr(
        pickField(r, [
          'Tax_Challan_Date', 'taxChallanDate', 'IncomeTaxDate', 'incomeTaxDate', 'income_tax_date',
          'আয়কর তারিখ', 'আয়কর চালানের তারিখ',
        ]),
        preferMdy
      ) || mainDate;

    const rawType = pickField(r, ['Challan_Type', 'challanType', 'type', 'Type', 'kind', 'ধরন', 'চালানের ধরন']);
    const rate = pickNum(r, ['rate', 'unitPrice', 'দর']);
    const qty = pickNum(r, ['quantity', 'qty', 'allocationQty', 'পরিমাণ']);
    const recMainRaw = pickNum(r, [
      'Recorded_Amount', 'recordedAmount', 'requiredAmount', 'payableAmount', 'targetAmount',
      'রেকর্ড অনুযায়ী টাকা', 'রেকর্ড টাকা', 'রেকর্ড', 'ধার্যকৃত টাকা', 'প্রদেয় টাকা',
    ]);
    const recMain = recMainRaw > 0 ? recMainRaw : rate > 0 && qty > 0 ? round2(rate * qty) : 0;

    const depMain = pickNum(r, [
      'Deposited_Amount', 'depositedAmount', 'paidAmount', 'depositAmount', 'challanAmount',
      'amount', 'Amount', 'totalAmount', 'মূল চালান টাকা', 'জমাকৃত টাকা', 'জমার পরিমাণ', 'জমা', 'মোট টাকা', 'টাকা',
    ]);

    const recTax = pickNum(r, ['Required_Tax_Amount', 'requiredTaxAmount', 'recordedTaxAmount', 'রেকর্ড আয়কর']);
    const depTax = pickNum(r, [
      'Tax_Challan_Amount', 'taxChallanAmount', 'IncomeTaxAmount', 'incomeTaxAmount', 'income_tax_amount',
      'taxAmount', 'depositedTaxAmount', 'আয়কর টাকা', 'আয়করের পরিমাণ',
    ]);

    const parsedQty = qty > 0 ? round3(qty) : undefined;

    // Case A: Row has BOTH explicit main + tax challan columns -> split cleanly into 2 records
    if (taxNoExplicit && (mainNo || depMain > 0)) {
      if (mainNo || dealerName || dealerAllocationId) {
        out.push({
          id: pickField(r, ['ID', 'id']) || `ch-ext-m-${i}-${uid('c')}`,
          challanNo: mainNo,
          challanDate: mainDate,
          category: baseCategory,
          dealerName,
          dealerAllocationId: dealerAllocationId || undefined,
          challanType: 'মূল চালান',
          bankName,
          doNo,
          allocationQty: parsedQty,
          recordedAmount: recMain,
          depositedAmount: depMain,
          note,
          createdAt,
        });
      }
      out.push({
        id: `ch-ext-t-${i}-${uid('t')}`,
        challanNo: taxNoExplicit,
        challanDate: taxDate,
        category: baseCategory,
        dealerName,
        dealerAllocationId: dealerAllocationId || undefined,
        challanType: 'আয়কর চালান',
        bankName,
        doNo,
        allocationQty: parsedQty,
        recordedAmount: recTax,
        depositedAmount: depTax,
        note,
        createdAt,
      });
      return;
    }

    // Case B: Single challan per row
    const finalNo = mainNo || taxNoExplicit;
    if (!finalNo && !dealerName && !dealerAllocationId) return;
    const isTax =
      rawType.includes('আয়কর') ||
      rawType.toLowerCase().includes('tax') ||
      rawType.toLowerCase().includes('vat') ||
      (!mainNo && Boolean(taxNoExplicit));

    out.push({
      id: pickField(r, ['ID', 'id']) || `ch-ext-${i}-${uid('c')}`,
      challanNo: finalNo,
      challanDate: isTax ? taxDate : mainDate,
      category: baseCategory,
      dealerName,
      dealerAllocationId: dealerAllocationId || undefined,
      challanType: isTax ? 'আয়কর চালান' : 'মূল চালান',
      bankName,
      doNo,
      allocationQty: parsedQty,
      recordedAmount: isTax ? recTax || recMain : recMain,
      depositedAmount: isTax ? depTax || depMain : depMain,
      note,
      createdAt,
    });
  });

  return out;
}

export async function fetchExternalChallansFromSheet(
  rawSpreadsheetId: string,
  accessToken?: string | null
): Promise<{ challans: ChallanRecord[]; title: string; tabUsed?: string }> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) throw new Error('চালান Google Sheet ID বা লিংক দিন।');

  if (accessToken) {
    const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
    const primaryMatch = findMatchingSheetTitle(
      meta.sheetTitles,
      ALLOC_SHEET_TABS.challans.name,
      ALLOC_SHEET_TABS.challans.aliases
    );
    const candidates = primaryMatch
      ? [primaryMatch, ...meta.sheetTitles.filter((t) => t !== primaryMatch)]
      : meta.sheetTitles;

    for (const tab of candidates.slice(0, 6)) {
      const escaped = tab.replace(/'/g, "''");
      const resp = await googleFetch<{ valueRanges?: Array<{ values?: unknown[][] }> }>(
        `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?ranges=${encodeURIComponent(`'${escaped}'!A1:Z`)}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
        accessToken
      );
      const parsed = parseChallanRowsFromTable(resp.valueRanges?.[0]?.values || []);
      if (parsed.length > 0) {
        return { challans: parsed, title: meta.title, tabUsed: tab };
      }
    }
    return { challans: [], title: meta.title };
  }

  const { meta, gidMap } = await getPublicSpreadsheetMetadata(spreadsheetId);
  const primaryMatch = findMatchingSheetTitle(
    meta.sheetTitles,
    ALLOC_SHEET_TABS.challans.name,
    ALLOC_SHEET_TABS.challans.aliases
  );
  const candidates =
    meta.sheetTitles.length > 0
      ? primaryMatch
        ? [primaryMatch, ...meta.sheetTitles.filter((t) => t !== primaryMatch)]
        : meta.sheetTitles
      : [ALLOC_SHEET_TABS.challans.name, 'Challan', 'Sheet1', 'Form Responses 1'];

  for (const tab of candidates.slice(0, 6)) {
    const rows = await fetchPublicCsvSheet(spreadsheetId, gidMap[tab], tab);
    const parsed = parseChallanRowsFromTable(rows);
    if (parsed.length > 0) {
      return { challans: parsed, title: meta.title, tabUsed: tab };
    }
  }
  return { challans: [], title: meta.title };
}

export async function fetchExternalChallansFromAppsScript(
  rawUrl: string
): Promise<{ challans: ChallanRecord[]; sourceUrl: string }> {
  const url = rawUrl.trim();
  if (!url) throw new Error('চালান ওয়েব অ্যাপ URL দিন।');

  const isNativeOrLocal =
    typeof window !== 'undefined' &&
    window.location.protocol === 'file:';

  let json: unknown = null;
  if (!isNativeOrLocal) {
    const resp = await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, action: 'getAppData' }),
    });
    const body = (await resp.json()) as { ok?: boolean; data?: unknown; error?: string };
    if (!body?.ok) {
      throw new Error(body?.error || 'চালান Apps Script থেকে ডেটা পাওয়া যায়নি।');
    }
    json = body.data;
  } else {
    const u = new URL(url);
    u.searchParams.set('api', '1');
    u.searchParams.set('action', 'getAppData');
    const resp = await fetch(u.toString());
    json = await resp.json();
  }

  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const rawList = Array.isArray(json)
    ? json
    : Array.isArray(root.challans)
      ? root.challans
      : Array.isArray(root.data)
        ? root.data
        : Array.isArray(root.rows)
          ? root.rows
          : [];

  if (rawList.length === 0) {
    return { challans: [], sourceUrl: url };
  }

  let table: unknown[][];
  if (Array.isArray(rawList[0])) {
    table = rawList as unknown[][];
  } else {
    const firstObj = rawList[0] as Record<string, unknown>;
    const headers = Object.keys(firstObj);
    table = [
      headers,
      ...rawList.map((item) => {
        const obj = (item || {}) as Record<string, unknown>;
        return headers.map((h) => obj[h] ?? '');
      }),
    ];
  }

  return {
    challans: parseChallanRowsFromTable(table),
    sourceUrl: url,
  };
}

export async function fetchAllocationFromOAuthSheet(
  accessToken: string,
  rawSpreadsheetId: string,
  currentDb?: AllocationDatabase
): Promise<{ db: AllocationDatabase; title: string; tabsFound: string[]; matchedTabNames: string[] }> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) throw new Error('Google Sheet ID বা লিংক দিন।');

  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const entries = Object.entries(ALLOC_SHEET_TABS) as Array<
    [keyof typeof ALLOC_SHEET_TABS, (typeof ALLOC_SHEET_TABS)[keyof typeof ALLOC_SHEET_TABS]]
  >;

  const matchedMap = new Map<keyof typeof ALLOC_SHEET_TABS, string>();
  const matchedTabs = new Set<keyof typeof ALLOC_SHEET_TABS>();
  const matchedTabNames: string[] = [];
  const ranges: string[] = [];
  for (const [key, def] of entries) {
    const matched = findMatchingSheetTitle(meta.sheetTitles, def.name, def.aliases);
    if (matched) {
      matchedMap.set(key, matched);
      matchedTabs.add(key);
      matchedTabNames.push(matched);
      const escaped = matched.replace(/'/g, "''");
      ranges.push(`'${escaped}'!A1:Z`);
    }
  }

  if (matchedTabs.size === 0 && meta.sheetTitles.length > 0) {
    throw new Error(
      `"${meta.title}" শিটে বরাদ্দ/ডিও-এর কাঙ্ক্ষিত ট্যাব পাওয়া যায়নি (পাওয়া ট্যাব: ${meta.sheetTitles.slice(0, 6).join(', ')}).`
    );
  }

  const rawTables: Partial<Record<keyof typeof ALLOC_SHEET_TABS, unknown[][]>> = {};
  if (ranges.length > 0) {
    const params = new URLSearchParams();
    ranges.forEach((r) => params.append('ranges', r));
    params.set('majorDimension', 'ROWS');
    params.set('valueRenderOption', 'UNFORMATTED_VALUE');
    const resp = await googleFetch<{ valueRanges?: Array<{ values?: unknown[][] }> }>(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
      accessToken
    );
    const matchedKeys = Array.from(matchedMap.keys());
    (resp.valueRanges || []).forEach((vr, idx) => {
      const k = matchedKeys[idx];
      if (k) rawTables[k] = vr.values || [];
    });
  }

  return {
    db: buildAllocationDbFromRawTables(rawTables, matchedTabs, currentDb),
    title: meta.title,
    tabsFound: meta.sheetTitles,
    matchedTabNames,
  };
}

export async function autoDetectAllocationSpreadsheets(accessToken: string): Promise<{
  files: DriveSpreadsheetFile[];
  main?: { file: DriveSpreadsheetFile; meta: SpreadsheetMetadata };
  challan?: { file: DriveSpreadsheetFile; meta: SpreadsheetMetadata };
}> {
  const files = await listUserSpreadsheets(accessToken);
  let main: { file: DriveSpreadsheetFile; meta: SpreadsheetMetadata } | undefined;
  let challan: { file: DriveSpreadsheetFile; meta: SpreadsheetMetadata } | undefined;

  const sample = files.slice(0, 15);
  for (let i = 0; i < sample.length; i += 5) {
    const chunk = sample.slice(i, i + 5);
    const metas = await Promise.all(
      chunk.map(async (file) => {
        try {
          const meta = await getSpreadsheetMetadata(accessToken, file.id);
          return { file, meta };
        } catch {
          return null;
        }
      })
    );
    for (const item of metas) {
      if (!item) continue;
      const titles = item.meta.sheetTitles;
      const hasMin = Boolean(findMatchingSheetTitle(titles, ALLOC_SHEET_TABS.ministry.name, ALLOC_SHEET_TABS.ministry.aliases));
      const hasSub = Boolean(findMatchingSheetTitle(titles, ALLOC_SHEET_TABS.dealerSub.name, ALLOC_SHEET_TABS.dealerSub.aliases));
      const hasDo = Boolean(findMatchingSheetTitle(titles, ALLOC_SHEET_TABS.doIssue.name, ALLOC_SHEET_TABS.doIssue.aliases));
      const hasChallan = Boolean(findMatchingSheetTitle(titles, ALLOC_SHEET_TABS.challans.name, ALLOC_SHEET_TABS.challans.aliases));
      const looksChallanOnly = hasChallan && !hasMin && !hasSub && !hasDo;

      if (!main && (hasMin || hasSub || hasDo)) {
        main = item;
      }
      if (!challan && (looksChallanOnly || (hasChallan && item.file.id !== main?.file.id))) {
        challan = item;
      }
    }
    if (main && challan) break;
  }

  return { files, main, challan };
}

export async function writeAllocationDatabaseToOAuthSheet(
  accessToken: string,
  rawSpreadsheetId: string,
  db: AllocationDatabase
): Promise<{ ok: boolean; tabsUpdated: number }> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) throw new Error('Google Sheet ID নির্বাচন করুন।');

  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const existing = new Set(meta.sheetTitles);

  const missingTabs = Object.values(ALLOC_SHEET_TABS)
    .map((d) => d.name)
    .filter((name) => !existing.has(name));

  if (missingTabs.length > 0) {
    await googleFetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
  }

  const payloads: Array<{ name: string; rows: Array<Array<string | number>> }> = [
    {
      name: ALLOC_SHEET_TABS.ministry.name,
      rows: [
        [...ALLOC_SHEET_TABS.ministry.headers],
        ...db.ministryAllocations.map((r) => [
          r.id,
          r.category,
          r.memoNo,
          r.memoDate,
          r.allocationQty,
          r.grain,
          r.phase ?? '',
          r.comment ?? '',
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.dc.name,
      rows: [
        [...ALLOC_SHEET_TABS.dc.headers],
        ...db.dcAllocations.map((r) => [
          r.id,
          r.category,
          r.ministryMemo,
          r.dcMemo,
          r.dcMemoDate,
          r.allocationQty,
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.dealerSub.name,
      rows: [
        [...ALLOC_SHEET_TABS.dealerSub.headers],
        ...db.dealerSuballocations.map((r) => [
          r.id,
          r.category,
          r.sourceMemo,
          r.unoMemo,
          r.unoDate,
          r.dealerName,
          r.unionName,
          r.salesCenter,
          r.cardCount,
          r.unusedCards,
          r.allocationQty,
          r.totalAmount,
          r.taxAmount,
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.projects.name,
      rows: [
        [...ALLOC_SHEET_TABS.projects.headers],
        ...db.projects.map((r) => [
          r.id,
          r.category,
          r.dcMemo,
          r.projectNo,
          r.projectName,
          r.presidentName,
          r.unionName,
          r.allocationQty,
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.unoSub.name,
      rows: [
        [...ALLOC_SHEET_TABS.unoSub.headers],
        ...db.unoSuballocations.map((r) => [
          r.id,
          r.category,
          r.ministryMemo,
          r.dcMemo,
          r.unoMemo,
          r.unoDate,
          r.unionName,
          r.recipientName,
          r.projectNo ?? '',
          r.projectName ?? '',
          r.allocationQty,
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.doBooks.name,
      rows: [
        [...ALLOC_SHEET_TABS.doBooks.headers],
        ...db.doBooks.map((r) => [
          r.id,
          r.bookNo,
          r.startPage,
          r.endPage,
          r.totalCount,
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.doIssue.name,
      rows: [
        [...ALLOC_SHEET_TABS.doIssue.headers],
        ...db.doIssues.map((r) => [
          r.doNo,
          r.issueDate,
          r.category,
          r.unionName,
          r.recipientName,
          r.salesCenter ?? '',
          r.allocationQty,
          r.ministryMemo,
          r.dcMemo,
          r.unoMemo,
          r.projectNo ?? '',
          r.challanNo ?? '',
          r.challanDate ?? '',
          r.challanAmount ?? '',
          r.taxChallanNo ?? '',
          r.taxChallanDate ?? '',
          r.taxChallanAmount ?? '',
          r.requiredAmount ?? '',
          r.requiredTaxAmount ?? '',
          r.createdAt,
          r.id,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.challans.name,
      rows: [
        [...ALLOC_SHEET_TABS.challans.headers],
        ...db.challans.map((r) => [
          r.id,
          r.challanNo,
          r.challanDate,
          r.category,
          r.dealerName,
          r.challanType,
          r.bankName,
          r.doNo ?? '',
          r.recordedAmount,
          r.depositedAmount,
          r.note ?? '',
          r.createdAt,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.foodDealers.name,
      rows: [
        [...ALLOC_SHEET_TABS.foodDealers.headers],
        ...db.foodDealers.map((r) => [
          r.id,
          r.dealerName,
          r.fatherName,
          r.nid,
          r.mobile,
          r.unionName,
          r.salesCenter,
          r.cardCount,
          r.totalQty,
          r.poNo,
          r.poDate,
          r.bankName,
          r.amount,
          r.supervisorName,
          r.supervisorDesignation,
          r.supervisorMobile,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.omsDealers.name,
      rows: [
        [...ALLOC_SHEET_TABS.omsDealers.headers],
        ...db.omsDealers.map((r) => [
          r.id,
          r.dealerName,
          r.fatherName,
          r.nid,
          r.mobile,
          r.areaType,
          r.unionName,
          r.municipality,
          r.salesCenter,
          r.poNo,
          r.poDate,
          r.bankName,
          r.amount,
          r.supervisorName,
          r.supervisorDesignation,
          r.supervisorMobile,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.chairmen.name,
      rows: [
        [...ALLOC_SHEET_TABS.chairmen.headers],
        ...db.chairmen.map((r) => [
          r.id,
          r.unionName,
          r.chairmanName,
          r.mobile,
          r.supervisorName,
          r.supervisorMobile,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.fireServices.name,
      rows: [
        [...ALLOC_SHEET_TABS.fireServices.headers],
        ...db.fireServices.map((r) => [
          r.id,
          r.officeName,
          r.divisionName,
          r.riceRate,
          r.wheatRate,
        ]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.rates.name,
      rows: [
        [...ALLOC_SHEET_TABS.rates.headers],
        ...db.rates.map((r) => [r.id, r.category, r.unitPrice, r.taxRate]),
      ],
    },
    {
      name: ALLOC_SHEET_TABS.settings.name,
      rows: [
        [...ALLOC_SHEET_TABS.settings.headers],
        ['officer', JSON.stringify(db.officer)],
        ['templates', JSON.stringify(db.templates)],
      ],
    },
  ];

  await googleFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: payloads.map((p) => `'${p.name}'!A1:Z`),
      }),
    }
  );

  await googleFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: payloads.map((p) => ({
          range: `'${p.name}'!A1`,
          values: p.rows,
        })),
      }),
    }
  );

  return { ok: true, tabsUpdated: payloads.length };
}

export { uid };
