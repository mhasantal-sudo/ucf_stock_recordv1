import React, { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { googleSignIn, submitAndroidAuthHandoff } from '../shared/googleAuth';

interface AndroidAuthBridgeScreenProps {
  sessionState: string;
}

export const AndroidAuthBridgeScreen: React.FC<AndroidAuthBridgeScreenProps> = ({
  sessionState,
}) => {
  const [status, setStatus] = useState<'ready' | 'signing_in' | 'completed' | 'error'>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>(
    'গুগল অ্যাকাউন্ট নির্বাচন করতে নিচের বাটনে ট্যাপ করুন।'
  );

  const handleStartSignIn = async () => {
    setErrorMsg(null);
    setStatus('signing_in');
    setDebugInfo('Google অ্যাকাউন্ট পপআপ চালু হচ্ছে...');
    try {
      const { user, accessToken } = await googleSignIn();
      setDebugInfo('লগইন সফল! অ্যান্ড্রয়েড অ্যাপে সেশন পাঠানো হচ্ছে...');
      await submitAndroidAuthHandoff(sessionState, user, accessToken);
      setStatus('completed');
      setDebugInfo('লগইন সম্পন্ন হয়েছে! এখন এই ট্যাব বন্ধ করে অ্যান্ড্রয়েড অ্যাপে ফিরে যান।');

      const params = new URLSearchParams({
        state: sessionState,
        accessToken,
        email: user.email || '',
        displayName: user.displayName || '',
        uid: user.uid || '',
        photoUrl: user.photoURL || '',
      });
      window.location.href = `khaddostock://auth-callback?${params.toString()}`;
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'গুগল লগইন ব্যর্থ হয়েছে।');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-nikosh">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-lg p-6 space-y-5 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center">
          {status === 'completed' ? (
            <CheckCircle2 className="h-8 w-8 text-[#E2136E]" />
          ) : (
            <ShieldCheck className="h-8 w-8 text-[#E2136E]" />
          )}
        </div>

        <div className="space-y-1">
          <h1 className="text-lg font-extrabold text-slate-900">
            অ্যান্ড্রয়েড অ্যাপ · Google Sign-In
          </h1>
          <p className="text-xs text-slate-600">{debugInfo}</p>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          disabled={status === 'signing_in' || status === 'completed'}
          onClick={() => void handleStartSignIn()}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E2136E] hover:bg-[#B80D58] disabled:opacity-60 px-4 py-3 text-sm font-bold text-white shadow-sm cursor-pointer"
        >
          {status === 'signing_in' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Google লগইন চালু হচ্ছে...</span>
            </>
          ) : status === 'completed' ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>অ্যাপে ফিরছে...</span>
            </>
          ) : (
            <span>Google দিয়ে লগইন সম্পন্ন করুন</span>
          )}
        </button>

        <p className="text-[11px] text-slate-500">
          সফল হলে এই পেজ থেকে স্বয়ংক্রিয়ভাবে আপনার অ্যান্ড্রয়েড অ্যাপে ফিরে যাবে।
        </p>
      </div>
    </div>
  );
};
