import {
  CATEGORY_BY_NAME,
  type AllocationCategory,
  type AllocationDatabase,
  type DCAllocation,
  type ProjectEntry,
} from '../types/allocation';
import {
  bnToEnDigits,
  fiscalYearLabel,
  memosLikelyMatch,
  namesLikelyMatch,
  normMemoNo,
  parseMonthYear,
  round3,
} from './bnUtils';

export const PROJECT_CATEGORIES: AllocationCategory[] = [
  'জি আর',
  'কাবিখা সাধারণ চাল',
  'কাবিখা সাধারণ গম',
  'কাবিখা বিশেষ চাল',
  'কাবিখা বিশেষ গম',
];

export interface EnrichedPendingProject {
  project: ProjectEntry;
  dcRecord?: DCAllocation;
  ministryMemo: string;
  dcDate: string;
  fiscalYear: string;
  allocatedQty: number;
  pendingQty: number;
}

export function doesUnoSubMatchProject(
  u: AllocationDatabase['unoSuballocations'][number],
  p: ProjectEntry
): boolean {
  if (u.category !== p.category) return false;
  const memoMatches =
    !p.dcMemo ||
    !u.dcMemo ||
    normMemoNo(u.dcMemo) === normMemoNo(p.dcMemo) ||
    memosLikelyMatch(u.dcMemo, p.dcMemo);
  if (!memoMatches) return false;

  if (u.projectNo && p.projectNo && normMemoNo(u.projectNo) === normMemoNo(p.projectNo)) {
    return true;
  }
  if (
    u.projectName &&
    p.projectName &&
    namesLikelyMatch(u.projectName, p.projectName)
  ) {
    return true;
  }
  if (
    p.projectName &&
    u.recipientName &&
    namesLikelyMatch(u.recipientName, p.projectName)
  ) {
    return true;
  }
  return false;
}

export function computeEnrichedProjects(
  db: AllocationDatabase,
  options?: { category?: AllocationCategory; dcMemo?: string; pendingOnly?: boolean }
): EnrichedPendingProject[] {
  const dcByKey = new Map<string, DCAllocation>();
  for (const d of db.dcAllocations) {
    dcByKey.set(`${d.category}::${normMemoNo(d.dcMemo)}`, d);
  }

  // Track used UNO quantities greedily per project so duplicates don't double-count
  const unoRemainingToConsume = new Map<string, number>();
  for (const u of db.unoSuballocations) {
    unoRemainingToConsume.set(u.id, Math.max(0, Number(u.allocationQty) || 0));
  }

  const results: EnrichedPendingProject[] = [];

  for (const p of db.projects) {
    const meta = CATEGORY_BY_NAME[p.category];
    if (!meta?.supportsProjects) continue;

    const dcRecord =
      dcByKey.get(`${p.category}::${normMemoNo(p.dcMemo)}`) ||
      db.dcAllocations.find(
        (d) => d.category === p.category && memosLikelyMatch(d.dcMemo, p.dcMemo)
      );

    let allocated = 0;
    for (const u of db.unoSuballocations) {
      const left = unoRemainingToConsume.get(u.id) || 0;
      if (left <= 0.0005) continue;
      if (!doesUnoSubMatchProject(u, p)) continue;
      const projCap = Math.max(0, round3((Number(p.allocationQty) || 0) - allocated));
      if (projCap <= 0.0005) break;
      const take = Math.min(left, projCap);
      allocated = round3(allocated + take);
      unoRemainingToConsume.set(u.id, round3(left - take));
    }

    const total = round3(Number(p.allocationQty) || 0);
    const pendingQty = round3(Math.max(0, total - allocated));
    const dcDate = dcRecord?.dcMemoDate || p.createdAt?.slice(0, 10) || '';
    const parsed = dcDate ? parseMonthYear(dcDate) : null;
    const fiscalYear = parsed ? fiscalYearLabel(parsed.year, parsed.month) : 'অনির্ধারিত';

    results.push({
      project: p,
      dcRecord,
      ministryMemo: dcRecord?.ministryMemo || '',
      dcDate,
      fiscalYear,
      allocatedQty: allocated,
      pendingQty,
    });
  }

  return results.filter((item) => {
    if (options?.category && item.project.category !== options.category) return false;
    if (
      options?.dcMemo &&
      normMemoNo(item.project.dcMemo) !== normMemoNo(options.dcMemo) &&
      !memosLikelyMatch(item.project.dcMemo, options.dcMemo)
    ) {
      return false;
    }
    if (options?.pendingOnly && item.pendingQty <= 0.0005) return false;
    return true;
  });
}

export function matchesProjectPin(storedPin: string | undefined, enteredPin: string): boolean {
  const cleanStored = (storedPin || '').trim();
  if (!cleanStored) return true;
  const cleanEntered = enteredPin.trim();
  if (!cleanEntered) return false;
  if (cleanStored === cleanEntered) return true;
  return bnToEnDigits(cleanStored) === bnToEnDigits(cleanEntered);
}
