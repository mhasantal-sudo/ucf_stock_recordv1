import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CATEGORY_BY_NAME,
  CHALLAN_CATEGORIES,
  DEFAULT_OFFICER_PROFILE,
  createDefaultTemplate,
  createDefaultTemplatesMap,
  REPORT_TEMPLATE_CATALOG,
  type AllocationCategory,
  type AllocationDatabase,
  type AllocationSheetsConfig,
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
  type OfficerProfileSettings,
  type ProjectEntry,
  type ReportTemplateConfig,
  type ReportTemplateId,
  type UNOSuballocation,
} from '../types/allocation';
import type { DriveSpreadsheetFile } from '../types/grain';
import { createEmptyAllocationDatabase } from '../shared/allocSampleData';
import {
  autoDetectAllocationSpreadsheets,
  fetchAllocationFromOAuthSheet,
  fetchAllocationFromPublicSheet,
  fetchExternalChallansFromAppsScript,
  fetchExternalChallansFromSheet,
  reconcileChallansAndDOs,
  writeAllocationDatabaseToOAuthSheet,
} from '../shared/allocSheetsSync';
import { getUnusedDoNumbers } from '../shared/allocReportEngine';
import { triggerBlobDownload } from '../shared/downloadUtils';
import {
  bnToEnDigits,
  fiscalYearLabel,
  memosLikelyMatch,
  namesFuzzyMatch,
  namesLikelyMatch,
  normMemoNo,
  parseMonthYear,
  round2,
  round3,
  toBnDigits,
  uid,
} from '../shared/bnUtils';
import {
  clearGoogleAccessToken,
  getGoogleAccessToken,
  googleLogout,
  googleSignIn,
  initGoogleAuth,
} from '../shared/googleAuth';
import { extractSpreadsheetId, GoogleAuthExpiredError } from '../shared/googleSheetsSync';

const STORAGE_DB_KEY = 'khaddo_boraddo_db_v1';
const STORAGE_SHEETS_KEY = 'khaddo_boraddo_sheets_v1';
const LEGACY_GRAIN_SHEETS_KEY = 'khaddo_stock_gsheets_config_v1';
const PORTRAIT_MIGRATION_KEY = 'khaddo_boraddo_portrait_migrated_v1';
const PURGE_SAMPLE_MIGRATION_KEY = 'khaddo_boraddo_purge_sample_v1';
const CLEAN_TITLES_MIGRATION_KEY = 'khaddo_boraddo_clean_titles_v1';
const MONTHLY_NO_COPY_MIGRATION_KEY = 'khaddo_boraddo_monthly_no_copy_v1';
const CHALLAN_SIGN_EQUAL_MIGRATION_KEY = 'khaddo_boraddo_challan_sign_equal_v1';

const SAMPLE_ID_PREFIXES = new Set([
  'min-1', 'min-2', 'min-3', 'min-4', 'min-5',
  'dc-1', 'dc-2',
  'ds-1', 'ds-2', 'ds-3', 'ds-4', 'ds-5',
  'prj-1', 'prj-2',
  'uno-1', 'uno-2', 'uno-3',
  'book-1',
  'chln-1', 'chln-2', 'chln-3', 'chln-4',
  'do-1', 'do-2', 'do-3', 'do-4', 'do-5', 'do-6',
  'fd-1', 'fd-2', 'fd-3', 'fd-4',
  'od-1', 'od-2',
  'ch-1', 'ch-2', 'ch-3', 'ch-4',
  'fs-1',
  'rt-1', 'rt-2', 'rt-3', 'rt-4', 'rt-5', 'rt-6',
]);

const SAMPLE_REPORT_MEMO_KEYS = new Set([
  'allocFood|2026-11',
  'monthly-dist|2026-11',
  'monthly-cash|2026-11',
  'monthly-ep|2026-11',
]);

function stripSampleIds<T extends { id: string }>(arr: T[] | undefined): T[] {
  return (arr || []).filter((item) => !SAMPLE_ID_PREFIXES.has(item.id));
}

function loadInitialDatabase(): AllocationDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AllocationDatabase>;
      const emptyBase = createEmptyAllocationDatabase();
      const officer: OfficerProfileSettings = {
        ...DEFAULT_OFFICER_PROFILE,
        ...(parsed.officer || {}),
      };
      const defaultTpls = createDefaultTemplatesMap(officer);
      const mergedTemplates = { ...defaultTpls };
      for (const item of REPORT_TEMPLATE_CATALOG) {
        if (parsed.templates?.[item.id]) {
          mergedTemplates[item.id] = {
            ...defaultTpls[item.id],
            ...parsed.templates[item.id],
          };
        }
      }

      if (localStorage.getItem(PORTRAIT_MIGRATION_KEY) !== '1') {
        mergedTemplates['monthly-dist'] = {
          ...mergedTemplates['monthly-dist'],
          orientation: 'portrait',
          fontSizePt: mergedTemplates['monthly-dist'].fontSizePt < 9 ? 9.5 : mergedTemplates['monthly-dist'].fontSizePt,
        };
        localStorage.setItem(PORTRAIT_MIGRATION_KEY, '1');
      }

      if (localStorage.getItem(CLEAN_TITLES_MIGRATION_KEY) !== '1') {
        const cleanMonthly = (id: 'monthly-dist' | 'monthly-cash' | 'monthly-ep', cleanLabel: string) => {
          mergedTemplates[id] = {
            ...mergedTemplates[id],
            label: cleanLabel,
            reportTitle: (mergedTemplates[id].reportTitle || cleanLabel).replace(/\s*\(৩\.[১২৩]\)\s*/g, '').trim() || cleanLabel,
          };
        };
        cleanMonthly('monthly-dist', 'মাসিক বিতরণ রিপোর্ট');
        cleanMonthly('monthly-cash', 'নগদ বিক্রয় রিপোর্ট');
        cleanMonthly('monthly-ep', 'ইপি রেশন রিপোর্ট');
        localStorage.setItem(CLEAN_TITLES_MIGRATION_KEY, '1');
      }

      if (localStorage.getItem(MONTHLY_NO_COPY_MIGRATION_KEY) !== '1') {
        (['monthly-dist', 'monthly-cash', 'monthly-ep'] as const).forEach((id) => {
          mergedTemplates[id] = {
            ...mergedTemplates[id],
            showCopyBlock: false,
          };
        });
        localStorage.setItem(MONTHLY_NO_COPY_MIGRATION_KEY, '1');
      }

      if (localStorage.getItem(CHALLAN_SIGN_EQUAL_MIGRATION_KEY) !== '1') {
        mergedTemplates['reg-challan'] = {
          ...mergedTemplates['reg-challan'],
          challanSignRule: 'excess_or_equal',
        };
        localStorage.setItem(CHALLAN_SIGN_EQUAL_MIGRATION_KEY, '1');
      }

      let dbObj: AllocationDatabase = {
        ...emptyBase,
        ...parsed,
        officer,
        templates: mergedTemplates,
      };

      if (localStorage.getItem(PURGE_SAMPLE_MIGRATION_KEY) !== '1') {
        const cleanedMemos: Record<string, { no: string; date: string }> = {};
        for (const [k, v] of Object.entries(dbObj.reportMemos || {})) {
          if (!SAMPLE_REPORT_MEMO_KEYS.has(k)) cleanedMemos[k] = v;
        }
        dbObj = {
          ...dbObj,
          ministryAllocations: stripSampleIds(dbObj.ministryAllocations),
          dcAllocations: stripSampleIds(dbObj.dcAllocations),
          dealerSuballocations: stripSampleIds(dbObj.dealerSuballocations),
          projects: stripSampleIds(dbObj.projects),
          unoSuballocations: stripSampleIds(dbObj.unoSuballocations),
          doBooks: stripSampleIds(dbObj.doBooks),
          doIssues: stripSampleIds(dbObj.doIssues),
          challans: stripSampleIds(dbObj.challans),
          foodDealers: stripSampleIds(dbObj.foodDealers),
          omsDealers: stripSampleIds(dbObj.omsDealers),
          chairmen: stripSampleIds(dbObj.chairmen),
          fireServices: stripSampleIds(dbObj.fireServices),
          rates: stripSampleIds(dbObj.rates),
          reportMemos: cleanedMemos,
        };
        localStorage.setItem(PURGE_SAMPLE_MIGRATION_KEY, '1');
      }

      return reconcileChallansAndDOs(dbObj);
    }
  } catch {
    // ignore storage parse failure
  }
  const initial = createEmptyAllocationDatabase();
  try {
    localStorage.setItem(PORTRAIT_MIGRATION_KEY, '1');
    localStorage.setItem(CLEAN_TITLES_MIGRATION_KEY, '1');
    localStorage.setItem(PURGE_SAMPLE_MIGRATION_KEY, '1');
    localStorage.setItem(MONTHLY_NO_COPY_MIGRATION_KEY, '1');
    localStorage.setItem(CHALLAN_SIGN_EQUAL_MIGRATION_KEY, '1');
    localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(initial));
  } catch {
    // ignore quota error
  }
  return initial;
}

function loadInitialSheetsConfig(): AllocationSheetsConfig {
  const defaults: AllocationSheetsConfig = {
    enabled: true,
    spreadsheetId: '',
    spreadsheetName: '',
    challanSpreadsheetId: '',
    challanSpreadsheetName: '',
    challanAppsScriptUrl: '',
    appsScriptUrl: '',
    apiSecret: '',
    autoSync: true,
    lastSyncStatus: 'idle',
  };

  let parsed: Partial<AllocationSheetsConfig> | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_SHEETS_KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<AllocationSheetsConfig>;
  } catch {
    // ignore
  }

  let legacySpreadsheetId = '';
  let legacySpreadsheetName = '';
  let legacyChallanId = '';
  let legacyChallanName = '';
  let legacyAppsScriptUrl = '';
  try {
    const legacyRaw = localStorage.getItem(LEGACY_GRAIN_SHEETS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
      const extDoId = extractSpreadsheetId(String(legacy.externalDoSpreadsheetId || ''));
      const mainId = extractSpreadsheetId(String(legacy.spreadsheetId || ''));
      if (extDoId) {
        legacySpreadsheetId = extDoId;
        legacySpreadsheetName = String(legacy.externalDoSpreadsheetName || '');
      } else if (mainId) {
        legacySpreadsheetId = mainId;
        legacySpreadsheetName = String(legacy.spreadsheetName || '');
      }
      if (extDoId && mainId && extDoId !== mainId) {
        legacyChallanId = mainId;
        legacyChallanName = String(legacy.spreadsheetName || '');
      }
      legacyAppsScriptUrl = String(legacy.appsScriptUrl || '');
    }
  } catch {
    // ignore
  }

  return {
    ...defaults,
    ...(parsed || {}),
    spreadsheetId: parsed?.spreadsheetId || legacySpreadsheetId,
    spreadsheetName: parsed?.spreadsheetName || legacySpreadsheetName,
    challanSpreadsheetId: parsed?.challanSpreadsheetId || legacyChallanId,
    challanSpreadsheetName: parsed?.challanSpreadsheetName || legacyChallanName,
    appsScriptUrl: parsed?.appsScriptUrl || legacyAppsScriptUrl,
    autoSync: parsed?.autoSync ?? true,
  };
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export function useAllocationStore() {
  const [db, setDb] = useState<AllocationDatabase>(loadInitialDatabase);
  const [sheetsConfig, setSheetsConfig] = useState<AllocationSheetsConfig>(loadInitialSheetsConfig);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() =>
    getGoogleAccessToken()
  );
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);

  const dbRef = useRef(db);
  const sheetsConfigRef = useRef(sheetsConfig);
  const tokenRef = useRef(googleAccessToken);
  const initialAutoSyncDoneRef = useRef(false);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    sheetsConfigRef.current = sheetsConfig;
  }, [sheetsConfig]);

  useEffect(() => {
    tokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(db));
    } catch {
      // ignore storage quota errors
    }
  }, [db]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SHEETS_KEY, JSON.stringify(sheetsConfig));
    } catch {
      // ignore storage quota errors
    }
  }, [sheetsConfig]);

  useEffect(() => {
    const unsub = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('khaddo_boraddo_seed_loaded') === '1') return;
    fetch('/web-seed.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((seed) => {
        if (!seed || typeof seed !== 'object') return;
        if (seed.db && typeof seed.db === 'object') {
          setDb((prev) => ({ ...prev, ...seed.db }));
        }
        if (seed.sheetsConfig && typeof seed.sheetsConfig === 'object') {
          setSheetsConfig((prev) => ({ ...prev, ...seed.sheetsConfig }));
        }
        localStorage.setItem('khaddo_boraddo_seed_loaded', '1');
      })
      .catch(() => {
        // optional
      });
  }, []);

  const usageIndex = useMemo(() => {
    const minById = new Map<string, { total: number; used: number; remaining: number }>();
    const dcById = new Map<string, { total: number; used: number; remaining: number }>();

    const fyKeyOf = (dateStr?: string): string => {
      const parsed = dateStr ? parseMonthYear(dateStr) : null;
      return parsed ? fiscalYearLabel(parsed.year, parsed.month) : '';
    };

    const allocatePool = <T extends { id: string; allocationQty: number }>(
      upstreams: Array<{ rec: T; date: string }>,
      downstreams: Array<{ memoKey: string; qty: number; date: string }>,
      getUpstreamMemo: (r: T) => string,
      outMap: Map<string, { total: number; used: number; remaining: number }>
    ) => {
      const directUsed = new Map<string, number>();
      const unlinked: Array<{ qty: number; date: string }> = [];

      for (const item of downstreams) {
        if (item.qty <= 0) continue;
        const key = (item.memoKey || '').trim();
        let matched: T | undefined;
        if (key) {
          const nk = normMemoNo(key);
          matched =
            upstreams.find((u) => normMemoNo(getUpstreamMemo(u.rec)) === nk)?.rec ||
            upstreams.find((u) => memosLikelyMatch(getUpstreamMemo(u.rec), key))?.rec;
        }
        if (matched) {
          directUsed.set(matched.id, round3((directUsed.get(matched.id) || 0) + item.qty));
        } else {
          unlinked.push({ qty: item.qty, date: item.date });
        }
      }

      const sortedUpstreams = [...upstreams].sort((a, b) =>
        (a.date || '').localeCompare(b.date || '')
      );
      const remCap = new Map<string, number>();
      const fifoUsed = new Map<string, number>();
      for (const u of sortedUpstreams) {
        const total = Number(u.rec.allocationQty) || 0;
        const used = directUsed.get(u.rec.id) || 0;
        remCap.set(u.rec.id, Math.max(0, round3(total - used)));
        fifoUsed.set(u.rec.id, 0);
      }

      for (const item of unlinked) {
        let left = item.qty;
        const itemFy = fyKeyOf(item.date);
        const passList = itemFy
          ? [
              sortedUpstreams.filter((u) => {
                const uFy = fyKeyOf(u.date);
                return !uFy || uFy === itemFy;
              }),
              sortedUpstreams,
            ]
          : [sortedUpstreams];

        for (const candidates of passList) {
          if (left <= 0.0005) break;
          for (const u of candidates) {
            if (left <= 0.0005) break;
            const cap = remCap.get(u.rec.id) || 0;
            if (cap <= 0.0005) continue;
            const take = Math.min(cap, left);
            remCap.set(u.rec.id, round3(cap - take));
            fifoUsed.set(u.rec.id, round3((fifoUsed.get(u.rec.id) || 0) + take));
            left = round3(left - take);
          }
        }
      }

      for (const u of upstreams) {
        const total = round3(Number(u.rec.allocationQty) || 0);
        const used = round3((directUsed.get(u.rec.id) || 0) + (fifoUsed.get(u.rec.id) || 0));
        outMap.set(u.rec.id, {
          total,
          used,
          remaining: round3(total - used),
        });
      }
    };

    const categories = new Set<AllocationCategory>([
      ...db.ministryAllocations.map((m) => m.category),
      ...db.dcAllocations.map((d) => d.category),
    ]);

    for (const category of categories) {
      const meta = CATEGORY_BY_NAME[category];
      if (!meta) continue;

      const mins = db.ministryAllocations
        .filter((m) => m.category === category)
        .map((rec) => ({ rec, date: rec.memoDate || rec.createdAt }));

      const minDownstreams = meta.requiresDC
        ? db.dcAllocations
            .filter((d) => d.category === category)
            .map((d) => ({
              memoKey: d.ministryMemo,
              qty: Number(d.allocationQty) || 0,
              date: d.dcMemoDate || d.createdAt,
            }))
        : meta.flowType === 'vwb'
          ? db.unoSuballocations
              .filter((u) => u.category === category)
              .map((u) => ({
                memoKey: u.ministryMemo || u.dcMemo,
                qty: Number(u.allocationQty) || 0,
                date: u.unoDate || u.createdAt,
              }))
          : db.dealerSuballocations
              .filter((s) => s.category === category)
              .map((s) => ({
                memoKey: s.sourceMemo,
                qty: Number(s.allocationQty) || 0,
                date: s.unoDate || s.createdAt,
              }));

      allocatePool(mins, minDownstreams, (m) => m.memoNo, minById);

      const dcs = db.dcAllocations
        .filter((d) => d.category === category)
        .map((rec) => ({ rec, date: rec.dcMemoDate || rec.createdAt }));

      const dcDownstreams =
        meta.flowType === 'dealer_oms'
          ? db.dealerSuballocations
              .filter((s) => s.category === category)
              .map((s) => ({
                memoKey: s.sourceMemo,
                qty: Number(s.allocationQty) || 0,
                date: s.unoDate || s.createdAt,
              }))
          : db.unoSuballocations
              .filter((u) => u.category === category)
              .map((u) => ({
                memoKey: u.dcMemo,
                qty: Number(u.allocationQty) || 0,
                date: u.unoDate || u.createdAt,
              }));

      allocatePool(dcs, dcDownstreams, (d) => d.dcMemo, dcById);
    }

    return { minById, dcById };
  }, [db.ministryAllocations, db.dcAllocations, db.unoSuballocations, db.dealerSuballocations]);

  const getMinistryUsage = useCallback(
    (category: AllocationCategory, memoNo: string) => {
      const target = (memoNo || '').trim();
      const normTarget = normMemoNo(target);
      const minRec =
        db.ministryAllocations.find((m) => m.category === category && m.memoNo === memoNo) ||
        (normTarget
          ? db.ministryAllocations.find(
              (m) => m.category === category && normMemoNo(m.memoNo) === normTarget
            ) ||
            db.ministryAllocations.find(
              (m) => m.category === category && memosLikelyMatch(m.memoNo, target)
            )
          : undefined);
      if (!minRec) return { total: 0, used: 0, remaining: 0 };
      return usageIndex.minById.get(minRec.id) || {
        total: round3(Number(minRec.allocationQty) || 0),
        used: 0,
        remaining: round3(Number(minRec.allocationQty) || 0),
      };
    },
    [db.ministryAllocations, usageIndex]
  );

  const getDCUsage = useCallback(
    (category: AllocationCategory, dcMemo: string) => {
      const target = (dcMemo || '').trim();
      const normTarget = normMemoNo(target);
      const dcRec =
        db.dcAllocations.find((d) => d.category === category && d.dcMemo === dcMemo) ||
        (normTarget
          ? db.dcAllocations.find(
              (d) => d.category === category && normMemoNo(d.dcMemo) === normTarget
            ) ||
            db.dcAllocations.find(
              (d) => d.category === category && memosLikelyMatch(d.dcMemo, target)
            )
          : undefined);
      if (!dcRec) return { total: 0, used: 0, remaining: 0 };
      return usageIndex.dcById.get(dcRec.id) || {
        total: round3(Number(dcRec.allocationQty) || 0),
        used: 0,
        remaining: round3(Number(dcRec.allocationQty) || 0),
      };
    },
    [db.dcAllocations, usageIndex]
  );

  const addMinistryAllocation = useCallback(
    (input: Omit<MinistryAllocation, 'id' | 'createdAt'>): ActionResult => {
      const memo = input.memoNo.trim();
      if (!memo) return { ok: false, error: 'মন্ত্রণালয়ের স্মারক নং দিন।' };
      if ((Number(input.allocationQty) || 0) <= 0) {
        return { ok: false, error: 'বরাদ্দের পরিমাণ ০-এর বেশি হতে হবে।' };
      }
      const dup = db.ministryAllocations.some(
        (m) => m.category === input.category && m.memoNo.trim() === memo
      );
      if (dup) {
        return { ok: false, error: `স্মারক নং "${memo}" এই খাতে আগেই এন্ট্রি আছে।` };
      }
      const row: MinistryAllocation = {
        ...input,
        memoNo: memo,
        allocationQty: round3(input.allocationQty),
        id: uid('min'),
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => ({
        ...prev,
        ministryAllocations: [row, ...prev.ministryAllocations],
      }));
      return { ok: true, message: 'মন্ত্রণালয় বরাদ্দ সংরক্ষিত হয়েছে।' };
    },
    [db.ministryAllocations]
  );

  const updateMinistryAllocation = useCallback(
    (
      id: string,
      patch: Partial<Omit<MinistryAllocation, 'id' | 'createdAt' | 'category'>>
    ): ActionResult => {
      const existing = db.ministryAllocations.find((m) => m.id === id);
      if (!existing) return { ok: false, error: 'মন্ত্রণালয় বরাদ্দ খুঁজে পাওয়া যায়নি।' };
      const nextMemo = (patch.memoNo ?? existing.memoNo).trim();
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (!nextMemo) return { ok: false, error: 'মন্ত্রণালয়ের স্মারক নং দিন।' };
      if (nextQty <= 0) return { ok: false, error: 'বরাদ্দের পরিমাণ ০-এর বেশি হতে হবে।' };
      if (
        nextMemo !== existing.memoNo &&
        db.ministryAllocations.some(
          (m) => m.id !== id && m.category === existing.category && m.memoNo.trim() === nextMemo
        )
      ) {
        return { ok: false, error: `স্মারক নং "${nextMemo}" এই খাতে আগেই আছে।` };
      }
      const usage = getMinistryUsage(existing.category, existing.memoNo);
      if (nextQty + 0.0005 < usage.used) {
        return {
          ok: false,
          error: `ইতিমধ্যে ${toBnDigits(usage.used.toFixed(3))} মে.টন ব্যবহৃত হয়েছে; এর চেয়ে কম পরিমাণ দেওয়া যাবে না।`,
        };
      }
      const oldMemo = existing.memoNo;
      const memoChanged = nextMemo !== oldMemo;
      const meta = CATEGORY_BY_NAME[existing.category];
      setDb((prev) => ({
        ...prev,
        ministryAllocations: prev.ministryAllocations.map((m) =>
          m.id === id
            ? {
                ...m,
                ...patch,
                memoNo: nextMemo,
                allocationQty: nextQty,
              }
            : m
        ),
        dcAllocations: memoChanged
          ? prev.dcAllocations.map((d) =>
              d.category === existing.category && memosLikelyMatch(d.ministryMemo, oldMemo)
                ? { ...d, ministryMemo: nextMemo }
                : d
            )
          : prev.dcAllocations,
        unoSuballocations: memoChanged
          ? prev.unoSuballocations.map((u) =>
              u.category === existing.category && memosLikelyMatch(u.ministryMemo, oldMemo)
                ? { ...u, ministryMemo: nextMemo }
                : u
            )
          : prev.unoSuballocations,
        dealerSuballocations:
          memoChanged && !meta?.requiresDC
            ? prev.dealerSuballocations.map((s) =>
                s.category === existing.category && memosLikelyMatch(s.sourceMemo, oldMemo)
                  ? { ...s, sourceMemo: nextMemo }
                  : s
              )
            : prev.dealerSuballocations,
        doIssues: memoChanged
          ? prev.doIssues.map((d) =>
              d.category === existing.category && memosLikelyMatch(d.ministryMemo, oldMemo)
                ? { ...d, ministryMemo: nextMemo }
                : d
            )
          : prev.doIssues,
      }));
      return { ok: true, message: 'মন্ত্রণালয় বরাদ্দ হালনাগাদ হয়েছে।' };
    },
    [db.ministryAllocations, getMinistryUsage]
  );

  const deleteMinistryAllocation = useCallback((id: string) => {
    setDb((prev) => ({
      ...prev,
      ministryAllocations: prev.ministryAllocations.filter((m) => m.id !== id),
    }));
  }, []);

  const addDCAllocation = useCallback(
    (
      input: Omit<DCAllocation, 'id' | 'createdAt'>,
      attachedProjects?: Array<Omit<ProjectEntry, 'id' | 'category' | 'dcMemo' | 'createdAt'>>
    ): ActionResult => {
      const mMemo = input.ministryMemo.trim();
      const dcMemo = input.dcMemo.trim();
      const qty = round3(input.allocationQty);
      if (!mMemo || !dcMemo || !input.dcMemoDate || qty <= 0) {
        return { ok: false, error: 'মন্ত্রণালয় স্মারক, ডিসি স্মারক, তারিখ ও পরিমাণ সবগুলো পূরণ করুন।' };
      }
      const dup = db.dcAllocations.some(
        (d) => d.category === input.category && d.dcMemo.trim() === dcMemo
      );
      if (dup) {
        return { ok: false, error: `ডিসি স্মারক "${dcMemo}" এই খাতে আগেই আছে।` };
      }
      const usage = getMinistryUsage(input.category, mMemo);
      if (qty > usage.remaining + 0.0005) {
        return {
          ok: false,
          error: `মন্ত্রণালয় অবশিষ্ট ব্যালেন্স (${toBnDigits(usage.remaining.toFixed(3))} মে.টন) এর চেয়ে বেশি ডিসি বরাদ্দ দেওয়া যাবে না।`,
        };
      }
      const now = new Date().toISOString();
      const dcRow: DCAllocation = {
        ...input,
        ministryMemo: mMemo,
        dcMemo,
        allocationQty: qty,
        id: uid('dc'),
        createdAt: now,
      };
      const newProjects: ProjectEntry[] = (attachedProjects || []).map((p) => ({
        ...p,
        id: uid('prj'),
        category: input.category,
        dcMemo,
        allocationQty: round3(p.allocationQty),
        createdAt: now,
      }));
      setDb((prev) => ({
        ...prev,
        dcAllocations: [dcRow, ...prev.dcAllocations],
        projects: [...newProjects, ...prev.projects],
      }));
      return {
        ok: true,
        message:
          newProjects.length > 0
            ? `ডিসি বরাদ্দ ও ${toBnDigits(newProjects.length)}টি প্রকল্প সংরক্ষিত হয়েছে।`
            : 'ডিসি বরাদ্দ সংরক্ষিত হয়েছে।',
      };
    },
    [db.dcAllocations, getMinistryUsage]
  );

  const updateDCAllocation = useCallback(
    (
      id: string,
      patch: Partial<Omit<DCAllocation, 'id' | 'createdAt' | 'category'>>
    ): ActionResult => {
      const existing = db.dcAllocations.find((d) => d.id === id);
      if (!existing) return { ok: false, error: 'ডিসি বরাদ্দ খুঁজে পাওয়া যায়নি।' };
      const nextMinMemo = (patch.ministryMemo ?? existing.ministryMemo).trim();
      const nextDcMemo = (patch.dcMemo ?? existing.dcMemo).trim();
      const nextDate = (patch.dcMemoDate ?? existing.dcMemoDate).trim();
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (!nextMinMemo || !nextDcMemo || !nextDate || nextQty <= 0) {
        return { ok: false, error: 'মন্ত্রণালয় স্মারক, ডিসি স্মারক, তারিখ ও পরিমাণ সবগুলো পূরণ করুন।' };
      }
      if (
        nextDcMemo !== existing.dcMemo &&
        db.dcAllocations.some(
          (d) => d.id !== id && d.category === existing.category && d.dcMemo.trim() === nextDcMemo
        )
      ) {
        return { ok: false, error: `ডিসি স্মারক "${nextDcMemo}" এই খাতে আগেই আছে।` };
      }
      const minUsage = getMinistryUsage(existing.category, nextMinMemo);
      const effectiveRemaining = memosLikelyMatch(nextMinMemo, existing.ministryMemo)
        ? round3(minUsage.remaining + existing.allocationQty)
        : minUsage.remaining;
      if (nextQty > effectiveRemaining + 0.0005) {
        return {
          ok: false,
          error: `মন্ত্রণালয় অবশিষ্ট ব্যালেন্স (${toBnDigits(effectiveRemaining.toFixed(3))} মে.টন) এর চেয়ে বেশি ডিসি বরাদ্দ দেওয়া যাবে না।`,
        };
      }
      const dcUsage = getDCUsage(existing.category, existing.dcMemo);
      if (nextQty + 0.0005 < dcUsage.used) {
        return {
          ok: false,
          error: `ইতিমধ্যে ${toBnDigits(dcUsage.used.toFixed(3))} মে.টন উপবরাদ্দ হয়েছে; এর চেয়ে কম পরিমাণ দেওয়া যাবে না।`,
        };
      }
      const oldDcMemo = existing.dcMemo;
      const dcChanged = nextDcMemo !== oldDcMemo;
      const meta = CATEGORY_BY_NAME[existing.category];
      setDb((prev) => ({
        ...prev,
        dcAllocations: prev.dcAllocations.map((d) =>
          d.id === id
            ? {
                ...d,
                ministryMemo: nextMinMemo,
                dcMemo: nextDcMemo,
                dcMemoDate: nextDate,
                allocationQty: nextQty,
              }
            : d
        ),
        projects: dcChanged
          ? prev.projects.map((p) =>
              p.category === existing.category && memosLikelyMatch(p.dcMemo, oldDcMemo)
                ? { ...p, dcMemo: nextDcMemo }
                : p
            )
          : prev.projects,
        unoSuballocations: dcChanged
          ? prev.unoSuballocations.map((u) =>
              u.category === existing.category && memosLikelyMatch(u.dcMemo, oldDcMemo)
                ? { ...u, dcMemo: nextDcMemo, ministryMemo: nextMinMemo }
                : u
            )
          : prev.unoSuballocations,
        dealerSuballocations:
          dcChanged && meta?.requiresDC
            ? prev.dealerSuballocations.map((s) =>
                s.category === existing.category && memosLikelyMatch(s.sourceMemo, oldDcMemo)
                  ? { ...s, sourceMemo: nextDcMemo }
                  : s
              )
            : prev.dealerSuballocations,
        doIssues: dcChanged
          ? prev.doIssues.map((d) =>
              d.category === existing.category && memosLikelyMatch(d.dcMemo, oldDcMemo)
                ? { ...d, dcMemo: nextDcMemo, ministryMemo: nextMinMemo }
                : d
            )
          : prev.doIssues,
      }));
      return { ok: true, message: 'ডিসি বরাদ্দ হালনাগাদ হয়েছে।' };
    },
    [db.dcAllocations, getDCUsage, getMinistryUsage]
  );

  const deleteDCAllocation = useCallback((id: string) => {
    setDb((prev) => {
      const target = prev.dcAllocations.find((d) => d.id === id);
      return {
        ...prev,
        dcAllocations: prev.dcAllocations.filter((d) => d.id !== id),
        projects: target
          ? prev.projects.filter((p) => !(p.category === target.category && p.dcMemo === target.dcMemo))
          : prev.projects,
      };
    });
  }, []);

  const addProjectsToDC = useCallback(
    (
      category: AllocationCategory,
      dcMemo: string,
      entries: Array<Omit<ProjectEntry, 'id' | 'category' | 'dcMemo' | 'createdAt'>>
    ): ActionResult => {
      if (!dcMemo) return { ok: false, error: 'ডিসি স্মারক নির্বাচন করুন।' };
      if (!entries.length) return { ok: false, error: 'কমপক্ষে ১টি প্রকল্প যোগ করুন।' };
      const now = new Date().toISOString();
      const rows: ProjectEntry[] = entries.map((p) => ({
        ...p,
        id: uid('prj'),
        category,
        dcMemo,
        allocationQty: round3(p.allocationQty),
        createdAt: now,
      }));
      setDb((prev) => ({
        ...prev,
        projects: [...rows, ...prev.projects],
      }));
      return { ok: true, message: `${toBnDigits(rows.length)}টি প্রকল্প যোগ হয়েছে।` };
    },
    []
  );

  const updateProject = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          ProjectEntry,
          'projectNo' | 'projectName' | 'presidentName' | 'unionName' | 'allocationQty'
        >
      >
    ): ActionResult => {
      const existing = db.projects.find((p) => p.id === id);
      if (!existing) return { ok: false, error: 'প্রকল্প খুঁজে পাওয়া যায়নি।' };
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (nextQty <= 0) return { ok: false, error: 'প্রকল্পের পরিমাণ ০-এর বেশি হতে হবে।' };
      setDb((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === id
            ? {
                ...p,
                projectNo: (patch.projectNo ?? p.projectNo).trim() || p.projectNo,
                projectName: (patch.projectName ?? p.projectName).trim(),
                presidentName: (patch.presidentName ?? p.presidentName).trim(),
                unionName: (patch.unionName ?? p.unionName).trim() || p.unionName,
                allocationQty: nextQty,
              }
            : p
        ),
      }));
      return { ok: true, message: 'প্রকল্পের তথ্য হালনাগাদ হয়েছে।' };
    },
    [db.projects]
  );

  const deleteProject = useCallback((id: string) => {
    setDb((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
  }, []);

  const transferProject = useCallback(
    (
      id: string,
      target: { category?: AllocationCategory; dcMemo: string }
    ): ActionResult => {
      const existing = db.projects.find((p) => p.id === id);
      if (!existing) return { ok: false, error: 'প্রকল্প খুঁজে পাওয়া যায়নি।' };
      const targetCat = target.category || existing.category;
      const targetMeta = CATEGORY_BY_NAME[targetCat];
      if (!targetMeta?.supportsProjects) {
        return { ok: false, error: 'নির্বাচিত খাতে প্রকল্প স্থানান্তরযোগ্য নয়।' };
      }
      const nextDcMemo = target.dcMemo.trim();
      if (!nextDcMemo) {
        return { ok: false, error: 'লক্ষ্য ডিসি স্মারক নির্বাচন করুন।' };
      }
      const hasDc = db.dcAllocations.some(
        (d) =>
          d.category === targetCat &&
          (normMemoNo(d.dcMemo) === normMemoNo(nextDcMemo) || memosLikelyMatch(d.dcMemo, nextDcMemo))
      );
      if (!hasDc) {
        return { ok: false, error: `${targetCat} খাতে "${toBnDigits(nextDcMemo)}" ডিসি স্মারক পাওয়া যায়নি।` };
      }
      setDb((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === id ? { ...p, category: targetCat, dcMemo: nextDcMemo } : p
        ),
      }));
      return {
        ok: true,
        message: `প্রকল্প ${toBnDigits(existing.projectNo)} সফলভাবে "${targetCat} (${toBnDigits(nextDcMemo)})"-এ স্থানান্তরিত হয়েছে।`,
      };
    },
    [db.dcAllocations, db.projects]
  );

  const saveDealerSuballocationBatch = useCallback(
    (payload: {
      category: AllocationCategory;
      sourceMemo: string;
      unoMemo: string;
      unoDate: string;
      rows: Array<{
        dealerName: string;
        unionName: string;
        salesCenter: string;
        cardCount: number;
        unusedCards: number;
        allocationQty: number;
        totalAmount: number;
        taxAmount: number;
      }>;
    }): ActionResult => {
      const { category, sourceMemo, unoMemo, unoDate, rows } = payload;
      if (!sourceMemo || !unoDate) {
        return { ok: false, error: 'উৎস স্মারক ও তারিখ দিন।' };
      }
      const validRows = rows.filter((r) => Number(r.allocationQty) > 0);
      if (!validRows.length) {
        return { ok: false, error: 'কোনো প্রাপক বা পরিমাণ ০-এর বেশি নয়।' };
      }
      const totalRequested = round3(validRows.reduce((s, r) => s + Number(r.allocationQty), 0));
      const meta = CATEGORY_BY_NAME[category];
      const upstream = meta.requiresDC
        ? getDCUsage(category, sourceMemo)
        : getMinistryUsage(category, sourceMemo);

      if (totalRequested > upstream.remaining + 0.0005) {
        return {
          ok: false,
          error: `মোট চাহিদা (${toBnDigits(totalRequested.toFixed(3))} মে.টন) অবশিষ্ট বরাদ্দের (${toBnDigits(upstream.remaining.toFixed(3))} মে.টন) চেয়ে বেশি!`,
        };
      }

      const now = new Date().toISOString();
      const created: DealerSuballocation[] = validRows.map((r) => ({
        id: uid('ds'),
        category,
        sourceMemo,
        unoMemo: unoMemo.trim() || sourceMemo,
        unoDate,
        dealerName: r.dealerName,
        unionName: r.unionName,
        salesCenter: r.salesCenter,
        cardCount: Math.round(r.cardCount || 0),
        unusedCards: Math.round(r.unusedCards || 0),
        allocationQty: round3(r.allocationQty),
        totalAmount: round2(r.totalAmount),
        taxAmount: round2(r.taxAmount),
        createdAt: now,
      }));
      setDb((prev) => ({
        ...prev,
        dealerSuballocations: [...created, ...prev.dealerSuballocations],
      }));
      return {
        ok: true,
        message: `${toBnDigits(created.length)} জন প্রাপকের উপবরাদ্দ (${toBnDigits(totalRequested.toFixed(3))} মে.টন) সংরক্ষিত হয়েছে।`,
      };
    },
    [getDCUsage, getMinistryUsage]
  );

  const updateDealerSuballocation = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          DealerSuballocation,
          'unoMemo' | 'unoDate' | 'dealerName' | 'unionName' | 'allocationQty'
        >
      >
    ): ActionResult => {
      const existing = db.dealerSuballocations.find((r) => r.id === id);
      if (!existing) return { ok: false, error: 'উপবরাদ্দ রেকর্ড পাওয়া যায়নি।' };
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (nextQty <= 0) return { ok: false, error: 'বরাদ্দ পরিমাণ ০-এর বেশি হতে হবে।' };
      const meta = CATEGORY_BY_NAME[existing.category];
      const upstream = meta.requiresDC
        ? getDCUsage(existing.category, existing.sourceMemo)
        : getMinistryUsage(existing.category, existing.sourceMemo);
      const effectiveRemaining = round3(upstream.remaining + existing.allocationQty);
      if (nextQty > effectiveRemaining + 0.0005) {
        return {
          ok: false,
          error: `অবশিষ্ট বরাদ্দ (${toBnDigits(effectiveRemaining.toFixed(3))} মে.টন) এর চেয়ে বেশি পরিমাণ দেওয়া যাবে না।`,
        };
      }
      const rate = db.rates.find((r) => r.category === existing.category);
      const nextTotal =
        rate && rate.unitPrice > 0
          ? round2(nextQty * rate.unitPrice)
          : existing.allocationQty > 0
            ? round2((existing.totalAmount / existing.allocationQty) * nextQty)
            : existing.totalAmount;
      const nextTax =
        rate && rate.taxRate > 0
          ? round2(nextQty * rate.taxRate)
          : existing.allocationQty > 0
            ? round2((existing.taxAmount / existing.allocationQty) * nextQty)
            : existing.taxAmount;
      setDb((prev) => ({
        ...prev,
        dealerSuballocations: prev.dealerSuballocations.map((r) =>
          r.id === id
            ? {
                ...r,
                unoMemo: (patch.unoMemo ?? r.unoMemo).trim() || r.sourceMemo,
                unoDate: (patch.unoDate ?? r.unoDate).trim() || r.unoDate,
                dealerName: (patch.dealerName ?? r.dealerName).trim() || r.dealerName,
                unionName: (patch.unionName ?? r.unionName).trim() || r.unionName,
                allocationQty: nextQty,
                totalAmount: nextTotal,
                taxAmount: nextTax,
              }
            : r
        ),
      }));
      return { ok: true, message: 'উপবরাদ্দ হালনাগাদ হয়েছে।' };
    },
    [db.dealerSuballocations, db.rates, getDCUsage, getMinistryUsage]
  );

  const deleteDealerSuballocation = useCallback((id: string) => {
    setDb((prev) => ({
      ...prev,
      dealerSuballocations: prev.dealerSuballocations.filter((r) => r.id !== id),
    }));
  }, []);

  const saveUNOSuballocationBatch = useCallback(
    (payload: {
      category: AllocationCategory;
      sourceMemo: string;
      unoMemo: string;
      unoDate: string;
      rows: Array<{
        unionName: string;
        recipientName: string;
        projectNo?: string;
        projectName?: string;
        allocationQty: number;
      }>;
    }): ActionResult => {
      const { category, sourceMemo, unoMemo, unoDate, rows } = payload;
      if (!sourceMemo || !unoMemo.trim() || !unoDate) {
        return { ok: false, error: 'স্মারক নং, ইউএনও স্মারক ও তারিখ সবগুলো দিন।' };
      }
      const validRows = rows.filter((r) => Number(r.allocationQty) > 0);
      if (!validRows.length) {
        return { ok: false, error: 'কোনো বরাদ্দ পরিমাণ ০-এর বেশি নয়।' };
      }
      const totalReq = round3(validRows.reduce((s, r) => s + Number(r.allocationQty), 0));
      const meta = CATEGORY_BY_NAME[category];
      const upstream = meta.requiresDC
        ? getDCUsage(category, sourceMemo)
        : getMinistryUsage(category, sourceMemo);

      if (totalReq > upstream.remaining + 0.0005) {
        return {
          ok: false,
          error: `মোট উপবরাদ্দ (${toBnDigits(totalReq.toFixed(3))} মে.টন) অবশিষ্ট বরাদ্দের (${toBnDigits(upstream.remaining.toFixed(3))} মে.টন) চেয়ে বেশি!`,
        };
      }

      const dcRec = meta.requiresDC
        ? db.dcAllocations.find(
            (d) => d.category === category && memosLikelyMatch(d.dcMemo, sourceMemo)
          )
        : undefined;
      const now = new Date().toISOString();
      const created: UNOSuballocation[] = validRows.map((r) => ({
        id: uid('uno'),
        category,
        ministryMemo: meta.requiresDC ? dcRec?.ministryMemo || '' : sourceMemo,
        dcMemo: meta.requiresDC ? sourceMemo : '',
        unoMemo: unoMemo.trim(),
        unoDate,
        unionName: r.unionName,
        recipientName: r.recipientName,
        projectNo: r.projectNo,
        projectName: r.projectName,
        allocationQty: round3(r.allocationQty),
        createdAt: now,
      }));
      setDb((prev) => ({
        ...prev,
        unoSuballocations: [...created, ...prev.unoSuballocations],
      }));
      return {
        ok: true,
        message: `${toBnDigits(created.length)} টি ইউএনও উপবরাদ্দ (${toBnDigits(totalReq.toFixed(3))} মে.টন) সংরক্ষিত হয়েছে।`,
      };
    },
    [db.dcAllocations, getDCUsage, getMinistryUsage]
  );

  const updateUNOSuballocation = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          UNOSuballocation,
          'unoMemo' | 'unoDate' | 'unionName' | 'recipientName' | 'allocationQty'
        >
      >
    ): ActionResult => {
      const existing = db.unoSuballocations.find((u) => u.id === id);
      if (!existing) return { ok: false, error: 'উপবরাদ্দ রেকর্ড পাওয়া যায়নি।' };
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (nextQty <= 0) return { ok: false, error: 'বরাদ্দ পরিমাণ ০-এর বেশি হতে হবে।' };
      const meta = CATEGORY_BY_NAME[existing.category];
      const sourceMemo = meta.requiresDC ? existing.dcMemo : existing.ministryMemo;
      const upstream = meta.requiresDC
        ? getDCUsage(existing.category, sourceMemo)
        : getMinistryUsage(existing.category, sourceMemo);
      const effectiveRemaining = round3(upstream.remaining + existing.allocationQty);
      if (nextQty > effectiveRemaining + 0.0005) {
        return {
          ok: false,
          error: `অবশিষ্ট বরাদ্দ (${toBnDigits(effectiveRemaining.toFixed(3))} মে.টন) এর চেয়ে বেশি পরিমাণ দেওয়া যাবে না।`,
        };
      }
      setDb((prev) => ({
        ...prev,
        unoSuballocations: prev.unoSuballocations.map((u) =>
          u.id === id
            ? {
                ...u,
                unoMemo: (patch.unoMemo ?? u.unoMemo).trim() || u.unoMemo,
                unoDate: (patch.unoDate ?? u.unoDate).trim() || u.unoDate,
                unionName: (patch.unionName ?? u.unionName).trim() || u.unionName,
                recipientName: (patch.recipientName ?? u.recipientName).trim() || u.recipientName,
                allocationQty: nextQty,
              }
            : u
        ),
      }));
      return { ok: true, message: 'উপবরাদ্দ হালনাগাদ হয়েছে।' };
    },
    [db.unoSuballocations, getDCUsage, getMinistryUsage]
  );

  const deleteUNOSuballocation = useCallback((id: string) => {
    setDb((prev) => ({
      ...prev,
      unoSuballocations: prev.unoSuballocations.filter((u) => u.id !== id),
    }));
  }, []);

  const saveDOBook = useCallback(
    (input: { bookNo: number; startPage: number; endPage: number }): ActionResult => {
      const bookNo = Math.round(input.bookNo);
      const startPage = Math.round(input.startPage);
      const endPage = Math.round(input.endPage);
      if (bookNo <= 0 || startPage <= 0 || endPage < startPage) {
        return { ok: false, error: 'সঠিক বই নং, শুরু পাতা ও শেষ পাতা দিন (শেষ পাতা >= শুরু পাতা)।' };
      }
      const overlap = db.doBooks.find(
        (b) => startPage <= b.endPage && endPage >= b.startPage
      );
      if (overlap) {
        return {
          ok: false,
          error: `বই নং ${toBnDigits(overlap.bookNo)}-এর পাতার (${toBnDigits(overlap.startPage)}-${toBnDigits(overlap.endPage)}) সাথে মিল আছে!`,
        };
      }
      const row: DOBook = {
        id: uid('book'),
        bookNo,
        startPage,
        endPage,
        totalCount: endPage - startPage + 1,
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => ({ ...prev, doBooks: [...prev.doBooks, row] }));
      return { ok: true, message: `বই নং ${toBnDigits(bookNo)} (${toBnDigits(row.totalCount)}টি ডিও) সংরক্ষিত হয়েছে।` };
    },
    [db.doBooks]
  );

  const deleteDOBook = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, doBooks: prev.doBooks.filter((b) => b.id !== id) }));
  }, []);

  const saveChallan = useCallback(
    (input: Omit<ChallanRecord, 'id' | 'createdAt'>, existingId?: string): ActionResult => {
      if (!input.challanNo.trim() || !input.dealerName.trim()) {
        return { ok: false, error: 'চালান নং ও ডিলারের নাম দিন।' };
      }
      if (existingId) {
        setDb((prev) => ({
          ...prev,
          challans: prev.challans.map((c) =>
            c.id === existingId
              ? {
                  ...c,
                  ...input,
                  challanNo: input.challanNo.trim(),
                  recordedAmount: round2(input.recordedAmount),
                  depositedAmount: round2(input.depositedAmount),
                }
              : c
          ),
        }));
        return { ok: true, message: 'চালান তথ্য আপডেট হয়েছে।' };
      }
      const row: ChallanRecord = {
        ...input,
        challanNo: input.challanNo.trim(),
        recordedAmount: round2(input.recordedAmount),
        depositedAmount: round2(input.depositedAmount),
        id: uid('chln'),
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => ({ ...prev, challans: [row, ...prev.challans] }));
      return { ok: true, message: 'নতুন চালান সংরক্ষিত হয়েছে।' };
    },
    []
  );

  const deleteChallan = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, challans: prev.challans.filter((c) => c.id !== id) }));
  }, []);

  const verifyChallanForRecipient = useCallback(
    (
      category: AllocationCategory,
      dealerName: string,
      allocationQty: number,
      opts?: { subId?: string; unoDate?: string; unoMemo?: string }
    ) => {
      if (!CHALLAN_CATEGORIES.includes(category)) {
        return { applicable: false, ok: true, message: 'চালান প্রযোজ্য নয় (বিনামূল্য খাত)' };
      }
      const rate = db.rates.find((r) => r.category === category);
      const effUnitPrice = rate?.unitPrice || (category === 'খাদ্য বান্ধব' ? 13000 : 0);
      const effTaxRate = rate?.taxRate || (category === 'খাদ্য বান্ধব' ? 200 : 0);
      const reqMain = round2(allocationQty * effUnitPrice);
      const reqTax = round2(allocationQty * effTaxRate);

      const dayDiff = (a?: string, b?: string): number => {
        const tA = a ? Date.parse(bnToEnDigits(a).trim()) : NaN;
        const tB = b ? Date.parse(bnToEnDigits(b).trim()) : NaN;
        if (Number.isNaN(tA) || Number.isNaN(tB)) return 9999;
        return Math.abs(tA - tB) / 86400000;
      };

      const pickChallan = (type: ChallanRecord['challanType']): ChallanRecord | undefined => {
        if (opts?.subId) {
          const targetId = normMemoNo(opts.subId);
          const direct = db.challans.find(
            (c) =>
              c.challanType === type &&
              c.dealerAllocationId &&
              normMemoNo(c.dealerAllocationId) === targetId
          );
          if (direct) return direct;
        }

        const catMatches = db.challans.filter(
          (c) =>
            c.challanType === type &&
            (!c.category || c.category === category) &&
            (namesLikelyMatch(c.dealerName, dealerName) || namesFuzzyMatch(c.dealerName, dealerName))
        );
        const pool =
          catMatches.length > 0
            ? catMatches
            : db.challans.filter(
                (c) =>
                  c.challanType === type &&
                  (namesLikelyMatch(c.dealerName, dealerName) || namesFuzzyMatch(c.dealerName, dealerName))
              );

        const scopedPool = opts?.subId
          ? pool.filter(
              (c) =>
                !c.dealerAllocationId ||
                normMemoNo(c.dealerAllocationId) === normMemoNo(opts.subId!)
            )
          : pool;

        const within35 = opts?.unoDate
          ? scopedPool.filter((c) => {
              const cDate = c.challanDate || c.doDate;
              if (!cDate) return false;
              return dayDiff(cDate, opts.unoDate) <= 35;
            })
          : scopedPool;
        const dateFiltered =
          within35.length > 0
            ? within35
            : opts?.unoDate
              ? scopedPool.filter((c) => {
                  const cDate = c.challanDate || c.doDate;
                  if (!cDate) return false;
                  return dayDiff(cDate, opts.unoDate) <= 60;
                })
              : scopedPool;

        if (dateFiltered.length === 0) return undefined;
        return [...dateFiltered].sort((a, b) => {
          const dDiffA = opts?.unoDate ? dayDiff(a.challanDate || a.doDate, opts.unoDate) : 0;
          const dDiffB = opts?.unoDate ? dayDiff(b.challanDate || b.doDate, opts.unoDate) : 0;
          const qDiffA = a.allocationQty ? Math.abs(a.allocationQty - allocationQty) : 999;
          const qDiffB = b.allocationQty ? Math.abs(b.allocationQty - allocationQty) : 999;
          return qDiffA * 100 + dDiffA - (qDiffB * 100 + dDiffB);
        })[0];
      };

      const mainC = pickChallan('মূল চালান');
      const taxC = pickChallan('আয়কর চালান');

      const errs: string[] = [];
      if (!mainC && reqMain > 0) errs.push('মূল চালান পাওয়া যায়নি');
      else if (mainC && mainC.depositedAmount + 0.01 < reqMain) {
        errs.push(`মূল চালানে কম জমা (${toBnDigits(round2(reqMain - mainC.depositedAmount))} ৳)`);
      }
      if (reqTax > 0) {
        if (!taxC) errs.push('আয়কর চালান পাওয়া যায়নি');
        else if (taxC.depositedAmount + 0.01 < reqTax) {
          errs.push(`আয়কর চালানে কম জমা (${toBnDigits(round2(reqTax - taxC.depositedAmount))} ৳)`);
        }
      }

      return {
        applicable: true,
        ok: errs.length === 0,
        requiredAmount: reqMain,
        requiredTaxAmount: reqTax,
        mainChallan: mainC,
        taxChallan: taxC,
        errors: errs,
      };
    },
    [db.challans, db.rates]
  );

  const issueDOBatch = useCallback(
    (
      items: Array<{
        category: AllocationCategory;
        unionName: string;
        recipientName: string;
        salesCenter?: string;
        allocationQty: number;
        ministryMemo: string;
        dcMemo: string;
        unoMemo: string;
        unoDate?: string;
        subId?: string;
        projectNo?: string;
        doNo: string;
        issueDate: string;
      }>
    ): ActionResult => {
      if (!items.length) return { ok: false, error: 'কোনো ডিও নম্বর দেওয়া হয়নি।' };
      const existingSet = new Set(db.doIssues.map((d) => String(d.doNo).trim()));
      const batchSet = new Set<string>();
      for (const it of items) {
        const dNo = it.doNo.trim();
        if (!dNo || !it.issueDate) {
          return { ok: false, error: 'প্রতিটি নির্বাচিত প্রাপকের জন্য ডিও নং এবং তারিখ দিন।' };
        }
        if (existingSet.has(dNo)) {
          return { ok: false, error: `ডিও নং ${toBnDigits(dNo)} আগেই ইস্যু করা হয়েছে!` };
        }
        if (batchSet.has(dNo)) {
          return { ok: false, error: `একই ডিও নং ${toBnDigits(dNo)} দুইবার লেখা হয়েছে!` };
        }
        batchSet.add(dNo);
      }

      const now = new Date().toISOString();
      const created: DOIssue[] = items.map((it) => {
        const check = verifyChallanForRecipient(it.category, it.recipientName, it.allocationQty, {
          subId: it.subId,
          unoDate: it.unoDate,
          unoMemo: it.unoMemo,
        });
        return {
          id: uid('do'),
          doNo: it.doNo.trim(),
          issueDate: it.issueDate,
          category: it.category,
          unionName: it.unionName,
          recipientName: it.recipientName,
          salesCenter: it.salesCenter,
          allocationQty: round3(it.allocationQty),
          ministryMemo: it.ministryMemo,
          dcMemo: it.dcMemo,
          unoMemo: it.unoMemo,
          dealerAllocationId: it.subId,
          projectNo: it.projectNo,
          challanNo: check.mainChallan?.challanNo,
          challanDate: check.mainChallan?.challanDate,
          challanAmount: check.mainChallan?.depositedAmount,
          taxChallanNo: check.taxChallan?.challanNo,
          taxChallanDate: check.taxChallan?.challanDate,
          taxChallanAmount: check.taxChallan?.depositedAmount,
          requiredAmount: check.requiredAmount,
          requiredTaxAmount: check.requiredTaxAmount,
          createdAt: now,
        };
      });

      setDb((prev) => ({
        ...prev,
        doIssues: [...created, ...prev.doIssues],
      }));
      return {
        ok: true,
        message: `${toBnDigits(created.length)} টি ডিও সফলভাবে ইস্যু হয়েছে।`,
      };
    },
    [db.doIssues, verifyChallanForRecipient]
  );

  const updateDOIssue = useCallback(
    (
      id: string,
      patch: Partial<Pick<DOIssue, 'doNo' | 'issueDate' | 'allocationQty'>>
    ): ActionResult => {
      const existing = db.doIssues.find((d) => d.id === id);
      if (!existing) return { ok: false, error: 'ডিও রেকর্ড পাওয়া যায়নি।' };
      const nextDoNo = (patch.doNo ?? existing.doNo).trim();
      const nextDate = (patch.issueDate ?? existing.issueDate).trim();
      const nextQty = round3(patch.allocationQty ?? existing.allocationQty);
      if (!nextDoNo || !nextDate) {
        return { ok: false, error: 'ডিও নং এবং তারিখ পূরণ করুন।' };
      }
      if (nextQty <= 0) {
        return { ok: false, error: 'ডিও পরিমাণ ০-এর বেশি হতে হবে।' };
      }
      if (
        nextDoNo !== existing.doNo &&
        db.doIssues.some((d) => d.id !== id && String(d.doNo).trim() === nextDoNo)
      ) {
        return { ok: false, error: `ডিও নং ${toBnDigits(nextDoNo)} আগেই ইস্যু করা হয়েছে!` };
      }
      setDb((prev) => ({
        ...prev,
        doIssues: prev.doIssues.map((d) =>
          d.id === id
            ? {
                ...d,
                doNo: nextDoNo,
                issueDate: nextDate,
                allocationQty: nextQty,
              }
            : d
        ),
      }));
      return { ok: true, message: 'ডিও তথ্য হালনাগাদ হয়েছে।' };
    },
    [db.doIssues]
  );

  const deleteDOIssue = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, doIssues: prev.doIssues.filter((d) => d.id !== id) }));
  }, []);

  const saveFoodDealer = useCallback((dealer: Omit<FoodDealer, 'id'>, existingId?: string) => {
    const qty = round3((Number(dealer.cardCount) || 0) * 0.03);
    setDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          foodDealers: prev.foodDealers.map((d) =>
            d.id === existingId ? { ...dealer, totalQty: qty, id: existingId } : d
          ),
        };
      }
      return {
        ...prev,
        foodDealers: [...prev.foodDealers, { ...dealer, totalQty: qty, id: uid('fd') }],
      };
    });
  }, []);

  const deleteFoodDealer = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, foodDealers: prev.foodDealers.filter((d) => d.id !== id) }));
  }, []);

  const saveOMSDealer = useCallback((dealer: Omit<OMSDealer, 'id'>, existingId?: string) => {
    setDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          omsDealers: prev.omsDealers.map((d) =>
            d.id === existingId ? { ...dealer, id: existingId } : d
          ),
        };
      }
      return {
        ...prev,
        omsDealers: [...prev.omsDealers, { ...dealer, id: uid('od') }],
      };
    });
  }, []);

  const deleteOMSDealer = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, omsDealers: prev.omsDealers.filter((d) => d.id !== id) }));
  }, []);

  const saveChairman = useCallback((item: Omit<ChairmanEntry, 'id'>, existingId?: string) => {
    setDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          chairmen: prev.chairmen.map((c) => (c.id === existingId ? { ...item, id: existingId } : c)),
        };
      }
      return { ...prev, chairmen: [...prev.chairmen, { ...item, id: uid('ch') }] };
    });
  }, []);

  const deleteChairman = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, chairmen: prev.chairmen.filter((c) => c.id !== id) }));
  }, []);

  const saveFireService = useCallback((item: Omit<FireServiceEntry, 'id'>, existingId?: string) => {
    setDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          fireServices: prev.fireServices.map((f) =>
            f.id === existingId ? { ...item, id: existingId } : f
          ),
        };
      }
      return { ...prev, fireServices: [...prev.fireServices, { ...item, id: uid('fs') }] };
    });
  }, []);

  const deleteFireService = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, fireServices: prev.fireServices.filter((f) => f.id !== id) }));
  }, []);

  const saveRate = useCallback((category: AllocationCategory, unitPrice: number, taxRate: number) => {
    setDb((prev) => {
      const existing = prev.rates.find((r) => r.category === category);
      if (existing) {
        return {
          ...prev,
          rates: prev.rates.map((r) =>
            r.category === category ? { ...r, unitPrice, taxRate } : r
          ),
        };
      }
      const next: CategoryRate = { id: uid('rt'), category, unitPrice, taxRate };
      return { ...prev, rates: [...prev.rates, next] };
    });
  }, []);

  const deleteRate = useCallback((id: string) => {
    setDb((prev) => ({ ...prev, rates: prev.rates.filter((r) => r.id !== id) }));
  }, []);

  const updateOfficerProfile = useCallback((patch: Partial<OfficerProfileSettings>) => {
    setDb((prev) => ({
      ...prev,
      officer: { ...prev.officer, ...patch },
    }));
  }, []);

  const updateReportTemplate = useCallback(
    (id: ReportTemplateId, patch: Partial<ReportTemplateConfig>) => {
      setDb((prev) => ({
        ...prev,
        templates: {
          ...prev.templates,
          [id]: { ...prev.templates[id], ...patch },
        },
      }));
    },
    []
  );

  const resetReportTemplate = useCallback((id: ReportTemplateId) => {
    setDb((prev) => {
      const item = REPORT_TEMPLATE_CATALOG.find((x) => x.id === id);
      if (!item) return prev;
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [id]: createDefaultTemplate(item, prev.officer),
        },
      };
    });
  }, []);

  const saveReportMemo = useCallback((key: string, no: string, date: string) => {
    setDb((prev) => ({
      ...prev,
      reportMemos: { ...prev.reportMemos, [key]: { no, date } },
    }));
  }, []);

  const syncFromGoogleSheet = useCallback(
    async (
      rawIdOrUrl?: string,
      rawChallanIdOrUrl?: string,
      rawChallanGasUrl?: string,
      tokenOverride?: string | null
    ): Promise<ActionResult> => {
      const cfg = sheetsConfigRef.current;
      const curDb = dbRef.current;
      const targetId = extractSpreadsheetId(rawIdOrUrl ?? cfg.spreadsheetId);
      const challanTargetId = extractSpreadsheetId(
        rawChallanIdOrUrl ?? cfg.challanSpreadsheetId ?? ''
      );
      const challanGasUrl = String(rawChallanGasUrl ?? cfg.challanAppsScriptUrl ?? '').trim();

      if (!targetId && !challanTargetId && !challanGasUrl) {
        return { ok: false, error: 'সেটিংসে Google Sheet ID বা লিংক যুক্ত করুন।' };
      }

      setIsSyncingSheets(true);
      setGoogleAuthError(null);
      try {
        const token = tokenOverride ?? tokenRef.current ?? getGoogleAccessToken();
        let nextDb = curDb;
        let mainTitle = cfg.spreadsheetName;
        let tabsCount = 0;

        if (targetId) {
          const res = token
            ? await fetchAllocationFromOAuthSheet(token, targetId, curDb)
            : await fetchAllocationFromPublicSheet(targetId, curDb);
          nextDb = res.db;
          mainTitle = res.title;
          tabsCount = res.matchedTabNames.length || res.tabsFound.length;
        }

        let challanTitle = cfg.challanSpreadsheetName || '';
        let challanSyncedCount = 0;

        if (challanTargetId) {
          const extChallan = await fetchExternalChallansFromSheet(challanTargetId, token);
          challanTitle = extChallan.title || challanTitle;
          if (extChallan.challans.length > 0) {
            challanSyncedCount = extChallan.challans.length;
            nextDb = { ...nextDb, challans: extChallan.challans };
          }
        } else if (challanGasUrl) {
          const extGas = await fetchExternalChallansFromAppsScript(challanGasUrl);
          challanTitle = 'চালান ওয়েব অ্যাপ';
          if (extGas.challans.length > 0) {
            challanSyncedCount = extGas.challans.length;
            nextDb = { ...nextDb, challans: extGas.challans };
          }
        }

        nextDb = reconcileChallansAndDOs(nextDb);
        setDb(nextDb);

        const summaryDetails = `মন্ত্রণালয় ${toBnDigits(nextDb.ministryAllocations.length)}, উপবরাদ্দ ${toBnDigits(
          nextDb.dealerSuballocations.length + nextDb.unoSuballocations.length
        )}, ডিও ${toBnDigits(nextDb.doIssues.length)}, চালান ${toBnDigits(nextDb.challans.length)}`;

        const syncMsg = targetId
          ? `${mainTitle} (${toBnDigits(tabsCount)}টি ট্যাব · ${summaryDetails}${
              challanTitle ? ` · চালান উৎস: ${challanTitle}` : ''
            })`
          : `${challanTitle || 'চালান শিট'} থেকে ${toBnDigits(challanSyncedCount)}টি চালান সিঙ্ক হয়েছে`;

        setSheetsConfig((prev) => ({
          ...prev,
          enabled: true,
          spreadsheetId: targetId || prev.spreadsheetId,
          spreadsheetName: mainTitle || prev.spreadsheetName,
          challanSpreadsheetId: challanTargetId || prev.challanSpreadsheetId,
          challanSpreadsheetName: challanTitle || prev.challanSpreadsheetName,
          challanAppsScriptUrl: challanGasUrl || prev.challanAppsScriptUrl,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'ok',
          lastSyncMessage: syncMsg,
        }));

        return {
          ok: true,
          message: targetId
            ? `"${mainTitle}" থেকে সফলভাবে সিঙ্ক হয়েছে (${summaryDetails})।`
            : `${challanTitle || 'চালান শিট'} থেকে ${toBnDigits(challanSyncedCount)}টি চালান সিঙ্ক হয়েছে!`,
        };
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearGoogleAccessToken();
          setGoogleAccessToken(null);
        }
        const msg = err instanceof Error ? err.message : 'Google Sheet সিঙ্ক ব্যর্থ হয়েছে।';
        setSheetsConfig((prev) => ({
          ...prev,
          spreadsheetId: targetId || prev.spreadsheetId,
          lastSyncStatus: 'error',
          lastSyncMessage: msg,
        }));
        return { ok: false, error: msg };
      } finally {
        setIsSyncingSheets(false);
      }
    },
    []
  );

  const autoDetectAndSyncDriveSheets = useCallback(
    async (tokenOverride?: string | null): Promise<ActionResult> => {
      const token = tokenOverride ?? tokenRef.current ?? getGoogleAccessToken();
      if (!token) {
        return { ok: false, error: 'Google Drive স্ক্যান করতে প্রথমে Google Sign-In করুন।' };
      }
      setIsSyncingSheets(true);
      try {
        const res = await autoDetectAllocationSpreadsheets(token);
        setDriveFiles(res.files);
        const curCfg = sheetsConfigRef.current;
        const detectedMainId = res.main?.file.id || curCfg.spreadsheetId;
        const detectedMainName = res.main?.meta.title || curCfg.spreadsheetName;
        const detectedChallanId = res.challan?.file.id || curCfg.challanSpreadsheetId || '';
        const detectedChallanName = res.challan?.meta.title || curCfg.challanSpreadsheetName || '';

        if (!detectedMainId && !detectedChallanId) {
          return {
            ok: true,
            message: `Google Drive-এ ${toBnDigits(res.files.length)}টি শিট পাওয়া গেছে; ড্রপডাউন থেকে আপনার শিট নির্বাচন করুন।`,
          };
        }

        setSheetsConfig((prev) => ({
          ...prev,
          enabled: true,
          spreadsheetId: detectedMainId,
          spreadsheetName: detectedMainName,
          challanSpreadsheetId: detectedChallanId,
          challanSpreadsheetName: detectedChallanName,
        }));

        const syncRes = await syncFromGoogleSheet(
          detectedMainId,
          detectedChallanId,
          curCfg.challanAppsScriptUrl,
          token
        );
        return syncRes.ok
          ? {
              ok: true,
              message: `Drive থেকে অটো-ডিটেক্ট ও সিঙ্ক সম্পন্ন (${detectedMainName || detectedChallanName})!`,
            }
          : syncRes;
      } catch (err) {
        if (err instanceof GoogleAuthExpiredError) {
          clearGoogleAccessToken();
          setGoogleAccessToken(null);
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Google Drive স্ক্যান ব্যর্থ হয়েছে।',
        };
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [syncFromGoogleSheet]
  );

  const handleGoogleSignIn = useCallback(async (): Promise<ActionResult> => {
    setIsGoogleSigningIn(true);
    setGoogleAuthError(null);
    try {
      const { user, accessToken } = await googleSignIn();
      setGoogleUser(user);
      setGoogleAccessToken(accessToken);
      tokenRef.current = accessToken;

      const cfg = sheetsConfigRef.current;
      if (cfg.spreadsheetId || cfg.challanSpreadsheetId || cfg.challanAppsScriptUrl) {
        await syncFromGoogleSheet(
          cfg.spreadsheetId,
          cfg.challanSpreadsheetId,
          cfg.challanAppsScriptUrl,
          accessToken
        );
      } else {
        await autoDetectAndSyncDriveSheets(accessToken);
      }
      return { ok: true, message: 'Google সাইন-ইন ও শিট সংযোগ সম্পন্ন হয়েছে।' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google সাইন-ইন ব্যর্থ হয়েছে।';
      setGoogleAuthError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsGoogleSigningIn(false);
    }
  }, [autoDetectAndSyncDriveSheets, syncFromGoogleSheet]);

  const handleGoogleSignOut = useCallback(async () => {
    await googleLogout();
    setGoogleUser(null);
    setGoogleAccessToken(null);
    setDriveFiles([]);
  }, []);

  useEffect(() => {
    if (initialAutoSyncDoneRef.current) return;
    initialAutoSyncDoneRef.current = true;
    const cfg = sheetsConfigRef.current;
    if (
      cfg.autoSync !== false &&
      (cfg.spreadsheetId || cfg.challanSpreadsheetId || cfg.challanAppsScriptUrl)
    ) {
      void syncFromGoogleSheet(
        cfg.spreadsheetId,
        cfg.challanSpreadsheetId,
        cfg.challanAppsScriptUrl
      );
    }
  }, [syncFromGoogleSheet]);

  const pushToGoogleSheet = useCallback(async (): Promise<ActionResult> => {
    const targetId = extractSpreadsheetId(sheetsConfig.spreadsheetId);
    if (!targetId) return { ok: false, error: 'প্রথমে Google Sheet ID যুক্ত করুন।' };
    const token = googleAccessToken || getGoogleAccessToken();
    if (!token) {
      return { ok: false, error: 'শিটে ডেটা লিখতে প্রথমে Google Sign-In করুন।' };
    }
    setIsSyncingSheets(true);
    try {
      const res = await writeAllocationDatabaseToOAuthSheet(token, targetId, db);
      setSheetsConfig((prev) => ({
        ...prev,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        lastSyncMessage: `সকল ডেটা Google Sheet-এ (${toBnDigits(res.tabsUpdated)}টি ট্যাব) সেভ হয়েছে`,
      }));
      return { ok: true, message: 'সকল বরাদ্দ, ডিও, চালান ও সেটিংস Google Sheet-এ সেভ হয়েছে!' };
    } catch (err) {
      if (err instanceof GoogleAuthExpiredError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
      }
      const msg = err instanceof Error ? err.message : 'শিটে সংরক্ষণ ব্যর্থ হয়েছে।';
      return { ok: false, error: msg };
    } finally {
      setIsSyncingSheets(false);
    }
  }, [db, googleAccessToken, sheetsConfig.spreadsheetId]);

  const exportBackupJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ db, sheetsConfig }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerBlobDownload(blob, `khaddo-boraddo-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }, [db, sheetsConfig]);

  const importBackupJson = useCallback((jsonText: string): ActionResult => {
    try {
      const parsed = JSON.parse(jsonText) as {
        db?: Partial<AllocationDatabase>;
        sheetsConfig?: Partial<AllocationSheetsConfig>;
      } & Partial<AllocationDatabase>;
      const source = parsed.db ? parsed.db : parsed;
      const emptyBase = createEmptyAllocationDatabase();
      const nextOfficer = { ...DEFAULT_OFFICER_PROFILE, ...(source.officer || {}) };
      const defaultTpls = createDefaultTemplatesMap(nextOfficer);
      setDb(
        reconcileChallansAndDOs({
          ...emptyBase,
          ...source,
          officer: nextOfficer,
          templates: { ...defaultTpls, ...(source.templates || {}) },
        })
      );
      if (parsed.sheetsConfig) {
        setSheetsConfig((prev) => ({ ...prev, ...parsed.sheetsConfig }));
      }
      return { ok: true, message: 'ব্যাকআপ ডেটা সফলভাবে রিস্টোর হয়েছে!' };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'সঠিক JSON ব্যাকআপ ফাইল নয়।',
      };
    }
  }, []);

  const clearAllLocalData = useCallback(() => {
    const emptyBase = createEmptyAllocationDatabase();
    setDb((prev) => ({
      ...emptyBase,
      officer: prev.officer,
      templates: prev.templates,
    }));
  }, []);

  const unusedDoList = useMemo(() => getUnusedDoNumbers(db), [db]);

  return {
    db,
    sheetsConfig,
    setSheetsConfig,
    googleUser,
    hasGoogleToken: Boolean(googleAccessToken),
    isGoogleSigningIn,
    googleAuthError,
    isSyncingSheets,
    driveFiles,
    unusedDoList,
    getMinistryUsage,
    getDCUsage,
    addMinistryAllocation,
    updateMinistryAllocation,
    deleteMinistryAllocation,
    addDCAllocation,
    updateDCAllocation,
    deleteDCAllocation,
    addProjectsToDC,
    updateProject,
    deleteProject,
    transferProject,
    saveDealerSuballocationBatch,
    updateDealerSuballocation,
    deleteDealerSuballocation,
    saveUNOSuballocationBatch,
    updateUNOSuballocation,
    deleteUNOSuballocation,
    saveDOBook,
    deleteDOBook,
    saveChallan,
    deleteChallan,
    verifyChallanForRecipient,
    issueDOBatch,
    updateDOIssue,
    deleteDOIssue,
    saveFoodDealer,
    deleteFoodDealer,
    saveOMSDealer,
    deleteOMSDealer,
    saveChairman,
    deleteChairman,
    saveFireService,
    deleteFireService,
    saveRate,
    deleteRate,
    updateOfficerProfile,
    updateReportTemplate,
    resetReportTemplate,
    saveReportMemo,
    handleGoogleSignIn,
    handleGoogleSignOut,
    syncFromGoogleSheet,
    autoDetectAndSyncDriveSheets,
    pushToGoogleSheet,
    exportBackupJson,
    importBackupJson,
    clearAllLocalData,
  };
}
