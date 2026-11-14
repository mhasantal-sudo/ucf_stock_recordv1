import React from 'react';
import { CloudOff, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-20 lg:bottom-3 right-3 z-40 flex flex-col gap-2 items-end pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-lg"
      >
        <WifiOff className="h-3.5 w-3.5 text-amber-700 shrink-0" />
        <span>অফলাইন মোড · লোকাল সংরক্ষণ চালু</span>
        <CloudOff className="h-3.5 w-3.5 text-amber-700 shrink-0" />
      </div>
    </div>
  );
};
