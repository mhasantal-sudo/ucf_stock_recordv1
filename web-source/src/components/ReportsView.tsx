import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Coins,
  Download,
  Edit3,
  FileCheck2,
  FileSpreadsheet,
  FileWarning,
  Flame,
  Printer,
  RectangleHorizontal,
  Smartphone,
  Store,
  Users,
} from 'lucide-react';
import {
  CATEGORIES,
  type AllocationDatabase,
  type ReportTemplateId,
} from '../types/allocation';
import {
  buildCashSaleReport,
  buildEPRationReport,
  buildFoodAllocOrderMemos,
  buildFoodAllocOrderRows,
  buildMonthlyDistributionReport,
  getDoBookRegisterStats,
  getUnusedDoNumbers,
} from '../shared/allocReportEngine';
import {
  BENGALI_MONTHS,
  formatBnDate,
  formatBnInt,
  formatBnMoney,
  formatBnQty,
  normMemoNo,
  round2,
  round3,
  toBnDigits,
  todayIsoDate,
} from '../shared/bnUtils';
import {
  OfficialA4Document,
  type DocColumnGroup,
  type DocColumnLeaf,
  type DocKpiBox,
  type DocRowData,
  type DocTotalRow,
  type OfficialA4DocumentHandle,
} from './OfficialA4Document';

export type ReportSectionId =
  | 'monthly-dist'
  | 'monthly-cash'
  | 'monthly-ep'
  | 'alloc-food'
  | 'do-reg-book'
  | 'do-reg-issue'
  | 'do-reg-unused'
  | 'dlr-rep-food'
  | 'dlr-rep-oms';

type ReportParentGroup = 'monthly' | 'dealer' | 'do';

interface ReportsViewProps {
  db: AllocationDatabase;
  activeReportId: ReportSectionId;
  onSelectReport: (id: ReportSectionId) => void;
  onSaveReportMemo: (key: string, no: string, date: string) => void;
  onEditTemplate: (tplId: ReportTemplateId) => void;
  onChangeOrientation: (tplId: ReportTemplateId, orientation: 'portrait' | 'landscape') => void;
}

const REPORT_PARENT_GROUPS: Array<{
  key: ReportParentGroup;
  label: string;
  items: Array<{
    id: ReportSectionId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    fg: string;
  }>;
}> = [
  {
    key: 'monthly',
    label: 'মাসিক রিপোর্ট',
    items: [
      { id: 'monthly-dist', label: 'মাসিক বিতরণ রিপোর্ট', icon: BarChart3, bg: 'bg-rose-50 border-rose-200', fg: 'text-[#E2136E]' },
      { id: 'monthly-cash', label: 'নগদ বিক্রয় রিপোর্ট', icon: Coins, bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700' },
      { id: 'monthly-ep', label: 'ইপি রেশন রিপোর্ট', icon: Flame, bg: 'bg-orange-50 border-orange-200', fg: 'text-orange-700' },
      { id: 'alloc-food', label: 'খাদ্য বান্ধব বরাদ্দাদেশ', icon: FileSpreadsheet, bg: 'bg-teal-50 border-teal-200', fg: 'text-teal-700' },
    ],
  },
  {
    key: 'dealer',
    label: 'ডিলার রিপোর্ট',
    items: [
      { id: 'dlr-rep-food', label: 'খাদ্য বান্ধব ডিলার', icon: Users, bg: 'bg-rose-50 border-rose-200', fg: 'text-[#E2136E]' },
      { id: 'dlr-rep-oms', label: 'ওএমএস ডিলার', icon: Store, bg: 'bg-sky-50 border-sky-200', fg: 'text-sky-700' },
    ],
  },
  {
    key: 'do',
    label: 'ডিউ রিপোর্ট',
    items: [
      { id: 'do-reg-book', label: 'ডিও বই রেজিস্ট্রার', icon: BookOpen, bg: 'bg-indigo-50 border-indigo-200', fg: 'text-indigo-700' },
      { id: 'do-reg-issue', label: 'ডিও ইস্যু রেজিস্টার', icon: FileCheck2, bg: 'bg-rose-50 border-rose-200', fg: 'text-[#E2136E]' },
      { id: 'do-reg-unused', label: 'অব্যবহৃত ডিও তালিকা', icon: FileWarning, bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700' },
    ],
  },
];

const DO_ISSUE_COLUMN_DEFS = [
  { key: 'doNo', label: 'ডিও নং' },
  { key: 'issueDate', label: 'ইস্যু তারিখ' },
  { key: 'category', label: 'খাত' },
  { key: 'union', label: 'ইউনিয়ন' },
  { key: 'recipient', label: 'প্রাপক / ডিলার' },
  { key: 'salesCenter', label: 'বিক্রয় কেন্দ্র' },
  { key: 'unoMemo', label: 'উপবরাদ্দ স্মারক' },
  { key: 'qty', label: 'পরিমাণ (মে.টন)' },
  { key: 'challan', label: 'চালান নং ও টাকা' },
  { key: 'signature', label: 'স্বাক্ষর' },
] as const;

const FOOD_DEALER_COLUMN_DEFS = [
  { key: 'unionName', label: 'ইউনিয়ন' },
  { key: 'dealerName', label: 'ডিলারের নাম' },
  { key: 'fatherName', label: 'পিতার নাম' },
  { key: 'nid', label: 'এনআইডি' },
  { key: 'mobile', label: 'মোবাইল' },
  { key: 'salesCenter', label: 'বিক্রয় কেন্দ্র' },
  { key: 'cardCount', label: 'কার্ড সংখ্যা' },
  { key: 'totalQty', label: 'চাল (মে.টন)' },
  { key: 'poNo', label: 'পে-অর্ডার নং' },
  { key: 'poDate', label: 'পে-অর্ডার তারিখ' },
  { key: 'bankName', label: 'ব্যাংকের নাম' },
  { key: 'amount', label: 'জামানত টাকা' },
  { key: 'supervisorName', label: 'তদারকি কর্মকর্তা' },
  { key: 'supervisorDesignation', label: 'কর্মকর্তার পদবি' },
  { key: 'supervisorMobile', label: 'কর্মকর্তার মোবাইল' },
] as const;

const OMS_DEALER_COLUMN_DEFS = [
  { key: 'areaType', label: 'এলাকার ধরন' },
  { key: 'unionName', label: 'ইউনিয়ন' },
  { key: 'municipality', label: 'পৌরসভা' },
  { key: 'dealerName', label: 'ডিলারের নাম' },
  { key: 'fatherName', label: 'পিতার নাম' },
  { key: 'nid', label: 'এনআইডি' },
  { key: 'mobile', label: 'মোবাইল' },
  { key: 'salesCenter', label: 'বিক্রয় কেন্দ্র' },
  { key: 'poNo', label: 'পে-অর্ডার নং' },
  { key: 'poDate', label: 'পে-অর্ডার তারিখ' },
  { key: 'bankName', label: 'ব্যাংকের নাম' },
  { key: 'amount', label: 'জামানত টাকা' },
  { key: 'supervisorName', label: 'তদারকি কর্মকর্তা' },
  { key: 'supervisorDesignation', label: 'কর্মকর্তার পদবি' },
  { key: 'supervisorMobile', label: 'কর্মকর্তার মোবাইল' },
] as const;

function findGroupForReport(id: ReportSectionId): ReportParentGroup {
  for (const grp of REPORT_PARENT_GROUPS) {
    if (grp.items.some((x) => x.id === id)) return grp.key;
  }
  return 'monthly';
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  db,
  activeReportId,
  onSelectReport,
  onSaveReportMemo,
  onEditTemplate,
  onChangeOrientation,
}) => {
  const now = new Date();
  const docRef = useRef<OfficialA4DocumentHandle>(null);

  const [activeParent, setActiveParent] = useState<ReportParentGroup>(() =>
    findGroupForReport(activeReportId)
  );
  const [month0, setMonth0] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [catFilter, setCatFilter] = useState('ALL');
  const [selectedFoodMemo, setSelectedFoodMemo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bookFilter, setBookFilter] = useState('ALL');

  const [doIssueCols, setDoIssueCols] = useState<string[]>([
    'doNo',
    'issueDate',
    'category',
    'union',
    'recipient',
    'unoMemo',
    'qty',
    'challan',
    'signature',
  ]);
  const [foodDealerCols, setFoodDealerCols] = useState<string[]>([
    'unionName',
    'dealerName',
    'fatherName',
    'nid',
    'mobile',
    'salesCenter',
    'cardCount',
    'totalQty',
    'poNo',
    'bankName',
    'supervisorName',
  ]);
  const [omsDealerCols, setOmsDealerCols] = useState<string[]>([
    'areaType',
    'unionName',
    'municipality',
    'dealerName',
    'fatherName',
    'nid',
    'mobile',
    'salesCenter',
    'poNo',
    'bankName',
    'amount',
    'supervisorName',
  ]);

  useEffect(() => {
    setActiveParent(findGroupForReport(activeReportId));
  }, [activeReportId]);

  const togglePickerCol = (
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    key: string
  ) => {
    setList((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const template = db.templates[activeReportId];
  const colLabel = (key: string, def: string) => template.columnLabels[key]?.trim() || def;

  const foodMemos = useMemo(
    () => buildFoodAllocOrderMemos(db, month0, year),
    [db, month0, year]
  );

  useEffect(() => {
    if (foodMemos.length > 0 && !foodMemos.some((m) => m.memo === selectedFoodMemo)) {
      setSelectedFoodMemo(foodMemos[0].memo);
    } else if (foodMemos.length === 0 && selectedFoodMemo) {
      setSelectedFoodMemo('');
    }
  }, [foodMemos, selectedFoodMemo]);

  const memoKey =
    activeReportId === 'alloc-food'
      ? `alloc-food::${year}-${month0}::${selectedFoodMemo}`
      : `${activeReportId}::${year}-${month0}`;
  const savedMemo = db.reportMemos[memoKey];
  const currentMemoNo = savedMemo?.no ?? `${template.memoPrefix}`;
  const currentMemoDate = savedMemo?.date ?? todayIsoDate();

  interface ReportPayload {
    subjectResolved: string;
    introResolved: string;
    columns: DocColumnGroup[];
    leaves: DocColumnLeaf[];
    mergeDepth: number;
    showSerialCol: boolean;
    serialColLabel: string;
    colWidths?: string[];
    tableLayoutFixed?: boolean;
    footerLayout?: 'side_by_side' | 'sign_above_copy';
    rows: DocRowData[];
    totalRow: DocTotalRow | null;
    secondarySection?: { title: string; columns: DocColumnLeaf[]; rows: DocRowData[] } | null;
    kpiBoxes?: DocKpiBox[];
    bannerNote?: string;
    showRecipientBlock: boolean;
    showIntroBlock: boolean;
    showCopyBlock: boolean;
  }

  const reportPayload = useMemo<ReportPayload>((): ReportPayload => {
    const monthName = BENGALI_MONTHS[month0] || '';
    const yrBn = toBnDigits(year);
    const resolvePlaceholders = (s: string) =>
      s.replace(/\{মাস\}/g, monthName).replace(/\{বছর\}/g, yrBn);

    if (activeReportId === 'monthly-dist') {
      const rep = buildMonthlyDistributionReport(db, month0, year, catFilter);
      const cPrevR: DocColumnLeaf = { key: 'pr', label: colLabel('pr', 'চাল'), align: 'right' };
      const cPrevW: DocColumnLeaf = { key: 'pw', label: colLabel('pw', 'গম'), align: 'right' };
      const cPrevA: DocColumnLeaf = { key: 'pa', label: colLabel('pa', 'আটা'), align: 'right' };
      const cCurR: DocColumnLeaf = { key: 'cr', label: colLabel('cr', 'চাল'), align: 'right' };
      const cCurW: DocColumnLeaf = { key: 'cw', label: colLabel('cw', 'গম'), align: 'right' };
      const cCurA: DocColumnLeaf = { key: 'ca', label: colLabel('ca', 'আটা'), align: 'right' };
      const cTotR: DocColumnLeaf = { key: 'tr', label: colLabel('tr', 'চাল'), align: 'right' };
      const cTotW: DocColumnLeaf = { key: 'tw', label: colLabel('tw', 'গম'), align: 'right' };
      const cTotA: DocColumnLeaf = { key: 'ta', label: colLabel('ta', 'আটা'), align: 'right' };
      const cCat: DocColumnLeaf = { key: 'cat', label: colLabel('cat', 'খাতের নাম'), align: 'left' };

      const columns: DocColumnGroup[] = [
        { label: colLabel('cat', 'খাতের নাম'), leaf: cCat },
        { label: `পূর্ববর্তী ক্রমপুঞ্জিত (${rep.fiscalYear})`, children: [cPrevR, cPrevW, cPrevA] },
        { label: `বর্তমান মাস (${rep.monthName} ${yrBn})`, children: [cCurR, cCurW, cCurA] },
        { label: 'বর্তমান ক্রমপুঞ্জিত', children: [cTotR, cTotW, cTotA] },
      ];
      const leaves = [cCat, cPrevR, cPrevW, cPrevA, cCurR, cCurW, cCurA, cTotR, cTotW, cTotA];
      const rows: DocRowData[] = rep.rows.map((r) => ({
        id: r.category,
        cells: {
          cat: r.categoryBn,
          pr: formatBnQty(r.previousRice),
          pw: formatBnQty(r.previousWheat),
          pa: formatBnQty(r.previousAtta),
          cr: formatBnQty(r.currentRice),
          cw: formatBnQty(r.currentWheat),
          ca: formatBnQty(r.currentAtta),
          tr: formatBnQty(r.cumulativeRice),
          tw: formatBnQty(r.cumulativeWheat),
          ta: formatBnQty(r.cumulativeAtta),
        },
        hasSignature: false,
      }));
      const totalRow: DocTotalRow = {
        label: template.totalLabel || 'মোট',
        labelColSpan: 1,
        values: {
          pr: formatBnQty(rep.totals.previousRice),
          pw: formatBnQty(rep.totals.previousWheat),
          pa: formatBnQty(rep.totals.previousAtta),
          cr: formatBnQty(rep.totals.currentRice),
          cw: formatBnQty(rep.totals.currentWheat),
          ca: formatBnQty(rep.totals.currentAtta),
          tr: formatBnQty(rep.totals.cumulativeRice),
          tw: formatBnQty(rep.totals.cumulativeWheat),
          ta: formatBnQty(rep.totals.cumulativeAtta),
        },
      };
      return {
        subjectResolved: `${resolvePlaceholders(template.subject)} (মাস: ${monthName} ${yrBn}, অর্থবছর: ${rep.fiscalYear})`,
        introResolved: resolvePlaceholders(template.introText),
        columns,
        leaves,
        mergeDepth: 0,
        showSerialCol: true,
        serialColLabel: 'ক্রম',
        colWidths: ['5%', '22%', '8%', '8%', '8%', '8%', '8%', '8%', '8%', '8%', '9%'],
        tableLayoutFixed: true,
        rows,
        totalRow,
        showRecipientBlock: true,
        showIntroBlock: Boolean(template.introText.trim()),
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'monthly-cash') {
      const rep = buildCashSaleReport(db, month0, year);
      const leaves: DocColumnLeaf[] = [
        { key: 'monthName', label: colLabel('monthName', 'মাসের নাম'), align: 'center' },
        { key: 'channel', label: colLabel('channel', 'চ্যানেলের নাম'), align: 'left' },
        { key: 'product', label: colLabel('product', 'পণ্য'), align: 'center' },
        { key: 'qty', label: colLabel('qty', 'সরবরাহকৃত পরিমাণ'), align: 'right' },
        { key: 'rate', label: colLabel('rate', 'দর'), align: 'right' },
        { key: 'challan', label: colLabel('challan', 'চালান নং / তারিখ'), align: 'left' },
        { key: 'amount', label: colLabel('amount', 'জমাকৃত টাকার পরিমাণ'), align: 'right' },
      ];
      return {
        subjectResolved: `${resolvePlaceholders(template.subject)} (মাস: ${rep.monthName} ${yrBn})`,
        introResolved: resolvePlaceholders(template.introText),
        columns: leaves.map((l) => ({ label: l.label, leaf: l })),
        leaves,
        mergeDepth: 0,
        showSerialCol: true,
        serialColLabel: 'ক্রম',
        colWidths: ['4%', '8.5%', '10.5%', '5.5%', '8.5%', '7.5%', '44.5%', '11%'],
        tableLayoutFixed: true,
        rows: rep.rows.map((r, i) => ({
          id: `cash-${i}`,
          cells: {
            monthName: `${rep.monthName} ${yrBn}`,
            channel: r.channel,
            product: r.product,
            qty: formatBnQty(r.suppliedQuantity),
            rate: formatBnMoney(r.rate),
            challan: r.challan,
            amount: formatBnMoney(r.amount),
          },
          hasSignature: false,
        })),
        totalRow: {
          label: template.totalLabel || 'মোট',
          labelColSpan: 3,
          values: {
            qty: formatBnQty(rep.totalQty),
            rate: '',
            challan: '',
            amount: formatBnMoney(rep.totalAmount),
          },
        },
        showRecipientBlock: true,
        showIntroBlock: Boolean(template.introText.trim()),
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'monthly-ep') {
      const rep = buildEPRationReport(db, month0, year);
      const cInst: DocColumnLeaf = {
        key: 'inst',
        label: colLabel('inst', 'বিশেষ জরুরী গ্রাহক (ইপি)'),
        align: 'left',
      };
      const cCr: DocColumnLeaf = { key: 'cr', label: colLabel('cr', 'চাল'), align: 'right' };
      const cCw: DocColumnLeaf = { key: 'cw', label: colLabel('cw', 'গম'), align: 'right' };
      const cTr: DocColumnLeaf = { key: 'tr', label: colLabel('tr', 'চাল'), align: 'right' };
      const cTw: DocColumnLeaf = { key: 'tw', label: colLabel('tw', 'গম'), align: 'right' };
      const columns: DocColumnGroup[] = [
        { label: cInst.label, leaf: cInst },
        { label: `চলতি মাসের বিতরণ (মে.টন) — ${rep.monthName} ${yrBn}`, children: [cCr, cCw] },
        { label: `ক্রমপুঞ্জিত মোট (মে.টন) — ${rep.fiscalYear}`, children: [cTr, cTw] },
      ];
      const leaves = [cInst, cCr, cCw, cTr, cTw];
      const tot = rep.rows.reduce(
        (a, r) => ({
          cr: round3(a.cr + r.rice),
          cw: round3(a.cw + r.wheat),
          tr: round3(a.tr + r.cumulativeRice),
          tw: round3(a.tw + r.cumulativeWheat),
        }),
        { cr: 0, cw: 0, tr: 0, tw: 0 }
      );
      return {
        subjectResolved: `${resolvePlaceholders(template.subject)} (মাস: ${rep.monthName} ${yrBn})`,
        introResolved: resolvePlaceholders(template.introText),
        columns,
        leaves,
        mergeDepth: 0,
        showSerialCol: true,
        serialColLabel: 'ক্রম',
        colWidths: ['7%', '37%', '14%', '14%', '14%', '14%'],
        tableLayoutFixed: true,
        rows: rep.rows.map((r, i) => ({
          id: `ep-${i}`,
          cells: {
            inst: r.institution,
            cr: formatBnQty(r.rice),
            cw: formatBnQty(r.wheat),
            tr: formatBnQty(r.cumulativeRice),
            tw: formatBnQty(r.cumulativeWheat),
          },
          hasSignature: false,
        })),
        totalRow: {
          label: template.totalLabel || 'সর্বমোট',
          labelColSpan: 1,
          values: {
            cr: formatBnQty(tot.cr),
            cw: formatBnQty(tot.cw),
            tr: formatBnQty(tot.tr),
            tw: formatBnQty(tot.tw),
          },
        },
        showRecipientBlock: true,
        showIntroBlock: Boolean(template.introText.trim()),
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'alloc-food') {
      const ord = buildFoodAllocOrderRows(db, month0, year, selectedFoodMemo);
      const leaves: DocColumnLeaf[] = [
        { key: 'union', label: colLabel('union', 'ইউনিয়ন'), align: 'center' },
        { key: 'serial', label: colLabel('serial', 'ক্রমিক'), align: 'center' },
        { key: 'center', label: colLabel('center', 'বিক্রয় কেন্দ্র'), align: 'left' },
        { key: 'dealer', label: colLabel('dealer', 'ডিলারের নাম'), align: 'left' },
        { key: 'mobile', label: colLabel('mobile', 'মোবাইল'), align: 'center' },
        { key: 'cards', label: colLabel('cards', 'কার্ড'), align: 'center' },
        { key: 'qty', label: colLabel('qty', 'পরিমাণ'), align: 'right' },
        { key: 'amount', label: colLabel('amount', 'টাকা'), align: 'right' },
        { key: 'tax', label: colLabel('tax', 'আয়কর'), align: 'right' },
      ];
      const totCards = ord.rows.reduce((s, r) => s + r.cards, 0);
      const totQty = round3(ord.rows.reduce((s, r) => s + r.qty, 0));
      const totAmt = round2(ord.rows.reduce((s, r) => s + r.amount, 0));
      const totTax = round2(ord.rows.reduce((s, r) => s + r.tax, 0));

      let prevUnion = '';
      let unionDealerIdx = 0;

      return {
        subjectResolved: resolvePlaceholders(template.subject),
        introResolved: resolvePlaceholders(template.introText),
        columns: leaves.map((l) => ({ label: l.label, leaf: l })),
        leaves,
        mergeDepth: 1,
        showSerialCol: false,
        serialColLabel: 'ক্রমিক',
        colWidths: ['11%', '6%', '13%', '24%', '12%', '8%', '10%', '9%', '7%'],
        tableLayoutFixed: true,
        footerLayout: 'sign_above_copy',
        rows: ord.rows.map((r, i) => {
          const cleanUnion = r.union.replace(/\s*ইউনিয়ন$/g, '').trim() || r.union;
          if (cleanUnion !== prevUnion) {
            prevUnion = cleanUnion;
            unionDealerIdx = 1;
          } else {
            unionDealerIdx++;
          }
          return {
            id: `fa-${i}`,
            groupValues: [cleanUnion],
            cells: {
              union: cleanUnion,
              serial: toBnDigits(i + 1),
              center: r.salesCenter || '—',
              dealer: `${toBnDigits(unionDealerIdx)}। ${template.namePrefix || ''}${r.dealerName}`,
              mobile: toBnDigits(r.mobile || '—'),
              cards: formatBnInt(r.cards),
              qty: formatBnQty(r.qty),
              amount: formatBnMoney(r.amount),
              tax: formatBnMoney(r.tax),
            },
            hasSignature: false,
          };
        }),
        totalRow: {
          label: template.totalLabel || 'সর্বমোট',
          labelColSpan: 5,
          values: {
            cards: formatBnInt(totCards),
            qty: formatBnQty(totQty),
            amount: formatBnMoney(totAmt),
            tax: formatBnMoney(totTax),
          },
        },
        showRecipientBlock: false,
        showIntroBlock: true,
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'do-reg-book') {
      const stats = getDoBookRegisterStats(db);
      const leaves: DocColumnLeaf[] = [
        { key: 'bookNo', label: colLabel('bookNo', 'বই নং'), align: 'center' },
        { key: 'startPage', label: colLabel('startPage', 'শুরু পাতা'), align: 'center' },
        { key: 'endPage', label: colLabel('endPage', 'শেষ পাতা'), align: 'center' },
        { key: 'total', label: colLabel('total', 'মোট ডিও'), align: 'center' },
        { key: 'used', label: colLabel('used', 'ব্যবহৃত ডিও'), align: 'center' },
      ];
      return {
        subjectResolved: resolvePlaceholders(template.subject),
        introResolved: '',
        columns: leaves.map((l) => ({ label: l.label, leaf: l })),
        leaves,
        mergeDepth: 0,
        showSerialCol: false,
        serialColLabel: 'ক্রম',
        colWidths: ['20%', '20%', '20%', '20%', '20%'],
        tableLayoutFixed: true,
        rows: stats.usedRows.map((r) => ({
          id: `bk-${r.bookNo}`,
          cells: {
            bookNo: toBnDigits(r.bookNo),
            startPage: toBnDigits(r.startPage),
            endPage: toBnDigits(r.endPage),
            total: formatBnInt(r.totalCount),
            used: formatBnInt(r.usedCount),
          },
          hasSignature: false,
        })),
        totalRow: {
          label: template.totalLabel || 'মোট',
          labelColSpan: 3,
          values: {
            total: formatBnInt(stats.summary.totalDO),
            used: formatBnInt(stats.summary.totalUsed),
          },
        },
        secondarySection: {
          title: '২। অব্যবহৃত ডিও পাতার হিসাব',
          columns: [
            { key: 'bookNo', label: 'বই নং', align: 'center' },
            { key: 'unusedRange', label: 'অব্যবহৃত পাতা', align: 'left' },
            { key: 'unusedCount', label: 'মোট অব্যবহৃত', align: 'center' },
          ],
          rows: stats.unusedRows.map((u) => ({
            id: `ubk-${u.bookNo}`,
            cells: {
              bookNo: toBnDigits(u.bookNo),
              unusedRange: u.unusedRange,
              unusedCount: formatBnInt(u.unusedCount),
            },
          })),
        },
        kpiBoxes: [
          { label: 'মোট ডিও', value: formatBnInt(stats.summary.totalDO), tone: 'neutral' },
          { label: 'ব্যবহৃত', value: formatBnInt(stats.summary.totalUsed), tone: 'emerald' },
          { label: 'অব্যবহৃত', value: formatBnInt(stats.summary.totalUnused), tone: 'amber' },
        ],
        showRecipientBlock: false,
        showIntroBlock: false,
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'do-reg-issue') {
      const filtered = db.doIssues
        .filter((d) => {
          if (catFilter !== 'ALL' && d.category !== catFilter) return false;
          if (startDate && d.issueDate < startDate) return false;
          if (endDate && d.issueDate > endDate) return false;
          return true;
        })
        .sort((a, b) => a.issueDate.localeCompare(b.issueDate));

      const selectedSet = new Set(doIssueCols);
      const allIssueLeaves: DocColumnLeaf[] = DO_ISSUE_COLUMN_DEFS.filter((def) =>
        selectedSet.has(def.key)
      ).map((def) => ({
        key: def.key,
        label: colLabel(def.key, def.label),
        align:
          def.key === 'qty'
            ? 'right'
            : def.key === 'doNo' || def.key === 'issueDate' || def.key === 'signature'
              ? 'center'
              : 'left',
        isSignature: def.key === 'signature',
      }));

      const totQty = round3(filtered.reduce((s, d) => s + d.allocationQty, 0));
      const qtyIdx = allIssueLeaves.findIndex((l) => l.key === 'qty');

      return {
        subjectResolved: resolvePlaceholders(template.subject),
        introResolved: '',
        columns: allIssueLeaves.map((l) => ({ label: l.label, leaf: l })),
        leaves: allIssueLeaves,
        mergeDepth: 0,
        showSerialCol: true,
        serialColLabel: 'ক্রম',
        rows: filtered.map((d) => {
          const mainRec = d.challanNo
            ? db.challans.find(
                (c) =>
                  c.challanType === 'মূল চালান' &&
                  normMemoNo(c.challanNo) === normMemoNo(d.challanNo)
              )
            : d.dealerAllocationId
              ? db.challans.find(
                  (c) =>
                    c.challanType === 'মূল চালান' &&
                    c.dealerAllocationId &&
                    normMemoNo(c.dealerAllocationId) === normMemoNo(d.dealerAllocationId)
                )
              : undefined;
          const taxRec = d.taxChallanNo
            ? db.challans.find(
                (c) =>
                  c.challanType === 'আয়কর চালান' &&
                  normMemoNo(c.challanNo) === normMemoNo(d.taxChallanNo)
              )
            : d.dealerAllocationId
              ? db.challans.find(
                  (c) =>
                    c.challanType === 'আয়কর চালান' &&
                    c.dealerAllocationId &&
                    normMemoNo(c.dealerAllocationId) === normMemoNo(d.dealerAllocationId)
                )
              : undefined;
          const mainNo = d.challanNo || mainRec?.challanNo;
          const taxNo = d.taxChallanNo || taxRec?.challanNo;
          const mainAmt = d.challanAmount || mainRec?.depositedAmount || 0;
          const taxAmt = d.taxChallanAmount || taxRec?.depositedAmount || 0;
          const challanParts: string[] = [];
          if (mainNo || mainAmt > 0) {
            challanParts.push(
              `মূল: ${mainNo ? toBnDigits(mainNo) : '—'}${mainAmt > 0 ? ` (জমা: ${formatBnMoney(mainAmt)} ৳)` : ''}`
            );
          }
          if (taxNo || taxAmt > 0) {
            challanParts.push(
              `আয়কর: ${taxNo ? toBnDigits(taxNo) : '—'}${taxAmt > 0 ? ` (জমা: ${formatBnMoney(taxAmt)} ৳)` : ''}`
            );
          }
          return {
            id: d.id,
            cells: {
              doNo: toBnDigits(d.doNo),
              issueDate: formatBnDate(d.issueDate),
              category: d.category,
              union: d.unionName || '—',
              recipient: d.recipientName,
              salesCenter: d.salesCenter || '—',
              unoMemo: toBnDigits(d.unoMemo || '—'),
              qty: formatBnQty(d.allocationQty),
              challan: challanParts.length > 0 ? challanParts.join('\n') : '—',
              signature: '',
            },
            hasSignature: Boolean(String(d.doNo || '').trim()),
          };
        }),
        totalRow:
          qtyIdx >= 0
            ? {
                label: template.totalLabel || 'মোট',
                labelColSpan: qtyIdx,
                values: {
                  qty: formatBnQty(totQty),
                },
              }
            : null,
        showRecipientBlock: false,
        showIntroBlock: false,
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'do-reg-unused') {
      const list = getUnusedDoNumbers(db).filter(
        (u) => bookFilter === 'ALL' || String(u.bookNo) === bookFilter
      );
      const leaves: DocColumnLeaf[] = [
        { key: 'bookNo', label: colLabel('bookNo', 'বই নং'), align: 'center' },
        { key: 'doNo', label: colLabel('doNo', 'ডিও নং'), align: 'center' },
        { key: 'startPage', label: colLabel('startPage', 'শুরু পাতা'), align: 'center' },
        { key: 'endPage', label: colLabel('endPage', 'শেষ পাতা'), align: 'center' },
      ];
      return {
        subjectResolved: resolvePlaceholders(template.subject),
        introResolved: '',
        columns: leaves.map((l) => ({ label: l.label, leaf: l })),
        leaves,
        mergeDepth: 0,
        showSerialCol: false,
        serialColLabel: 'ক্রম',
        colWidths: ['25%', '25%', '25%', '25%'],
        tableLayoutFixed: true,
        bannerNote: `মোট অব্যবহৃত ডিও: ${formatBnInt(list.length)} টি`,
        rows: list.map((u) => ({
          id: `un-${u.doNo}`,
          cells: {
            bookNo: toBnDigits(u.bookNo),
            doNo: toBnDigits(u.doNo),
            startPage: toBnDigits(u.startPage),
            endPage: toBnDigits(u.endPage),
          },
          hasSignature: false,
        })),
        totalRow: null,
        showRecipientBlock: false,
        showIntroBlock: false,
        showCopyBlock: template.showCopyBlock,
      };
    }

    if (activeReportId === 'dlr-rep-food') {
      const selectedSet = new Set(foodDealerCols);
      const leaves: DocColumnLeaf[] = FOOD_DEALER_COLUMN_DEFS.filter((def) =>
        selectedSet.has(def.key)
      ).map((def) => ({
        key: def.key,
        label: colLabel(def.key, def.label),
        align:
          def.key === 'totalQty' || def.key === 'amount'
            ? 'right'
            : def.key === 'cardCount' || def.key === 'mobile' || def.key === 'poDate'
              ? 'center'
              : 'left',
      }));
      const totCards = db.foodDealers.reduce((s, d) => s + (d.cardCount || 0), 0);
      const totQty = round3(db.foodDealers.reduce((s, d) => s + (d.totalQty || 0), 0));
      const cardsIdx = leaves.findIndex((l) => l.key === 'cardCount');
      const qtyIdx = leaves.findIndex((l) => l.key === 'totalQty');
      const firstTotIdx =
        cardsIdx >= 0 && qtyIdx >= 0
          ? Math.min(cardsIdx, qtyIdx)
          : Math.max(cardsIdx, qtyIdx);

      return {
        subjectResolved: resolvePlaceholders(template.subject),
        introResolved: '',
        columns: leaves.map((l) => ({ label: l.label, leaf: l })),
        leaves,
        mergeDepth: leaves[0]?.key === 'unionName' ? 1 : 0,
        showSerialCol: true,
        serialColLabel: 'ক্রম',
        rows: db.foodDealers.map((d) => ({
          id: d.id,
          groupValues: leaves[0]?.key === 'unionName' ? [d.unionName] : [],
          cells: {
            unionName: d.unionName,
            dealerName: d.dealerName,
            fatherName: d.fatherName || '—',
            nid: d.nid ? toBnDigits(d.nid) : '—',
            mobile: d.mobile ? toBnDigits(d.mobile) : '—',
            salesCenter: d.salesCenter || '—',
            cardCount: formatBnInt(d.cardCount),
            totalQty: formatBnQty(d.totalQty),
            poNo: d.poNo ? toBnDigits(d.poNo) : '—',
            poDate: d.poDate ? formatBnDate(d.poDate) : '—',
            bankName: d.bankName || '—',
            amount: d.amount ? formatBnMoney(d.amount) : '—',
            supervisorName: d.supervisorName || '—',
            supervisorDesignation: d.supervisorDesignation || '—',
            supervisorMobile: d.supervisorMobile ? toBnDigits(d.supervisorMobile) : '—',
          },
          hasSignature: false,
        })),
        totalRow:
          firstTotIdx >= 0
            ? {
                label: template.totalLabel || 'সর্বমোট',
                labelColSpan: firstTotIdx,
                values: {
                  cardCount: formatBnInt(totCards),
                  totalQty: formatBnQty(totQty),
                },
              }
            : null,
        showRecipientBlock: false,
        showIntroBlock: false,
        showCopyBlock: template.showCopyBlock,
      };
    }

    // dlr-rep-oms
    const selectedOmsSet = new Set(omsDealerCols);
    const leaves: DocColumnLeaf[] = OMS_DEALER_COLUMN_DEFS.filter((def) =>
      selectedOmsSet.has(def.key)
    ).map((def) => ({
      key: def.key,
      label: colLabel(def.key, def.label),
      align:
        def.key === 'amount'
          ? 'right'
          : def.key === 'areaType' || def.key === 'mobile' || def.key === 'poDate'
            ? 'center'
            : 'left',
    }));
    const totAmount = round2(db.omsDealers.reduce((s, d) => s + (Number(d.amount) || 0), 0));
    const amtIdx = leaves.findIndex((l) => l.key === 'amount');

    return {
      subjectResolved: resolvePlaceholders(template.subject),
      introResolved: '',
      columns: leaves.map((l) => ({ label: l.label, leaf: l })),
      leaves,
      mergeDepth: 0,
      showSerialCol: true,
      serialColLabel: 'ক্রম',
      rows: db.omsDealers.map((d) => ({
        id: d.id,
        cells: {
          areaType: d.areaType || '—',
          unionName: d.unionName || '—',
          municipality: d.municipality || '—',
          dealerName: d.dealerName,
          fatherName: d.fatherName || '—',
          nid: d.nid ? toBnDigits(d.nid) : '—',
          mobile: d.mobile ? toBnDigits(d.mobile) : '—',
          salesCenter: d.salesCenter || '—',
          poNo: d.poNo ? toBnDigits(d.poNo) : '—',
          poDate: d.poDate ? formatBnDate(d.poDate) : '—',
          bankName: d.bankName || '—',
          amount: d.amount ? formatBnMoney(d.amount) : '—',
          supervisorName: d.supervisorName || '—',
          supervisorDesignation: d.supervisorDesignation || '—',
          supervisorMobile: d.supervisorMobile ? toBnDigits(d.supervisorMobile) : '—',
        },
        hasSignature: false,
      })),
      totalRow:
        amtIdx >= 0 && totAmount > 0
          ? {
              label: template.totalLabel || 'সর্বমোট',
              labelColSpan: amtIdx,
              values: {
                amount: formatBnMoney(totAmount),
              },
            }
          : null,
      showRecipientBlock: false,
      showIntroBlock: false,
      showCopyBlock: template.showCopyBlock,
    };
  }, [
    activeReportId,
    db,
    month0,
    year,
    catFilter,
    selectedFoodMemo,
    startDate,
    endDate,
    bookFilter,
    template,
    doIssueCols,
    foodDealerCols,
    omsDealerCols,
  ]);

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 2, cur - 1, cur, cur + 1];
  }, []);

  const currentGroupConfig = useMemo(
    () => REPORT_PARENT_GROUPS.find((g) => g.key === activeParent) || REPORT_PARENT_GROUPS[0],
    [activeParent]
  );

  const showMonthYearRow =
    activeReportId === 'monthly-dist' ||
    activeReportId === 'monthly-cash' ||
    activeReportId === 'monthly-ep' ||
    activeReportId === 'alloc-food';

  const currentOrientation = template?.orientation || 'portrait';

  return (
    <div className="space-y-4 font-nikosh">
      {/* Top 3 Parent Report Options + Circular Sub-Menu Icons */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3.5">
        <div className="grid grid-cols-3 gap-2">
          {REPORT_PARENT_GROUPS.map((grp) => {
            const active = grp.key === activeParent;
            return (
              <button
                key={grp.key}
                type="button"
                onClick={() => {
                  setActiveParent(grp.key);
                  if (!grp.items.some((x) => x.id === activeReportId)) {
                    onSelectReport(grp.items[0].id);
                  }
                }}
                className={`min-h-[44px] rounded-xl px-2.5 py-2 text-xs font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#E2136E] text-white border-[#E2136E]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {grp.label}
              </button>
            );
          })}
        </div>

        {/* Sub-menu circular icons beneath selected parent */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          {currentGroupConfig.items.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeReportId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectReport(item.id)}
                className={`flex items-center sm:flex-col sm:justify-center gap-2.5 sm:gap-1.5 rounded-2xl border p-2.5 sm:p-3 text-left sm:text-center transition-all cursor-pointer active:scale-95 ${
                  active
                    ? 'border-[#E2136E] bg-rose-50/50 shadow-xs'
                    : 'border-slate-100 bg-white hover:border-rose-200 hover:bg-slate-50/70'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${item.bg} ${item.fg}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-800 leading-snug">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Structured Reactive Filter Grid */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* Row 1: Left Month, Right Year */}
          {showMonthYearRow && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">মাস</label>
                <select
                  value={month0}
                  onChange={(e) => setMonth0(Number(e.target.value))}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
                >
                  {BENGALI_MONTHS.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">বছর</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {toBnDigits(y)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Row 2: Left Memo No (স্মারক), Right Date (তারিখ) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">স্মারক</label>
              <input
                type="text"
                value={currentMemoNo}
                onChange={(e) => onSaveReportMemo(memoKey, e.target.value, currentMemoDate)}
                placeholder="স্মারক নম্বর"
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">তারিখ</label>
              <input
                type="date"
                value={currentMemoDate}
                onChange={(e) => onSaveReportMemo(memoKey, currentMemoNo, e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white"
              />
            </div>
          </div>

          {/* Contextual Extra Filters */}
          {(activeReportId === 'monthly-dist' || activeReportId === 'do-reg-issue') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">খাত ফিল্টার</label>
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
                >
                  <option value="ALL">সকল খাত</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.category}>
                      {c.category}
                    </option>
                  ))}
                </select>
              </div>
              {activeReportId === 'do-reg-issue' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">শুরুর তারিখ</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">শেষ তারিখ</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeReportId === 'alloc-food' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                উপবরাদ্দ স্মারক নির্বাচন
              </label>
              <select
                value={selectedFoodMemo}
                onChange={(e) => setSelectedFoodMemo(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
              >
                {foodMemos.length === 0 ? (
                  <option value="">নির্বাচিত মাসে কোনো বরাদ্দ নেই</option>
                ) : (
                  foodMemos.map((m) => (
                    <option key={m.memo} value={m.memo}>
                      {toBnDigits(m.memo)} ({formatBnDate(m.date)} · {formatBnQty(m.totalQty)} মে.টন)
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {activeReportId === 'do-reg-unused' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">ডিও বই ফিল্টার</label>
              <select
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                className="w-full sm:w-64 min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
              >
                <option value="ALL">সকল বই</option>
                {db.doBooks.map((b) => (
                  <option key={b.id} value={String(b.bookNo)}>
                    বই নং {toBnDigits(b.bookNo)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Column Picker Checkboxes */}
          {(activeReportId === 'do-reg-issue' ||
            activeReportId === 'dlr-rep-food' ||
            activeReportId === 'dlr-rep-oms') && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700">কলাম নির্বাচন করুন:</div>
              <div className="flex flex-wrap gap-1.5">
                {(activeReportId === 'do-reg-issue'
                  ? DO_ISSUE_COLUMN_DEFS
                  : activeReportId === 'dlr-rep-food'
                    ? FOOD_DEALER_COLUMN_DEFS
                    : OMS_DEALER_COLUMN_DEFS
                ).map((def) => {
                  const selectedList =
                    activeReportId === 'do-reg-issue'
                      ? doIssueCols
                      : activeReportId === 'dlr-rep-food'
                        ? foodDealerCols
                        : omsDealerCols;
                  const setSelectedList =
                    activeReportId === 'do-reg-issue'
                      ? setDoIssueCols
                      : activeReportId === 'dlr-rep-food'
                        ? setFoodDealerCols
                        : setOmsDealerCols;
                  const checked = selectedList.includes(def.key);
                  return (
                    <label
                      key={def.key}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 cursor-pointer font-semibold ${
                        checked
                          ? 'border-rose-300 bg-rose-50/70 text-[#E2136E]'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePickerCol(setSelectedList, def.key)}
                      />
                      <span>{def.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rendered A4 Official Report + Single-Line Floating Export Bar */}
      <div className="relative">
        <OfficialA4Document
          ref={docRef}
          hideDefaultToolbar={true}
          template={template}
          officer={db.officer}
          subjectResolved={reportPayload.subjectResolved}
          introResolved={reportPayload.introResolved}
          memoNo={currentMemoNo}
          memoDate={currentMemoDate}
          onSaveMemo={(no, dt) => onSaveReportMemo(memoKey, no, dt)}
          columns={reportPayload.columns}
          leaves={reportPayload.leaves}
          mergeDepth={reportPayload.mergeDepth}
          showSerialCol={reportPayload.showSerialCol}
          serialColLabel={reportPayload.serialColLabel}
          colWidths={reportPayload.colWidths}
          tableLayoutFixed={reportPayload.tableLayoutFixed}
          footerLayout={reportPayload.footerLayout}
          rows={reportPayload.rows}
          totalRow={reportPayload.totalRow}
          secondarySection={reportPayload.secondarySection || null}
          kpiBoxes={reportPayload.kpiBoxes}
          bannerNote={reportPayload.bannerNote}
          showRecipientBlock={reportPayload.showRecipientBlock}
          showIntroBlock={reportPayload.showIntroBlock}
          showCopyBlock={reportPayload.showCopyBlock}
          showOfficerSignatureBlock={true}
          pdfFileName={`${activeReportId}-${new Date().toISOString().slice(0, 10)}.pdf`}
          onEditTemplate={() => onEditTemplate(activeReportId)}
        />

        {/* Lightly Floating Single-Line Symbol-Only Export Bar Over PDF Bottom */}
        <div className="no-print sticky bottom-[70px] lg:bottom-4 z-30 -mt-14 pt-2 pb-1.5 px-1 flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center flex-nowrap gap-1.5 rounded-full border border-rose-200/80 bg-white/85 backdrop-blur-md shadow-[0_6px_22px_rgba(226,19,110,0.18)] px-2 py-1.5">
            <button
              type="button"
              onClick={() => onChangeOrientation(activeReportId, 'portrait')}
              title="পোর্ট্রেট মোড"
              aria-label="পোর্ট্রেট মোড"
              className={`h-9 w-10 sm:h-10 sm:w-11 shrink-0 inline-flex items-center justify-center rounded-full cursor-pointer transition-colors ${
                currentOrientation === 'portrait'
                  ? 'bg-[#E2136E] text-white shadow-xs'
                  : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onChangeOrientation(activeReportId, 'landscape')}
              title="ল্যান্ডস্কেপ মোড"
              aria-label="ল্যান্ডস্কেপ মোড"
              className={`h-9 w-10 sm:h-10 sm:w-11 shrink-0 inline-flex items-center justify-center rounded-full cursor-pointer transition-colors ${
                currentOrientation === 'landscape'
                  ? 'bg-[#E2136E] text-white shadow-xs'
                  : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              <RectangleHorizontal className="h-4 w-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onEditTemplate(activeReportId)}
              title="এডিট করুন"
              aria-label="এডিট করুন"
              className="h-9 w-10 sm:h-10 sm:w-11 shrink-0 inline-flex items-center justify-center rounded-full border border-slate-200/80 bg-white/85 hover:bg-rose-50 text-[#E2136E] cursor-pointer transition-colors"
            >
              <Edit3 className="h-4 w-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => docRef.current?.printDoc()}
              title="প্রিন্ট / Save as PDF"
              aria-label="প্রিন্ট / Save as PDF"
              className="h-9 w-10 sm:h-10 sm:w-11 shrink-0 inline-flex items-center justify-center rounded-full border border-slate-200/80 bg-white/85 hover:bg-rose-50 text-slate-800 cursor-pointer transition-colors"
            >
              <Printer className="h-4 w-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => void docRef.current?.exportPdf()}
              title="ডাউনলোড করুন"
              aria-label="ডাউনলোড করুন"
              className="h-9 w-10 sm:h-10 sm:w-11 shrink-0 inline-flex items-center justify-center rounded-full bg-[#E2136E] hover:bg-[#B80D58] text-white shadow-xs cursor-pointer transition-colors"
            >
              <Download className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
