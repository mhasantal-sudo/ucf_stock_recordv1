import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  Flame,
  Hammer,
  HeartHandshake,
  Landmark,
  Layers,
  PackageCheck,
  PieChart,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  Wheat,
} from 'lucide-react';
import { CATEGORIES, type AllocationCategory, type AllocationDatabase } from '../types/allocation';
import { getPendingDORecipients } from '../shared/allocReportEngine';
import { formatBnInt, formatBnMoney, formatBnQty, round3, toBnDigits } from '../shared/bnUtils';

interface DashboardViewProps {
  db: AllocationDatabase;
  onSelectCategory: (cat: AllocationCategory) => void;
  onGoToDo: () => void;
  onGoToReports: () => void;
}

const CAT_VISUAL_META: Record<
  AllocationCategory,
  {
    icon: React.ComponentType<{ className?: string }>;
    microLabel: string;
    bg: string;
    fg: string;
    barHex: string;
  }
> = {
  'খাদ্য বান্ধব': {
    icon: Wheat,
    microLabel: 'খাদ্য',
    bg: 'bg-rose-50 border-rose-200',
    fg: 'text-[#E2136E]',
    barHex: '#E2136E',
  },
  'ওএমএস সাধারণ': {
    icon: ShoppingBag,
    microLabel: 'ওএমএস-সা',
    bg: 'bg-sky-50 border-sky-200',
    fg: 'text-sky-700',
    barHex: '#0284c7',
  },
  'ওএমএস বিশেষ': {
    icon: ShoppingBag,
    microLabel: 'ওএমএস-বি',
    bg: 'bg-indigo-50 border-indigo-200',
    fg: 'text-indigo-700',
    barHex: '#4f46e5',
  },
  'ওএমএস টিসিবি': {
    icon: ShoppingBag,
    microLabel: 'টিসিবি',
    bg: 'bg-violet-50 border-violet-200',
    fg: 'text-violet-700',
    barHex: '#7c3aed',
  },
  'ইপি চাল': {
    icon: Flame,
    microLabel: 'ইপি-চাল',
    bg: 'bg-amber-50 border-amber-200',
    fg: 'text-amber-700',
    barHex: '#d97706',
  },
  'ইপি গম': {
    icon: Flame,
    microLabel: 'ইপি-গম',
    bg: 'bg-orange-50 border-orange-200',
    fg: 'text-orange-700',
    barHex: '#ea580c',
  },
  'ভিজিএফ মৎস্য': {
    icon: HeartHandshake,
    microLabel: 'মৎস্য',
    bg: 'bg-teal-50 border-teal-200',
    fg: 'text-teal-700',
    barHex: '#0d9488',
  },
  'ভিজিএফ ঈদ': {
    icon: HeartHandshake,
    microLabel: 'ঈদ',
    bg: 'bg-rose-50 border-rose-200',
    fg: 'text-rose-700',
    barHex: '#e11d48',
  },
  'জি আর': {
    icon: Users,
    microLabel: 'জি আর',
    bg: 'bg-pink-50 border-pink-200',
    fg: 'text-pink-700',
    barHex: '#db2777',
  },
  'কাবিখা সাধারণ চাল': {
    icon: Hammer,
    microLabel: 'কাবি-সা-চা',
    bg: 'bg-lime-50 border-lime-200',
    fg: 'text-lime-700',
    barHex: '#65a30d',
  },
  'কাবিখা সাধারণ গম': {
    icon: Hammer,
    microLabel: 'কাবি-সা-গ',
    bg: 'bg-emerald-50 border-emerald-200',
    fg: 'text-emerald-700',
    barHex: '#16a34a',
  },
  'কাবিখা বিশেষ চাল': {
    icon: Hammer,
    microLabel: 'কাবি-বি-চা',
    bg: 'bg-cyan-50 border-cyan-200',
    fg: 'text-cyan-700',
    barHex: '#0891b2',
  },
  'কাবিখা বিশেষ গম': {
    icon: Hammer,
    microLabel: 'কাবি-বি-গ',
    bg: 'bg-slate-100 border-slate-300',
    fg: 'text-slate-700',
    barHex: '#475569',
  },
  'ভিডাব্লিউভি': {
    icon: Sparkles,
    microLabel: 'ভিডাব্লিউ',
    bg: 'bg-fuchsia-50 border-fuchsia-200',
    fg: 'text-fuchsia-700',
    barHex: '#a21caf',
  },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  db,
  onSelectCategory,
  onGoToDo,
  onGoToReports,
}) => {
  const [showAllBars, setShowAllBars] = useState(false);

  const summary = useMemo(() => {
    const totalMinistry = round3(
      db.ministryAllocations.reduce((s, x) => s + (x.allocationQty || 0), 0)
    );
    const totalDC = round3(db.dcAllocations.reduce((s, x) => s + (x.allocationQty || 0), 0));
    const totalSub = round3(
      db.dealerSuballocations.reduce((s, x) => s + (x.allocationQty || 0), 0) +
        db.unoSuballocations.reduce((s, x) => s + (x.allocationQty || 0), 0)
    );
    const totalDO = round3(db.doIssues.reduce((s, x) => s + (x.allocationQty || 0), 0));
    const totalDeposited = db.challans.reduce((s, c) => s + (c.depositedAmount || 0), 0);
    const totalRecorded = db.challans.reduce((s, c) => s + (c.recordedAmount || 0), 0);

    const usedDoNos = new Set(db.doIssues.map((d) => String(d.doNo).trim()));
    const totalBookPages = db.doBooks.reduce((s, b) => s + (b.totalCount || 0), 0);
    const remainingBookPages = Math.max(0, totalBookPages - usedDoNos.size);

    return {
      totalMinistry,
      totalDC,
      totalSub,
      totalDO,
      totalDeposited,
      totalRecorded,
      totalBookPages,
      usedDoCount: usedDoNos.size,
      remainingBookPages,
    };
  }, [db]);

  const pendingDOs = useMemo(() => getPendingDORecipients(db), [db]);

  const pendingByCategory = useMemo(() => {
    const map = new Map<AllocationCategory, number>();
    for (const p of pendingDOs) {
      map.set(p.category, round3((map.get(p.category) || 0) + p.remaining));
    }
    return map;
  }, [pendingDOs]);

  const totalPendingDoQty = useMemo(
    () => round3(pendingDOs.reduce((s, p) => s + p.remaining, 0)),
    [pendingDOs]
  );

  const categoryRows = useMemo(() => {
    return CATEGORIES.map((meta) => {
      const minQty = round3(
        db.ministryAllocations
          .filter((x) => x.category === meta.category)
          .reduce((s, x) => s + x.allocationQty, 0)
      );
      const dcQty = round3(
        db.dcAllocations
          .filter((x) => x.category === meta.category)
          .reduce((s, x) => s + x.allocationQty, 0)
      );
      const subQty = round3(
        db.dealerSuballocations
          .filter((x) => x.category === meta.category)
          .reduce((s, x) => s + x.allocationQty, 0) +
          db.unoSuballocations
            .filter((x) => x.category === meta.category)
            .reduce((s, x) => s + x.allocationQty, 0)
      );
      const doQty = round3(
        db.doIssues
          .filter((x) => x.category === meta.category)
          .reduce((s, x) => s + x.allocationQty, 0)
      );
      const pendingQty = pendingByCategory.get(meta.category) ?? round3(Math.max(0, subQty - doQty));
      const baseTotal = Math.max(subQty, doQty + pendingQty, minQty, 0);
      const pct = baseTotal > 0 ? Math.min(100, Math.round((doQty / baseTotal) * 100)) : 0;

      return {
        meta,
        visual: CAT_VISUAL_META[meta.category],
        minQty,
        dcQty,
        subQty,
        doQty,
        pendingQty,
        baseTotal,
        pct,
      };
    });
  }, [db, pendingByCategory]);

  const activeCategoryBars = useMemo(() => {
    const withData = categoryRows.filter((r) => r.baseTotal > 0 || r.pendingQty > 0);
    if (showAllBars) return categoryRows;
    return withData.length > 0 ? withData : categoryRows.slice(0, 6);
  }, [categoryRows, showAllBars]);

  const maxBarQty = useMemo(
    () =>
      Math.max(
        1,
        ...activeCategoryBars.map((r) => Math.max(r.subQty, r.doQty + r.pendingQty, r.minQty))
      ),
    [activeCategoryBars]
  );

  // Donut Ring Math (radius = 42, circumference = 2 * PI * 42 ≈ 263.89)
  const doTotalBase = Math.max(0.001, summary.totalDO + totalPendingDoQty);
  const doDoneRatio = summary.totalDO + totalPendingDoQty > 0 ? summary.totalDO / doTotalBase : 0;
  const doDonePct = Math.round(doDoneRatio * 100);
  const donutRadius = 42;
  const donutCirc = 2 * Math.PI * donutRadius;
  const doneArc = donutCirc * doDoneRatio;
  const pendingArc = Math.max(0, donutCirc - doneArc);

  // Stage Pipeline bars relative to Ministry (or max stage)
  const maxStageQty = Math.max(
    1,
    summary.totalMinistry,
    summary.totalDC,
    summary.totalSub,
    summary.totalDO
  );

  return (
    <div className="space-y-4 font-nikosh">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-xl bg-rose-50 border border-rose-200 text-[#E2136E] flex items-center justify-center shrink-0">
            <PieChart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              ড্যাশবোর্ড
            </h2>
            <p className="text-[11px] text-slate-500">বরাদ্দ, ডিও ও বাকি চিত্র</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGoToDo}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>ডিও ইস্যু</span>
          </button>
          <button
            type="button"
            onClick={onGoToReports}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <span>রিপোর্ট</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Compact Icon-First KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onGoToDo}
          className={`text-left rounded-2xl border p-3.5 transition-colors cursor-pointer ${
            totalPendingDoQty > 0.0005
              ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-50'
              : 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                totalPendingDoQty > 0.0005
                  ? 'bg-amber-500 text-white'
                  : 'bg-[#E2136E] text-white'
              }`}
            >
              <Clock className="h-4.5 w-4.5" />
            </span>
            <span className="text-[11px] font-bold text-slate-600">ডিও বাকি</span>
          </div>
          <div
            className={`mt-2.5 text-xl sm:text-2xl font-extrabold tabular-nums leading-none ${
              totalPendingDoQty > 0.0005 ? 'text-amber-800' : 'text-[#E2136E]'
            }`}
          >
            {formatBnQty(totalPendingDoQty)}
            <span className="text-[11px] font-semibold text-slate-500 ml-1">মে.টন</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600 tabular-nums">
            <Users className="h-3 w-3 shrink-0" />
            <span>{formatBnInt(pendingDOs.length)} জন</span>
          </div>
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="h-9 w-9 rounded-xl bg-rose-100 text-[#E2136E] flex items-center justify-center shrink-0">
              <FileCheck2 className="h-4.5 w-4.5" />
            </span>
            <span className="text-[11px] font-bold text-slate-600">ডিও ইস্যু</span>
          </div>
          <div className="mt-2.5 text-xl sm:text-2xl font-extrabold text-[#E2136E] tabular-nums leading-none">
            {formatBnQty(summary.totalDO)}
            <span className="text-[11px] font-semibold text-slate-500 ml-1">মে.টন</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
            পাতা: {formatBnInt(summary.usedDoCount)} / {formatBnInt(summary.totalBookPages)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <Layers className="h-4.5 w-4.5" />
            </span>
            <span className="text-[11px] font-bold text-slate-600">মোট বরাদ্দ</span>
          </div>
          <div className="mt-2.5 text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
            {formatBnQty(summary.totalMinistry)}
            <span className="text-[11px] font-semibold text-slate-500 ml-1">মে.টন</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 tabular-nums">
            <PackageCheck className="h-3 w-3 shrink-0 text-sky-600" />
            <span>উপ: {formatBnQty(summary.totalSub)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
              <Wallet className="h-4.5 w-4.5" />
            </span>
            <span className="text-[11px] font-bold text-slate-600">চালান জমা</span>
          </div>
          <div className="mt-2.5 text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums leading-none truncate">
            ৳ {formatBnMoney(summary.totalDeposited)}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 tabular-nums truncate">
            রেকর্ড: ৳ {formatBnMoney(summary.totalRecorded)}
          </div>
        </div>
      </div>

      {/* Graphical Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Left: SVG Donut Chart & 4-Stage Pipeline Bars */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-[#E2136E]" />
              <span>ডিও অগ্রগতি</span>
            </span>
            <span className="text-[11px] font-bold text-[#E2136E] tabular-nums">
              {toBnDigits(doDonePct)}% সম্পন্ন
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* SVG Donut */}
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
                <circle
                  cx="55"
                  cy="55"
                  r={donutRadius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="12"
                />
                {totalPendingDoQty > 0 && (
                  <circle
                    cx="55"
                    cy="55"
                    r={donutRadius}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="12"
                    strokeDasharray={`${pendingArc} ${donutCirc}`}
                    strokeDashoffset={-doneArc}
                  />
                )}
                {summary.totalDO > 0 && (
                  <circle
                    cx="55"
                    cy="55"
                    r={donutRadius}
                    fill="none"
                    stroke="#E2136E"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${doneArc} ${donutCirc}`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-extrabold text-slate-900 tabular-nums leading-none">
                  {toBnDigits(doDonePct)}%
                </span>
                <span className="text-[10px] font-bold text-slate-500 mt-0.5">ডিও</span>
              </div>
            </div>

            {/* Compact Legend */}
            <div className="flex-1 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#E2136E]" />
                  <span>ইস্যু</span>
                </span>
                <span className="font-extrabold text-[#E2136E] tabular-nums">
                  {formatBnQty(summary.totalDO)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span>বাকি</span>
                </span>
                <span className="font-extrabold text-amber-700 tabular-nums">
                  {formatBnQty(totalPendingDoQty)}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-500">উপবরাদ্দ</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {formatBnQty(summary.totalSub)}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Stage Icon Pipeline Chart */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {[
              {
                label: 'মন্ত্রণালয়',
                qty: summary.totalMinistry,
                icon: Landmark,
                color: 'bg-slate-700',
                iconColor: 'text-slate-700',
              },
              {
                label: 'ডিসি',
                qty: summary.totalDC,
                icon: Building2,
                color: 'bg-violet-600',
                iconColor: 'text-violet-700',
              },
              {
                label: 'উপবরাদ্দ',
                qty: summary.totalSub,
                icon: PackageCheck,
                color: 'bg-sky-600',
                iconColor: 'text-sky-700',
              },
              {
                label: 'ডিও ইস্যু',
                qty: summary.totalDO,
                icon: FileCheck2,
                color: 'bg-[#E2136E]',
                iconColor: 'text-[#E2136E]',
              },
            ].map((st) => {
              const Icon = st.icon;
              const widthPct = Math.max(st.qty > 0 ? 4 : 0, Math.round((st.qty / maxStageQty) * 100));
              return (
                <div key={st.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 inline-flex items-center gap-1.5 font-bold text-slate-700">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${st.iconColor}`} />
                    <span className="truncate">{st.label}</span>
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${st.color} transition-all`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-bold text-slate-800 tabular-nums shrink-0">
                    {formatBnQty(st.qty)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Category Graphical Bar Chart (Icon + Short Label + Stacked Bar) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
              <span>খাতভিত্তিক চিত্র</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#E2136E] font-semibold">
                <span className="h-2 w-2 rounded-full bg-[#E2136E]" /> ডিও
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> বাকি
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowAllBars((v) => !v)}
              className="text-[11px] font-bold text-[#E2136E] hover:underline cursor-pointer"
            >
              {showAllBars ? 'সক্রিয় খাত' : 'সকল ১৪ খাত'}
            </button>
          </div>

          <div className="space-y-2">
            {activeCategoryBars.map(({ meta, visual, doQty, pendingQty, subQty }) => {
              const Icon = visual.icon;
              const totalVisual = Math.max(subQty, doQty + pendingQty);
              const doW = Math.round((doQty / maxBarQty) * 100);
              const pendW = Math.round((pendingQty / maxBarQty) * 100);
              const remW = Math.max(0, Math.round(((totalVisual - doQty - pendingQty) / maxBarQty) * 100));

              return (
                <button
                  key={meta.id}
                  type="button"
                  title={meta.category}
                  onClick={() => onSelectCategory(meta.category)}
                  className="w-full flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <div className="w-24 sm:w-28 shrink-0 flex items-center gap-1.5 min-w-0">
                    <span
                      className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${visual.bg}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${visual.fg}`} />
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 truncate">
                      {visual.microLabel}
                    </span>
                  </div>

                  <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden flex items-center">
                    {doW > 0 && (
                      <div
                        className="h-full bg-[#E2136E]"
                        style={{ width: `${Math.max(2, doW)}%` }}
                      />
                    )}
                    {pendW > 0 && (
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${Math.max(2, pendW)}%` }}
                      />
                    )}
                    {remW > 0 && (
                      <div
                        className="h-full bg-slate-300"
                        style={{ width: `${remW}%` }}
                      />
                    )}
                  </div>

                  <div className="w-24 sm:w-28 shrink-0 text-right text-[11px] tabular-nums">
                    <span className="font-bold text-[#E2136E]">{formatBnQty(doQty)}</span>
                    <span className="text-slate-300 mx-1">/</span>
                    <span
                      className={`font-bold ${
                        pendingQty > 0.0005 ? 'text-amber-700' : 'text-slate-400'
                      }`}
                    >
                      {formatBnQty(pendingQty)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Compact Icon-First Matrix Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Layers className="h-4 w-4 text-[#E2136E]" />
            <span>খাত ছক</span>
          </div>
          <span className="text-[11px] text-slate-500">ট্যাপ করে এন্ট্রি খুলুন</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse tabular-nums">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2 px-3 text-left">খাত</th>
                <th className="py-2 px-2 text-right" title="মন্ত্রণালয়">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Landmark className="h-3.5 w-3.5 text-slate-500" />
                    <span className="hidden sm:inline">মন্ত্ৰ</span>
                  </span>
                </th>
                <th className="py-2 px-2 text-right" title="ডিসি">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Building2 className="h-3.5 w-3.5 text-violet-600" />
                    <span className="hidden sm:inline">ডিসি</span>
                  </span>
                </th>
                <th className="py-2 px-2 text-right" title="উপবরাদ্দ">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <PackageCheck className="h-3.5 w-3.5 text-sky-600" />
                    <span className="hidden sm:inline">উপ</span>
                  </span>
                </th>
                <th className="py-2 px-2 text-right" title="ডিও ইস্যু">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <FileCheck2 className="h-3.5 w-3.5 text-[#E2136E]" />
                    <span className="hidden sm:inline">ডিও</span>
                  </span>
                </th>
                <th className="py-2 px-3 text-right" title="ডিও বাকি">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span className="hidden sm:inline">বাকি</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoryRows.map(({ meta, visual, minQty, dcQty, subQty, doQty, pendingQty, pct }) => {
                const Icon = visual.icon;
                return (
                  <tr
                    key={meta.id}
                    title={meta.category}
                    onClick={() => onSelectCategory(meta.category)}
                    className="hover:bg-rose-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${visual.bg}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${visual.fg}`} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 leading-tight truncate">
                            {visual.microLabel}
                          </div>
                          <div className="mt-0.5 h-1 w-14 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: visual.barHex }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-slate-700">
                      {formatBnQty(minQty)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">
                      {meta.requiresDC ? formatBnQty(dcQty) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-slate-800">
                      {formatBnQty(subQty)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-[#E2136E]">
                      {formatBnQty(doQty)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold">
                      {pendingQty > 0.0005 ? (
                        <span className="text-amber-700">{formatBnQty(pendingQty)}</span>
                      ) : doQty > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 inline-block" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact Pending DO Icon List */}
      {pendingDOs.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs sm:text-sm">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>বাকি ডিও ({formatBnInt(pendingDOs.length)})</span>
            </div>
            <button
              type="button"
              onClick={onGoToDo}
              className="text-xs font-bold text-[#E2136E] hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <span>সব দেখুন</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingDOs.slice(0, 6).map((p) => {
              const v = CAT_VISUAL_META[p.category];
              const Icon = v.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={onGoToDo}
                  className="text-left rounded-xl border border-amber-200/80 bg-white hover:bg-amber-50/50 px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${v.bg}`}
                    >
                      <Icon className={`h-4 w-4 ${v.fg}`} />
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{p.recipientName}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {v.microLabel} · {toBnDigits(p.unoMemo || '—')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="font-extrabold text-amber-700">{formatBnQty(p.remaining)}</div>
                    <div className="text-[9.5px] text-slate-500">মে.টন</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
