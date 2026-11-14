export type AllocationCategory =
  | 'খাদ্য বান্ধব'
  | 'ওএমএস সাধারণ'
  | 'ওএমএস বিশেষ'
  | 'ওএমএস টিসিবি'
  | 'ইপি চাল'
  | 'ইপি গম'
  | 'ভিজিএফ মৎস্য'
  | 'ভিজিএফ ঈদ'
  | 'জি আর'
  | 'কাবিখা সাধারণ চাল'
  | 'কাবিখা সাধারণ গম'
  | 'কাবিখা বিশেষ চাল'
  | 'কাবিখা বিশেষ গম'
  | 'ভিডাব্লিউভি';

export type CategoryFlowType = 'dealer_food' | 'dealer_oms' | 'ep' | 'relief' | 'kabikha' | 'vwb';

export type RegisterId =
  | 'reg-food'
  | 'reg-oms-gen'
  | 'reg-oms-spc'
  | 'reg-oms-tcb'
  | 'reg-ep-rice'
  | 'reg-ep-wheat'
  | 'reg-vgf-fish'
  | 'reg-vgf-eid'
  | 'reg-gr'
  | 'reg-kab-gen-rice'
  | 'reg-kab-gen-wheat'
  | 'reg-kab-spc-rice'
  | 'reg-kab-spc-wheat'
  | 'reg-vwb'
  | 'reg-challan';

export type ReportTemplateId =
  | RegisterId
  | 'monthly-dist'
  | 'monthly-cash'
  | 'monthly-ep'
  | 'alloc-food'
  | 'do-reg-book'
  | 'do-reg-issue'
  | 'do-reg-unused'
  | 'dlr-rep-food'
  | 'dlr-rep-oms';

export interface CategoryMeta {
  id: string;
  category: AllocationCategory;
  shortLabel: string;
  regId: RegisterId;
  flowType: CategoryFlowType;
  requiresDC: boolean;
  requiresChallan: boolean;
  supportsProjects: boolean;
  hasPhase: boolean;
  defaultGrain: 'চাল' | 'গম' | '';
  groupLabel: 'ডিলার খাত' | 'ইপি' | 'ত্রাণ' | 'কাবিখা' | 'ভিডাব্লিউভি';
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'cat-food',
    category: 'খাদ্য বান্ধব',
    shortLabel: 'খাদ্য বান্ধব',
    regId: 'reg-food',
    flowType: 'dealer_food',
    requiresDC: false,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ডিলার খাত',
  },
  {
    id: 'cat-oms-gen',
    category: 'ওএমএস সাধারণ',
    shortLabel: 'ওএমএস সাধারণ',
    regId: 'reg-oms-gen',
    flowType: 'dealer_oms',
    requiresDC: false,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ডিলার খাত',
  },
  {
    id: 'cat-oms-spc',
    category: 'ওএমএস বিশেষ',
    shortLabel: 'ওএমএস বিশেষ',
    regId: 'reg-oms-spc',
    flowType: 'dealer_oms',
    requiresDC: false,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ডিলার খাত',
  },
  {
    id: 'cat-oms-tcb',
    category: 'ওএমএস টিসিবি',
    shortLabel: 'ওএমএস টিসিবি',
    regId: 'reg-oms-tcb',
    flowType: 'dealer_oms',
    requiresDC: true,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ডিলার খাত',
  },
  {
    id: 'cat-ep-rice',
    category: 'ইপি চাল',
    shortLabel: 'ইপি চাল',
    regId: 'reg-ep-rice',
    flowType: 'ep',
    requiresDC: false,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ইপি',
  },
  {
    id: 'cat-ep-wheat',
    category: 'ইপি গম',
    shortLabel: 'ইপি গম',
    regId: 'reg-ep-wheat',
    flowType: 'ep',
    requiresDC: false,
    requiresChallan: true,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'গম',
    groupLabel: 'ইপি',
  },
  {
    id: 'cat-vgf-fish',
    category: 'ভিজিএফ মৎস্য',
    shortLabel: 'ভিজিএফ মৎস্য',
    regId: 'reg-vgf-fish',
    flowType: 'relief',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ত্রাণ',
  },
  {
    id: 'cat-vgf-eid',
    category: 'ভিজিএফ ঈদ',
    shortLabel: 'ভিজিএফ ঈদ',
    regId: 'reg-vgf-eid',
    flowType: 'relief',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ত্রাণ',
  },
  {
    id: 'cat-gr',
    category: 'জি আর',
    shortLabel: 'জি আর',
    regId: 'reg-gr',
    flowType: 'relief',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: true,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ত্রাণ',
  },
  {
    id: 'cat-kab-gen-rice',
    category: 'কাবিখা সাধারণ চাল',
    shortLabel: 'কাবিখা সাধারণ চাল',
    regId: 'reg-kab-gen-rice',
    flowType: 'kabikha',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: true,
    hasPhase: true,
    defaultGrain: 'চাল',
    groupLabel: 'কাবিখা',
  },
  {
    id: 'cat-kab-gen-wheat',
    category: 'কাবিখা সাধারণ গম',
    shortLabel: 'কাবিখা সাধারণ গম',
    regId: 'reg-kab-gen-wheat',
    flowType: 'kabikha',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: true,
    hasPhase: true,
    defaultGrain: 'গম',
    groupLabel: 'কাবিখা',
  },
  {
    id: 'cat-kab-spc-rice',
    category: 'কাবিখা বিশেষ চাল',
    shortLabel: 'কাবিখা বিশেষ চাল',
    regId: 'reg-kab-spc-rice',
    flowType: 'kabikha',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: true,
    hasPhase: true,
    defaultGrain: 'চাল',
    groupLabel: 'কাবিখা',
  },
  {
    id: 'cat-kab-spc-wheat',
    category: 'কাবিখা বিশেষ গম',
    shortLabel: 'কাবিখা বিশেষ গম',
    regId: 'reg-kab-spc-wheat',
    flowType: 'kabikha',
    requiresDC: true,
    requiresChallan: false,
    supportsProjects: true,
    hasPhase: true,
    defaultGrain: 'গম',
    groupLabel: 'কাবিখা',
  },
  {
    id: 'cat-vwb',
    category: 'ভিডাব্লিউভি',
    shortLabel: 'ভিডাব্লিউভি',
    regId: 'reg-vwb',
    flowType: 'vwb',
    requiresDC: false,
    requiresChallan: false,
    supportsProjects: false,
    hasPhase: false,
    defaultGrain: 'চাল',
    groupLabel: 'ভিডাব্লিউভি',
  },
];

export const CATEGORY_BY_NAME: Record<AllocationCategory, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.category, c])
) as Record<AllocationCategory, CategoryMeta>;

export const CHALLAN_CATEGORIES: AllocationCategory[] = [
  'খাদ্য বান্ধব',
  'ওএমএস সাধারণ',
  'ওএমএস বিশেষ',
  'ওএমএস টিসিবি',
  'ইপি চাল',
  'ইপি গম',
];

export const DEFAULT_UNIONS = [
  'সাতলা ইউনিয়ন',
  'হারতা ইউনিয়ন',
  'জল্লা ইউনিয়ন',
  'ওটরা ইউনিয়ন',
  'শোলক ইউনিয়ন',
  'বরাকোঠা ইউনিয়ন',
  'বামরাইল ইউনিয়ন',
  'শিকারপুর ইউনিয়ন',
  'গুঠিয়া ইউনিয়ন',
  'উজিরপুর পৌরসভা',
];

export interface MinistryAllocation {
  id: string;
  category: AllocationCategory;
  memoNo: string;
  memoDate: string;
  allocationQty: number;
  grain: 'চাল' | 'গম' | 'আটা';
  phase?: number;
  comment?: string;
  createdAt: string;
}

export interface DCAllocation {
  id: string;
  category: AllocationCategory;
  ministryMemo: string;
  dcMemo: string;
  dcMemoDate: string;
  allocationQty: number;
  createdAt: string;
}

export interface DealerSuballocation {
  id: string;
  category: AllocationCategory;
  sourceMemo: string;
  unoMemo: string;
  unoDate: string;
  dealerName: string;
  unionName: string;
  salesCenter: string;
  cardCount: number;
  unusedCards: number;
  allocationQty: number;
  totalAmount: number;
  taxAmount: number;
  createdAt: string;
}

export interface ProjectEntry {
  id: string;
  category: AllocationCategory;
  dcMemo: string;
  projectNo: string;
  projectName: string;
  presidentName: string;
  unionName: string;
  allocationQty: number;
  createdAt: string;
}

export interface UNOSuballocation {
  id: string;
  category: AllocationCategory;
  ministryMemo: string;
  dcMemo: string;
  unoMemo: string;
  unoDate: string;
  unionName: string;
  recipientName: string;
  projectNo?: string;
  projectName?: string;
  allocationQty: number;
  createdAt: string;
}

export interface DOBook {
  id: string;
  bookNo: number;
  startPage: number;
  endPage: number;
  totalCount: number;
  createdAt: string;
}

export interface ChallanRecord {
  id: string;
  challanNo: string;
  challanDate: string;
  category: AllocationCategory;
  dealerName: string;
  dealerAllocationId?: string;
  challanType: 'মূল চালান' | 'আয়কর চালান';
  bankName: string;
  doNo?: string;
  doDate?: string;
  allocationQty?: number;
  recordedAmount: number;
  depositedAmount: number;
  note?: string;
  createdAt: string;
}

export interface DOIssue {
  id: string;
  doNo: string;
  issueDate: string;
  category: AllocationCategory;
  unionName: string;
  recipientName: string;
  salesCenter?: string;
  allocationQty: number;
  ministryMemo: string;
  dcMemo: string;
  unoMemo: string;
  projectNo?: string;
  dealerAllocationId?: string;
  challanNo?: string;
  challanDate?: string;
  challanAmount?: number;
  taxChallanNo?: string;
  taxChallanDate?: string;
  taxChallanAmount?: number;
  requiredAmount?: number;
  requiredTaxAmount?: number;
  createdAt: string;
}

export interface FoodDealer {
  id: string;
  dealerName: string;
  fatherName: string;
  nid: string;
  mobile: string;
  unionName: string;
  salesCenter: string;
  cardCount: number;
  totalQty: number;
  poNo: string;
  poDate: string;
  bankName: string;
  amount: number;
  supervisorName: string;
  supervisorDesignation: string;
  supervisorMobile: string;
}

export interface OMSDealer {
  id: string;
  dealerName: string;
  fatherName: string;
  nid: string;
  mobile: string;
  areaType: 'ইউনিয়ন' | 'পৌরসভা';
  unionName: string;
  municipality: string;
  salesCenter: string;
  poNo: string;
  poDate: string;
  bankName: string;
  amount: number;
  supervisorName: string;
  supervisorDesignation: string;
  supervisorMobile: string;
}

export interface ChairmanEntry {
  id: string;
  unionName: string;
  chairmanName: string;
  mobile: string;
  supervisorName: string;
  supervisorMobile: string;
}

export interface FireServiceEntry {
  id: string;
  officeName: string;
  divisionName: string;
  riceRate: number;
  wheatRate: number;
}

export interface CategoryRate {
  id: string;
  category: AllocationCategory;
  unitPrice: number;
  taxRate: number;
}

export interface OfficerProfileSettings {
  govLine: string;
  officeLine1: string;
  officeLine2: string;
  officeLine3: string;
  officerName: string;
  officerDesignation: string;
  officerPlace: string;
  recvName: string;
  recvDesig: string;
  recvPlace: string;
  signatureImageUrl: string;
  unions: string[];
  lockPin: string;
  uiFontScale?: number;
  registerSignatureHeightPx?: number;
  reportSignatureHeightPx?: number;
}

export interface ReportTemplateConfig {
  id: ReportTemplateId;
  label: string;
  kind: 'register' | 'report';
  govLine: string;
  office1: string;
  office2: string;
  office3: string;
  reportTitle: string;
  subject: string;
  memoPrefix: string;
  memoLabel: string;
  dateLabel: string;
  dateSuffix: string;
  recipientLines: string;
  introText: string;
  namePrefix: string;
  totalLabel: string;
  copyTitle: string;
  copyList: string;
  showCopyBlock: boolean;
  showCopyMemo: boolean;
  copyMemoText: string;
  showCopySignature: boolean;
  copySignLines: string;
  signLines: string;
  footerNote: string;
  orientation: 'landscape' | 'portrait';
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  fontSizePt: number;
  showSignature: boolean;
  signatureHeightPx: number;
  challanSignRule: 'excess_only' | 'excess_or_equal';
  columnLabels: Record<string, string>;
  hiddenColumns: string[];
}

export interface AllocationSheetsConfig {
  enabled: boolean;
  spreadsheetId: string;
  spreadsheetName: string;
  challanSpreadsheetId?: string;
  challanSpreadsheetName?: string;
  challanAppsScriptUrl?: string;
  appsScriptUrl: string;
  apiSecret: string;
  autoSync: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'idle' | 'ok' | 'error';
  lastSyncMessage?: string;
}

export interface AllocationDatabase {
  ministryAllocations: MinistryAllocation[];
  dcAllocations: DCAllocation[];
  dealerSuballocations: DealerSuballocation[];
  projects: ProjectEntry[];
  unoSuballocations: UNOSuballocation[];
  doBooks: DOBook[];
  doIssues: DOIssue[];
  challans: ChallanRecord[];
  foodDealers: FoodDealer[];
  omsDealers: OMSDealer[];
  chairmen: ChairmanEntry[];
  fireServices: FireServiceEntry[];
  rates: CategoryRate[];
  officer: OfficerProfileSettings;
  templates: Record<ReportTemplateId, ReportTemplateConfig>;
  reportMemos: Record<string, { no: string; date: string }>;
}

export interface TemplateCatalogItem {
  id: ReportTemplateId;
  label: string;
  kind: 'register' | 'report';
  defaultOrientation: 'landscape' | 'portrait';
  defaultSubject: string;
}

export const REPORT_TEMPLATE_CATALOG: TemplateCatalogItem[] = [
  { id: 'reg-food', label: 'খাদ্য বান্ধব রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'খাদ্য বান্ধব কর্মসূচির বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-oms-gen', label: 'ওএমএস সাধারণ রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ওএমএস সাধারণ খাতের বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-oms-spc', label: 'ওএমএস বিশেষ রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ওএমএস বিশেষ খাতের বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-oms-tcb', label: 'ওএমএস টিসিবি রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ওএমএস টিসিবি খাতের বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-ep-rice', label: 'ইপি চাল রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ইপি (চাল) রেশন বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-ep-wheat', label: 'ইপি গম রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ইপি (গম) রেশন বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-vgf-fish', label: 'ভিজিএফ মৎস্য রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ভিজিএফ মৎস্য খাতের বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-vgf-eid', label: 'ভিজিএফ ঈদ রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ভিজিএফ ঈদ খাতের বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-gr', label: 'জি আর রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'জি আর (খাদ্যশস্য) বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-kab-gen-rice', label: 'কাবিখা সাধারণ চাল রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'কাবিখা সাধারণ (চাল) প্রকল্প ভিত্তিক বরাদ্দ ও ডিও রেজিস্টার' },
  { id: 'reg-kab-gen-wheat', label: 'কাবিখা সাধারণ গম রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'কাবিখা সাধারণ (গম) প্রকল্প ভিত্তিক বরাদ্দ ও ডিও রেজিস্টার' },
  { id: 'reg-kab-spc-rice', label: 'কাবিখা বিশেষ চাল রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'কাবিখা বিশেষ (চাল) প্রকল্প ভিত্তিক বরাদ্দ ও ডিও রেজিস্টার' },
  { id: 'reg-kab-spc-wheat', label: 'কাবিখা বিশেষ গম রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'কাবিখা বিশেষ (গম) প্রকল্প ভিত্তিক বরাদ্দ ও ডিও রেজিস্টার' },
  { id: 'reg-vwb', label: 'ভিডাব্লিউভি রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ভিডাব্লিউভি (VWB) কর্মসূচির বরাদ্দ ও ডিও বিতরণ রেজিস্টার' },
  { id: 'reg-challan', label: 'চালান রেজিস্টার', kind: 'register', defaultOrientation: 'landscape', defaultSubject: 'ট্রেজারি চালান ও গরমিল যাচাই রেজিস্টার' },
  { id: 'monthly-dist', label: 'মাসিক বিতরণ রিপোর্ট', kind: 'report', defaultOrientation: 'portrait', defaultSubject: 'মাস ভিত্তিক ও খাত ভিত্তিক খাদ্য শস্য বিলি আদেশের তথ্য প্রেরণ।' },
  { id: 'monthly-cash', label: 'নগদ বিক্রয় রিপোর্ট', kind: 'report', defaultOrientation: 'portrait', defaultSubject: 'নগদ মূল্যে বিক্রিত খাদ্য শস্যের মাসিক হিসাব বিবরণী।' },
  { id: 'monthly-ep', label: 'ইপি রেশন রিপোর্ট', kind: 'report', defaultOrientation: 'portrait', defaultSubject: 'ইপি গ্রাহকদের অনুকূলে সরবরাহকৃত রেশনের (চাল ও গম) পরিমাণ।' },
  { id: 'alloc-food', label: 'খাদ্য বান্ধব বরাদ্দাদেশ', kind: 'report', defaultOrientation: 'landscape', defaultSubject: 'খাদ্য বান্ধব কর্মসূচির {মাস} {বছর} মাসের উপবরাদ্দ আদেশ।' },
  { id: 'do-reg-book', label: 'ডিও বই রেজিস্ট্রার', kind: 'report', defaultOrientation: 'portrait', defaultSubject: 'ডিও বই ও পাতার হিসাব বিবরণী রেজিস্টার' },
  { id: 'do-reg-issue', label: 'ডিও ইস্যু রেজিস্টার', kind: 'report', defaultOrientation: 'landscape', defaultSubject: 'তারিখ ভিত্তিক ডিও ইস্যু রেজিস্টার' },
  { id: 'do-reg-unused', label: 'অব্যবহৃত ডিও তালিকা', kind: 'report', defaultOrientation: 'portrait', defaultSubject: 'ডিও বই অনুযায়ী অব্যবহৃত ডিও পাতার তালিকা' },
  { id: 'dlr-rep-food', label: 'ডিলার রিপোর্ট — খাদ্য বান্ধব', kind: 'report', defaultOrientation: 'landscape', defaultSubject: 'উপজেলা খাদ্য বান্ধব ডিলারগণের পূর্ণাঙ্গ তালিকা' },
  { id: 'dlr-rep-oms', label: 'ডিলার রিপোর্ট — ওএমএস', kind: 'report', defaultOrientation: 'landscape', defaultSubject: 'উপজেলা ওএমএস (OMS) ডিলারগণের পূর্ণাঙ্গ তালিকা' },
];

export const DEFAULT_OFFICER_PROFILE: OfficerProfileSettings = {
  govLine: 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার',
  officeLine1: 'উপজেলা খাদ্য নিয়ন্ত্রকের কার্যালয়',
  officeLine2: 'উজিরপুর, বরিশাল',
  officeLine3: '',
  officerName: 'উপজেলা খাদ্য নিয়ন্ত্রক',
  officerDesignation: 'উপজেলা খাদ্য নিয়ন্ত্রক',
  officerPlace: 'উজিরপুর, বরিশাল',
  recvName: 'জেলা খাদ্য নিয়ন্ত্রক',
  recvDesig: 'জেলা খাদ্য নিয়ন্ত্রকের কার্যালয়',
  recvPlace: 'বরিশাল',
  signatureImageUrl: '/default-signature.png',
  unions: [...DEFAULT_UNIONS],
  lockPin: '',
  uiFontScale: 108,
  registerSignatureHeightPx: 26,
  reportSignatureHeightPx: 38,
};

export function createDefaultTemplate(
  item: TemplateCatalogItem,
  officer: OfficerProfileSettings = DEFAULT_OFFICER_PROFILE
): ReportTemplateConfig {
  const isAllocFood = item.id === 'alloc-food';
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    govLine: officer.govLine,
    office1: officer.officeLine1,
    office2: officer.officeLine2,
    office3: officer.officeLine3,
    reportTitle: item.label,
    subject: item.defaultSubject,
    memoPrefix: '১৩.০১.০৬৯৪.০০৭.১৬.০১৭.০৯-',
    memoLabel: 'স্মারক নংঃ ',
    dateLabel: 'তারিখঃ',
    dateSuffix: 'খ্রিঃ',
    recipientLines: `${officer.recvName}\n${officer.recvDesig}\n${officer.recvPlace}`,
    introText: isAllocFood
      ? 'উপর্যুক্ত বিষয় ও সূত্রের প্রেক্ষিতে জানানো যাচ্ছে যে, {মাস} {বছর} মাসের জন্য উজিরপুর উপজেলার খাদ্য বান্ধব কর্মসূচির ডিলারদের অনুকূলে নিম্নবর্ণিত ছক মোতাবেক চাল উপবরাদ্দ প্রদান করা হলো। নির্ধারিত সময়ের মধ্যে ট্রেজারি চালানের মাধ্যমে অর্থ জমা পূর্বক ডিও গ্রহণের জন্য নির্দেশক্রমে অনুরোধ করা হলো।'
      : '',
    namePrefix: isAllocFood ? 'জনাব, ' : '',
    totalLabel: 'সর্বমোট',
    copyTitle: 'সদয় অবগতি ও প্রয়োজনীয় কার্যার্থে অনুলিপি প্রেরণ করা হলোঃ',
    copyList: [
      'জেলা প্রশাসক, বরিশাল।',
      'জেলা খাদ্য নিয়ন্ত্রক, বরিশাল।',
      'উপজেলা নির্বাহী অফিসার, উজিরপুর, বরিশাল।',
      'ভারপ্রাপ্ত কর্মকর্তা, এলএসডি, শিকারপুর, উজিরপুর, বরিশাল।',
      'সংশ্লিষ্ট ডিলার / ইউনিয়ন পরিষদ চেয়ারম্যান।',
    ].join('\n'),
    showCopyBlock: isAllocFood,
    showCopyMemo: true,
    copyMemoText: '',
    showCopySignature: true,
    copySignLines: [officer.officerName, officer.officerDesignation, officer.officerPlace]
      .filter(Boolean)
      .join('\n'),
    signLines: [officer.officerName, officer.officerDesignation, officer.officerPlace]
      .filter(Boolean)
      .join('\n'),
    footerNote: '',
    orientation: item.defaultOrientation,
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 10,
    fontSizePt: item.kind === 'register' ? 9.5 : 10.5,
    showSignature: true,
    signatureHeightPx:
      item.kind === 'register'
        ? (officer.registerSignatureHeightPx ?? 26)
        : (officer.reportSignatureHeightPx ?? 38),
    challanSignRule: 'excess_or_equal',
    columnLabels: {},
    hiddenColumns: [],
  };
}

export function createDefaultTemplatesMap(
  officer: OfficerProfileSettings = DEFAULT_OFFICER_PROFILE
): Record<ReportTemplateId, ReportTemplateConfig> {
  const map = {} as Record<ReportTemplateId, ReportTemplateConfig>;
  for (const item of REPORT_TEMPLATE_CATALOG) {
    map[item.id] = createDefaultTemplate(item, officer);
  }
  return map;
}
