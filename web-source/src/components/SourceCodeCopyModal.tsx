import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { DEFAULT_ANDROID_CONFIG } from '../shared/androidConfig';
import { triggerBlobDownload } from '../shared/downloadUtils';
import { getApiBaseOrigin, isInEmbeddedIframe } from '../shared/googleAuth';

interface SourceFileItem {
  path: string;
  category: string;
  size: number;
  content: string;
}

interface SourceCodeCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apkAppName?: string;
  apkPackageName?: string;
}

type CodeScope = 'web' | 'android';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function copyTextReliable(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const SourceCodeCopyModal: React.FC<SourceCodeCopyModalProps> = ({
  isOpen,
  onClose,
  apkAppName = DEFAULT_ANDROID_CONFIG.appName,
  apkPackageName = DEFAULT_ANDROID_CONFIG.packageName,
}) => {
  const [scope, setScope] = useState<CodeScope>('web');
  const [webFiles, setWebFiles] = useState<SourceFileItem[]>([]);
  const [androidFiles, setAndroidFiles] = useState<SourceFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const cancelBatchDownloadRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadFiles = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiBaseOrigin = getApiBaseOrigin();
        if (scope === 'web') {
          if (webFiles.length > 0) {
            setLoading(false);
            return;
          }
          const res = await fetch(`${apiBaseOrigin}/api/source-files`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            ok: boolean;
            files?: SourceFileItem[];
            error?: string;
          };
          if (!data.ok || !Array.isArray(data.files)) {
            throw new Error(data.error || 'সোর্স ফাইল লোড করা যায়নি।');
          }
          if (!cancelled) {
            setWebFiles(data.files);
          }
        } else {
          const res = await fetch(`${apiBaseOrigin}/api/android-source-files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...DEFAULT_ANDROID_CONFIG,
              appName: apkAppName.trim() || DEFAULT_ANDROID_CONFIG.appName,
              packageName: apkPackageName.trim() || DEFAULT_ANDROID_CONFIG.packageName,
              targetUrl: window.location.origin,
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            ok: boolean;
            files?: SourceFileItem[];
            error?: string;
          };
          if (!data.ok || !Array.isArray(data.files)) {
            throw new Error(data.error || 'Android ফাইল লোড করা যায়নি।');
          }
          if (!cancelled) {
            setAndroidFiles(data.files);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'সোর্স কোড লোড করা যায়নি। মোবাইল Chrome দিয়ে সার্ভার লিংকে খুলুন।'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [isOpen, scope, webFiles.length, apkAppName, apkPackageName]);

  const activeFiles = scope === 'web' ? webFiles : androidFiles;

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeFiles;
    return activeFiles.filter(
      (f) => f.path.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
  }, [activeFiles, searchQuery]);

  if (!isOpen) return null;

  const markCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  const handleCopyFile = async (file: SourceFileItem) => {
    const ok = await copyTextReliable(file.content);
    if (ok) markCopied(`code:${file.path}`);
  };

  const handleCopyPath = async (filePath: string) => {
    const ok = await copyTextReliable(filePath);
    if (ok) markCopied(`path:${filePath}`);
  };

  const buildCombinedSourceText = (files: SourceFileItem[]) =>
    files
      .map(
        (f) =>
          `// ==========================================\n// FILE: ${f.path}\n// ==========================================\n${f.content}`
      )
      .join('\n\n');

  const triggerTextDownload = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, fileName);
  };

  const inIframe = isInEmbeddedIframe();
  const apiBaseOrigin = getApiBaseOrigin();
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const serverBase = apiBaseOrigin || currentOrigin;
  const combinedTxtFileName =
    scope === 'web'
      ? 'khaddo-stock-web-all-code.txt'
      : 'khaddo-stock-android-all-code.txt';
  const directTxtPath = `${apiBaseOrigin}/api/download-source-txt?scope=${scope}&appName=${encodeURIComponent(
    apkAppName
  )}&packageName=${encodeURIComponent(apkPackageName)}`;
  const fullTxtUrl = `${serverBase}/api/download-source-txt?scope=${scope}&appName=${encodeURIComponent(
    apkAppName
  )}&packageName=${encodeURIComponent(apkPackageName)}`;
  const fullZipUrl = `${serverBase}/api/download-source-zip`;

  const handleCopyAll = async () => {
    if (filteredFiles.length === 0) return;
    const combined = buildCombinedSourceText(filteredFiles);
    const ok = await copyTextReliable(combined);
    if (ok) markCopied('ALL_FILES');
  };

  const handleCopyDownloadUrl = async (urlToCopy: string, key: string) => {
    const ok = await copyTextReliable(urlToCopy);
    if (ok) markCopied(key);
  };

  const handleDownloadAllSeparate = async () => {
    if (filteredFiles.length === 0 || downloadProgress) return;
    cancelBatchDownloadRef.current = false;
    setDownloadProgress({ done: 0, total: filteredFiles.length });
    try {
      for (let i = 0; i < filteredFiles.length; i += 1) {
        if (cancelBatchDownloadRef.current) break;
        const file = filteredFiles[i];
        const safeFlatName = file.path.replace(/\//g, '__');
        triggerTextDownload(safeFlatName, file.content);
        setDownloadProgress({ done: i + 1, total: filteredFiles.length });
        await new Promise((r) => window.setTimeout(r, 260));
      }
    } finally {
      setDownloadProgress(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-copy-title"
    >
      <div className="w-full max-w-4xl h-[92vh] sm:h-[86vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
              <FileCode2 className="h-4.5 w-4.5 text-[#E2136E]" />
            </div>
            <div className="min-w-0">
              <h2 id="source-copy-title" className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                অ্যাপের সকল সোর্স কোড (জিপ ছাড়া — সরাসরি কপি)
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                যেকোনো ফাইলের কোড ১ ক্লিকে কপি করে GitHub বা এডিটরে পেস্ট করুন ({activeFiles.length}টি ফাইল)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer shrink-0"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-white space-y-2.5 shrink-0">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setScope('web')}
              className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                scope === 'web'
                  ? 'bg-white text-[#E2136E] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ওয়েব অ্যাপের সকল কোড ({webFiles.length || 'সব ফাইল'})
            </button>
            <button
              type="button"
              onClick={() => setScope('android')}
              className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                scope === 'android'
                  ? 'bg-white text-[#E2136E] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Android APK ও GitHub Actions ({androidFiles.length || '১৮টি ফাইল'})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ফাইল খুঁজুন (যেমন: App.tsx, server.ts, build-apk.yml)"
                className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 focus:border-[#E2136E] focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleCopyAll()}
              disabled={filteredFiles.length === 0}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer shrink-0"
            >
              {copiedKey === 'ALL_FILES' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>সব কপি হয়েছে!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>সব ফাইল একসাথে কপি ({filteredFiles.length})</span>
                </>
              )}
            </button>

            <a
              href={directTxtPath}
              target={inIframe ? '_blank' : undefined}
              rel={inIframe ? 'noopener noreferrer' : undefined}
              download={inIframe ? undefined : combinedTxtFileName}
              onClick={() => markCopied('DOWNLOAD_TXT')}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] px-3 py-1.5 text-xs font-bold text-white shrink-0"
            >
              {copiedKey === 'DOWNLOAD_TXT' ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>{inIframe ? 'নতুন ট্যাবে খোলা হয়েছে' : 'ডাউনলোড শুরু হয়েছে'}</span>
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  <span>সব ফাইল একসাথে ডাউনলোড (.txt)</span>
                </>
              )}
            </a>

            {!inIframe &&
              (downloadProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelBatchDownloadRef.current = true;
                  }}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 cursor-pointer shrink-0"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    ডাউনলোড ({downloadProgress.done}/{downloadProgress.total}) · থামান
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleDownloadAllSeparate()}
                  disabled={filteredFiles.length === 0}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-[#E2136E]" />
                  <span>সব ফাইল আলাদা ডাউনলোড</span>
                </button>
              ))}
          </div>

          {inIframe && typeof window !== 'undefined' && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-950 space-y-1.5">
              <div className="font-bold">
                ⚠️ AI Studio প্রিভিউ ফ্রেমে Chrome ফাইল ডাউনলোড ব্লক করতে পারে। নিচের যেকোনো একটি ব্যবহার করলে ফাইল সরাসরি Chrome Downloads / Files-এ সেভ হবে:
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#E2136E] hover:bg-[#B80D58] px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Chrome-এ নতুন ট্যাবে খুলুন</span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyDownloadUrl(fullTxtUrl, 'COPY_TXT_URL')}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white hover:bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-900 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedKey === 'COPY_TXT_URL' ? 'লিংক কপি হয়েছে — Chrome-এ Paste করুন!' : '.txt ডাউনলোড লিংক কপি'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyDownloadUrl(fullZipUrl, 'COPY_ZIP_URL')}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white hover:bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-900 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedKey === 'COPY_ZIP_URL' ? 'ZIP লিংক কপি হয়েছে — Chrome-এ Paste করুন!' : '.zip ডাউনলোড লিংক কপি'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5 bg-slate-50">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-6 w-6 animate-spin text-[#E2136E]" />
              <span>সব ফাইল লোড হচ্ছে...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-900">
              {error}
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              কোনো ফাইল খুঁজে পাওয়া যায়নি।
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isOpenCode = Boolean(expandedPaths[file.path]);
              const isCopiedCode = copiedKey === `code:${file.path}`;
              const isCopiedPath = copiedKey === `path:${file.path}`;

              return (
                <div
                  key={file.path}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                >
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-xs font-extrabold text-slate-900 break-all">
                          {file.path}
                        </code>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{file.category}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleCopyPath(file.path)}
                        className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 cursor-pointer"
                        title="ফাইলের নাম/পাথ কপি করুন"
                      >
                        {isCopiedPath ? (
                          <Check className="h-3 w-3 text-emerald-700" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{isCopiedPath ? 'পাথ কপি' : 'পাথ'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyFile(file)}
                        className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-bold text-white cursor-pointer transition-colors ${
                          isCopiedCode
                            ? 'bg-emerald-600'
                            : 'bg-[#E2136E] hover:bg-[#B80D58]'
                        }`}
                      >
                        {isCopiedCode ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>কপি হয়েছে ✓</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>কোড কপি</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`${apiBaseOrigin}/api/download-single-source-file?scope=${scope}&path=${encodeURIComponent(
                          file.path
                        )}&appName=${encodeURIComponent(apkAppName)}&packageName=${encodeURIComponent(
                          apkPackageName
                        )}`}
                        target={inIframe ? '_blank' : undefined}
                        rel={inIframe ? 'noopener noreferrer' : undefined}
                        download={inIframe ? undefined : file.path.split('/').pop() || 'code.txt'}
                        className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                        title="সরাসরি ফাইল ডাউনলোড"
                      >
                        <Download className="h-3 w-3" />
                        <span>সেভ</span>
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPaths((prev) => ({
                            ...prev,
                            [file.path]: !prev[file.path],
                          }))
                        }
                        className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 cursor-pointer"
                      >
                        <span>{isOpenCode ? 'লুকান' : 'কোড দেখুন'}</span>
                        {isOpenCode ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isOpenCode && (
                    <div className="border-t border-slate-200 bg-slate-950 text-slate-100 max-h-[380px] overflow-auto p-3.5 font-mono text-[11px] leading-relaxed">
                      <pre className="whitespace-pre select-all">
                        <code>{file.content}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
