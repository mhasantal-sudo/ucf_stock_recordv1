import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  FileCheck2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORIES,
  type AllocationCategory,
  type AllocationDatabase,
  type ChallanRecord,
} from '../types/allocation';
import {
  getDoBookRegisterStats,
  getPendingDORecipients,
  getUnusedDoNumbers,
} from '../shared/allocReportEngine';
import {
  bnToEnDigits,
  formatBnDate,
  formatBnInt,
  formatBnMoney,
  formatBnQty,
  normMemoNo,
  parseNum,
  round3,
  toBnDigits,
  todayIsoDate,
} from '../shared/bnUtils';
import type { ActionResult } from '../store/useAllocationStore';

export type DOTabKey = 'do-book' | 'do-issue';

interface DOWorkspaceViewProps {
  db: AllocationDatabase;
  activeTab: DOTabKey;
  onChangeTab: (tab: DOTabKey) => void;
  initialCategory?: AllocationCategory | 'ALL';
  lockedCategory?: AllocationCategory | null;
  embedded?: boolean;
  onBack?: () => void;
  onSaveDOBook: (input: { bookNo: number; startPage: number; endPage: number }) => ActionResult;
  onDeleteDOBook: (id: string) => void;
  verifyChallan: (
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
  onIssueDOBatch: (
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
  onDeleteDOIssue: (id: string) => void;
}

export const DOWorkspaceView: React.FC<DOWorkspaceViewProps> = ({
  db,
  activeTab,
  onChangeTab,
  initialCategory = 'ALL',
  lockedCategory = null,
  embedded = false,
  onBack,
  onSaveDOBook,
  onDeleteDOBook,
  verifyChallan,
  onIssueDOBatch,
  onUpdateDOIssue,
  onDeleteDOIssue,
}) => {
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // DO Book form
  const [bookNo, setBookNo] = useState('');
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string>('');

  // DO Issue state
  const [doCatFilter, setDoCatFilter] = useState<string>(lockedCategory || initialCategory || 'ALL');
  const [doBatchDate, setDoBatchDate] = useState(todayIsoDate());
  const [pendingInputs, setPendingInputs] = useState<
    Record<string, { doNo: string; date: string }>
  >({});
  const [verifyTargetKey, setVerifyTargetKey] = useState<string | null>(null);
  const [doSearch, setDoSearch] = useState('');
  const [editingDoRow, setEditingDoRow] = useState<{
    id: string;
    doNo: string;
    issueDate: string;
    qty: string;
  } | null>(null);

  useEffect(() => {
    if (lockedCategory) {
      setDoCatFilter(lockedCategory);
    } else if (initialCategory) {
      setDoCatFilter(initialCategory);
    }
  }, [initialCategory, lockedCategory]);

  const unusedList = useMemo(() => getUnusedDoNumbers(db), [db]);
  const bookStats = useMemo(() => getDoBookRegisterStats(db), [db]);
  const pendingRecipients = useMemo(() => getPendingDORecipients(db), [db]);

  const showRes = (res: ActionResult) => {
    setFeedback({
      ok: res.ok,
      text: res.ok ? res.message || 'সম্পন্ন হয়েছে।' : res.error || 'ত্রুটি ঘটেছে।',
    });
  };

  const handleBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onSaveDOBook({
      bookNo: parseNum(bookNo),
      startPage: parseNum(startPage),
      endPage: parseNum(endPage),
    });
    showRes(res);
    if (res.ok) {
      setBookNo('');
      setStartPage('');
      setEndPage('');
    }
  };

  const filteredPending = useMemo(() => {
    return pendingRecipients.filter(
      (p) => doCatFilter === 'ALL' || p.category === doCatFilter
    );
  }, [pendingRecipients, doCatFilter]);

  const issuedSet = useMemo(
    () => new Set(db.doIssues.map((d) => bnToEnDigits(String(d.doNo)).trim())),
    [db.doIssues]
  );

  const sortedUnusedList = useMemo(
    () => [...unusedList].sort((a, b) => a.doNo - b.doNo),
    [unusedList]
  );

  const pendingGroups = useMemo(() => {
    const groups: Array<{
      groupKey: string;
      category: AllocationCategory;
      unoMemo: string;
      unoDate: string;
      items: typeof filteredPending;
      totalRemaining: number;
    }> = [];
    const byKey = new Map<string, (typeof groups)[number]>();
    for (const item of filteredPending) {
      const groupKey = `${item.category}::${normMemoNo(item.unoMemo)}::${item.unoDate}`;
      let grp = byKey.get(groupKey);
      if (!grp) {
        grp = {
          groupKey,
          category: item.category,
          unoMemo: item.unoMemo,
          unoDate: item.unoDate,
          items: [],
          totalRemaining: 0,
        };
        byKey.set(groupKey, grp);
        groups.push(grp);
      }
      grp.items.push(item);
      grp.totalRemaining = round3(grp.totalRemaining + item.remaining);
    }
    return groups;
  }, [filteredPending]);

  const buildUsedDoDraftSet = (
    draftMap: Record<string, { doNo: string; date: string }>
  ): Set<string> => {
    const used = new Set<string>(issuedSet);
    for (const val of Object.values(draftMap)) {
      const cleaned = bnToEnDigits(val?.doNo || '').trim();
      if (cleaned) used.add(cleaned);
    }
    return used;
  };

  const findNextLowestUnusedDo = (usedSet: Set<string>): string | null => {
    for (const u of sortedUnusedList) {
      const candidate = String(u.doNo);
      if (!usedSet.has(candidate)) return candidate;
    }
    return null;
  };

  const toggleSingleRowIssue = (
    p: (typeof pendingRecipients)[number],
    checked: boolean
  ) => {
    if (!checked) {
      setPendingInputs((prev) => {
        const copy = { ...prev };
        delete copy[p.key];
        return copy;
      });
      return;
    }
    setPendingInputs((prev) => {
      const existing = prev[p.key]?.doNo?.trim();
      if (existing) return prev;
      const usedSet = buildUsedDoDraftSet(prev);
      const nextDo = findNextLowestUnusedDo(usedSet);
      if (!nextDo) {
        setFeedback({
          ok: false,
          text: 'খালি ডিও বইয়ের পাতা অবশিষ্ট নেই। নতুন ডিও বই এন্ট্রি করুন অথবা হাতে ডিও নং লিখুন।',
        });
        return prev;
      }
      return {
        ...prev,
        [p.key]: {
          doNo: nextDo,
          date: prev[p.key]?.date || doBatchDate,
        },
      };
    });
  };

  const toggleGroupSelectAll = (
    items: typeof filteredPending,
    checked: boolean
  ) => {
    if (!checked) {
      setPendingInputs((prev) => {
        const copy = { ...prev };
        for (const item of items) {
          delete copy[item.key];
        }
        return copy;
      });
      return;
    }
    setPendingInputs((prev) => {
      const next = { ...prev };
      const usedSet = buildUsedDoDraftSet(next);
      let missingCount = 0;
      for (const item of items) {
        if (next[item.key]?.doNo?.trim()) continue;
        const candidate = findNextLowestUnusedDo(usedSet);
        if (candidate) {
          usedSet.add(candidate);
          next[item.key] = {
            doNo: candidate,
            date: next[item.key]?.date || doBatchDate,
          };
        } else {
          missingCount++;
        }
      }
      if (missingCount > 0) {
        setFeedback({
          ok: false,
          text: `${formatBnInt(missingCount)} জন প্রাপকের জন্য খালি ডিও পাতা পাওয়া যায়নি।`,
        });
      }
      return next;
    });
  };

  const autoAssignUnusedDos = () => {
    const next: Record<string, { doNo: string; date: string }> = { ...pendingInputs };
    const usedInDraft = buildUsedDoDraftSet(next);
    for (const p of filteredPending) {
      if (next[p.key]?.doNo?.trim()) continue;
      const assigned = findNextLowestUnusedDo(usedInDraft);
      if (!assigned) break;
      usedInDraft.add(assigned);
      next[p.key] = {
        doNo: assigned,
        date: next[p.key]?.date || doBatchDate,
      };
    }
    setPendingInputs(next);
  };

  const handleSaveBatchDos = () => {
    const toIssue = filteredPending
      .filter((p) => Boolean(pendingInputs[p.key]?.doNo?.trim()))
      .map((p) => ({
        category: p.category,
        unionName: p.unionName,
        recipientName: p.recipientName,
        salesCenter: p.salesCenter,
        allocationQty: p.remaining,
        ministryMemo: p.ministryMemo,
        dcMemo: p.dcMemo,
        unoMemo: p.unoMemo,
        unoDate: p.unoDate,
        subId: p.subId,
        projectNo: p.projectNo || undefined,
        doNo: pendingInputs[p.key].doNo.trim(),
        issueDate: pendingInputs[p.key].date || doBatchDate,
      }));
    const res = onIssueDOBatch(toIssue);
    showRes(res);
    if (res.ok) {
      setPendingInputs({});
    }
  };

  const handleIssueSingleRow = (p: (typeof pendingRecipients)[number]) => {
    const val = pendingInputs[p.key];
    const dNo = val?.doNo?.trim() || '';
    const res = onIssueDOBatch([
      {
        category: p.category,
        unionName: p.unionName,
        recipientName: p.recipientName,
        salesCenter: p.salesCenter,
        allocationQty: p.remaining,
        ministryMemo: p.ministryMemo,
        dcMemo: p.dcMemo,
        unoMemo: p.unoMemo,
        unoDate: p.unoDate,
        subId: p.subId,
        projectNo: p.projectNo || undefined,
        doNo: dNo,
        issueDate: val?.date || doBatchDate,
      },
    ]);
    showRes(res);
    if (res.ok) {
      setPendingInputs((prev) => {
        const copy = { ...prev };
        delete copy[p.key];
        return copy;
      });
    }
  };

  const selectedBook =
    db.doBooks.find((b) => b.id === selectedBookId) || db.doBooks[0] || null;

  const filteredIssuedDos = useMemo(() => {
    const q = doSearch.trim().toLowerCase();
    return db.doIssues.filter((d) => {
      if (doCatFilter !== 'ALL' && d.category !== doCatFilter) return false;
      if (!q) return true;
      return (
        d.doNo.toLowerCase().includes(q) ||
        d.recipientName.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.unionName.toLowerCase().includes(q)
      );
    });
  }, [db.doIssues, doSearch, doCatFilter]);

  return (
    <div className="space-y-4 font-nikosh">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4 text-[#E2136E]" />
                <span>ফিরে যান</span>
              </button>
            )}
            {lockedCategory ? (
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {lockedCategory} — ডিও এন্ট্রি ও তালিকা
              </h2>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onChangeTab('do-issue')}
                  className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold border cursor-pointer ${
                    activeTab === 'do-issue'
                      ? 'bg-[#E2136E] text-white border-[#E2136E]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50/50'
                  }`}
                >
                  <FileCheck2 className="h-4 w-4" />
                  <span>ডিও ইস্যু ({formatBnInt(filteredPending.length)} পেন্ডিং)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeTab('do-book')}
                  className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold border cursor-pointer ${
                    activeTab === 'do-book'
                      ? 'bg-[#E2136E] text-white border-[#E2136E]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50/50'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>ডিও বই এন্ট্রি ({formatBnInt(unusedList.length)} খালি)</span>
                </button>
              </>
            )}
          </div>
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

      {/* TAB 1: DO BOOK ENTRY */}
      {!lockedCategory && activeTab === 'do-book' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form
            onSubmit={handleBookSubmit}
            className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
          >
            <div className="text-sm font-bold text-slate-900">নতুন ডিও বই যুক্ত করুন</div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">বই নম্বর *</label>
                <input
                  type="number"
                  required
                  value={bookNo}
                  onChange={(e) => setBookNo(e.target.value)}
                  placeholder="যেমন: ১০২"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শুরু পাতা নং *</label>
                  <input
                    type="number"
                    required
                    value={startPage}
                    onChange={(e) => setStartPage(e.target.value)}
                    placeholder="২৪০৪০১"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শেষ পাতা নং *</label>
                  <input
                    type="number"
                    required
                    value={endPage}
                    onChange={(e) => setEndPage(e.target.value)}
                    placeholder="২৪০৪৫০"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#E2136E] hover:bg-[#B80D58] text-white text-xs font-bold cursor-pointer"
            >
              ডিও বই সংরক্ষণ করুন
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 tabular-nums">
              <div>মোট ডিও পাতা: <strong>{formatBnInt(bookStats.summary.totalDO)}</strong></div>
              <div>ব্যবহৃত পাতা: <strong className="text-[#E2136E]">{formatBnInt(bookStats.summary.totalUsed)}</strong></div>
              <div>অব্যবহৃত পাতা: <strong className="text-amber-700">{formatBnInt(bookStats.summary.totalUnused)}</strong></div>
            </div>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-900">
                নিবন্ধিত ডিও বই তালিকা (ব্যবহৃত / খালি পাতার হিসাব)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="py-2 px-3 text-center">বই নং</th>
                      <th className="py-2 px-3 text-center">সিরিয়াল রেঞ্জ</th>
                      <th className="py-2 px-3 text-center">মোট পাতা</th>
                      <th className="py-2 px-3 text-center">ব্যবহৃত</th>
                      <th className="py-2 px-3 text-center">অবশিষ্ট</th>
                      <th className="py-2 px-3 text-center">কাজ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.doBooks.map((b) => {
                      const stat = bookStats.usedRows.find((r) => r.bookNo === b.bookNo);
                      const used = stat?.usedCount || 0;
                      const rem = Math.max(0, b.totalCount - used);
                      return (
                        <tr key={b.id} className={selectedBook?.id === b.id ? 'bg-rose-50/40' : ''}>
                          <td className="py-2 px-3 text-center font-bold">{toBnDigits(b.bookNo)}</td>
                          <td className="py-2 px-3 text-center">
                            {toBnDigits(b.startPage)} — {toBnDigits(b.endPage)}
                          </td>
                          <td className="py-2 px-3 text-center">{formatBnInt(b.totalCount)}</td>
                          <td className="py-2 px-3 text-center font-semibold text-[#E2136E]">
                            {formatBnInt(used)}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-amber-700">
                            {formatBnInt(rem)}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedBookId(b.id)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 mr-1 cursor-pointer"
                            >
                              পাতা দেখুন
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteDOBook(b.id)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedBook && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                  <span>বই নং {toBnDigits(selectedBook.bookNo)} — সকল পাতার মানচিত্র</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    রঙিন = ইস্যুকৃত · সাদা = অব্যবহৃত
                  </span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-[11px] tabular-nums">
                  {Array.from(
                    { length: Math.min(100, selectedBook.endPage - selectedBook.startPage + 1) },
                    (_, i) => selectedBook.startPage + i
                  ).map((p) => {
                    const used = issuedSet.has(String(p));
                    return (
                      <div
                        key={p}
                        className={`rounded border px-1.5 py-1 text-center font-bold ${
                          used
                            ? 'bg-rose-50 border-rose-300 text-[#E2136E]'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        {toBnDigits(p)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DO ISSUE & VERIFICATION */}
      {(lockedCategory || activeTab === 'do-issue') && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {lockedCategory ? `${lockedCategory} — ` : ''}পেন্ডিং ডিও প্রাপক তালিকা ({formatBnInt(filteredPending.length)} জন)
                </h3>
                <p className="text-xs text-slate-500">
                  খালি পাতা থেকে স্বয়ংক্রিয়ভাবে বা হাতে ডিও নম্বর বসিয়ে চালান যাচাইপূর্বক ডিও ইস্যু করুন।
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {!lockedCategory && (
                  <select
                    value={doCatFilter}
                    onChange={(e) => setDoCatFilter(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-slate-300 px-2.5 py-2 bg-white font-bold"
                  >
                    <option value="ALL">সকল খাত ({formatBnInt(pendingRecipients.length)})</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.category}>
                        {c.category}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="date"
                  value={doBatchDate}
                  onChange={(e) => setDoBatchDate(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-2.5 py-1.5"
                />

                <button
                  type="button"
                  onClick={autoAssignUnusedDos}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 font-bold text-[#E2136E] cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>খালি ডিও নং বসান ({formatBnInt(unusedList.length)}টি বাকি)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveBatchDos}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-4 py-1.5 font-bold text-white cursor-pointer"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  <span>সব নির্বাচিত ডিও ইস্যু করুন</span>
                </button>
              </div>
            </div>

            {pendingGroups.length === 0 ? (
              <div className="border border-slate-200 rounded-xl py-8 text-center text-xs text-slate-500">
                বর্তমানে এই খাতে কোনো পেন্ডিং ডিও প্রাপক নেই।
              </div>
            ) : (
              <div className="space-y-4">
                {pendingGroups.map((grp) => {
                  const allGroupSelected =
                    grp.items.length > 0 &&
                    grp.items.every((item) => Boolean(pendingInputs[item.key]?.doNo?.trim()));
                  const someGroupSelected = grp.items.some((item) =>
                    Boolean(pendingInputs[item.key]?.doNo?.trim())
                  );

                  return (
                    <div
                      key={grp.groupKey}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                    >
                      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-slate-900">
                          <span className="text-[#E2136E]">{grp.category}</span>
                          <span className="text-slate-400">·</span>
                          <span>
                            স্মারক নং {grp.unoMemo ? toBnDigits(grp.unoMemo) : '—'}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-slate-700">
                            তারিখ {grp.unoDate ? formatBnDate(grp.unoDate) : '—'}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-slate-700 tabular-nums">
                            মোট প্রাপক ({formatBnInt(grp.items.length)} জন)
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-bold text-[#E2136E] tabular-nums">
                            মোট বাকি ({formatBnQty(grp.totalRemaining)} মে.টন)
                          </span>
                        </div>

                        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap shrink-0">
                          <input
                            type="checkbox"
                            checked={allGroupSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = !allGroupSelected && someGroupSelected;
                            }}
                            onChange={(e) => toggleGroupSelectAll(grp.items, e.target.checked)}
                            className="h-4 w-4 accent-[#E2136E] cursor-pointer"
                          />
                          <span>সব ইস্যু করুন</span>
                        </label>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse tabular-nums">
                          <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-700 font-bold">
                              <th className="py-2 px-2.5 text-center whitespace-nowrap w-20">
                                ইস্যু করুন
                              </th>
                              <th className="py-2 px-2.5 text-left">ইউনিয়ন ও প্রাপক</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">বাকি পরিমাণ</th>
                              <th className="py-2 px-2.5 text-center whitespace-nowrap">চালান যাচাই</th>
                              <th className="py-2 px-2.5 text-center min-w-[160px]">ডিও নং</th>
                              <th className="py-2 px-2.5 text-center w-36">ইস্যু তারিখ</th>
                              <th className="py-2 px-2.5 text-center whitespace-nowrap">একক সংরক্ষণ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {grp.items.map((p) => {
                              const check = verifyChallan(p.category, p.recipientName, p.remaining, {
                                subId: p.subId,
                                unoDate: p.unoDate,
                                unoMemo: p.unoMemo,
                              });
                              const rowDraft = pendingInputs[p.key] || { doNo: '', date: doBatchDate };
                              const isChecked = Boolean(rowDraft.doNo.trim());
                              const showVerify = verifyTargetKey === p.key;

                              return (
                                <React.Fragment key={p.key}>
                                  <tr className={isChecked ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'}>
                                    <td className="py-2 px-2.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => toggleSingleRowIssue(p, e.target.checked)}
                                        aria-label={`${p.recipientName} ইস্যু করুন`}
                                        className="h-4 w-4 accent-[#E2136E] cursor-pointer"
                                      />
                                    </td>
                                    <td className="py-2 px-2.5">
                                      <div className="font-bold text-slate-900">{p.recipientName}</div>
                                      <div className="text-[11px] text-slate-500">
                                        {p.unionName}
                                        {p.salesCenter ? ` · ${p.salesCenter}` : ''}
                                        {p.projectNo ? ` · প্রকল্প: ${toBnDigits(p.projectNo)}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2.5 text-right font-bold text-[#E2136E] whitespace-nowrap">
                                      {formatBnQty(p.remaining)} মে.টন
                                    </td>
                                    <td className="py-2 px-2.5 text-center">
                                      {!check.applicable ? (
                                        <span className="text-[11px] text-slate-500">প্রযোজ্য নয়</span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setVerifyTargetKey(showVerify ? null : p.key)}
                                          className={`rounded border px-2 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                                            check.ok
                                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                              : 'border-amber-300 bg-amber-50 text-amber-800'
                                          }`}
                                        >
                                          {check.ok ? 'চালান সঠিক' : 'যাচাই দেখুন'}
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2">
                                      <input
                                        type="text"
                                        list="unused-do-datalist"
                                        value={rowDraft.doNo}
                                        placeholder="ডিও নং"
                                        onChange={(e) =>
                                          setPendingInputs((prev) => ({
                                            ...prev,
                                            [p.key]: { ...rowDraft, doNo: e.target.value },
                                          }))
                                        }
                                        className="min-w-[140px] w-36 sm:w-44 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-[#E2136E]"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2">
                                      <input
                                        type="date"
                                        value={rowDraft.date}
                                        onChange={(e) =>
                                          setPendingInputs((prev) => ({
                                            ...prev,
                                            [p.key]: { ...rowDraft, date: e.target.value },
                                          }))
                                        }
                                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                      <button
                                        type="button"
                                        disabled={!rowDraft.doNo.trim()}
                                        onClick={() => handleIssueSingleRow(p)}
                                        className="rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40 px-2.5 py-1.5 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
                                      >
                                        ইস্যু
                                      </button>
                                    </td>
                                  </tr>
                                  {showVerify && check.applicable && (
                                    <tr className="bg-slate-50">
                                      <td colSpan={7} className="px-4 py-2 text-xs">
                                        <div className="flex flex-wrap items-center gap-4">
                                          <span>
                                            প্রয়োজনীয় মূল টাকা: <strong>{formatBnMoney(check.requiredAmount || 0)} ৳</strong>{' '}
                                            ({check.mainChallan ? `জমা: ${formatBnMoney(check.mainChallan.depositedAmount)} ৳` : 'চালান নেই'})
                                          </span>
                                          <span>
                                            প্রয়োজনীয় আয়কর: <strong>{formatBnMoney(check.requiredTaxAmount || 0)} ৳</strong>{' '}
                                            ({check.taxChallan ? `জমা: ${formatBnMoney(check.taxChallan.depositedAmount)} ৳` : 'চালান নেই'})
                                          </span>
                                          {check.errors && check.errors.length > 0 && (
                                            <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                                              <AlertTriangle className="h-3.5 w-3.5" />
                                              {check.errors.join(' · ')}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                <datalist id="unused-do-datalist">
                  {sortedUnusedList.slice(0, 120).map((u) => (
                    <option key={u.doNo} value={String(u.doNo)}>
                      বই {toBnDigits(u.bookNo)}
                    </option>
                  ))}
                </datalist>
              </div>
            )}
          </div>

          {/* Issued DO History */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900">
                {lockedCategory ? `${lockedCategory} — ` : ''}ইস্যুকৃত ডিও তালিকা ({formatBnInt(filteredIssuedDos.length)}টি)
              </div>
              <div className="relative w-60">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={doSearch}
                  onChange={(e) => setDoSearch(e.target.value)}
                  placeholder="ডিও নং / ডিলার / ইউনিয়ন"
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse tabular-nums">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2 px-3 text-center">ডিও নং ও তারিখ</th>
                    <th className="py-2 px-3 text-left">খাত</th>
                    <th className="py-2 px-3 text-left">প্রাপক ও ইউনিয়ন</th>
                    <th className="py-2 px-3 text-right">পরিমাণ (মে.টন)</th>
                    <th className="py-2 px-3 text-left">চালান</th>
                    <th className="py-2 px-3 text-center">কাজ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIssuedDos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        এখনো কোনো ডিও ইস্যু করা হয়নি।
                      </td>
                    </tr>
                  ) : (
                    filteredIssuedDos.map((d) => {
                      const isEditing = editingDoRow?.id === d.id;
                      return (
                        <tr key={d.id} className={isEditing ? 'bg-rose-50/50' : ''}>
                          <td className="py-2 px-3 text-center">
                            {isEditing ? (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={editingDoRow.doNo}
                                  onChange={(e) =>
                                    setEditingDoRow((prev) =>
                                      prev ? { ...prev, doNo: e.target.value } : prev
                                    )
                                  }
                                  className="w-28 rounded border border-slate-300 px-2 py-1 text-center font-bold text-xs"
                                />
                                <input
                                  type="date"
                                  value={editingDoRow.issueDate}
                                  onChange={(e) =>
                                    setEditingDoRow((prev) =>
                                      prev ? { ...prev, issueDate: e.target.value } : prev
                                    )
                                  }
                                  className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <div className="font-bold text-[#E2136E]">{toBnDigits(d.doNo)}</div>
                                <div className="text-[11px] text-slate-500">{formatBnDate(d.issueDate)}</div>
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold">{d.category}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{d.recipientName}</div>
                            <div className="text-[11px] text-slate-500">{d.unionName}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-bold">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.001"
                                value={editingDoRow.qty}
                                onChange={(e) =>
                                  setEditingDoRow((prev) =>
                                    prev ? { ...prev, qty: e.target.value } : prev
                                  )
                                }
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-bold"
                              />
                            ) : (
                              formatBnQty(d.allocationQty)
                            )}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-700 space-y-0.5">
                            {(() => {
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

                              if (!mainNo && !taxNo && mainAmt <= 0 && taxAmt <= 0) {
                                return <span className="text-slate-400">—</span>;
                              }
                              return (
                                <>
                                  {(mainNo || mainAmt > 0) && (
                                    <div>
                                      মূল: <span className="font-semibold">{mainNo ? toBnDigits(mainNo) : '—'}</span>
                                      {mainAmt > 0 && (
                                        <span className="font-bold text-[#E2136E]">
                                          {' '}(জমা: {formatBnMoney(mainAmt)} ৳)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {(taxNo || taxAmt > 0) && (
                                    <div>
                                      আয়কর: <span className="font-semibold">{taxNo ? toBnDigits(taxNo) : '—'}</span>
                                      {taxAmt > 0 && (
                                        <span className="font-bold text-[#E2136E]">
                                          {' '}(জমা: {formatBnMoney(taxAmt)} ৳)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!onUpdateDOIssue) return;
                                    const res = onUpdateDOIssue(d.id, {
                                      doNo: editingDoRow.doNo,
                                      issueDate: editingDoRow.issueDate,
                                      allocationQty: parseNum(editingDoRow.qty),
                                    });
                                    showRes(res);
                                    if (res.ok) setEditingDoRow(null);
                                  }}
                                  className="p-1.5 text-white bg-[#E2136E] hover:bg-[#B80D58] rounded cursor-pointer"
                                  title="সংরক্ষণ"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDoRow(null)}
                                  className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                  title="বাতিল"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                {onUpdateDOIssue && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingDoRow({
                                        id: d.id,
                                        doNo: d.doNo,
                                        issueDate: d.issueDate,
                                        qty: String(d.allocationQty),
                                      })
                                    }
                                    className="p-1.5 text-[#E2136E] hover:bg-rose-50 rounded cursor-pointer"
                                    title="এডিট করুন"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onDeleteDOIssue(d.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  title="মুছুন"
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
      )}
    </div>
  );
};
