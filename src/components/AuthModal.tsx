import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Lock, Mail, User, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
  pendingReferralCode?: string | null;
  onSuccessMessage?: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccessMessage,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Switched to Sign In — enter your password to log back into your existing account.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Incorrect email or password. Please verify your credentials or reset your password.';
      case 'auth/user-not-found':
        return 'No account found with this email. Switch to Create Account to register.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method for project tishara-4c030. Please enable it or use Google Sign-In below.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in popup was closed before completing.';
      default:
        return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim();
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfo('Password reset link sent to your email.');
        setLoading(false);
        return;
      }

      if (mode === 'signup') {
        try {
          const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          if (name.trim()) {
            await updateProfile(cred.user, { displayName: name.trim() });
          }
          onSuccessMessage?.('Welcome to TISAHARA! Your account is ready.');
          onClose();
        } catch (signupErr) {
          const code = (signupErr as { code?: string })?.code;
          if (code === 'auth/email-already-in-use') {
            setMode('login');
          }
          setError(formatAuthError(signupErr));
        }
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        onSuccessMessage?.('Signed in to your TISAHARA account.');
        onClose();
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccessMessage?.('Signed in with Google.');
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="TISAHARA Account Authentication"
    >
      <div className="bg-[#FFFFFF] rounded-2xl border border-purple-200 w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-6 py-5 bg-[#FAF5FF] border-b border-purple-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              {mode === 'login'
                ? 'Sign in to TISAHARA'
                : mode === 'signup'
                ? 'Create TISAHARA Account'
                : 'Reset Password'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Shop curated deals or manage your seller store
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-purple-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {mode !== 'reset' && (
            <div className="grid grid-cols-2 p-1 bg-[#FAF5FF] border border-purple-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#7E22CE] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-[#7E22CE] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#7E22CE] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ananya Sharma"
                    className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7E22CE] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-800">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                      }}
                      className="text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7E22CE] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7E22CE]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#7E22CE] hover:bg-[#6B21A8] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-xs font-semibold text-[#6B21A8] hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            )}
          </form>

          {mode !== 'reset' && (
            <>
              <div className="relative flex items-center justify-center">
                <div className="border-t border-purple-100 w-full" />
                <span className="bg-white px-3 text-xs text-slate-500 whitespace-nowrap">
                  or continue with
                </span>
                <div className="border-t border-purple-100 w-full" />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-xl border border-purple-200 bg-white hover:bg-[#FAF5FF] text-slate-900 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 12.3s.6 3.3 1.6 5.3l3.7-2.8z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.2 0 6-1.1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 17.2C3.5 21.1 7.4 24 12 24z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
