import {
  CATEGORIES,
  CATEGORY_BY_NAME,
  CHALLAN_CATEGORIES,
  type AllocationCategory,
  type AllocationDatabase,
  type ChallanRecord,
  type DOIssue,
  type RegisterId,
  type ReportTemplateConfig,
} from '../types/allocation';
import {
  BENGALI_MONTHS,
  bnToEnDigits,
  fiscalYearLabel,
  formatBnDate,
  formatBnInt,
  formatBnMoney,
  formatBnQty,
  isMonthInFiscalUpTo,
  memosLikelyMatch,
  namesFuzzyMatch,
  namesLikelyMatch,
  normMemoNo,
  parseMonthYear,
  round2,
  round3,
  toBnDigits,
  unionsLikelyMatch,
} from './bnUtils';

export interface RegisterColumnLeaf {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  isSignature?: boolean;
  widthPct?: number;
}

export interface RegisterColumnGroup {
  label: string;
  children?: RegisterColumnLeaf[];
  leaf?: RegisterColumnLeaf;
}

export interface RegisterRowData {
  id: string;
  groupValues: string[];
  cells: Record<string, string>;
  hasSignature: boolean;
  highlight?: 'excess' | 'deficit' | 'none';
}

export interface BuiltRegisterData {
  id: RegisterId;
  title: string;
  category?: AllocationCategory;
  columns: RegisterColumnGroup[];
  leaves: RegisterColumnLeaf[];
  mergeDepth: number;
  serialPerRow?: boolean;
  colWidths?: string[];
  tableLayoutFixed?: boolean;
  rows: RegisterRowData[];
  summaryText?: string;
}

const LEAF_COL_WEIGHT: Record<string, number> = {
  ministry: 12,
  dc: 11,
  uno: 11.5,
  project: 20,
  union: 7.5,
  dealer: 12,
  recipient: 13,
  cards: 6.5,
  grain: 5,
  qty: 6,
  money: 15.5,
  challan: 15.5,
  doInfo: 9,
  signature: 7,
  date: 8,
  category: 10,
  doNo: 10,
  type: 8,
  challanNo: 15,
  recorded: 9,
  deposited: 9,
  mismatch: 11,
};

function computeRegisterColWidths(
  leaves: RegisterColumnLeaf[],
  showSerial = true,
  flowType?: string
): string[] {
  const serialPct = showSerial ? 3.5 : 0;
  const remainingPct = 100 - serialPct;
  const isDealerOmsOrFood = flowType === 'dealer_oms' || flowType === 'dealer_food';
  const weights = leaves.map((l) => {
    if (isDealerOmsOrFood) {
      if (l.key === 'money' || l.key === 'challan') return 16.5;
      if (l.key === 'ministry') return 11.5;
      if (l.key === 'dc') return 10.5;
      if (l.key === 'uno') return 11;
      if (l.key === 'union') return 7;
      if (l.key === 'dealer') return 11.5;
      if (l.key === 'cards') return 6.5;
      if (l.key === 'qty') return 5.5;
      if (l.key === 'doInfo') return 8.5;
      if (l.key === 'signature') return 6.5;
    }
    return LEAF_COL_WEIGHT[l.key] || 10;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
  const widths = weights.map((w) =>
    Number(((w / totalWeight) * remainingPct).toFixed(2))
  );
  if (widths.length > 0) {
    const sum = widths.reduce((s, w) => s + w, 0);
    widths[widths.length - 1] = Number(
      Math.max(4, widths[widths.length - 1] + (remainingPct - sum)).toFixed(2)
    );
  }
  return [
    ...(showSerial ? [`${serialPct}%`] : []),
    ...widths.map((w) => `${w}%`),
  ];
}

function dateDaysDiff(a?: string, b?: string): number {
  const tA = a ? Date.parse(bnToEnDigits(a).trim()) : NaN;
  const tB = b ? Date.parse(bnToEnDigits(b).trim()) : NaN;
  if (Number.isNaN(tA) || Number.isNaN(tB)) return 9999;
  return Math.abs(tA - tB) / 86400000;
}

function signedSubToDoDays(subDate?: string, doDate?: string): number {
  const tSub = subDate ? Date.parse(bnToEnDigits(subDate).trim()) : NaN;
  const tDo = doDate ? Date.parse(bnToEnDigits(doDate).trim()) : NaN;
  if (Number.isNaN(tSub) || Number.isNaN(tDo)) return 9999;
  return (tDo - tSub) / 86400000;
}

function isoMonthKey(d?: string): string {
  const s = bnToEnDigits(String(d || '')).trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}

interface SubTarget {
  key: string;
  kind: 'ds' | 'uno';
  id: string;
  category: AllocationCategory;
  sourceMemo: string;
  dcMemo: string;
  unoMemo: string;
  unoDate: string;
  unionName: string;
  recipientName: string;
  projectNo: string;
  salesCenter: string;
  allocationQty: number;
}

export function matchDOsToSuballocations(db: AllocationDatabase): {
  dosBySubKey: Map<string, DOIssue[]>;
  remainingBySubKey: Map<string, number>;
} {
  const targets: SubTarget[] = [
    ...db.dealerSuballocations.map((s) => {
      const catMeta = CATEGORY_BY_NAME[s.category];
      const dcRec = catMeta?.requiresDC
        ? db.dcAllocations.find(
            (d) => d.category === s.category && memosLikelyMatch(d.dcMemo, s.sourceMemo)
          )
        : undefined;
      return {
        key: `ds:${s.id}`,
        kind: 'ds' as const,
        id: s.id,
        category: s.category,
        sourceMemo: dcRec ? dcRec.ministryMemo : s.sourceMemo,
        dcMemo: dcRec ? dcRec.dcMemo : '',
        unoMemo: s.unoMemo,
        unoDate: s.unoDate,
        unionName: s.unionName,
        recipientName: s.dealerName,
        projectNo: '',
        salesCenter: s.salesCenter,
        allocationQty: s.allocationQty,
      };
    }),
    ...db.unoSuballocations.map((u) => ({
      key: `uno:${u.id}`,
      kind: 'uno' as const,
      id: u.id,
      category: u.category,
      sourceMemo: u.ministryMemo,
      dcMemo: u.dcMemo,
      unoMemo: u.unoMemo,
      unoDate: u.unoDate,
      unionName: u.unionName,
      recipientName: u.recipientName,
      projectNo: u.projectNo || '',
      salesCenter: u.projectName || '',
      allocationQty: u.allocationQty,
    })),
  ].sort((a, b) => a.unoDate.localeCompare(b.unoDate));

  const challansBySubId = new Map<string, ChallanRecord[]>();
  for (const c of db.challans) {
    if (!c.dealerAllocationId) continue;
    const k = normMemoNo(c.dealerAllocationId);
    const arr = challansBySubId.get(k) || [];
    arr.push(c);
    challansBySubId.set(k, arr);
  }

  const dosBySubKey = new Map<string, DOIssue[]>();
  const remainingBySubKey = new Map<string, number>();
  for (const t of targets) {
    dosBySubKey.set(t.key, []);
    remainingBySubKey.set(t.key, round3(t.allocationQty));
  }
  const usedDoIds = new Set<string>();

  const assignDo = (t: SubTarget, d: DOIssue) => {
    usedDoIds.add(d.id);
    dosBySubKey.get(t.key)!.push(d);
    const curRem = remainingBySubKey.get(t.key) || 0;
    remainingBySubKey.set(t.key, round3(Math.max(0, curRem - (Number(d.allocationQty) || 0))));
  };

  const scoreCandidate = (t: SubTarget, d: DOIssue): number => {
    const qtyDiff = Math.abs((d.allocationQty || 0) - (t.allocationQty || 0));
    const days = dateDaysDiff(t.unoDate, d.issueDate);
    const exactUnionBonus =
      t.unionName && d.unionName && unionsLikelyMatch(t.unionName, d.unionName) ? 0 : 50;
    return qtyDiff * 1000 + Math.min(days, 365) + exactUnionBonus;
  };

  const runPass = (
    predicate: (t: SubTarget, d: DOIssue) => boolean,
    allowMultiPerSub = true
  ) => {
    for (const t of targets) {
      let guard = 0;
      while ((remainingBySubKey.get(t.key) || 0) > 0.0005 && guard < 20) {
        guard++;
        if (!allowMultiPerSub && (dosBySubKey.get(t.key)?.length || 0) > 0) break;
        const candidates = db.doIssues.filter(
          (d) => !usedDoIds.has(d.id) && predicate(t, d)
        );
        if (candidates.length === 0) break;
        candidates.sort((a, b) => scoreCandidate(t, a) - scoreCandidate(t, b));
        assignDo(t, candidates[0]);
      }
    }
  };

  // Pass 1: Direct ID / Challan link / ProjectNo / exact UNO memo + recipient
  runPass((t, d) => {
    if (d.dealerAllocationId && normMemoNo(d.dealerAllocationId) === normMemoNo(t.id)) {
      return true;
    }
    const linkedChallans = challansBySubId.get(normMemoNo(t.id)) || [];
    if (
      linkedChallans.some(
        (c) =>
          (c.doNo && normMemoNo(c.doNo) === normMemoNo(d.doNo)) ||
          (d.challanNo && normMemoNo(c.challanNo) === normMemoNo(d.challanNo)) ||
          (d.taxChallanNo && normMemoNo(c.challanNo) === normMemoNo(d.taxChallanNo))
      )
    ) {
      return true;
    }
    if (d.category !== t.category) return false;
    if (
      t.projectNo &&
      d.projectNo &&
      memosLikelyMatch(t.projectNo, d.projectNo) &&
      (!t.dcMemo || !d.dcMemo || memosLikelyMatch(t.dcMemo, d.dcMemo))
    ) {
      return true;
    }
    if (
      t.unoMemo &&
      d.unoMemo &&
      memosLikelyMatch(t.unoMemo, d.unoMemo) &&
      namesFuzzyMatch(d.recipientName, t.recipientName) &&
      (!t.unionName || !d.unionName || unionsLikelyMatch(t.unionName, d.unionName))
    ) {
      return true;
    }
    return false;
  });

  // Pass 2: Source / Ministry / DC memo match + recipient
  runPass((t, d) => {
    if (d.category !== t.category) return false;
    if (!namesFuzzyMatch(d.recipientName, t.recipientName)) return false;
    if (t.unionName && d.unionName && !unionsLikelyMatch(t.unionName, d.unionName)) return false;
    return Boolean(
      (t.sourceMemo &&
        (memosLikelyMatch(d.ministryMemo, t.sourceMemo) ||
          memosLikelyMatch(d.dcMemo, t.sourceMemo) ||
          memosLikelyMatch(d.unoMemo, t.sourceMemo))) ||
        (t.unoMemo && memosLikelyMatch(d.ministryMemo, t.unoMemo)) ||
        (t.dcMemo && memosLikelyMatch(d.dcMemo, t.dcMemo))
    );
  });

  // Pass 3: Exact quantity (±0.02 MT) + month/date window (-15 to +60 days) + recipient
  runPass((t, d) => {
    if (d.category !== t.category) return false;
    if (!namesFuzzyMatch(d.recipientName, t.recipientName)) return false;
    if (t.unionName && d.unionName && !unionsLikelyMatch(t.unionName, d.unionName)) return false;
    if (Math.abs((d.allocationQty || 0) - (t.allocationQty || 0)) > 0.02) return false;
    const sDays = signedSubToDoDays(t.unoDate, d.issueDate);
    return (
      isoMonthKey(d.issueDate) === isoMonthKey(t.unoDate) ||
      (sDays >= -15 && sDays <= 60)
    );
  });

  // Pass 4: Recipient + memo (ignoring union label mismatch) OR recipient + date window (-15..+60d)
  runPass((t, d) => {
    if (d.category !== t.category) return false;
    if (!namesFuzzyMatch(d.recipientName, t.recipientName)) return false;
    const memoHit =
      (t.unoMemo && memosLikelyMatch(d.unoMemo, t.unoMemo)) ||
      (t.sourceMemo &&
        (memosLikelyMatch(d.ministryMemo, t.sourceMemo) ||
          memosLikelyMatch(d.dcMemo, t.sourceMemo) ||
          memosLikelyMatch(d.unoMemo, t.sourceMemo)));
    if (memoHit) return true;
    const sDays = signedSubToDoDays(t.unoDate, d.issueDate);
    return isoMonthKey(d.issueDate) === isoMonthKey(t.unoDate) || (sDays >= -15 && sDays <= 60);
  });

  // Pass 5: Exact union + exact qty (±0.01 MT) + tight date window (-15..+45d) when name spelled differently
  runPass((t, d) => {
    if (d.category !== t.category) return false;
    if (!t.unionName || !d.unionName || !unionsLikelyMatch(t.unionName, d.unionName)) return false;
    if (Math.abs((d.allocationQty || 0) - (t.allocationQty || 0)) > 0.01) return false;
    const sDays = signedSubToDoDays(t.unoDate, d.issueDate);
    return isoMonthKey(d.issueDate) === isoMonthKey(t.unoDate) || (sDays >= -15 && sDays <= 45);
  });

  // Pass 6: EP ('ইপি চাল' / 'ইপি গম') historical catch-all so previously issued EP DOs always resolve
  const isEp = (c: AllocationCategory) => c === 'ইপি চাল' || c === 'ইপি গম';
  runPass((t, d) => isEp(t.category) && d.category === t.category);
  runPass(
    (t, d) =>
      isEp(t.category) &&
      isEp(d.category) &&
      (Math.abs((d.allocationQty || 0) - (t.allocationQty || 0)) <= 0.02 ||
        (t.sourceMemo &&
          (memosLikelyMatch(d.ministryMemo, t.sourceMemo) || memosLikelyMatch(d.unoMemo, t.sourceMemo))) ||
        dateDaysDiff(t.unoDate, d.issueDate) <= 45)
  );

  return { dosBySubKey, remainingBySubKey };
}

function inDateRange(dateStr: string, start: string, end: string): boolean {
  if (!start && !end) return true;
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export function getUnusedDoNumbers(db: AllocationDatabase): Array<{
  bookNo: number;
  doNo: number;
  startPage: number;
  endPage: number;
}> {
  const usedSet = new Set(db.doIssues.map((d) => String(d.doNo).trim()));
  const out: Array<{ bookNo: number; doNo: number; startPage: number; endPage: number }> = [];
  const books = [...db.doBooks].sort((a, b) => a.bookNo - b.bookNo);
  for (const b of books) {
    for (let p = b.startPage; p <= b.endPage; p++) {
      if (!usedSet.has(String(p))) {
        out.push({ bookNo: b.bookNo, doNo: p, startPage: b.startPage, endPage: b.endPage });
      }
    }
  }
  return out;
}

export function getDoBookRegisterStats(db: AllocationDatabase) {
  const usedSet = new Set(db.doIssues.map((d) => String(d.doNo).trim()));
  const books = [...db.doBooks].sort((a, b) => a.bookNo - b.bookNo);
  let totalDO = 0;
  let totalUsed = 0;

  const usedRows = books.map((b) => {
    let usedInBook = 0;
    for (let p = b.startPage; p <= b.endPage; p++) {
      if (usedSet.has(String(p))) usedInBook++;
    }
    const count = Math.max(0, b.endPage - b.startPage + 1);
    totalDO += count;
    totalUsed += usedInBook;
    return {
      bookNo: b.bookNo,
      startPage: b.startPage,
      endPage: b.endPage,
      totalCount: count,
      usedCount: usedInBook,
    };
  });

  const unusedRows = books
    .map((b) => {
      const ranges: string[] = [];
      let runStart: number | null = null;
      let runPrev = 0;
      let unusedCount = 0;
      for (let p = b.startPage; p <= b.endPage; p++) {
        if (!usedSet.has(String(p))) {
          unusedCount++;
          if (runStart === null) {
            runStart = p;
            runPrev = p;
          } else if (p === runPrev + 1) {
            runPrev = p;
          } else {
            ranges.push(runStart === runPrev ? toBnDigits(runStart) : `${toBnDigits(runStart)}-${toBnDigits(runPrev)}`);
            runStart = p;
            runPrev = p;
          }
        }
      }
      if (runStart !== null) {
        ranges.push(runStart === runPrev ? toBnDigits(runStart) : `${toBnDigits(runStart)}-${toBnDigits(runPrev)}`);
      }
      return {
        bookNo: b.bookNo,
        unusedRange: ranges.join(', ') || '—',
        unusedCount,
      };
    })
    .filter((r) => r.unusedCount > 0);

  return {
    usedRows,
    unusedRows,
    summary: {
      totalDO,
      totalUsed,
      totalUnused: Math.max(0, totalDO - totalUsed),
    },
  };
}

export function buildRegisterData(
  regId: RegisterId,
  db: AllocationDatabase,
  startDate: string,
  endDate: string,
  template?: ReportTemplateConfig
): BuiltRegisterData {
  if (regId === 'reg-challan') {
    return buildChallanRegister(db, startDate, endDate, template);
  }

  const catMeta = CATEGORIES.find((c) => c.regId === regId) || CATEGORIES[0];
  const category = catMeta.category;
  const colOverride = template?.columnLabels || {};
  const label = (key: string, def: string) => colOverride[key]?.trim() || def;

  const { dosBySubKey } = matchDOsToSuballocations(db);
  const rateMap = new Map(db.rates.map((r) => [r.category, r]));

  const findMatchingChallanForSub = (
    subId: string,
    subDate: string,
    subQty: number,
    dealerName: string,
    doRec: DOIssue | undefined,
    challanType: 'মূল চালান' | 'আয়কর চালান'
  ): ChallanRecord | undefined => {
    const targetSubNorm = normMemoNo(subId);
    const bySubId = db.challans.find(
      (c) =>
        c.challanType === challanType &&
        c.dealerAllocationId &&
        normMemoNo(c.dealerAllocationId) === targetSubNorm
    );
    if (bySubId) return bySubId;

    if (doRec) {
      const targetChallanNo = challanType === 'মূল চালান' ? doRec.challanNo : doRec.taxChallanNo;
      const byDo = db.challans.find(
        (c) =>
          c.challanType === challanType &&
          ((doRec.doNo && c.doNo && normMemoNo(c.doNo) === normMemoNo(doRec.doNo)) ||
            (targetChallanNo && c.challanNo && normMemoNo(c.challanNo) === normMemoNo(targetChallanNo)))
      );
      if (byDo) return byDo;
    }

    const catMatches = db.challans.filter(
      (c) =>
        c.challanType === challanType &&
        (!c.category || c.category === category) &&
        (!c.dealerAllocationId || normMemoNo(c.dealerAllocationId) === targetSubNorm) &&
        (namesLikelyMatch(c.dealerName, dealerName) || namesFuzzyMatch(c.dealerName, dealerName))
    );
    const pool =
      catMatches.length > 0
        ? catMatches
        : db.challans.filter(
            (c) =>
              c.challanType === challanType &&
              (!c.dealerAllocationId || normMemoNo(c.dealerAllocationId) === targetSubNorm) &&
              (namesLikelyMatch(c.dealerName, dealerName) || namesFuzzyMatch(c.dealerName, dealerName))
          );
    if (pool.length === 0) return undefined;
    const refDate = doRec?.issueDate || subDate;
    const within35 = pool.filter((c) => {
      const cDate = c.challanDate || c.doDate;
      if (!cDate) return false;
      return (
        dateDaysDiff(cDate, subDate) <= 35 ||
        (doRec?.issueDate ? dateDaysDiff(cDate, doRec.issueDate) <= 35 : false)
      );
    });
    const nearby =
      within35.length > 0
        ? within35
        : pool.filter((c) => {
            const cDate = c.challanDate || c.doDate;
            if (!cDate) return false;
            return (
              dateDaysDiff(cDate, subDate) <= 60 ||
              (doRec?.issueDate ? dateDaysDiff(cDate, doRec.issueDate) <= 60 : false)
            );
          });
    const searchPool = nearby.length > 0 ? nearby : pool.length === 1 && !subDate ? pool : [];
    if (searchPool.length === 0) return undefined;
    return [...searchPool].sort((a, b) => {
      const qa = a.allocationQty ? Math.abs(a.allocationQty - subQty) : 999;
      const qb = b.allocationQty ? Math.abs(b.allocationQty - subQty) : 999;
      if (Math.abs(qa - qb) > 0.01) return qa - qb;
      return (
        dateDaysDiff(a.challanDate || a.doDate, refDate) -
        dateDaysDiff(b.challanDate || b.doDate, refDate)
      );
    })[0];
  };

  const formatDoCell = (doList: DOIssue[]): string => {
    if (doList.length === 0) return '—';
    return doList
      .map(
        (d) =>
          `ডিও নং- ${toBnDigits(d.doNo)}${d.issueDate ? `\nতাং- ${formatBnDate(d.issueDate)}` : ''}`
      )
      .join('\n');
  };

  const catMinAllocs = db.ministryAllocations.filter((m) => m.category === category);
  const catDcAllocs = db.dcAllocations.filter((d) => d.category === category);

  const findMinRec = (rawMemo?: string) => {
    const t = (rawMemo || '').trim();
    if (!t) return undefined;
    const nt = normMemoNo(t);
    return (
      catMinAllocs.find((m) => m.memoNo === t) ||
      (nt ? catMinAllocs.find((m) => normMemoNo(m.memoNo) === nt) : undefined) ||
      catMinAllocs.find((m) => memosLikelyMatch(m.memoNo, t))
    );
  };

  const findDcRec = (rawMemo?: string) => {
    const t = (rawMemo || '').trim();
    if (!t) return undefined;
    const nt = normMemoNo(t);
    return (
      catDcAllocs.find((d) => d.dcMemo === t) ||
      (nt ? catDcAllocs.find((d) => normMemoNo(d.dcMemo) === nt) : undefined) ||
      catDcAllocs.find((d) => memosLikelyMatch(d.dcMemo, t))
    );
  };

  const fyKeyOf = (dateStr?: string): string => {
    const parsed = dateStr ? parseMonthYear(dateStr) : null;
    return parsed ? fiscalYearLabel(parsed.year, parsed.month) : '';
  };

  const computeTierRemainingMap = <T extends { id: string; allocationQty: number }>(
    upstreams: Array<{ rec: T; date: string; memo: string }>,
    downstreams: Array<{ memoKey: string; qty: number; date: string }>
  ): Map<string, number> => {
    const directUsed = new Map<string, number>();
    const unlinked: Array<{ qty: number; date: string }> = [];

    for (const item of downstreams) {
      if (item.qty <= 0) continue;
      const key = (item.memoKey || '').trim();
      let matched: T | undefined;
      if (key) {
        const nk = normMemoNo(key);
        matched =
          upstreams.find((u) => normMemoNo(u.memo) === nk)?.rec ||
          upstreams.find((u) => memosLikelyMatch(u.memo, key))?.rec;
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

    const out = new Map<string, number>();
    for (const u of upstreams) {
      const total = round3(Number(u.rec.allocationQty) || 0);
      const used = round3((directUsed.get(u.rec.id) || 0) + (fifoUsed.get(u.rec.id) || 0));
      out.set(u.rec.id, round3(Math.max(0, total - used)));
    }
    return out;
  };

  const minDownstreams = catMeta.requiresDC
    ? catDcAllocs.map((d) => ({
        memoKey: d.ministryMemo,
        qty: Number(d.allocationQty) || 0,
        date: d.dcMemoDate || d.createdAt,
      }))
    : catMeta.flowType === 'vwb'
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

  const minRemainingById = computeTierRemainingMap(
    catMinAllocs.map((m) => ({ rec: m, date: m.memoDate || m.createdAt, memo: m.memoNo })),
    minDownstreams
  );

  const dcDownstreams =
    catMeta.flowType === 'dealer_oms'
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

  const dcRemainingById = computeTierRemainingMap(
    catDcAllocs.map((d) => ({ rec: d, date: d.dcMemoDate || d.createdAt, memo: d.dcMemo })),
    dcDownstreams
  );

  const catTargets =
    catMeta.flowType === 'dealer_food' ||
    catMeta.flowType === 'dealer_oms' ||
    catMeta.flowType === 'ep'
      ? db.dealerSuballocations
          .filter((s) => s.category === category)
          .map((s) => {
            const dcRec = catMeta.requiresDC ? findDcRec(s.sourceMemo) : undefined;
            const rawMin = dcRec ? dcRec.ministryMemo : s.sourceMemo;
            const minRec = findMinRec(rawMin);
            return {
              subKey: `ds:${s.id}`,
              minMemo: minRec?.memoNo || rawMin,
              dcMemo: dcRec ? dcRec.dcMemo : catMeta.requiresDC ? s.sourceMemo : '',
              unoMemo: s.unoMemo || s.sourceMemo || 'ইউসিএফ',
              unoDate: s.unoDate,
              qty: Number(s.allocationQty) || 0,
            };
          })
      : db.unoSuballocations
          .filter((u) => u.category === category)
          .map((u) => {
            const dcRec = catMeta.requiresDC ? findDcRec(u.dcMemo) : undefined;
            const rawMin = dcRec?.ministryMemo || u.ministryMemo;
            const minRec = findMinRec(rawMin);
            return {
              subKey: `uno:${u.id}`,
              minMemo: minRec?.memoNo || rawMin,
              dcMemo: dcRec?.dcMemo || u.dcMemo || '',
              unoMemo: u.unoMemo || 'ইউএনও',
              unoDate: u.unoDate,
              qty: Number(u.allocationQty) || 0,
            };
          });

  const unoGroupKey = (minMemo: string, dcMemo: string, unoMemo: string, unoDate: string) =>
    `${normMemoNo(minMemo)}::${normMemoNo(dcMemo)}::${normMemoNo(unoMemo)}::${unoDate}`;
  const unoTotalsMap = new Map<string, { alloc: number; issued: number }>();

  for (const t of catTargets) {
    const matchedDos = dosBySubKey.get(t.subKey) || [];
    const subDoQty = round3(matchedDos.reduce((s, d) => s + (Number(d.allocationQty) || 0), 0));
    const uKey = unoGroupKey(t.minMemo, t.dcMemo, t.unoMemo, t.unoDate);
    const cur = unoTotalsMap.get(uKey) || { alloc: 0, issued: 0 };
    cur.alloc = round3(cur.alloc + t.qty);
    cur.issued = round3(cur.issued + subDoQty);
    unoTotalsMap.set(uKey, cur);
  }

  const buildMinistryCellText = (
    minMemoFallback: string,
    grainFallback?: string
  ): string => {
    const minRec = findMinRec(minMemoFallback);
    if (minRec) {
      const remaining = minRemainingById.get(minRec.id) ?? 0;
      return [
        toBnDigits(minRec.memoNo),
        `তাং- ${formatBnDate(minRec.memoDate)}`,
        minRec.phase ? `পর্যায়-${toBnDigits(minRec.phase)}` : '',
        `মোট বরাদ্দ: ${formatBnQty(minRec.allocationQty)} মে.টন (${minRec.grain || grainFallback || catMeta.defaultGrain || 'চাল'})`,
        `অবশিষ্ট: ${formatBnQty(remaining)} মে.টন`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (!minMemoFallback) return '—';
    const subRowsForMemo = catTargets.filter((t) => memosLikelyMatch(t.minMemo, minMemoFallback));
    if (subRowsForMemo.length > 0) {
      const totAlloc = round3(subRowsForMemo.reduce((s, t) => s + t.qty, 0));
      return [
        toBnDigits(minMemoFallback),
        `মোট বরাদ্দ: ${formatBnQty(totAlloc)} মে.টন`,
        `অবশিষ্ট: ০.০০০ মে.টন`,
      ].join('\n');
    }
    return toBnDigits(minMemoFallback);
  };

  const buildDcCellText = (dcMemoFallback: string): string => {
    const dcRec = findDcRec(dcMemoFallback);
    if (dcRec) {
      const remaining = dcRemainingById.get(dcRec.id) ?? 0;
      return [
        toBnDigits(dcRec.dcMemo),
        `তাং- ${formatBnDate(dcRec.dcMemoDate)}`,
        `মোট বরাদ্দ: ${formatBnQty(dcRec.allocationQty)} মে.টন`,
        `অবশিষ্ট: ${formatBnQty(remaining)} মে.টন`,
      ].join('\n');
    }
    if (!dcMemoFallback) return '—';
    const subRowsForDc = catTargets.filter((t) => memosLikelyMatch(t.dcMemo, dcMemoFallback));
    if (subRowsForDc.length > 0) {
      const totAlloc = round3(subRowsForDc.reduce((s, t) => s + t.qty, 0));
      return [
        toBnDigits(dcMemoFallback),
        `মোট বরাদ্দ: ${formatBnQty(totAlloc)} মে.টন`,
        `অবশিষ্ট: ০.০০০ মে.টন`,
      ].join('\n');
    }
    return toBnDigits(dcMemoFallback);
  };

  const buildUnoCellText = (
    minMemo: string,
    dcMemo: string,
    unoMemoLabel: string,
    unoDate: string
  ): string => {
    const uKey = unoGroupKey(minMemo, dcMemo, unoMemoLabel, unoDate);
    const stat = unoTotalsMap.get(uKey) || { alloc: 0, issued: 0 };
    const remaining = round3(Math.max(0, stat.alloc - stat.issued));
    return [
      toBnDigits(unoMemoLabel),
      `তাং- ${formatBnDate(unoDate)}`,
      `মোট বরাদ্দ: ${formatBnQty(stat.alloc)} মে.টন`,
      `অবশিষ্ট: ${formatBnQty(remaining)} মে.টন`,
    ].join('\n');
  };

  const compareNumericText = (a: string, b: string) =>
    bnToEnDigits(a || '').localeCompare(bnToEnDigits(b || ''), undefined, { numeric: true });

  if (catMeta.flowType === 'dealer_food' || catMeta.flowType === 'dealer_oms') {
    const isFood = catMeta.flowType === 'dealer_food';
    const isTCB = catMeta.requiresDC;
    const unionOrder = db.officer.unions || [];

    const columns: RegisterColumnGroup[] = [
      { label: label('ministry', 'মন্ত্রণালয় বরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'ministry', label: label('ministry', 'মন্ত্রণালয় বরাদ্দ'), align: 'left' } },
      ...(isTCB
        ? [{ label: label('dc', 'ডিসি বরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'dc', label: label('dc', 'ডিসি বরাদ্দ'), align: 'left' as const } }]
        : []),
      { label: label('uno', 'ইউসিএফ উপবরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'uno', label: label('uno', 'ইউসিএফ উপবরাদ্দ'), align: 'left' } },
      { label: label('union', 'ইউনিয়ন / এলাকা'), leaf: { key: 'union', label: label('union', 'ইউনিয়ন / এলাকা'), align: 'left' } },
      { label: label('dealer', 'ডিলার ও বিক্রয় কেন্দ্র'), leaf: { key: 'dealer', label: label('dealer', 'ডিলার ও বিক্রয় কেন্দ্র'), align: 'left' } },
      ...(isFood
        ? [{ label: label('cards', 'কার্ড (মোট / অবিক্রিত)'), leaf: { key: 'cards', label: label('cards', 'কার্ড'), align: 'center' as const } }]
        : []),
      { label: label('qty', 'পরিমাণ (মে.টন)'), leaf: { key: 'qty', label: label('qty', 'পরিমাণ (মে.টন)'), align: 'right' } },
      { label: label('money', 'মূল চালান ও টাকা'), leaf: { key: 'money', label: label('money', 'মূল চালান ও টাকা'), align: 'left' } },
      { label: label('challan', 'আয়কর চালান ও টাকা'), leaf: { key: 'challan', label: label('challan', 'আয়কর চালান ও টাকা'), align: 'left' } },
      { label: label('doInfo', 'ডিও নং ও তারিখ'), leaf: { key: 'doInfo', label: label('doInfo', 'ডিও নং ও তারিখ'), align: 'center' } },
      { label: label('signature', 'স্বাক্ষর'), leaf: { key: 'signature', label: label('signature', 'স্বাক্ষর'), align: 'center', isSignature: true } },
    ];

    const subs = db.dealerSuballocations
      .filter((s) => s.category === category && inDateRange(s.unoDate, startDate, endDate))
      .map((s) => {
        const dcRec = isTCB ? findDcRec(s.sourceMemo) : undefined;
        const rawMin = dcRec ? dcRec.ministryMemo : s.sourceMemo;
        const minRec = findMinRec(rawMin);
        return {
          s,
          dcRec,
          minRec,
          minMemoResolved: minRec?.memoNo || rawMin || '',
          dcMemoResolved: dcRec?.dcMemo || (isTCB ? s.sourceMemo : ''),
        };
      })
      .sort((a, b) => {
        const minDateCmp = (a.minRec?.memoDate || '9999-99-99').localeCompare(
          b.minRec?.memoDate || '9999-99-99'
        );
        if (minDateCmp !== 0) return minDateCmp;
        const minMemoCmp = compareNumericText(a.minMemoResolved, b.minMemoResolved);
        if (minMemoCmp !== 0) return minMemoCmp;
        if (isTCB) {
          const dcDateCmp = (a.dcRec?.dcMemoDate || '9999-99-99').localeCompare(
            b.dcRec?.dcMemoDate || '9999-99-99'
          );
          if (dcDateCmp !== 0) return dcDateCmp;
          const dcMemoCmp = compareNumericText(a.dcMemoResolved, b.dcMemoResolved);
          if (dcMemoCmp !== 0) return dcMemoCmp;
        }
        const dateCmp = a.s.unoDate.localeCompare(b.s.unoDate);
        if (dateCmp !== 0) return dateCmp;
        const memoCmp = compareNumericText(a.s.unoMemo || a.s.sourceMemo, b.s.unoMemo || b.s.sourceMemo);
        if (memoCmp !== 0) return memoCmp;
        const ia = unionOrder.findIndex((u) => unionsLikelyMatch(u, a.s.unionName));
        const ib = unionOrder.findIndex((u) => unionsLikelyMatch(u, b.s.unionName));
        if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
        if (ia !== -1 && ib === -1) return -1;
        if (ib !== -1 && ia === -1) return 1;
        return a.s.dealerName.localeCompare(b.s.dealerName);
      });

    const catRate = rateMap.get(category);
    const effUnitPrice =
      catRate && catRate.unitPrice > 0 ? catRate.unitPrice : category === 'খাদ্য বান্ধব' ? 13000 : 0;
    const effTaxRate =
      catRate && catRate.taxRate > 0 ? catRate.taxRate : category === 'খাদ্য বান্ধব' ? 200 : 0;

    const rows: RegisterRowData[] = subs.map(({ s, minMemoResolved, dcMemoResolved }) => {
      const unoMemoLabel = s.unoMemo || s.sourceMemo || 'ইউসিএফ';

      const minText = buildMinistryCellText(minMemoResolved);
      const dcText = isTCB ? buildDcCellText(dcMemoResolved || s.sourceMemo) : '—';
      const unoText = buildUnoCellText(minMemoResolved, dcMemoResolved, unoMemoLabel, s.unoDate);

      const matchedDos = dosBySubKey.get(`ds:${s.id}`) || [];
      const doRec = matchedDos[0];
      const hasDo = matchedDos.some((d) => Boolean(d.doNo && String(d.doNo).trim()));

      const matchedMainChallanObj = findMatchingChallanForSub(
        s.id,
        s.unoDate,
        s.allocationQty,
        s.dealerName,
        doRec,
        'মূল চালান'
      );
      const matchedTaxChallanObj = findMatchingChallanForSub(
        s.id,
        s.unoDate,
        s.allocationQty,
        s.dealerName,
        doRec,
        'আয়কর চালান'
      );
      const matchedMainChallan = doRec?.challanNo || matchedMainChallanObj?.challanNo || '';
      const matchedTaxChallan = doRec?.taxChallanNo || matchedTaxChallanObj?.challanNo || '';
      const mainDate = doRec?.challanDate || matchedMainChallanObj?.challanDate || '';
      const taxDate = doRec?.taxChallanDate || matchedTaxChallanObj?.challanDate || '';
      const mainDep = matchedMainChallanObj?.depositedAmount ?? doRec?.challanAmount ?? 0;
      const taxDep = matchedTaxChallanObj?.depositedAmount ?? doRec?.taxChallanAmount ?? 0;

      const expectedMain =
        s.totalAmount > 0 ? s.totalAmount : round2(s.allocationQty * effUnitPrice);
      const expectedTax =
        s.taxAmount > 0 ? s.taxAmount : round2(s.allocationQty * effTaxRate);

      const mainChallanLines = [
        matchedMainChallan ? `নং- ${toBnDigits(matchedMainChallan)}` : '—',
        mainDate ? `(${formatBnDate(mainDate)})` : '',
        mainDep > 0
          ? `টাকা: ${formatBnMoney(mainDep)} ৳`
          : expectedMain > 0
            ? `প্রাপ্য: ${formatBnMoney(expectedMain)} ৳`
            : '',
      ].filter(Boolean);

      const taxChallanLines = [
        matchedTaxChallan ? `নং- ${toBnDigits(matchedTaxChallan)}` : '—',
        taxDate ? `(${formatBnDate(taxDate)})` : '',
        taxDep > 0
          ? `টাকা: ${formatBnMoney(taxDep)} ৳`
          : expectedTax > 0
            ? `প্রাপ্য: ${formatBnMoney(expectedTax)} ৳`
            : '',
      ].filter(Boolean);

      const groupValues = isTCB ? [minText, dcText, unoText] : [minText, unoText];

      return {
        id: s.id,
        groupValues,
        cells: {
          ministry: minText,
          ...(isTCB ? { dc: dcText } : {}),
          uno: unoText,
          union: toBnDigits(s.unionName || '—'),
          dealer: `${s.dealerName}${s.salesCenter ? `\n(${s.salesCenter})` : ''}`,
          ...(isFood
            ? {
                cards: `${formatBnInt(s.cardCount)}টি${s.unusedCards > 0 ? `\nঅবিক্রিত: ${formatBnInt(s.unusedCards)}` : ''}`,
              }
            : {}),
          qty: formatBnQty(s.allocationQty),
          money: mainChallanLines.join('\n') || '—',
          challan: taxChallanLines.join('\n') || '—',
          doInfo: formatDoCell(matchedDos),
          signature: '',
        },
        hasSignature: hasDo,
      };
    });

    const leaves = columns.map((c) => c.leaf!);
    return {
      id: regId,
      title: `${category} রেজিস্টার`,
      category,
      columns,
      leaves,
      mergeDepth: isTCB ? 3 : 2,
      serialPerRow: true,
      colWidths: computeRegisterColWidths(leaves, true, catMeta.flowType),
      tableLayoutFixed: true,
      rows,
    };
  }

  if (catMeta.flowType === 'ep') {
    const columns: RegisterColumnGroup[] = [
      { label: label('ministry', 'বিভাগীয় বরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'ministry', label: label('ministry', 'বিভাগীয় বরাদ্দ'), align: 'left' } },
      { label: label('uno', 'ইউসিএফ উপবরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'uno', label: label('uno', 'ইউসিএফ উপবরাদ্দ'), align: 'left' } },
      { label: label('dealer', 'প্রাপক (ফায়ার সার্ভিস)'), leaf: { key: 'dealer', label: label('dealer', 'প্রাপক'), align: 'left' } },
      { label: label('grain', 'শস্য'), leaf: { key: 'grain', label: label('grain', 'শস্য'), align: 'center' } },
      { label: label('qty', 'পরিমাণ (মে.টন)'), leaf: { key: 'qty', label: label('qty', 'পরিমাণ (মে.টন)'), align: 'right' } },
      { label: label('money', 'মোট টাকা (৳)'), leaf: { key: 'money', label: label('money', 'মোট টাকা (৳)'), align: 'right' } },
      { label: label('challan', 'চালান নং ও তারিখ'), leaf: { key: 'challan', label: label('challan', 'চালান'), align: 'left' } },
      { label: label('doInfo', 'ডিও নং ও তারিখ'), leaf: { key: 'doInfo', label: label('doInfo', 'ডিও নং ও তারিখ'), align: 'center' } },
      { label: label('signature', 'স্বাক্ষর'), leaf: { key: 'signature', label: label('signature', 'স্বাক্ষর'), align: 'center', isSignature: true } },
    ];

    const subs = db.dealerSuballocations
      .filter((s) => s.category === category && inDateRange(s.unoDate, startDate, endDate))
      .map((s) => {
        const minRec = findMinRec(s.sourceMemo);
        return { s, minRec, minMemoResolved: minRec?.memoNo || s.sourceMemo || '' };
      })
      .sort((a, b) => {
        const minDateCmp = (a.minRec?.memoDate || '9999-99-99').localeCompare(
          b.minRec?.memoDate || '9999-99-99'
        );
        if (minDateCmp !== 0) return minDateCmp;
        const minMemoCmp = compareNumericText(a.minMemoResolved, b.minMemoResolved);
        if (minMemoCmp !== 0) return minMemoCmp;
        const dc = a.s.unoDate.localeCompare(b.s.unoDate);
        if (dc !== 0) return dc;
        return compareNumericText(a.s.unoMemo || a.s.sourceMemo, b.s.unoMemo || b.s.sourceMemo);
      });

    const rows: RegisterRowData[] = subs.map(({ s, minRec, minMemoResolved }) => {
      const unoMemoLabel = s.unoMemo || s.sourceMemo || 'ইউসিএফ';
      const minText = buildMinistryCellText(minMemoResolved, catMeta.defaultGrain);
      const unoText = buildUnoCellText(minMemoResolved, '', unoMemoLabel, s.unoDate);

      const matchedDos = dosBySubKey.get(`ds:${s.id}`) || [];
      const doRec = matchedDos[0];
      const hasDo = matchedDos.some((d) => Boolean(d.doNo && String(d.doNo).trim()));

      const epChallanObj = findMatchingChallanForSub(
        s.id,
        s.unoDate,
        s.allocationQty,
        s.dealerName,
        doRec,
        'মূল চালান'
      );
      const epChallanNo = doRec?.challanNo || epChallanObj?.challanNo || '';
      const epChallanDate = doRec?.challanDate || epChallanObj?.challanDate || '';
      const epDep = epChallanObj?.depositedAmount ?? doRec?.challanAmount ?? 0;

      return {
        id: s.id,
        groupValues: [minText, unoText],
        cells: {
          ministry: minText,
          uno: unoText,
          dealer: s.dealerName,
          grain: minRec?.grain || catMeta.defaultGrain || 'চাল',
          qty: formatBnQty(s.allocationQty),
          money: formatBnMoney(s.totalAmount || epDep),
          challan:
            epChallanNo || epDep > 0
              ? `${epChallanNo ? toBnDigits(epChallanNo) : '—'}${epChallanDate ? `\n${formatBnDate(epChallanDate)}` : ''}${epDep > 0 ? `\nজমা: ${formatBnMoney(epDep)} ৳` : ''}`
              : '—',
          doInfo: formatDoCell(matchedDos),
          signature: '',
        },
        hasSignature: hasDo,
      };
    });

    const leaves = columns.map((c) => c.leaf!);
    return {
      id: regId,
      title: `${category} রেজিস্টার`,
      category,
      columns,
      leaves,
      mergeDepth: 2,
      serialPerRow: true,
      colWidths: computeRegisterColWidths(leaves, true),
      tableLayoutFixed: true,
      rows,
    };
  }

  const showDC = catMeta.requiresDC;
  const showProject = catMeta.supportsProjects;
  const unionOrder = db.officer.unions || [];
  const projectColTitle = label(
    'project',
    'প্রকল্প নং, প্রকল্পের নাম,\nসভাপতি ও সেক্রেটারি'
  );
  const columns: RegisterColumnGroup[] = [
    { label: label('ministry', 'মন্ত্রণালয় বরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'ministry', label: label('ministry', 'মন্ত্রণালয় বরাদ্দ'), align: 'left' } },
    ...(showDC
      ? [{ label: label('dc', 'ডিসি বরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'dc', label: label('dc', 'ডিসি বরাদ্দ'), align: 'left' as const } }]
      : []),
    { label: label('uno', 'ইউএনও উপবরাদ্দ (স্মারক, তারিখ, বরাদ্দ ও অবশিষ্ট)'), leaf: { key: 'uno', label: label('uno', 'ইউএনও উপবরাদ্দ'), align: 'left' } },
    ...(showProject
      ? [
          {
            label: projectColTitle,
            leaf: {
              key: 'project',
              label: projectColTitle,
              align: 'left' as const,
            },
          },
        ]
      : []),
    { label: label('union', 'ইউনিয়ন'), leaf: { key: 'union', label: label('union', 'ইউনিয়ন'), align: 'left' } },
    ...(!showProject
      ? [
          {
            label: label('recipient', 'চেয়ারম্যান / প্রাপক'),
            leaf: { key: 'recipient', label: label('recipient', 'প্রাপক'), align: 'left' as const },
          },
        ]
      : []),
    { label: label('grain', 'শস্য'), leaf: { key: 'grain', label: label('grain', 'শস্য'), align: 'center' } },
    { label: label('qty', 'পরিমাণ (মে.টন)'), leaf: { key: 'qty', label: label('qty', 'পরিমাণ (মে.টন)'), align: 'right' } },
    { label: label('doInfo', 'ডিও নং ও তারিখ'), leaf: { key: 'doInfo', label: label('doInfo', 'ডিও নং ও তারিখ'), align: 'center' } },
    { label: label('signature', 'স্বাক্ষর'), leaf: { key: 'signature', label: label('signature', 'স্বাক্ষর'), align: 'center', isSignature: true } },
  ];

  const unoSubs = db.unoSuballocations
    .filter((u) => u.category === category && inDateRange(u.unoDate, startDate, endDate))
    .map((u) => {
      const dcRec = showDC ? findDcRec(u.dcMemo) : undefined;
      const rawMin = dcRec?.ministryMemo || u.ministryMemo;
      const minRec = findMinRec(rawMin);
      return {
        u,
        dcRec,
        minRec,
        minMemoResolved: minRec?.memoNo || rawMin || '',
        dcMemoResolved: dcRec?.dcMemo || u.dcMemo || '',
      };
    })
    .sort((a, b) => {
      const minDateCmp = (a.minRec?.memoDate || '9999-99-99').localeCompare(
        b.minRec?.memoDate || '9999-99-99'
      );
      if (minDateCmp !== 0) return minDateCmp;
      const minMemoCmp = compareNumericText(a.minMemoResolved, b.minMemoResolved);
      if (minMemoCmp !== 0) return minMemoCmp;
      if (showDC) {
        const dcDateCmp = (a.dcRec?.dcMemoDate || '9999-99-99').localeCompare(
          b.dcRec?.dcMemoDate || '9999-99-99'
        );
        if (dcDateCmp !== 0) return dcDateCmp;
        const dcMemoCmp = compareNumericText(a.dcMemoResolved, b.dcMemoResolved);
        if (dcMemoCmp !== 0) return dcMemoCmp;
      }
      const dateCmp = a.u.unoDate.localeCompare(b.u.unoDate);
      if (dateCmp !== 0) return dateCmp;
      const memoCmp = compareNumericText(a.u.unoMemo, b.u.unoMemo);
      if (memoCmp !== 0) return memoCmp;
      const ia = unionOrder.findIndex((un) => unionsLikelyMatch(un, a.u.unionName));
      const ib = unionOrder.findIndex((un) => unionsLikelyMatch(un, b.u.unionName));
      if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
      if (ia !== -1 && ib === -1) return -1;
      if (ib !== -1 && ia === -1) return 1;
      return compareNumericText(
        a.u.projectNo || a.u.recipientName || '',
        b.u.projectNo || b.u.recipientName || ''
      );
    });

  const rows: RegisterRowData[] = unoSubs.map(({ u, minRec, minMemoResolved, dcMemoResolved }) => {
    const minText = buildMinistryCellText(minMemoResolved, catMeta.defaultGrain);
    const dcText = showDC ? buildDcCellText(dcMemoResolved) : '—';
    const unoText = buildUnoCellText(
      minMemoResolved,
      dcMemoResolved,
      u.unoMemo || 'ইউএনও',
      u.unoDate
    );

    const matchedDos = dosBySubKey.get(`uno:${u.id}`) || [];
    const hasDo = matchedDos.some((d) => Boolean(d.doNo && String(d.doNo).trim()));
    const groupValues = showDC ? [minText, dcText, unoText] : [minText, unoText];

    let projectCell = '';
    if (showProject) {
      const matchedProject = db.projects.find((p) => {
        if (p.category !== category) return false;
        if (u.projectNo && p.projectNo && normMemoNo(p.projectNo) === normMemoNo(u.projectNo)) {
          return !u.dcMemo || !p.dcMemo || normMemoNo(p.dcMemo) === normMemoNo(u.dcMemo);
        }
        if (
          u.dcMemo &&
          p.dcMemo &&
          normMemoNo(p.dcMemo) === normMemoNo(u.dcMemo) &&
          (!u.unionName || !p.unionName || unionsLikelyMatch(u.unionName, p.unionName)) &&
          (namesLikelyMatch(p.presidentName, u.recipientName) ||
            namesLikelyMatch(p.projectName, u.projectName || '') ||
            namesLikelyMatch(p.projectName, u.recipientName))
        ) {
          return true;
        }
        return false;
      });

      const pNo = (u.projectNo || matchedProject?.projectNo || '').trim();
      const pName = (u.projectName || matchedProject?.projectName || '').trim();
      let pPresident = (u.recipientName || matchedProject?.presidentName || '').trim();
      if (pName && pPresident === pName && matchedProject?.presidentName?.trim()) {
        pPresident = matchedProject.presidentName.trim();
      }

      const lines: string[] = [];
      if (pNo) {
        const bnNo = toBnDigits(pNo);
        lines.push(/^(প্রকল্প|প্র[:.\s-])/i.test(pNo) ? bnNo : `প্র: নং- ${bnNo}`);
      }
      if (pName) {
        lines.push(pName);
      }
      if (pPresident && pPresident !== pName) {
        lines.push(lines.length > 0 ? `সভাপতি/সেক্রেটারি: ${pPresident}` : pPresident);
      }
      projectCell = lines.length > 0 ? lines.join('\n') : '—';
    }

    return {
      id: u.id,
      groupValues,
      cells: {
        ministry: minText,
        ...(showDC ? { dc: dcText } : {}),
        uno: unoText,
        ...(showProject ? { project: projectCell } : {}),
        union: u.unionName,
        ...(!showProject ? { recipient: u.recipientName } : {}),
        grain: minRec?.grain || catMeta.defaultGrain || 'চাল',
        qty: formatBnQty(u.allocationQty),
        doInfo: formatDoCell(matchedDos),
        signature: '',
      },
      hasSignature: hasDo,
    };
  });

  const leaves = columns.map((c) => c.leaf!);
  return {
    id: regId,
    title: `${category} রেজিস্টার`,
    category,
    columns,
    leaves,
    mergeDepth: showDC ? 3 : 2,
    serialPerRow: true,
    colWidths: computeRegisterColWidths(leaves, true),
    tableLayoutFixed: true,
    rows,
  };
}

function buildChallanRegister(
  db: AllocationDatabase,
  startDate: string,
  endDate: string,
  template?: ReportTemplateConfig
): BuiltRegisterData {
  const colOverride = template?.columnLabels || {};
  const label = (key: string, def: string) => colOverride[key]?.trim() || def;
  const signRule = template?.challanSignRule || 'excess_or_equal';

  const columns: RegisterColumnGroup[] = [
    { label: label('date', 'চালানের তারিখ'), leaf: { key: 'date', label: label('date', 'তারিখ'), align: 'center' } },
    { label: label('category', 'খাত'), leaf: { key: 'category', label: label('category', 'খাত'), align: 'left' } },
    { label: label('dealer', 'ডিলার / প্রাপকের নাম'), leaf: { key: 'dealer', label: label('dealer', 'ডিলার / প্রাপক'), align: 'left' } },
    { label: label('doNo', 'ডিও নং ও তারিখ'), leaf: { key: 'doNo', label: label('doNo', 'ডিও নং ও তারিখ'), align: 'center' } },
    { label: label('type', 'চালানের ধরন'), leaf: { key: 'type', label: label('type', 'ধরন'), align: 'center' } },
    { label: label('challanNo', 'চালান নং ও ব্যাংক'), leaf: { key: 'challanNo', label: label('challanNo', 'চালান নং ও ব্যাংক'), align: 'left' } },
    { label: label('recorded', 'রেকর্ড অনুযায়ী টাকা (৳)'), leaf: { key: 'recorded', label: label('recorded', 'রেকর্ড অনুযায়ী টাকা'), align: 'right' } },
    { label: label('deposited', 'জমাকৃত টাকা (৳)'), leaf: { key: 'deposited', label: label('deposited', 'জমাকৃত টাকা'), align: 'right' } },
    { label: label('mismatch', 'গরমিল / পার্থক্য (৳)'), leaf: { key: 'mismatch', label: label('mismatch', 'গরমিল (৳)'), align: 'right' } },
    { label: label('signature', 'স্বাক্ষর'), leaf: { key: 'signature', label: label('signature', 'স্বাক্ষর'), align: 'center', isSignature: true } },
  ];

  const list: ChallanRecord[] = [...db.challans];
  const seenKey = new Set(
    list
      .filter((c) => Boolean(c.challanNo && c.challanNo.trim()))
      .map((c) => `${normMemoNo(c.challanNo)}::${c.challanType}`)
  );
  const rateMap = new Map(db.rates.map((r) => [r.category, r]));
  const subById = new Map(db.dealerSuballocations.map((s) => [s.id.trim(), s]));

  for (const d of db.doIssues) {
    if (d.challanNo && !seenKey.has(`${normMemoNo(d.challanNo)}::মূল চালান`)) {
      seenKey.add(`${normMemoNo(d.challanNo)}::মূল চালান`);
      const rate = rateMap.get(d.category);
      const sub = db.dealerSuballocations.find(
        (s) =>
          s.category === d.category &&
          normMemoNo(s.unoMemo) === normMemoNo(d.unoMemo) &&
          namesLikelyMatch(s.dealerName, d.recipientName)
      );
      const fallbackRec =
        d.requiredAmount ||
        sub?.totalAmount ||
        round2(d.allocationQty * (rate?.unitPrice || 0)) ||
        Number(d.challanAmount || 0);
      list.push({
        id: `auto-m-${d.id}`,
        challanNo: d.challanNo,
        challanDate: d.challanDate || d.issueDate,
        category: d.category,
        dealerName: d.recipientName,
        dealerAllocationId: sub?.id,
        challanType: 'মূল চালান',
        bankName: 'ট্রেজারি চালান',
        doNo: d.doNo,
        doDate: d.issueDate,
        allocationQty: d.allocationQty,
        recordedAmount: fallbackRec,
        depositedAmount: Number(d.challanAmount || 0),
        createdAt: d.createdAt,
      });
    }
    if (d.taxChallanNo && !seenKey.has(`${normMemoNo(d.taxChallanNo)}::আয়কর চালান`)) {
      seenKey.add(`${normMemoNo(d.taxChallanNo)}::আয়কর চালান`);
      const rate = rateMap.get(d.category);
      const effTaxRate = rate && rate.taxRate > 0 ? rate.taxRate : d.category === 'খাদ্য বান্ধব' ? 200 : 0;
      const sub = db.dealerSuballocations.find(
        (s) =>
          s.category === d.category &&
          normMemoNo(s.unoMemo) === normMemoNo(d.unoMemo) &&
          namesLikelyMatch(s.dealerName, d.recipientName)
      );
      const fallbackTaxRec =
        d.requiredTaxAmount ||
        sub?.taxAmount ||
        round2(d.allocationQty * effTaxRate) ||
        Number(d.taxChallanAmount || 0);
      list.push({
        id: `auto-t-${d.id}`,
        challanNo: d.taxChallanNo,
        challanDate: d.taxChallanDate || d.issueDate,
        category: d.category,
        dealerName: d.recipientName,
        dealerAllocationId: sub?.id,
        challanType: 'আয়কর চালান',
        bankName: 'আয়কর চালান',
        doNo: d.doNo,
        doDate: d.issueDate,
        allocationQty: d.allocationQty,
        recordedAmount: fallbackTaxRec,
        depositedAmount: Number(d.taxChallanAmount || 0),
        createdAt: d.createdAt,
      });
    }
  }

  const filtered = list
    .filter((c) => inDateRange(c.challanDate, startDate, endDate))
    .sort((a, b) => a.challanDate.localeCompare(b.challanDate));

  const monthKey = (iso?: string) => (/^\d{4}-\d{2}/.test((iso || '').trim()) ? (iso || '').trim().slice(0, 7) : '');

  const rows: RegisterRowData[] = filtered.map((c) => {
    const directSub = c.dealerAllocationId ? subById.get(c.dealerAllocationId.trim()) : undefined;
    const dealerName = c.dealerName || directSub?.dealerName || '—';
    const refDate = c.challanDate || directSub?.unoDate || '';
    const refMonth = monthKey(refDate);

    let matchedDo =
      (c.doNo && db.doIssues.find((d) => normMemoNo(d.doNo) === normMemoNo(c.doNo))) ||
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

    if (!matchedDo && directSub) {
      const subPool = db.doIssues.filter(
        (d) => d.category === directSub.category && namesLikelyMatch(d.recipientName, directSub.dealerName)
      );
      matchedDo =
        (directSub.unoMemo
          ? subPool.find((d) => normMemoNo(d.unoMemo) === normMemoNo(directSub.unoMemo))
          : undefined) ||
        (refMonth ? subPool.find((d) => monthKey(d.issueDate) === refMonth) : undefined);
    }

    if (!matchedDo && dealerName !== '—') {
      const dealerPool = db.doIssues.filter(
        (d) => d.category === c.category && namesLikelyMatch(d.recipientName, dealerName)
      );
      const sameMonth = refMonth
        ? dealerPool.filter((d) => monthKey(d.issueDate) === refMonth)
        : [];
      const qtyPool = sameMonth.length > 0 ? sameMonth : dealerPool.length === 1 ? dealerPool : [];
      matchedDo =
        (c.allocationQty && qtyPool.length > 1
          ? [...qtyPool].sort(
              (a, b) =>
                Math.abs((a.allocationQty || 0) - c.allocationQty!) -
                Math.abs((b.allocationQty || 0) - c.allocationQty!)
            )[0]
          : qtyPool[0]) || undefined;
    }

    let recVal = c.recordedAmount;
    if (recVal <= 0) {
      const sameMonthSub =
        !directSub && dealerName !== '—'
          ? db.dealerSuballocations.find(
              (s) =>
                s.category === (matchedDo?.category || c.category) &&
                namesLikelyMatch(s.dealerName, dealerName) &&
                ((matchedDo?.unoMemo && normMemoNo(s.unoMemo) === normMemoNo(matchedDo.unoMemo)) ||
                  (refMonth && monthKey(s.unoDate) === refMonth))
            )
          : undefined;
      const matchedSub = directSub || sameMonthSub;
      const effCat = matchedDo?.category || matchedSub?.category || c.category;
      const rate = rateMap.get(effCat);
      const effUnitPrice = rate && rate.unitPrice > 0 ? rate.unitPrice : effCat === 'খাদ্য বান্ধব' ? 13000 : 0;
      const effTaxRate = rate && rate.taxRate > 0 ? rate.taxRate : effCat === 'খাদ্য বান্ধব' ? 200 : 0;
      const effQty =
        matchedSub?.allocationQty || c.allocationQty || matchedDo?.allocationQty || 0;

      if (c.challanType === 'আয়কর চালান') {
        recVal =
          matchedDo?.requiredTaxAmount ||
          matchedSub?.taxAmount ||
          round2(effQty * effTaxRate);
      } else {
        recVal =
          matchedDo?.requiredAmount ||
          matchedSub?.totalAmount ||
          round2(effQty * effUnitPrice);
      }
    }
    const rec = round2(recVal);
    const dep = round2(c.depositedAmount);
    const diff = round2(dep - rec);
    const isExcess = dep > rec;
    const isDeficit = dep < rec;

    const hasSignature =
      signRule === 'excess_or_equal' ? dep > 0 && dep >= rec : dep > rec;

    let mismatchStr = '০.০০ (সঠিক)';
    if (isExcess) {
      mismatchStr = `+${formatBnMoney(diff)} (বেশি জমা)`;
    } else if (isDeficit) {
      mismatchStr = `-${formatBnMoney(Math.abs(diff))} (কম জমা)`;
    }

    const resolvedDoNo = c.doNo || matchedDo?.doNo || '';
    const resolvedDoDate = c.doDate || matchedDo?.issueDate || '';
    const doDisplay = resolvedDoNo
      ? resolvedDoDate
        ? `ডিও- ${toBnDigits(resolvedDoNo)}\nতাং- ${formatBnDate(resolvedDoDate)}`
        : `ডিও- ${toBnDigits(resolvedDoNo)}`
      : '—';

    return {
      id: c.id,
      groupValues: [],
      cells: {
        date: formatBnDate(c.challanDate),
        category: c.category,
        dealer: dealerName,
        doNo: doDisplay,
        type: c.challanType,
        challanNo: `${toBnDigits(c.challanNo)}${c.bankName ? `\n(${c.bankName})` : ''}`,
        recorded: formatBnMoney(rec),
        deposited: formatBnMoney(dep),
        mismatch: mismatchStr,
        signature: '',
      },
      hasSignature,
      highlight: isExcess ? 'excess' : isDeficit ? 'deficit' : 'none',
    };
  });

  const leaves = columns.map((c) => c.leaf!);
  return {
    id: 'reg-challan',
    title: 'চালান রেজিস্টার',
    columns,
    leaves,
    mergeDepth: 0,
    colWidths: computeRegisterColWidths(leaves, true),
    tableLayoutFixed: true,
    rows,
  };
}

export interface MonthlyDistRow {
  category: AllocationCategory;
  categoryBn: string;
  previousRice: number;
  previousWheat: number;
  previousAtta: number;
  currentRice: number;
  currentWheat: number;
  currentAtta: number;
  cumulativeRice: number;
  cumulativeWheat: number;
  cumulativeAtta: number;
}

export function buildMonthlyDistributionReport(
  db: AllocationDatabase,
  month0: number,
  year: number,
  categoryFilter: string
) {
  const fy = fiscalYearLabel(year, month0);
  const grainMap = new Map<string, 'চাল' | 'গম' | 'আটা'>();
  for (const m of db.ministryAllocations) {
    grainMap.set(`${m.category}::${m.memoNo}`, m.grain);
  }

  const targetCats =
    categoryFilter && categoryFilter !== 'ALL'
      ? CATEGORIES.filter((c) => c.category === categoryFilter)
      : CATEGORIES;

  const rows: MonthlyDistRow[] = targetCats.map((meta) => {
    const r: MonthlyDistRow = {
      category: meta.category,
      categoryBn: meta.category,
      previousRice: 0,
      previousWheat: 0,
      previousAtta: 0,
      currentRice: 0,
      currentWheat: 0,
      currentAtta: 0,
      cumulativeRice: 0,
      cumulativeWheat: 0,
      cumulativeAtta: 0,
    };

    for (const d of db.doIssues) {
      if (d.category !== meta.category) continue;
      const my = parseMonthYear(d.issueDate);
      if (!my) continue;
      const rel = isMonthInFiscalUpTo(my.year, my.month, year, month0);
      if (rel === 'after' || rel === 'outside') continue;
      const grain =
        grainMap.get(`${d.category}::${d.ministryMemo}`) || meta.defaultGrain || 'চাল';
      const qty = Number(d.allocationQty) || 0;
      if (rel === 'before') {
        if (grain === 'গম') r.previousWheat = round3(r.previousWheat + qty);
        else if (grain === 'আটা') r.previousAtta = round3(r.previousAtta + qty);
        else r.previousRice = round3(r.previousRice + qty);
      } else if (rel === 'current') {
        if (grain === 'গম') r.currentWheat = round3(r.currentWheat + qty);
        else if (grain === 'আটা') r.currentAtta = round3(r.currentAtta + qty);
        else r.currentRice = round3(r.currentRice + qty);
      }
    }

    r.cumulativeRice = round3(r.previousRice + r.currentRice);
    r.cumulativeWheat = round3(r.previousWheat + r.currentWheat);
    r.cumulativeAtta = round3(r.previousAtta + r.currentAtta);
    return r;
  });

  const totals = rows.reduce(
    (acc, r) => ({
      previousRice: round3(acc.previousRice + r.previousRice),
      previousWheat: round3(acc.previousWheat + r.previousWheat),
      previousAtta: round3(acc.previousAtta + r.previousAtta),
      currentRice: round3(acc.currentRice + r.currentRice),
      currentWheat: round3(acc.currentWheat + r.currentWheat),
      currentAtta: round3(acc.currentAtta + r.currentAtta),
      cumulativeRice: round3(acc.cumulativeRice + r.cumulativeRice),
      cumulativeWheat: round3(acc.cumulativeWheat + r.cumulativeWheat),
      cumulativeAtta: round3(acc.cumulativeAtta + r.cumulativeAtta),
    }),
    {
      previousRice: 0,
      previousWheat: 0,
      previousAtta: 0,
      currentRice: 0,
      currentWheat: 0,
      currentAtta: 0,
      cumulativeRice: 0,
      cumulativeWheat: 0,
      cumulativeAtta: 0,
    }
  );

  return { fiscalYear: fy, monthName: BENGALI_MONTHS[month0] || '', rows, totals };
}

export function buildCashSaleReport(db: AllocationDatabase, month0: number, year: number) {
  const rateMap = new Map(db.rates.map((r) => [r.category, r]));
  const grainMap = new Map(
    db.ministryAllocations.map((m) => [`${m.category}::${normMemoNo(m.memoNo)}`, m.grain])
  );
  const subById = new Map(db.dealerSuballocations.map((s) => [s.id.trim(), s]));

  interface CashChallanItem {
    challanNo: string;
    challanDate: string;
    qty: number;
    amount: number;
    grain: string;
  }

  const rows: Array<{
    channel: AllocationCategory;
    product: string;
    suppliedQuantity: number;
    rate: number;
    challan: string;
    amount: number;
  }> = [];

  for (const channel of CHALLAN_CATEGORIES) {
    const rateRec = rateMap.get(channel);
    const configuredRate =
      rateRec && rateRec.unitPrice > 0
        ? rateRec.unitPrice
        : channel === 'খাদ্য বান্ধব'
          ? 13000
          : 0;

    const items: CashChallanItem[] = [];
    const seenChallanNos = new Set<string>();

    // Only main challans ('মূল চালান'), never 'আয়কর চালান'
    for (const c of db.challans) {
      if (c.challanType !== 'মূল চালান') continue;
      if (c.category !== channel) continue;
      const my = parseMonthYear(c.challanDate || c.doDate || '');
      if (!my || my.year !== year || my.month !== month0) continue;

      const chKey = normMemoNo(c.challanNo);
      if (chKey) seenChallanNos.add(chKey);

      const matchedDo = db.doIssues.find(
        (d) =>
          d.category === channel &&
          ((c.doNo && d.doNo && normMemoNo(d.doNo) === normMemoNo(c.doNo)) ||
            (chKey && d.challanNo && normMemoNo(d.challanNo) === chKey) ||
            (c.dealerAllocationId &&
              d.dealerAllocationId &&
              normMemoNo(d.dealerAllocationId) === normMemoNo(c.dealerAllocationId)))
      );
      const matchedSub = c.dealerAllocationId ? subById.get(c.dealerAllocationId.trim()) : undefined;
      const amount = round2(c.depositedAmount > 0 ? c.depositedAmount : matchedDo?.challanAmount || 0);
      let qty =
        matchedDo?.allocationQty ||
        c.allocationQty ||
        matchedSub?.allocationQty ||
        0;
      if (qty <= 0 && configuredRate > 0 && amount > 0) {
        qty = round3(amount / configuredRate);
      }
      const grain =
        (matchedDo
          ? grainMap.get(`${channel}::${normMemoNo(matchedDo.ministryMemo)}`)
          : undefined) ||
        CATEGORY_BY_NAME[channel]?.defaultGrain ||
        'চাল';

      items.push({
        challanNo: (c.challanNo || '').trim(),
        challanDate: c.challanDate || c.doDate || matchedDo?.issueDate || '',
        qty: round3(qty),
        amount,
        grain,
      });
    }

    // Include main challans recorded directly on DOIssue if not already present in db.challans
    for (const d of db.doIssues) {
      if (d.category !== channel) continue;
      if (!d.challanNo && !(d.challanAmount && d.challanAmount > 0)) continue;
      const effDate = d.challanDate || d.issueDate;
      const my = parseMonthYear(effDate);
      if (!my || my.year !== year || my.month !== month0) continue;

      const chKey = normMemoNo(d.challanNo);
      if (chKey && seenChallanNos.has(chKey)) continue;
      if (chKey) seenChallanNos.add(chKey);

      const amount = round2(
        d.challanAmount && d.challanAmount > 0
          ? d.challanAmount
          : configuredRate > 0
            ? d.allocationQty * configuredRate
            : 0
      );
      const grain =
        grainMap.get(`${channel}::${normMemoNo(d.ministryMemo)}`) ||
        CATEGORY_BY_NAME[channel]?.defaultGrain ||
        'চাল';

      items.push({
        challanNo: (d.challanNo || '').trim(),
        challanDate: effDate,
        qty: round3(d.allocationQty || 0),
        amount,
        grain,
      });
    }

    if (items.length === 0) continue;

    items.sort((a, b) => {
      const dc = (a.challanDate || '').localeCompare(b.challanDate || '');
      if (dc !== 0) return dc;
      return bnToEnDigits(a.challanNo).localeCompare(bnToEnDigits(b.challanNo), undefined, {
        numeric: true,
      });
    });

    const totalChannelQty = round3(items.reduce((s, it) => s + it.qty, 0));
    const totalChannelAmt = round2(items.reduce((s, it) => s + it.amount, 0));
    const effRate =
      configuredRate > 0
        ? configuredRate
        : totalChannelQty > 0
          ? round2(totalChannelAmt / totalChannelQty)
          : 0;

    const challanEntries = items.map((it) => {
      const noStr = it.challanNo ? toBnDigits(it.challanNo) : '—';
      const dtStr = it.challanDate ? ` (${formatBnDate(it.challanDate)})` : '';
      return `${noStr}${dtStr}`;
    });
    const challanLines: string[] = [];
    for (let i = 0; i < challanEntries.length; i += 2) {
      challanLines.push(challanEntries.slice(i, i + 2).join(', '));
    }
    const challanListText = challanLines.join('\n');

    rows.push({
      channel,
      product: items[0]?.grain || CATEGORY_BY_NAME[channel]?.defaultGrain || 'চাল',
      suppliedQuantity: totalChannelQty,
      rate: effRate,
      challan: challanListText || '—',
      amount: totalChannelAmt,
    });
  }

  const totalQty = round3(rows.reduce((s, r) => s + r.suppliedQuantity, 0));
  const totalAmount = round2(rows.reduce((s, r) => s + r.amount, 0));

  return { monthName: BENGALI_MONTHS[month0] || '', rows, totalQty, totalAmount };
}

export function buildEPRationReport(db: AllocationDatabase, month0: number, year: number) {
  const fy = fiscalYearLabel(year, month0);
  const byInst = new Map<
    string,
    { institution: string; rice: number; wheat: number; cumulativeRice: number; cumulativeWheat: number }
  >();

  const defaultInst = db.fireServices[0]?.officeName || 'ফায়ার সার্ভিস ও সিভিল ডিফেন্স';

  for (const d of db.doIssues) {
    if (d.category !== 'ইপি চাল' && d.category !== 'ইপি গম') continue;
    const my = parseMonthYear(d.issueDate);
    if (!my) continue;
    const rel = isMonthInFiscalUpTo(my.year, my.month, year, month0);
    if (rel === 'after' || rel === 'outside') continue;
    const inst = d.recipientName || defaultInst;
    const cur = byInst.get(inst) || {
      institution: inst,
      rice: 0,
      wheat: 0,
      cumulativeRice: 0,
      cumulativeWheat: 0,
    };
    if (d.category === 'ইপি গম') {
      if (rel === 'current') cur.wheat = round3(cur.wheat + d.allocationQty);
      cur.cumulativeWheat = round3(cur.cumulativeWheat + d.allocationQty);
    } else {
      if (rel === 'current') cur.rice = round3(cur.rice + d.allocationQty);
      cur.cumulativeRice = round3(cur.cumulativeRice + d.allocationQty);
    }
    byInst.set(inst, cur);
  }

  return {
    fiscalYear: fy,
    monthName: BENGALI_MONTHS[month0] || '',
    rows: Array.from(byInst.values()),
  };
}

export function buildFoodAllocOrderMemos(db: AllocationDatabase, month0: number, year: number) {
  const byMemo = new Map<string, { memo: string; date: string; count: number; totalQty: number }>();
  for (const s of db.dealerSuballocations) {
    if (s.category !== 'খাদ্য বান্ধব') continue;
    const my = parseMonthYear(s.unoDate);
    if (!my || my.year !== year || my.month !== month0) continue;
    const cur = byMemo.get(s.unoMemo) || {
      memo: s.unoMemo,
      date: s.unoDate,
      count: 0,
      totalQty: 0,
    };
    cur.count += 1;
    cur.totalQty = round3(cur.totalQty + s.allocationQty);
    byMemo.set(s.unoMemo, cur);
  }
  return Array.from(byMemo.values());
}

export function buildFoodAllocOrderRows(
  db: AllocationDatabase,
  month0: number,
  year: number,
  unoMemo: string
) {
  const findDealerInfo = (dealerName: string) =>
    db.foodDealers.find((d) => namesLikelyMatch(d.dealerName, dealerName));
  const rows = db.dealerSuballocations
    .filter((s) => {
      if (s.category !== 'খাদ্য বান্ধব') return false;
      const my = parseMonthYear(s.unoDate);
      if (!my || my.year !== year || my.month !== month0) return false;
      return !unoMemo || normMemoNo(s.unoMemo) === normMemoNo(unoMemo);
    })
    .map((s) => {
      const info = findDealerInfo(s.dealerName);
      return {
        union: s.unionName,
        salesCenter: s.salesCenter,
        dealerName: s.dealerName,
        mobile: info?.mobile || '',
        cards: Math.max(0, s.cardCount - s.unusedCards),
        qty: s.allocationQty,
        amount: s.totalAmount,
        tax: s.taxAmount,
        unoDate: s.unoDate,
      };
    });

  const unionOrder = db.officer.unions || [];
  rows.sort((a, b) => {
    const ia = unionOrder.indexOf(a.union);
    const ib = unionOrder.indexOf(b.union);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.union.localeCompare(b.union);
  });

  return {
    monthName: BENGALI_MONTHS[month0] || '',
    year,
    memo: unoMemo || rows[0]?.unoDate || '',
    memoDate: rows[0]?.unoDate || '',
    rows,
  };
}

export function getPendingDORecipients(db: AllocationDatabase) {
  const { remainingBySubKey } = matchDOsToSuballocations(db);

  const out: Array<{
    key: string;
    subId: string;
    category: AllocationCategory;
    unionName: string;
    recipientName: string;
    salesCenter: string;
    ministryMemo: string;
    dcMemo: string;
    unoMemo: string;
    unoDate: string;
    projectNo: string;
    allocated: number;
    remaining: number;
  }> = [];

  for (const s of db.dealerSuballocations) {
    const remaining = remainingBySubKey.get(`ds:${s.id}`) ?? s.allocationQty;
    if (remaining > 0.0005) {
      const catMeta = CATEGORY_BY_NAME[s.category];
      const dcRec = catMeta?.requiresDC
        ? db.dcAllocations.find(
            (d) => d.category === s.category && memosLikelyMatch(d.dcMemo, s.sourceMemo)
          )
        : undefined;
      out.push({
        key: `ds-${s.id}-${out.length}`,
        subId: s.id,
        category: s.category,
        unionName: s.unionName,
        recipientName: s.dealerName,
        salesCenter: s.salesCenter,
        ministryMemo: dcRec ? dcRec.ministryMemo : s.sourceMemo,
        dcMemo: dcRec ? dcRec.dcMemo : '',
        unoMemo: s.unoMemo,
        unoDate: s.unoDate,
        projectNo: '',
        allocated: s.allocationQty,
        remaining,
      });
    }
  }

  for (const u of db.unoSuballocations) {
    const remaining = remainingBySubKey.get(`uno:${u.id}`) ?? u.allocationQty;
    if (remaining > 0.0005) {
      out.push({
        key: `uno-${u.id}-${out.length}`,
        subId: u.id,
        category: u.category,
        unionName: u.unionName,
        recipientName: u.recipientName,
        salesCenter: u.projectName || '',
        ministryMemo: u.ministryMemo,
        dcMemo: u.dcMemo,
        unoMemo: u.unoMemo,
        unoDate: u.unoDate,
        projectNo: u.projectNo || '',
        allocated: u.allocationQty,
        remaining,
      });
    }
  }

  return out;
}
