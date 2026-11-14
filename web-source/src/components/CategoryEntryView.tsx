import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardPlus,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FolderKanban,
  Layers,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_BY_NAME,
  type AllocationCategory,
  type AllocationDatabase,
  type ChallanRecord,
  type OfficerProfileSettings,
  type RegisterId,
} from '../types/allocation';
import {
  bnToEnDigits,
  formatBnDate,
  formatBnInt,
  formatBnMoney,
  formatBnQty,
  memosLikelyMatch,
  normMemoNo,
  parseNum,
  round2,
  round3,
  toBnDigits,
  todayIsoDate,
} from '../shared/bnUtils';
import {
  PROJECT_CATEGORIES,
  computeEnrichedProjects,
  matchesProjectPin,
  type EnrichedPendingProject,
} from '../shared/projectHelpers';
import { matchDOsToSuballocations } from '../shared/allocReportEngine';
import type { ActionResult } from '../store/useAllocationStore';
import { DOWorkspaceView } from './DOWorkspaceView';

export type EntryStageKey = 'ministry' | 'dc' | 'uno' | 'ucf';

interface CategoryEntryViewProps {
  db: AllocationDatabase;
  selectedCategory: AllocationCategory;
  lockedStage?: EntryStageKey | null;
  onBack?: () => void;
  onSelectCategory: (cat: AllocationCategory) => void;
  getMinistryUsage: (cat: AllocationCategory, memo: string) => { total: number; used: number; remaining: number };
  getDCUsage: (cat: AllocationCategory, dcMemo: string) => { total: number; used: number; remaining: number };
  onAddMinistry: (input: {
    category: AllocationCategory;
    memoNo: string;
    memoDate: string;
    allocationQty: number;
    grain: 'চাল' | 'গম' | 'আটা';
    phase?: number;
    comment?: string;
  }) => ActionResult;
  onUpdateMinistry?: (
    id: string,
    patch: {
      memoNo: string;
      memoDate: string;
      allocationQty: number;
      grain: 'চাল' | 'গম' | 'আটা';
      phase?: number;
      comment?: string;
    }
  ) => ActionResult;
  onDeleteMinistry: (id: string) => void;
  onAddDC: (
    input: {
      category: AllocationCategory;
      ministryMemo: string;
      dcMemo: string;
      dcMemoDate: string;
      allocationQty: number;
    },
    attachedProjects?: Array<{
      projectNo: string;
      projectName: string;
      presidentName: string;
      unionName: string;
      allocationQty: number;
    }>
  ) => ActionResult;
  onUpdateDC?: (
    id: string,
    patch: {
      ministryMemo: string;
      dcMemo: string;
      dcMemoDate: string;
      allocationQty: number;
    }
  ) => ActionResult;
  onDeleteDC: (id: string) => void;
  onAddProjectsToDC: (
    category: AllocationCategory,
    dcMemo: string,
    entries: Array<{
      projectNo: string;
      projectName: string;
      presidentName: string;
      unionName: string;
      allocationQty: number;
    }>
  ) => ActionResult;
  onSaveDealerBatch: (payload: {
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
  }) => ActionResult;
  onUpdateDealerSub?: (
    id: string,
    patch: {
      unoMemo: string;
      unoDate: string;
      dealerName: string;
      unionName: string;
      allocationQty: number;
    }
  ) => ActionResult;
  onDeleteDealerSub: (id: string) => void;
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
  onSaveDOBook?: (input: { bookNo: number; startPage: number; endPage: number }) => ActionResult;
  onDeleteDOBook?: (id: string) => void;
  verifyChallan?: (
    category: AllocationCategory,
    dealerName: string,
    qty: number,
    opts?: { subId?: string; unoDate?: string; unoMemo?: string }
  ) => {
    applicable: boolean;
    ok: boolean;
    message?: string;
    requiredAmount?: number;
    requiredTaxAmount?: number;
    mainChallan?: ChallanRecord;
    taxChallan?: ChallanRecord;
    errors?: string[];
  };
  onIssueDOBatch?: (
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
  ) => ActionResult;
  onUpdateDOIssue?: (
    id: string,
    patch: { doNo: string; issueDate: string; allocationQty: number }
  ) => ActionResult;
  onDeleteDOIssue?: (id: string) => void;
  onOpenRegister: (regId: RegisterId) => void;
  onOpenDOIssue: () => void;
  isProjectUnlocked?: boolean;
  onUnlockProjectEntry?: () => void;
  onLockProjectEntry?: () => void;
  onUpdateOfficer?: (patch: Partial<OfficerProfileSettings>) => void;
  onTransferProject?: (
    id: string,
    target: { category?: AllocationCategory; dcMemo: string }
  ) => ActionResult;
  onDeleteProject?: (id: string) => void;
  onOpenPendingProjectsWorkspace?: () => void;
}

type StepKey = 'ministry' | 'dc' | 'sub' | 'do';
type EntryMode = 'category' | 'office';
type OfficeTabKey = 'ministry' | 'dc' | 'uno' | 'ucf';

const CATEGORY_GROUPS = [
  'ডিলার খাত',
  'ইপি',
  'ত্রাণ',
  'কাবিখা',
  'ভিডাব্লিউভি',
] as const;

interface ProjectDraft {
  projectNo: string;
  projectName: string;
  presidentName: string;
  unionName: string;
  allocationQty: string;
}

interface NormalizedOmsDealer {
  key: string;
  dealerKind: 'ওএমএস' | 'খাদ্য বান্ধব';
  dealerName: string;
  areaType: 'ইউনিয়ন' | 'পৌরসভা';
  unionName: string;
  municipality: string;
  salesCenter: string;
}

type SubTabKey = 'dealer' | 'chairman' | 'manual' | 'project' | 'allocated';

interface UnoManualRow {
  id: string;
  unionName: string;
  recipientName: string;
  projectNo: string;
  projectName: string;
  qty: string;
}

const STAGE_LABEL_MAP: Record<EntryStageKey, string> = {
  ministry: 'মন্ত্রণালয় বরাদ্দ এন্ট্রি',
  dc: 'জেলা প্রশাসক (ডিসি) বরাদ্দ এন্ট্রি',
  uno: 'ইউএনও উপবরাদ্দ এন্ট্রি',
  ucf: 'ইউসিএফ উপবরাদ্দ এন্ট্রি',
};

export const CategoryEntryView: React.FC<CategoryEntryViewProps> = ({
  db,
  selectedCategory,
  lockedStage = null,
  onBack,
  onSelectCategory,
  getMinistryUsage,
  getDCUsage,
  onAddMinistry,
  onUpdateMinistry,
  onDeleteMinistry,
  onAddDC,
  onUpdateDC,
  onDeleteDC,
  onAddProjectsToDC,
  onSaveDealerBatch,
  onUpdateDealerSub,
  onDeleteDealerSub,
  onSaveUNOBatch,
  onUpdateUNOSub,
  onDeleteUNOSub,
  onSaveDOBook,
  onDeleteDOBook,
  verifyChallan,
  onIssueDOBatch,
  onUpdateDOIssue,
  onDeleteDOIssue,
  onOpenRegister,
  onOpenDOIssue,
  isProjectUnlocked,
  onUnlockProjectEntry,
  onLockProjectEntry,
  onUpdateOfficer,
  onTransferProject,
  onDeleteProject,
  onOpenPendingProjectsWorkspace,
}) => {
  const meta = CATEGORY_BY_NAME[selectedCategory];
  const [entryMode, setEntryMode] = useState<EntryMode>('category');
  const [showCatGrid, setShowCatGrid] = useState(false);
  const [officeTab, setOfficeTab] = useState<OfficeTabKey>('ministry');
  const [showLoadedMinistryInDC, setShowLoadedMinistryInDC] = useState(true);
  const [activeStep, setActiveStep] = useState<StepKey>(() => {
    if (lockedStage === 'dc') return meta.requiresDC ? 'dc' : 'sub';
    if (lockedStage === 'uno' || lockedStage === 'ucf') return 'sub';
    return 'ministry';
  });
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Office-level ("দপ্তরভিত্তিক") Ministry Entry state
  const [offMinCat, setOffMinCat] = useState<AllocationCategory>(selectedCategory);
  const [offMinMemo, setOffMinMemo] = useState('');
  const [offMinDate, setOffMinDate] = useState(todayIsoDate());
  const [offMinQty, setOffMinQty] = useState('');
  const [offMinGrain, setOffMinGrain] = useState<'চাল' | 'গম' | 'আটা'>(meta.defaultGrain || 'চাল');
  const [offMinPhase, setOffMinPhase] = useState('1');
  const [offMinComment, setOffMinComment] = useState('');

  const pendingJumpRef = useRef<{
    step: StepKey;
    dcMinMemo?: string;
    inspectedMinMemo?: string;
    subSourceMemo?: string;
    inspectedSubSourceMemo?: string;
  } | null>(null);

  // Horizontal swipe pager refs for seamless left/right step navigation
  const entryPagerRef = useRef<HTMLDivElement>(null);
  const entryStepBtnRefs = useRef<Partial<Record<StepKey, HTMLButtonElement | null>>>({});
  const entryDragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({ active: false, startX: 0, startScrollLeft: 0, moved: false });
  const entryProgrammaticScrollRef = useRef(false);
  const entryProgrammaticTimerRef = useRef<number | null>(null);
  const [isDraggingEntryPager, setIsDraggingEntryPager] = useState(false);

  // Step 1: Ministry state
  const [editingMinId, setEditingMinId] = useState<string | null>(null);
  const [minMemo, setMinMemo] = useState('');
  const [minDate, setMinDate] = useState(todayIsoDate());
  const [minQty, setMinQty] = useState('');
  const [minGrain, setMinGrain] = useState<'চাল' | 'গম' | 'আটা'>(meta.defaultGrain || 'চাল');
  const [minPhase, setMinPhase] = useState('1');
  const [minComment, setMinComment] = useState('');

  // Step 2: DC state
  const [editingDcId, setEditingDcId] = useState<string | null>(null);
  const [dcMinMemo, setDcMinMemo] = useState('');
  const [inspectedMinMemo, setInspectedMinMemo] = useState('');
  const [dcMemo, setDcMemo] = useState('');
  const [dcDate, setDcDate] = useState(todayIsoDate());
  const [dcQty, setDcQty] = useState('');
  const [projectDrafts, setProjectDrafts] = useState<ProjectDraft[]>([]);
  const [csvText, setCsvText] = useState('');
  const [uploadedExcelName, setUploadedExcelName] = useState('');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [extraProjectDcMemo, setExtraProjectDcMemo] = useState('');

  // Step 3: Suballocation state
  const isDealerOrEpFlow =
    meta.flowType === 'dealer_food' || meta.flowType === 'dealer_oms' || meta.flowType === 'ep';
  const [subSourceMemo, setSubSourceMemo] = useState('');
  const [inspectedSubSourceMemo, setInspectedSubSourceMemo] = useState('');
  const [subUnoMemo, setSubUnoMemo] = useState('');
  const [subUnoDate, setSubUnoDate] = useState(todayIsoDate());
  const [allocatedFilterCurrentMemo, setAllocatedFilterCurrentMemo] = useState(true);
  const [omsAreaFilter, setOmsAreaFilter] = useState<'ALL' | 'ইউনিয়ন' | 'পৌরসভা'>('ALL');
  const [omsDealerTypeFilter, setOmsDealerTypeFilter] = useState<'ALL' | 'ওএমএস' | 'খাদ্য বান্ধব'>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>(() => {
    if (isDealerOrEpFlow) return 'dealer';
    return meta.supportsProjects ? 'project' : 'chairman';
  });

  // Pending project selection, transfer & lock state (for GR & Kabikha UNO project-only entry)
  const [localProjectUnlocked, setLocalProjectUnlocked] = useState(false);
  const [projectPinInput, setProjectPinInput] = useState('');
  const [expandedPendingProjId, setExpandedPendingProjId] = useState<string | null>(null);
  const [transferringProjId, setTransferringProjId] = useState<string | null>(null);
  const [transferTargetCat, setTransferTargetCat] = useState<AllocationCategory>(selectedCategory);
  const [transferTargetDcMemo, setTransferTargetDcMemo] = useState('');
  const [projSwipeOffsets, setProjSwipeOffsets] = useState<Record<string, number>>({});
  const projSwipeStartRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  const hasProjectPassword = Boolean((db.officer.lockPin || '').trim());
  const effectiveProjectUnlocked =
    !hasProjectPassword || (isProjectUnlocked ?? localProjectUnlocked);

  // Horizontal swipe pager refs for Step 3 sub-pages
  const subPagerRef = useRef<HTMLDivElement>(null);
  const subTabBtnRefs = useRef<Partial<Record<SubTabKey, HTMLButtonElement | null>>>({});
  const subDragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({ active: false, startX: 0, startScrollLeft: 0, moved: false });
  const subProgrammaticScrollRef = useRef(false);
  const subProgrammaticTimerRef = useRef<number | null>(null);
  const [isDraggingSubPager, setIsDraggingSubPager] = useState(false);

  const getUnionOptions = useCallback(
    (current?: string) => {
      const trimmed = (current || '').trim();
      if (trimmed && !db.officer.unions.includes(trimmed)) {
        return [trimmed, ...db.officer.unions];
      }
      return db.officer.unions;
    },
    [db.officer.unions]
  );
  const [unoManualRows, setUnoManualRows] = useState<UnoManualRow[]>(() => [
    {
      id: `um-${Date.now()}`,
      unionName: db.officer.unions[0] || '',
      recipientName: '',
      projectNo: '',
      projectName: '',
      qty: '',
    },
  ]);
  const [editingSubRow, setEditingSubRow] = useState<{
    id: string;
    kind: 'dealer' | 'uno';
    unoMemo: string;
    unoDate: string;
    recipient: string;
    unionName: string;
    qty: string;
  } | null>(null);

  const [dealerBatchState, setDealerBatchState] = useState<
    Record<string, { selected: boolean; cards: number; unused: number; qty: string }>
  >({});
  const [unoBatchQty, setUnoBatchQty] = useState<
    Record<string, { selected: boolean; qty: string; presidentName?: string }>
  >({});

  // Records strictly scoped to selectedCategory ONLY
  const catMinistryList = useMemo(
    () => db.ministryAllocations.filter((m) => m.category === selectedCategory),
    [db.ministryAllocations, selectedCategory]
  );

  const catDCList = useMemo(
    () => db.dcAllocations.filter((d) => d.category === selectedCategory),
    [db.dcAllocations, selectedCategory]
  );

  const availableMinistryMemos = useMemo(
    () => catMinistryList.filter((m) => getMinistryUsage(selectedCategory, m.memoNo).remaining > 0.0005),
    [catMinistryList, getMinistryUsage, selectedCategory]
  );

  const availableDCMemos = useMemo(
    () => catDCList.filter((d) => getDCUsage(selectedCategory, d.dcMemo).remaining > 0.0005),
    [catDCList, getDCUsage, selectedCategory]
  );

  const catRate = useMemo(
    () => db.rates.find((r) => r.category === selectedCategory) || { unitPrice: 0, taxRate: 0 },
    [db.rates, selectedCategory]
  );

  const hasEmbeddedDo = Boolean(
    onSaveDOBook &&
      onDeleteDOBook &&
      verifyChallan &&
      onIssueDOBatch &&
      onDeleteDOIssue
  );

  const stepDefs = useMemo(
    () => [
      {
        key: 'ministry' as StepKey,
        label: `১. ${meta.flowType === 'ep' ? 'বিভাগীয় / মন্ত্রণালয়' : 'মন্ত্রণালয়'} (${formatBnInt(catMinistryList.length)})`,
      },
      ...(meta.requiresDC
        ? [
            {
              key: 'dc' as StepKey,
              label: `২. ডিসি${meta.supportsProjects ? ' ও প্রকল্প' : ''} (${formatBnInt(catDCList.length)})`,
            },
          ]
        : []),
      {
        key: 'sub' as StepKey,
        label: `${meta.requiresDC ? '৩.' : '২.'} ${meta.flowType.startsWith('dealer') || meta.flowType === 'ep' ? 'ইউসিএফ' : 'ইউএনও'}`,
      },
      ...(hasEmbeddedDo
        ? [
            {
              key: 'do' as StepKey,
              label: `${meta.requiresDC ? '৪.' : '৩.'} ডিও ইস্যু`,
            },
          ]
        : []),
    ],
    [meta, catMinistryList.length, catDCList.length, hasEmbeddedDo]
  );

  const scrollToStep = useCallback(
    (step: StepKey, instant = false) => {
      setActiveStep(step);
      const container = entryPagerRef.current;
      if (!container) return;
      const idx = stepDefs.findIndex((s) => s.key === step);
      if (idx < 0) return;
      if (entryProgrammaticTimerRef.current !== null) {
        window.clearTimeout(entryProgrammaticTimerRef.current);
      }
      entryProgrammaticScrollRef.current = true;
      container.scrollTo({
        left: idx * container.clientWidth,
        behavior: instant ? 'auto' : 'smooth',
      });
      entryProgrammaticTimerRef.current = window.setTimeout(() => {
        entryProgrammaticScrollRef.current = false;
      }, 420);
      entryStepBtnRefs.current[step]?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    },
    [stepDefs]
  );

  const handleEntryPagerScroll = () => {
    const container = entryPagerRef.current;
    if (!container || entryProgrammaticScrollRef.current) return;
    const w = container.clientWidth;
    if (w <= 0) return;
    const idx = Math.round(container.scrollLeft / w);
    const matched = stepDefs[idx];
    if (matched && matched.key !== activeStep) {
      setActiveStep(matched.key);
      entryStepBtnRefs.current[matched.key]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  };

  const finishEntryPagerDrag = () => {
    if (!entryDragRef.current.active) return;
    entryDragRef.current.active = false;
    setIsDraggingEntryPager(false);
    const container = entryPagerRef.current;
    if (container && container.clientWidth > 0) {
      const idx = Math.round(container.scrollLeft / container.clientWidth);
      const matched = stepDefs[idx];
      if (matched) scrollToStep(matched.key);
    }
    window.setTimeout(() => {
      entryDragRef.current.moved = false;
    }, 50);
  };

  // Sync defaults & lockedStage cleanly when category or lockedStage changes
  useEffect(() => {
    setMinGrain(meta.defaultGrain || 'চাল');
    setFeedback(null);
    setProjectDrafts([]);
    setCsvText('');
    setUploadedExcelName('');
    setAllocatedFilterCurrentMemo(true);
    setOmsDealerTypeFilter('ALL');
    setOmsAreaFilter('ALL');

    const firstAvailMin = availableMinistryMemos[0]?.memoNo || '';
    const firstAvailDc = availableDCMemos[0]?.dcMemo || '';
    const defaultSubMemo = meta.requiresDC
      ? firstAvailDc || catDCList[0]?.dcMemo || ''
      : firstAvailMin || catMinistryList[0]?.memoNo || '';
    const defaultSubTab: SubTabKey = isDealerOrEpFlow
      ? 'dealer'
      : meta.supportsProjects
        ? 'project'
        : 'chairman';
    setActiveSubTab(defaultSubTab);
    setExpandedPendingProjId(null);
    setTransferringProjId(null);
    if (meta.supportsProjects) {
      setTransferTargetCat(selectedCategory);
    }

    const jump = pendingJumpRef.current;
    pendingJumpRef.current = null;

    if (jump) {
      setActiveStep(jump.step);
      window.requestAnimationFrame(() => scrollToStep(jump.step, true));
      if (jump.dcMinMemo !== undefined) setDcMinMemo(jump.dcMinMemo);
      if (jump.inspectedMinMemo !== undefined) setInspectedMinMemo(jump.inspectedMinMemo);
      if (jump.subSourceMemo !== undefined) setSubSourceMemo(jump.subSourceMemo);
      if (jump.inspectedSubSourceMemo !== undefined) {
        setInspectedSubSourceMemo(jump.inspectedSubSourceMemo);
      }
      return;
    }

    const nextStep: StepKey =
      lockedStage === 'dc'
        ? meta.requiresDC
          ? 'dc'
          : 'sub'
        : lockedStage === 'uno' || lockedStage === 'ucf'
          ? 'sub'
          : 'ministry';
    setActiveStep(nextStep);
    setEntryMode('category');
    window.requestAnimationFrame(() => scrollToStep(nextStep, true));

    setDcMinMemo(firstAvailMin);
    setInspectedMinMemo(firstAvailMin || catMinistryList[0]?.memoNo || '');
    setExtraProjectDcMemo(firstAvailDc || catDCList[0]?.dcMemo || '');
    setSubSourceMemo(defaultSubMemo);
    setInspectedSubSourceMemo(defaultSubMemo);
  }, [selectedCategory, lockedStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first available source memo if it loads asynchronously after mount
  useEffect(() => {
    if (subSourceMemo) return;
    const firstAvail = meta.requiresDC
      ? availableDCMemos[0]?.dcMemo || catDCList[0]?.dcMemo || ''
      : availableMinistryMemos[0]?.memoNo || catMinistryList[0]?.memoNo || '';
    if (firstAvail) {
      setSubSourceMemo(firstAvail);
      setInspectedSubSourceMemo(firstAvail);
    }
  }, [
    subSourceMemo,
    meta.requiresDC,
    availableDCMemos,
    availableMinistryMemos,
    catDCList,
    catMinistryList,
  ]);

  // Keep horizontal step pager locked onto activeStep across initial layout & resize
  useLayoutEffect(() => {
    const container = entryPagerRef.current;
    if (!container) return;
    const syncPos = () => {
      const idx = stepDefs.findIndex((s) => s.key === activeStep);
      if (idx >= 0 && container.clientWidth > 0) {
        const targetLeft = idx * container.clientWidth;
        if (Math.abs(container.scrollLeft - targetLeft) > 4) {
          entryProgrammaticScrollRef.current = true;
          container.scrollTo({ left: targetLeft, behavior: 'auto' });
          window.setTimeout(() => {
            entryProgrammaticScrollRef.current = false;
          }, 80);
        }
      }
    };
    syncPos();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncPos);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeStep, stepDefs, entryMode]);

  const allOmsCategoryDealers = useMemo<NormalizedOmsDealer[]>(() => {
    const omsRows: NormalizedOmsDealer[] = db.omsDealers.map((d) => ({
      key: `oms:${d.id}`,
      dealerKind: 'ওএমএস',
      dealerName: d.dealerName,
      areaType: d.areaType,
      unionName: d.unionName,
      municipality: d.municipality,
      salesCenter: d.salesCenter,
    }));

    // ওএমএস সাধারণ ও ওএমএস বিশেষ -> শুধু ওএমএস ডিলার
    // ওএমএস টিসিবি -> ওএমএস + খাদ্য বান্ধব সকল ডিলার
    if (selectedCategory === 'ওএমএস টিসিবি') {
      const foodRows: NormalizedOmsDealer[] = db.foodDealers.map((d) => ({
        key: `food:${d.id}`,
        dealerKind: 'খাদ্য বান্ধব',
        dealerName: d.dealerName,
        areaType: 'ইউনিয়ন',
        unionName: d.unionName,
        municipality: '',
        salesCenter: d.salesCenter,
      }));
      return [...omsRows, ...foodRows];
    }

    return omsRows;
  }, [db.omsDealers, db.foodDealers, selectedCategory]);

  const filteredOmsDealers = useMemo(() => {
    return allOmsCategoryDealers.filter((d) => {
      if (omsAreaFilter !== 'ALL' && d.areaType !== omsAreaFilter) return false;
      if (omsDealerTypeFilter !== 'ALL' && d.dealerKind !== omsDealerTypeFilter) return false;
      return true;
    });
  }, [allOmsCategoryDealers, omsAreaFilter, omsDealerTypeFilter]);

  const dcProjectsForSelected = useMemo(
    () => db.projects.filter((p) => p.category === selectedCategory && p.dcMemo === subSourceMemo),
    [db.projects, selectedCategory, subSourceMemo]
  );

  const catSavedProjects = useMemo(
    () => db.projects.filter((p) => p.category === selectedCategory),
    [db.projects, selectedCategory]
  );

  const enrichedPendingProjects = useMemo(() => {
    if (!meta.supportsProjects || !subSourceMemo) return [];
    return computeEnrichedProjects(db, {
      category: selectedCategory,
      dcMemo: subSourceMemo,
      pendingOnly: true,
    });
  }, [db, meta.supportsProjects, selectedCategory, subSourceMemo]);

  useEffect(() => {
    setExpandedPendingProjId(null);
    setTransferringProjId(null);
  }, [subSourceMemo]);

  // Reset batch selections cleanly only when category changes
  useEffect(() => {
    setDealerBatchState({});
    setUnoBatchQty({});
  }, [selectedCategory]);

  // Populate/preserve batch rows cleanly when master lists or projects load
  useEffect(() => {
    if (meta.flowType === 'dealer_food') {
      setDealerBatchState((prev) => {
        const next: Record<string, { selected: boolean; cards: number; unused: number; qty: string }> = {};
        for (const d of db.foodDealers) {
          if (prev[d.id]) {
            next[d.id] = prev[d.id];
          } else {
            const q = d.totalQty > 0 ? round3(d.totalQty) : round3(Math.max(0, d.cardCount) * 0.03);
            next[d.id] = { selected: q > 0, cards: d.cardCount, unused: 0, qty: q.toFixed(3) };
          }
        }
        return next;
      });
    } else if (meta.flowType === 'dealer_oms') {
      setDealerBatchState((prev) => {
        const next: Record<string, { selected: boolean; cards: number; unused: number; qty: string }> = {};
        for (const d of allOmsCategoryDealers) {
          next[d.key] = prev[d.key] || { selected: false, cards: 0, unused: 0, qty: '1.000' };
        }
        return next;
      });
    } else if (meta.flowType === 'ep') {
      setDealerBatchState((prev) => {
        const next: Record<string, { selected: boolean; cards: number; unused: number; qty: string }> = {};
        for (const f of db.fireServices) {
          next[f.id] = prev[f.id] || { selected: true, cards: 0, unused: 0, qty: '1.000' };
        }
        return next;
      });
    } else {
      setUnoBatchQty((prev) => {
        const nextUno: Record<string, { selected: boolean; qty: string; presidentName?: string }> = {};
        for (const ep of enrichedPendingProjects) {
          const p = ep.project;
          nextUno[p.id] = prev[p.id] || {
            selected: false,
            qty: ep.pendingQty.toFixed(3),
            presidentName: p.presidentName || '',
          };
        }
        for (const p of dcProjectsForSelected) {
          if (!nextUno[p.id]) {
            nextUno[p.id] = prev[p.id] || {
              selected: false,
              qty: p.allocationQty.toFixed(3),
              presidentName: p.presidentName || '',
            };
          }
        }
        for (const ch of db.chairmen) {
          nextUno[ch.id] = prev[ch.id] || { selected: false, qty: '' };
        }
        return nextUno;
      });
    }
  }, [
    selectedCategory,
    meta.flowType,
    subSourceMemo,
    db.foodDealers,
    allOmsCategoryDealers,
    db.fireServices,
    db.chairmen,
    dcProjectsForSelected,
    enrichedPendingProjects,
  ]);

  const showResult = (res: ActionResult) => {
    setFeedback({
      ok: res.ok,
      text: res.ok ? res.message || 'সংরক্ষিত হয়েছে।' : res.error || 'সংরক্ষণ করা যায়নি।',
    });
  };

  const resetMinistryForm = () => {
    setEditingMinId(null);
    setMinMemo('');
    setMinDate(todayIsoDate());
    setMinQty('');
    setMinGrain(meta.defaultGrain || 'চাল');
    setMinPhase('1');
    setMinComment('');
  };

  const handleSaveMinistry = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMinId && onUpdateMinistry) {
      const res = onUpdateMinistry(editingMinId, {
        memoNo: minMemo,
        memoDate: minDate,
        allocationQty: parseNum(minQty),
        grain: minGrain,
        phase: meta.hasPhase ? parseNum(minPhase) || 1 : undefined,
        comment: minComment.trim() || undefined,
      });
      showResult(res);
      if (res.ok) {
        resetMinistryForm();
      }
      return;
    }

    const res = onAddMinistry({
      category: selectedCategory,
      memoNo: minMemo,
      memoDate: minDate,
      allocationQty: parseNum(minQty),
      grain: minGrain,
      phase: meta.hasPhase ? parseNum(minPhase) || 1 : undefined,
      comment: minComment.trim() || undefined,
    });
    showResult(res);
    if (res.ok) {
      const savedMemo = minMemo.trim();
      setDcMinMemo(savedMemo);
      setInspectedMinMemo(savedMemo);
      if (!meta.requiresDC) {
        setSubSourceMemo(savedMemo);
        setInspectedSubSourceMemo(savedMemo);
      }
      setMinMemo('');
      setMinQty('');
      setMinComment('');
    }
  };

  const handleDownloadProjectTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsProjects = XLSX.utils.aoa_to_sheet([
      ['প্রকল্প নং', 'প্রকল্পের নাম', 'সভাপতির নাম', 'ইউনিয়ন', 'বরাদ্দ (মে.টন)'],
    ]);
    wsProjects['!cols'] = [
      { wch: 15 },
      { wch: 36 },
      { wch: 24 },
      { wch: 20 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects');

    const wsInfo = XLSX.utils.aoa_to_sheet([
      ['কলাম', 'বিবরণ', 'উদাহরণ'],
      ['প্রকল্প নং', 'প্রকল্পের ক্রমিক বা কোড নম্বর', '১'],
      ['প্রকল্পের নাম', 'প্রকল্পের পূর্ণ বিবরণ', 'কবিরাজবাড়ি রাস্তা সংস্কার'],
      ['সভাপতির নাম', 'প্রকল্প সভাপতি / সেক্রেটারির নাম', 'মোঃ আব্দুর রহিম'],
      ['ইউনিয়ন', 'ইউনিয়নের নাম', db.officer.unions[0] || 'সদর'],
      ['বরাদ্দ (মে.টন)', 'বরাদ্দের পরিমাণ (সংখ্যা, ইংরেজি বা বাংলা অঙ্ক)', '৫.০০০'],
    ]);
    wsInfo['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    XLSX.writeFile(wb, `${selectedCategory}-প্রকল্প-টেম্পলেট.xlsx`);
    setFeedback({ ok: true, text: 'প্রকল্প এক্সেল টেম্পলেট ডাউনলোড হয়েছে।' });
  };

  const handleUploadProjectExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const targetSheetName =
        wb.SheetNames.find((n) => n.toLowerCase() === 'projects') || wb.SheetNames[0];
      if (!targetSheetName) {
        setFeedback({ ok: false, text: 'এক্সেল ফাইলে কোনো শিট পাওয়া যায়নি।' });
        return;
      }
      const ws = wb.Sheets[targetSheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      if (matrix.length === 0) {
        setFeedback({ ok: false, text: 'এক্সেল ফাইলটি ফাঁকা রয়েছে।' });
        return;
      }

      const firstRow = (matrix[0] || []).map((c) => String(c ?? '').trim());
      const hasHeader = firstRow.some((cell) => {
        const l = cell.toLowerCase();
        return (
          l.includes('প্রকল্প') ||
          l.includes('project') ||
          l.includes('সভাপতি') ||
          l.includes('ইউনিয়ন') ||
          l.includes('বরাদ্দ') ||
          l.includes('qty')
        );
      });

      const findCol = (patterns: string[], fallbackIdx: number) => {
        if (!hasHeader) return fallbackIdx;
        const found = firstRow.findIndex((h) => {
          const l = h.toLowerCase();
          return patterns.some((p) => l.includes(p));
        });
        return found >= 0 ? found : fallbackIdx;
      };

      const colNo = findCol(['প্রকল্প নং', 'project no', 'no', 'নং'], 0);
      const colName = findCol(['প্রকল্পের নাম', 'project name', 'নাম', 'name'], 1);
      const colPres = findCol(['সভাপতি', 'সেক্রেটারি', 'president', 'secretary'], 2);
      const colUnion = findCol(['ইউনিয়ন', 'union'], 3);
      const colQty = findCol(['বরাদ্দ', 'পরিমাণ', 'qty', 'quantity', 'mt', 'টন'], 4);

      const dataRows = hasHeader ? matrix.slice(1) : matrix;
      const parsed: ProjectDraft[] = [];
      const seenNos = new Set(projectDrafts.map((p) => bnToEnDigits(p.projectNo).trim().toLowerCase()).filter(Boolean));

      for (const r of dataRows) {
        if (!Array.isArray(r) || r.every((c) => String(c ?? '').trim() === '')) continue;
        const rawNo = String(r[colNo] ?? '').trim();
        const rawName = String(r[colName] ?? '').trim();
        const rawPres = String(r[colPres] ?? '').trim();
        const rawUnion = String(r[colUnion] ?? '').trim();
        const rawQty = parseNum(String(r[colQty] ?? '0'));

        if (!rawNo && !rawName) continue;
        const projectNo = rawNo || `প্রকল্প-${projectDrafts.length + parsed.length + 1}`;
        const normKey = bnToEnDigits(projectNo).trim().toLowerCase();
        if (normKey && seenNos.has(normKey)) continue;
        if (normKey) seenNos.add(normKey);

        parsed.push({
          projectNo,
          projectName: rawName,
          presidentName: rawPres,
          unionName: rawUnion || db.officer.unions[0] || '',
          allocationQty: rawQty > 0 ? round3(rawQty).toFixed(3) : '',
        });
      }

      if (parsed.length === 0) {
        setFeedback({
          ok: false,
          text: 'এক্সেল থেকে কোনো বৈধ প্রকল্প সারি পাওয়া যায়নি। অনুগ্রহ করে টেম্পলেট কলাম যাচাই করুন।',
        });
        return;
      }

      const nextList = [...projectDrafts, ...parsed];
      setProjectDrafts(nextList);
      setUploadedExcelName(file.name);

      const sumQty = round3(nextList.reduce((s, p) => s + parseNum(p.allocationQty), 0));
      if (!editingDcId && sumQty > 0) {
        setDcQty(sumQty.toFixed(3));
      }
      setFeedback({
        ok: true,
        text: `${file.name} থেকে ${toBnDigits(parsed.length)}টি প্রকল্প লোড হয়েছে (মোট ${formatBnQty(sumQty)} মে.টন)।`,
      });
    } catch (err) {
      setFeedback({
        ok: false,
        text: `এক্সেল পড়তে সমস্যা হয়েছে: ${err instanceof Error ? err.message : 'ফাইল যাচাই করুন'}`,
      });
    }
  };

  const projectDraftTotalQty = useMemo(
    () => round3(projectDrafts.reduce((s, p) => s + parseNum(p.allocationQty), 0)),
    [projectDrafts]
  );

  const handleParseCsvProjects = () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: ProjectDraft[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t|]+/).map((p) => p.trim());
      if (parts.length >= 2) {
        parsed.push({
          projectNo: parts[0] || `প্রকল্প-${parsed.length + 1}`,
          projectName: parts[1] || '',
          presidentName: parts[2] || '',
          unionName: parts[3] || db.officer.unions[0] || '',
          allocationQty: String(parseNum(parts[4] || '0') || ''),
        });
      }
    }
    if (parsed.length === 0) {
      setFeedback({ ok: false, text: 'সঠিক ফরম্যাটে প্রকল্প লাইন দিন: প্রকল্প নং, প্রকল্পের নাম, সভাপতি, ইউনিয়ন, পরিমাণ' });
      return;
    }
    const nextList = [...projectDrafts, ...parsed];
    setProjectDrafts(nextList);
    setCsvText('');
    const sumQty = round3(nextList.reduce((s, p) => s + parseNum(p.allocationQty), 0));
    if (!editingDcId && (!dcQty || Number(dcQty) <= 0) && sumQty > 0) {
      setDcQty(sumQty.toFixed(3));
    }
    setFeedback({ ok: true, text: `${toBnDigits(parsed.length)}টি প্রকল্প যুক্ত হয়েছে।` });
  };

  const resetDCForm = () => {
    setEditingDcId(null);
    setDcMemo('');
    setDcDate(todayIsoDate());
    setDcQty('');
    setProjectDrafts([]);
    setUploadedExcelName('');
  };

  const handleSaveDC = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDcId && onUpdateDC) {
      const res = onUpdateDC(editingDcId, {
        ministryMemo: dcMinMemo,
        dcMemo,
        dcMemoDate: dcDate,
        allocationQty: parseNum(dcQty),
      });
      showResult(res);
      if (res.ok) {
        resetDCForm();
      }
      return;
    }

    const attached = projectDrafts
      .filter((p) => p.projectNo.trim() || p.projectName.trim())
      .map((p) => ({
        projectNo: p.projectNo.trim(),
        projectName: p.projectName.trim(),
        presidentName: p.presidentName.trim(),
        unionName: p.unionName.trim(),
        allocationQty: parseNum(p.allocationQty),
      }));

    const res = onAddDC(
      {
        category: selectedCategory,
        ministryMemo: dcMinMemo,
        dcMemo,
        dcMemoDate: dcDate,
        allocationQty: parseNum(dcQty),
      },
      attached
    );
    showResult(res);
    if (res.ok) {
      const savedDc = dcMemo.trim();
      setSubSourceMemo(savedDc);
      setInspectedSubSourceMemo(savedDc);
      setExtraProjectDcMemo(savedDc);
      setDcMemo('');
      setDcQty('');
      setProjectDrafts([]);
      const remainAfter = getMinistryUsage(selectedCategory, dcMinMemo).remaining - parseNum(dcQty);
      if (remainAfter <= 0.0005) {
        setInspectedMinMemo(dcMinMemo);
        setDcMinMemo('');
      }
    }
  };

  const chairmanRequestTotal = useMemo(
    () =>
      round3(
        db.chairmen.reduce((sum, ch) => {
          const st = unoBatchQty[ch.id];
          if (!st?.selected) return sum;
          return sum + parseNum(st.qty);
        }, 0)
      ),
    [db.chairmen, unoBatchQty]
  );

  const manualRequestTotal = useMemo(
    () => round3(unoManualRows.reduce((sum, r) => sum + Math.max(0, parseNum(r.qty)), 0)),
    [unoManualRows]
  );

  const projectRequestTotal = useMemo(
    () =>
      round3(
        enrichedPendingProjects.reduce((sum, ep) => {
          const st = unoBatchQty[ep.project.id];
          if (!st?.selected) return sum;
          return sum + parseNum(st.qty);
        }, 0)
      ),
    [enrichedPendingProjects, unoBatchQty]
  );

  const dealerRequestTotal = useMemo(() => {
    if (meta.flowType === 'dealer_food') {
      return round3(
        db.foodDealers.reduce((sum, d) => {
          const st = dealerBatchState[d.id];
          if (!st?.selected) return sum;
          return sum + parseNum(st.qty);
        }, 0)
      );
    }
    if (meta.flowType === 'dealer_oms') {
      return round3(
        filteredOmsDealers.reduce((sum, d) => {
          const st = dealerBatchState[d.key];
          if (!st?.selected) return sum;
          return sum + parseNum(st.qty);
        }, 0)
      );
    }
    if (meta.flowType === 'ep') {
      return round3(
        db.fireServices.reduce((sum, f) => {
          const st = dealerBatchState[f.id];
          if (!st?.selected) return sum;
          return sum + parseNum(st.qty);
        }, 0)
      );
    }
    return 0;
  }, [meta.flowType, db.foodDealers, filteredOmsDealers, db.fireServices, dealerBatchState]);

  const upstreamForSub = useMemo(() => {
    if (!subSourceMemo) return { total: 0, used: 0, remaining: 0 };
    return meta.requiresDC
      ? getDCUsage(selectedCategory, subSourceMemo)
      : getMinistryUsage(selectedCategory, subSourceMemo);
  }, [meta.requiresDC, selectedCategory, subSourceMemo, getDCUsage, getMinistryUsage]);

  const selectedDcSourceRecord = useMemo(
    () =>
      meta.requiresDC && subSourceMemo
        ? catDCList.find((d) => normMemoNo(d.dcMemo) === normMemoNo(subSourceMemo)) || null
        : null,
    [meta.requiresDC, subSourceMemo, catDCList]
  );

  const selectedMinSourceRecord = useMemo(() => {
    const targetMemo = meta.requiresDC
      ? selectedDcSourceRecord?.ministryMemo || ''
      : subSourceMemo;
    if (!targetMemo) return null;
    return catMinistryList.find((m) => normMemoNo(m.memoNo) === normMemoNo(targetMemo)) || null;
  }, [meta.requiresDC, selectedDcSourceRecord, subSourceMemo, catMinistryList]);

  const activeFilterMinMemo = dcMinMemo || inspectedMinMemo;
  const filteredDCList = useMemo(() => {
    return catDCList;
  }, [catDCList]);

  const activeSubFilterMemo = subSourceMemo || inspectedSubSourceMemo;
  const catDealerSubs = useMemo(() => {
    return db.dealerSuballocations.filter((s) => s.category === selectedCategory);
  }, [db.dealerSuballocations, selectedCategory]);

  const catUnoSubs = useMemo(() => {
    return db.unoSuballocations.filter((u) => u.category === selectedCategory);
  }, [db.unoSuballocations, selectedCategory]);

  const filteredSubDealerSubs = useMemo(() => {
    return catDealerSubs.filter(
      (s) =>
        !allocatedFilterCurrentMemo ||
        !activeSubFilterMemo ||
        normMemoNo(s.sourceMemo) === normMemoNo(activeSubFilterMemo) ||
        memosLikelyMatch(s.sourceMemo, activeSubFilterMemo)
    );
  }, [catDealerSubs, allocatedFilterCurrentMemo, activeSubFilterMemo]);

  const filteredSubUnoSubs = useMemo(() => {
    return catUnoSubs.filter((u) => {
      if (!allocatedFilterCurrentMemo || !activeSubFilterMemo) return true;
      const srcMemo = meta.requiresDC ? u.dcMemo : u.ministryMemo;
      return (
        normMemoNo(srcMemo) === normMemoNo(activeSubFilterMemo) ||
        memosLikelyMatch(srcMemo, activeSubFilterMemo)
      );
    });
  }, [catUnoSubs, allocatedFilterCurrentMemo, activeSubFilterMemo, meta.requiresDC]);

  const { remainingBySubKey } = useMemo(() => matchDOsToSuballocations(db), [db]);

  const subTabDefs = useMemo(() => {
    if (isDealerOrEpFlow) {
      const dealerCount =
        meta.flowType === 'dealer_food'
          ? db.foodDealers.length
          : meta.flowType === 'dealer_oms'
            ? filteredOmsDealers.length
            : db.fireServices.length;
      return [
        {
          key: 'dealer' as SubTabKey,
          label: meta.flowType === 'ep' ? 'ডিলার / প্রতিষ্ঠান তালিকা' : 'ডিলার তালিকা',
          count: dealerCount,
        },
        {
          key: 'allocated' as SubTabKey,
          label: 'বরাদ্দকৃত তালিকা',
          count: filteredSubDealerSubs.length,
        },
      ];
    }

    if (meta.supportsProjects) {
      return [
        {
          key: 'project' as SubTabKey,
          label: 'পেন্ডিং প্রকল্প',
          count: enrichedPendingProjects.length,
        },
        {
          key: 'allocated' as SubTabKey,
          label: 'বরাদ্দকৃত তালিকা',
          count: filteredSubUnoSubs.length,
        },
      ];
    }

    return [
      {
        key: 'chairman' as SubTabKey,
        label: 'চেয়ারম্যান তালিকা',
        count: db.chairmen.length,
      },
      {
        key: 'manual' as SubTabKey,
        label: 'অন্যান্য আলাদা এন্ট্রি',
        count: unoManualRows.length,
      },
      {
        key: 'allocated' as SubTabKey,
        label: 'বরাদ্দকৃত তালিকা',
        count: filteredSubUnoSubs.length,
      },
    ];
  }, [
    isDealerOrEpFlow,
    meta.flowType,
    meta.supportsProjects,
    db.foodDealers.length,
    filteredOmsDealers.length,
    db.fireServices.length,
    filteredSubDealerSubs.length,
    db.chairmen.length,
    unoManualRows.length,
    enrichedPendingProjects.length,
    filteredSubUnoSubs.length,
  ]);

  const scrollToSubTab = useCallback(
    (tab: SubTabKey, instant = false) => {
      setActiveSubTab(tab);
      const container = subPagerRef.current;
      if (!container) return;
      const idx = subTabDefs.findIndex((t) => t.key === tab);
      if (idx < 0) return;
      if (subProgrammaticTimerRef.current !== null) {
        window.clearTimeout(subProgrammaticTimerRef.current);
      }
      subProgrammaticScrollRef.current = true;
      container.scrollTo({
        left: idx * container.clientWidth,
        behavior: instant ? 'auto' : 'smooth',
      });
      subProgrammaticTimerRef.current = window.setTimeout(() => {
        subProgrammaticScrollRef.current = false;
      }, 420);
      subTabBtnRefs.current[tab]?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    },
    [subTabDefs]
  );

  const handleSubPagerScroll = () => {
    const container = subPagerRef.current;
    if (!container || subProgrammaticScrollRef.current) return;
    const w = container.clientWidth;
    if (w <= 0) return;
    const idx = Math.round(container.scrollLeft / w);
    const matched = subTabDefs[idx];
    if (matched && matched.key !== activeSubTab) {
      setActiveSubTab(matched.key);
      subTabBtnRefs.current[matched.key]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  };

  const finishSubPagerDrag = () => {
    if (!subDragRef.current.active) return;
    subDragRef.current.active = false;
    setIsDraggingSubPager(false);
    const container = subPagerRef.current;
    if (container && container.clientWidth > 0) {
      const idx = Math.round(container.scrollLeft / container.clientWidth);
      const matched = subTabDefs[idx];
      if (matched) scrollToSubTab(matched.key);
    }
    window.setTimeout(() => {
      subDragRef.current.moved = false;
    }, 50);
  };

  useLayoutEffect(() => {
    const container = subPagerRef.current;
    if (!container || activeStep !== 'sub') return;
    const syncSubPos = () => {
      const idx = subTabDefs.findIndex((t) => t.key === activeSubTab);
      if (idx >= 0 && container.clientWidth > 0) {
        const targetLeft = idx * container.clientWidth;
        if (Math.abs(container.scrollLeft - targetLeft) > 4) {
          subProgrammaticScrollRef.current = true;
          container.scrollTo({ left: targetLeft, behavior: 'auto' });
          window.setTimeout(() => {
            subProgrammaticScrollRef.current = false;
          }, 80);
        }
      }
    };
    syncSubPos();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncSubPos);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeSubTab, subTabDefs, activeStep, entryMode]);

  const handleEqualDivideDealers = () => {
    if (upstreamForSub.remaining <= 0.0005) return;
    if (meta.flowType === 'dealer_oms') {
      const selectedKeys = filteredOmsDealers
        .filter((d) => dealerBatchState[d.key]?.selected)
        .map((d) => d.key);
      const targets = selectedKeys.length > 0 ? selectedKeys : filteredOmsDealers.map((d) => d.key);
      if (targets.length === 0) return;
      const each = round3(upstreamForSub.remaining / targets.length);
      const targetSet = new Set(targets);
      setDealerBatchState((prev) => {
        const next = { ...prev };
        for (const d of filteredOmsDealers) {
          if (targetSet.has(d.key)) {
            next[d.key] = { ...(next[d.key] || { cards: 0, unused: 0 }), selected: true, qty: each.toFixed(3) };
          }
        }
        return next;
      });
    } else if (meta.flowType === 'ep') {
      const selectedIds = db.fireServices.filter((f) => dealerBatchState[f.id]?.selected).map((f) => f.id);
      const targets = selectedIds.length > 0 ? selectedIds : db.fireServices.map((f) => f.id);
      if (targets.length === 0) return;
      const each = round3(upstreamForSub.remaining / targets.length);
      const targetSet = new Set(targets);
      setDealerBatchState((prev) => {
        const next = { ...prev };
        for (const f of db.fireServices) {
          if (targetSet.has(f.id)) {
            next[f.id] = { ...(next[f.id] || { cards: 0, unused: 0 }), selected: true, qty: each.toFixed(3) };
          }
        }
        return next;
      });
    }
  };

  const handleEqualDivideChairmen = () => {
    if (upstreamForSub.remaining <= 0.0005 || db.chairmen.length === 0) return;
    const selectedIds = db.chairmen.filter((ch) => unoBatchQty[ch.id]?.selected).map((ch) => ch.id);
    const targets = selectedIds.length > 0 ? selectedIds : db.chairmen.map((ch) => ch.id);
    const each = round3(upstreamForSub.remaining / targets.length);
    const targetSet = new Set(targets);
    setUnoBatchQty((prev) => {
      const next = { ...prev };
      for (const ch of db.chairmen) {
        if (targetSet.has(ch.id)) {
          next[ch.id] = { ...(next[ch.id] || {}), selected: true, qty: each.toFixed(3) };
        }
      }
      return next;
    });
  };

  const advanceSubSourceIfExhausted = (savedQty: number) => {
    if (upstreamForSub.remaining - savedQty <= 0.0005) {
      const nextAvail = meta.requiresDC
        ? availableDCMemos.find((d) => normMemoNo(d.dcMemo) !== normMemoNo(subSourceMemo))?.dcMemo
        : availableMinistryMemos.find((m) => normMemoNo(m.memoNo) !== normMemoNo(subSourceMemo))?.memoNo;
      if (nextAvail) {
        setInspectedSubSourceMemo(nextAvail);
        setSubSourceMemo(nextAvail);
      } else {
        setInspectedSubSourceMemo(subSourceMemo);
      }
    }
  };

  const handleSaveDealerOrEpBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (meta.flowType === 'dealer_food') {
      const rows = db.foodDealers
        .filter((d) => dealerBatchState[d.id]?.selected && parseNum(dealerBatchState[d.id].qty) > 0)
        .map((d) => {
          const st = dealerBatchState[d.id];
          const qty = parseNum(st.qty);
          return {
            dealerName: d.dealerName,
            unionName: d.unionName,
            salesCenter: d.salesCenter,
            cardCount: st.cards,
            unusedCards: st.unused,
            allocationQty: qty,
            totalAmount: round2(qty * catRate.unitPrice),
            taxAmount: round2(qty * catRate.taxRate),
          };
        });
      const res = onSaveDealerBatch({
        category: selectedCategory,
        sourceMemo: subSourceMemo,
        unoMemo: subUnoMemo,
        unoDate: subUnoDate,
        rows,
      });
      showResult(res);
      if (res.ok) advanceSubSourceIfExhausted(dealerRequestTotal);
      return;
    }

    if (meta.flowType === 'dealer_oms') {
      const rows = filteredOmsDealers
        .filter((d) => dealerBatchState[d.key]?.selected && parseNum(dealerBatchState[d.key].qty) > 0)
        .map((d) => {
          const qty = parseNum(dealerBatchState[d.key].qty);
          return {
            dealerName: d.dealerName,
            unionName: d.areaType === 'পৌরসভা' ? d.municipality : d.unionName,
            salesCenter: d.salesCenter,
            cardCount: 0,
            unusedCards: 0,
            allocationQty: qty,
            totalAmount: round2(qty * catRate.unitPrice),
            taxAmount: round2(qty * catRate.taxRate),
          };
        });
      const res = onSaveDealerBatch({
        category: selectedCategory,
        sourceMemo: subSourceMemo,
        unoMemo: subUnoMemo,
        unoDate: subUnoDate,
        rows,
      });
      showResult(res);
      if (res.ok) advanceSubSourceIfExhausted(dealerRequestTotal);
      return;
    }

    if (meta.flowType === 'ep') {
      const rows = db.fireServices
        .filter((f) => dealerBatchState[f.id]?.selected && parseNum(dealerBatchState[f.id].qty) > 0)
        .map((f) => {
          const qty = parseNum(dealerBatchState[f.id].qty);
          const rate =
            selectedCategory === 'ইপি গম'
              ? f.wheatRate || catRate.unitPrice
              : f.riceRate || catRate.unitPrice;
          return {
            dealerName: f.officeName,
            unionName: f.divisionName || 'ফায়ার সার্ভিস',
            salesCenter: f.divisionName || '',
            cardCount: 0,
            unusedCards: 0,
            allocationQty: qty,
            totalAmount: round2(qty * rate),
            taxAmount: round2(qty * catRate.taxRate),
          };
        });
      const res = onSaveDealerBatch({
        category: selectedCategory,
        sourceMemo: subSourceMemo,
        unoMemo: subUnoMemo,
        unoDate: subUnoDate,
        rows,
      });
      showResult(res);
      if (res.ok) advanceSubSourceIfExhausted(dealerRequestTotal);
    }
  };

  const handleSaveSingleChairman = (ch: AllocationDatabase['chairmen'][number]) => {
    const qty = parseNum(unoBatchQty[ch.id]?.qty || '');
    if (qty <= 0) {
      setFeedback({ ok: false, text: `${ch.chairmanName} এর বরাদ্দের পরিমাণ (মে.টন) লিখুন।` });
      return;
    }
    const res = onSaveUNOBatch({
      category: selectedCategory,
      sourceMemo: subSourceMemo,
      unoMemo: subUnoMemo,
      unoDate: subUnoDate,
      rows: [
        {
          unionName: ch.unionName,
          recipientName: ch.chairmanName,
          allocationQty: qty,
        },
      ],
    });
    showResult(res);
    if (res.ok) {
      setUnoBatchQty((prev) => ({
        ...prev,
        [ch.id]: { selected: false, qty: '' },
      }));
      advanceSubSourceIfExhausted(qty);
    }
  };

  const handleSaveChairmanBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const checkedWithQty = db.chairmen.filter(
      (ch) => unoBatchQty[ch.id]?.selected && parseNum(unoBatchQty[ch.id].qty) > 0
    );
    const rows = checkedWithQty.map((ch) => ({
      unionName: ch.unionName,
      recipientName: ch.chairmanName,
      allocationQty: parseNum(unoBatchQty[ch.id].qty),
    }));
    const res = onSaveUNOBatch({
      category: selectedCategory,
      sourceMemo: subSourceMemo,
      unoMemo: subUnoMemo,
      unoDate: subUnoDate,
      rows,
    });
    showResult(res);
    if (res.ok) {
      const savedTotal = round3(rows.reduce((s, r) => s + r.allocationQty, 0));
      setUnoBatchQty((prev) => {
        const next = { ...prev };
        for (const ch of checkedWithQty) {
          next[ch.id] = { selected: false, qty: '' };
        }
        return next;
      });
      advanceSubSourceIfExhausted(savedTotal);
    }
  };

  const handleSaveManualBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const validManual = unoManualRows.filter((r) => r.recipientName.trim() && parseNum(r.qty) > 0);
    if (validManual.length === 0) {
      setFeedback({
        ok: false,
        text: 'প্রতিটি বাক্সে প্রাপকের নাম এবং ০-এর বেশি পরিমাণ দিন।',
      });
      return;
    }
    const rows = validManual.map((r) => ({
      unionName: r.unionName.trim() || db.officer.unions[0] || '',
      recipientName: r.recipientName.trim(),
      projectNo: r.projectNo.trim() || undefined,
      projectName: r.projectName.trim() || undefined,
      allocationQty: parseNum(r.qty),
    }));
    const res = onSaveUNOBatch({
      category: selectedCategory,
      sourceMemo: subSourceMemo,
      unoMemo: subUnoMemo,
      unoDate: subUnoDate,
      rows,
    });
    showResult(res);
    if (res.ok) {
      const savedTotal = round3(rows.reduce((s, r) => s + r.allocationQty, 0));
      setUnoManualRows([
        {
          id: `um-${Date.now()}`,
          unionName: db.officer.unions[0] || '',
          recipientName: '',
          projectNo: '',
          projectName: '',
          qty: '',
        },
      ]);
      advanceSubSourceIfExhausted(savedTotal);
    }
  };

  const handleSaveSinglePendingProject = (ep: EnrichedPendingProject) => {
    if (!effectiveProjectUnlocked) {
      setFeedback({ ok: false, text: 'সেভ করতে প্রথমে পাসওয়ার্ড দিয়ে আনলক করুন।' });
      return;
    }
    const p = ep.project;
    const st = unoBatchQty[p.id];
    const qty = parseNum(st?.qty || ep.pendingQty.toFixed(3));
    const assignedPresident = (st?.presidentName ?? p.presidentName ?? '').trim();
    if (qty <= 0) {
      setFeedback({ ok: false, text: 'বরাদ্দের পরিমাণ ০-এর বেশি হতে হবে।' });
      return;
    }
    const res = onSaveUNOBatch({
      category: p.category,
      sourceMemo: p.dcMemo,
      unoMemo: subUnoMemo,
      unoDate: subUnoDate,
      rows: [
        {
          unionName: p.unionName,
          recipientName: assignedPresident || p.projectName,
          projectNo: p.projectNo,
          projectName: p.projectName,
          allocationQty: qty,
        },
      ],
    });
    showResult(res);
    if (res.ok) {
      setExpandedPendingProjId(null);
      setUnoBatchQty((prev) => ({
        ...prev,
        [p.id]: { selected: false, qty: '', presidentName: assignedPresident },
      }));
      if (p.category === selectedCategory && normMemoNo(p.dcMemo) === normMemoNo(subSourceMemo)) {
        advanceSubSourceIfExhausted(qty);
      }
    }
  };

  const handleSaveProjectBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveProjectUnlocked) {
      setFeedback({ ok: false, text: 'সেভ করতে প্রথমে পাসওয়ার্ড দিয়ে আনলক করুন।' });
      return;
    }
    const selectedItems = enrichedPendingProjects.filter(
      (ep) => unoBatchQty[ep.project.id]?.selected && parseNum(unoBatchQty[ep.project.id].qty) > 0
    );
    if (selectedItems.length === 0) {
      setFeedback({ ok: false, text: 'সেভ করতে কমপক্ষে ১টি প্রকল্প নির্বাচন করুন।' });
      return;
    }
    // Group by category + dcMemo when in all-year mode
    const groups = new Map<string, EnrichedPendingProject[]>();
    for (const ep of selectedItems) {
      const key = `${ep.project.category}::${ep.project.dcMemo}`;
      const arr = groups.get(key) || [];
      arr.push(ep);
      groups.set(key, arr);
    }
    let savedTotal = 0;
    let lastRes: ActionResult = { ok: true, message: 'সংরক্ষিত হয়েছে।' };
    for (const groupItems of groups.values()) {
      const first = groupItems[0].project;
      const rows = groupItems.map((ep) => {
        const p = ep.project;
        const assignedPresident = (unoBatchQty[p.id]?.presidentName ?? p.presidentName ?? '').trim();
        return {
          unionName: p.unionName,
          recipientName: assignedPresident || p.projectName,
          projectNo: p.projectNo,
          projectName: p.projectName,
          allocationQty: parseNum(unoBatchQty[p.id].qty),
        };
      });
      const res = onSaveUNOBatch({
        category: first.category,
        sourceMemo: first.dcMemo,
        unoMemo: subUnoMemo,
        unoDate: subUnoDate,
        rows,
      });
      lastRes = res;
      if (!res.ok) break;
      savedTotal = round3(savedTotal + rows.reduce((s, r) => s + r.allocationQty, 0));
    }
    showResult(lastRes);
    if (lastRes.ok) {
      setExpandedPendingProjId(null);
      advanceSubSourceIfExhausted(savedTotal);
    }
  };

  const dealerAlreadyAllocatedOnMemo = useMemo(() => {
    const map = new Map<string, number>();
    if (!subSourceMemo) return map;
    const nk = normMemoNo(subSourceMemo);
    for (const s of catDealerSubs) {
      if (normMemoNo(s.sourceMemo) !== nk) continue;
      const dKey = s.dealerName.trim().toLowerCase();
      map.set(dKey, round3((map.get(dKey) || 0) + s.allocationQty));
    }
    return map;
  }, [catDealerSubs, subSourceMemo]);

  const unoAlreadyAllocatedOnMemo = useMemo(() => {
    const map = new Map<string, number>();
    if (!subSourceMemo) return map;
    const nk = normMemoNo(subSourceMemo);
    for (const u of catUnoSubs) {
      const srcMemo = meta.requiresDC ? u.dcMemo : u.ministryMemo;
      if (normMemoNo(srcMemo) !== nk) continue;
      const rKey = `${u.unionName.trim().toLowerCase()}::${u.recipientName.trim().toLowerCase()}`;
      map.set(rKey, round3((map.get(rKey) || 0) + u.allocationQty));
    }
    return map;
  }, [catUnoSubs, subSourceMemo, meta.requiresDC]);

  const jumpToCategoryStep = (
    targetCat: AllocationCategory,
    step: StepKey,
    memo?: string
  ) => {
    const targetMeta = CATEGORY_BY_NAME[targetCat];
    setEntryMode('category');
    if (targetCat === selectedCategory) {
      setActiveStep(step);
      window.requestAnimationFrame(() => scrollToStep(step));
      if (step === 'dc' && memo) {
        setDcMinMemo(memo);
        setInspectedMinMemo(memo);
      }
      if (step === 'sub' && memo) {
        setSubSourceMemo(memo);
        setInspectedSubSourceMemo(memo);
      }
      return;
    }
    pendingJumpRef.current = {
      step,
      dcMinMemo: step === 'dc' ? memo : undefined,
      inspectedMinMemo: step === 'dc' ? memo : undefined,
      subSourceMemo: step === 'sub' ? memo : undefined,
      inspectedSubSourceMemo:
        step === 'sub' ? memo : targetMeta.requiresDC ? undefined : memo,
    };
    onSelectCategory(targetCat);
  };

  const handleSaveOfficeMinistry = (e: React.FormEvent) => {
    e.preventDefault();
    const cMeta = CATEGORY_BY_NAME[offMinCat];
    const res = onAddMinistry({
      category: offMinCat,
      memoNo: offMinMemo,
      memoDate: offMinDate,
      allocationQty: parseNum(offMinQty),
      grain: offMinGrain,
      phase: cMeta.hasPhase ? parseNum(offMinPhase) || 1 : undefined,
      comment: offMinComment.trim() || undefined,
    });
    showResult(res);
    if (res.ok) {
      setOffMinMemo('');
      setOffMinQty('');
      setOffMinComment('');
    }
  };

  const allMinistryWithUsage = useMemo(
    () =>
      db.ministryAllocations.map((m) => ({
        item: m,
        meta: CATEGORY_BY_NAME[m.category],
        usage: getMinistryUsage(m.category, m.memoNo),
      })),
    [db.ministryAllocations, getMinistryUsage]
  );

  const pendingDCMinistrySources = useMemo(
    () =>
      allMinistryWithUsage.filter(
        (x) => x.meta?.requiresDC && x.usage.remaining > 0.0005
      ),
    [allMinistryWithUsage]
  );

  const allDCWithUsage = useMemo(
    () =>
      db.dcAllocations.map((d) => ({
        item: d,
        meta: CATEGORY_BY_NAME[d.category],
        usage: getDCUsage(d.category, d.dcMemo),
      })),
    [db.dcAllocations, getDCUsage]
  );

  const officeUnoSources = useMemo(() => {
    const out: Array<{
      key: string;
      category: AllocationCategory;
      memoNo: string;
      date: string;
      sourceLabel: string;
      total: number;
      remaining: number;
    }> = [];
    for (const d of allDCWithUsage) {
      if (
        d.meta &&
        d.meta.requiresDC &&
        (d.meta.flowType === 'relief' || d.meta.flowType === 'kabikha') &&
        d.usage.remaining > 0.0005
      ) {
        out.push({
          key: `dc-${d.item.id}`,
          category: d.item.category,
          memoNo: d.item.dcMemo,
          date: d.item.dcMemoDate,
          sourceLabel: `ডিসি স্মারক (মন্ত্রণালয়: ${toBnDigits(d.item.ministryMemo)})`,
          total: d.usage.total,
          remaining: d.usage.remaining,
        });
      }
    }
    for (const m of allMinistryWithUsage) {
      if (
        m.meta &&
        !m.meta.requiresDC &&
        (m.meta.flowType === 'relief' ||
          m.meta.flowType === 'kabikha' ||
          m.meta.flowType === 'vwb') &&
        m.usage.remaining > 0.0005
      ) {
        out.push({
          key: `min-${m.item.id}`,
          category: m.item.category,
          memoNo: m.item.memoNo,
          date: m.item.memoDate,
          sourceLabel: 'মন্ত্রণালয় বরাদ্দ',
          total: m.usage.total,
          remaining: m.usage.remaining,
        });
      }
    }
    return out;
  }, [allDCWithUsage, allMinistryWithUsage]);

  const officeUcfSources = useMemo(() => {
    const out: Array<{
      key: string;
      category: AllocationCategory;
      memoNo: string;
      date: string;
      sourceLabel: string;
      total: number;
      remaining: number;
    }> = [];
    for (const d of allDCWithUsage) {
      if (
        d.meta &&
        (d.meta.flowType === 'dealer_food' ||
          d.meta.flowType === 'dealer_oms' ||
          d.meta.flowType === 'ep') &&
        d.usage.remaining > 0.0005
      ) {
        out.push({
          key: `dc-${d.item.id}`,
          category: d.item.category,
          memoNo: d.item.dcMemo,
          date: d.item.dcMemoDate,
          sourceLabel: `ডিসি স্মারক (মন্ত্রণালয়: ${toBnDigits(d.item.ministryMemo)})`,
          total: d.usage.total,
          remaining: d.usage.remaining,
        });
      }
    }
    for (const m of allMinistryWithUsage) {
      if (
        m.meta &&
        !m.meta.requiresDC &&
        (m.meta.flowType === 'dealer_food' ||
          m.meta.flowType === 'dealer_oms' ||
          m.meta.flowType === 'ep') &&
        m.usage.remaining > 0.0005
      ) {
        out.push({
          key: `min-${m.item.id}`,
          category: m.item.category,
          memoNo: m.item.memoNo,
          date: m.item.memoDate,
          sourceLabel: m.meta.flowType === 'ep' ? 'বিভাগীয় / মন্ত্রণালয় বরাদ্দ' : 'মন্ত্রণালয় বরাদ্দ',
          total: m.usage.total,
          remaining: m.usage.remaining,
        });
      }
    }
    return out;
  }, [allDCWithUsage, allMinistryWithUsage]);

  return (
    <div className="space-y-3.5 font-nikosh">
      {/* Minimalist Single-Line Top Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-nowrap">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                title="ফিরে যান"
                aria-label="ফিরে যান"
                className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#E2136E] cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold text-slate-900 break-words">
              {selectedCategory}
            </h2>
            {lockedStage && entryMode === 'category' && (
              <span className="hidden sm:inline-block rounded-md bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-[#E2136E] shrink-0">
                {STAGE_LABEL_MAP[lockedStage].replace(' এন্ট্রি', '')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (entryMode === 'office') setEntryMode('category');
                setShowCatGrid((v) => !v);
              }}
              title="খাত পরিবর্তন"
              className="h-10 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="h-4 w-4 text-[#E2136E]" />
              <span className="hidden sm:inline">খাত</span>
              {showCatGrid ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowCatGrid(false);
                setEntryMode((m) => (m === 'category' ? 'office' : 'category'));
              }}
              title={entryMode === 'office' ? 'খাতভিত্তিক এন্ট্রি' : 'দপ্তরভিত্তিক সারসংক্ষেপ'}
              className={`h-10 inline-flex items-center gap-1 rounded-xl border px-3 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                entryMode === 'office'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">দপ্তর</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenRegister(meta.regId)}
              title="রেজিস্টার দেখুন"
              className="h-10 inline-flex items-center gap-1 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3 sm:px-3.5 text-xs sm:text-sm font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              <span>রেজিস্টার</span>
            </button>
          </div>
        </div>

        {showCatGrid && (
          <div className="pt-2.5 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              {CATEGORY_GROUPS.map((grp) => (
                <div
                  key={grp}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5"
                >
                  <div className="text-xs font-bold text-slate-500 px-1">{grp}</div>
                  <div className="flex flex-col gap-1">
                    {CATEGORIES.filter((c) => c.groupLabel === grp).map((c) => {
                      const active = c.category === selectedCategory;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setEntryMode('category');
                            onSelectCategory(c.category);
                            setShowCatGrid(false);
                          }}
                          className={`text-left rounded-md px-3 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer flex items-center justify-between gap-1 ${
                            active
                              ? 'bg-[#E2136E] text-white border-[#E2136E]'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-rose-50/60'
                          }`}
                        >
                          <span className="break-words">{c.category}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-xs font-bold flex items-center gap-2 ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ==================== OFFICE-BASED ENTRY MODE ==================== */}
      {entryMode === 'office' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  key: 'ministry',
                  label: `মন্ত্রণালয়ের বরাদ্দ (${formatBnInt(db.ministryAllocations.length)})`,
                },
                {
                  key: 'dc',
                  label: `ডিসি বরাদ্দ (${formatBnInt(db.dcAllocations.length)})`,
                },
                {
                  key: 'uno',
                  label: `ইউএনও বরাদ্দ (${formatBnInt(officeUnoSources.length)} উৎস)`,
                },
                {
                  key: 'ucf',
                  label: `ইউসিএফ বরাদ্দ (${formatBnInt(officeUcfSources.length)} উৎস)`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setOfficeTab(t.key)}
                className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer ${
                  officeTab === t.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {officeTab === 'ministry' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <form
                onSubmit={handleSaveOfficeMinistry}
                className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FilePlus2 className="h-4 w-4 text-[#E2136E]" />
                  <span>মন্ত্রণালয়ের নতুন বরাদ্দ এন্ট্রি (যেকোনো খাত)</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">খাত নির্বাচন করুন *</label>
                    <select
                      value={offMinCat}
                      onChange={(e) => {
                        const cat = e.target.value as AllocationCategory;
                        setOffMinCat(cat);
                        setOffMinGrain(CATEGORY_BY_NAME[cat]?.defaultGrain || 'চাল');
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white font-bold focus:outline-none focus:border-[#E2136E]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.category}>
                          {c.category} ({c.groupLabel})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">স্মারক নম্বর *</label>
                    <input
                      type="text"
                      required
                      value={offMinMemo}
                      onChange={(e) => setOffMinMemo(e.target.value)}
                      placeholder="যেমন: ৩২০ বা ১৩.০১.০০০০.০০১.০১"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">স্মারকের তারিখ *</label>
                      <input
                        type="date"
                        required
                        value={offMinDate}
                        onChange={(e) => setOffMinDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">পরিমাণ (মে.টন) *</label>
                      <input
                        type="number"
                        step="0.001"
                        required
                        value={offMinQty}
                        onChange={(e) => setOffMinQty(e.target.value)}
                        placeholder="০.০০০"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">খাদ্যশস্য</label>
                      <select
                        value={offMinGrain}
                        onChange={(e) => setOffMinGrain(e.target.value as 'চাল' | 'গম' | 'আটা')}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      >
                        <option value="চাল">চাল</option>
                        <option value="গম">গম</option>
                        <option value="আটা">আটা</option>
                      </select>
                    </div>
                    {CATEGORY_BY_NAME[offMinCat]?.hasPhase && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">পর্যায়</label>
                        <select
                          value={offMinPhase}
                          onChange={(e) => setOffMinPhase(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                        >
                          <option value="1">১ম পর্যায়</option>
                          <option value="2">২য় পর্যায়</option>
                          <option value="3">৩য় পর্যায়</option>
                          <option value="4">৪র্থ পর্যায়</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">মন্তব্য (ঐচ্ছিক)</label>
                    <input
                      type="text"
                      value={offMinComment}
                      onChange={(e) => setOffMinComment(e.target.value)}
                      placeholder="মাস বা বিবরণ"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-[#E2136E] hover:bg-[#B80D58] text-white text-xs font-bold cursor-pointer"
                >
                  মন্ত্রণালয় বরাদ্দ সংরক্ষণ করুন
                </button>
              </form>

              <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-900">
                  সকল খাতের সংরক্ষিত মন্ত্রণালয় বরাদ্দ ({formatBnInt(allMinistryWithUsage.length)}টি)
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold sticky top-0">
                        <th className="py-2 px-3 text-left">খাত ও স্মারক</th>
                        <th className="py-2 px-3 text-center">শস্য</th>
                        <th className="py-2 px-3 text-right">মোট</th>
                        <th className="py-2 px-3 text-right">অবশিষ্ট</th>
                        <th className="py-2 px-3 text-center">কাজ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allMinistryWithUsage.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            এখনো কোনো মন্ত্রণালয় বরাদ্দ নেই।
                          </td>
                        </tr>
                      ) : (
                        allMinistryWithUsage.map(({ item: m, meta: mMeta, usage }) => {
                          const hasRem = usage.remaining > 0.0005;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3">
                                <div className="font-bold text-[#E2136E]">{m.category}</div>
                                <div className="font-semibold text-slate-900">{toBnDigits(m.memoNo)}</div>
                                <div className="text-[11px] text-slate-500">{formatBnDate(m.memoDate)}</div>
                              </td>
                              <td className="py-2 px-3 text-center">{m.grain}</td>
                              <td className="py-2 px-3 text-right font-semibold">{formatBnQty(usage.total)}</td>
                              <td className={`py-2 px-3 text-right font-bold ${hasRem ? 'text-[#E2136E]' : 'text-slate-400'}`}>
                                {hasRem ? formatBnQty(usage.remaining) : '০.০০০'}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  {hasRem && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        jumpToCategoryStep(
                                          m.category,
                                          mMeta?.requiresDC ? 'dc' : 'sub',
                                          m.memoNo
                                        )
                                      }
                                      className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                    >
                                      {mMeta?.requiresDC ? 'ডিসি বরাদ্দ' : 'উপবরাদ্দ'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onDeleteMinistry(m.id)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
          )}

          {officeTab === 'dc' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs">
                <span className="font-bold text-slate-800">
                  ডিসি বরাদ্দ প্যানেল — অবশিষ্ট মন্ত্রণালয় বরাদ্দ ও এন্ট্রিকৃত ডিসি বরাদ্দ
                </span>
                <button
                  type="button"
                  onClick={() => setShowLoadedMinistryInDC((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 font-bold text-[#E2136E] cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>
                    {showLoadedMinistryInDC
                      ? `মন্ত্রণালয় বরাদ্দ লুকান (${formatBnInt(pendingDCMinistrySources.length)})`
                      : `মন্ত্রণালয় বরাদ্দ লোড করুন (${formatBnInt(pendingDCMinistrySources.length)})`}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {showLoadedMinistryInDC && (
                  <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                      বাকি থাকা মন্ত্রণালয় স্মারকসমূহ ({formatBnInt(pendingDCMinistrySources.length)}টি)
                    </div>
                    <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                      <table className="w-full text-xs border-collapse tabular-nums">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                            <th className="py-2 px-3 text-left">খাত ও স্মারক</th>
                            <th className="py-2 px-3 text-right">মোট</th>
                            <th className="py-2 px-3 text-right">অবশিষ্ট</th>
                            <th className="py-2 px-3 text-center">কাজ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pendingDCMinistrySources.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-500">
                                ডিসি বরাদ্দের জন্য অবশিষ্ট কোনো মন্ত্রণালয় স্মারক নেই।
                              </td>
                            </tr>
                          ) : (
                            pendingDCMinistrySources.map(({ item: m, usage }) => (
                              <tr key={m.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-900">{m.category}</div>
                                  <div className="text-[11px] text-slate-600">
                                    স্মারক: {toBnDigits(m.memoNo)} · {formatBnDate(m.memoDate)}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right">{formatBnQty(usage.total)}</td>
                                <td className="py-2 px-3 text-right font-bold text-[#E2136E]">
                                  {formatBnQty(usage.remaining)} মে.টন
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => jumpToCategoryStep(m.category, 'dc', m.memoNo)}
                                    className="rounded bg-[#E2136E] hover:bg-[#B80D58] px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                                  >
                                    ডিসি বরাদ্দ দিন
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div
                  className={`${
                    showLoadedMinistryInDC ? 'lg:col-span-6' : 'lg:col-span-12'
                  } rounded-2xl border border-slate-200 bg-white overflow-hidden`}
                >
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                    এন্ট্রিকৃত ডিসি বরাদ্দসমূহ ({formatBnInt(allDCWithUsage.length)}টি)
                  </div>
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse tabular-nums">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="py-2 px-3 text-left">খাত ও ডিসি স্মারক</th>
                          <th className="py-2 px-3 text-right">মোট</th>
                          <th className="py-2 px-3 text-right">অবশিষ্ট</th>
                          <th className="py-2 px-3 text-center">কাজ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allDCWithUsage.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-500">
                              এখনো কোনো ডিসি বরাদ্দ নেই।
                            </td>
                          </tr>
                        ) : (
                          allDCWithUsage.map(({ item: d, usage }) => {
                            const hasRem = usage.remaining > 0.0005;
                            return (
                              <tr key={d.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-900">{d.category}</div>
                                  <div className="text-[11px] text-slate-700">
                                    ডিসি: {toBnDigits(d.dcMemo)} ({formatBnDate(d.dcMemoDate)})
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    মন্ত্রণালয়: {toBnDigits(d.ministryMemo)}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right">{formatBnQty(usage.total)}</td>
                                <td className={`py-2 px-3 text-right font-bold ${hasRem ? 'text-[#E2136E]' : 'text-slate-400'}`}>
                                  {hasRem ? `${formatBnQty(usage.remaining)} মে.টন` : '০.০০০'}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    {hasRem && (
                                      <button
                                        type="button"
                                        onClick={() => jumpToCategoryStep(d.category, 'sub', d.dcMemo)}
                                        className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                      >
                                        উপবরাদ্দ দিন
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => onDeleteDC(d.id)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
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
          )}

          {officeTab === 'uno' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                  বাকি থাকা ইউএনও উপবরাদ্দ উৎসসমূহ ({formatBnInt(officeUnoSources.length)}টি)
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3 text-left">খাত ও উৎস স্মারক</th>
                        <th className="py-2 px-3 text-right">বাকি পরিমাণ</th>
                        <th className="py-2 px-3 text-center">কাজ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {officeUnoSources.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-500">
                            ইউএনও উপবরাদ্দের জন্য বাকি কোনো বরাদ্দ নেই।
                          </td>
                        </tr>
                      ) : (
                        officeUnoSources.map((src) => (
                          <tr key={src.key} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900">{src.category}</div>
                              <div className="text-[11px] text-slate-700">
                                স্মারক: {toBnDigits(src.memoNo)} ({formatBnDate(src.date)})
                              </div>
                              <div className="text-[11px] text-slate-500">{src.sourceLabel}</div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#E2136E]">
                              {formatBnQty(src.remaining)} মে.টন
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => jumpToCategoryStep(src.category, 'sub', src.memoNo)}
                                className="rounded bg-[#E2136E] hover:bg-[#B80D58] px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                              >
                                উপবরাদ্দ দিন
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                  এন্ট্রিকৃত ইউএনও উপবরাদ্দসমূহ ({formatBnInt(db.unoSuballocations.length)}টি)
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3 text-left">খাত ও স্মারক</th>
                        <th className="py-2 px-3 text-left">প্রাপক / ইউনিয়ন</th>
                        <th className="py-2 px-3 text-right">পরিমাণ</th>
                        <th className="py-2 px-3 text-center">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {db.unoSuballocations.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-500">
                            এখনো কোনো ইউএনও উপবরাদ্দ নেই।
                          </td>
                        </tr>
                      ) : (
                        db.unoSuballocations.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <div className="font-bold text-[#E2136E]">{u.category}</div>
                              <div className="text-[11px] text-slate-700">
                                {toBnDigits(u.unoMemo)} ({formatBnDate(u.unoDate)})
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{u.recipientName}</div>
                              <div className="text-[11px] text-slate-500">
                                {u.unionName}
                                {u.projectNo ? ` · প্রকল্প ${toBnDigits(u.projectNo)}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold">{formatBnQty(u.allocationQty)}</td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => onDeleteUNOSub(u.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {officeTab === 'ucf' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                  বাকি থাকা ইউসিএফ বরাদ্দ উৎসসমূহ ({formatBnInt(officeUcfSources.length)}টি)
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3 text-left">খাত ও উৎস স্মারক</th>
                        <th className="py-2 px-3 text-right">বাকি পরিমাণ</th>
                        <th className="py-2 px-3 text-center">কাজ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {officeUcfSources.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-500">
                            ইউসিএফ উপবরাদ্দের জন্য বাকি কোনো বরাদ্দ নেই।
                          </td>
                        </tr>
                      ) : (
                        officeUcfSources.map((src) => (
                          <tr key={src.key} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900">{src.category}</div>
                              <div className="text-[11px] text-slate-700">
                                স্মারক: {toBnDigits(src.memoNo)} ({formatBnDate(src.date)})
                              </div>
                              <div className="text-[11px] text-slate-500">{src.sourceLabel}</div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#E2136E]">
                              {formatBnQty(src.remaining)} মে.টন
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => jumpToCategoryStep(src.category, 'sub', src.memoNo)}
                                className="rounded bg-[#E2136E] hover:bg-[#B80D58] px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                              >
                                উপবরাদ্দ দিন
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                  এন্ট্রিকৃত ইউসিএফ উপবরাদ্দসমূহ ({formatBnInt(db.dealerSuballocations.length)}টি)
                </div>
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3 text-left">খাত ও স্মারক</th>
                        <th className="py-2 px-3 text-left">ডিলার / প্রতিষ্ঠান</th>
                        <th className="py-2 px-3 text-right">পরিমাণ</th>
                        <th className="py-2 px-3 text-center">মুছুন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {db.dealerSuballocations.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-500">
                            এখনো কোনো ইউসিএফ উপবরাদ্দ নেই।
                          </td>
                        </tr>
                      ) : (
                        db.dealerSuballocations.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <div className="font-bold text-[#E2136E]">{s.category}</div>
                              <div className="text-[11px] text-slate-700">
                                {toBnDigits(s.unoMemo)} ({formatBnDate(s.unoDate)})
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{s.dealerName}</div>
                              <div className="text-[11px] text-slate-500">{s.unionName}</div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold">{formatBnQty(s.allocationQty)}</td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => onDeleteDealerSub(s.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== CATEGORY-BASED ENTRY MODE ==================== */}
      {entryMode === 'category' && (
        <div className="space-y-3.5">
          {/* Scrollable Step Tabs Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1">
              {stepDefs.map((s) => {
                const isAct = activeStep === s.key;
                return (
                  <button
                    key={s.key}
                    ref={(el) => {
                      entryStepBtnRefs.current[s.key] = el;
                    }}
                    type="button"
                    onClick={() => scrollToStep(s.key)}
                    className={`min-h-[38px] shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all cursor-pointer ${
                      isAct
                        ? 'bg-[#E2136E] text-white border-[#E2136E] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50/60'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            {!hasEmbeddedDo && (
              <button
                type="button"
                onClick={onOpenDOIssue}
                className="min-h-[38px] shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
              >
                ডিও →
              </button>
            )}
          </div>

          {/* Horizontally Swipeable Multi-Step Pager */}
          <div
            ref={entryPagerRef}
            onScroll={handleEntryPagerScroll}
            onMouseDown={(e) => {
              if (e.button !== 0 || !entryPagerRef.current) return;
              const target = e.target as HTMLElement | null;
              if (
                target?.closest(
                  'input, select, textarea, button, a, label, table, [data-no-pager-drag]'
                )
              ) {
                return;
              }
              entryDragRef.current = {
                active: true,
                startX: e.clientX,
                startScrollLeft: entryPagerRef.current.scrollLeft,
                moved: false,
              };
              setIsDraggingEntryPager(true);
            }}
            onMouseMove={(e) => {
              if (!entryDragRef.current.active || !entryPagerRef.current) return;
              const dx = e.clientX - entryDragRef.current.startX;
              if (Math.abs(dx) > 6) {
                entryDragRef.current.moved = true;
              }
              if (entryDragRef.current.moved) {
                entryPagerRef.current.scrollLeft = entryDragRef.current.startScrollLeft - dx;
              }
            }}
            onMouseUp={finishEntryPagerDrag}
            onMouseLeave={finishEntryPagerDrag}
            onClickCapture={(e) => {
              if (entryDragRef.current.moved) {
                e.preventDefault();
                e.stopPropagation();
                entryDragRef.current.moved = false;
              }
            }}
            className={`no-scrollbar flex items-start overflow-x-auto ${
              isDraggingEntryPager
                ? 'snap-none cursor-grabbing select-none'
                : 'snap-x snap-mandatory'
            }`}
          >
            {/* STEP 1: MINISTRY ALLOCATION */}
            <div
              className={`w-full shrink-0 snap-center snap-always ${
                activeStep === 'ministry' ? '' : 'max-h-[68vh] overflow-hidden opacity-90'
              }`}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <form
                onSubmit={handleSaveMinistry}
                className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900">
                  <span className="flex items-center gap-2">
                    <FilePlus2 className="h-4 w-4 text-[#E2136E]" />
                    <span>
                      {editingMinId ? 'মন্ত্রণালয় বরাদ্দ সম্পাদনা (এডিট)' : 'নতুন মন্ত্রণালয় বরাদ্দ এন্ট্রি'}
                    </span>
                  </span>
                  {editingMinId && (
                    <button
                      type="button"
                      onClick={resetMinistryForm}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 cursor-pointer"
                    >
                      বাতিল
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">স্মারক নম্বর *</label>
                    <input
                      type="text"
                      required
                      value={minMemo}
                      onChange={(e) => setMinMemo(e.target.value)}
                      placeholder="যেমন: ৩২০ বা ১৩.০১.০০০০.০০১.০১"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">স্মারকের তারিখ *</label>
                      <input
                        type="date"
                        required
                        value={minDate}
                        onChange={(e) => setMinDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">পরিমাণ (মে.টন) *</label>
                      <input
                        type="number"
                        step="0.001"
                        required
                        value={minQty}
                        onChange={(e) => setMinQty(e.target.value)}
                        placeholder="০.০০০"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">খাদ্যশস্য</label>
                      <select
                        value={minGrain}
                        onChange={(e) => setMinGrain(e.target.value as 'চাল' | 'গম' | 'আটা')}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:border-[#E2136E]"
                      >
                        <option value="চাল">চাল</option>
                        <option value="গম">গম</option>
                        <option value="আটা">আটা</option>
                      </select>
                    </div>
                    {meta.hasPhase && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">পর্যায়</label>
                        <select
                          value={minPhase}
                          onChange={(e) => setMinPhase(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:border-[#E2136E]"
                        >
                          <option value="1">১ম পর্যায়</option>
                          <option value="2">২য় পর্যায়</option>
                          <option value="3">৩য় পর্যায়</option>
                          <option value="4">৪র্থ পর্যায়</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">মন্তব্য (ঐচ্ছিক)</label>
                    <input
                      type="text"
                      value={minComment}
                      onChange={(e) => setMinComment(e.target.value)}
                      placeholder="মাস বা বিবরণ"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-[#E2136E] hover:bg-[#B80D58] text-white text-xs font-bold cursor-pointer"
                >
                  {editingMinId ? 'মন্ত্রণালয় বরাদ্দ হালনাগাদ করুন' : 'মন্ত্রণালয় বরাদ্দ সংরক্ষণ করুন'}
                </button>
              </form>

              <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-900">
                  {selectedCategory} — সংরক্ষিত মন্ত্রণালয় বরাদ্দ ({formatBnInt(catMinistryList.length)}টি)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3 text-left">স্মারক ও তারিখ</th>
                        <th className="py-2 px-3 text-center">শস্য</th>
                        <th className="py-2 px-3 text-right">মোট বরাদ্দ</th>
                        <th className="py-2 px-3 text-right">ব্যবহৃত</th>
                        <th className="py-2 px-3 text-right">অবশিষ্ট</th>
                        <th className="py-2 px-3 text-center">কাজ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {catMinistryList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            এই খাতে এখনো কোনো মন্ত্রণালয় বরাদ্দ এন্ট্রি করা হয়নি।
                          </td>
                        </tr>
                      ) : (
                        catMinistryList.map((m) => {
                          const usage = getMinistryUsage(selectedCategory, m.memoNo);
                          const hasRem = usage.remaining > 0.0005;
                          return (
                            <tr
                              key={m.id}
                              className={editingMinId === m.id ? 'bg-rose-50/60' : 'hover:bg-slate-50'}
                            >
                              <td className="py-2 px-3">
                                <div className="font-bold text-slate-900">{toBnDigits(m.memoNo)}</div>
                                <div className="text-[11px] text-slate-500">
                                  {formatBnDate(m.memoDate)}
                                  {m.phase ? ` · পর্যায়-${toBnDigits(m.phase)}` : ''}
                                  {m.comment ? ` · ${m.comment}` : ''}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">{m.grain}</td>
                              <td className="py-2 px-3 text-right font-semibold">{formatBnQty(usage.total)}</td>
                              <td className="py-2 px-3 text-right text-slate-600">{formatBnQty(usage.used)}</td>
                              <td
                                className={`py-2 px-3 text-right font-bold ${
                                  hasRem ? 'text-[#E2136E]' : 'text-slate-400'
                                }`}
                              >
                                {hasRem ? formatBnQty(usage.remaining) : '০.০০০ (শেষ)'}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  {!lockedStage && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (meta.requiresDC) {
                                          setInspectedMinMemo(m.memoNo);
                                          if (hasRem) setDcMinMemo(m.memoNo);
                                          scrollToStep('dc');
                                        } else {
                                          setInspectedSubSourceMemo(m.memoNo);
                                          if (hasRem) setSubSourceMemo(m.memoNo);
                                          scrollToStep('sub');
                                        }
                                      }}
                                      className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                    >
                                      {hasRem ? 'পরবর্তী ধাপ' : 'তালিকা দেখুন'}
                                    </button>
                                  )}
                                  {onUpdateMinistry && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMinId(m.id);
                                        setMinMemo(m.memoNo);
                                        setMinDate(m.memoDate);
                                        setMinQty(String(m.allocationQty));
                                        setMinGrain(m.grain);
                                        setMinPhase(String(m.phase || 1));
                                        setMinComment(m.comment || '');
                                      }}
                                      className="p-1.5 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                      title="এডিট করুন"
                                      aria-label="এডিট করুন"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editingMinId === m.id) resetMinistryForm();
                                      onDeleteMinistry(m.id);
                                    }}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                    title="মুছে ফেলুন"
                                    aria-label="মুছে ফেলুন"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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

            {/* STEP 2: DC ALLOCATION (+ OPTIONAL PROJECTS) */}
            {meta.requiresDC && (
              <div
                className={`w-full shrink-0 snap-center snap-always ${
                  activeStep === 'dc' ? '' : 'max-h-[68vh] overflow-hidden opacity-90'
                }`}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <form
                  onSubmit={handleSaveDC}
                  className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900">
                    <span>{editingDcId ? 'ডিসি বরাদ্দ সম্পাদনা (এডিট)' : 'নতুন ডিসি বরাদ্দ'}</span>
                    {editingDcId && (
                      <button
                        type="button"
                        onClick={resetDCForm}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 cursor-pointer"
                      >
                        বাতিল
                      </button>
                    )}
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        মন্ত্রণালয় স্মারক নির্বাচন *
                      </label>
                      <select
                        required
                        value={dcMinMemo}
                        onChange={(e) => {
                          setDcMinMemo(e.target.value);
                          if (e.target.value) setInspectedMinMemo(e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:border-[#E2136E]"
                      >
                        <option value="">
                          {(editingDcId ? catMinistryList : availableMinistryMemos).length === 0
                            ? '-- অবশিষ্ট কোনো মন্ত্রণালয় স্মারক নেই --'
                            : '-- স্মারক বাছাই করুন --'}
                        </option>
                        {(editingDcId ? catMinistryList : availableMinistryMemos).map((m) => {
                          const u = getMinistryUsage(selectedCategory, m.memoNo);
                          return (
                            <option key={m.id} value={m.memoNo}>
                              {toBnDigits(m.memoNo)} (অবশিষ্ট: {formatBnQty(u.remaining)} মে.টন)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ডিসি অফিসের স্মারক নং *</label>
                      <input
                        type="text"
                        required
                        value={dcMemo}
                        onChange={(e) => setDcMemo(e.target.value)}
                        placeholder="যেমন: ৩১.১০.০৬০০.৫০"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">ডিসি তারিখ *</label>
                        <input
                          type="date"
                          required
                          value={dcDate}
                          onChange={(e) => setDcDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">পরিমাণ (মে.টন) *</label>
                        <input
                          type="number"
                          step="0.001"
                          required
                          value={dcQty}
                          onChange={(e) => setDcQty(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                        />
                      </div>
                    </div>

                    {!editingDcId && meta.supportsProjects && (
                      <div className="border-t border-slate-200 pt-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <FolderKanban className="h-3.5 w-3.5 text-[#E2136E]" />
                            প্রকল্প তালিকা ({toBnDigits(projectDrafts.length)}টি
                            {projectDraftTotalQty > 0
                              ? ` · ${formatBnQty(projectDraftTotalQty)} মে.টন`
                              : ''}
                            )
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleDownloadProjectTemplate}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 cursor-pointer"
                            >
                              <Download className="h-3 w-3 text-[#E2136E]" />
                              <span>টেম্পলেট (.xlsx)</span>
                            </button>

                            <input
                              ref={excelInputRef}
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              onChange={(e) => void handleUploadProjectExcel(e)}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => excelInputRef.current?.click()}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 cursor-pointer"
                            >
                              <FileSpreadsheet className="h-3 w-3" />
                              <span>এক্সেল আপলোড</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setProjectDrafts((prev) => [
                                  ...prev,
                                  {
                                    projectNo: `প্রকল্প-${prev.length + 1}`,
                                    projectName: '',
                                    presidentName: '',
                                    unionName: db.officer.unions[0] || '',
                                    allocationQty: '',
                                  },
                                ])
                              }
                              className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                            >
                              + প্রকল্প
                            </button>
                          </div>
                        </div>

                        {(uploadedExcelName || projectDraftTotalQty > 0) && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-[11px]">
                            <span className="font-semibold text-emerald-900 truncate">
                              {uploadedExcelName ? `ফাইল: ${uploadedExcelName}` : `প্রকল্প যোগফল: ${formatBnQty(projectDraftTotalQty)} মে.টন`}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {projectDraftTotalQty > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDcQty(projectDraftTotalQty.toFixed(3))}
                                  className="rounded bg-white border border-emerald-300 px-2 py-0.5 font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                                >
                                  মোট ({formatBnQty(projectDraftTotalQty)}) ডিসি ঘরে বসান
                                </button>
                              )}
                              {projectDrafts.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProjectDrafts([]);
                                    setUploadedExcelName('');
                                  }}
                                  className="text-rose-600 font-bold hover:underline cursor-pointer"
                                >
                                  মুছুন
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {projectDrafts.length > 0 && (
                          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
                            {projectDrafts.map((p, idx) => (
                              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                                <div className="grid grid-cols-3 gap-1.5">
                                  <input
                                    type="text"
                                    value={p.projectNo}
                                    onChange={(e) =>
                                      setProjectDrafts((prev) =>
                                        prev.map((x, i) => (i === idx ? { ...x, projectNo: e.target.value } : x))
                                      )
                                    }
                                    placeholder="প্রকল্প নং"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                  />
                                  <select
                                    value={p.unionName}
                                    onChange={(e) =>
                                      setProjectDrafts((prev) =>
                                        prev.map((x, i) => (i === idx ? { ...x, unionName: e.target.value } : x))
                                      )
                                    }
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                  >
                                    <option value="">-- ইউনিয়ন --</option>
                                    {getUnionOptions(p.unionName).map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={p.allocationQty}
                                    onChange={(e) =>
                                      setProjectDrafts((prev) =>
                                        prev.map((x, i) => (i === idx ? { ...x, allocationQty: e.target.value } : x))
                                      )
                                    }
                                    placeholder="মে.টন"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input
                                    type="text"
                                    value={p.projectName}
                                    onChange={(e) =>
                                      setProjectDrafts((prev) =>
                                        prev.map((x, i) => (i === idx ? { ...x, projectName: e.target.value } : x))
                                      )
                                    }
                                    placeholder="প্রকল্পের নাম"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                  />
                                  <div className="flex gap-1">
                                    <input
                                      type="text"
                                      value={p.presidentName}
                                      onChange={(e) =>
                                        setProjectDrafts((prev) =>
                                          prev.map((x, i) => (i === idx ? { ...x, presidentName: e.target.value } : x))
                                        )
                                      }
                                      placeholder="সভাপতি / সম্পাদক"
                                      className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setProjectDrafts((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                      className="text-rose-600 px-1 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            অথবা CSV/টেক্সট পেস্ট করুন (প্রকল্প নং, নাম, সভাপতি, ইউনিয়ন, পরিমাণ):
                          </label>
                          <textarea
                            rows={2}
                            value={csvText}
                            onChange={(e) => setCsvText(e.target.value)}
                            placeholder="P-101, রাস্তা মেরামত, আঃ রহিম, সাতলা, 5.000"
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px]"
                          />
                          {csvText.trim() && (
                            <button
                              type="button"
                              onClick={handleParseCsvProjects}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
                            >
                              <Upload className="h-3 w-3" />
                              <span>তালিকায় যোগ করুন</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!dcMinMemo}
                    className="w-full min-h-[44px] rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                  >
                    {editingDcId ? 'ডিসি বরাদ্দ হালনাগাদ করুন' : 'ডিসি বরাদ্দ সংরক্ষণ করুন'}
                  </button>
                </form>

                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-900">
                      {selectedCategory} — সংরক্ষিত ডিসি বরাদ্দসমূহ ({formatBnInt(filteredDCList.length)}টি)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse tabular-nums">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                            <th className="py-2 px-3 text-left">ডিসি স্মারক ও তারিখ</th>
                            <th className="py-2 px-3 text-left">মন্ত্রণালয় স্মারক</th>
                            <th className="py-2 px-3 text-right">মোট</th>
                            <th className="py-2 px-3 text-right">ব্যবহৃত</th>
                            <th className="py-2 px-3 text-right">অবশিষ্ট</th>
                            <th className="py-2 px-3 text-center">কাজ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDCList.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">
                                {selectedCategory} খাতে এখনো কোনো ডিসি বরাদ্দ এন্ট্রি করা হয়নি।
                              </td>
                            </tr>
                          ) : (
                            filteredDCList.map((d) => {
                              const u = getDCUsage(selectedCategory, d.dcMemo);
                              const hasRem = u.remaining > 0.0005;
                              return (
                                <tr
                                  key={d.id}
                                  className={editingDcId === d.id ? 'bg-rose-50/60' : 'hover:bg-slate-50'}
                                >
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-slate-900">{toBnDigits(d.dcMemo)}</div>
                                    <div className="text-[11px] text-slate-500">{formatBnDate(d.dcMemoDate)}</div>
                                  </td>
                                  <td className="py-2 px-3 text-slate-600">{toBnDigits(d.ministryMemo)}</td>
                                  <td className="py-2 px-3 text-right font-semibold">{formatBnQty(u.total)}</td>
                                  <td className="py-2 px-3 text-right">{formatBnQty(u.used)}</td>
                                  <td
                                    className={`py-2 px-3 text-right font-bold ${
                                      hasRem ? 'text-[#E2136E]' : 'text-slate-400'
                                    }`}
                                  >
                                    {hasRem ? formatBnQty(u.remaining) : '০.০০০ (শেষ)'}
                                  </td>
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      {!lockedStage && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInspectedSubSourceMemo(d.dcMemo);
                                            if (hasRem) setSubSourceMemo(d.dcMemo);
                                            scrollToStep('sub');
                                          }}
                                          className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                        >
                                          {hasRem ? 'উপবরাদ্দ' : 'তালিকা দেখুন'}
                                        </button>
                                      )}
                                      {onUpdateDC && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingDcId(d.id);
                                            setDcMinMemo(d.ministryMemo);
                                            setDcMemo(d.dcMemo);
                                            setDcDate(d.dcMemoDate);
                                            setDcQty(String(d.allocationQty));
                                          }}
                                          className="p-1.5 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                          title="এডিট করুন"
                                          aria-label="এডিট করুন"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (editingDcId === d.id) resetDCForm();
                                          onDeleteDC(d.id);
                                        }}
                                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                        title="মুছে ফেলুন"
                                        aria-label="মুছে ফেলুন"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {meta.supportsProjects && filteredDCList.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          বিদ্যমান ডিসি স্মারকে অতিরিক্ত প্রকল্প যুক্ত করুন
                        </span>
                        <select
                          value={extraProjectDcMemo}
                          onChange={(e) => setExtraProjectDcMemo(e.target.value)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 bg-white text-xs"
                        >
                          {filteredDCList.map((d) => (
                            <option key={d.id} value={d.dcMemo}>
                              ডিসি স্মারক: {toBnDigits(d.dcMemo)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!projectDrafts.length || !extraProjectDcMemo}
                          onClick={() => {
                            const cleaned = projectDrafts
                              .filter((p) => p.projectNo.trim())
                              .map((p) => ({
                                projectNo: p.projectNo.trim(),
                                projectName: p.projectName.trim(),
                                presidentName: p.presidentName.trim(),
                                unionName: p.unionName.trim(),
                                allocationQty: parseNum(p.allocationQty),
                              }));
                            const res = onAddProjectsToDC(selectedCategory, extraProjectDcMemo, cleaned);
                            showResult(res);
                            if (res.ok) setProjectDrafts([]);
                          }}
                          className="rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
                        >
                          বামের প্রকল্পসমূহ নির্বাচিত ডিসি স্মারকে যুক্ত করুন
                        </button>
                      </div>
                    </div>
                  )}

                  {meta.supportsProjects && catSavedProjects.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                        ইউএনও-তে প্রেরিত ডিসি প্রকল্পসমূহ ({formatBnInt(catSavedProjects.length)}টি)
                      </div>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-xs border-collapse tabular-nums">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                              <th className="py-1.5 px-3 text-left">প্রকল্প ও ইউনিয়ন</th>
                              <th className="py-1.5 px-3 text-left">ডিসি স্মারক</th>
                              <th className="py-1.5 px-3 text-right">পরিমাণ</th>
                              {onDeleteProject && <th className="py-1.5 px-2 text-center">মুছুন</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {catSavedProjects.map((p) => (
                              <tr key={p.id}>
                                <td className="py-1.5 px-3">
                                  <div className="font-bold text-slate-900">
                                    {toBnDigits(p.projectNo)} — {p.projectName}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {p.unionName}
                                    {p.presidentName ? ` · সভাপতি: ${p.presidentName}` : ''}
                                  </div>
                                </td>
                                <td className="py-1.5 px-3 text-slate-600">{toBnDigits(p.dcMemo)}</td>
                                <td className="py-1.5 px-3 text-right font-bold">
                                  {formatBnQty(p.allocationQty)}
                                </td>
                                {onDeleteProject && (
                                  <td className="py-1.5 px-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => onDeleteProject(p.id)}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                      title="প্রকল্প মুছুন"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
              </div>
            )}

            {/* STEP 3: UNO / UCF SUBALLOCATION */}
            <div
              className={`w-full shrink-0 snap-center snap-always ${
                activeStep === 'sub' ? '' : 'max-h-[68vh] overflow-hidden opacity-90'
              }`}
            >
              {(() => {
                const renderAllocatedListCard = () => (
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold text-slate-900 bg-slate-50/70">
                      <span>
                        {selectedCategory} — বরাদ্দকৃত তালিকা (
                        {formatBnInt(
                          isDealerOrEpFlow ? filteredSubDealerSubs.length : filteredSubUnoSubs.length
                        )}
                        টি)
                      </span>
                      {activeSubFilterMemo && (
                        <button
                          type="button"
                          onClick={() => setAllocatedFilterCurrentMemo((v) => !v)}
                          className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer ${
                            allocatedFilterCurrentMemo
                              ? 'border-[#E2136E] bg-rose-50 text-[#E2136E]'
                              : 'border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {allocatedFilterCurrentMemo ? 'সকল স্মারক দেখান' : 'শুধু নির্বাচিত স্মারক'}
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm border-collapse tabular-nums">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                            <th className="py-2.5 px-3 text-left">স্মারক ও তারিখ</th>
                            <th className="py-2.5 px-3 text-left min-w-[200px]">ইউনিয়ন / প্রাপক</th>
                            <th className="py-2.5 px-3 text-right">বরাদ্দ (মে.টন)</th>
                            <th className="py-2.5 px-3 text-right">অবশিষ্ট (ডিও বাকি)</th>
                            <th className="py-2.5 px-3 text-center">কাজ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {isDealerOrEpFlow ? (
                            (() => {
                              const visibleDealerSubs = filteredSubDealerSubs;
                              if (visibleDealerSubs.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={5} className="py-6 text-center text-slate-500">
                                      {selectedCategory} খাতে এখনো কোনো বরাদ্দকৃত তালিকা নেই।
                                    </td>
                                  </tr>
                                );
                              }
                              return visibleDealerSubs.map((s) => {
                                const isEditing =
                                  editingSubRow?.id === s.id && editingSubRow.kind === 'dealer';
                                const remDo = remainingBySubKey.get(`ds:${s.id}`) ?? s.allocationQty;
                                return (
                                  <tr key={s.id} className={isEditing ? 'bg-rose-50/50' : ''}>
                                    <td className="py-2 px-2.5">
                                      {isEditing ? (
                                        <div className="space-y-1">
                                          <input
                                            type="text"
                                            value={editingSubRow.unoMemo}
                                            onChange={(e) =>
                                              setEditingSubRow((prev) =>
                                                prev ? { ...prev, unoMemo: e.target.value } : prev
                                              )
                                            }
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                            placeholder="স্মারক নং"
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
                                        <>
                                          <span className="font-bold text-slate-900">
                                            {toBnDigits(s.unoMemo)}
                                          </span>{' '}
                                          <span className="text-slate-500">
                                            ({formatBnDate(s.unoDate)})
                                          </span>
                                        </>
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
                                            placeholder="ডিলার/প্রাপক"
                                          />
                                          <select
                                            value={editingSubRow.unionName}
                                            onChange={(e) =>
                                              setEditingSubRow((prev) =>
                                                prev ? { ...prev, unionName: e.target.value } : prev
                                              )
                                            }
                                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                          >
                                            <option value="">-- ইউনিয়ন --</option>
                                            {getUnionOptions(editingSubRow.unionName).map((un) => (
                                              <option key={un} value={un}>
                                                {un}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="font-semibold">{s.dealerName}</span> ·{' '}
                                          {s.unionName}
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
                                        formatBnQty(s.allocationQty)
                                      )}
                                    </td>
                                    <td
                                      className={`py-2 px-2.5 text-right font-bold ${
                                        remDo > 0.0005 ? 'text-[#E2136E]' : 'text-emerald-700'
                                      }`}
                                    >
                                      {formatBnQty(remDo)}
                                    </td>
                                    <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                      {isEditing ? (
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!onUpdateDealerSub) return;
                                              const res = onUpdateDealerSub(s.id, {
                                                unoMemo: editingSubRow.unoMemo,
                                                unoDate: editingSubRow.unoDate,
                                                dealerName: editingSubRow.recipient,
                                                unionName: editingSubRow.unionName,
                                                allocationQty: parseNum(editingSubRow.qty),
                                              });
                                              showResult(res);
                                              if (res.ok) setEditingSubRow(null);
                                            }}
                                            className="p-2 text-white bg-[#E2136E] hover:bg-[#B80D58] rounded cursor-pointer"
                                            title="সংরক্ষণ"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingSubRow(null)}
                                            className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                            title="বাতিল"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1">
                                          {onUpdateDealerSub && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEditingSubRow({
                                                  id: s.id,
                                                  kind: 'dealer',
                                                  unoMemo: s.unoMemo,
                                                  unoDate: s.unoDate,
                                                  recipient: s.dealerName,
                                                  unionName: s.unionName,
                                                  qty: String(s.allocationQty),
                                                })
                                              }
                                              className="p-2 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                              title="এডিট করুন"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => onDeleteDealerSub(s.id)}
                                            className="p-2 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                            title="মুছুন"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            })()
                          ) : (
                            (() => {
                              const visibleUnoSubs = filteredSubUnoSubs;
                              if (visibleUnoSubs.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={5} className="py-6 text-center text-slate-500">
                                      {allocatedFilterCurrentMemo && activeSubFilterMemo
                                        ? `নির্বাচিত স্মারকে (${toBnDigits(activeSubFilterMemo)}) এখনো কোনো বরাদ্দকৃত তালিকা নেই।`
                                        : `${selectedCategory} খাতে এখনো কোনো বরাদ্দকৃত তালিকা নেই।`}
                                    </td>
                                  </tr>
                                );
                              }
                              return visibleUnoSubs.map((u) => {
                                const isEditing =
                                  editingSubRow?.id === u.id && editingSubRow.kind === 'uno';
                                const remDo = remainingBySubKey.get(`uno:${u.id}`) ?? u.allocationQty;
                                return (
                                  <tr key={u.id} className={isEditing ? 'bg-rose-50/50' : ''}>
                                    <td className="py-2 px-2.5">
                                      {isEditing ? (
                                        <div className="space-y-1">
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
                                        <>
                                          <span className="font-bold text-slate-900">
                                            {toBnDigits(u.unoMemo)}
                                          </span>{' '}
                                          <span className="text-slate-500">
                                            ({formatBnDate(u.unoDate)})
                                          </span>
                                        </>
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
                                          <select
                                            value={editingSubRow.unionName}
                                            onChange={(e) =>
                                              setEditingSubRow((prev) =>
                                                prev ? { ...prev, unionName: e.target.value } : prev
                                              )
                                            }
                                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                          >
                                            <option value="">-- ইউনিয়ন --</option>
                                            {getUnionOptions(editingSubRow.unionName).map((un) => (
                                              <option key={un} value={un}>
                                                {un}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="font-semibold">{u.recipientName}</span> ·{' '}
                                          {u.unionName}
                                          {u.projectNo ? ` (${toBnDigits(u.projectNo)})` : ''}
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
                                    <td
                                      className={`py-2 px-2.5 text-right font-bold ${
                                        remDo > 0.0005 ? 'text-[#E2136E]' : 'text-emerald-700'
                                      }`}
                                    >
                                      {formatBnQty(remDo)}
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
                                              showResult(res);
                                              if (res.ok) setEditingSubRow(null);
                                            }}
                                            className="p-2 text-white bg-[#E2136E] hover:bg-[#B80D58] rounded cursor-pointer"
                                            title="সংরক্ষণ"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingSubRow(null)}
                                            className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                            title="বাতিল"
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
                                                  kind: 'uno',
                                                  unoMemo: u.unoMemo,
                                                  unoDate: u.unoDate,
                                                  recipient: u.recipientName,
                                                  unionName: u.unionName,
                                                  qty: String(u.allocationQty),
                                                })
                                              }
                                              className="p-2 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                              title="এডিট করুন"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => onDeleteUNOSub(u.id)}
                                            className="p-2 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                            title="মুছুন"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            })()
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-3">
                    {/* Top Source / Ministry Memo Bar: মন্ত্রণালয়ের স্মারক, মোট বরাদ্দ, বর্তমান অবশিষ্ট */}
                    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-3 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs">
                        <div className="md:col-span-6">
                          <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-1">
                            {meta.requiresDC
                              ? 'জেলা প্রশাসক (ডিসি) / মন্ত্রণালয় উৎস স্মারক *'
                              : 'মন্ত্রণালয়ের স্মারক *'}
                          </label>
                          <select
                            value={subSourceMemo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSubSourceMemo(val);
                              setInspectedSubSourceMemo(val);
                              setExpandedPendingProjId(null);
                              setTransferringProjId(null);
                            }}
                            className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#E2136E]"
                          >
                            <option value="">
                              {(meta.requiresDC ? catDCList.length : catMinistryList.length) === 0
                                ? '-- কোনো বরাদ্দ স্মারক এন্ট্রি করা হয়নি --'
                                : '-- ডিসি স্মারক নির্বাচন করুন --'}
                            </option>
                            {meta.requiresDC
                              ? catDCList.map((d) => {
                                  const u = getDCUsage(selectedCategory, d.dcMemo);
                                  const pendingCnt = meta.supportsProjects
                                    ? computeEnrichedProjects(db, {
                                        category: selectedCategory,
                                        dcMemo: d.dcMemo,
                                        pendingOnly: true,
                                      }).length
                                    : 0;
                                  return (
                                    <option key={d.id} value={d.dcMemo}>
                                      মন্ত্রণালয়: {toBnDigits(d.ministryMemo)} · ডিসি: {toBnDigits(d.dcMemo)} (অবশিষ্ট: {formatBnQty(u.remaining)} মে.টন
                                      {meta.supportsProjects ? ` · ${toBnDigits(pendingCnt)}টি পেন্ডিং` : ''})
                                    </option>
                                  );
                                })
                              : catMinistryList.map((m) => {
                                  const u = getMinistryUsage(selectedCategory, m.memoNo);
                                  return (
                                    <option key={m.id} value={m.memoNo}>
                                      স্মারক: {toBnDigits(m.memoNo)} · {formatBnDate(m.memoDate)} (অবশিষ্ট: {formatBnQty(u.remaining)} মে.টন)
                                    </option>
                                  );
                                })}
                          </select>
                        </div>

                        <div className="md:col-span-6 grid grid-cols-2 gap-2 tabular-nums">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-bold text-slate-500">মোট বরাদ্দ</div>
                            <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                              {formatBnQty(upstreamForSub.total)} মে.টন
                            </div>
                          </div>
                          <div className="rounded-xl border border-rose-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-bold text-slate-500">বর্তমান অবশিষ্ট</div>
                            <div
                              className={`text-sm font-extrabold mt-0.5 ${
                                upstreamForSub.remaining > 0.0005
                                  ? 'text-[#E2136E]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatBnQty(upstreamForSub.remaining)} মে.টন
                            </div>
                          </div>
                        </div>
                      </div>

                      {subSourceMemo && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                          {meta.requiresDC && selectedDcSourceRecord ? (
                            <>
                              <span>
                                মন্ত্রণালয়ের স্মারক:{' '}
                                <strong className="text-slate-900">
                                  {toBnDigits(selectedDcSourceRecord.ministryMemo)}
                                </strong>
                                {selectedMinSourceRecord?.memoDate
                                  ? ` (${formatBnDate(selectedMinSourceRecord.memoDate)})`
                                  : ''}
                              </span>
                              <span className="text-slate-300">|</span>
                              <span>
                                ডিসি স্মারক:{' '}
                                <strong className="text-slate-900">
                                  {toBnDigits(selectedDcSourceRecord.dcMemo)}
                                </strong>
                                {selectedDcSourceRecord.dcMemoDate
                                  ? ` (${formatBnDate(selectedDcSourceRecord.dcMemoDate)})`
                                  : ''}
                              </span>
                            </>
                          ) : selectedMinSourceRecord ? (
                            <span>
                              মন্ত্রণালয়ের স্মারক:{' '}
                              <strong className="text-slate-900">
                                {toBnDigits(selectedMinSourceRecord.memoNo)}
                              </strong>{' '}
                              ({formatBnDate(selectedMinSourceRecord.memoDate)}) · শস্য:{' '}
                              {selectedMinSourceRecord.grain}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Single-Line Sub-Tab Navigation Strip (এক লাইনে) */}
                    <div className="rounded-2xl border border-slate-200 bg-white px-2.5 py-2">
                      <div
                        role="tablist"
                        aria-label="উপবরাদ্দ ট্যাবসমূহ"
                        className="no-scrollbar flex items-center gap-1.5 overflow-x-auto flex-nowrap"
                      >
                        {subTabDefs.map((tab) => {
                          const isAct = activeSubTab === tab.key;
                          const Icon =
                            tab.key === 'chairman' || tab.key === 'dealer'
                              ? Users
                              : tab.key === 'manual'
                                ? ClipboardPlus
                                : tab.key === 'project'
                                  ? FolderKanban
                                  : ClipboardCheck;
                          return (
                            <button
                              key={tab.key}
                              ref={(el) => {
                                subTabBtnRefs.current[tab.key] = el;
                              }}
                              type="button"
                              role="tab"
                              aria-selected={isAct}
                              onClick={() => scrollToSubTab(tab.key)}
                              className={`min-h-[44px] shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-xl px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
                                isAct
                                  ? tab.key === 'allocated'
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-[#E2136E] text-white border-[#E2136E] shadow-xs'
                                  : 'bg-rose-50/50 text-slate-700 border-slate-200 hover:bg-rose-50'
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span>{tab.label}</span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[11px] leading-none tabular-nums ${
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

                    {/* Horizontally Swipeable Sub-Pages Container */}
                    <div
                      ref={subPagerRef}
                      data-no-pager-drag="true"
                      onScroll={handleSubPagerScroll}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0 || !subPagerRef.current) return;
                        const target = e.target as HTMLElement | null;
                        if (target?.closest('input, select, textarea, button, a, label, table')) {
                          return;
                        }
                        subDragRef.current = {
                          active: true,
                          startX: e.clientX,
                          startScrollLeft: subPagerRef.current.scrollLeft,
                          moved: false,
                        };
                        setIsDraggingSubPager(true);
                      }}
                      onMouseMove={(e) => {
                        if (!subDragRef.current.active || !subPagerRef.current) return;
                        const dx = e.clientX - subDragRef.current.startX;
                        if (Math.abs(dx) > 6) {
                          subDragRef.current.moved = true;
                        }
                        if (subDragRef.current.moved) {
                          subPagerRef.current.scrollLeft =
                            subDragRef.current.startScrollLeft - dx;
                        }
                      }}
                      onMouseUp={finishSubPagerDrag}
                      onMouseLeave={finishSubPagerDrag}
                      onClickCapture={(e) => {
                        if (subDragRef.current.moved) {
                          e.preventDefault();
                          e.stopPropagation();
                          subDragRef.current.moved = false;
                        }
                      }}
                      className={`no-scrollbar flex items-start overflow-x-auto ${
                        isDraggingSubPager
                          ? 'snap-none cursor-grabbing select-none'
                          : 'snap-x snap-mandatory'
                      }`}
                    >
                      {/* DEALER / EP SLIDE (for UCF categories) */}
                      {isDealerOrEpFlow && (
                        <div
                          className={`w-full shrink-0 snap-center snap-always ${
                            activeSubTab === 'dealer' ? '' : 'max-h-[60vh] overflow-hidden opacity-90'
                          }`}
                        >
                          <form
                            onSubmit={handleSaveDealerOrEpBatch}
                            className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3.5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  ইউসিএফ উপবরাদ্দ স্মারক নং *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={subUnoMemo}
                                  onChange={(e) => setSubUnoMemo(e.target.value)}
                                  placeholder="যেমন: ১৩.০১.০৬৯৪..."
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  উপবরাদ্দ তারিখ *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={subUnoDate}
                                  onChange={(e) => setSubUnoDate(e.target.value)}
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                              <span>
                                বর্তমান ব্যাচে চাহিদা:{' '}
                                <strong
                                  className={`tabular-nums ${
                                    dealerRequestTotal > upstreamForSub.remaining + 0.0005
                                      ? 'text-rose-700'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {formatBnQty(dealerRequestTotal)} মে.টন
                                </strong>
                              </span>

                              <div className="flex flex-wrap items-center gap-2">
                                {meta.flowType === 'dealer_oms' && (
                                  <>
                                    <div className="flex items-center gap-1">
                                      <span className="font-bold text-slate-600">এলাকা:</span>
                                      {(['ALL', 'ইউনিয়ন', 'পৌরসভা'] as const).map((area) => (
                                        <button
                                          key={area}
                                          type="button"
                                          onClick={() => setOmsAreaFilter(area)}
                                          className={`rounded px-2 py-1 text-[11px] font-bold border cursor-pointer ${
                                            omsAreaFilter === area
                                              ? 'bg-[#E2136E] text-white border-[#E2136E]'
                                              : 'bg-white text-slate-700 border-slate-300'
                                          }`}
                                        >
                                          {area === 'ALL' ? 'সকল' : area}
                                        </button>
                                      ))}
                                    </div>
                                    {selectedCategory === 'ওএমএস টিসিবি' && (
                                      <div className="flex items-center gap-1">
                                        <span className="font-bold text-slate-600">ডিলার:</span>
                                        {(['ALL', 'ওএমএস', 'খাদ্য বান্ধব'] as const).map((kind) => (
                                          <button
                                            key={kind}
                                            type="button"
                                            onClick={() => setOmsDealerTypeFilter(kind)}
                                            className={`rounded px-2 py-1 text-[11px] font-bold border cursor-pointer ${
                                              omsDealerTypeFilter === kind
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-white text-slate-700 border-slate-300'
                                            }`}
                                          >
                                            {kind === 'ALL' ? 'সকল' : kind}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                                {(meta.flowType === 'dealer_oms' || meta.flowType === 'ep') &&
                                  upstreamForSub.remaining > 0.0005 && (
                                    <button
                                      type="button"
                                      onClick={handleEqualDivideDealers}
                                      className="rounded border border-rose-300 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                    >
                                      অবশিষ্ট সমান ভাগ করুন
                                    </button>
                                  )}
                              </div>
                            </div>

                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                              {meta.flowType === 'dealer_food' && (
                                <table className="w-full text-xs border-collapse tabular-nums">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                                      <th className="py-2 px-2.5 text-center w-14">
                                        <label className="inline-flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={
                                              db.foodDealers.length > 0 &&
                                              db.foodDealers.every(
                                                (d) => dealerBatchState[d.id]?.selected
                                              )
                                            }
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              setDealerBatchState((prev) => {
                                                const next = { ...prev };
                                                for (const d of db.foodDealers) {
                                                  const cur = next[d.id] || {
                                                    selected: checked,
                                                    cards: d.cardCount,
                                                    unused: 0,
                                                    qty: round3(d.cardCount * 0.03).toFixed(3),
                                                  };
                                                  next[d.id] = { ...cur, selected: checked };
                                                }
                                                return next;
                                              });
                                            }}
                                          />
                                          <span>সব</span>
                                        </label>
                                      </th>
                                      <th className="py-2 px-2.5 text-left">ইউনিয়ন</th>
                                      <th className="py-2 px-2.5 text-left">ডিলার ও বিক্রয় কেন্দ্র</th>
                                      <th className="py-2 px-2.5 text-center w-24">কার্ড সংখ্যা</th>
                                      <th className="py-2 px-2.5 text-center w-24">অবিক্রিত / অবশিষ্ট</th>
                                      <th className="py-2 px-2.5 text-right w-28">পরিমাণ (মে.টন)</th>
                                      <th className="py-2 px-2.5 text-right">মোট টাকা</th>
                                      <th className="py-2 px-2.5 text-right">আয়কর</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {db.foodDealers.length === 0 ? (
                                      <tr>
                                        <td colSpan={8} className="py-6 text-center text-slate-500">
                                          কোনো খাদ্য বান্ধব ডিলার পাওয়া যায়নি। সেটিংস থেকে ডিলার তালিকা যোগ করুন।
                                        </td>
                                      </tr>
                                    ) : (
                                      db.foodDealers.map((d) => {
                                        const st = dealerBatchState[d.id] || {
                                          selected: true,
                                          cards: d.cardCount,
                                          unused: 0,
                                          qty: (d.cardCount * 0.03).toFixed(3),
                                        };
                                        const q = parseNum(st.qty);
                                        const prevAlloc =
                                          dealerAlreadyAllocatedOnMemo.get(
                                            d.dealerName.trim().toLowerCase()
                                          ) || 0;
                                        return (
                                          <tr
                                            key={d.id}
                                            className={
                                              st.selected ? 'bg-white' : 'bg-slate-50/70 opacity-60'
                                            }
                                          >
                                            <td className="py-1.5 px-2.5 text-center">
                                              <input
                                                type="checkbox"
                                                checked={st.selected}
                                                onChange={(e) =>
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.id]: { ...st, selected: e.target.checked },
                                                  }))
                                                }
                                              />
                                            </td>
                                            <td className="py-1.5 px-2.5">{d.unionName}</td>
                                            <td className="py-1.5 px-2.5">
                                              <div className="font-bold text-slate-900">
                                                {d.dealerName}
                                              </div>
                                              <div className="text-[11px] text-slate-500">
                                                {d.salesCenter}
                                                {prevAlloc > 0
                                                  ? ` · পূর্বে বরাদ্দ: ${formatBnQty(prevAlloc)} মে.টন`
                                                  : ''}
                                              </div>
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <input
                                                type="number"
                                                value={st.cards}
                                                onChange={(e) => {
                                                  const c = Math.max(
                                                    0,
                                                    Number(e.target.value) || 0
                                                  );
                                                  const nextQty = round3(
                                                    Math.max(0, c - st.unused) * 0.03
                                                  );
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.id]: {
                                                      ...st,
                                                      cards: c,
                                                      qty: nextQty.toFixed(3),
                                                    },
                                                  }));
                                                }}
                                                className="w-full rounded border border-slate-300 px-2 py-1 text-center text-xs"
                                              />
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <input
                                                type="number"
                                                value={st.unused}
                                                onChange={(e) => {
                                                  const u = Math.max(
                                                    0,
                                                    Number(e.target.value) || 0
                                                  );
                                                  const nextQty = round3(
                                                    Math.max(0, st.cards - u) * 0.03
                                                  );
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.id]: {
                                                      ...st,
                                                      unused: u,
                                                      qty: nextQty.toFixed(3),
                                                    },
                                                  }));
                                                }}
                                                className="w-full rounded border border-slate-300 px-2 py-1 text-center text-xs font-semibold text-amber-800"
                                              />
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <input
                                                type="number"
                                                step="0.001"
                                                value={st.qty}
                                                onChange={(e) =>
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.id]: { ...st, qty: e.target.value },
                                                  }))
                                                }
                                                className="w-full rounded border border-slate-300 px-2 py-1 text-right text-xs font-bold"
                                              />
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right">
                                              {formatBnMoney(q * catRate.unitPrice)}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right">
                                              {formatBnMoney(q * catRate.taxRate)}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              )}

                              {meta.flowType === 'dealer_oms' && (
                                <table className="w-full text-xs border-collapse tabular-nums">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                                      <th className="py-2 px-2.5 text-center w-14">
                                        <label className="inline-flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={
                                              filteredOmsDealers.length > 0 &&
                                              filteredOmsDealers.every(
                                                (d) => dealerBatchState[d.key]?.selected
                                              )
                                            }
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              setDealerBatchState((prev) => {
                                                const next = { ...prev };
                                                for (const d of filteredOmsDealers) {
                                                  const cur = next[d.key] || {
                                                    selected: checked,
                                                    cards: 0,
                                                    unused: 0,
                                                    qty: '1.000',
                                                  };
                                                  next[d.key] = { ...cur, selected: checked };
                                                }
                                                return next;
                                              });
                                            }}
                                          />
                                          <span>সব</span>
                                        </label>
                                      </th>
                                      <th className="py-2 px-2.5 text-left">এলাকা ও ইউনিয়ন/পৌরসভা</th>
                                      <th className="py-2 px-2.5 text-left">ডিলারের নাম ও কেন্দ্র</th>
                                      <th className="py-2 px-2.5 text-right w-32">বরাদ্দ (মে.টন)</th>
                                      <th className="py-2 px-2.5 text-right">মোট টাকা</th>
                                      {catRate.taxRate > 0 && (
                                        <th className="py-2 px-2.5 text-right">আয়কর</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {filteredOmsDealers.length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={catRate.taxRate > 0 ? 6 : 5}
                                          className="py-6 text-center text-slate-500"
                                        >
                                          কোনো ডিলার পাওয়া যায়নি। সেটিংস থেকে ডিলার তালিকা যোগ করুন।
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredOmsDealers.map((d) => {
                                        const st = dealerBatchState[d.key] || {
                                          selected: false,
                                          cards: 0,
                                          unused: 0,
                                          qty: '1.000',
                                        };
                                        const q = parseNum(st.qty);
                                        const prevAlloc =
                                          dealerAlreadyAllocatedOnMemo.get(
                                            d.dealerName.trim().toLowerCase()
                                          ) || 0;
                                        return (
                                          <tr
                                            key={d.key}
                                            className={st.selected ? 'bg-white' : 'bg-slate-50/50'}
                                          >
                                            <td className="py-1.5 px-2.5 text-center">
                                              <input
                                                type="checkbox"
                                                checked={st.selected}
                                                onChange={(e) =>
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.key]: { ...st, selected: e.target.checked },
                                                  }))
                                                }
                                              />
                                            </td>
                                            <td className="py-1.5 px-2.5">
                                              <div>
                                                {d.areaType} —{' '}
                                                {d.areaType === 'পৌরসভা'
                                                  ? d.municipality
                                                  : d.unionName}
                                              </div>
                                              {selectedCategory === 'ওএমএস টিসিবি' && (
                                                <span
                                                  className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                                    d.dealerKind === 'খাদ্য বান্ধব'
                                                      ? 'bg-rose-50 text-[#E2136E] border border-rose-200'
                                                      : 'bg-sky-50 text-sky-700 border border-sky-200'
                                                  }`}
                                                >
                                                  {d.dealerKind}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-bold text-slate-900">
                                              <div>
                                                {d.dealerName}{' '}
                                                <span className="font-normal text-slate-500">
                                                  ({d.salesCenter})
                                                </span>
                                              </div>
                                              {prevAlloc > 0 && (
                                                <div className="text-[10.5px] font-semibold text-emerald-700">
                                                  এই স্মারকে পূর্বে বরাদ্দ:{' '}
                                                  {formatBnQty(prevAlloc)} মে.টন
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-2">
                                              <input
                                                type="number"
                                                step="0.001"
                                                value={st.qty}
                                                onChange={(e) =>
                                                  setDealerBatchState((prev) => ({
                                                    ...prev,
                                                    [d.key]: {
                                                      ...st,
                                                      selected: true,
                                                      qty: e.target.value,
                                                    },
                                                  }))
                                                }
                                                className="w-full rounded border border-slate-300 px-2 py-1 text-right font-bold"
                                              />
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right">
                                              {formatBnMoney(q * catRate.unitPrice)}
                                            </td>
                                            {catRate.taxRate > 0 && (
                                              <td className="py-1.5 px-2.5 text-right">
                                                {formatBnMoney(q * catRate.taxRate)}
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              )}

                              {meta.flowType === 'ep' && (
                                <table className="w-full text-xs border-collapse tabular-nums">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                                      <th className="py-2 px-2.5 text-center w-10">বাছাই</th>
                                      <th className="py-2 px-2.5 text-left">প্রতিষ্ঠান (ফায়ার সার্ভিস)</th>
                                      <th className="py-2 px-2.5 text-left">বিভাগ</th>
                                      <th className="py-2 px-2.5 text-right">দর (প্রতি মে.টন)</th>
                                      <th className="py-2 px-2.5 text-right w-32">পরিমাণ (মে.টন)</th>
                                      <th className="py-2 px-2.5 text-right">মোট টাকা</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {db.fireServices.map((f) => {
                                      const st = dealerBatchState[f.id] || {
                                        selected: true,
                                        cards: 0,
                                        unused: 0,
                                        qty: '1.000',
                                      };
                                      const rate =
                                        selectedCategory === 'ইপি গম'
                                          ? f.wheatRate || catRate.unitPrice
                                          : f.riceRate || catRate.unitPrice;
                                      return (
                                        <tr key={f.id}>
                                          <td className="py-1.5 px-2.5 text-center">
                                            <input
                                              type="checkbox"
                                              checked={st.selected}
                                              onChange={(e) =>
                                                setDealerBatchState((prev) => ({
                                                  ...prev,
                                                  [f.id]: { ...st, selected: e.target.checked },
                                                }))
                                              }
                                            />
                                          </td>
                                          <td className="py-1.5 px-2.5 font-bold text-slate-900">
                                            {f.officeName}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-slate-600">
                                            {f.divisionName}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right">
                                            {formatBnMoney(rate)}
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <input
                                              type="number"
                                              step="0.001"
                                              value={st.qty}
                                              onChange={(e) =>
                                                setDealerBatchState((prev) => ({
                                                  ...prev,
                                                  [f.id]: {
                                                    ...st,
                                                    selected: true,
                                                    qty: e.target.value,
                                                  },
                                                }))
                                              }
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-right font-bold"
                                            />
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right font-semibold">
                                            {formatBnMoney(parseNum(st.qty) * rate)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-3">
                              {!subSourceMemo && (
                                <span className="text-[11px] font-bold text-amber-700">
                                  সংরক্ষণ করতে উপরে উৎস স্মারক নির্বাচন করুন
                                </span>
                              )}
                              <button
                                type="submit"
                                disabled={!subSourceMemo}
                                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-40 px-5 py-2 text-xs font-bold text-white cursor-pointer"
                              >
                                <ClipboardPlus className="h-4 w-4" />
                                <span>সকল নির্বাচিত উপবরাদ্দ সংরক্ষণ করুন</span>
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* SLIDE 1 (UNO non-project only): CHAIRMAN LIST (VGF / VWB) */}
                      {!isDealerOrEpFlow && !meta.supportsProjects && (
                        <div
                          className={`w-full shrink-0 snap-center snap-always space-y-4 ${
                            activeSubTab === 'chairman'
                              ? ''
                              : 'max-h-[60vh] overflow-hidden opacity-90'
                          }`}
                        >
                          <form
                            onSubmit={handleSaveChairmanBatch}
                            className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3"
                          >
                            {/* UNO Memo & Date right at top of Chairman Form */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  ইউএনও উপবরাদ্দ স্মারক নং *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={subUnoMemo}
                                  onChange={(e) => setSubUnoMemo(e.target.value)}
                                  placeholder="যেমন: ০৫.১০.০৬৯৪..."
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  উপবরাদ্দ তারিখ *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={subUnoDate}
                                  onChange={(e) => setSubUnoDate(e.target.value)}
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                            </div>

                            {/* Chairman Batch Summary + Equal Divide */}
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <span className="font-bold text-slate-700">
                                  সকল চেয়ারম্যান ({toBnDigits(db.chairmen.length)} জন)
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>
                                  নির্বাচিত চাহিদা:{' '}
                                  <strong
                                    className={`tabular-nums ${
                                      chairmanRequestTotal > upstreamForSub.remaining + 0.0005
                                        ? 'text-rose-700'
                                        : 'text-slate-900'
                                    }`}
                                  >
                                    {formatBnQty(chairmanRequestTotal)} মে.টন
                                  </strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={
                                      db.chairmen.length > 0 &&
                                      db.chairmen.every((ch) => unoBatchQty[ch.id]?.selected)
                                    }
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setUnoBatchQty((prev) => {
                                        const next = { ...prev };
                                        for (const ch of db.chairmen) {
                                          const cur = next[ch.id] || { selected: checked, qty: '' };
                                          next[ch.id] = { ...cur, selected: checked };
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>সব বাছাই</span>
                                </label>
                                {upstreamForSub.remaining > 0.0005 && db.chairmen.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleEqualDivideChairmen}
                                    className="rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-[#E2136E] cursor-pointer"
                                  >
                                    সমান ভাগ করুন
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Auto-Loaded Chairman Rows (Single-Row Save + Batch Check) */}
                            {db.chairmen.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300 py-8 px-4 text-center text-xs text-slate-500">
                                সেটিংস → চেয়ারম্যান তালিকা থেকে চেয়ারম্যান যোগ করা হয়নি।
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                                {db.chairmen.map((ch) => {
                                  const st = unoBatchQty[ch.id] || { selected: false, qty: '' };
                                  const rowKey = `${ch.unionName.trim().toLowerCase()}::${ch.chairmanName.trim().toLowerCase()}`;
                                  const prevAlloc = unoAlreadyAllocatedOnMemo.get(rowKey) || 0;
                                  const hasQty = parseNum(st.qty) > 0;
                                  return (
                                    <div
                                      key={ch.id}
                                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:px-3 transition-colors ${
                                        st.selected ? 'bg-white' : 'bg-slate-50/50'
                                      }`}
                                    >
                                      <label className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={st.selected}
                                          onChange={(e) =>
                                            setUnoBatchQty((prev) => ({
                                              ...prev,
                                              [ch.id]: { ...st, selected: e.target.checked },
                                            }))
                                          }
                                          className="mt-1 sm:mt-0 h-4 w-4 accent-[#E2136E] shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="text-sm font-bold text-slate-900 leading-snug break-words">
                                            {ch.unionName} — {ch.chairmanName}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            {ch.mobile && <span>{toBnDigits(ch.mobile)}</span>}
                                            {prevAlloc > 0 && (
                                              <span className="font-bold text-emerald-700">
                                                · পূর্বে বরাদ্দ: {formatBnQty(prevAlloc)} মে.টন
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </label>

                                      <div className="flex items-center gap-2 pl-6 sm:pl-0 shrink-0">
                                        <input
                                          type="number"
                                          step="0.001"
                                          value={st.qty}
                                          placeholder="০.০০০ মে.টন"
                                          onChange={(e) =>
                                            setUnoBatchQty((prev) => ({
                                              ...prev,
                                              [ch.id]: {
                                                ...st,
                                                selected: parseNum(e.target.value) > 0,
                                                qty: e.target.value,
                                              },
                                            }))
                                          }
                                          className="w-32 sm:w-36 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm font-bold tabular-nums focus:outline-none focus:border-[#E2136E]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveSingleChairman(ch)}
                                          className={`min-h-[44px] inline-flex items-center justify-center gap-1 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer shrink-0 ${
                                            hasQty
                                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                                          }`}
                                          title="এই চেয়ারম্যানের বরাদ্দ সেভ করুন"
                                        >
                                          <Check className="h-4 w-4" />
                                          <span>সেভ</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              {!subSourceMemo ? (
                                <span className="text-[11px] font-bold text-amber-700">
                                  সংরক্ষণ করতে উপরে উৎস স্মারক নির্বাচন করুন
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  প্রতিটি সারির «সেভ» বাটনে ১টি করে অথবা নিচের বাটনে সবগুলো একসাথে সেভ করুন
                                </span>
                              )}
                              <button
                                type="submit"
                                disabled={!subSourceMemo}
                                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-40 px-5 py-2 text-xs font-bold text-white cursor-pointer"
                              >
                                <ClipboardPlus className="h-4 w-4" />
                                <span>সবগুলো একসাথে সেভ করুন</span>
                              </button>
                            </div>
                          </form>

                          {/* Auto-visible Allocated List below Chairman List */}
                          {renderAllocatedListCard()}
                        </div>
                      )}

                      {/* SLIDE 2 (UNO non-project only): অন্যান্য আলাদা এন্ট্রি (VGF / VWB) */}
                      {!isDealerOrEpFlow && !meta.supportsProjects && (
                        <div
                          className={`w-full shrink-0 snap-center snap-always space-y-4 ${
                            activeSubTab === 'manual'
                              ? ''
                              : 'max-h-[60vh] overflow-hidden opacity-90'
                          }`}
                        >
                          <form
                            onSubmit={handleSaveManualBatch}
                            className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  ইউএনও উপবরাদ্দ স্মারক নং *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={subUnoMemo}
                                  onChange={(e) => setSubUnoMemo(e.target.value)}
                                  placeholder="যেমন: ০৫.১০.০৬৯৪..."
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                  উপবরাদ্দ তারিখ *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={subUnoDate}
                                  onChange={(e) => setSubUnoDate(e.target.value)}
                                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:border-[#E2136E]"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                              <span className="font-bold text-slate-700">
                                আলাদা এন্ট্রি বক্স ({toBnDigits(unoManualRows.length)}টি)
                              </span>
                              <span>
                                মোট পরিমাণ:{' '}
                                <strong
                                  className={`tabular-nums ${
                                    manualRequestTotal > upstreamForSub.remaining + 0.0005
                                      ? 'text-rose-700'
                                      : 'text-[#E2136E]'
                                  }`}
                                >
                                  {formatBnQty(manualRequestTotal)} মে.টন
                                </strong>
                              </span>
                            </div>

                            {/* 2-Line Mobile-Friendly Entry Boxes (No table scrolling) */}
                            <div className="space-y-2.5">
                              {unoManualRows.map((row) => (
                                <div
                                  key={row.id}
                                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2"
                                >
                                  {/* Line 1: Union Dropdown (+ optional Project No) + Qty + Delete */}
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={row.unionName}
                                      onChange={(e) =>
                                        setUnoManualRows((prev) =>
                                          prev.map((x) =>
                                            x.id === row.id
                                              ? { ...x, unionName: e.target.value }
                                              : x
                                          )
                                        )
                                      }
                                      aria-label="ইউনিয়ন নির্বাচন করুন"
                                      className="flex-1 min-w-0 min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E2136E]"
                                    >
                                      <option value="">-- ইউনিয়ন বাছাই করুন --</option>
                                      {getUnionOptions(row.unionName).map((u) => (
                                        <option key={u} value={u}>
                                          {u}
                                        </option>
                                      ))}
                                    </select>

                                    {meta.supportsProjects && (
                                      <input
                                        type="text"
                                        value={row.projectNo}
                                        onChange={(e) =>
                                          setUnoManualRows((prev) =>
                                            prev.map((x) =>
                                              x.id === row.id
                                                ? { ...x, projectNo: e.target.value }
                                                : x
                                            )
                                          )
                                        }
                                        placeholder="প্রকল্প নং"
                                        className="w-20 sm:w-24 shrink-0 min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#E2136E]"
                                      />
                                    )}

                                    <input
                                      type="number"
                                      step="0.001"
                                      value={row.qty}
                                      placeholder="পরিমাণ"
                                      onChange={(e) =>
                                        setUnoManualRows((prev) =>
                                          prev.map((x) =>
                                            x.id === row.id ? { ...x, qty: e.target.value } : x
                                          )
                                        )
                                      }
                                      className="w-24 sm:w-28 shrink-0 min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-xs font-bold tabular-nums focus:outline-none focus:border-[#E2136E]"
                                    />

                                    <button
                                      type="button"
                                      disabled={unoManualRows.length <= 1}
                                      onClick={() =>
                                        setUnoManualRows((prev) =>
                                          prev.filter((x) => x.id !== row.id)
                                        )
                                      }
                                      className="min-h-[40px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer shrink-0"
                                      title="বাক্স মুছুন"
                                      aria-label="বাক্স মুছুন"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {/* Line 2: Recipient / Institution Name */}
                                  <input
                                    type="text"
                                    value={row.recipientName}
                                    onChange={(e) =>
                                      setUnoManualRows((prev) =>
                                        prev.map((x) =>
                                          x.id === row.id
                                            ? { ...x, recipientName: e.target.value }
                                            : x
                                        )
                                      )
                                    }
                                    placeholder="প্রাপক / মসজিদ / এতিমখানা / প্রতিষ্ঠানের নাম *"
                                    className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E2136E]"
                                  />
                                </div>
                              ))}
                            </div>

                            {/* Bottom Actions: + আরও যোগ করুন + Save */}
                            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setUnoManualRows((prev) => [
                                    ...prev,
                                    {
                                      id: `um-${Date.now()}-${prev.length}`,
                                      unionName: db.officer.unions[0] || '',
                                      recipientName: '',
                                      projectNo: '',
                                      projectName: '',
                                      qty: '',
                                    },
                                  ])
                                }
                                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50/70 hover:bg-rose-100 px-3.5 py-2 text-xs font-bold text-[#E2136E] cursor-pointer"
                              >
                                <Plus className="h-4 w-4" />
                                <span>আরও যোগ করুন</span>
                              </button>

                              <button
                                type="submit"
                                disabled={!subSourceMemo}
                                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-40 px-5 py-2 text-xs font-bold text-white cursor-pointer"
                              >
                                <ClipboardPlus className="h-4 w-4" />
                                <span>সকল এন্ট্রি সেভ করুন</span>
                              </button>
                            </div>
                          </form>

                          {/* Auto-visible Allocated List below Manual Entry */}
                          {renderAllocatedListCard()}
                        </div>
                      )}

                      {/* SLIDE (GR & Kabikha ONLY): পেন্ডিং প্রকল্প (শুধুমাত্র প্রকল্প থেকে ইউএনও এন্ট্রি) */}
                      {!isDealerOrEpFlow && meta.supportsProjects && (
                        <div
                          className={`w-full shrink-0 snap-center snap-always space-y-4 ${
                            activeSubTab === 'project'
                              ? ''
                              : 'max-h-[60vh] overflow-hidden opacity-90'
                          }`}
                        >
                          <form
                            onSubmit={handleSaveProjectBatch}
                            className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3.5"
                          >
                            {/* Lock Gate when Password is Set in Settings & Locked */}
                            {!effectiveProjectUnlocked ? (
                              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2.5 text-xs sm:text-sm">
                                <div className="flex items-center gap-2 font-bold text-slate-900">
                                  <Lock className="h-4 w-4 text-[#E2136E]" />
                                  <span>পেন্ডিং প্রকল্প এন্ট্রি ও সেভ সুরক্ষিত — পাসওয়ার্ড দিন</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="password"
                                    value={projectPinInput}
                                    onChange={(e) => setProjectPinInput(e.target.value)}
                                    placeholder="পাসওয়ার্ড লিখুন..."
                                    className="flex-1 min-w-[180px] min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (matchesProjectPin(db.officer.lockPin, projectPinInput)) {
                                        if (onUnlockProjectEntry) onUnlockProjectEntry();
                                        else setLocalProjectUnlocked(true);
                                        setProjectPinInput('');
                                        setFeedback({ ok: true, text: 'পাসওয়ার্ড আনলক সফল হয়েছে।' });
                                      } else {
                                        setFeedback({ ok: false, text: 'পাসওয়ার্ড সঠিক নয়।' });
                                      }
                                    }}
                                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-4 py-2 font-bold text-white cursor-pointer"
                                  >
                                    <Unlock className="h-4 w-4" />
                                    <span>আনলক</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                                  <div>
                                    <label className="block font-bold text-slate-700 mb-1">
                                      ইউএনও উপবরাদ্দ স্মারক নং *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={subUnoMemo}
                                      onChange={(e) => setSubUnoMemo(e.target.value)}
                                      placeholder="যেমন: ০৫.১০.০৬৯৪..."
                                      className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:border-[#E2136E]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block font-bold text-slate-700 mb-1">
                                      উপবরাদ্দ তারিখ *
                                    </label>
                                    <input
                                      type="date"
                                      required
                                      value={subUnoDate}
                                      onChange={(e) => setSubUnoDate(e.target.value)}
                                      className="w-full min-h-[46px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:border-[#E2136E]"
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs sm:text-sm">
                                  <span className="font-bold text-slate-800">
                                    {subSourceMemo
                                      ? `নির্বাচিত ডিসি স্মারকের পেন্ডিং প্রকল্প (${toBnDigits(enrichedPendingProjects.length)}টি)`
                                      : 'উপরে থেকে ডিসি স্মারক নির্বাচন করুন'}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    {enrichedPendingProjects.length > 0 && (
                                      <label className="inline-flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={
                                            enrichedPendingProjects.length > 0 &&
                                            enrichedPendingProjects.every(
                                              (ep) => unoBatchQty[ep.project.id]?.selected
                                            )
                                          }
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setUnoBatchQty((prev) => {
                                              const next = { ...prev };
                                              for (const ep of enrichedPendingProjects) {
                                                const cur = next[ep.project.id] || {
                                                  selected: checked,
                                                  qty: ep.pendingQty.toFixed(3),
                                                  presidentName: ep.project.presidentName || '',
                                                };
                                                next[ep.project.id] = { ...cur, selected: checked };
                                              }
                                              return next;
                                            });
                                          }}
                                          className="h-4 w-4 accent-[#E2136E]"
                                        />
                                        <span>সব বাছাই</span>
                                      </label>
                                    )}
                                    <span>
                                      নির্বাচিত:{' '}
                                      <strong className="tabular-nums text-[#E2136E]">
                                        {formatBnQty(projectRequestTotal)} মে.টন
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                {!subSourceMemo ? (
                                  <div className="rounded-xl border border-dashed border-slate-300 py-8 px-4 text-center text-xs sm:text-sm text-slate-500">
                                    উপরে «জেলা প্রশাসক (ডিসি) / মন্ত্রণালয় উৎস স্মারক» থেকে স্মারক নির্বাচন করলে ওই স্মারকের পেন্ডিং প্রকল্পগুলো এখানে স্বয়ংক্রিয়ভাবে দেখাবে।
                                  </div>
                                ) : enrichedPendingProjects.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-slate-300 py-8 px-4 text-center space-y-2.5 text-xs sm:text-sm text-slate-500">
                                    <p>
                                      নির্বাচিত ডিসি স্মারকে ({toBnDigits(subSourceMemo)}) কোনো পেন্ডিং প্রকল্প বাকি নেই। জি আর ও কাবিখা খাতে শুধুমাত্র ডিসি ধাপের প্রকল্প থেকেই ইউএনও এন্ট্রি দেওয়া যাবে।
                                    </p>
                                    {!lockedStage && (
                                      <button
                                        type="button"
                                        onClick={() => scrollToStep('dc')}
                                        className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 font-bold text-[#E2136E] cursor-pointer"
                                      >
                                        <span>ডিসি ধাপে প্রকল্প যোগ করুন</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-2.5">
                                    {enrichedPendingProjects.map((ep) => {
                                      const p = ep.project;
                                      const st = unoBatchQty[p.id] || {
                                        selected: false,
                                        qty: ep.pendingQty.toFixed(3),
                                        presidentName: p.presidentName || '',
                                      };
                                      const isExpanded = expandedPendingProjId === p.id;
                                      const isTransferring = transferringProjId === p.id;
                                      const swipeOffset = projSwipeOffsets[p.id] || 0;
                                      const targetDcOptions = db.dcAllocations.filter(
                                        (d) =>
                                          d.category === transferTargetCat &&
                                          (transferTargetCat !== p.category ||
                                            normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo))
                                      );

                                      return (
                                        <div
                                          key={p.id}
                                          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white"
                                        >
                                          <div
                                            aria-hidden="true"
                                            className="absolute inset-y-0 right-0 w-32 bg-amber-500 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold"
                                          >
                                            <ArrowRightLeft className="h-4 w-4" />
                                            <span>স্থানান্তর</span>
                                          </div>

                                          <div
                                            style={{ transform: `translateX(${swipeOffset}px)` }}
                                            onTouchStart={(e) => {
                                              if (e.touches.length !== 1) return;
                                              projSwipeStartRef.current = {
                                                id: p.id,
                                                startX: e.touches[0].clientX,
                                                startY: e.touches[0].clientY,
                                              };
                                            }}
                                            onTouchMove={(e) => {
                                              const sw = projSwipeStartRef.current;
                                              if (!sw || sw.id !== p.id || e.touches.length !== 1) return;
                                              const dx = e.touches[0].clientX - sw.startX;
                                              const dy = e.touches[0].clientY - sw.startY;
                                              if (Math.abs(dx) > Math.abs(dy) && dx < -12) {
                                                e.stopPropagation();
                                                setProjSwipeOffsets((prev) => ({
                                                  ...prev,
                                                  [p.id]: Math.max(-120, dx),
                                                }));
                                              }
                                            }}
                                            onTouchEnd={() => {
                                              const cur = projSwipeOffsets[p.id] || 0;
                                              projSwipeStartRef.current = null;
                                              if (cur <= -60 && onTransferProject) {
                                                setTransferringProjId(p.id);
                                                setExpandedPendingProjId(null);
                                                setTransferTargetCat(p.category);
                                                const firstDc =
                                                  db.dcAllocations.find(
                                                    (d) =>
                                                      d.category === p.category &&
                                                      normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo)
                                                  )?.dcMemo || '';
                                                setTransferTargetDcMemo(firstDc);
                                              }
                                              setProjSwipeOffsets((prev) => ({ ...prev, [p.id]: 0 }));
                                            }}
                                            className="relative z-10 bg-white p-3.5 sm:p-4 space-y-2.5 transition-transform duration-150"
                                          >
                                            <div className="flex items-start justify-between gap-2.5">
                                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                <input
                                                  type="checkbox"
                                                  checked={st.selected}
                                                  onChange={(e) =>
                                                    setUnoBatchQty((prev) => ({
                                                      ...prev,
                                                      [p.id]: { ...st, selected: e.target.checked },
                                                    }))
                                                  }
                                                  className="mt-1 h-4.5 w-4.5 accent-[#E2136E] shrink-0"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setTransferringProjId(null);
                                                    setExpandedPendingProjId((prev) =>
                                                      prev === p.id ? null : p.id
                                                    );
                                                  }}
                                                  className="min-w-0 flex-1 text-left cursor-pointer"
                                                >
                                                  <div className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-[#E2136E]">
                                                    <span>{p.category}</span>
                                                    <span className="text-slate-300">·</span>
                                                    <span>প্রকল্প {toBnDigits(p.projectNo)}</span>
                                                    <span className="text-slate-300">·</span>
                                                    <span className="text-slate-700">{p.unionName}</span>
                                                  </div>
                                                  <div className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug break-words">
                                                    {p.projectName || `প্রকল্প ${toBnDigits(p.projectNo)}`}
                                                  </div>
                                                  <div className="text-xs text-slate-600 mt-0.5 tabular-nums break-words">
                                                    ডিসি স্মারক: {toBnDigits(p.dcMemo)} · {ep.fiscalYear}
                                                    {p.presidentName ? ` · সভাপতি: ${p.presidentName}` : ''}
                                                  </div>
                                                </button>
                                              </div>

                                              <div className="flex flex-col items-end gap-1.5 shrink-0 tabular-nums">
                                                <span className="text-sm sm:text-base font-extrabold text-[#E2136E]">
                                                  {formatBnQty(ep.pendingQty)} মে.টন
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                  {onTransferProject && (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setExpandedPendingProjId(null);
                                                        setTransferringProjId((prev) =>
                                                          prev === p.id ? null : p.id
                                                        );
                                                        setTransferTargetCat(p.category);
                                                        const firstDc =
                                                          db.dcAllocations.find(
                                                            (d) =>
                                                              d.category === p.category &&
                                                              normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo)
                                                          )?.dcMemo || '';
                                                        setTransferTargetDcMemo(firstDc);
                                                      }}
                                                      className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 cursor-pointer"
                                                      title="অন্য স্মারকে/খাতে স্থানান্তর"
                                                    >
                                                      <ArrowRightLeft className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setTransferringProjId(null);
                                                      setExpandedPendingProjId((prev) =>
                                                        prev === p.id ? null : p.id
                                                      );
                                                    }}
                                                    className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                                                      isExpanded
                                                        ? 'bg-slate-900 text-white'
                                                        : 'bg-rose-50 text-[#E2136E] border border-rose-200'
                                                    }`}
                                                  >
                                                    {isExpanded ? 'বন্ধ' : 'এন্ট্রি'}
                                                  </button>
                                                </div>
                                              </div>
                                            </div>

                                            {isExpanded && (
                                              <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                                                <div className="sm:col-span-6">
                                                  <label className="block font-bold text-slate-700 mb-1">
                                                    সভাপতি / সম্পাদক (প্রাপক)
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={st.presidentName ?? p.presidentName ?? ''}
                                                    onChange={(e) =>
                                                      setUnoBatchQty((prev) => ({
                                                        ...prev,
                                                        [p.id]: { ...st, presidentName: e.target.value },
                                                      }))
                                                    }
                                                    placeholder="সভাপতি / সম্পাদকের নাম"
                                                    className="w-full min-h-[40px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                                                  />
                                                </div>
                                                <div className="sm:col-span-3">
                                                  <label className="block font-bold text-slate-700 mb-1">
                                                    পরিমাণ (মে.টন)
                                                  </label>
                                                  <input
                                                    type="number"
                                                    step="0.001"
                                                    value={st.qty}
                                                    onChange={(e) =>
                                                      setUnoBatchQty((prev) => ({
                                                        ...prev,
                                                        [p.id]: {
                                                          ...st,
                                                          selected: parseNum(e.target.value) > 0,
                                                          qty: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="w-full min-h-[40px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-bold tabular-nums"
                                                  />
                                                </div>
                                                <div className="sm:col-span-3">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSaveSinglePendingProject(ep)}
                                                    className="w-full min-h-[40px] inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 cursor-pointer"
                                                  >
                                                    <Check className="h-3.5 w-3.5" />
                                                    <span>সেভ</span>
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            {isTransferring && onTransferProject && (
                                              <div className="pt-2 border-t border-amber-200 bg-amber-50/70 rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                                                <div className="sm:col-span-4">
                                                  <label className="block font-bold text-slate-700 mb-1">
                                                    লক্ষ্য খাত
                                                  </label>
                                                  <select
                                                    value={transferTargetCat}
                                                    onChange={(e) => {
                                                      const nc = e.target.value as AllocationCategory;
                                                      setTransferTargetCat(nc);
                                                      const fm =
                                                        db.dcAllocations.find(
                                                          (d) =>
                                                            d.category === nc &&
                                                            (nc !== p.category ||
                                                              normMemoNo(d.dcMemo) !== normMemoNo(p.dcMemo))
                                                        )?.dcMemo || '';
                                                      setTransferTargetDcMemo(fm);
                                                    }}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 py-1"
                                                  >
                                                    {PROJECT_CATEGORIES.map((c) => (
                                                      <option key={c} value={c}>
                                                        {c}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </div>
                                                <div className="sm:col-span-5">
                                                  <label className="block font-bold text-slate-700 mb-1">
                                                    লক্ষ্য ডিসি স্মারক
                                                  </label>
                                                  <select
                                                    value={transferTargetDcMemo}
                                                    onChange={(e) => setTransferTargetDcMemo(e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 py-1"
                                                  >
                                                    <option value="">-- ডিসি স্মারক --</option>
                                                    {targetDcOptions.map((d) => (
                                                      <option key={d.id} value={d.dcMemo}>
                                                        {toBnDigits(d.dcMemo)} ({formatBnDate(d.dcMemoDate)})
                                                      </option>
                                                    ))}
                                                  </select>
                                                </div>
                                                <div className="sm:col-span-3 flex gap-1">
                                                  <button
                                                    type="button"
                                                    disabled={!transferTargetDcMemo}
                                                    onClick={() => {
                                                      const res = onTransferProject(p.id, {
                                                        category: transferTargetCat,
                                                        dcMemo: transferTargetDcMemo,
                                                      });
                                                      showResult(res);
                                                      if (res.ok) setTransferringProjId(null);
                                                    }}
                                                    className="flex-1 min-h-[38px] rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold px-2 cursor-pointer"
                                                  >
                                                    স্থানান্তর
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setTransferringProjId(null)}
                                                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 text-slate-700 cursor-pointer"
                                                  >
                                                    <X className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {enrichedPendingProjects.length > 0 && (
                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="submit"
                                      className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-5 py-2 text-xs font-bold text-white cursor-pointer"
                                    >
                                      <ClipboardPlus className="h-4 w-4" />
                                      <span>নির্বাচিত প্রকল্পসমূহ সেভ করুন</span>
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </form>

                          {renderAllocatedListCard()}
                        </div>
                      )}

                      {/* FINAL SLIDE: ALLOCATED LIST (বরাদ্দকৃত তালিকা) */}
                      <div
                        className={`w-full shrink-0 snap-center snap-always ${
                          activeSubTab === 'allocated'
                            ? ''
                            : 'max-h-[60vh] overflow-hidden opacity-90'
                        }`}
                      >
                        {renderAllocatedListCard()}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* STEP 4: EMBEDDED CATEGORY DO ISSUE */}
            {hasEmbeddedDo && (
              <div
                className={`w-full shrink-0 snap-center snap-always ${
                  activeStep === 'do' ? '' : 'max-h-[68vh] overflow-hidden opacity-90'
                }`}
              >
                <DOWorkspaceView
                  db={db}
                  activeTab="do-issue"
                  onChangeTab={() => undefined}
                  initialCategory={selectedCategory}
                  lockedCategory={selectedCategory}
                  embedded={true}
                  onSaveDOBook={onSaveDOBook!}
                  onDeleteDOBook={onDeleteDOBook!}
                  verifyChallan={verifyChallan!}
                  onIssueDOBatch={onIssueDOBatch!}
                  onUpdateDOIssue={onUpdateDOIssue}
                  onDeleteDOIssue={onDeleteDOIssue!}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
