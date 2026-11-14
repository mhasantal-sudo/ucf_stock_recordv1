import React from 'react';
import { Check, Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap shrink-0">
        <Check className="h-3 w-3" /> ইনস্টল্ড
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="min-h-[34px] inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="h-3 w-3" /> অ্যাপ ইনস্টল
      </button>
    );
  }

  if (isIOS) {
    return (
      <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white whitespace-nowrap shrink-0">
        Share → Add to Home
      </span>
    );
  }

  return null;
};
