const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export const BENGALI_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

export function toBnDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function bnToEnDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFC')
    .replace(/[০-৯]/g, (ch) => {
      const idx = BN_DIGITS.indexOf(ch);
      return idx >= 0 ? String(idx) : ch;
    });
}

export function parseNum(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = bnToEnDigits(String(val ?? ''))
    .replace(/[,\s৳]/g, '')
    .replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function round3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatBnQty(val: number | null | undefined): string {
  const n = Number(val) || 0;
  return toBnDigits(n.toFixed(3));
}

export function formatBnMoney(val: number | null | undefined): string {
  const n = Number(val) || 0;
  return toBnDigits(
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function formatBnInt(val: number | null | undefined): string {
  const n = Math.round(Number(val) || 0);
  return toBnDigits(n);
}

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatBnDate(isoOrRaw: string | null | undefined): string {
  const s = bnToEnDigits(String(isoOrRaw || '')).trim();
  if (!s) return '';
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) {
    return toBnDigits(
      `${mIso[3].padStart(2, '0')}/${mIso[2].padStart(2, '0')}/${mIso[1]}`
    );
  }
  const mDmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mDmy) {
    return toBnDigits(
      `${mDmy[1].padStart(2, '0')}/${mDmy[2].padStart(2, '0')}/${mDmy[3]}`
    );
  }
  return toBnDigits(s);
}

export function parseMonthYear(dateStr: string): { year: number; month: number } | null {
  const s = bnToEnDigits(String(dateStr || '')).trim();
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) {
    return { year: Number(mIso[1]), month: Number(mIso[2]) - 1 };
  }
  const mDmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mDmy) {
    const a = Number(mDmy[1]);
    const b = Number(mDmy[2]);
    const yr = Number(mDmy[3]);
    const mon = a > 12 ? b : b > 12 ? a : b;
    return { year: yr, month: mon - 1 };
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  return null;
}

export function fiscalYearLabel(year: number, monthIndex0: number): string {
  const startYr = monthIndex0 >= 6 ? year : year - 1;
  return toBnDigits(`${startYr}-${String((startYr + 1) % 100).padStart(2, '0')}`);
}

export function fiscalYearBounds(year: number, monthIndex0: number): {
  fyStartYear: number;
  fyStartMonth0: number;
} {
  const fyStartYear = monthIndex0 >= 6 ? year : year - 1;
  return { fyStartYear, fyStartMonth0: 6 };
}

export function isMonthInFiscalUpTo(
  entryYear: number,
  entryMonth0: number,
  targetYear: number,
  targetMonth0: number
): 'before' | 'current' | 'after' | 'outside' {
  const { fyStartYear } = fiscalYearBounds(targetYear, targetMonth0);
  const fyEndYear = fyStartYear + 1;
  const entryKey = entryYear * 12 + entryMonth0;
  const startKey = fyStartYear * 12 + 6;
  const endKey = fyEndYear * 12 + 5;
  const targetKey = targetYear * 12 + targetMonth0;
  if (entryKey < startKey || entryKey > endKey) return 'outside';
  if (entryKey < targetKey) return 'before';
  if (entryKey === targetKey) return 'current';
  return 'after';
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normMemoNo(input: string | number | null | undefined): string {
  return bnToEnDigits(String(input ?? ''))
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function isFireServiceLabel(input: string | null | undefined): boolean {
  const s = bnToEnDigits(String(input ?? ''))
    .normalize('NFC')
    .trim()
    .toLowerCase();
  if (!s) return false;
  const hasFire = s.includes('ফায়ার') || s.includes('ফায়ার') || s.includes('fire');
  const hasService =
    s.includes('সার্ভিস') ||
    s.includes('service') ||
    s.includes('সিভিল') ||
    s.includes('civil') ||
    s.includes('স্টেশন') ||
    s.includes('station');
  return hasFire && hasService;
}

export function normPersonName(input: string | null | undefined): string {
  return bnToEnDigits(String(input ?? ''))
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(জনাব|মেসার্স|মেসাস|মোঃ|মো:|মো\.|মোছাঃ|মোছা:|মুহাম্মদ|মোহাম্মদ|শ্রী|হাজী|আলহাজ্ব)[,\s.]*/gi, '')
    .replace(/^(জনাব|মেসার্স|মোঃ|মো:|মো\.|মোছাঃ|শ্রী)[,\s.]*/gi, '')
    .replace(/[.,।\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function namesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = bnToEnDigits(String(a ?? '')).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const sb = bnToEnDigits(String(b ?? '')).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (isFireServiceLabel(sa) && isFireServiceLabel(sb)) return true;
  const na = normPersonName(sa);
  const nb = normPersonName(sb);
  return Boolean(na && nb && na === nb);
}

function phoneticBn(s: string): string {
  return normPersonName(s)
    .replace(/্যা/g, 'ে')
    .replace(/[য়য়যজ]/g, 'য')
    .replace(/[ীি]/g, 'ি')
    .replace(/[ূু]/g, 'ু')
    .replace(/[শষসছ]/g, 'স')
    .replace(/[ণন]/g, 'ন')
    .replace(/\s+/g, '');
}

export function namesFuzzyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (namesLikelyMatch(a, b)) return true;
  const pa = phoneticBn(String(a ?? ''));
  const pb = phoneticBn(String(b ?? ''));
  if (!pa || !pb) return false;
  if (pa === pb) return true;
  const minLen = Math.min(pa.length, pb.length);
  if (minLen >= 6 && (pa.includes(pb) || pb.includes(pa))) return true;
  return false;
}

export function unionsLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const clean = (s: string | null | undefined) =>
    bnToEnDigits(String(s ?? ''))
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/(ইউনিয়ন|ইউনিয়ন|ইউপি|পৌরসভা|উপজেলা|সদর|union|pourashava|municipality|upazila)/g, '')
      .replace(/[.,।\-_\s]+/g, '');
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return false;
  return ca === cb || (Math.min(ca.length, cb.length) >= 3 && (ca.includes(cb) || cb.includes(ca)));
}

export function memosLikelyMatch(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean {
  const na = normMemoNo(a);
  const nb = normMemoNo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 2) {
    if (
      longer.endsWith(`-${shorter}`) ||
      longer.endsWith(`/${shorter}`) ||
      longer.endsWith(`.${shorter}`) ||
      longer.endsWith(`–${shorter}`)
    ) {
      return true;
    }
  }
  return false;
}
