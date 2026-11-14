import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FolderGit2,
  ImagePlus,
  PenTool,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  CATEGORIES,
  REPORT_TEMPLATE_CATALOG,
  type AllocationCategory,
  type AllocationDatabase,
  type AllocationSheetsConfig,
  type ChairmanEntry,
  type FireServiceEntry,
  type FoodDealer,
  type OMSDealer,
  type OfficerProfileSettings,
  type RegisterId,
  type ReportTemplateConfig,
  type ReportTemplateId,
} from '../types/allocation';
import type { DriveSpreadsheetFile } from '../types/grain';
import { buildRegisterData } from '../shared/allocReportEngine';
import { DEFAULT_ANDROID_CONFIG } from '../shared/androidConfig';
import {
  GOOGLE_AUTH_PROJECT_ID,
  LIVE_PWA_APP_URL,
  getApiBaseOrigin,
  hasOpenExternalBrowserBridge,
  isAndroidWebViewOrigin,
  isInEmbeddedIframe,
  openExternalBrowserIfAndroid,
} from '../shared/googleAuth';
import { triggerBlobDownload } from '../shared/downloadUtils';
import { extractSpreadsheetId } from '../shared/googleSheetsSync';
import { formatBnInt, formatBnMoney, formatBnQty, parseNum, toBnDigits } from '../shared/bnUtils';
import type { ActionResult } from '../store/useAllocationStore';
import { GoogleSignInButton } from './GoogleSignInButton';
import { SourceCodeCopyModal } from './SourceCodeCopyModal';

export type SettingsTabKey = 'sheets' | 'templates' | 'officer' | 'master' | 'android';

interface AllocationSettingsViewProps {
  db: AllocationDatabase;
  sheetsConfig: AllocationSheetsConfig;
  activeTab: SettingsTabKey;
  selectedTemplateId: ReportTemplateId;
  focusedTemplateOnly?: boolean;
  onBackFromFocusedTemplate?: () => void;
  onChangeTab: (tab: SettingsTabKey) => void;
  onSelectTemplateId: (id: ReportTemplateId) => void;
  googleUser: User | null;
  hasGoogleToken: boolean;
  isGoogleSigningIn: boolean;
  googleAuthError: string | null;
  isSyncingSheets: boolean;
  driveFiles?: DriveSpreadsheetFile[];
  onGoogleSignIn: () => Promise<ActionResult>;
  onGoogleSignOut: () => Promise<void>;
  onAutoDetectDrive?: () => Promise<ActionResult>;
  onSyncFromSheet: (idOrUrl?: string, challanIdOrUrl?: string, challanGasUrl?: string) => Promise<ActionResult>;
  onPushToSheet: () => Promise<ActionResult>;
  onUpdateSheetsConfig: (patch: Partial<AllocationSheetsConfig>) => void;
  onUpdateOfficer: (patch: Partial<OfficerProfileSettings>) => void;
  onUpdateTemplate: (id: ReportTemplateId, patch: Partial<ReportTemplateConfig>) => void;
  onResetTemplate: (id: ReportTemplateId) => void;
  onSaveFoodDealer: (d: Omit<FoodDealer, 'id'>, existingId?: string) => void;
  onDeleteFoodDealer: (id: string) => void;
  onSaveOMSDealer: (d: Omit<OMSDealer, 'id'>, existingId?: string) => void;
  onDeleteOMSDealer: (id: string) => void;
  onSaveChairman: (c: Omit<ChairmanEntry, 'id'>, existingId?: string) => void;
  onDeleteChairman: (id: string) => void;
  onSaveFireService: (f: Omit<FireServiceEntry, 'id'>, existingId?: string) => void;
  onDeleteFireService: (id: string) => void;
  onSaveRate: (cat: AllocationCategory, unitPrice: number, taxRate: number) => void;
  onExportBackup: () => void;
  onImportBackup: (jsonText: string) => ActionResult;
  onClearLocalData: () => void;
}

const SHEET_TABS_REFERENCE = [
  'Ministry_Allocations',
  'DC_Allocations',
  'Dealer_Suballocation',
  'Projects',
  'UNO_Suballocations',
  'DO_Books',
  'DO_Issue',
  'Challan',
  'Food_Dealers',
  'OMS_Dealers',
  'Chairmen',
  'Fire_Service',
  'Category_Rates',
  'Alloc_Settings',
];

const REPORT_DEFAULT_COLUMNS: Record<string, Array<{ key: string; label: string }>> = {
  'monthly-dist': [
    { key: 'cat', label: 'খাতের নাম' },
    { key: 'pr', label: 'পূর্ববর্তী (চাল)' },
    { key: 'pw', label: 'পূর্ববর্তী (গম)' },
    { key: 'pa', label: 'পূর্ববর্তী (আটা)' },
    { key: 'cr', label: 'বর্তমান মাস (চাল)' },
    { key: 'cw', label: 'বর্তমান মাস (গম)' },
    { key: 'ca', label: 'বর্তমান মাস (আটা)' },
    { key: 'tr', label: 'মোট (চাল)' },
    { key: 'tw', label: 'মোট (গম)' },
    { key: 'ta', label: 'মোট (আটা)' },
  ],
  'monthly-cash': [
    { key: 'monthName', label: 'মাসের নাম' },
    { key: 'channel', label: 'চ্যানেলের নাম' },
    { key: 'product', label: 'পণ্য' },
    { key: 'qty', label: 'সরবরাহকৃত পরিমাণ' },
    { key: 'rate', label: 'দর' },
    { key: 'challan', label: 'চালান নং / তারিখ' },
    { key: 'amount', label: 'জমাকৃত টাকার পরিমাণ' },
  ],
  'monthly-ep': [
    { key: 'inst', label: 'বিশেষ জরুরী গ্রাহক (ইপি)' },
    { key: 'cr', label: 'চলতি (চাল)' },
    { key: 'cw', label: 'চলতি (গম)' },
    { key: 'tr', label: 'মোট (চাল)' },
    { key: 'tw', label: 'মোট (গম)' },
  ],
  'alloc-food': [
    { key: 'union', label: 'ইউনিয়ন' },
    { key: 'serial', label: 'ক্রমিক' },
    { key: 'center', label: 'বিক্রয় কেন্দ্র' },
    { key: 'dealer', label: 'ডিলারের নাম' },
    { key: 'mobile', label: 'মোবাইল' },
    { key: 'cards', label: 'কার্ড' },
    { key: 'qty', label: 'পরিমাণ' },
    { key: 'amount', label: 'টাকা' },
    { key: 'tax', label: 'আয়কর' },
  ],
  'do-reg-book': [
    { key: 'bookNo', label: 'বই নং' },
    { key: 'startPage', label: 'শুরু পাতা' },
    { key: 'endPage', label: 'শেষ পাতা' },
    { key: 'total', label: 'মোট ডিও' },
    { key: 'used', label: 'ব্যবহৃত ডিও' },
  ],
  'do-reg-issue': [
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
  ],
  'do-reg-unused': [
    { key: 'bookNo', label: 'বই নং' },
    { key: 'doNo', label: 'ডিও নং' },
    { key: 'startPage', label: 'শুরু পাতা' },
    { key: 'endPage', label: 'শেষ পাতা' },
  ],
  'dlr-rep-food': [
    { key: 'unionName', label: 'ইউনিয়ন' },
    { key: 'dealerName', label: 'ডিলারের নাম' },
    { key: 'fatherName', label: 'পিতার নাম' },
    { key: 'nid', label: 'এনআইডি' },
    { key: 'mobile', label: 'মোবাইল' },
    { key: 'salesCenter', label: 'বিক্রয় কেন্দ্র' },
    { key: 'cardCount', label: 'কার্ড সংখ্যা' },
    { key: 'totalQty', label: 'চাল (মে.টন)' },
    { key: 'poNo', label: 'পে-অর্ডার নং' },
    { key: 'bankName', label: 'ব্যাংকের নাম' },
    { key: 'supervisorName', label: 'তদারকি কর্মকর্তা' },
  ],
  'dlr-rep-oms': [
    { key: 'areaType', label: 'এলাকার ধরন' },
    { key: 'unionName', label: 'ইউনিয়ন' },
    { key: 'municipality', label: 'পৌরসভা' },
    { key: 'dealerName', label: 'ডিলারের নাম' },
    { key: 'fatherName', label: 'পিতার নাম' },
    { key: 'nid', label: 'এনআইডি' },
    { key: 'mobile', label: 'মোবাইল' },
    { key: 'salesCenter', label: 'বিক্রয় কেন্দ্র' },
    { key: 'poNo', label: 'পে-অর্ডার নং' },
    { key: 'bankName', label: 'ব্যাংকের নাম' },
    { key: 'amount', label: 'জামানত টাকা' },
    { key: 'supervisorName', label: 'তদারকি কর্মকর্তা' },
  ],
};

export const AllocationSettingsView: React.FC<AllocationSettingsViewProps> = ({
  db,
  sheetsConfig,
  activeTab,
  selectedTemplateId,
  focusedTemplateOnly = false,
  onBackFromFocusedTemplate,
  onChangeTab,
  onSelectTemplateId,
  googleUser,
  hasGoogleToken,
  isGoogleSigningIn,
  googleAuthError,
  isSyncingSheets,
  driveFiles = [],
  onGoogleSignIn,
  onGoogleSignOut,
  onAutoDetectDrive,
  onSyncFromSheet,
  onPushToSheet,
  onUpdateSheetsConfig,
  onUpdateOfficer,
  onUpdateTemplate,
  onResetTemplate,
  onSaveFoodDealer,
  onDeleteFoodDealer,
  onSaveOMSDealer,
  onDeleteOMSDealer,
  onSaveChairman,
  onDeleteChairman,
  onSaveFireService,
  onDeleteFireService,
  onSaveRate,
  onExportBackup,
  onImportBackup,
  onClearLocalData,
}) => {
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);
  const [sheetInput, setSheetInput] = useState(sheetsConfig.spreadsheetId || '');
  const [challanSheetInput, setChallanSheetInput] = useState(
    sheetsConfig.challanSpreadsheetId || ''
  );
  const [challanUrlInput, setChallanUrlInput] = useState(
    sheetsConfig.challanAppsScriptUrl || ''
  );
  const backupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSheetInput(sheetsConfig.spreadsheetId || '');
    setChallanSheetInput(sheetsConfig.challanSpreadsheetId || '');
    setChallanUrlInput(sheetsConfig.challanAppsScriptUrl || '');
  }, [
    sheetsConfig.spreadsheetId,
    sheetsConfig.challanSpreadsheetId,
    sheetsConfig.challanAppsScriptUrl,
  ]);

  // Signature Editor State
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showSigDrawPad, setShowSigDrawPad] = useState(false);
  const [sigTransparentBg, setSigTransparentBg] = useState(true);
  const [sigIsDrawing, setSigIsDrawing] = useState(false);

  // Master sub-tab & quick add forms
  const [masterTab, setMasterTab] = useState<'food' | 'oms' | 'chairmen' | 'fire' | 'rates'>('food');
  const [newFood, setNewFood] = useState({
    dealerName: '',
    fatherName: '',
    nid: '',
    mobile: '',
    unionName: db.officer.unions[0] || '',
    salesCenter: '',
    cardCount: '300',
    bankName: 'সোনালী ব্যাংক পিএলসি',
    poNo: '',
    supervisorName: '',
  });
  const [newOms, setNewOms] = useState({
    dealerName: '',
    mobile: '',
    areaType: 'পৌরসভা' as 'ইউনিয়ন' | 'পৌরসভা',
    unionName: '',
    municipality: 'উজিরপুর পৌরসভা',
    salesCenter: '',
    bankName: 'সোনালী ব্যাংক পিএলসি',
  });
  const [newChairman, setNewChairman] = useState({
    unionName: db.officer.unions[0] || '',
    chairmanName: '',
    mobile: '',
    supervisorName: '',
    supervisorMobile: '',
  });
  const [newFire, setNewFire] = useState({
    officeName: '',
    divisionName: 'বরিশাল',
    riceRate: '2000',
    wheatRate: '1800',
  });
  const [rateEdits, setRateEdits] = useState<Record<string, { unitPrice: string; taxRate: string }>>({});

  // Android APK Builder state
  const [apkAppName, setApkAppName] = useState(DEFAULT_ANDROID_CONFIG.appName);
  const [apkPackage, setApkPackage] = useState(DEFAULT_ANDROID_CONFIG.packageName);
  const [apkDownloading, setApkDownloading] = useState(false);
  const [sourceZipDownloading, setSourceZipDownloading] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [zipDownloadStatus, setZipDownloadStatus] = useState<{
    ok: boolean;
    text: string;
    directUrl?: string;
    fileName?: string;
  } | null>(null);

  const activeTemplate = db.templates[selectedTemplateId];

  const availableColumnsForTemplate = useMemo(() => {
    const item = REPORT_TEMPLATE_CATALOG.find((x) => x.id === selectedTemplateId);
    if (!item) return [];
    if (item.kind === 'register') {
      const built = buildRegisterData(selectedTemplateId as RegisterId, db, '', '');
      return built.leaves.map((l) => ({ key: l.key, label: l.label }));
    }
    return REPORT_DEFAULT_COLUMNS[selectedTemplateId] || [];
  }, [selectedTemplateId, db]);

  const showRes = (res: ActionResult) => {
    setFeedback({
      ok: res.ok,
      text: res.ok ? res.message || 'সম্পন্ন হয়েছে।' : res.error || 'ব্যর্থ হয়েছে।',
    });
  };

  // Signature white background cleaner & cropper
  const trimAndExportSignature = (
    sourceCanvas: HTMLCanvasElement,
    removeWhiteBg: boolean
  ): string | null => {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    if (!w || !h) return null;
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const ctx = work.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(sourceCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        let a = data[idx + 3];
        if (removeWhiteBg && a > 0) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          if (lum > 225 && sat < 36) a = 0;
          else if (lum > 180 && sat < 45) a = Math.round(a * Math.max(0, Math.min(1, (225 - lum) / 45)));
          if (a > 12) {
            data[idx] = Math.max(0, Math.round(r * 0.72));
            data[idx + 1] = Math.max(0, Math.round(g * 0.72));
            data[idx + 2] = Math.max(0, Math.round(b * 0.75));
          }
          data[idx + 3] = a;
        }
        if (a > 16) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    if (maxX < minX || maxY < minY) return null;

    const pad = 10;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);
    const maxW = 640;
    const scale = sw > maxW ? maxW / sw : 1;

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    const oCtx = out.getContext('2d');
    if (!oCtx) return null;
    oCtx.drawImage(work, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };

  const handleSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > 960 ? 960 / img.width : 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const png = trimAndExportSignature(c, sigTransparentBg);
        if (!png) {
          setFeedback({ ok: false, text: 'ছবিতে স্পষ্ট স্বাক্ষর পাওয়া যায়নি।' });
          return;
        }
        onUpdateOfficer({ signatureImageUrl: png });
        setFeedback({ ok: true, text: 'নতুন স্বাক্ষর সেট করা হয়েছে। সকল রিপোর্ট ও রেজিস্টারে স্বয়ংক্রিয়ভাবে বসবে।' });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const getPt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sigCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * c.width) / rect.width,
      y: ((e.clientY - rect.top) * c.height) / rect.height,
    };
  };

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    showRes(onImportBackup(text));
  };

  const apiBaseOrigin = getApiBaseOrigin();

  const handleDownloadAndroidZip = async () => {
    setApkDownloading(true);
    setFeedback(null);
    setZipDownloadStatus(null);
    try {
      const payload = {
        ...DEFAULT_ANDROID_CONFIG,
        appName: apkAppName.trim() || DEFAULT_ANDROID_CONFIG.appName,
        packageName: apkPackage.trim() || DEFAULT_ANDROID_CONFIG.packageName,
        targetUrl: isAndroidWebViewOrigin() ? LIVE_PWA_APP_URL : window.location.origin,
        webSeed: { db, sheetsConfig },
      };
      const res = await fetch(`${apiBaseOrigin}/api/build-android-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errMsg = 'Android APK প্রজেক্ট তৈরি করা যায়নি।';
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) errMsg = data.error;
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('ফাইলটি খালি পাওয়া গেছে।');
      const fileName = 'khaddo-boraddo-android-apk.zip';
      triggerBlobDownload(blob, fileName);
      const fallbackUrl = URL.createObjectURL(blob);
      window.setTimeout(() => URL.revokeObjectURL(fallbackUrl), 120000);
      const okMsg = 'সম্পূর্ণ Android APK ও GitHub Actions প্রজেক্ট ZIP ডাউনলোড শুরু হয়েছে!';
      setZipDownloadStatus({ ok: true, text: okMsg, directUrl: fallbackUrl, fileName });
      setFeedback({ ok: true, text: okMsg });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'ডাউনলোড ব্যর্থ।';
      setZipDownloadStatus({ ok: false, text: errMsg });
      setFeedback({ ok: false, text: errMsg });
    } finally {
      setApkDownloading(false);
    }
  };

  const handleDownloadSourceZip = async () => {
    setSourceZipDownloading(true);
    setFeedback(null);
    setZipDownloadStatus(null);
    const directServerUrl = `${apiBaseOrigin}/api/download-source-zip`;
    const fileName = 'khaddo-boraddo-source-code.zip';
    try {
      const res = await fetch(directServerUrl);
      if (!res.ok) {
        let errMsg = 'সোর্স কোড ZIP ডাউনলোড ব্যর্থ।';
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) errMsg = data.error;
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('ফাইলটি খালি পাওয়া গেছে।');
      triggerBlobDownload(blob, fileName);
      const okMsg = 'সম্পূর্ণ ওয়েব ও অ্যান্ড্রয়েড সোর্স কোড ZIP ডাউনলোড শুরু হয়েছে!';
      setZipDownloadStatus({ ok: true, text: okMsg, directUrl: directServerUrl, fileName });
      setFeedback({ ok: true, text: okMsg });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'ডাউনলোড ব্যর্থ।';
      setZipDownloadStatus({ ok: false, text: errMsg, directUrl: directServerUrl, fileName });
      setFeedback({ ok: false, text: errMsg });
    } finally {
      setSourceZipDownloading(false);
    }
  };

  return (
    <div className="space-y-4 font-nikosh">
      {/* Settings Navigation Tabs (hidden when editing a single open Report/Register) */}
      {!focusedTemplateOnly && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'sheets', label: 'Google Sheet ও ব্যাকআপ', icon: FileSpreadsheet },
              { key: 'templates', label: 'রিপোর্ট ও রেজিস্টার টেমপ্লেট (২৪টি)', icon: Sliders },
              { key: 'officer', label: 'কর্মকর্তা ও স্বাক্ষর', icon: PenTool },
              { key: 'master', label: 'মাস্টার তালিকা ও দর', icon: Users },
              { key: 'android', label: 'অ্যান্ড্রয়েড APK ও সোর্স', icon: FolderGit2 },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChangeTab(t.key)}
                className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold border cursor-pointer ${
                  active
                    ? 'bg-[#E2136E] text-white border-[#E2136E]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

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

      {/* TAB 1: GOOGLE SHEET SYNC & BACKUP */}
      {activeTab === 'sheets' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Google Sheet ID কপি-পেস্ট ও সরাসরি সিঙ্ক
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  আপনার Google Sheet খুলে লিংক বা Sheet ID এখানে পেস্ট করুন। পাবলিক («Anyone with the link») শিটে কোনো লগইন ছাড়াই সিঙ্ক হবে; আর প্রাইভেট শিটে পড়া ও লেখার (Writeback) জন্য Google Sign-In ব্যবহার করুন।
                </p>
              </div>
              {(!isAndroidWebViewOrigin() || hasOpenExternalBrowserBridge() || hasGoogleToken) && (
                <GoogleSignInButton
                  user={googleUser}
                  hasToken={hasGoogleToken}
                  isSigningIn={isGoogleSigningIn}
                  onSignIn={async () => {
                    const r = await onGoogleSignIn();
                    showRes(r);
                    return r;
                  }}
                  onSignOut={() => void onGoogleSignOut()}
                  label="গুগল দিয়ে লগইন করুন"
                />
              )}
            </div>

            {googleAuthError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                <div className="font-bold">{googleAuthError}</div>
                <div className="text-[11px] mt-0.5">
                  Google Cloud ({GOOGLE_AUTH_PROJECT_ID || 'Project'}) → OAuth Consent Screen → Test users-এ ব্যবহারকারীর জিমেইল যুক্ত করুন।
                </div>
                {isInEmbeddedIframe() && typeof window !== 'undefined' && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 font-bold underline"
                  >
                    <ExternalLink className="h-3 w-3" /> নতুন ট্যাবে খুলে লগইন করুন
                  </a>
                )}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const parsed = extractSpreadsheetId(sheetInput);
                const parsedChallan = extractSpreadsheetId(challanSheetInput);
                const parsedChallanUrl = challanUrlInput.trim();
                onUpdateSheetsConfig({
                  spreadsheetId: parsed,
                  challanSpreadsheetId: parsedChallan,
                  challanAppsScriptUrl: parsedChallanUrl,
                  enabled: Boolean(parsed || parsedChallan || parsedChallanUrl),
                });
                const r = await onSyncFromSheet(parsed, parsedChallan, parsedChallanUrl);
                showRes(r);
              }}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ১. মূল বরাদ্দ Google Sheet লিংক অথবা Sheet ID:
                </label>
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1ABC.../edit অথবা সরাসরি 1ABC... আইডি দিন"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                {sheetsConfig.spreadsheetName && (
                  <div className="text-[11px] font-semibold text-[#E2136E] mt-1">
                    সংযুক্ত মূল শিট: {sheetsConfig.spreadsheetName}
                  </div>
                )}
              </div>

              {driveFiles.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Google Drive-এ প্রাপ্ত শিট থেকে বাছাই করুন:
                  </label>
                  <select
                    value={extractSpreadsheetId(sheetInput)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      setSheetInput(val);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="">-- Drive শিট নির্বাচন করুন --</option>
                    {driveFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ২. চালান গুগল শিট লিংক অথবা Sheet ID (অন্য শিট থেকে চালানের তথ্য আনতে):
                </label>
                <input
                  type="text"
                  value={challanSheetInput}
                  onChange={(e) => setChallanSheetInput(e.target.value)}
                  placeholder="চালান শিটের লিংক বা ID দিন (ঐচ্ছিক)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  বর্তমান চালান সংখ্যা: {formatBnInt(db.challans.length)}টি
                  {sheetsConfig.challanSpreadsheetName ? ` · উৎস: ${sheetsConfig.challanSpreadsheetName}` : ''}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ৩. চালান Apps Script Web App URL (ঐচ্ছিক — চালান শিট ID না থাকলে):
                </label>
                <input
                  type="url"
                  value={challanUrlInput}
                  onChange={(e) => setChallanUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={isSyncingSheets}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-50 px-4 py-2 text-xs font-bold text-white cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSheets ? 'সিঙ্ক হচ্ছে...' : 'লিংক সেভ ও শিট থেকে ডেটা আনুন'}</span>
                </button>

                {hasGoogleToken && onAutoDetectDrive && (
                  <button
                    type="button"
                    disabled={isSyncingSheets}
                    onClick={async () => {
                      const r = await onAutoDetectDrive();
                      showRes(r);
                    }}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-[#E2136E] cursor-pointer"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Google Drive থেকে শিট খুঁজুন</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSyncingSheets || !hasGoogleToken || !sheetInput.trim()}
                  onClick={async () => {
                    const r = await onPushToSheet();
                    showRes(r);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-4 py-2 text-xs font-bold text-slate-900 cursor-pointer"
                >
                  <CloudUpload className="h-3.5 w-3.5 text-[#E2136E]" />
                  <span>অ্যাপের সকল ডেটা Google Sheet-এ সেভ (Push)</span>
                </button>
              </div>

              {sheetsConfig.lastSyncMessage && (
                <div
                  className={`text-xs font-semibold rounded-lg border px-3 py-2 ${
                    sheetsConfig.lastSyncStatus === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  অবস্থা: {sheetsConfig.lastSyncMessage}
                </div>
              )}
            </form>

            {/* Synced Records Live Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              {[
                { label: 'মন্ত্রণালয় বরাদ্দ', val: db.ministryAllocations.length },
                { label: 'ডিলার ও ইউএনও উপবরাদ্দ', val: db.dealerSuballocations.length + db.unoSuballocations.length },
                { label: 'ডিও ইস্যু', val: db.doIssues.length },
                { label: 'ট্রেজারি চালান', val: db.challans.length },
                { label: 'খাদ্য বান্ধব ডিলার', val: db.foodDealers.length },
                { label: 'ওএমএস ডিলার', val: db.omsDealers.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-center"
                >
                  <div className="text-[11px] text-slate-600">{stat.label}</div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatBnInt(stat.val)}টি
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-2">
              <div className="font-bold text-slate-900">
                Google Sheet-এর প্রত্যাশিত ট্যাব নামসমূহ ({toBnDigits(SHEET_TABS_REFERENCE.length)}টি):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SHEET_TABS_REFERENCE.map((tab) => (
                  <code
                    key={tab}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-800"
                  >
                    {tab}
                  </code>
                ))}
              </div>
            </div>
          </div>

          {/* Local JSON Backup & Restore */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-sm font-bold text-slate-900">লোকাল ব্যাকআপ ও রিস্টোর (JSON)</div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onExportBackup}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#E2136E]" />
                <span>JSON ব্যাকআপ ডাউনলোড</span>
              </button>

              <button
                type="button"
                onClick={() => backupFileRef.current?.click()}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 text-[#E2136E]" />
                <span>JSON ব্যাকআপ রিস্টোর</span>
              </button>
              <input
                ref={backupFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleBackupImport(e)}
              />

              {!confirmClearLocal ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearLocal(true)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3.5 py-2 text-xs font-bold text-rose-900 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>লোকাল ক্যাশ মুছুন (খালি ডেটাবেস)</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs">
                  <span className="font-bold text-rose-900">সব লোকাল ডেটা মুছতে নিশ্চিত?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearLocalData();
                      setConfirmClearLocal(false);
                      setFeedback({ ok: true, text: 'লোকাল ক্যাশ ও নমুনা ডেটা সম্পূর্ণ মুছে ফেলা হয়েছে।' });
                    }}
                    className="rounded bg-rose-700 hover:bg-rose-800 px-2.5 py-1 text-white font-bold cursor-pointer"
                  >
                    হ্যাঁ, মুছুন
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearLocal(false)}
                    className="rounded border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-slate-700 font-bold cursor-pointer"
                  >
                    বাতিল
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PER-REPORT / PER-REGISTER TEMPLATE EDITOR */}
      {(activeTab === 'templates' || focusedTemplateOnly) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {!focusedTemplateOnly && (
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-3 space-y-2 max-h-[780px] overflow-y-auto">
              <div className="text-xs font-bold text-slate-900 px-1 pb-1 border-b border-slate-100">
                রিপোর্ট বা রেজিস্টার বাছাই করুন ({toBnDigits(REPORT_TEMPLATE_CATALOG.length)}টি)
              </div>
              {REPORT_TEMPLATE_CATALOG.map((item) => {
                const active = item.id === selectedTemplateId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTemplateId(item.id)}
                    className={`w-full text-left rounded-xl px-3 py-2 text-xs font-bold border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-[#E2136E] text-white border-[#E2136E]'
                        : 'bg-slate-50/70 text-slate-800 border-slate-200 hover:bg-rose-50/50'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className={`text-[10px] shrink-0 ${active ? 'text-rose-100' : 'text-slate-500'}`}>
                      {item.kind === 'register' ? 'রেজিস্টার' : 'রিপোর্ট'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            className={`${
              focusedTemplateOnly ? 'lg:col-span-12' : 'lg:col-span-8'
            } rounded-2xl border border-slate-200 bg-white p-4 space-y-4`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                {focusedTemplateOnly && onBackFromFocusedTemplate && (
                  <button
                    type="button"
                    onClick={onBackFromFocusedTemplate}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4 text-[#E2136E]" />
                    <span>ফিরে যান</span>
                  </button>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    টেমপ্লেট সম্পাদনা: {activeTemplate.label}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    প্রতিটি পরিবর্তন সাথে সাথে সংরক্ষিত হয় এবং পিডিএফ/প্রিন্টে কার্যকর হয়। {`{মাস}`} ও {`{বছর}`} ব্যবহার করা যাবে।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResetTemplate(selectedTemplateId);
                  setFeedback({ ok: true, text: `${activeTemplate.label} ডিফল্ট টেমপ্লেটে রিসেট হয়েছে।` });
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>ডিফল্ট রিসেট</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">সরকারি শিরোনাম</label>
                <input
                  type="text"
                  value={activeTemplate.govLine}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { govLine: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">অফিস লাইন ১</label>
                <input
                  type="text"
                  value={activeTemplate.office1}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { office1: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">অফিস লাইন ২</label>
                <input
                  type="text"
                  value={activeTemplate.office2}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { office2: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">রিপোর্ট শিরোনাম</label>
                <input
                  type="text"
                  value={activeTemplate.reportTitle}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { reportTitle: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">বিষয় (Subject)</label>
                <input
                  type="text"
                  value={activeTemplate.subject}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { subject: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">স্মারক উপসর্গ</label>
                <input
                  type="text"
                  value={activeTemplate.memoPrefix}
                  onChange={(e) => onUpdateTemplate(selectedTemplateId, { memoPrefix: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">প্রাপক (প্রতি লাইন আলাদা)</label>
                <textarea
                  rows={3}
                  value={activeTemplate.recipientLines}
                  onChange={(e) =>
                    onUpdateTemplate(selectedTemplateId, { recipientLines: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">সূচনা বক্তব্য (Intro Text)</label>
                <textarea
                  rows={3}
                  value={activeTemplate.introText}
                  onChange={(e) =>
                    onUpdateTemplate(selectedTemplateId, { introText: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">মূল ছকের নিচের স্বাক্ষর ব্লক</label>
                <textarea
                  rows={3}
                  value={activeTemplate.signLines}
                  onChange={(e) =>
                    onUpdateTemplate(selectedTemplateId, { signLines: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
            </div>

            {/* Copy (অনুলিপি) & Memo Layout Controls */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900">অনুলিপি ও স্মারক বিন্যাস</div>
                <div className="text-[11px] text-slate-600">
                  ক্রম: মূল ছকের নিচে স্বাক্ষর → অনুলিপির উপরে স্মারক → অনুলিপি তালিকা → নিচে কর্মকর্তা, পদবি ও স্থান
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(activeTemplate.showCopyBlock)}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { showCopyBlock: e.target.checked })
                    }
                  />
                  <span>অনুলিপি প্রদর্শন চালু (টিক দিলে রিপোর্টে অনুলিপি আসবে)</span>
                </label>

                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeTemplate.showCopyMemo !== false}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { showCopyMemo: e.target.checked })
                    }
                  />
                  <span>অনুলিপির উপরে স্মারক ও তারিখ দেখান</span>
                </label>

                <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeTemplate.showCopySignature !== false}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { showCopySignature: e.target.checked })
                    }
                  />
                  <span>অনুলিপির নিচে কর্মকর্তা, পদবি ও স্থানের নাম দেখান</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    অনুলিপির উপরে স্মারক (এডিটযোগ্য — {'{স্মারক}'} লিখলে মূল স্মারক বসবে)
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.copyMemoText ?? ''}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { copyMemoText: e.target.value })
                    }
                    placeholder="স্মারক নংঃ {স্মারক}"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">অনুলিপি শিরোনাম</label>
                  <input
                    type="text"
                    value={activeTemplate.copyTitle}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { copyTitle: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">অনুলিপি তালিকা (প্রতি লাইন আলাদা)</label>
                  <textarea
                    rows={4}
                    value={activeTemplate.copyList}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { copyList: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    অনুলিপির নিচের স্বাক্ষর ব্লক (কর্মকর্তা, পদবি ও স্থানের নাম)
                  </label>
                  <textarea
                    rows={4}
                    value={activeTemplate.copySignLines ?? activeTemplate.signLines}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { copySignLines: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                </div>
              </div>
            </div>

            {/* Paper, Margins, Font & Signature Controls */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3 text-xs">
              <div className="font-bold text-slate-900">পৃষ্ঠা বিন্যাস, মার্জিন (মিমি) ও স্বাক্ষর নিয়ম</div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                <div className="col-span-2 sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">পৃষ্ঠা দিক (Orientation)</label>
                  <select
                    value={activeTemplate.orientation}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        orientation: e.target.value as 'landscape' | 'portrait',
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
                  >
                    <option value="landscape">আড়াআড়ি (A4 Landscape)</option>
                    <option value="portrait">লম্বালম্বি (A4 Portrait)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">উপর (মিমি)</label>
                  <input
                    type="number"
                    value={activeTemplate.marginTopMm}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        marginTopMm: Math.max(4, Math.min(30, Number(e.target.value) || 10)),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">নিচ (মিমি)</label>
                  <input
                    type="number"
                    value={activeTemplate.marginBottomMm}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        marginBottomMm: Math.max(4, Math.min(30, Number(e.target.value) || 10)),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">বাম (মিমি)</label>
                  <input
                    type="number"
                    value={activeTemplate.marginLeftMm}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        marginLeftMm: Math.max(4, Math.min(30, Number(e.target.value) || 10)),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ডান (মিমি)</label>
                  <input
                    type="number"
                    value={activeTemplate.marginRightMm}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        marginRightMm: Math.max(4, Math.min(30, Number(e.target.value) || 10)),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ফন্ট সাইজ (pt)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={activeTemplate.fontSizePt}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        fontSizePt: Math.max(7.5, Math.min(13, Number(e.target.value) || 9.5)),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    স্বাক্ষর উচ্চতা (px) — {activeTemplate.kind === 'register' ? 'রেজিস্টার' : 'রিপোর্ট'}
                  </label>
                  <input
                    type="number"
                    min={14}
                    max={90}
                    value={activeTemplate.signatureHeightPx}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        signatureHeightPx: Math.max(
                          14,
                          Math.min(90, Number(e.target.value) || (activeTemplate.kind === 'register' ? 26 : 38))
                        ),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                </div>
                <label className="inline-flex items-center gap-2 font-bold text-slate-800 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeTemplate.showSignature}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, { showSignature: e.target.checked })
                    }
                  />
                  <span>স্বাক্ষর প্রদর্শন চালু</span>
                </label>
              </div>

              {selectedTemplateId === 'reg-challan' && (
                <div className="pt-2 border-t border-slate-200">
                  <label className="block font-bold text-slate-800 mb-1">
                    চালান রেজিস্টার স্বাক্ষর নীতি:
                  </label>
                  <select
                    value={activeTemplate.challanSignRule}
                    onChange={(e) =>
                      onUpdateTemplate(selectedTemplateId, {
                        challanSignRule: e.target.value as 'excess_only' | 'excess_or_equal',
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold"
                  >
                    <option value="excess_or_equal">
                      জমাকৃত টাকা &gt;= রেকর্ড হলেই স্বাক্ষর বসবে; কম জমা গরমিল হলে খালি থাকবে (ডিফল্ট)
                    </option>
                    <option value="excess_only">
                      শুধু জমাকৃত টাকা &gt; রেকর্ড হলে স্বাক্ষর বসবে; সমান বা কম হলে স্বাক্ষর খালি থাকবে
                    </option>
                  </select>
                </div>
              )}
            </div>

            {/* Column Customization */}
            {availableColumnsForTemplate.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
                <div className="font-bold text-slate-900">কলামের নাম পরিবর্তন ও দৃশ্যমানতা</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableColumnsForTemplate.map((col) => {
                    const isHidden = activeTemplate.hiddenColumns.includes(col.key);
                    return (
                      <div key={col.key} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={(e) => {
                            const nextHidden = e.target.checked
                              ? activeTemplate.hiddenColumns.filter((k) => k !== col.key)
                              : [...activeTemplate.hiddenColumns, col.key];
                            onUpdateTemplate(selectedTemplateId, { hiddenColumns: nextHidden });
                          }}
                          title="দেখান / লুকান"
                        />
                        <input
                          type="text"
                          value={activeTemplate.columnLabels[col.key] ?? col.label}
                          onChange={(e) =>
                            onUpdateTemplate(selectedTemplateId, {
                              columnLabels: {
                                ...activeTemplate.columnLabels,
                                [col.key]: e.target.value,
                              },
                            })
                          }
                          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: OFFICER PROFILE & DIGITAL SIGNATURE */}
      {activeTab === 'officer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900">কর্মকর্তা ও অফিস প্রোফাইল</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">সরকারি লাইন</label>
                <input
                  type="text"
                  value={db.officer.govLine}
                  onChange={(e) => onUpdateOfficer({ govLine: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">অফিস লাইন ১</label>
                <input
                  type="text"
                  value={db.officer.officeLine1}
                  onChange={(e) => onUpdateOfficer({ officeLine1: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">অফিস লাইন ২ (উপজেলা/জেলা)</label>
                <input
                  type="text"
                  value={db.officer.officeLine2}
                  onChange={(e) => onUpdateOfficer({ officeLine2: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">কর্মকর্তার নাম</label>
                <input
                  type="text"
                  value={db.officer.officerName}
                  onChange={(e) => onUpdateOfficer({ officerName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">পদবি</label>
                <input
                  type="text"
                  value={db.officer.officerDesignation}
                  onChange={(e) => onUpdateOfficer({ officerDesignation: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">কর্মস্থল</label>
                <input
                  type="text"
                  value={db.officer.officerPlace}
                  onChange={(e) => onUpdateOfficer({ officerPlace: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  প্রকল্প ও ইউএনও এন্ট্রি পাসওয়ার্ড / পিন (খালি রাখলে লক থাকবে না)
                </label>
                <input
                  type="text"
                  value={db.officer.lockPin || ''}
                  onChange={(e) => onUpdateOfficer({ lockPin: e.target.value })}
                  placeholder="যেমন: ১২৩৪ বা পছন্দমতো পাসওয়ার্ড লিখুন"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-bold"
                />
              </div>

              <div className="sm:col-span-2 rounded-xl border border-rose-200/80 bg-rose-50/40 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-slate-800">
                    অ্যাপের লেখা ও বাটনের সাইজ (ছোট / বড় করুন)
                  </label>
                  <span className="rounded-lg bg-white border border-rose-200 px-2.5 py-0.5 font-extrabold text-[#E2136E] tabular-nums">
                    {toBnDigits(db.officer.uiFontScale ?? 108)}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: 'ছোট', val: 92 },
                    { label: 'স্বাভাবিক', val: 100 },
                    { label: 'বড়', val: 108 },
                    { label: 'আরও বড়', val: 118 },
                    { label: 'অতি বড়', val: 128 },
                  ].map((opt) => {
                    const active = (db.officer.uiFontScale ?? 108) === opt.val;
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => onUpdateOfficer({ uiFontScale: opt.val })}
                        className={`min-h-[38px] rounded-xl px-3 py-1.5 font-bold border cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#E2136E] text-white border-[#E2136E]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50'
                        }`}
                      >
                        {opt.label} ({toBnDigits(opt.val)}%)
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={85}
                  max={135}
                  step={1}
                  value={db.officer.uiFontScale ?? 108}
                  onChange={(e) => onUpdateOfficer({ uiFontScale: Number(e.target.value) })}
                  className="w-full accent-[#E2136E] cursor-pointer"
                  aria-label="অ্যাপের সাইজ স্লাইডার"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                ইউনিয়নের ক্রমানুসার (কমা দিয়ে লিখুন — খাদ্য বান্ধব বরাদ্দাদেশে এই ক্রমে সাজানো হয়)
              </label>
              <textarea
                rows={2}
                value={db.officer.unions.join(', ')}
                onChange={(e) =>
                  onUpdateOfficer({
                    unions: e.target.value
                      .split(',')
                      .map((u) => u.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900">ডিজিটাল স্বাক্ষর সেটিংস</h3>
            <p className="text-[11px] text-slate-600">
              এখানে সংরক্ষিত স্বাক্ষর প্রতিটি রিপোর্টে কর্মকর্তার নামের উপরে এবং রেজিস্টার/ডিও/চালান নীতি অনুযায়ী সেলের ভিতরে বসবে।
            </p>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-col items-center justify-center min-h-[110px]">
              {db.officer.signatureImageUrl ? (
                <img
                  src={db.officer.signatureImageUrl}
                  alt="কর্মকর্তার স্বাক্ষর"
                  style={{
                    maxHeight: `${Math.max(18, Math.min(90, db.officer.reportSignatureHeightPx ?? 38))}px`,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <span className="text-slate-400">কোনো স্বাক্ষর সেট করা নেই</span>
              )}
              <div className="mt-2 pt-1.5 border-t border-slate-300 text-center font-bold text-slate-800">
                {db.officer.officerName}
              </div>
            </div>

            {/* Separate Signature Size Controls for Registers & Reports */}
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-3 space-y-3">
              <div className="font-bold text-slate-900">
                রেজিস্টার ও রিপোর্টের জন্য আলাদা স্বাক্ষরের সাইজ
              </div>

              {/* 1. Register Signature Size */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">রেজিস্টারের স্বাক্ষর সাইজ</span>
                  <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 font-extrabold text-[#E2136E] tabular-nums">
                    {toBnDigits(db.officer.registerSignatureHeightPx ?? 26)} px
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'ছোট', px: 18 },
                    { label: 'স্বাভাবিক', px: 26 },
                    { label: 'বড়', px: 36 },
                    { label: 'অতি বড়', px: 48 },
                  ].map((opt) => {
                    const cur = db.officer.registerSignatureHeightPx ?? 26;
                    const active = cur === opt.px;
                    return (
                      <button
                        key={`reg-sig-${opt.px}`}
                        type="button"
                        onClick={() => {
                          onUpdateOfficer({ registerSignatureHeightPx: opt.px });
                          for (const tpl of REPORT_TEMPLATE_CATALOG) {
                            if (tpl.kind === 'register') {
                              onUpdateTemplate(tpl.id, { signatureHeightPx: opt.px });
                            }
                          }
                        }}
                        className={`min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-bold border cursor-pointer ${
                          active
                            ? 'bg-[#E2136E] text-white border-[#E2136E]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
                      >
                        {opt.label} ({toBnDigits(opt.px)})
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={14}
                  max={60}
                  step={1}
                  value={db.officer.registerSignatureHeightPx ?? 26}
                  onChange={(e) => {
                    const px = Number(e.target.value);
                    onUpdateOfficer({ registerSignatureHeightPx: px });
                    for (const tpl of REPORT_TEMPLATE_CATALOG) {
                      if (tpl.kind === 'register') {
                        onUpdateTemplate(tpl.id, { signatureHeightPx: px });
                      }
                    }
                  }}
                  className="w-full accent-[#E2136E] cursor-pointer"
                  aria-label="রেজিস্টারের স্বাক্ষর সাইজ"
                />
              </div>

              {/* 2. Report Signature Size */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">রিপোর্টের স্বাক্ষর সাইজ</span>
                  <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 font-extrabold text-[#E2136E] tabular-nums">
                    {toBnDigits(db.officer.reportSignatureHeightPx ?? 38)} px
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'ছোট', px: 26 },
                    { label: 'স্বাভাবিক', px: 38 },
                    { label: 'বড়', px: 52 },
                    { label: 'অতি বড়', px: 68 },
                  ].map((opt) => {
                    const cur = db.officer.reportSignatureHeightPx ?? 38;
                    const active = cur === opt.px;
                    return (
                      <button
                        key={`rep-sig-${opt.px}`}
                        type="button"
                        onClick={() => {
                          onUpdateOfficer({ reportSignatureHeightPx: opt.px });
                          for (const tpl of REPORT_TEMPLATE_CATALOG) {
                            if (tpl.kind === 'report') {
                              onUpdateTemplate(tpl.id, { signatureHeightPx: opt.px });
                            }
                          }
                        }}
                        className={`min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-bold border cursor-pointer ${
                          active
                            ? 'bg-[#E2136E] text-white border-[#E2136E]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
                      >
                        {opt.label} ({toBnDigits(opt.px)})
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={18}
                  max={85}
                  step={1}
                  value={db.officer.reportSignatureHeightPx ?? 38}
                  onChange={(e) => {
                    const px = Number(e.target.value);
                    onUpdateOfficer({ reportSignatureHeightPx: px });
                    for (const tpl of REPORT_TEMPLATE_CATALOG) {
                      if (tpl.kind === 'report') {
                        onUpdateTemplate(tpl.id, { signatureHeightPx: px });
                      }
                    }
                  }}
                  className="w-full accent-[#E2136E] cursor-pointer"
                  aria-label="রিপোর্টের স্বাক্ষর সাইজ"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sigTransparentBg}
                onChange={(e) => setSigTransparentBg(e.target.checked)}
              />
              <span>আপলোডকৃত স্বাক্ষরের সাদা ব্যাকগ্রাউন্ড স্বয়ংক্রিয়ভাবে স্বচ্ছ (Transparent) করুন</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => sigFileInputRef.current?.click()}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3 py-1.5 font-bold text-white cursor-pointer"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>স্বাক্ষর ছবি আপলোড</span>
              </button>
              <input
                ref={sigFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSigUpload}
              />

              <button
                type="button"
                onClick={() => setShowSigDrawPad((v) => !v)}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 font-bold text-slate-800 cursor-pointer"
              >
                <PenTool className="h-3.5 w-3.5" />
                <span>হাতে স্বাক্ষর আঁকুন</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateOfficer({ signatureImageUrl: '/default-signature.png' });
                  setFeedback({ ok: true, text: 'ডিফল্ট সংযুক্ত স্বাক্ষর পুনরায় সেট করা হয়েছে।' });
                }}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 font-bold text-slate-800 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>ডিফল্ট স্বাক্ষর</span>
              </button>
            </div>

            {showSigDrawPad && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <canvas
                  ref={sigCanvasRef}
                  width={420}
                  height={150}
                  onPointerDown={(e) => {
                    const c = sigCanvasRef.current!;
                    const ctx = c.getContext('2d')!;
                    c.setPointerCapture(e.pointerId);
                    const p = getPt(e);
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + 0.01, p.y + 0.01);
                    ctx.stroke();
                    setSigIsDrawing(true);
                  }}
                  onPointerMove={(e) => {
                    if (!sigIsDrawing) return;
                    const c = sigCanvasRef.current!;
                    const ctx = c.getContext('2d')!;
                    const p = getPt(e);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                  }}
                  onPointerUp={() => setSigIsDrawing(false)}
                  className="w-full h-36 border border-slate-300 rounded-lg bg-white touch-none cursor-crosshair"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const c = sigCanvasRef.current!;
                      c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 cursor-pointer"
                  >
                    মুছুন
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const png = trimAndExportSignature(sigCanvasRef.current!, false);
                      if (!png) return;
                      onUpdateOfficer({ signatureImageUrl: png });
                      setShowSigDrawPad(false);
                      setFeedback({ ok: true, text: 'অঙ্কিত স্বাক্ষর সংরক্ষিত হয়েছে।' });
                    }}
                    className="rounded-lg bg-[#E2136E] hover:bg-[#B80D58] text-white px-4 py-1.5 font-bold cursor-pointer"
                  >
                    স্বাক্ষর সেভ করুন
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MASTER DATA & RATES */}
      {activeTab === 'master' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'food', label: `খাদ্য বান্ধব ডিলার (${formatBnInt(db.foodDealers.length)})` },
                { key: 'oms', label: `ওএমএস ডিলার (${formatBnInt(db.omsDealers.length)})` },
                { key: 'chairmen', label: `চেয়ারম্যান (${formatBnInt(db.chairmen.length)})` },
                { key: 'fire', label: `ফায়ার সার্ভিস (${formatBnInt(db.fireServices.length)})` },
                { key: 'rates', label: `খাতভিত্তিক দর ও আয়কর (${formatBnInt(db.rates.length)})` },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMasterTab(m.key)}
                className={`min-h-[40px] rounded-xl px-3 py-1.5 text-xs font-bold border cursor-pointer ${
                  masterTab === m.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {masterTab === 'food' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveFoodDealer({
                    ...newFood,
                    cardCount: parseNum(newFood.cardCount),
                    totalQty: 0,
                    poDate: '',
                    amount: 0,
                    supervisorDesignation: '',
                    supervisorMobile: '',
                  });
                  setNewFood((p) => ({ ...p, dealerName: '', salesCenter: '', mobile: '' }));
                }}
                className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200"
              >
                <input
                  required
                  value={newFood.dealerName}
                  onChange={(e) => setNewFood((p) => ({ ...p, dealerName: e.target.value }))}
                  placeholder="ডিলারের নাম *"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <select
                  required
                  value={newFood.unionName}
                  onChange={(e) => setNewFood((p) => ({ ...p, unionName: e.target.value }))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                >
                  <option value="">-- ইউনিয়ন বাছাই করুন --</option>
                  {Array.from(
                    new Set([...db.officer.unions, ...(newFood.unionName ? [newFood.unionName] : [])])
                  ).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  value={newFood.salesCenter}
                  onChange={(e) => setNewFood((p) => ({ ...p, salesCenter: e.target.value }))}
                  placeholder="বিক্রয় কেন্দ্র"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  value={newFood.mobile}
                  onChange={(e) => setNewFood((p) => ({ ...p, mobile: e.target.value }))}
                  placeholder="মোবাইল"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  type="number"
                  value={newFood.cardCount}
                  onChange={(e) => setNewFood((p) => ({ ...p, cardCount: e.target.value }))}
                  placeholder="কার্ড সংখ্যা"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded bg-[#E2136E] hover:bg-[#B80D58] text-white font-bold px-3 py-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> যোগ করুন
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3 text-left">ইউনিয়ন</th>
                      <th className="py-2 px-3 text-left">ডিলারের নাম ও কেন্দ্র</th>
                      <th className="py-2 px-3 text-center">মোবাইল</th>
                      <th className="py-2 px-3 text-center">কার্ড</th>
                      <th className="py-2 px-3 text-right">চাল (মে.টন)</th>
                      <th className="py-2 px-3 text-center">মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.foodDealers.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2 px-3">{d.unionName}</td>
                        <td className="py-2 px-3 font-bold">
                          {d.dealerName}{' '}
                          <span className="font-normal text-slate-500">({d.salesCenter})</span>
                        </td>
                        <td className="py-2 px-3 text-center">{toBnDigits(d.mobile)}</td>
                        <td className="py-2 px-3 text-center">{formatBnInt(d.cardCount)}</td>
                        <td className="py-2 px-3 text-right font-bold">{formatBnQty(d.totalQty)}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onDeleteFoodDealer(d.id)}
                            className="text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {masterTab === 'oms' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveOMSDealer({
                    ...newOms,
                    fatherName: '',
                    nid: '',
                    poNo: '',
                    poDate: '',
                    amount: 0,
                    supervisorName: '',
                    supervisorDesignation: '',
                    supervisorMobile: '',
                  });
                  setNewOms((p) => ({ ...p, dealerName: '', salesCenter: '', mobile: '' }));
                }}
                className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200"
              >
                <input
                  required
                  value={newOms.dealerName}
                  onChange={(e) => setNewOms((p) => ({ ...p, dealerName: e.target.value }))}
                  placeholder="ডিলারের নাম *"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <select
                  value={newOms.areaType}
                  onChange={(e) => {
                    const nextType = e.target.value as 'ইউনিয়ন' | 'পৌরসভা';
                    setNewOms((p) => ({
                      ...p,
                      areaType: nextType,
                      unionName:
                        nextType === 'ইউনিয়ন'
                          ? p.unionName || db.officer.unions[0] || ''
                          : p.unionName,
                    }));
                  }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                >
                  <option value="পৌরসভা">পৌরসভা</option>
                  <option value="ইউনিয়ন">ইউনিয়ন</option>
                </select>
                {newOms.areaType === 'ইউনিয়ন' ? (
                  <select
                    value={newOms.unionName}
                    onChange={(e) => setNewOms((p) => ({ ...p, unionName: e.target.value }))}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                  >
                    <option value="">-- ইউনিয়ন বাছাই করুন --</option>
                    {Array.from(
                      new Set([...db.officer.unions, ...(newOms.unionName ? [newOms.unionName] : [])])
                    ).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={newOms.municipality}
                    onChange={(e) => setNewOms((p) => ({ ...p, municipality: e.target.value }))}
                    placeholder="পৌরসভার নাম"
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                )}
                <input
                  value={newOms.salesCenter}
                  onChange={(e) => setNewOms((p) => ({ ...p, salesCenter: e.target.value }))}
                  placeholder="বিক্রয় কেন্দ্র"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  value={newOms.mobile}
                  onChange={(e) => setNewOms((p) => ({ ...p, mobile: e.target.value }))}
                  placeholder="মোবাইল"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded bg-[#E2136E] hover:bg-[#B80D58] text-white font-bold px-3 py-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> যোগ করুন
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3 text-left">এলাকা</th>
                      <th className="py-2 px-3 text-left">ডিলারের নাম</th>
                      <th className="py-2 px-3 text-left">বিক্রয় কেন্দ্র</th>
                      <th className="py-2 px-3 text-center">মোবাইল</th>
                      <th className="py-2 px-3 text-center">মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.omsDealers.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2 px-3">
                          {d.areaType} ({d.areaType === 'পৌরসভা' ? d.municipality : d.unionName})
                        </td>
                        <td className="py-2 px-3 font-bold">{d.dealerName}</td>
                        <td className="py-2 px-3">{d.salesCenter}</td>
                        <td className="py-2 px-3 text-center">{toBnDigits(d.mobile)}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onDeleteOMSDealer(d.id)}
                            className="text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {masterTab === 'chairmen' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveChairman(newChairman);
                  setNewChairman((p) => ({ ...p, chairmanName: '', mobile: '' }));
                }}
                className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200"
              >
                <select
                  required
                  value={newChairman.unionName}
                  onChange={(e) => setNewChairman((p) => ({ ...p, unionName: e.target.value }))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                >
                  <option value="">-- ইউনিয়ন বাছাই করুন --</option>
                  {Array.from(
                    new Set([
                      ...db.officer.unions,
                      ...(newChairman.unionName ? [newChairman.unionName] : []),
                    ])
                  ).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={newChairman.chairmanName}
                  onChange={(e) => setNewChairman((p) => ({ ...p, chairmanName: e.target.value }))}
                  placeholder="চেয়ারম্যানের নাম *"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  value={newChairman.mobile}
                  onChange={(e) => setNewChairman((p) => ({ ...p, mobile: e.target.value }))}
                  placeholder="মোবাইল"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  value={newChairman.supervisorName}
                  onChange={(e) => setNewChairman((p) => ({ ...p, supervisorName: e.target.value }))}
                  placeholder="তদারকি কর্মকর্তা"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded bg-[#E2136E] hover:bg-[#B80D58] text-white font-bold px-3 py-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> যোগ করুন
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3 text-left">ইউনিয়ন</th>
                      <th className="py-2 px-3 text-left">চেয়ারম্যান / প্রাপক</th>
                      <th className="py-2 px-3 text-center">মোবাইল</th>
                      <th className="py-2 px-3 text-left">তদারকি কর্মকর্তা</th>
                      <th className="py-2 px-3 text-center">মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.chairmen.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 px-3">{c.unionName}</td>
                        <td className="py-2 px-3 font-bold">{c.chairmanName}</td>
                        <td className="py-2 px-3 text-center">{toBnDigits(c.mobile)}</td>
                        <td className="py-2 px-3">{c.supervisorName}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onDeleteChairman(c.id)}
                            className="text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {masterTab === 'fire' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveFireService({
                    officeName: newFire.officeName,
                    divisionName: newFire.divisionName,
                    riceRate: parseNum(newFire.riceRate),
                    wheatRate: parseNum(newFire.wheatRate),
                  });
                  setNewFire((p) => ({ ...p, officeName: '' }));
                }}
                className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200"
              >
                <input
                  required
                  value={newFire.officeName}
                  onChange={(e) => setNewFire((p) => ({ ...p, officeName: e.target.value }))}
                  placeholder="ফায়ার সার্ভিস স্টেশন নাম *"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  value={newFire.divisionName}
                  onChange={(e) => setNewFire((p) => ({ ...p, divisionName: e.target.value }))}
                  placeholder="বিভাগ"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  type="number"
                  value={newFire.riceRate}
                  onChange={(e) => setNewFire((p) => ({ ...p, riceRate: e.target.value }))}
                  placeholder="চাল দর"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <input
                  type="number"
                  value={newFire.wheatRate}
                  onChange={(e) => setNewFire((p) => ({ ...p, wheatRate: e.target.value }))}
                  placeholder="গম দর"
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded bg-[#E2136E] hover:bg-[#B80D58] text-white font-bold px-3 py-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> যোগ করুন
                </button>
              </form>

              <table className="w-full border-collapse tabular-nums">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2 px-3 text-left">প্রতিষ্ঠান</th>
                    <th className="py-2 px-3 text-left">বিভাগ</th>
                    <th className="py-2 px-3 text-right">চাল দর (৳/মে.টন)</th>
                    <th className="py-2 px-3 text-right">গম দর (৳/মে.টন)</th>
                    <th className="py-2 px-3 text-center">মুছুন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.fireServices.map((f) => (
                    <tr key={f.id}>
                      <td className="py-2 px-3 font-bold">{f.officeName}</td>
                      <td className="py-2 px-3">{f.divisionName}</td>
                      <td className="py-2 px-3 text-right">{formatBnMoney(f.riceRate)}</td>
                      <td className="py-2 px-3 text-right">{formatBnMoney(f.wheatRate)}</td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteFireService(f.id)}
                          className="text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {masterTab === 'rates' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
              <div className="font-bold text-slate-900">খাতভিত্তিক একক মূল্য (৳/মে.টন) ও আয়কর (৳/মে.টন)</div>
              <table className="w-full border-collapse tabular-nums">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2 px-3 text-left">খাতের নাম</th>
                    <th className="py-2 px-3 text-right">একক মূল্য (৳/মে.টন)</th>
                    <th className="py-2 px-3 text-right">আয়কর (৳/মে.টন)</th>
                    <th className="py-2 px-3 text-center">সংরক্ষণ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATEGORIES.filter((c) => c.requiresChallan).map((meta) => {
                    const existing = db.rates.find((r) => r.category === meta.category);
                    const draft = rateEdits[meta.category] || {
                      unitPrice: String(existing?.unitPrice ?? 0),
                      taxRate: String(existing?.taxRate ?? 0),
                    };
                    return (
                      <tr key={meta.id}>
                        <td className="py-2 px-3 font-bold">{meta.category}</td>
                        <td className="py-1.5 px-3 text-right">
                          <input
                            type="number"
                            value={draft.unitPrice}
                            onChange={(e) =>
                              setRateEdits((p) => ({
                                ...p,
                                [meta.category]: { ...draft, unitPrice: e.target.value },
                              }))
                            }
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-bold"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <input
                            type="number"
                            value={draft.taxRate}
                            onChange={(e) =>
                              setRateEdits((p) => ({
                                ...p,
                                [meta.category]: { ...draft, taxRate: e.target.value },
                              }))
                            }
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-bold"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              onSaveRate(
                                meta.category,
                                parseNum(draft.unitPrice),
                                parseNum(draft.taxRate)
                              );
                              setFeedback({ ok: true, text: `${meta.category} দর আপডেট হয়েছে।` });
                            }}
                            className="rounded bg-[#E2136E] hover:bg-[#B80D58] text-white px-3 py-1 text-[11px] font-bold cursor-pointer"
                          >
                            সেভ
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ANDROID APK & SOURCE */}
      {activeTab === 'android' && (() => {
        const inIframe = isInEmbeddedIframe();
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const serverBase = apiBaseOrigin || currentOrigin;
        const directSourceZipUrl = `${apiBaseOrigin}/api/download-source-zip`;
        const fullSourceZipUrl = `${serverBase}/api/download-source-zip`;
        const directAndroidZipUrl = `${apiBaseOrigin}/api/build-android-project?appName=${encodeURIComponent(
          apkAppName.trim() || DEFAULT_ANDROID_CONFIG.appName
        )}&packageName=${encodeURIComponent(
          apkPackage.trim() || DEFAULT_ANDROID_CONFIG.packageName
        )}&targetUrl=${encodeURIComponent(
          isAndroidWebViewOrigin() ? LIVE_PWA_APP_URL : currentOrigin
        )}`;
        const fullAndroidZipUrl = `${serverBase}/api/build-android-project?appName=${encodeURIComponent(
          apkAppName.trim() || DEFAULT_ANDROID_CONFIG.appName
        )}&packageName=${encodeURIComponent(
          apkPackage.trim() || DEFAULT_ANDROID_CONFIG.packageName
        )}&targetUrl=${encodeURIComponent(
          isAndroidWebViewOrigin() ? LIVE_PWA_APP_URL : currentOrigin
        )}`;

        const copyDirectLink = async (urlToCopy: string, label: string) => {
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(urlToCopy);
            } else {
              const ta = document.createElement('textarea');
              ta.value = urlToCopy;
              ta.style.position = 'fixed';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
            }
            setZipDownloadStatus({
              ok: true,
              text: `${label} কপি হয়েছে! এখন Chrome-এর নতুন ট্যাবের Address Bar-এ Paste করে Enter চাপলেই ডাউনলোড হয়ে Files-এ সেভ হবে।`,
              directUrl: urlToCopy,
              fileName: 'khaddo-boraddo-source-code.zip',
            });
          } catch {
            setZipDownloadStatus({
              ok: false,
              text: `লিংক কপি করা যায়নি। নিচের লিংকটি ব্যবহার করুন: ${urlToCopy}`,
              directUrl: urlToCopy,
              fileName: 'khaddo-boraddo-source-code.zip',
            });
          }
        };

        return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 text-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              সম্পূর্ণ অ্যান্ড্রয়েড অ্যাপ (APK) ও সোর্স কোড
            </h3>
            <p className="text-slate-600 mt-0.5">
              এই অ্যাপটি অফলাইন WebView + প্রিন্ট ব্রিজ + Google Sign-In ব্রিজসহ সরাসরি GitHub Actions বা Android Studio দিয়ে APK বিল্ড করার জন্য প্রস্তুত। আপনার সংযুক্ত Google Sheet ID, টেমপ্লেট ও স্বাক্ষর স্বয়ংক্রিয়ভাবে APK-এর ভিতরে যুক্ত হবে।
            </p>
          </div>

          {inIframe && typeof window !== 'undefined' && (
            <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3.5 text-rose-950 space-y-2">
              <div className="font-extrabold text-xs sm:text-sm">
                ⚠️ আপনি AI Studio প্রিভিউ ফ্রেমের ভিতর থেকে ব্যবহার করছেন — এখানে Chrome ডাউনলোড ফাইল ব্লক করে দিতে পারে!
              </div>
              <p className="text-[11px] leading-relaxed text-rose-900">
                ডাউনলোড করতে নিচের <strong>«Chrome-এ নতুন ট্যাবে অ্যাপ খুলুন»</strong> বাটনে ট্যাপ করে মূল ব্রাউজারে অ্যাপটি খুলুন, অথবা ডাউনলোড লিংক কপি করে Chrome-এর নতুন ট্যাবে Paste করুন।
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Chrome-এ নতুন ট্যাবে অ্যাপ খুলুন</span>
                </a>
                <button
                  type="button"
                  onClick={() => void copyDirectLink(fullSourceZipUrl, 'সোর্স কোড ZIP লিংক')}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-950 cursor-pointer"
                >
                  <span>সোর্স ZIP লিংক কপি</span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyDirectLink(fullAndroidZipUrl, 'APK প্রজেক্ট ZIP লিংক')}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-950 cursor-pointer"
                >
                  <span>APK ZIP লিংক কপি</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">অ্যান্ড্রয়েড অ্যাপের নাম</label>
              <input
                type="text"
                value={apkAppName}
                onChange={(e) => setApkAppName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Package ID</label>
              <input
                type="text"
                value={apkPackage}
                onChange={(e) => setApkPackage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {inIframe ? (
              <a
                href={directAndroidZipUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  setZipDownloadStatus({
                    ok: true,
                    text: 'নতুন ট্যাবে Android APK ZIP ডাউনলোড খোলা হয়েছে। Chrome-এ ফাইল না এলে উপরের «Chrome-এ নতুন ট্যাবে অ্যাপ খুলুন» বা «APK ZIP লিংক কপি» ব্যবহার করুন।',
                    directUrl: directAndroidZipUrl,
                    fileName: 'khaddo-boraddo-android-apk.zip',
                  })
                }
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-4 py-2 font-bold text-white"
              >
                <BookOpen className="h-4 w-4" />
                <span>অ্যান্ড্রয়েড APK প্রজেক্ট (.zip)</span>
              </a>
            ) : (
              <button
                type="button"
                disabled={apkDownloading}
                onClick={() => void handleDownloadAndroidZip()}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-50 px-4 py-2 font-bold text-white cursor-pointer"
              >
                <BookOpen className="h-4 w-4" />
                <span>{apkDownloading ? 'প্রজেক্ট তৈরি হচ্ছে...' : 'অ্যান্ড্রয়েড APK প্রজেক্ট (.zip)'}</span>
              </button>
            )}

            <a
              href={directSourceZipUrl}
              target={inIframe ? '_blank' : undefined}
              rel={inIframe ? 'noopener noreferrer' : undefined}
              download={inIframe ? undefined : 'khaddo-boraddo-source-code.zip'}
              onClick={() =>
                setZipDownloadStatus({
                  ok: true,
                  text: inIframe
                    ? 'নতুন ট্যাবে সোর্স কোড ZIP ডাউনলোড খোলা হয়েছে। Chrome-এ ফাইল সেভ না হলে উপরের «Chrome-এ নতুন ট্যাবে অ্যাপ খুলুন» অথবা «সোর্স ZIP লিংক কপি» ব্যবহার করুন।'
                    : 'Chrome ডাউনলোড ম্যানেজারে ফাইলটি নামা শুরু হয়েছে — ডাউনলোড শেষে আপনার ফোনের/পিসির Files / Downloads ফোল্ডারে পাবেন।',
                  directUrl: directSourceZipUrl,
                  fileName: 'khaddo-boraddo-source-code.zip',
                })
              }
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 font-bold text-emerald-950"
            >
              <Download className="h-4 w-4 text-emerald-700" />
              <span>সম্পূর্ণ সোর্স কোড (.zip)</span>
            </a>

            <button
              type="button"
              onClick={() => setShowSourceModal(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 font-bold text-white cursor-pointer"
            >
              <FileCode2 className="h-4 w-4 text-rose-400" />
              <span>সব সোর্স কোড কপি করুন</span>
            </button>

            {!inIframe && (
              <button
                type="button"
                disabled={sourceZipDownloading}
                onClick={() => void handleDownloadSourceZip()}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 font-bold text-slate-900 cursor-pointer"
              >
                <Download className="h-4 w-4 text-[#E2136E]" />
                <span>{sourceZipDownloading ? 'ডাউনলোড হচ্ছে...' : 'বিকল্প ZIP ডাউনলোড'}</span>
              </button>
            )}

            {isAndroidWebViewOrigin() && hasOpenExternalBrowserBridge() && (
              <button
                type="button"
                onClick={() =>
                  openExternalBrowserIfAndroid(`${LIVE_PWA_APP_URL}/api/download-source-zip`)
                }
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 px-4 py-2 font-bold text-slate-900 cursor-pointer"
              >
                <Download className="h-4 w-4 text-[#E2136E]" />
                <span>Chrome দিয়ে ডাউনলোড</span>
              </button>
            )}
          </div>

          {zipDownloadStatus && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
                zipDownloadStatus.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <span>{zipDownloadStatus.text}</span>
              {zipDownloadStatus.directUrl && (
                <a
                  href={zipDownloadStatus.directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-300 px-2.5 py-1 text-[11px] font-extrabold text-[#E2136E] hover:bg-rose-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>নতুন ট্যাবে ডাউনলোড খুলুন</span>
                </a>
              )}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-slate-800 space-y-1.5">
            <div className="font-extrabold text-amber-950">
              GitHub-এ সরাসরি কোড এডিট করার সঠিক নিয়ম:
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-slate-700">
              <li>
                GitHub-এ সরাসরি <code className="font-mono font-bold">.zip</code> ফাইল আপলোড করলে তা এডিট করা যায় না। তাই আগে রিপোজিটরি থেকে পুরনো <code className="font-mono font-bold">.zip</code> ফাইলটি ডিলিট করুন।
              </li>
              <li>
                ডাউনলোড করা <strong>«সম্পূর্ণ সোর্স কোড (.zip)»</strong> বা <strong>«অ্যান্ড্রয়েড APK প্রজেক্ট (.zip)»</strong> আগে কম্পিউটার বা ফোনে <strong>Extract / Unzip</strong> করুন।
              </li>
              <li>
                Unzip করা ফোল্ডারের <strong>ভিতরের ফাইল ও ফোল্ডারগুলো</strong> (<code className="font-mono">src</code>, <code className="font-mono">public</code>, <code className="font-mono">.github</code>, <code className="font-mono">package.json</code> ইত্যাদি) GitHub-এ আপলোড করুন (Hidden ফাইল চালু রেখে <code className="font-mono">.github</code> ফোল্ডারসহ আপলোড করবেন)।
              </li>
              <li>
                এখন GitHub-এ যেকোনো ফাইল সরাসরি এডিট করলে Actions স্বয়ংক্রিয়ভাবে নতুন কোড থেকে Web ও APK বিল্ড করবে।
              </li>
            </ol>
          </div>
        </div>
        );
      })()}

      <SourceCodeCopyModal
        isOpen={showSourceModal}
        onClose={() => setShowSourceModal(false)}
        apkAppName={apkAppName}
        apkPackageName={apkPackage}
      />
    </div>
  );
};
