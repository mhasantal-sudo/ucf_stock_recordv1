import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  Edit3,
  Filter,
  Flame,
  Hammer,
  HeartHandshake,
  Printer,
  Receipt,
  RectangleHorizontal,
  RotateCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Users,
  Wheat,
} from 'lucide-react';
import {
  REPORT_TEMPLATE_CATALOG,
  type AllocationDatabase,
  type RegisterId,
  type ReportTemplateId,
} from '../types/allocation';
import { buildRegisterData } from '../shared/allocReportEngine';
import { formatBnInt } from '../shared/bnUtils';
import {
  OfficialA4Document,
  type OfficialA4DocumentHandle,
} from './OfficialA4Document';

interface RegistersViewProps {
  db: AllocationDatabase;
  activeRegisterId: RegisterId;
  openTrigger?: number;
  onSelectRegister: (regId: RegisterId) => void;
  onEditTemplate: (tplId: ReportTemplateId) => void;
  onChangeOrientation: (tplId: ReportTemplateId, orientation: 'portrait' | 'landscape') => void;
}

const REGISTER_ICON_META: Record<
  RegisterId,
  { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  'reg-food': { icon: Wheat, bg: 'bg-rose-50 border-rose-200', fg: 'text-[#E2136E]' },
  'reg-oms-gen': { icon: ShoppingBag, bg: 'bg-sky-50 border-sky-200', fg: 'text-sky-700' },
  'reg-oms-spc': { icon: ShoppingBag, bg: 'bg-indigo-50 border-indigo-200', fg: 'text-indigo-700' },
  'reg-oms-tcb': { icon: ShoppingBag, bg: 'bg-violet-50 border-violet-200', fg: 'text-violet-700' },
  'reg-ep-rice': { icon: Flame, bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700' },
  'reg-ep-wheat': { icon: Flame, bg: 'bg-orange-50 border-orange-200', fg: 'text-orange-700' },
  'reg-vgf-fish': { icon: HeartHandshake, bg: 'bg-cyan-50 border-cyan-200', fg: 'text-cyan-700' },
  'reg-vgf-eid': { icon: HeartHandshake, bg: 'bg-teal-50 border-teal-200', fg: 'text-teal-700' },
  'reg-gr': { icon: HeartHandshake, bg: 'bg-rose-50 border-rose-200', fg: 'text-rose-700' },
  'reg-kab-gen-rice': { icon: Hammer, bg: 'bg-lime-50 border-lime-200', fg: 'text-lime-700' },
  'reg-kab-gen-wheat': { icon: Hammer, bg: 'bg-yellow-50 border-yellow-200', fg: 'text-yellow-700' },
  'reg-kab-spc-rice': { icon: Hammer, bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-700' },
  'reg-kab-spc-wheat': { icon: Hammer, bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-800' },
  'reg-vwb': { icon: Users, bg: 'bg-purple-50 border-purple-200', fg: 'text-purple-700' },
  'reg-challan': { icon: Receipt, bg: 'bg-slate-100 border-slate-300', fg: 'text-slate-700' },
};

export const RegistersView: React.FC<RegistersViewProps> = ({
  db,
  activeRegisterId,
  openTrigger = 0,
  onSelectRegister,
  onEditTemplate,
  onChangeOrientation,
}) => {
  const docRef = useRef<OfficialA4DocumentHandle>(null);
  const [showIconGrid, setShowIconGrid] = useState<boolean>(openTrigger === 0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [challanFilter, setChallanFilter] = useState<'ALL' | 'excess' | 'deficit'>('ALL');
  const [showFooterSig, setShowFooterSig] = useState(false);

  useEffect(() => {
    if (openTrigger > 0) {
      setShowIconGrid(false);
    }
  }, [openTrigger]);

  const registerItems = useMemo(
    () => REPORT_TEMPLATE_CATALOG.filter((item) => item.kind === 'register'),
    []
  );

  const template = db.templates[activeRegisterId];

  const built = useMemo(
    () => buildRegisterData(activeRegisterId, db, startDate, endDate, template),
    [activeRegisterId, db, startDate, endDate, template]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return built.rows.filter((r) => {
      if (activeRegisterId === 'reg-challan' && challanFilter !== 'ALL') {
        if (challanFilter === 'excess' && !r.hasSignature) return false;
        if (challanFilter === 'deficit' && r.highlight !== 'deficit') return false;
      }
      if (!q) return true;
      return Object.values(r.cells).some((val) =>
        String(val || '').toLowerCase().includes(q)
      );
    });
  }, [built.rows, searchQuery, activeRegisterId, challanFilter]);

  const signedCount = useMemo(
    () => filteredRows.filter((r) => r.hasSignature).length,
    [filteredRows]
  );

  const isChallan = activeRegisterId === 'reg-challan';
  const currentOrientation = template?.orientation || 'landscape';

  if (showIconGrid) {
    return (
      <div className="space-y-4 font-nikosh">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">সকল রেজিস্টার খাতা</h2>
              <p className="text-xs text-slate-500">
                যেকোনো আইকনে ট্যাপ করলে সংশ্লিষ্ট রেজিস্টার পেজটি সরাসরি ওপেন হবে।
              </p>
            </div>
            <span className="text-[11px] font-bold text-[#E2136E] tabular-nums shrink-0">
              {formatBnInt(registerItems.length)}টি খাত
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-y-4 gap-x-2 pt-1">
            {registerItems.map((item) => {
              const id = item.id as RegisterId;
              const style = REGISTER_ICON_META[id] || {
                icon: BookOpen,
                bg: 'bg-rose-50 border-rose-200',
                fg: 'text-[#E2136E]',
              };
              const Icon = style.icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelectRegister(id);
                    setShowIconGrid(false);
                  }}
                  className="group flex flex-col items-center text-center gap-1.5 p-1 rounded-2xl hover:bg-rose-50/60 transition-colors cursor-pointer min-h-[84px]"
                >
                  <span
                    className={`h-14 w-14 rounded-full border flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform ${style.bg} ${style.fg}`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold leading-tight text-slate-800 line-clamp-2">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-nikosh">
      {/* Opened Register Compact Header & Symbol-Only Action Controls */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIconGrid(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-[#E2136E]" />
              <span>সকল রেজিস্টার</span>
            </button>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {template.reportTitle || template.label}
            </h2>
          </div>

          <div className="text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 tabular-nums">
            সারি: {formatBnInt(filteredRows.length)} · স্বাক্ষরযুক্ত: {formatBnInt(signedCount)}
          </div>
        </div>

        {/* Date From (Left), Date To (Right) */}
        <div className="grid grid-cols-2 items-end gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">শুরু তারিখ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">শেষ তারিখ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
            />
          </div>
        </div>

        {/* Search, Challan Mismatch Filter & Footer Signature Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ডিলার, স্মারক, ডিও বা প্রকল্প..."
              className="w-full min-h-[38px] rounded-xl border border-slate-300 pl-8 pr-2.5 py-1.5"
            />
          </div>

          {isChallan && (
            <div className="inline-flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={challanFilter}
                onChange={(e) => setChallanFilter(e.target.value as 'ALL' | 'excess' | 'deficit')}
                className="min-h-[38px] rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white font-bold"
              >
                <option value="ALL">সকল চালান</option>
                <option value="excess">সঠিক / বেশি জমা (স্বাক্ষরযুক্ত)</option>
                <option value="deficit">কম জমা (গরমিল)</option>
              </select>
            </div>
          )}

          {(startDate || endDate || searchQuery || challanFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setChallanFilter('ALL');
              }}
              title="ফিল্টার রিসেট"
              aria-label="ফিল্টার রিসেট"
              className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 font-bold text-slate-700 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}

          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showFooterSig}
              onChange={(e) => setShowFooterSig(e.target.checked)}
              className="accent-[#E2136E]"
            />
            <span>পাতার নিচে কর্মকর্তার স্বাক্ষর</span>
          </label>
        </div>
      </div>

      {/* Rendered A4 Register Document + Lightly Floating Single-Line Symbol-Only Export Bar */}
      <div className="relative">
        <OfficialA4Document
          ref={docRef}
          hideDefaultToolbar={true}
          template={template}
          officer={db.officer}
          columns={built.columns}
          leaves={built.leaves}
          mergeDepth={built.mergeDepth}
          showSerialCol={true}
          serialColLabel="ক্রম"
          serialPerRow={built.serialPerRow}
          colWidths={built.colWidths}
          tableLayoutFixed={built.tableLayoutFixed}
          rows={filteredRows}
          showRecipientBlock={false}
          showIntroBlock={false}
          showCopyBlock={template.showCopyBlock}
          showOfficerSignatureBlock={showFooterSig}
          summaryText={
            isChallan
              ? `স্বাক্ষরযুক্ত: ${formatBnInt(signedCount)}টি`
              : `ডিও সম্পন্ন: ${formatBnInt(signedCount)}টি`
          }
          pdfFileName={`${activeRegisterId}-${new Date().toISOString().slice(0, 10)}.pdf`}
          onEditTemplate={() => onEditTemplate(activeRegisterId)}
        />

        <div className="no-print sticky bottom-[70px] lg:bottom-4 z-30 -mt-14 pt-2 pb-1.5 px-1 flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center flex-nowrap gap-1.5 rounded-full border border-rose-200/80 bg-white/85 backdrop-blur-md shadow-[0_6px_22px_rgba(226,19,110,0.18)] px-2 py-1.5">
            <button
              type="button"
              onClick={() => onChangeOrientation(activeRegisterId, 'portrait')}
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
              onClick={() => onChangeOrientation(activeRegisterId, 'landscape')}
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
              onClick={() => onEditTemplate(activeRegisterId)}
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
