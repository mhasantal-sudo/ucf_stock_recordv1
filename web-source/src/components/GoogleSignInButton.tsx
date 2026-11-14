import React from 'react';
import { Loader2, LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';

interface GoogleSignInButtonProps {
  user: User | null;
  hasToken: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  compact?: boolean;
  label?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  user,
  hasToken,
  isSigningIn,
  onSignIn,
  onSignOut,
  compact = false,
  label = 'গুগল দিয়ে লগইন করুন',
}) => {
  if (user && hasToken) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || user.email || 'Google'}
            className="h-6 w-6 rounded-full border border-emerald-300 shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="min-w-0 leading-tight">
          <div className="font-bold text-emerald-950 truncate max-w-[160px]">
            {user.displayName || 'Google যুক্ত'}
          </div>
          {!compact && user.email && (
            <div className="text-[10px] text-emerald-800/80 truncate max-w-[180px]">
              {user.email}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="ml-1 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 px-2 py-1 text-[11px] font-bold text-slate-700 cursor-pointer shrink-0"
          title="Google সাইন আউট"
        >
          <LogOut className="h-3 w-3" />
          <span>সাইন আউট</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={isSigningIn}
      className="gsi-material-button"
    >
      <div className="gsi-material-button-state" />
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          {isSigningIn ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          ) : (
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              style={{ display: 'block' }}
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
          )}
        </div>
        <span className="gsi-material-button-contents">
          {isSigningIn ? 'সংযোগ হচ্ছে...' : label}
        </span>
      </div>
    </button>
  );
};
