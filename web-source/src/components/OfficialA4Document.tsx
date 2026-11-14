import React, { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  Download,
  Edit3,
  FileText,
  Printer,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  OfficerProfileSettings,
  ReportTemplateConfig,
} from '../types/allocation';
import { formatBnDate, toBnDigits } from '../shared/bnUtils';

export interface DocColumnLeaf {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  isSignature?: boolean;
  widthPct?: number;
}

export interface DocColumnGroup {
  label: string;
  children?: DocColumnLeaf[];
  leaf?: DocColumnLeaf;
}

export interface DocRowData {
  id: string;
  groupValues?: string[];
  cells: Record<string, string>;
  hasSignature?: boolean;
  highlight?: 'excess' | 'deficit' | 'none';
}

export interface DocTotalRow {
  label: string;
  labelColSpan: number;
  values: Record<string, string>;
}

export interface DocKpiBox {
  label: string;
  value: string;
  tone?: 'neutral' | 'emerald' | 'amber';
}

export interface OfficialA4DocumentHandle {
  exportPdf: () => Promise<void>;
  printDoc: () => void;
}

export interface OfficialA4DocumentProps {
  template: ReportTemplateConfig;
  officer: OfficerProfileSettings;
  subjectResolved?: string;
  introResolved?: string;
  memoNo?: string;
  memoDate?: string;
  onSaveMemo?: (no: string, date: string) => void;
  columns: DocColumnGroup[];
  leaves: DocColumnLeaf[];
  mergeDepth?: number;
  showSerialCol?: boolean;
  serialColLabel?: string;
  serialPerRow?: boolean;
  rows: DocRowData[];
  totalRow?: DocTotalRow | null;
  secondarySection?: {
    title: string;
    columns: DocColumnLeaf[];
    rows: DocRowData[];
  } | null;
  kpiBoxes?: DocKpiBox[];
  bannerNote?: string;
  colWidths?: string[];
  tableLayoutFixed?: boolean;
  footerLayout?: 'side_by_side' | 'sign_above_copy';
  showRecipientBlock?: boolean;
  showIntroBlock?: boolean;
  showCopyBlock?: boolean;
  showOfficerSignatureBlock?: boolean;
  summaryText?: string;
  pdfFileName: string;
  onEditTemplate?: () => void;
  toolbarExtra?: React.ReactNode;
  hideDefaultToolbar?: boolean;
}

interface PageSlice {
  pageNumber: number;
  hasDocHeader: boolean;
  rowStart: number;
  rowEnd: number;
  showTotalRow: boolean;
  showSecondaryOnPage: boolean;
  showFooterBlock: boolean;
}

declare global {
  interface Window {
    AndroidBlobBridge?: {
      printCurrentPage?: () => void;
      saveBase64File?: (base64: string, fileName: string, mimeType: string) => void;
    };
  }
}

const MM_TO_PX = 3.7795275591;

function clampMm(v: number, fallback = 10): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(4, Math.min(30, n));
}

function getGroupColSpans(columns: DocColumnGroup[]): {
  hasTwoHeaderRows: boolean;
  topCells: Array<{ label: string; colSpan: number; rowSpan: number }>;
  subCells: DocColumnLeaf[];
} {
  const hasTwo = columns.some((c) => c.children && c.children.length > 0);
  if (!hasTwo) {
    return {
      hasTwoHeaderRows: false,
      topCells: columns.map((c) => ({ label: c.leaf?.label || c.label, colSpan: 1, rowSpan: 1 })),
      subCells: [],
    };
  }
  const topCells: Array<{ label: string; colSpan: number; rowSpan: number }> = [];
  const subCells: DocColumnLeaf[] = [];
  for (const col of columns) {
    if (col.children && col.children.length > 0) {
      topCells.push({ label: col.label, colSpan: col.children.length, rowSpan: 1 });
      subCells.push(...col.children);
    } else {
      topCells.push({ label: col.leaf?.label || col.label, colSpan: 1, rowSpan: 2 });
    }
  }
  return { hasTwoHeaderRows: true, topCells, subCells };
}

function computeSliceRowSpans(
  rows: DocRowData[],
  start: number,
  end: number,
  mergeDepth: number
): number[][] {
  const sliceLen = end - start;
  const spans: number[][] = Array.from({ length: sliceLen }, () =>
    Array.from({ length: mergeDepth }, () => 1)
  );
  if (mergeDepth <= 0 || sliceLen === 0) return spans;

  for (let col = 0; col < mergeDepth; col++) {
    let i = 0;
    while (i < sliceLen) {
      const val = rows[start + i]?.groupValues?.[col] ?? '';
      if (!val || val === '—') {
        spans[i][col] = 1;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < sliceLen) {
        let sameAllParents = true;
        for (let p = 0; p <= col; p++) {
          const prevV = rows[start + i]?.groupValues?.[p] ?? '';
          const curV = rows[start + j]?.groupValues?.[p] ?? '';
          if (prevV !== curV) {
            sameAllParents = false;
            break;
          }
        }
        if (!sameAllParents) break;
        j++;
      }
      const spanLen = j - i;
      spans[i][col] = spanLen;
      for (let k = i + 1; k < j; k++) {
        spans[k][col] = 0;
      }
      i = j;
    }
  }
  return spans;
}

function computeGlobalSerials(rows: DocRowData[], mergeDepth: number): number[] {
  if (rows.length === 0) return [];
  if (mergeDepth <= 0) {
    return rows.map((_, i) => i + 1);
  }
  const serials: number[] = [];
  let seq = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      seq = 1;
    } else {
      let sameAll = true;
      for (let p = 0; p < mergeDepth; p++) {
        const prevV = rows[i - 1]?.groupValues?.[p] ?? '';
        const curV = rows[i]?.groupValues?.[p] ?? '';
        if (!curV || curV === '—' || prevV !== curV) {
          sameAll = false;
          break;
        }
      }
      if (!sameAll) seq++;
    }
    serials.push(seq);
  }
  return serials;
}

export const OfficialA4Document = React.forwardRef<OfficialA4DocumentHandle, OfficialA4DocumentProps>(
  (
    {
      template,
      officer,
      subjectResolved,
      introResolved,
      memoNo,
      memoDate,
      onSaveMemo,
      columns,
      leaves,
      mergeDepth = 0,
      showSerialCol = true,
      serialColLabel = 'ক্রমিক',
      serialPerRow = false,
      rows,
      totalRow = null,
      secondarySection = null,
      kpiBoxes,
      bannerNote,
      colWidths,
      tableLayoutFixed = false,
      footerLayout = 'side_by_side',
      showRecipientBlock = false,
      showIntroBlock = false,
      showCopyBlock = false,
      showOfficerSignatureBlock = true,
      summaryText,
      pdfFileName,
      onEditTemplate,
      toolbarExtra,
      hideDefaultToolbar = false,
    },
    ref
  ) => {
    const isLandscape = template.orientation === 'landscape';
    const pageWidthPx = isLandscape ? 1123 : 794;
    const pageHeightPx = isLandscape ? 794 : 1123;

    const padTopPx = Math.round(clampMm(template.marginTopMm, 10) * MM_TO_PX);
    const padRightPx = Math.round(clampMm(template.marginRightMm, 10) * MM_TO_PX);
    const padBottomPx = Math.round(clampMm(template.marginBottomMm, 10) * MM_TO_PX);
    const padLeftPx = Math.round(clampMm(template.marginLeftMm, 10) * MM_TO_PX);
    const contentWidthPx = pageWidthPx - padLeftPx - padRightPx;
    const fallbackMaxBodyHeightPx = pageHeightPx - padTopPx - padBottomPx - 36;

    const hiddenSet = useMemo(() => new Set(template.hiddenColumns || []), [template.hiddenColumns]);

    const visibleLeaves = useMemo(
      () => leaves.filter((l) => !hiddenSet.has(l.key)),
      [leaves, hiddenSet]
    );

    const visibleColumns = useMemo(() => {
      const out: DocColumnGroup[] = [];
      for (const c of columns) {
        if (c.children && c.children.length > 0) {
          const kept = c.children.filter((ch) => !hiddenSet.has(ch.key));
          if (kept.length > 0) {
            out.push({ ...c, children: kept });
          }
        } else if (c.leaf) {
          if (!hiddenSet.has(c.leaf.key)) {
            out.push(c);
          }
        }
      }
      return out;
    }, [columns, hiddenSet]);

    const effectiveMergeDepth = useMemo(() => {
      let depth = 0;
      for (let i = 0; i < mergeDepth; i++) {
        const leaf = leaves[i];
        if (leaf && !hiddenSet.has(leaf.key)) depth++;
        else break;
      }
      return depth;
    }, [mergeDepth, leaves, hiddenSet]);

    const headerStruct = useMemo(() => getGroupColSpans(visibleColumns), [visibleColumns]);
    const globalSerials = useMemo(
      () => computeGlobalSerials(rows, effectiveMergeDepth),
      [rows, effectiveMergeDepth]
    );

    const resolvedColWidths = useMemo(() => {
      if (!colWidths || colWidths.length === 0) return null;
      const expectedLen = (showSerialCol ? 1 : 0) + leaves.length;
      if (colWidths.length !== expectedLen) return null;
      if (visibleLeaves.length === leaves.length) return colWidths;
      const filtered: string[] = [];
      if (showSerialCol) filtered.push(colWidths[0]);
      leaves.forEach((l, idx) => {
        if (!hiddenSet.has(l.key)) {
          filtered.push(colWidths[(showSerialCol ? 1 : 0) + idx]);
        }
      });
      return filtered;
    }, [colWidths, showSerialCol, leaves, visibleLeaves, hiddenSet]);

    const filteredLabelColSpan = useMemo(() => {
      if (!totalRow) return 0;
      return leaves
        .slice(0, totalRow.labelColSpan)
        .filter((l) => !hiddenSet.has(l.key)).length;
    }, [totalRow, leaves, hiddenSet]);

    const [memoNoDraft, setMemoNoDraft] = useState(memoNo ?? `${template.memoPrefix}`);
    const [memoDateDraft, setMemoDateDraft] = useState(memoDate ?? new Date().toISOString().slice(0, 10));

    useEffect(() => {
      if (memoNo !== undefined) setMemoNoDraft(memoNo);
    }, [memoNo]);

    useEffect(() => {
      if (memoDate !== undefined) setMemoDateDraft(memoDate);
    }, [memoDate]);

    const [fontReadyTick, setFontReadyTick] = useState(0);
    useEffect(() => {
      let cancelled = false;
      const waitFonts = async () => {
        try {
          if (document.fonts) {
            await document.fonts.load("14px 'Nikosh'").catch(() => undefined);
            await document.fonts.ready;
          }
        } finally {
          if (!cancelled) setFontReadyTick((t) => t + 1);
        }
      };
      void waitFonts();
      return () => {
        cancelled = true;
      };
    }, []);

    const [zoomPct, setZoomPct] = useState<number>(() => {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        return isLandscape ? 52 : 58;
      }
      return isLandscape ? 88 : 96;
    });

    useEffect(() => {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        setZoomPct(isLandscape ? 52 : 58);
      } else {
        setZoomPct(isLandscape ? 88 : 96);
      }
    }, [isLandscape]);

    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState<string | null>(null);

    const measureRootRef = useRef<HTMLDivElement>(null);
    const pagesContainerRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<PageSlice[]>([
      {
        pageNumber: 1,
        hasDocHeader: true,
        rowStart: 0,
        rowEnd: rows.length,
        showTotalRow: Boolean(totalRow),
        showSecondaryOnPage: Boolean(secondarySection),
        showFooterBlock: true,
      },
    ]);

    const fontPt = Math.max(7.5, Math.min(13, Number(template.fontSizePt) || 9.5));
    const sigSrc = officer.signatureImageUrl || '/default-signature.png';
    const fallbackSigHeight =
      template.kind === 'register'
        ? (officer.registerSignatureHeightPx ?? 26)
        : (officer.reportSignatureHeightPx ?? 38);
    const sigHeight = Math.max(
      14,
      Math.min(90, Number(template.signatureHeightPx) || fallbackSigHeight)
    );

    const uniqueMergedCells = useMemo(() => {
      if (effectiveMergeDepth <= 0 || rows.length === 0) return [] as Array<{ colIdx: number; text: string }>;
      const seen = new Set<string>();
      const out: Array<{ colIdx: number; text: string }> = [];
      for (const r of rows) {
        for (let colIdx = 0; colIdx < effectiveMergeDepth; colIdx++) {
          const leafKey = visibleLeaves[colIdx]?.key || '';
          const text = toBnDigits(r.cells[leafKey] ?? '—');
          const id = `${colIdx}::${text}`;
          if (!seen.has(id)) {
            seen.add(id);
            out.push({ colIdx, text });
          }
        }
      }
      return out;
    }, [rows, effectiveMergeDepth, visibleLeaves]);

    useLayoutEffect(() => {
      const root = measureRootRef.current;
      if (!root) return;

      const docHeaderEl = root.querySelector('[data-measure="doc-header"]') as HTMLElement | null;
      const contHeaderEl = root.querySelector('[data-measure="cont-header"]') as HTMLElement | null;
      const pageFooterEl = root.querySelector('[data-measure="page-footer"]') as HTMLElement | null;
      const theadEl = root.querySelector('[data-measure="thead"]') as HTMLElement | null;
      const totalEl = root.querySelector('[data-measure="total-row"]') as HTMLElement | null;
      const secondaryEl = root.querySelector('[data-measure="secondary"]') as HTMLElement | null;
      const footerEl = root.querySelector('[data-measure="footer"]') as HTMLElement | null;
      const rowEls = Array.from(root.querySelectorAll('[data-measure-row]')) as HTMLElement[];
      const mergedEls = Array.from(root.querySelectorAll('[data-measure-merged]')) as HTMLElement[];

      const docHeaderH = docHeaderEl ? Math.ceil(docHeaderEl.getBoundingClientRect().height) : 0;
      const contHeaderH = contHeaderEl ? Math.ceil(contHeaderEl.getBoundingClientRect().height) : 26;
      const pageFooterH = pageFooterEl ? Math.ceil(pageFooterEl.getBoundingClientRect().height) : 26;
      const effectiveMaxBodyH = Math.max(
        200,
        pageHeightPx - padTopPx - padBottomPx - pageFooterH - 4
      );
      const theadH = theadEl ? Math.ceil(theadEl.getBoundingClientRect().height) + 1 : 34;
      const totalH = totalEl ? Math.ceil(totalEl.getBoundingClientRect().height) + 1 : 0;
      const secondaryH = secondaryEl ? Math.ceil(secondaryEl.getBoundingClientRect().height) : 0;
      const footerH = footerEl ? Math.ceil(footerEl.getBoundingClientRect().height) : 0;

      const leafRowHeights = rows.map((_, i) => {
        const el = rowEls[i];
        if (!el) return 24;
        return Math.ceil(el.getBoundingClientRect().height);
      });

      const mergedHeightMap = new Map<string, number>();
      for (const el of mergedEls) {
        const key = el.getAttribute('data-measure-merged');
        if (key) {
          mergedHeightMap.set(key, Math.ceil(el.getBoundingClientRect().height));
        }
      }

      const computeSliceBodyHeight = (start: number, endInclusive: number): number => {
        const len = endInclusive - start + 1;
        if (len <= 0) return 0;
        const h = leafRowHeights.slice(start, endInclusive + 1);
        if (effectiveMergeDepth > 0) {
          for (let col = effectiveMergeDepth - 1; col >= 0; col--) {
            let i = 0;
            while (i < len) {
              const val = rows[start + i]?.groupValues?.[col] ?? '';
              if (!val || val === '—') {
                i++;
                continue;
              }
              let j = i + 1;
              while (j < len) {
                let sameAllParents = true;
                for (let p = 0; p <= col; p++) {
                  const prevV = rows[start + i]?.groupValues?.[p] ?? '';
                  const curV = rows[start + j]?.groupValues?.[p] ?? '';
                  if (prevV !== curV) {
                    sameAllParents = false;
                    break;
                  }
                }
                if (!sameAllParents) break;
                j++;
              }
              const leafKey = visibleLeaves[col]?.key || '';
              const text = toBnDigits(rows[start + i]?.cells[leafKey] ?? '—');
              const needH = mergedHeightMap.get(`${col}::${text}`) || 0;
              let curSum = 0;
              for (let k = i; k < j; k++) curSum += h[k];
              if (needH > curSum) {
                const extraPerRow = (needH - curSum) / (j - i);
                for (let k = i; k < j; k++) h[k] += extraPerRow;
              }
              i = j;
            }
          }
        }
        let sum = 0;
        for (let i = 0; i < h.length; i++) sum += h[i];
        return Math.ceil(sum);
      };

      const computedPages: PageSlice[] = [];

      if (rows.length === 0) {
        const hasExtras = Boolean(secondarySection || (kpiBoxes && kpiBoxes.length > 0) || bannerNote);
        const needExtras = docHeaderH + theadH + 40 + totalH + secondaryH + footerH <= effectiveMaxBodyH;
        computedPages.push({
          pageNumber: 1,
          hasDocHeader: true,
          rowStart: 0,
          rowEnd: 0,
          showTotalRow: Boolean(totalRow),
          showSecondaryOnPage: hasExtras && needExtras,
          showFooterBlock: needExtras,
        });
        if (!needExtras) {
          computedPages.push({
            pageNumber: 2,
            hasDocHeader: false,
            rowStart: 0,
            rowEnd: 0,
            showTotalRow: false,
            showSecondaryOnPage: hasExtras,
            showFooterBlock: true,
          });
        }
        setPages(computedPages);
        return;
      }

      let idx = 0;
      let pageNum = 1;
      const hasExtras = Boolean(secondarySection || (kpiBoxes && kpiBoxes.length > 0) || bannerNote);

      while (idx < rows.length) {
        const hasDocHeader = pageNum === 1;
        const topUsed = hasDocHeader ? docHeaderH : contHeaderH;
        const budget = Math.max(140, effectiveMaxBodyH - topUsed - theadH);

        let used = 0;
        const start = idx;
        let end = idx;

        while (end < rows.length) {
          const nextH = computeSliceBodyHeight(start, end);
          if (nextH > budget && end > start) {
            break;
          }
          used = nextH;
          end++;
        }

        const isLastRowsPage = end >= rows.length;
        if (!isLastRowsPage) {
          computedPages.push({
            pageNumber: pageNum,
            hasDocHeader,
            rowStart: start,
            rowEnd: end,
            showTotalRow: false,
            showSecondaryOnPage: false,
            showFooterBlock: false,
          });
          pageNum++;
          idx = end;
          continue;
        }

        const fitTotal = !totalRow || used + totalH <= budget;
        const usedAfterTotal = used + (fitTotal ? totalH : 0);
        const fitSecondary = !hasExtras || (fitTotal && usedAfterTotal + secondaryH <= budget);
        const usedAfterSecondary = usedAfterTotal + (fitSecondary ? secondaryH : 0);
        const fitFooter = fitTotal && fitSecondary && usedAfterSecondary + footerH <= budget;

        computedPages.push({
          pageNumber: pageNum,
          hasDocHeader,
          rowStart: start,
          rowEnd: end,
          showTotalRow: Boolean(totalRow) && fitTotal,
          showSecondaryOnPage: hasExtras && fitSecondary,
          showFooterBlock: fitFooter,
        });

        if (!fitTotal || !fitSecondary || !fitFooter) {
          pageNum++;
          computedPages.push({
            pageNumber: pageNum,
            hasDocHeader: false,
            rowStart: rows.length,
            rowEnd: rows.length,
            showTotalRow: Boolean(totalRow) && !fitTotal,
            showSecondaryOnPage: hasExtras && !fitSecondary,
            showFooterBlock: !fitFooter,
          });
        }

        idx = end;
      }

      setPages(computedPages);
    }, [
      rows,
      totalRow,
      secondarySection,
      kpiBoxes,
      bannerNote,
      visibleLeaves,
      uniqueMergedCells,
      effectiveMergeDepth,
      template,
      fallbackMaxBodyHeightPx,
      pageHeightPx,
      padTopPx,
      padBottomPx,
      contentWidthPx,
      fontPt,
      fontReadyTick,
      showRecipientBlock,
      showIntroBlock,
      showCopyBlock,
      showOfficerSignatureBlock,
      subjectResolved,
      introResolved,
      resolvedColWidths,
      tableLayoutFixed,
      footerLayout,
    ]);

    const handlePrint = () => {
      if (typeof window !== 'undefined' && window.AndroidBlobBridge?.printCurrentPage) {
        window.AndroidBlobBridge.printCurrentPage();
        return;
      }
      if (typeof document !== 'undefined') {
        let styleEl = document.getElementById('official-print-page-size') as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'official-print-page-size';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `@media print { @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; } }`;
      }
      window.print();
    };

    const handleDownloadPdf = async () => {
      const container = pagesContainerRef.current;
      if (!container) return;
      setIsExportingPdf(true);
      setPdfStatus('নিকোশ ফন্টে পিডিএফ তৈরি হচ্ছে...');

      try {
        if (document.fonts) {
          await document.fonts.load("14px 'Nikosh'").catch(() => undefined);
          await document.fonts.load("14px 'Noto Serif Bengali'").catch(() => undefined);
          await document.fonts.ready;
        }

        const pageNodes = Array.from(
          container.querySelectorAll('.official-a4-page')
        ) as HTMLElement[];

        if (!pageNodes.length) throw new Error('প্রিন্টযোগ্য কোনো পাতা পাওয়া যায়নি।');

        const doc = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        const pdfW = isLandscape ? 297 : 210;
        const pdfH = isLandscape ? 210 : 297;

        for (let i = 0; i < pageNodes.length; i++) {
          const node = pageNodes[i];
          const canvas = await html2canvas(node, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            width: pageWidthPx,
            height: pageHeightPx,
            windowWidth: pageWidthPx,
            windowHeight: pageHeightPx,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc, clonedNode) => {
              clonedDoc.documentElement.style.margin = '0';
              clonedDoc.documentElement.style.padding = '0';
              clonedDoc.documentElement.style.width = `${pageWidthPx}px`;
              clonedDoc.documentElement.style.height = `${pageHeightPx}px`;
              clonedDoc.documentElement.style.overflow = 'hidden';

              clonedDoc.body.style.margin = '0';
              clonedDoc.body.style.padding = '0';
              clonedDoc.body.style.width = `${pageWidthPx}px`;
              clonedDoc.body.style.height = `${pageHeightPx}px`;
              clonedDoc.body.style.background = '#ffffff';
              clonedDoc.body.style.overflow = 'hidden';

              clonedNode.style.margin = '0';
              clonedNode.style.transform = 'none';
              clonedNode.style.width = `${pageWidthPx}px`;
              clonedNode.style.height = `${pageHeightPx}px`;
              clonedNode.style.border = 'none';
              clonedNode.style.boxShadow = 'none';
              clonedNode.style.boxSizing = 'border-box';

              const fixStyle = clonedDoc.createElement('style');
              fixStyle.textContent = `
                .official-table th,
                .official-table td {
                  overflow-wrap: break-word !important;
                  word-break: normal !important;
                  letter-spacing: 0 !important;
                  line-height: 1.42 !important;
                }
              `;
              clonedDoc.head.appendChild(fixStyle);
              clonedDoc.body.replaceChildren(clonedNode);
            },
          });
          const imgData = canvas.toDataURL('image/png', 1.0);
          if (i > 0) doc.addPage('a4', isLandscape ? 'landscape' : 'portrait');
          doc.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH, undefined, 'FAST');
        }

        if (window.AndroidBlobBridge?.saveBase64File) {
          const dataUri = doc.output('datauristring');
          const base64 = dataUri.split(',')[1] || '';
          window.AndroidBlobBridge.saveBase64File(base64, pdfFileName, 'application/pdf');
        } else {
          doc.save(pdfFileName);
        }
        setPdfStatus('পিডিএফ ডাউনলোড সম্পন্ন হয়েছে!');
        window.setTimeout(() => setPdfStatus(null), 3200);
      } catch (err) {
        setPdfStatus(
          err instanceof Error ? `পিডিএফ ত্রুটি: ${err.message}` : 'পিডিএফ তৈরি করা যায়নি।'
        );
      } finally {
        setIsExportingPdf(false);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        exportPdf: handleDownloadPdf,
        printDoc: handlePrint,
      })
    );

    const renderHeaderBlock = () => (
      <div data-measure="doc-header" className="text-slate-950 font-nikosh">
        <div className="text-center leading-snug mb-2">
          {template.govLine && (
            <div style={{ fontSize: `${fontPt + 0.5}pt` }} className="font-bold">
              {toBnDigits(template.govLine)}
            </div>
          )}
          {template.office1 && (
            <div style={{ fontSize: `${fontPt + 2}pt` }} className="font-bold">
              {toBnDigits(template.office1)}
            </div>
          )}
          {template.office2 && (
            <div style={{ fontSize: `${fontPt + 0.5}pt` }} className="font-semibold">
              {toBnDigits(template.office2)}
            </div>
          )}
          {template.office3 && (
            <div style={{ fontSize: `${fontPt}pt` }}>{toBnDigits(template.office3)}</div>
          )}
          {template.reportTitle && (
            <div
              style={{ fontSize: `${fontPt + 1.5}pt` }}
              className="font-bold mt-1.5 inline-block border-b border-slate-800 px-3 pb-0.5"
            >
              {toBnDigits(template.reportTitle)}
            </div>
          )}
        </div>

        {(showRecipientBlock || memoNo !== undefined) && (
          <div
            style={{ fontSize: `${fontPt}pt` }}
            className="flex justify-between items-baseline border-b border-slate-300 pb-1 mb-2"
          >
            <div>
              <span className="font-semibold">{template.memoLabel}</span>
              <span>{toBnDigits(memoNoDraft || template.memoPrefix)}</span>
            </div>
            <div>
              <span className="font-semibold">{template.dateLabel} </span>
              <span>{formatBnDate(memoDateDraft)} {template.dateSuffix}</span>
            </div>
          </div>
        )}

        {showRecipientBlock && template.recipientLines.trim() && (
          <div style={{ fontSize: `${fontPt}pt` }} className="mb-1.5 leading-snug whitespace-pre-line">
            <div className="font-semibold">প্রাপক,</div>
            <div className="pl-4">{toBnDigits(template.recipientLines)}</div>
          </div>
        )}

        {(subjectResolved || template.subject) && (
          <div style={{ fontSize: `${fontPt}pt` }} className="mb-1.5 leading-snug">
            <span className="font-bold">বিষয়ঃ </span>
            <span>{toBnDigits(subjectResolved || template.subject)}</span>
          </div>
        )}

        {showIntroBlock && (introResolved || template.introText) && (
          <div
            style={{ fontSize: `${fontPt}pt` }}
            className="mb-2 leading-snug text-justify whitespace-pre-line"
          >
            {toBnDigits(introResolved || template.introText)}
          </div>
        )}
      </div>
    );

    const renderThead = (isMeasure = false) => (
      <thead {...(isMeasure ? { 'data-measure': 'thead' } : {})}>
        <tr>
          {showSerialCol && (
            <th
              rowSpan={headerStruct.hasTwoHeaderRows ? 2 : 1}
              style={{
                fontSize: `${Math.max(8, fontPt - 0.5)}pt`,
                whiteSpace: 'pre-line',
                ...(resolvedColWidths ? {} : { width: '36px' }),
              }}
            >
              {serialColLabel}
            </th>
          )}
          {headerStruct.topCells.map((tc, i) => (
            <th
              key={`top-${i}`}
              colSpan={tc.colSpan}
              rowSpan={tc.rowSpan}
              style={{
                fontSize: `${Math.max(8, fontPt - 0.5)}pt`,
                whiteSpace: 'pre-line',
              }}
            >
              {toBnDigits(tc.label)}
            </th>
          ))}
        </tr>
        {headerStruct.hasTwoHeaderRows && (
          <tr>
            {headerStruct.subCells.map((sc, i) => (
              <th
                key={`sub-${sc.key}-${i}`}
                style={{
                  fontSize: `${Math.max(7.5, fontPt - 1)}pt`,
                  whiteSpace: 'pre-line',
                }}
              >
                {toBnDigits(sc.label)}
              </th>
            ))}
          </tr>
        )}
      </thead>
    );

    const renderFooterBlock = (isMeasure = false) => {
      const showSigArea = showOfficerSignatureBlock;
      const isCopyEnabled = showCopyBlock ?? template.showCopyBlock;
      const showCopyArea = Boolean(isCopyEnabled && template.copyList.trim().length > 0);
      const hasFooterNote = Boolean(template.footerNote?.trim());
      if (!showSigArea && !showCopyArea && !hasFooterNote) {
        return <div {...(isMeasure ? { 'data-measure': 'footer' } : {})} />;
      }

      const defaultOfficerSignText = [
        officer.officerName,
        officer.officerDesignation,
        officer.officerPlace,
      ]
        .filter(Boolean)
        .join('\n');

      const renderSigBox = (linesText: string) => (
        <div className="w-64 text-center shrink-0">
          {template.showSignature && sigSrc && (
            <div className="flex justify-center items-end mb-0.5" style={{ minHeight: `${sigHeight}px` }}>
              <img
                src={sigSrc}
                alt="স্বাক্ষর"
                crossOrigin="anonymous"
                style={{
                  maxHeight: `${sigHeight}px`,
                  maxWidth: `${Math.max(150, Math.min(250, Math.round(sigHeight * 4.4)))}px`,
                  objectFit: 'contain',
                }}
              />
            </div>
          )}
          <div className="border-t border-slate-700 pt-1 font-semibold whitespace-pre-line leading-tight">
            {toBnDigits(linesText || defaultOfficerSignText)}
          </div>
        </div>
      );

      const sigBox = showSigArea ? renderSigBox(template.signLines) : null;
      const copySigBox =
        showCopyArea && template.showCopySignature !== false
          ? renderSigBox(template.copySignLines || template.signLines)
          : null;

      const activeMemoNo = memoNoDraft || template.memoPrefix;
      const formattedCopyDate = `${formatBnDate(memoDateDraft)} ${template.dateSuffix}`.trim();
      const customCopyMemo = (template.copyMemoText || '').trim();
      const resolvedCustomCopyMemo = customCopyMemo
        ? customCopyMemo
            .replace(/\{স্মারক\}/g, activeMemoNo)
            .replace(/\{তারিখ\}/g, formattedCopyDate)
        : '';

      const copyBox = showCopyArea && (
        <div className="leading-snug text-left space-y-1.5">
          {template.showCopyMemo !== false && (
            <div className="flex justify-between items-baseline border-t border-slate-300 pt-1.5 pb-0.5">
              <div>
                {customCopyMemo ? (
                  <span className="font-semibold">{toBnDigits(resolvedCustomCopyMemo)}</span>
                ) : (
                  <>
                    <span className="font-semibold">{template.memoLabel}</span>
                    <span>{toBnDigits(activeMemoNo)}</span>
                  </>
                )}
              </div>
              <div>
                <span className="font-semibold">{template.dateLabel} </span>
                <span>{formattedCopyDate}</span>
              </div>
            </div>
          )}

          <div>
            <div className="font-bold underline mb-0.5">
              {toBnDigits(template.copyTitle)}
            </div>
            <ol className="list-none space-y-0.5 pl-1">
              {template.copyList
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i}>
                    {toBnDigits(i + 1)}। {toBnDigits(line)}
                  </li>
                ))}
            </ol>
          </div>

          {copySigBox && <div className="flex justify-end pt-2">{copySigBox}</div>}
        </div>
      );

      return (
        <div
          {...(isMeasure ? { 'data-measure': 'footer' } : {})}
          style={{ fontSize: `${fontPt}pt` }}
          className="mt-4 pt-2 font-nikosh text-slate-950"
        >
          {showCopyArea ? (
            <div className="space-y-3">
              {sigBox && <div className="flex justify-end">{sigBox}</div>}
              {copyBox}
            </div>
          ) : (
            sigBox && <div className="flex justify-end">{sigBox}</div>
          )}

          {hasFooterNote && (
            <div className="mt-2 pt-1 border-t border-slate-300 text-center text-[9pt] text-slate-700">
              {toBnDigits(template.footerNote)}
            </div>
          )}
        </div>
      );
    };

    const renderExtrasSection = (isMeasure = false) => {
      const hasSecondary = Boolean(secondarySection);
      const hasKpis = Boolean(kpiBoxes && kpiBoxes.length > 0);
      const hasBanner = Boolean(bannerNote);
      if (!hasSecondary && !hasKpis && !hasBanner) return null;

      return (
        <div {...(isMeasure ? { 'data-measure': 'secondary' } : {})} className="mt-3 space-y-3">
          {hasBanner && (
            <div
              style={{ fontSize: `${fontPt}pt` }}
              className="border border-slate-400 bg-slate-50 px-3 py-1.5 font-bold text-slate-900 rounded"
            >
              {toBnDigits(bannerNote)}
            </div>
          )}

          {secondarySection && (
            <div>
              <div style={{ fontSize: `${fontPt}pt` }} className="font-bold mb-1 text-slate-900">
                {toBnDigits(secondarySection.title)}
              </div>
              <table className="official-table" style={{ fontSize: `${Math.max(8, fontPt - 0.5)}pt` }}>
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}>ক্রমিক</th>
                    {secondarySection.columns.map((c) => (
                      <th key={c.key}>{toBnDigits(c.label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {secondarySection.rows.map((r, rIdx) => (
                    <tr key={r.id}>
                      <td className="text-center">{toBnDigits(rIdx + 1)}</td>
                      {secondarySection.columns.map((c) => (
                        <td
                          key={c.key}
                          className={
                            c.align === 'right'
                              ? 'text-right'
                              : c.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }
                          style={{ whiteSpace: 'pre-line' }}
                        >
                          {toBnDigits(r.cells[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasKpis && kpiBoxes && (
            <div>
              <div style={{ fontSize: `${fontPt}pt` }} className="font-bold mb-1.5 text-slate-900">
                ৩। যোগফল সারসংক্ষেপ
              </div>
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(4, kpiBoxes.length)}, minmax(0, 1fr))` }}
              >
                {kpiBoxes.map((b, i) => (
                  <div
                    key={i}
                    className={`border rounded px-3 py-2 text-center ${
                      b.tone === 'emerald'
                        ? 'border-emerald-700 bg-emerald-50/50 text-emerald-950'
                        : b.tone === 'amber'
                          ? 'border-amber-700 bg-amber-50/50 text-amber-950'
                          : 'border-slate-800 bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div style={{ fontSize: `${Math.max(8, fontPt - 1)}pt` }} className="font-bold">
                      {toBnDigits(b.label)}
                    </div>
                    <div style={{ fontSize: `${fontPt + 2}pt` }} className="font-bold tabular-nums mt-0.5">
                      {toBnDigits(b.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    };

    const renderColgroup = () => {
      if (!resolvedColWidths) return null;
      return (
        <colgroup>
          {resolvedColWidths.map((w, idx) => (
            <col key={idx} style={{ width: w }} />
          ))}
        </colgroup>
      );
    };

    const renderTableSlice = (slice: PageSlice) => {
      const sliceRows = rows.slice(slice.rowStart, slice.rowEnd);
      const spans = computeSliceRowSpans(rows, slice.rowStart, slice.rowEnd, effectiveMergeDepth);
      const showBodyTable = sliceRows.length > 0 || slice.showTotalRow;

      if (!showBodyTable) return null;

      return (
        <table
          className="official-table"
          style={{
            fontSize: `${Math.max(7.5, fontPt - 0.5)}pt`,
            ...(tableLayoutFixed && resolvedColWidths ? { tableLayout: 'fixed' } : {}),
          }}
        >
          {renderColgroup()}
          {renderThead(false)}
          <tbody>
            {sliceRows.map((row, localIdx) => {
              const globalIdx = slice.rowStart + localIdx;
              const serialNum = serialPerRow
                ? globalIdx + 1
                : (globalSerials[globalIdx] ?? globalIdx + 1);
              const serialSpan = serialPerRow
                ? 1
                : effectiveMergeDepth > 0
                  ? (spans[localIdx]?.[effectiveMergeDepth - 1] ?? 1)
                  : 1;
              const bgClass =
                row.highlight === 'excess'
                  ? 'bg-emerald-50/60'
                  : row.highlight === 'deficit'
                    ? 'bg-rose-50/60'
                    : '';

              return (
                <tr key={row.id} className={bgClass}>
                  {showSerialCol && serialSpan > 0 && (
                    <td
                      rowSpan={serialSpan > 1 ? serialSpan : undefined}
                      className="text-center font-semibold"
                    >
                      {toBnDigits(serialNum)}
                    </td>
                  )}
                  {visibleLeaves.map((leaf, leafIdx) => {
                    if (leafIdx < effectiveMergeDepth) {
                      const span = spans[localIdx]?.[leafIdx] ?? 1;
                      if (span === 0) return null;
                      return (
                        <td
                          key={leaf.key}
                          rowSpan={span > 1 ? span : undefined}
                          className={
                            leaf.align === 'right'
                              ? 'text-right'
                              : leaf.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }
                          style={{ whiteSpace: 'pre-line' }}
                        >
                          {toBnDigits(row.cells[leaf.key] ?? '—')}
                        </td>
                      );
                    }

                    if (leaf.isSignature) {
                      return (
                        <td
                          key={leaf.key}
                          className="text-center align-middle"
                          style={{
                            minWidth: `${Math.max(isLandscape ? 76 : 56, Math.round(sigHeight * 2.8))}px`,
                          }}
                        >
                          {row.hasSignature && template.showSignature && sigSrc ? (
                            <div className="flex justify-center items-center py-0.5">
                              <img
                                src={sigSrc}
                                alt="স্বাক্ষর"
                                crossOrigin="anonymous"
                                style={{
                                  maxHeight: `${sigHeight}px`,
                                  maxWidth: `${Math.max(76, Math.round(sigHeight * 3.1))}px`,
                                  objectFit: 'contain',
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-slate-300 select-none"> </span>
                          )}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={leaf.key}
                        className={
                          leaf.align === 'right'
                            ? 'text-right'
                            : leaf.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        }
                        style={{ whiteSpace: 'pre-line' }}
                      >
                        {toBnDigits(row.cells[leaf.key] ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {slice.showTotalRow && totalRow && (
              <tr className="bg-slate-100 font-bold">
                {((showSerialCol ? 1 : 0) + filteredLabelColSpan) > 0 && (
                  <td
                    colSpan={(showSerialCol ? 1 : 0) + Math.max(0, filteredLabelColSpan)}
                    className="text-right"
                  >
                    {toBnDigits(totalRow.label)}
                  </td>
                )}
                {visibleLeaves
                  .slice(Math.max(0, filteredLabelColSpan))
                  .map((leaf) => (
                    <td
                      key={`tot-${leaf.key}`}
                      className={
                        leaf.align === 'right'
                          ? 'text-right'
                          : leaf.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      }
                    >
                      {toBnDigits(totalRow.values[leaf.key] ?? '')}
                    </td>
                  ))}
              </tr>
            )}
          </tbody>
        </table>
      );
    };

    return (
      <div className="space-y-3">
        {!hideDefaultToolbar && (
          <div className="no-print rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                  <FileText className="h-4 w-4 text-[#E2136E]" />
                  {toBnDigits(template.reportTitle)}
                </span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-slate-600">
                  {isLandscape ? 'A4 আড়াআড়ি (Landscape)' : 'A4 লম্বালম্বি (Portrait)'}
                </span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-slate-600">
                  মোট {toBnDigits(rows.length)} সারি · {toBnDigits(pages.length)} পাতা
                </span>
                {summaryText && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-[#E2136E]">{toBnDigits(summaryText)}</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 px-1.5 py-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setZoomPct((z) => Math.max(40, z - 10))}
                    className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
                    title="ছোট করুন"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 w-10 text-center tabular-nums">
                    {toBnDigits(zoomPct)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomPct((z) => Math.min(115, z + 10))}
                    className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
                    title="বড় করুন"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                {onEditTemplate && (
                  <button
                    type="button"
                    onClick={onEditTemplate}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-slate-600" />
                    <span>টেমপ্লেট এডিট</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrint}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-700" />
                  <span>প্রিন্ট</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => void handleDownloadPdf()}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-60 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isExportingPdf ? 'তৈরি হচ্ছে...' : 'PDF ডাউনলোড (নিকোশ)'}</span>
                </button>
              </div>
            </div>

            {(onSaveMemo || toolbarExtra) && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
                {onSaveMemo && (
                  <>
                    <div className="min-w-[200px] flex-1 max-w-xs">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        স্মারক নম্বর (স্বয়ংক্রিয় সেভ)
                      </label>
                      <input
                        type="text"
                        value={memoNoDraft}
                        onChange={(e) => {
                          setMemoNoDraft(e.target.value);
                          onSaveMemo(e.target.value, memoDateDraft);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                    <div className="w-40">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        তারিখ
                      </label>
                      <input
                        type="date"
                        value={memoDateDraft}
                        onChange={(e) => {
                          setMemoDateDraft(e.target.value);
                          onSaveMemo(memoNoDraft, e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#E2136E]"
                      />
                    </div>
                  </>
                )}
                {toolbarExtra}
              </div>
            )}
          </div>
        )}

        {pdfStatus && (
          <div className="no-print text-xs font-bold text-[#E2136E] bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
            {pdfStatus}
          </div>
        )}

        {/* Offscreen Measurement Container */}
        <div
          ref={measureRootRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            width: `${contentWidthPx}px`,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
          className="font-nikosh"
        >
          {renderHeaderBlock()}
          <div
            data-measure="cont-header"
            style={{ fontSize: `${Math.max(8, fontPt - 1)}pt` }}
            className="flex justify-between items-center border-b border-slate-300 pb-1 mb-2 text-slate-600"
          >
            <span className="font-bold text-slate-900">
              {toBnDigits(template.reportTitle)} (চলমান পাতা)
            </span>
            <span>{toBnDigits(template.office1)}</span>
          </div>
          <table
            className="official-table"
            style={{
              width: `${contentWidthPx}px`,
              fontSize: `${Math.max(7.5, fontPt - 0.5)}pt`,
              ...(tableLayoutFixed && resolvedColWidths ? { tableLayout: 'fixed' } : {}),
            }}
          >
            {renderColgroup()}
            {renderThead(true)}
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`m-${row.id}`} data-measure-row={idx}>
                  {showSerialCol && (
                    <td>{toBnDigits(serialPerRow ? idx + 1 : (globalSerials[idx] ?? idx + 1))}</td>
                  )}
                  {visibleLeaves.map((leaf, leafIdx) => (
                    <td
                      key={leaf.key}
                      style={{
                        whiteSpace: 'pre-line',
                        ...(leaf.isSignature
                          ? { minWidth: isLandscape ? '76px' : '56px', height: '30px' }
                          : {}),
                      }}
                    >
                      {leafIdx < effectiveMergeDepth
                        ? ' '
                        : leaf.isSignature
                          ? ' '
                          : toBnDigits(row.cells[leaf.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {totalRow && (
                <tr data-measure="total-row">
                  {((showSerialCol ? 1 : 0) + filteredLabelColSpan) > 0 && (
                    <td colSpan={(showSerialCol ? 1 : 0) + Math.max(0, filteredLabelColSpan)}>
                      {totalRow.label}
                    </td>
                  )}
                  {visibleLeaves.slice(Math.max(0, filteredLabelColSpan)).map((leaf) => (
                    <td key={leaf.key}>{toBnDigits(totalRow.values[leaf.key] ?? '')}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          {uniqueMergedCells.length > 0 && (
            <table
              className="official-table"
              style={{
                width: `${contentWidthPx}px`,
                fontSize: `${Math.max(7.5, fontPt - 0.5)}pt`,
                ...(tableLayoutFixed && resolvedColWidths ? { tableLayout: 'fixed' } : {}),
              }}
            >
              {renderColgroup()}
              <tbody>
                {uniqueMergedCells.map((item, mIdx) => (
                  <tr key={`mm-${mIdx}`}>
                    {showSerialCol && <td> </td>}
                    {visibleLeaves.map((leaf, leafIdx) => (
                      <td
                        key={leaf.key}
                        style={{ whiteSpace: 'pre-line' }}
                        {...(leafIdx === item.colIdx
                          ? { 'data-measure-merged': `${item.colIdx}::${item.text}` }
                          : {})}
                      >
                        {leafIdx === item.colIdx ? item.text : ' '}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {renderExtrasSection(true)}
          {renderFooterBlock(true)}
          <div
            data-measure="page-footer"
            style={{ fontSize: `${Math.max(7.5, fontPt - 1.5)}pt` }}
            className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-slate-500 shrink-0"
          >
            <span>{toBnDigits(template.office1)}, {toBnDigits(template.office2)}</span>
            <span className="font-semibold text-slate-700">পৃষ্ঠা ১ / ১</span>
          </div>
        </div>

        {/* Rendered Visible Paginated A4 Sheets */}
        <div className="official-print-scroll-wrap overflow-x-auto pb-2">
          <div
            ref={pagesContainerRef}
            className="official-print-pages-host flex flex-col items-center gap-6 mx-auto"
            style={{
              transform: `scale(${zoomPct / 100})`,
              transformOrigin: 'top center',
              minWidth: `${Math.round(pageWidthPx * (zoomPct / 100))}px`,
              marginBottom: `${Math.round(
                (pages.length * pageHeightPx + Math.max(0, pages.length - 1) * 24) *
                  (zoomPct / 100 - 1)
              )}px`,
            }}
          >
            {pages.map((slice) => (
              <div
                key={slice.pageNumber}
                className={`official-a4-page ${
                  isLandscape ? 'official-a4-page--landscape' : 'official-a4-page--portrait'
                } bg-white border border-slate-300 shadow-sm font-nikosh flex flex-col justify-between shrink-0`}
                style={{
                  width: `${pageWidthPx}px`,
                  height: `${pageHeightPx}px`,
                  paddingTop: `${padTopPx}px`,
                  paddingRight: `${padRightPx}px`,
                  paddingBottom: `${padBottomPx}px`,
                  paddingLeft: `${padLeftPx}px`,
                  boxSizing: 'border-box',
                }}
              >
                <div className="min-h-0 flex-1 overflow-hidden">
                  {slice.hasDocHeader ? (
                    renderHeaderBlock()
                  ) : (
                    <div
                      style={{ fontSize: `${Math.max(8, fontPt - 1)}pt` }}
                      className="flex justify-between items-center border-b border-slate-300 pb-1 mb-2 text-slate-600"
                    >
                      <span className="font-bold text-slate-900">
                        {toBnDigits(template.reportTitle)} (চলমান পাতা)
                      </span>
                      <span>{toBnDigits(template.office1)}</span>
                    </div>
                  )}

                  {rows.length === 0 && !totalRow ? (
                    <div className="border border-dashed border-slate-300 rounded-lg py-10 text-center text-xs text-slate-500">
                      নির্বাচিত শর্ত অনুযায়ী এই রেজিস্টার/রিপোর্টে কোনো তথ্য পাওয়া যায়নি।
                    </div>
                  ) : (
                    renderTableSlice(slice)
                  )}

                  {slice.showSecondaryOnPage && renderExtrasSection(false)}
                  {slice.showFooterBlock && renderFooterBlock(false)}
                </div>

                <div
                  style={{ fontSize: `${Math.max(7.5, fontPt - 1.5)}pt` }}
                  className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-slate-500 shrink-0"
                >
                  <span>{toBnDigits(template.office1)}, {toBnDigits(template.office2)}</span>
                  <span className="font-semibold text-slate-700">
                    পৃষ্ঠা {toBnDigits(slice.pageNumber)} / {toBnDigits(pages.length)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

OfficialA4Document.displayName = 'OfficialA4Document';
