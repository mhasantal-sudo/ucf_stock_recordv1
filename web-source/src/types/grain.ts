export type ProductCategory = 'paddy' | 'rice' | 'wheat' | 'bosta_50' | 'bosta_30';

export type TransactionType = 'receipt' | 'distribution' | 'shortage';

export type ChannelMode = 'receipt' | 'distribution';

export interface ProductMeta {
  id: ProductCategory;
  nameBn: string;
  shortBn: string;
  subtitleBn: string;
  accentHex: string;
  softBgClass: string;
  textColorClass: string;
  borderColorClass: string;
  tracksWeight: boolean;
  isBagProduct: boolean;
}

export const PRODUCTS: ProductMeta[] = [
  {
    id: 'paddy',
    nameBn: 'ধান',
    shortBn: 'ধান',
    subtitleBn: 'আমন ও বোরো ধান',
    accentHex: '#B45309',
    softBgClass: 'bg-amber-50',
    textColorClass: 'text-amber-800',
    borderColorClass: 'border-amber-200',
    tracksWeight: true,
    isBagProduct: false,
  },
  {
    id: 'rice',
    nameBn: 'চাল',
    shortBn: 'চাল',
    subtitleBn: 'সেদ্ধ ও আতপ চাল',
    accentHex: '#0D6E4E',
    softBgClass: 'bg-emerald-50',
    textColorClass: 'text-emerald-800',
    borderColorClass: 'border-emerald-200',
    tracksWeight: true,
    isBagProduct: false,
  },
  {
    id: 'wheat',
    nameBn: 'গম',
    shortBn: 'গম',
    subtitleBn: 'দেশি ও আমদানি গম',
    accentHex: '#9A3412',
    softBgClass: 'bg-orange-50',
    textColorClass: 'text-orange-800',
    borderColorClass: 'border-orange-200',
    tracksWeight: true,
    isBagProduct: false,
  },
  {
    id: 'bosta_50',
    nameBn: '৫০ কেজি খালি বস্তা',
    shortBn: '৫০ কেজি বস্তা',
    subtitleBn: '৫০ কেজি ধারণক্ষমতার খালি বস্তা',
    accentHex: '#334155',
    softBgClass: 'bg-slate-100',
    textColorClass: 'text-slate-800',
    borderColorClass: 'border-slate-300',
    tracksWeight: false,
    isBagProduct: true,
  },
  {
    id: 'bosta_30',
    nameBn: '৩০ কেজি খালি বস্তা',
    shortBn: '৩০ কেজি বস্তা',
    subtitleBn: '৩০ কেজি ধারণক্ষমতার খালি বস্তা',
    accentHex: '#1E40AF',
    softBgClass: 'bg-blue-50',
    textColorClass: 'text-blue-800',
    borderColorClass: 'border-blue-200',
    tracksWeight: false,
    isBagProduct: true,
  },
];

export const PRODUCT_MAP: Record<ProductCategory, ProductMeta> = {
  paddy: PRODUCTS[0],
  rice: PRODUCTS[1],
  wheat: PRODUCTS[2],
  bosta_50: PRODUCTS[3],
  bosta_30: PRODUCTS[4],
};

export type ChannelConfig = Record<
  ProductCategory,
  {
    receipt: string[];
    distribution: string[];
  }
>;

export const DEFAULT_DISTRIBUTION_CATEGORIES_RICE = [
  'বিডব্লিউবি',
  'জিআর',
  'ভিজিএফ মৎস্য',
  'ভিজিএফ ঈদ',
  'কাবিখা বিশেষ চাল',
  'কাবিখা সাধারণ চাল',
  'ওএমএস (OMS)',
  'খাদ্যবান্ধব কর্মসূচি',
  'টিসিবি (TCB)',
  'ইনভয়েস / বদলি প্রেরণ',
];

export const DEFAULT_DISTRIBUTION_CATEGORIES_WHEAT = [
  'কাবিখা গম',
  'কাবিখা বিশেষ গম',
  'কাবিখা সাধারণ গম',
  'ইপি গম',
  'ওএমএস সাধারণ গম',
  'ইনভয়েস / বদলি প্রেরণ',
];

export function inferDefaultProductFromCategory(
  categoryName: string,
  explicitProductHint?: string
): ProductCategory {
  const hint = String(explicitProductHint || '').trim().toLowerCase();
  if (hint === 'bosta_50' || hint === 'bosta50') return 'bosta_50';
  if (hint === 'bosta_30' || hint === 'bosta30') return 'bosta_30';
  if (hint === 'paddy' || hint.includes('ধান')) return 'paddy';
  if (hint === 'wheat' || hint.includes('গম')) return 'wheat';

  const cat = String(categoryName || '').trim().toLowerCase();
  const isKabikhaWheat = cat.includes('কাবিখা') && cat.includes('গম');
  const isEpWheat = (cat.includes('ইপি') || cat.includes('ep')) && cat.includes('গম');
  const isOmsWheat =
    (cat.includes('ওএমএস') || cat.includes('oms')) && cat.includes('গম');

  if (isKabikhaWheat || isEpWheat || isOmsWheat) {
    return 'wheat';
  }
  return 'rice';
}

export const DEFAULT_CHANNELS: ChannelConfig = {
  paddy: {
    receipt: [
      'অভ্যন্তরীণ সংগ্রহ',
      'আমন সংগ্রহ',
      'অভ্যন্তরীণ বোরো সংগ্রহ',
      'ইনভয়েসের মাধ্যমে প্রাপ্তি',
      'খলিত বাবদ প্রাপ্তি',
    ],
    distribution: [
      'মিলার বরাদ্দ (ছাঁটাই)',
      'ইনভয়েস / বদলি প্রেরণ',
      'নিলাম / অন্যান্য বিতরণ',
    ],
  },
  rice: {
    receipt: [
      'অভ্যন্তরীণ সংগ্রহ',
      'আমন সংগ্রহ',
      'অভ্যন্তরীণ বোরো সংগ্রহ',
      'ইনভয়েসের মাধ্যমে প্রাপ্তি',
      'খলিত বাবদ প্রাপ্তি',
    ],
    distribution: DEFAULT_DISTRIBUTION_CATEGORIES_RICE,
  },
  wheat: {
    receipt: [
      'অভ্যন্তরীণ সংগ্রহ',
      'ইনভয়েসের মাধ্যমে প্রাপ্তি',
      'আমদানি / বন্দর হতে প্রাপ্তি',
      'খলিত বাবদ প্রাপ্তি',
    ],
    distribution: DEFAULT_DISTRIBUTION_CATEGORIES_WHEAT,
  },
  bosta_50: {
    receipt: [
      'ইনভয়েসের মাধ্যমে প্রাপ্তি',
      'নতুন ৫০ কেজি বস্তা সরবরাহ',
      'খলিত বাবদ প্রাপ্তি',
      'খালি বস্তা ফেরত',
    ],
    distribution: [
      'বিতরণের সাথে প্রেরণ',
      'ইনভয়েস / বদলি প্রেরণ',
      'নষ্ট / অকেজো বাদ',
    ],
  },
  bosta_30: {
    receipt: [
      'ইনভয়েসের মাধ্যমে প্রাপ্তি',
      'নতুন ৩০ কেজি বস্তা সরবরাহ',
      'খলিত বাবদ প্রাপ্তি',
      'খালি বস্তা ফেরত',
    ],
    distribution: [
      'বিতরণের সাথে প্রেরণ',
      'ইনভয়েস / বদলি প্রেরণ',
      'নষ্ট / অকেজো বাদ',
    ],
  },
};

export interface DeliveryOrder {
  id: string;
  externalId?: string;
  doNumber: string;
  product: ProductCategory;
  category: string;
  totalBags: number;
  totalMt: number;
  deliveredBags: number;
  deliveredMt: number;
  recipient: string;
  date: string;
  source: 'manual' | 'apps_script' | 'external_app';
  status?: 'pending' | 'distributed';
  distributedAt?: string;
  distributedFrom?: string[];
  createdAt: string;
}

export interface ExternalSyncConfig {
  enabled: boolean;
  externalAppUrl: string;
  allocationAppUrl?: string;
  autoSync: boolean;
  syncIntervalSec: number;
  pushDistributedStatus: boolean;
  apiSecret?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'idle' | 'ok' | 'error';
  lastSyncMessage?: string;
}

export interface GrainTransaction {
  id: string;
  batchId: string;
  type: TransactionType;
  product: ProductCategory;
  godownNo: string;
  khamalNo: string;
  bags: number;
  metricTons: number;
  channel: string;
  doNumber?: string;
  dispatchType?: 'Invoice' | 'Mill';
  docNo?: string;
  party?: string;
  referenceNo: string;
  date: string;
  note: string;
  createdAt: string;
}

export interface KhamalStockItem {
  key: string;
  godownNo: string;
  khamalNo: string;
  product: ProductCategory;
  receiptBags: number;
  receiptMt: number;
  distBags: number;
  distMt: number;
  shortageBags: number;
  shortageMt: number;
  currentBags: number;
  currentMt: number;
  channels: string[];
  lastDate: string;
  txCount: number;
}

export interface BatchRowDraft {
  id: string;
  khamalNo: string;
  bags: string;
  metricTons: string;
}

export const DEFAULT_MAIN_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwqQcZVTNcUkcyS4B6uvJKq4q3mIEUXCMna_W0L5_3eX1WHaOY4Agno1s_3gjo54P4U6A/exec';

export const DEFAULT_ALLOCATION_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwADMUG-K45lJQBzZXJJleUO4Lp3foN7YdkJMo3EqTxGkkS2bzuIpKvCCh8c43OO7ELng/exec';

export type GasBridgeStatus = 'idle' | 'connected' | 'needs_bridge' | 'error';

export interface GasFiscalYear {
  name: string;
  start: string;
  end: string;
}

export interface GasSettings {
  lsdName: string;
  upazila: string;
  district: string;
  officer: string;
  categories: Record<string, string[]>;
  fiscalYears: GasFiscalYear[];
  activeFY: string;
}

export interface GasItemSummary {
  initBags: number;
  initWeight: number;
  issuedBags: number;
  issuedWeight: number;
  discBags: number;
  discWeight: number;
}

export interface GasEmptyBagSummaryItem {
  bagType: string;
  initBags?: number;
  issuedBags?: number;
  balanceBags?: number;
  recordBags?: number;
}

export interface GasDashboard {
  totalInitialBags: number;
  totalInitialWeight: number;
  totalGrainIssuedBags: number;
  totalGrainIssuedWeight: number;
  totalDiscrepancyBags: number;
  totalDiscrepancyWeight: number;
  balanceBags: number;
  balanceWeight: number;
  khathSummary: Record<string, { deliveredBags: number; deliveredWeight: number }>;
  itemSummary: Record<string, GasItemSummary>;
  emptyBagSummary?: GasEmptyBagSummaryItem[];
}

export interface GasAvailableDO {
  doNo: string;
  khath: string;
  union?: string;
  recipient?: string;
  remainingMT: number;
  totalMT?: number;
  bags?: number;
  date?: string;
}

export interface GasMasterGrain {
  rowIdx: number;
  khamalId: string;
  uniqueId?: string;
  godown: string;
  category: string;
  item: string;
  initBags: number;
  initWeight: number;
  currentWeight: number;
  entryDate?: string;
  remarks?: string;
}

export interface GasGrainRow {
  godown: string;
  khamalId: string;
  item: string;
  category: string;
  recordBags: number;
  recordWeight: number;
  actualBags?: number;
  actualWeight?: number;
  discrepancyBags?: number;
  discrepancyWeight?: number;
  remarks?: string;
}

export interface GasMasterEmptyBag {
  rowIdx: number;
  id: string;
  godown: string;
  bagType: string;
  initialBags: number;
  khamalNo: string;
  entryDate?: string;
}

export interface GasEmptyBagRow {
  godown: string;
  bagType: string;
  recordBags: number;
  actualBags?: number;
}

export interface GasBagIssue {
  rowIdx: number;
  id: string;
  godown: string;
  bagType: string;
  bags: number;
  khamalNo: string;
  issueDate?: string;
}

export interface GasDiscrepancy {
  rowIdx: number;
  id: string;
  khamalId: string;
  bags: number;
  weight: number;
  date?: string;
  remarks?: string;
}

export interface GasIssueRecord {
  rowIdx: number;
  id: string;
  date?: string;
  doNo: string;
  khath: string;
  khamalId: string;
  bags: number;
  weight: number;
  reference?: string;
}

export interface GasDispatchRecord {
  rowIdx: number;
  id: string;
  type: 'Invoice' | 'Mill' | string;
  date?: string;
  khamalId: string;
  docNo: string;
  party: string;
  bags: number;
  weight: number;
  reference?: string;
}

export interface GasAppData {
  fy: { name: string; start?: string; end?: string };
  settings: GasSettings;
  dashboard: GasDashboard;
  availableDOs: GasAvailableDO[];
  masterGrain: GasMasterGrain[];
  grainData: GasGrainRow[];
  emptyBagData: GasEmptyBagRow[];
  masterEmptyBags: GasMasterEmptyBag[];
  bagIssueList: GasBagIssue[];
  discList: GasDiscrepancy[];
  issueList: GasIssueRecord[];
  dispatchList: GasDispatchRecord[];
}

export interface FortnightlyReportSettings {
  govTitle: string;
  officeName: string;
  officeLocation: string;
  defaultMemoNo: string;
  recipientLabel: string;
  recipientText: string;
  subjectLabel: string;
  subjectText: string;
  referenceLabel: string;
  referenceText: string;
  lsdDisplayName: string;
  bodyTemplate: string;
  officerName: string;
  officerDesignation: string;
  signOfficeLocation: string;
  signatureImageUrl?: string;
  copyTitle: string;
  copyList: string;
  footerDesignation: string;
  footerLocation: string;
}

export const DEFAULT_FORTNIGHTLY_REPORT_SETTINGS: FortnightlyReportSettings = {
  govTitle: 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার',
  officeName: 'উপজেলা খাদ্য নিয়ন্ত্রকের কার্যালয়',
  officeLocation: 'উজিরপুর, বরিশাল।',
  defaultMemoNo: '১৩.০১.০৬৯৪.০০৭.৬৮.০২০.৫০৬',
  recipientLabel: 'প্রাপক:',
  recipientText: 'জেলা খাদ্য নিয়ন্ত্রক, বরিশাল।',
  subjectLabel: 'বিষয়ঃ',
  subjectText: 'শিকারপুর এলএসডির পাক্ষিক মজুদ যাচাই প্রতিবেদন।',
  referenceLabel: 'সূত্রঃ',
  referenceText: 'মহোদয়ের দপ্তরের ১০/৬/২০২১খ্রিঃ তারিখের ১১৭০ (১০) নং স্মারক।',
  lsdDisplayName: 'শিকারপুর',
  bodyTemplate:
    'সূত্রে উল্লেখিত স্মারকের নির্দেশ মোতাবেক {তারিখ} তারিখে আমার অধীনস্থ {গুদাম} খাদ্য গুদামে মজুদ খাদ্য শস্যের {পক্ষ} পাক্ষিক মজুদ যাচাইয়ের কাজ গণনার মাধ্যমে সম্পাদন করিয়া পরিদর্শন বহির নং-১ পৃষ্ঠায় মন্তব্য লিপিবদ্ধ করিয়াছি। ইহা আপনার পরবর্তী সদয় কার্যক্রমের জন্য নিম্নোক্ত ছকে দাখিল করা হইল।',
  officerName: 'মোঃ মেহেদী হাসান',
  officerDesignation: 'উপজেলা খাদ্য নিয়ন্ত্রক',
  signOfficeLocation: 'উজিরপুর, বরিশাল।',
  signatureImageUrl: '/default-signature.png',
  copyTitle: 'অনুলিপিঃ',
  copyList:
    '১। ভারপ্রাপ্ত কর্মকর্তা, শিকারপুর এলএসডি, উজিরপুর, বরিশাল।\n২। অফিস কপি।',
  footerDesignation: 'উপজেলা খাদ্য নিয়ন্ত্রক',
  footerLocation: 'উজিরপুর, বরিশাল',
};

export interface GoogleSheetsConfig {
  enabled: boolean;
  mainSpreadsheetId: string;
  mainSpreadsheetName: string;
  externalDoSpreadsheetId: string;
  externalDoSpreadsheetName: string;
  externalDoSheetName: string;
  cutoffDate: string;
  excludeDoNos: string[];
  bagKg: number;
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface SheetWriteConfirmRequest {
  title: string;
  description: string;
  spreadsheetName: string;
  targetSheets: string[];
  details: string[];
  isDestructive?: boolean;
  confirmLabel?: string;
}
