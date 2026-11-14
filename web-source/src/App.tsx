import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderKanban,
  Hammer,
  HeartHandshake,
  Home,
  Landmark,
  Layers,
  Lock,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_BY_NAME,
  REPORT_TEMPLATE_CATALOG,
  type AllocationCategory,
  type RegisterId,
  type ReportTemplateId,
} from './types/allocation';
import { getPendingDORecipients } from './shared/allocReportEngine';
import { formatBnQty, round3, toBnDigits } from './shared/bnUtils';
import { computeEnrichedProjects } from './shared/projectHelpers';
import { useAllocationStore } from './store/useAllocationStore';
import { AndroidAuthBridgeScreen } from './components/AndroidAuthBridgeScreen';
import { AllocationSettingsView, type SettingsTabKey } from './components/AllocationSettingsView';
import { CategoryEntryView, type EntryStageKey } from './components/CategoryEntryView';
import { DOWorkspaceView, type DOTabKey } from './components/DOWorkspaceView';
import { DashboardView } from './components/DashboardView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PendingProjectsWorkspace } from './components/PendingProjectsWorkspace';
import { RegistersView } from './components/RegistersView';
import { ReportsView, type ReportSectionId } from './components/ReportsView';

type MainSection = 'entry' | 'do' | 'registers' | 'reports' | 'settings';
type TopStageKey = EntryStageKey | 'do';

const TOP_STAGE_TABS: Array<{
  key: TopStageKey;
  label: string;
  shortDesc: string;
}> = [
  { key: 'ministry', label: 'মন্ত্রণালয়', shortDesc: 'সকল খাতের মূল মন্ত্রণালয় বরাদ্দ' },
  { key: 'dc', label: 'ডিসি (জেলা প্রশাসক)', shortDesc: 'জেলা প্রশাসক চ্যানেলের বরাদ্দ ও প্রকল্প' },
  { key: 'uno', label: 'ইউএনও', shortDesc: 'উপজেলা নির্বাহী অফিসার উপবরাদ্দ' },
  { key: 'ucf', label: 'ইউসিএফ', shortDesc: 'ডিলার ও ইপি উপবরাদ্দ ও চালান' },
  { key: 'do', label: 'ডিও', shortDesc: 'খাতভিত্তিক ডিও বই ও ডিও ইস্যু' },
];

const CATEGORY_ICON_STYLE: Record<
  AllocationCategory,
  { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  'খাদ্য বান্ধব': { icon: Wheat, bg: 'bg-rose-50 border-rose-200', fg: 'text-[#E2136E]' },
  'ওএমএস সাধারণ': { icon: ShoppingBag, bg: 'bg-sky-50 border-sky-200', fg: 'text-sky-700' },
  'ওএমএস বিশেষ': { icon: ShoppingBag, bg: 'bg-indigo-50 border-indigo-200', fg: 'text-indigo-700' },
  'ওএমএস টিসিবি': { icon: ShoppingBag, bg: 'bg-violet-50 border-violet-200', fg: 'text-violet-700' },
  'ইপি চাল': { icon: Flame, bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700' },
  'ইপি গম': { icon: Flame, bg: 'bg-orange-50 border-orange-200', fg: 'text-orange-700' },
  'ভিজিএফ মৎস্য': { icon: HeartHandshake, bg: 'bg-teal-50 border-teal-200', fg: 'text-teal-700' },
  'ভিজিএফ ঈদ': { icon: HeartHandshake, bg: 'bg-rose-50 border-rose-200', fg: 'text-rose-700' },
  'জি আর': { icon: Users, bg: 'bg-pink-50 border-pink-200', fg: 'text-pink-700' },
  'কাবিখা সাধারণ চাল': { icon: Hammer, bg: 'bg-lime-50 border-lime-200', fg: 'text-lime-700' },
  'কাবিখা সাধারণ গম': { icon: Hammer, bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-700' },
  'কাবিখা বিশেষ চাল': { icon: Hammer, bg: 'bg-cyan-50 border-cyan-200', fg: 'text-cyan-700' },
  'কাবিখা বিশেষ গম': { icon: Hammer, bg: 'bg-slate-100 border-slate-300', fg: 'text-slate-700' },
  'ভিডাব্লিউভি': { icon: Sparkles, bg: 'bg-fuchsia-50 border-fuchsia-200', fg: 'text-fuchsia-700' },
};

function getCategoriesForStage(stage: TopStageKey) {
  switch (stage) {
    case 'ministry':
      return CATEGORIES;
    case 'dc':
      return CATEGORIES.filter((c) => c.requiresDC);
    case 'uno':
      return CATEGORIES.filter(
        (c) => c.flowType === 'vwb' || c.flowType === 'relief' || c.flowType === 'kabikha'
      );
    case 'ucf':
      return CATEGORIES.filter(
        (c) => c.flowType === 'dealer_food' || c.flowType === 'dealer_oms' || c.flowType === 'ep'
      );
    case 'do':
      return CATEGORIES;
  }
}

function formatCompactBnMt(qty: number): string {
  const r = round3(qty);
  return toBnDigits(String(r));
}

export default function App() {
  const androidBridgeState = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('android_auth') === '1' && params.get('state')) {
      return params.get('state');
    }
    return null;
  }, []);

  if (androidBridgeState) {
    return <AndroidAuthBridgeScreen sessionState={androidBridgeState} />;
  }

  return <MainApplication />;
}

function MainApplication() {
  const store = useAllocationStore();

  const [section, setSection] = useState<MainSection>('entry');
  const [activeStage, setActiveStage] = useState<TopStageKey>('ministry');

  // Entry view & Pending Projects workspace
  const [selectedEntryCat, setSelectedEntryCat] = useState<AllocationCategory | null>(null);
  const [lockedEntryStage, setLockedEntryStage] = useState<EntryStageKey | null>(null);
  const [showPendingWorkspace, setShowPendingWorkspace] = useState(false);
  const [isProjectUnlocked, setIsProjectUnlocked] = useState(false);

  // DO workspace state
  const [doTab, setDoTab] = useState<DOTabKey>('do-issue');
  const [doInitialCategory, setDoInitialCategory] = useState<AllocationCategory | 'ALL'>('ALL');
  const [doLockedCategory, setDoLockedCategory] = useState<AllocationCategory | null>(null);

  // Registers & Reports state
  const [activeRegisterId, setActiveRegisterId] = useState<RegisterId>('reg-food');
  const [registerOpenTrigger, setRegisterOpenTrigger] = useState(0);
  const [activeReportId, setActiveReportId] = useState<ReportSectionId>('monthly-dist');

  // Settings state
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>('sheets');
  const [selectedTemplateId, setSelectedTemplateId] = useState<ReportTemplateId>('alloc-food');
  const [templateEditReturnTo, setTemplateEditReturnTo] = useState<'reports' | 'registers' | null>(
    null
  );

  // Header UI state
  const [balanceExpanded, setBalanceExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Bidirectional sync between Top Stage Tabs and Swipeable Submenu Pager
  const submenuPagerRef = useRef<HTMLDivElement>(null);
  const stageTabRefs = useRef<Partial<Record<TopStageKey, HTMLButtonElement | null>>>({});
  const isProgrammaticPagerScrollRef = useRef(false);
  const pagerDragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({ active: false, startX: 0, startScrollLeft: 0, moved: false });
  const [isDraggingPager, setIsDraggingPager] = useState(false);

  const stageCategories = useMemo(() => getCategoriesForStage(activeStage), [activeStage]);
  const isHomeGridVisible = section === 'entry' && !selectedEntryCat && !showPendingWorkspace;

  useEffect(() => {
    const scale = Math.max(85, Math.min(135, store.db.officer.uiFontScale ?? 108));
    const px = Math.round(((16 * scale) / 100) * 10) / 10;
    document.documentElement.style.fontSize = `${px}px`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [store.db.officer.uiFontScale]);

  useEffect(() => {
    const tabBtn = stageTabRefs.current[activeStage];
    if (tabBtn) {
      tabBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeStage]);

  useEffect(() => {
    if (!isHomeGridVisible) return;
    const pager = submenuPagerRef.current;
    if (!pager) return;
    const idx = TOP_STAGE_TABS.findIndex((t) => t.key === activeStage);
    if (idx >= 0) {
      isProgrammaticPagerScrollRef.current = true;
      pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'auto' });
      const timer = window.setTimeout(() => {
        isProgrammaticPagerScrollRef.current = false;
      }, 90);
      return () => window.clearTimeout(timer);
    }
  }, [isHomeGridVisible]);

  const handleSelectStageTab = (stageKey: TopStageKey) => {
    setActiveStage(stageKey);
    const pager = submenuPagerRef.current;
    if (!pager) return;
    const idx = TOP_STAGE_TABS.findIndex((t) => t.key === stageKey);
    if (idx >= 0) {
      isProgrammaticPagerScrollRef.current = true;
      pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' });
      window.setTimeout(() => {
        isProgrammaticPagerScrollRef.current = false;
      }, 450);
    }
  };

  const handleSubmenuPagerScroll = () => {
    if (isProgrammaticPagerScrollRef.current) return;
    const pager = submenuPagerRef.current;
    if (!pager || pager.clientWidth <= 0) return;
    const idx = Math.max(
      0,
      Math.min(TOP_STAGE_TABS.length - 1, Math.round(pager.scrollLeft / pager.clientWidth))
    );
    const nextStage = TOP_STAGE_TABS[idx]?.key;
    if (nextStage && nextStage !== activeStage) {
      setActiveStage(nextStage);
    }
  };

  const finishPagerMouseDrag = () => {
    if (!pagerDragRef.current.active) return;
    const wasMoved = pagerDragRef.current.moved;
    pagerDragRef.current.active = false;
    setIsDraggingPager(false);
    if (wasMoved) {
      const pager = submenuPagerRef.current;
      if (pager && pager.clientWidth > 0) {
        const idx = Math.max(
          0,
          Math.min(TOP_STAGE_TABS.length - 1, Math.round(pager.scrollLeft / pager.clientWidth))
        );
        const nextStage = TOP_STAGE_TABS[idx]?.key;
        if (nextStage) setActiveStage(nextStage);
        isProgrammaticPagerScrollRef.current = true;
        pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' });
        window.setTimeout(() => {
          isProgrammaticPagerScrollRef.current = false;
        }, 320);
      }
      window.setTimeout(() => {
        pagerDragRef.current.moved = false;
      }, 50);
    }
  };


  const pendingSummary = useMemo(() => {
    const byStage: Record<TopStageKey, Partial<Record<AllocationCategory, number>>> = {
      ministry: {},
      dc: {},
      uno: {},
      ucf: {},
      do: {},
    };
    const completedByStage: Record<TopStageKey, Partial<Record<AllocationCategory, boolean>>> = {
      ministry: {},
      dc: {},
      uno: {},
      ucf: {},
      do: {},
    };

    // 1. From Ministry allocations -> pending in DC, UNO (VWB), or UCF (Food/OMS-Gen/OMS-Spc/EP)
    for (const m of store.db.ministryAllocations) {
      const meta = CATEGORY_BY_NAME[m.category];
      if (!meta) continue;
      const usage = store.getMinistryUsage(m.category, m.memoNo);
      const rem = Math.max(0, usage.remaining);
      if (meta.requiresDC) {
        byStage.dc[m.category] = round3((byStage.dc[m.category] || 0) + rem);
      } else if (meta.flowType === 'vwb') {
        byStage.uno[m.category] = round3((byStage.uno[m.category] || 0) + rem);
      } else {
        byStage.ucf[m.category] = round3((byStage.ucf[m.category] || 0) + rem);
      }
    }

    // 2. From DC allocations -> pending in UNO (Relief/Kabikha) or UCF (OMS TCB)
    for (const d of store.db.dcAllocations) {
      const meta = CATEGORY_BY_NAME[d.category];
      if (!meta) continue;
      const usage = store.getDCUsage(d.category, d.dcMemo);
      const rem = Math.max(0, usage.remaining);
      if (meta.flowType === 'dealer_oms') {
        byStage.ucf[d.category] = round3((byStage.ucf[d.category] || 0) + rem);
      } else if (meta.flowType === 'relief' || meta.flowType === 'kabikha') {
        byStage.uno[d.category] = round3((byStage.uno[d.category] || 0) + rem);
      }
    }

    // 3. From UNO/UCF suballocations minus DO issues -> pending in DO
    const pendingDOList = getPendingDORecipients(store.db);
    for (const item of pendingDOList) {
      byStage.do[item.category] = round3((byStage.do[item.category] || 0) + item.remaining);
    }

    // 3b. Reconcile stage pending against category-level upstream vs downstream totals
    const catTotals: Partial<
      Record<AllocationCategory, { min: number; dc: number; uno: number; dealer: number }>
    > = {};
    const ensureCat = (c: AllocationCategory) =>
      (catTotals[c] ||= { min: 0, dc: 0, uno: 0, dealer: 0 });
    for (const m of store.db.ministryAllocations) ensureCat(m.category).min += Number(m.allocationQty) || 0;
    for (const d of store.db.dcAllocations) ensureCat(d.category).dc += Number(d.allocationQty) || 0;
    for (const u of store.db.unoSuballocations) ensureCat(u.category).uno += Number(u.allocationQty) || 0;
    for (const s of store.db.dealerSuballocations) ensureCat(s.category).dealer += Number(s.allocationQty) || 0;

    for (const cat of CATEGORIES) {
      const c = cat.category;
      const t = catTotals[c];
      if (!t) continue;
      if (cat.requiresDC) {
        byStage.dc[c] = Math.min(byStage.dc[c] || 0, Math.max(0, round3(t.min - t.dc)));
      }
      if (cat.flowType === 'vwb') {
        byStage.uno[c] = Math.min(byStage.uno[c] || 0, Math.max(0, round3(t.min - t.uno)));
      } else if (cat.flowType === 'relief' || cat.flowType === 'kabikha') {
        byStage.uno[c] = Math.min(byStage.uno[c] || 0, Math.max(0, round3(t.dc - t.uno)));
      } else {
        const upstream = cat.requiresDC ? t.dc : t.min;
        byStage.ucf[c] = Math.min(byStage.ucf[c] || 0, Math.max(0, round3(upstream - t.dealer)));
      }
    }

    // 4. Mark completed categories per stage (has entries and 0 pending left)
    for (const cat of CATEGORIES) {
      const c = cat.category;
      if (
        cat.requiresDC &&
        store.db.dcAllocations.some((d) => d.category === c) &&
        (byStage.dc[c] || 0) <= 0.0005
      ) {
        completedByStage.dc[c] = true;
      }
      if (
        (cat.flowType === 'vwb' || cat.flowType === 'relief' || cat.flowType === 'kabikha') &&
        store.db.unoSuballocations.some((u) => u.category === c) &&
        (byStage.uno[c] || 0) <= 0.0005
      ) {
        completedByStage.uno[c] = true;
      }
      if (
        (cat.flowType === 'dealer_food' || cat.flowType === 'dealer_oms' || cat.flowType === 'ep') &&
        store.db.dealerSuballocations.some((s) => s.category === c) &&
        (byStage.ucf[c] || 0) <= 0.0005
      ) {
        completedByStage.ucf[c] = true;
      }
      if (
        store.db.doIssues.some((d) => d.category === c) &&
        (byStage.do[c] || 0) <= 0.0005
      ) {
        completedByStage.do[c] = true;
      }
    }

    const stageTotals: Record<TopStageKey, number> = {
      ministry: 0,
      dc: round3(Object.values(byStage.dc).reduce((s, v) => s + (v || 0), 0)),
      uno: round3(Object.values(byStage.uno).reduce((s, v) => s + (v || 0), 0)),
      ucf: round3(Object.values(byStage.ucf).reduce((s, v) => s + (v || 0), 0)),
      do: round3(Object.values(byStage.do).reduce((s, v) => s + (v || 0), 0)),
    };

    return { byStage, completedByStage, stageTotals };
  }, [store.db, store.getMinistryUsage, store.getDCUsage]);

  const pendingProjectList = useMemo(
    () => computeEnrichedProjects(store.db, { pendingOnly: true }),
    [store.db]
  );
  const totalPendingProjectsQty = useMemo(
    () => round3(pendingProjectList.reduce((s, item) => s + item.pendingQty, 0)),
    [pendingProjectList]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cats = CATEGORIES.filter(
      (c) => !q || c.category.toLowerCase().includes(q) || c.groupLabel.toLowerCase().includes(q)
    );
    const regs = REPORT_TEMPLATE_CATALOG.filter(
      (t) => t.kind === 'register' && (!q || t.label.toLowerCase().includes(q))
    );
    const reps = REPORT_TEMPLATE_CATALOG.filter(
      (t) => t.kind === 'report' && (!q || t.label.toLowerCase().includes(q))
    );
    return { cats, regs, reps };
  }, [searchQuery]);

  const handleOpenPendingWorkspace = () => {
    setSelectedEntryCat(null);
    setLockedEntryStage(null);
    setShowPendingWorkspace(true);
    setSection('entry');
  };

  const handleOpenCategoryFromDashboard = (cat: AllocationCategory) => {
    setShowPendingWorkspace(false);
    setLockedEntryStage(null);
    setSelectedEntryCat(cat);
    setSection('entry');
  };

  const handleQuickRefresh = async () => {
    const res = await store.syncFromGoogleSheet();
    setSyncNotice(res.ok ? res.message || 'সিঙ্ক সম্পন্ন হয়েছে।' : res.error || 'সিঙ্ক হয়নি।');
    window.setTimeout(() => setSyncNotice(null), 3200);
  };

  const handleSwitchSection = (target: MainSection) => {
    setTemplateEditReturnTo(null);
    setShowPendingWorkspace(false);
    setSection(target);
    if (target === 'entry') {
      setSelectedEntryCat(null);
      setLockedEntryStage(null);
    } else if (target === 'do') {
      setDoInitialCategory('ALL');
      setDoLockedCategory(null);
    }
  };

  const handleEditTemplate = (
    tplId: ReportTemplateId,
    returnTo: 'reports' | 'registers' | null = null
  ) => {
    setSelectedTemplateId(tplId);
    setTemplateEditReturnTo(returnTo);
    setSettingsTab('templates');
    setSection('settings');
  };

  const handleChangeOrientation = (tplId: ReportTemplateId, orientation: 'portrait' | 'landscape') => {
    store.updateReportTemplate(tplId, { orientation });
  };

  const navItems: Array<{
    key: MainSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'entry', label: 'বরাদ্দ এন্ট্রি', icon: Home },
    { key: 'do', label: 'ডিও', icon: ClipboardCheck },
    { key: 'registers', label: 'রেজিস্টার', icon: BookOpen },
    { key: 'reports', label: 'রিপোর্ট', icon: FileText },
    { key: 'settings', label: 'সেটিংস', icon: Settings },
  ];

  const officerTitle =
    store.googleUser?.displayName || store.db.officer.officerPlace || 'উজিরপুর, বরিশাল';

  return (
    <div className="relative min-h-screen bg-[#faf7f9] text-slate-900 pb-24 lg:pb-10">
      {/* Subtle food-grain / paddy-stalk watermark pattern across page canvas */}
      <svg
        aria-hidden="true"
        className="no-print pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.04]"
      >
        <defs>
          <pattern id="grain-motif-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="#E2136E" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              {/* Wheat / Paddy stalk */}
              <path d="M28 92 C32 68, 42 46, 56 26" />
              <ellipse cx="47" cy="36" rx="3.2" ry="6.2" transform="rotate(-28 47 36)" />
              <ellipse cx="53" cy="45" rx="3.2" ry="6.2" transform="rotate(24 53 45)" />
              <ellipse cx="39" cy="49" rx="3.2" ry="6.2" transform="rotate(-28 39 49)" />
              <ellipse cx="45" cy="58" rx="3.2" ry="6.2" transform="rotate(24 45 58)" />
              <ellipse cx="33" cy="63" rx="3.2" ry="6.2" transform="rotate(-28 33 63)" />
              <ellipse cx="39" cy="72" rx="3.2" ry="6.2" transform="rotate(24 39 72)" />
              {/* Scattered rice grains */}
              <ellipse cx="92" cy="34" rx="2.4" ry="5.5" transform="rotate(35 92 34)" />
              <ellipse cx="98" cy="42" rx="2.2" ry="5" transform="rotate(-20 98 42)" />
              <ellipse cx="86" cy="86" rx="2.5" ry="5.5" transform="rotate(48 86 86)" />
              <ellipse cx="96" cy="92" rx="2.3" ry="5" transform="rotate(-15 96 92)" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grain-motif-pattern)" />
      </svg>

      {/* Curved Magenta-Rose Header inspired by attached mobile palette */}
      <header className="no-print relative z-10 overflow-hidden bg-gradient-to-br from-[#E2136E] via-[#CB1162] to-[#9E0B4B] text-white pt-4 pb-10 px-4 sm:px-6 shadow-md">
        {/* Decorative rural crop fields, village hut & subtle food-grain stalks */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 130"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 w-full"
        >
          <path
            fill="#ffffff"
            fillOpacity="0.16"
            d="M0,96L96,80C192,64,384,32,576,42.7C768,53,960,107,1152,106.7C1344,107,1400,69,1440,53.3L1440,130L0,130Z"
          />
          <path
            fill="#880840"
            fillOpacity="0.32"
            d="M0,114L144,96C288,78,576,46,864,58C1152,70,1344,102,1440,114L1440,130L0,130Z"
          />
          {/* Subtle village hut & paddy-grain silhouettes */}
          <g fill="#ffffff" fillOpacity="0.18">
            <path d="M180 105 L202 88 L224 105 L224 122 L180 122 Z" />
            <path d="M1195 104 L1215 90 L1235 104 L1235 120 L1195 120 Z" />
          </g>
          <g stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d="M90 124 C95 106, 102 92, 110 78" />
            <path d="M104 92 L96 86 M101 100 L110 95 M97 109 L89 103" />
            <path d="M1320 124 C1325 106, 1332 92, 1340 78" />
            <path d="M1334 92 L1326 86 M1331 100 L1340 95 M1327 109 L1319 103" />
            <path d="M740 124 C744 108, 750 96, 758 84" />
            <path d="M752 96 L744 90 M749 104 L758 99" />
          </g>
        </svg>

        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            {/* Avatar + Name + Balance Toggle Pill */}
            <div className="flex items-center gap-3 min-w-0">
              {store.googleUser?.photoURL ? (
                <img
                  src={store.googleUser.photoURL}
                  alt={officerTitle}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-white/60 shrink-0 bg-white/10"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-white/15 ring-2 ring-white/50 flex items-center justify-center shrink-0">
                  <Landmark className="h-5 w-5 text-white" />
                </div>
              )}

              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold leading-snug break-words">
                  {officerTitle}
                </p>
                <p className="text-xs sm:text-sm text-rose-100 leading-snug break-words">
                  {store.db.officer.officeLine1 || 'উপজেলা খাদ্য নিয়ন্ত্রকের কার্যালয়'}
                </p>

                {/* Interactive Eye Pill -> reveals total Pending DO Issue quantity */}
                {!balanceExpanded ? (
                  <button
                    type="button"
                    onClick={() => setBalanceExpanded(true)}
                    className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-white text-[#E2136E] pl-1.5 pr-3.5 py-1 text-xs font-bold shadow-sm hover:bg-rose-50 transition-colors cursor-pointer min-h-[30px]"
                  >
                    <span className="h-5 w-5 rounded-full bg-[#E2136E] text-white flex items-center justify-center shrink-0">
                      <Eye className="h-3 w-3" />
                    </span>
                    <span>দেখুন</span>
                  </button>
                ) : (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white text-[#E2136E] pl-1.5 pr-1.5 py-0.5 text-xs font-bold shadow-sm min-h-[32px]">
                    <button
                      type="button"
                      onClick={() => {
                        setDoInitialCategory('ALL');
                        setDoLockedCategory(null);
                        setDoTab('do-issue');
                        setSection('do');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold cursor-pointer whitespace-nowrap tabular-nums ${
                        pendingSummary.stageTotals.do > 0.0005
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900'
                          : 'bg-rose-50 hover:bg-rose-100 text-[#E2136E]'
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>ডিও বাকি: {formatBnQty(pendingSummary.stageTotals.do)} মে.টন</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceExpanded(false)}
                      aria-label="লুকান"
                      className="h-5 w-5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Circular Buttons & PWA Install */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">
                <PWAInstallButton />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(true);
                }}
                aria-label="খুঁজুন"
                title="দ্রুত খুঁজুন"
                className="h-10 w-10 rounded-full bg-white text-[#E2136E] flex items-center justify-center shadow-sm hover:bg-rose-50 cursor-pointer"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleQuickRefresh()}
                aria-label="সিঙ্ক করুন"
                title="গুগল শিট রিফ্রেশ"
                className="h-10 w-10 rounded-full bg-white text-[#E2136E] flex items-center justify-center shadow-sm hover:bg-rose-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${store.isSyncingSheets ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Mobile PWA Install Pill + Optional Sync Toast */}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="sm:hidden">
              <PWAInstallButton />
            </div>
            {syncNotice && (
              <div className="ml-auto rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[11px] font-bold text-white">
                {syncNotice}
              </div>
            )}
          </div>

          {/* Desktop Horizontal Navigation Bar */}
          <nav
            aria-label="মূল মেনু"
            className="hidden lg:flex items-center gap-2 mt-4 pt-3 border-t border-white/15"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              const doPending = item.key === 'do' ? pendingSummary.stageTotals.do : 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSwitchSection(item.key)}
                  className={`min-h-[42px] inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-[#E2136E] shadow-sm'
                      : 'bg-white/12 text-white hover:bg-white/20'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {doPending > 0.0005 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-300 text-slate-900 px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums">
                      {formatCompactBnMt(doPending)} মে.টন
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main White Curved Canvas */}
      <main className="app-print-shell relative z-10 -mt-5 max-w-6xl mx-auto px-0 sm:px-4">
        <div className="app-print-canvas bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_-6px_24px_rgba(226,19,110,0.08)] border border-rose-100/80 min-h-[calc(100vh-150px)] p-4 sm:p-6">
          {/* SECTION 1: বরাদ্দ এন্ট্রি */}
          {section === 'entry' && (
            <>
              {showPendingWorkspace ? (
                <PendingProjectsWorkspace
                  db={store.db}
                  isUnlocked={isProjectUnlocked}
                  onUnlock={() => setIsProjectUnlocked(true)}
                  onLock={() => setIsProjectUnlocked(false)}
                  onUpdateOfficer={store.updateOfficerProfile}
                  getDCUsage={store.getDCUsage}
                  onSaveUNOBatch={store.saveUNOSuballocationBatch}
                  onUpdateUNOSub={store.updateUNOSuballocation}
                  onDeleteUNOSub={store.deleteUNOSuballocation}
                  onTransferProject={store.transferProject}
                  onOpenUnoOtherCategory={(cat) => {
                    setShowPendingWorkspace(false);
                    setLockedEntryStage('uno');
                    setSelectedEntryCat(cat);
                  }}
                  onOpenDCStage={(cat) => {
                    setShowPendingWorkspace(false);
                    setLockedEntryStage('dc');
                    setSelectedEntryCat(cat);
                  }}
                  onBack={() => setShowPendingWorkspace(false)}
                />
              ) : selectedEntryCat ? (
                <CategoryEntryView
                  db={store.db}
                  selectedCategory={selectedEntryCat}
                  lockedStage={lockedEntryStage}
                  onBack={() => {
                    setSelectedEntryCat(null);
                    setLockedEntryStage(null);
                  }}
                  onSelectCategory={(cat) => setSelectedEntryCat(cat)}
                  getMinistryUsage={store.getMinistryUsage}
                  getDCUsage={store.getDCUsage}
                  onAddMinistry={store.addMinistryAllocation}
                  onUpdateMinistry={store.updateMinistryAllocation}
                  onDeleteMinistry={store.deleteMinistryAllocation}
                  onAddDC={store.addDCAllocation}
                  onUpdateDC={store.updateDCAllocation}
                  onDeleteDC={store.deleteDCAllocation}
                  onAddProjectsToDC={store.addProjectsToDC}
                  onSaveDealerBatch={store.saveDealerSuballocationBatch}
                  onUpdateDealerSub={store.updateDealerSuballocation}
                  onDeleteDealerSub={store.deleteDealerSuballocation}
                  onSaveUNOBatch={store.saveUNOSuballocationBatch}
                  onUpdateUNOSub={store.updateUNOSuballocation}
                  onDeleteUNOSub={store.deleteUNOSuballocation}
                  onSaveDOBook={store.saveDOBook}
                  onDeleteDOBook={store.deleteDOBook}
                  verifyChallan={store.verifyChallanForRecipient}
                  onIssueDOBatch={store.issueDOBatch}
                  onUpdateDOIssue={store.updateDOIssue}
                  onDeleteDOIssue={store.deleteDOIssue}
                  onOpenRegister={(regId) => {
                    setActiveRegisterId(regId);
                    setRegisterOpenTrigger((n) => n + 1);
                    setSection('registers');
                  }}
                  onOpenDOIssue={() => {
                    setDoInitialCategory(selectedEntryCat);
                    setDoLockedCategory(null);
                    setDoTab('do-issue');
                    setSection('do');
                  }}
                  isProjectUnlocked={isProjectUnlocked}
                  onUnlockProjectEntry={() => setIsProjectUnlocked(true)}
                  onLockProjectEntry={() => setIsProjectUnlocked(false)}
                  onUpdateOfficer={store.updateOfficerProfile}
                  onTransferProject={store.transferProject}
                  onDeleteProject={store.deleteProject}
                  onOpenPendingProjectsWorkspace={handleOpenPendingWorkspace}
                />
              ) : (
                <div className="space-y-5">
                  {/* Top Horizontally Scrollable Stage Strip + Pending Projects Button */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500">
                        বরাদ্দ ধাপ নির্বাচন করুন (বামে/ডানে স্ক্রল করুন)
                      </span>
                      <span className="text-[11px] font-bold text-[#E2136E] tabular-nums">
                        {toBnDigits(stageCategories.length)}টি খাত
                      </span>
                    </div>

                    <div
                      role="tablist"
                      aria-label="বরাদ্দ ধাপসমূহ"
                      className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1.5 pt-1"
                    >
                      {TOP_STAGE_TABS.map((tab) => {
                        const isActive = activeStage === tab.key;
                        const stagePending = pendingSummary.stageTotals[tab.key] || 0;
                        return (
                          <button
                            key={tab.key}
                            ref={(el) => {
                              stageTabRefs.current[tab.key] = el;
                            }}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => handleSelectStageTab(tab.key)}
                            className={`min-h-[44px] shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-bold border transition-all cursor-pointer ${
                              isActive
                                ? 'bg-[#E2136E] text-white border-[#E2136E] shadow-sm'
                                : 'bg-rose-50/70 text-[#C81060] border-rose-200/80 hover:bg-rose-100/70'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {stagePending > 0.0005 && (
                              <span
                                title={`${formatBnQty(stagePending)} মে.টন পেন্ডিং`}
                                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                                  isActive
                                    ? 'bg-amber-300 text-slate-900'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                <Clock className="h-2.5 w-2.5 shrink-0" />
                                <span>{formatCompactBnMt(stagePending)} মে.টন</span>
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {/* Direct Top Menu Bar Button for Pending Projects */}
                      <button
                        type="button"
                        onClick={handleOpenPendingWorkspace}
                        className="min-h-[44px] shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-bold border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 shadow-xs transition-all cursor-pointer"
                      >
                        <FolderKanban className="h-4 w-4 text-amber-700 shrink-0" />
                        <span>পেন্ডিং প্রকল্প</span>
                        {Boolean((store.db.officer.lockPin || '').trim()) && !isProjectUnlocked && (
                          <Lock className="h-3 w-3 text-[#E2136E] shrink-0" />
                        )}
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums">
                          {toBnDigits(pendingProjectList.length)}টি
                        </span>
                      </button>
                    </div>

                    <p className="mt-1.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                      <span>{TOP_STAGE_TABS.find((t) => t.key === activeStage)?.shortDesc}</span>
                      {(pendingSummary.stageTotals[activeStage] || 0) > 0.0005 && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                          · মোট পেন্ডিং: {formatCompactBnMt(pendingSummary.stageTotals[activeStage])} মে.টন
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Horizontally Swipeable 5-Stage Submenu Carousel (scroll left/right switches top stage menu one by one) */}
                  <div>
                    <div
                      ref={submenuPagerRef}
                      onScroll={handleSubmenuPagerScroll}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || !submenuPagerRef.current) return;
                        pagerDragRef.current = {
                          active: true,
                          startX: e.clientX,
                          startScrollLeft: submenuPagerRef.current.scrollLeft,
                          moved: false,
                        };
                        setIsDraggingPager(true);
                      }}
                      onMouseMove={(e) => {
                        if (!pagerDragRef.current.active || !submenuPagerRef.current) return;
                        const dx = e.clientX - pagerDragRef.current.startX;
                        if (Math.abs(dx) > 6) {
                          pagerDragRef.current.moved = true;
                        }
                        if (pagerDragRef.current.moved) {
                          submenuPagerRef.current.scrollLeft =
                            pagerDragRef.current.startScrollLeft - dx;
                        }
                      }}
                      onMouseUp={finishPagerMouseDrag}
                      onMouseLeave={finishPagerMouseDrag}
                      onClickCapture={(e) => {
                        if (pagerDragRef.current.moved) {
                          e.preventDefault();
                          e.stopPropagation();
                          pagerDragRef.current.moved = false;
                        }
                      }}
                      className={`no-scrollbar flex items-start overflow-x-auto select-none ${
                        isDraggingPager
                          ? 'snap-none cursor-grabbing'
                          : 'snap-x snap-mandatory cursor-grab sm:cursor-default'
                      }`}
                    >
                      {TOP_STAGE_TABS.map((stageTab) => {
                        const cats = getCategoriesForStage(stageTab.key);
                        return (
                          <div
                            key={stageTab.key}
                            className="w-full shrink-0 snap-center snap-always"
                          >
                            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-y-4 gap-x-2.5">
                              {cats.map((catMeta) => {
                                const style = CATEGORY_ICON_STYLE[catMeta.category];
                                const Icon = style.icon;
                                const catPending =
                                  pendingSummary.byStage[stageTab.key]?.[catMeta.category] || 0;
                                const isCompleted = Boolean(
                                  pendingSummary.completedByStage[stageTab.key]?.[catMeta.category]
                                );
                                return (
                                  <button
                                    key={`${stageTab.key}-${catMeta.id}`}
                                    type="button"
                                    onClick={() => {
                                      setActiveStage(stageTab.key);
                                      if (stageTab.key === 'do') {
                                        setDoInitialCategory(catMeta.category);
                                        setDoLockedCategory(catMeta.category);
                                        setDoTab('do-issue');
                                        setSection('do');
                                      } else {
                                        setLockedEntryStage(stageTab.key);
                                        setSelectedEntryCat(catMeta.category);
                                        setSection('entry');
                                      }
                                    }}
                                    className="group flex flex-col items-center text-center gap-1.5 p-1.5 pt-3 rounded-2xl hover:bg-rose-50/60 transition-colors cursor-pointer min-h-[100px]"
                                  >
                                    <div className="relative inline-flex items-center justify-center">
                                      <span
                                        className={`h-16 w-16 rounded-full border flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform ${style.bg} ${
                                          catPending > 0.0005
                                            ? 'ring-2 ring-amber-400/75 ring-offset-1'
                                            : ''
                                        }`}
                                      >
                                        <Icon className={`h-7 w-7 ${style.fg}`} />
                                      </span>

                                      {catPending > 0.0005 ? (
                                        <span
                                          title={`${formatBnQty(catPending)} মে.টন পেন্ডিং`}
                                          className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-full bg-amber-500 text-white border border-white shadow-sm px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap tabular-nums z-10"
                                        >
                                          <Clock className="h-2.5 w-2.5 shrink-0" />
                                          <span>{formatCompactBnMt(catPending)} মে.টন</span>
                                        </span>
                                      ) : isCompleted ? (
                                        <span
                                          title="সম্পন্ন"
                                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white border-2 border-white shadow-xs inline-flex items-center justify-center z-10"
                                        >
                                          <CheckCircle2 className="h-3 w-3" />
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-slate-800 leading-snug break-words">
                                      {catMeta.category}
                                    </span>
                                    {catPending > 0.0005 && (
                                      <span className="text-[10.5px] font-bold text-amber-700 leading-none -mt-0.5">
                                        পেন্ডিং
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Stage Pager Indicator Dots */}
                    <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
                      {TOP_STAGE_TABS.map((stageTab) => {
                        const isCur = stageTab.key === activeStage;
                        return (
                          <button
                            key={`dot-${stageTab.key}`}
                            type="button"
                            tabIndex={-1}
                            onClick={() => handleSelectStageTab(stageTab.key)}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              isCur ? 'w-5 bg-[#E2136E]' : 'w-1.5 bg-rose-200 hover:bg-rose-300'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Features Strip */}
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 mb-3">কুইক ফিচারসমূহ</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <button
                        type="button"
                        onClick={handleOpenPendingWorkspace}
                        className="min-h-[68px] flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50/80 p-3 text-left hover:border-amber-400 hover:bg-amber-100/70 transition-colors cursor-pointer"
                      >
                        <span className="h-10 w-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                          <FolderKanban className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900 leading-snug">
                            পেন্ডিং প্রকল্প লোড
                          </span>
                          <span className="block text-[10.5px] font-bold text-amber-800 tabular-nums mt-0.5">
                            {toBnDigits(pendingProjectList.length)}টি · {formatCompactBnMt(totalPendingProjectsQty)} মে.টন
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveReportId('alloc-food');
                          setSection('reports');
                        }}
                        className="min-h-[68px] flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-left hover:border-rose-300 hover:bg-rose-50/50 transition-colors cursor-pointer"
                      >
                        <span className="h-10 w-10 rounded-full bg-rose-100 text-[#E2136E] flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-bold text-slate-800 leading-snug">
                          খাদ্য বান্ধব বরাদ্দাদেশ
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDoInitialCategory('ALL');
                          setDoLockedCategory(null);
                          setDoTab('do-book');
                          setSection('do');
                        }}
                        className="min-h-[68px] flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                      >
                        <span className="h-10 w-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                          <BookOpen className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-bold text-slate-800 leading-snug">
                          ডিও বই এন্ট্রি
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveRegisterId('reg-challan');
                          setRegisterOpenTrigger((n) => n + 1);
                          setSection('registers');
                        }}
                        className="min-h-[68px] flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                      >
                        <span className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Receipt className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-bold text-slate-800 leading-snug">
                          চালান যাচাই রেজিস্টার
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSettingsTab('sheets');
                          setSection('settings');
                        }}
                        className="min-h-[68px] flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                      >
                        <span className="h-10 w-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-bold text-slate-800 leading-snug">
                          গুগল শিট সিঙ্ক
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Auto-visible Graphical Dashboard below Home */}
                  <div id="home-dashboard" className="pt-4 border-t border-slate-200/80">
                    <DashboardView
                      db={store.db}
                      onSelectCategory={handleOpenCategoryFromDashboard}
                      onGoToDo={() => {
                        setDoInitialCategory('ALL');
                        setDoLockedCategory(null);
                        setDoTab('do-issue');
                        setSection('do');
                      }}
                      onGoToReports={() => setSection('reports')}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* SECTION 2: ডিও */}
          {section === 'do' && (
            <DOWorkspaceView
              db={store.db}
              activeTab={doTab}
              onChangeTab={setDoTab}
              initialCategory={doInitialCategory}
              lockedCategory={doLockedCategory}
              onBack={() => handleSwitchSection('entry')}
              onSaveDOBook={store.saveDOBook}
              onDeleteDOBook={store.deleteDOBook}
              verifyChallan={store.verifyChallanForRecipient}
              onIssueDOBatch={store.issueDOBatch}
              onUpdateDOIssue={store.updateDOIssue}
              onDeleteDOIssue={store.deleteDOIssue}
            />
          )}

          {/* SECTION 3: রেজিস্টার */}
          {section === 'registers' && (
            <RegistersView
              db={store.db}
              activeRegisterId={activeRegisterId}
              openTrigger={registerOpenTrigger}
              onSelectRegister={setActiveRegisterId}
              onEditTemplate={(tplId) => handleEditTemplate(tplId, 'registers')}
              onChangeOrientation={handleChangeOrientation}
            />
          )}

          {/* SECTION 4: রিপোর্ট */}
          {section === 'reports' && (
            <ReportsView
              db={store.db}
              activeReportId={activeReportId}
              onSelectReport={setActiveReportId}
              onSaveReportMemo={store.saveReportMemo}
              onEditTemplate={(tplId) => handleEditTemplate(tplId, 'reports')}
              onChangeOrientation={handleChangeOrientation}
            />
          )}

          {/* SECTION 5: সেটিংস */}
          {section === 'settings' && (
            <AllocationSettingsView
              db={store.db}
              sheetsConfig={store.sheetsConfig}
              activeTab={settingsTab}
              selectedTemplateId={selectedTemplateId}
              focusedTemplateOnly={templateEditReturnTo !== null}
              onBackFromFocusedTemplate={() => {
                const dest = templateEditReturnTo || 'reports';
                setTemplateEditReturnTo(null);
                setSection(dest);
              }}
              onChangeTab={setSettingsTab}
              onSelectTemplateId={setSelectedTemplateId}
              googleUser={store.googleUser}
              hasGoogleToken={store.hasGoogleToken}
              isGoogleSigningIn={store.isGoogleSigningIn}
              googleAuthError={store.googleAuthError}
              isSyncingSheets={store.isSyncingSheets}
              driveFiles={store.driveFiles}
              onGoogleSignIn={store.handleGoogleSignIn}
              onGoogleSignOut={store.handleGoogleSignOut}
              onAutoDetectDrive={store.autoDetectAndSyncDriveSheets}
              onSyncFromSheet={store.syncFromGoogleSheet}
              onPushToSheet={store.pushToGoogleSheet}
              onUpdateSheetsConfig={(patch) =>
                store.setSheetsConfig((prev) => ({ ...prev, ...patch }))
              }
              onUpdateOfficer={store.updateOfficerProfile}
              onUpdateTemplate={store.updateReportTemplate}
              onResetTemplate={store.resetReportTemplate}
              onSaveFoodDealer={store.saveFoodDealer}
              onDeleteFoodDealer={store.deleteFoodDealer}
              onSaveOMSDealer={store.saveOMSDealer}
              onDeleteOMSDealer={store.deleteOMSDealer}
              onSaveChairman={store.saveChairman}
              onDeleteChairman={store.deleteChairman}
              onSaveFireService={store.saveFireService}
              onDeleteFireService={store.deleteFireService}
              onSaveRate={store.saveRate}
              onExportBackup={store.exportBackupJson}
              onImportBackup={store.importBackupJson}
              onClearLocalData={store.clearAllLocalData}
            />
          )}
        </div>
      </main>

      {/* Mobile Fixed 5-Item Bottom Navigation Bar */}
      <nav
        aria-label="মোবাইল ন্যাভিগেশন"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      >
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.key;
            const doPending = item.key === 'do' ? pendingSummary.stageTotals.do : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSwitchSection(item.key)}
                className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors cursor-pointer ${
                  active ? 'text-[#E2136E] bg-rose-50/85' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="relative inline-flex items-center justify-center">
                  <Icon className={`h-5 w-5 ${active ? 'text-[#E2136E]' : 'text-slate-500'}`} />
                  {doPending > 0.0005 && (
                    <span
                      title={`${formatBnQty(doPending)} মে.টন ডিও পেন্ডিং`}
                      className="absolute -top-1.5 -right-3 rounded-full bg-amber-500 text-white border border-white px-1 py-0.5 text-[8.5px] font-bold leading-none tabular-nums"
                    >
                      {formatCompactBnMt(doPending)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold leading-none whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quick Jump Search Modal */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="খাত, রেজিস্টার ও রিপোর্ট খুঁজুন"
          className="no-print fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center p-4 pt-12"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 p-3.5 border-b border-slate-200 bg-rose-50/60">
              <Search className="h-4 w-4 text-[#E2136E] shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="খাতের নাম, রেজিস্টার বা রিপোর্ট লিখুন..."
                className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="বন্ধ করুন"
                className="h-8 w-8 rounded-full bg-white text-slate-600 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3.5 space-y-4">
              {searchResults.cats.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 mb-2 flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-[#E2136E]" />
                    খাতভিত্তিক বরাদ্দ ({toBnDigits(searchResults.cats.length)})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {searchResults.cats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setShowPendingWorkspace(false);
                          setLockedEntryStage(null);
                          setSelectedEntryCat(c.category);
                          setSection('entry');
                          setSearchOpen(false);
                        }}
                        className="min-h-[36px] rounded-full border border-rose-200 bg-rose-50/70 px-3 py-1 text-xs font-bold text-[#E2136E] hover:bg-rose-100 cursor-pointer"
                      >
                        {c.category}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.regs.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 mb-2 flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5 text-sky-700" />
                    রেজিস্টারসমূহ ({toBnDigits(searchResults.regs.length)})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {searchResults.regs.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setActiveRegisterId(r.id as RegisterId);
                          setRegisterOpenTrigger((n) => n + 1);
                          setSection('registers');
                          setSearchOpen(false);
                        }}
                        className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-bold text-slate-800 hover:border-sky-300 hover:bg-sky-50 cursor-pointer"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.reps.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 mb-2 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-violet-700" />
                    রিপোর্টসমূহ ({toBnDigits(searchResults.reps.length)})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {searchResults.reps.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setActiveReportId(r.id as ReportSectionId);
                          setSection('reports');
                          setSearchOpen(false);
                        }}
                        className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-bold text-slate-800 hover:border-violet-300 hover:bg-violet-50 cursor-pointer"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.cats.length === 0 &&
                searchResults.regs.length === 0 &&
                searchResults.reps.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">
                    কোনো মিল পাওয়া যায়নি।
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
