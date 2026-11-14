import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  KeyRound,
  Lock,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  type AllocationCategory,
  type AllocationDatabase,
  type OfficerProfileSettings,
} from '../types/allocation';
import {
  formatBnDate,
  formatBnInt,
  formatBnQty,
  normMemoNo,
  parseNum,
  toBnDigits,
  todayIsoDate,
} from '../shared/bnUtils';
import {
  PROJECT_CATEGORIES,
  computeEnrichedProjects,
  matchesProjectPin,
  type EnrichedPendingProject,
} from '../shared/projectHelpers';
import type { ActionResult } from '../store/useAllocationStore';

interface PendingProjectsWorkspaceProps {
  db: AllocationDatabase;
  isUnlocked: boolean;
  onUnlock: () => void;
  onLock: () => void;
  onUpdateOfficer: (patch: Partial<OfficerProfileSettings>) => void;
  getDCUsage: (
    cat: AllocationCategory,
    dcMemo: string
  ) => { total: number; used: number; remaining: number };
  onSaveUNOBatch: (payload: {
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
  }) => ActionResult;
  onUpdateUNOSub?: (
    id: string,
    patch: {
      unoMemo: string;
      unoDate: string;
      unionName: string;
      recipientName: string;
      allocationQty: number;
    }
  ) => ActionResult;
  onDeleteUNOSub: (id: string) => void;
  onTransferProject: (
    id: string,
    target: { category?: AllocationCategory; dcMemo: string }
  ) => ActionResult;
  onOpenUnoOtherCategory?: (cat: AllocationCategory) => void;
  onOpenDCStage?: (cat: AllocationCategory) => void;
  onBack?: () => void;
}

type PendingViewTab = 'all-year' | 'dc-grouped' | 'allocated';

const NON_PROJECT_UNO_CATS: AllocationCategory[] = [
  'ভিজিএফ মৎস্য',
  'ভিজিএফ ঈদ',
  'ভিডাব্লিউভি',
];

export const PendingProjectsWorkspace: React.FC<PendingProjectsWorkspaceProps> = ({
  db,
  isUnlocked,
  onUnlock,
  onLock,
  onUpdateOfficer,
  getDCUsage,
  onSaveUNOBatch,
  onUpdateUNOSub,
  onDeleteUNOSub,
  onTransferProject,
  onOpenUnoOtherCategory,
  onOpenDCStage,
  onBack,
}) => {
  const [projectsLoaded, setProjectsLoaded] = useState(true);
  const [activeTab, setActiveTab] = useState<PendingViewTab>('all-year');
  const [catFilter, setCatFilter] = useState<AllocationCategory | 'ALL'>('ALL');
  const [fyFilter, setFyFilter] = useState<string>('ALL');
  const [unionFilter, setUnionFilter] = useState<string>('ALL');
  const [selectedDcKey, setSelectedDcKey] = useState<string>('ALL');

  // Shared UNO memo & date defaults for rapid one-by-one saves
  const [unoMemo, setUnoMemo] = useState('');
  const [unoDate, setUnoDate] = useState(todayIsoDate());

  // Selected project for one-by-one entry
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [draftByProject, setDraftByProject] = useState<
    Record<string, { unoMemo: string; unoDate: string; presidentName: string; qty: string }>
  >({});

  // Slide-to-transfer state
  const [transferProjectId, setTransferProjectId] = useState<string | null>(null);
  const [transferTargetCat, setTransferTargetCat] = useState<AllocationCategory>('জি আর');
  const [transferTargetDcMemo, setTransferTargetDcMemo] = useState<string>('');
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const cardSwipeRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  // Password lock & setup state
  const [pinInput, setPinInput] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPinDraft, setNewPinDraft] = useState(db.officer.lockPin || '');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Editing saved UNO allocation
  const [editingSubRow, setEditingSubRow] = useState<{
    id: string;
    unoMemo: string;
    unoDate: string;
    recipient: string;
    unionName: string;
    qty: string;
  } | null>(null);

  // Horizontal swipe pager for sub-tabs
  const pagerRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef<Partial<Record<PendingViewTab, HTMLButtonElement | null>>>({});
  const programmaticScrollRef = useRef(false);
  const programmaticTimerRef = useRef<number | null>(null);

  const hasPassword = Boolean((db.officer.lockPin || '').trim());
  const effectiveUnlocked = !hasPassword || isUnlocked;

  const allPendingProjects = useMemo(
    () => computeEnrichedProjects(db, { pendingOnly: true }),
    [db]
  );

  const fiscalYears = useMemo(() => {
    const set = new Set<string>();
    for (const item of allPendingProjects) {
      if (item.fiscalYear) set.add(item.fiscalYear);
    }
    return Array.from(set);
  }, [allPendingProjects]);

  const availableUnions = useMemo(() => {
    const set = new Set<string>();
    for (const item of allPendingProjects) {
      if (item.project.unionName) set.add(item.project.unionName);
    }
    return Array.from(set);
  }, [allPendingProjects]);

  const filteredPendingProjects = useMemo(() => {
    return allPendingProjects.filter((item) => {
      if (catFilter !== 'ALL' && item.project.category !== catFilter) return false;
      if (fyFilter !== 'ALL' && item.fiscalYear !== fyFilter) return false;
      if (unionFilter !== 'ALL' && item.project.unionName !== unionFilter) return false;
      return true;
    });
  }, [allPendingProjects, catFilter, fyFilter, unionFilter]);

  const dcMemoGroups = useMemo(() => {
    const dcMap = new Map<
      string,
      {
        key: string;
        category: AllocationCategory;
        dcMemo: string;
        dcDate: string;
        ministryMemo: string;
        total: number;
        remaining: number;
        items: EnrichedPendingProject[];
      }
    >();

    for (const d of db.dcAllocations) {
      if (!PROJECT_CATEGORIES.includes(d.category)) continue;
      const key = `${d.category}::${normMemoNo(d.dcMemo)}`;
      const u = getDCUsage(d.category, d.dcMemo);
      dcMap.set(key, {
        key,
        category: d.category,
        dcMemo: d.dcMemo,
        dcDate: d.dcMemoDate,
        ministryMemo: d.ministryMemo,
        total: u.total,
        remaining: u.remaining,
        items: [],
      });
    }

    for (const item of allPendingProjects) {
      const key = `${item.project.category}::${normMemoNo(item.project.dcMemo)}`;
      const existing = dcMap.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        dcMap.set(key, {
          key,
          category: item.project.category,
          dcMemo: item.project.dcMemo,
          dcDate: item.dcDate,
          ministryMemo: item.ministryMemo,
          total: item.project.allocationQty,
          remaining: item.pendingQty,
          items: [item],
        });
      }
    }

    return Array.from(dcMap.values()).filter((g) => g.items.length > 0);
  }, [db.dcAllocations, allPendingProjects, getDCUsage]);

  const dcFilteredPendingProjects = useMemo(() => {
    if (selectedDcKey === 'ALL') return allPendingProjects;
    const grp = dcMemoGroups.find((g) => g.key === selectedDcKey);
    return grp ? grp.items : [];
  }, [selectedDcKey, dcMemoGroups, allPendingProjects]);

  const projectCategoryUnoSubs = useMemo(
    () => db.unoSuballocations.filter((u) => PROJECT_CATEGORIES.includes(u.category)),
    [db.unoSuballocations]
  );

  const tabDefs: Array<{ key: PendingViewTab; label: string; count: number }> = useMemo(
    () => [
      { key: 'all-year', label: 'সারাবছরের পেন্ডিং', count: filteredPendingProjects.length },
      { key: 'dc-grouped', label: 'জেলা প্রশাসক (ডিসি)', count: dcMemoGroups.length },
      { key: 'allocated', label: 'বরাদ্দকৃত তালিকা', count: projectCategoryUnoSubs.length },
    ],
    [filteredPendingProjects.length, dcMemoGroups.length, projectCategoryUnoSubs.length]
  );

  const scrollToTab = useCallback(
    (tab: PendingViewTab, instant = false) => {
      setActiveTab(tab);
      const container = pagerRef.current;
      if (!container) return;
      const idx = tabDefs.findIndex((t) => t.key === tab);
      if (idx < 0) return;
      if (programmaticTimerRef.current !== null) {
        window.clearTimeout(programmaticTimerRef.current);
      }
      programmaticScrollRef.current = true;
      container.scrollTo({
        left: idx * container.clientWidth,
        behavior: instant ? 'auto' : 'smooth',
      });
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 420);
      tabBtnRefs.current[tab]?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    },
    [tabDefs]
  );

  const handlePagerScroll = () => {
    const container = pagerRef.current;
    if (!container || programmaticScrollRef.current || container.clientWidth <= 0) return;
    const idx = Math.round(container.scrollLeft / container.clientWidth);
    const matched = tabDefs[idx];
    if (matched && matched.key !== activeTab) {
      setActiveTab(matched.key);
      tabBtnRefs.current[matched.key]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  };

  useLayoutEffect(() => {
    const container = pagerRef.current;
    if (!container || !projectsLoaded) return;
    const syncPos = () => {
      const idx = tabDefs.findIndex((t) => t.key === activeTab);
      if (idx >= 0 && container.clientWidth > 0) {
        const targetLeft = idx * container.clientWidth;
        if (Math.abs(container.scrollLeft - targetLeft) > 4) {
          programmaticScrollRef.current = true;
          container.scrollTo({ left: targetLeft, behavior: 'auto' });
          window.setTimeout(() => {
            programmaticScrollRef.current = false;
          }, 80);
        }
      }
    };
    syncPos();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncPos);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeTab, tabDefs, projectsLoaded]);

  const getDraft = (item: EnrichedPendingProject) => {
    return (
      draftByProject[item.project.id] || {
        unoMemo,
        unoDate,
        presidentName: item.project.presidentName || '',
        qty: item.pendingQty.toFixed(3),
      }
    );
  };

  const handleSelectProject = (item: EnrichedPendingProject) => {
    if (!effectiveUnlocked) {
      setFeedback({ ok: false, text: 'প্রকল্প এন্ট্রি দিতে প্রথমে পাসওয়ার্ড দিয়ে আনলক করুন।' });
      return;
    }
    const id = item.project.id;
    setTransferProjectId(null);
    setExpandedProjectId((prev) => (prev === id ? null : id));
    setDraftByProject((prev) =>
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: {
              unoMemo,
              unoDate,
              presidentName: item.project.presidentName || '',
              qty: item.pendingQty.toFixed(3),
            },
          }
    );
  };

  const handleSaveSingleProject = (item: EnrichedPendingProject) => {
    if (!effectiveUnlocked) {
      setFeedback({ ok: false, text: 'সেভ করতে প্রথমে পাসওয়ার্ড দিয়ে আনলক করুন।' });
      return;
    }
    const draft = getDraft(item);
    const useMemoNo = (draft.unoMemo || unoMemo).trim();
    const useDate = (draft.unoDate || unoDate).trim();
    const qty = parseNum(draft.qty);
    const recipient = draft.presidentName.trim() || item.project.projectName;

    if (!useMemoNo || !useDate) {
      setFeedback({ ok: false, text: 'ইউএনও উপবরাদ্দ স্মারক নং ও তারিখ দিন।' });
      return;
    }
    if (qty <= 0) {
      setFeedback({ ok: false, text: 'বরাদ্দের পরিমাণ ০-এর বেশি হতে হবে।' });
      return;
    }

    const res = onSaveUNOBatch({
      category: item.project.category,
      sourceMemo: item.project.dcMemo,
      unoMemo: useMemoNo,
      unoDate: useDate,
      rows: [
        {
          unionName: item.project.unionName,
          recipientName: recipient,
          projectNo: item.project.projectNo,
          projectName: item.project.projectName,
          allocationQty: qty,
        },
      ],
    });
    setFeedback({
      ok: res.ok,
      text: res.ok ? res.message || 'প্রকল্প বরাদ্দ সেভ হয়েছে।' : res.error || 'সেভ করা যায়নি।',
    });
    if (res.ok) {
      setUnoMemo(useMemoNo);
      setUnoDate(useDate);
      setExpandedProjectId(null);
    }
  };

  const openTransferPanel = (item: EnrichedPendingProject) => {
    if (!effectiveUnlocked) {
      setFeedback({ ok: false, text: 'স্থানান্তর করতে প্রথমে পাসওয়ার্ড দিয়ে আনলক করুন।' });
      return;
    }
    const sameCatMemos = db.dcAllocations.filter(
      (d) =>
        d.category === item.project.category &&
        normMemoNo(d.dcMemo) !== normMemoNo(item.project.dcMemo)
    );
    const otherCat =
      sameCatMemos.length > 0
        ? item.project.category
        : PROJECT_CATEGORIES.find((c) =>
            db.dcAllocations.some(
              (d) =>
                d.category === c &&
                (c !== item.project.category || normMemoNo(d.dcMemo) !== normMemoNo(item.project.dcMemo))
            )
          ) || item.project.category;
    const candidateDc = db.dcAllocations.find(
      (d) =>
        d.category === otherCat &&
        (otherCat !== item.project.category || normMemoNo(d.dcMemo) !== normMemoNo(item.project.dcMemo))
    );

    setExpandedProjectId(null);
    setTransferProjectId(item.project.id);
    setTransferTargetCat(otherCat);
    setTransferTargetDcMemo(candidateDc?.dcMemo || '');
    setSwipeOffsets((prev) => ({ ...prev, [item.project.id]: 0 }));
  };

  const handleConfirmTransfer = (item: EnrichedPendingProject) => {
    const res = onTransferProject(item.project.id, {
      category: transferTargetCat,
      dcMemo: transferTargetDcMemo,
    });
    setFeedback({
      ok: res.ok,
      text: res.ok ? res.message || 'স্থানান্তর সম্পন্ন।' : res.error || 'স্থানান্তর ব্যর্থ।',
    });
    if (res.ok) {
      setTransferProjectId(null);
    }
  };

  const handleVerifyUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchesProjectPin(db.officer.lockPin, pinInput)) {
      onUnlock();
      setPinInput('');
      setFeedback({ ok: true, text: 'পাসওয়ার্ড যাচাই সফল! এখন প্রকল্প এন্ট্রি ও সেভ করতে পারবেন।' });
    } else {
      setFeedback({ ok: false, text: 'পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।' });
    }
  };

  const handleSavePinConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newPinDraft.trim();
    onUpdateOfficer({ lockPin: cleaned });
    setShowPinSetup(false);
    if (cleaned) {
      onUnlock();
      setFeedback({ ok: true, text: 'প্রকল্প এন্ট্রি পাসওয়ার্ড সংরক্ষিত হয়েছে।' });
    } else {
      onUnlock();
      setFeedback({ ok: true, text: 'প্রকল্প এন্ট্রি পাসওয়ার্ড সরানো হয়েছে।' });
    }
  };

  const totalPendingQty = useMemo(
    () => allPendingProjects.reduce((s, x) => s + x.pendingQty, 0),
    [allPendingProjects]
  );

  const renderProjectCard = (item: EnrichedPendingProject) => {
    const p = item.project;
    const isExpanded = expandedProjectId === p.id;
    const isTransferring = transferProjectId === p.id;
    const draft = getDraft(item);
    const offset = swipeOffsets[p.id] || 0;
    const targetDcOptions = db.dcAllocations.filter(
      (d) =>
        d.category === transferTargetCat &&
        (transferTargetCat !== p.category || normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo))
    );

    return (
      <div
        key={p.id}
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow"
      >
        {/* Right background reveal when swiped left */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-36 bg-amber-500 text-white flex flex-col items-center justify-center gap-1 px-2 text-xs font-bold"
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span>অন্যত্র স্থানান্তর</span>
        </div>

        {/* Main swipeable foreground card */}
        <div
          style={{ transform: `translateX(${offset}px)` }}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            cardSwipeRef.current = {
              id: p.id,
              startX: e.touches[0].clientX,
              startY: e.touches[0].clientY,
            };
          }}
          onTouchMove={(e) => {
            const st = cardSwipeRef.current;
            if (!st || st.id !== p.id || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - st.startX;
            const dy = e.touches[0].clientY - st.startY;
            if (Math.abs(dx) > Math.abs(dy) && dx < -12) {
              e.stopPropagation();
              setSwipeOffsets((prev) => ({
                ...prev,
                [p.id]: Math.max(-132, dx),
              }));
            }
          }}
          onTouchEnd={() => {
            const cur = swipeOffsets[p.id] || 0;
            cardSwipeRef.current = null;
            if (cur <= -64) {
              openTransferPanel(item);
            } else {
              setSwipeOffsets((prev) => ({ ...prev, [p.id]: 0 }));
            }
          }}
          className={`relative z-10 bg-white transition-transform duration-150 ${
            isExpanded ? 'bg-rose-50/30' : ''
          }`}
        >
          <div className="p-3.5 sm:p-4 space-y-2.5">
            {/* Top Meta + Qty */}
            <div className="flex items-start justify-between gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectProject(item)}
                className="flex-1 min-w-0 text-left cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-[#E2136E]">
                  <span>{p.category}</span>
                  <span className="text-slate-300">·</span>
                  <span>প্রকল্প {toBnDigits(p.projectNo)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-700">{p.unionName}</span>
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug break-words">
                  {p.projectName || `প্রকল্প ${toBnDigits(p.projectNo)}`}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-600 mt-1 tabular-nums">
                  <span>ডিসি স্মারক: {toBnDigits(p.dcMemo)}</span>
                  {item.dcDate && <span>({formatBnDate(item.dcDate)})</span>}
                  <span>· অর্থবছর: {item.fiscalYear}</span>
                  {p.presidentName && <span>· সভাপতি: {p.presidentName}</span>}
                </div>
              </button>

              <div className="flex flex-col items-end gap-1.5 shrink-0 tabular-nums">
                <span className="text-sm sm:text-base font-extrabold text-[#E2136E]">
                  {formatBnQty(item.pendingQty)} মে.টন
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openTransferPanel(item)}
                    title="অন্য স্মারক/খাতে স্থানান্তর"
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900 cursor-pointer"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">স্থানান্তর</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectProject(item)}
                    className={`min-h-[40px] inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                      isExpanded
                        ? 'bg-slate-900 text-white'
                        : 'bg-[#E2136E] hover:bg-[#B80D58] text-white'
                    }`}
                  >
                    <span>{isExpanded ? 'বন্ধ' : 'এন্ট্রি দিন'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Inline One-by-One Entry & Save Form */}
            {isExpanded && effectiveUnlocked && (
              <div className="pt-2.5 border-t border-rose-200/80 space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      ইউএনও উপবরাদ্দ স্মারক নং *
                    </label>
                    <input
                      type="text"
                      value={draft.unoMemo}
                      onChange={(e) =>
                        setDraftByProject((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, unoMemo: e.target.value },
                        }))
                      }
                      placeholder="যেমন: ০৫.১০.০৬৯৪..."
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      উপবরাদ্দ তারিখ *
                    </label>
                    <input
                      type="date"
                      value={draft.unoDate}
                      onChange={(e) =>
                        setDraftByProject((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, unoDate: e.target.value },
                        }))
                      }
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6">
                    <label className="block font-bold text-slate-700 mb-1">
                      প্রকল্প সভাপতি / সম্পাদক (প্রাপক) *
                    </label>
                    <input
                      type="text"
                      value={draft.presidentName}
                      onChange={(e) =>
                        setDraftByProject((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, presidentName: e.target.value },
                        }))
                      }
                      placeholder="সভাপতি / সম্পাদকের নাম"
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block font-bold text-slate-700 mb-1">
                      পরিমাণ (মে.টন) *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={draft.qty}
                      onChange={(e) =>
                        setDraftByProject((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, qty: e.target.value },
                        }))
                      }
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-right text-xs font-bold tabular-nums focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      onClick={() => handleSaveSingleProject(item)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                      <span>সেভ করুন</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Inline Transfer Panel (revealed by swipe-left or transfer button) */}
            {isTransferring && effectiveUnlocked && (
              <div className="pt-2.5 border-t border-amber-200 bg-amber-50/70 -mx-3 -mb-3 sm:-mx-3.5 sm:-mb-3.5 p-3 sm:p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    <span>অন্য খাত / ডিসি স্মারকে প্রকল্প স্থানান্তর</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setTransferProjectId(null)}
                    className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                    aria-label="বাতিল"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-4">
                    <label className="block font-bold text-slate-700 mb-1">লক্ষ্য খাত</label>
                    <select
                      value={transferTargetCat}
                      onChange={(e) => {
                        const nextCat = e.target.value as AllocationCategory;
                        setTransferTargetCat(nextCat);
                        const firstMemo =
                          db.dcAllocations.find(
                            (d) =>
                              d.category === nextCat &&
                              (nextCat !== p.category ||
                                normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo))
                          )?.dcMemo || '';
                        setTransferTargetDcMemo(firstMemo);
                      }}
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {PROJECT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block font-bold text-slate-700 mb-1">লক্ষ্য ডিসি স্মারক</label>
                    <select
                      value={transferTargetDcMemo}
                      onChange={(e) => setTransferTargetDcMemo(e.target.value)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <option value="">
                        {targetDcOptions.length === 0
                          ? '-- অন্য ডিসি স্মারক নেই --'
                          : '-- ডিসি স্মারক বাছাই --'}
                      </option>
                      {targetDcOptions.map((d) => (
                        <option key={d.id} value={d.dcMemo}>
                          {toBnDigits(d.dcMemo)} ({formatBnDate(d.dcMemoDate)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      disabled={!transferTargetDcMemo}
                      onClick={() => handleConfirmTransfer(item)}
                      className="w-full min-h-[40px] rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold px-3 py-1.5 cursor-pointer"
                    >
                      স্থানান্তর করুন
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3.5 font-nikosh">
      {/* Header Bar with Load Pending Projects + Password Control + Adjacent Chairman/Other Buttons */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                title="ফিরে যান"
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#E2136E] cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5 break-words">
                <FolderKanban className="h-4.5 w-4.5 text-[#E2136E] shrink-0" />
                <span>পেন্ডিং প্রকল্প (জি আর ও কাবিখা সকল খাত)</span>
              </h2>
              <p className="text-xs text-slate-600 tabular-nums">
                মোট পেন্ডিং: {toBnDigits(allPendingProjects.length)}টি প্রকল্প ·{' '}
                {formatBnQty(totalPendingQty)} মে.টন
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setProjectsLoaded(true);
                setCatFilter('ALL');
                setFyFilter('ALL');
                setUnionFilter('ALL');
                scrollToTab('all-year');
                setFeedback({
                  ok: true,
                  text: `সারাবছরের ${toBnDigits(allPendingProjects.length)}টি পেন্ডিং প্রকল্প (${formatBnQty(totalPendingQty)} মে.টন) লোড হয়েছে।`,
                });
              }}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3.5 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>পেন্ডিং প্রকল্প লোড করুন</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewPinDraft(db.officer.lockPin || '');
                setShowPinSetup((v) => !v);
              }}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
            >
              <KeyRound className="h-3.5 w-3.5 text-[#E2136E]" />
              <span>{hasPassword ? 'পাসওয়ার্ড পরিবর্তন' : 'পাসওয়ার্ড দিন'}</span>
            </button>

            {hasPassword && effectiveUnlocked && (
              <button
                type="button"
                onClick={onLock}
                className="min-h-[42px] inline-flex items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-bold text-[#E2136E] cursor-pointer whitespace-nowrap"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>লক</span>
              </button>
            )}
          </div>
        </div>

        {/* Adjacent Quick Buttons for Chairman & Other Non-Project Entries */}
        {onOpenUnoOtherCategory && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-600 flex items-center gap-1 mr-1">
              <Users className="h-3.5 w-3.5 text-[#E2136E]" />
              <span>চেয়ারম্যান ও অন্যান্য:</span>
            </span>
            {NON_PROJECT_UNO_CATS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onOpenUnoOtherCategory(cat)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 hover:border-rose-300 hover:bg-rose-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Password Set/Change Form */}
        {showPinSetup && (
          <form
            onSubmit={handleSavePinConfig}
            className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 flex flex-wrap items-end gap-2 text-xs"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block font-bold text-slate-800 mb-1">
                প্রকল্প ও ইউএনও এন্ট্রি পাসওয়ার্ড (খালি রাখলে পাসওয়ার্ড থাকবে না)
              </label>
              <input
                type="text"
                value={newPinDraft}
                onChange={(e) => setNewPinDraft(e.target.value)}
                placeholder="যেমন: ১২৩৪ বা পাসওয়ার্ড লিখুন"
                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] rounded-lg bg-[#E2136E] hover:bg-[#B80D58] px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
            >
              পাসওয়ার্ড সেভ
            </button>
            <button
              type="button"
              onClick={() => setShowPinSetup(false)}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
            >
              বাতিল
            </button>
          </form>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Password Unlock Gate when password is active and locked */}
      {!effectiveUnlocked && (
        <form
          onSubmit={handleVerifyUnlock}
          className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 space-y-3 text-xs"
        >
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Lock className="h-4 w-4 text-[#E2136E]" />
            <span>পেন্ডিং প্রকল্প এন্ট্রি সুরক্ষিত — পাসওয়ার্ড দিন</span>
          </div>
          <p className="text-slate-600">
            জি আর ও কাবিখার প্রকল্প সিলেক্ট করে এন্ট্রি ও সেভ করতে নির্ধারিত পাসওয়ার্ড দিয়ে আনলক করুন।
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              required
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="পাসওয়ার্ড লিখুন..."
              className="flex-1 min-w-[200px] min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
            />
            <button
              type="submit"
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Unlock className="h-4 w-4" />
              <span>আনলক করুন</span>
            </button>
          </div>
        </form>
      )}

      {/* Shared UNO Memo & Date Defaults Bar */}
      {effectiveUnlocked && projectsLoaded && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ডিফল্ট ইউএনও উপবরাদ্দ স্মারক নং (একসাথে সব প্রকল্পে বসবে)
            </label>
            <input
              type="text"
              value={unoMemo}
              onChange={(e) => setUnoMemo(e.target.value)}
              placeholder="যেমন: ০৫.১০.০৬৯৪..."
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ডিফল্ট উপবরাদ্দ তারিখ
            </label>
            <input
              type="date"
              value={unoDate}
              onChange={(e) => setUnoDate(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
            />
          </div>
        </div>
      )}

      {/* Single-Line Swipeable Menu Bar: সারাবছরের পেন্ডিং | জেলা প্রশাসক (ডিসি) | বরাদ্দকৃত তালিকা */}
      {projectsLoaded && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white px-2.5 py-2">
            <div
              role="tablist"
              aria-label="পেন্ডিং প্রকল্প মেনু"
              className="no-scrollbar flex items-center gap-1.5 overflow-x-auto flex-nowrap"
            >
              {tabDefs.map((tab) => {
                const isAct = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    ref={(el) => {
                      tabBtnRefs.current[tab.key] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isAct}
                    onClick={() => scrollToTab(tab.key)}
                    className={`min-h-[40px] shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                      isAct
                        ? tab.key === 'allocated'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-[#E2136E] text-white border-[#E2136E]'
                        : 'bg-rose-50/50 text-slate-700 border-slate-200 hover:bg-rose-50'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                        isAct
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      {toBnDigits(tab.count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            ref={pagerRef}
            onScroll={handlePagerScroll}
            data-no-pager-drag="true"
            className="no-scrollbar flex items-start overflow-x-auto snap-x snap-mandatory"
          >
            {/* SLIDE 1: ALL-YEAR PENDING PROJECTS (সারাবছরের পেন্ডিং প্রকল্প) */}
            <div className="w-full shrink-0 snap-center snap-always space-y-3">
              {/* Category, Year, Union Filters */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
                <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setCatFilter('ALL')}
                    className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 font-bold border cursor-pointer ${
                      catFilter === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    সব খাত ({toBnDigits(allPendingProjects.length)})
                  </button>
                  {PROJECT_CATEGORIES.map((c) => {
                    const cnt = allPendingProjects.filter((x) => x.project.category === c).length;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCatFilter(c)}
                        className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 font-bold border cursor-pointer ${
                          catFilter === c
                            ? 'bg-[#E2136E] text-white border-[#E2136E]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
                      >
                        {c} ({toBnDigits(cnt)})
                      </button>
                    );
                  })}
                </div>

                {(fiscalYears.length > 0 || availableUnions.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={fyFilter}
                      onChange={(e) => setFyFilter(e.target.value)}
                      className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold"
                    >
                      <option value="ALL">সকল সাল / অর্থবছর</option>
                      {fiscalYears.map((fy) => (
                        <option key={fy} value={fy}>
                          {fy}
                        </option>
                      ))}
                    </select>
                    <select
                      value={unionFilter}
                      onChange={(e) => setUnionFilter(e.target.value)}
                      className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold"
                    >
                      <option value="ALL">সকল ইউনিয়ন</option>
                      {availableUnions.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {filteredPendingProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 px-4 text-center space-y-2 text-xs text-slate-500">
                  <p>কোনো পেন্ডিং প্রকল্প পাওয়া যায়নি।</p>
                  {onOpenDCStage && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDCStage(catFilter === 'ALL' ? 'জি আর' : catFilter)
                      }
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 font-bold text-[#E2136E] cursor-pointer"
                    >
                      <span>ডিসি ধাপে নতুন প্রকল্প যোগ করুন</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-500 px-1">
                    প্রকল্পে টাচ করে এন্ট্রি ও সেভ করুন, অথবা বামে স্লাইড করে অন্য স্মারকে/খাতে স্থানান্তর করুন
                  </div>
                  {filteredPendingProjects.map(renderProjectCard)}
                </div>
              )}
            </div>

            {/* SLIDE 2: DC ALLOCATION GROUPED VIEW (জেলা প্রশাসক / ডিসি স্মারকসমূহ) */}
            <div className="w-full shrink-0 snap-center snap-always space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
                <div className="font-bold text-slate-800">
                  জেলা প্রশাসক (ডিসি) স্মারক নির্বাচন করুন
                </div>
                <select
                  value={selectedDcKey}
                  onChange={(e) => setSelectedDcKey(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                >
                  <option value="ALL">
                    সকল ডিসি স্মারকের পেন্ডিং প্রকল্প ({toBnDigits(allPendingProjects.length)}টি)
                  </option>
                  {dcMemoGroups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.category} · ডিসি: {toBnDigits(g.dcMemo)} ({formatBnDate(g.dcDate)}) —{' '}
                      {toBnDigits(g.items.length)}টি পেন্ডিং ({formatBnQty(g.remaining)} মে.টন বাকি)
                    </option>
                  ))}
                </select>
              </div>

              {dcFilteredPendingProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 px-4 text-center text-xs text-slate-500">
                  নির্বাচিত ডিসি স্মারকে কোনো পেন্ডিং প্রকল্প নেই।
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dcFilteredPendingProjects.map(renderProjectCard)}
                </div>
              )}
            </div>

            {/* SLIDE 3: SAVED UNO PROJECT ALLOCATIONS (বরাদ্দকৃত তালিকা) */}
            <div className="w-full shrink-0 snap-center snap-always">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-900">
                  জি আর ও কাবিখা বরাদ্দকৃত প্রকল্প তালিকা ({formatBnInt(projectCategoryUnoSubs.length)}টি)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-2.5 text-left">খাত ও স্মারক</th>
                        <th className="py-2 px-2.5 text-left">প্রকল্প / সভাপতি</th>
                        <th className="py-2 px-2.5 text-right">বরাদ্দ (মে.টন)</th>
                        <th className="py-2 px-2.5 text-center">কাজ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projectCategoryUnoSubs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-500">
                            এখনো কোনো প্রকল্পের ইউএনও উপবরাদ্দ সেভ করা হয়নি।
                          </td>
                        </tr>
                      ) : (
                        projectCategoryUnoSubs.map((u) => {
                          const isEditing = editingSubRow?.id === u.id;
                          return (
                            <tr key={u.id} className={isEditing ? 'bg-rose-50/50' : ''}>
                              <td className="py-2 px-2.5">
                                <div className="font-bold text-[#E2136E]">{u.category}</div>
                                {isEditing ? (
                                  <div className="space-y-1 mt-1">
                                    <input
                                      type="text"
                                      value={editingSubRow.unoMemo}
                                      onChange={(e) =>
                                        setEditingSubRow((prev) =>
                                          prev ? { ...prev, unoMemo: e.target.value } : prev
                                        )
                                      }
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                    />
                                    <input
                                      type="date"
                                      value={editingSubRow.unoDate}
                                      onChange={(e) =>
                                        setEditingSubRow((prev) =>
                                          prev ? { ...prev, unoDate: e.target.value } : prev
                                        )
                                      }
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                    />
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-600">
                                    ইউএনও: {toBnDigits(u.unoMemo)} ({formatBnDate(u.unoDate)})
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2.5">
                                {isEditing ? (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={editingSubRow.recipient}
                                      onChange={(e) =>
                                        setEditingSubRow((prev) =>
                                          prev ? { ...prev, recipient: e.target.value } : prev
                                        )
                                      }
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-semibold text-slate-900">
                                      {u.recipientName} · {u.unionName}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {u.projectNo ? `প্রকল্প ${toBnDigits(u.projectNo)}` : ''}
                                      {u.projectName ? ` — ${u.projectName}` : ''}
                                    </div>
                                  </>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right font-bold">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={editingSubRow.qty}
                                    onChange={(e) =>
                                      setEditingSubRow((prev) =>
                                        prev ? { ...prev, qty: e.target.value } : prev
                                      )
                                    }
                                    className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-bold"
                                  />
                                ) : (
                                  formatBnQty(u.allocationQty)
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!onUpdateUNOSub) return;
                                        const res = onUpdateUNOSub(u.id, {
                                          unoMemo: editingSubRow.unoMemo,
                                          unoDate: editingSubRow.unoDate,
                                          recipientName: editingSubRow.recipient,
                                          unionName: editingSubRow.unionName,
                                          allocationQty: parseNum(editingSubRow.qty),
                                        });
                                        setFeedback({
                                          ok: res.ok,
                                          text: res.ok
                                            ? res.message || 'হালনাগাদ হয়েছে।'
                                            : res.error || 'হালনাগাদ হয়নি।',
                                        });
                                        if (res.ok) setEditingSubRow(null);
                                      }}
                                      className="p-2 text-white bg-[#E2136E] hover:bg-[#B80D58] rounded cursor-pointer"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSubRow(null)}
                                      className="p-2 text-slate-600 bg-slate-100 rounded cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    {onUpdateUNOSub && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingSubRow({
                                            id: u.id,
                                            unoMemo: u.unoMemo,
                                            unoDate: u.unoDate,
                                            recipient: u.recipientName,
                                            unionName: u.unionName,
                                            qty: String(u.allocationQty),
                                          })
                                        }
                                        className="p-2 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => onDeleteUNOSub(u.id)}
                                      className="p-2 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
