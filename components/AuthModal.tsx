import React, { useState, useEffect, useRef } from 'react';
import {
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
  completeGoogleSignUp,
  generateRandomUsername,
  UserProfile
} from '../services/authService';
import {
  X,
  Mail,
  Lock,
  User,
  Dices,
  AlertCircle,
  LogIn,
  UserPlus,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { ActionLimitService } from '../services/actionLimitService';
import { firebaseConfig } from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  initialTab?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess, initialTab = 'login' }) => {
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [operationNotAllowed, setOperationNotAllowed] = useState(false);
  const [isGoogleAccountError, setIsGoogleAccountError] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [accountNotFoundNotice, setAccountNotFoundNotice] = useState(false);
  const [loading, setLoading] = useState(false);

  // For first-time Google sign-in requiring manual username setup
  const [pendingGoogleUser, setPendingGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleUsername, setGoogleUsername] = useState('');
  const [googlePassword, setGooglePassword] = useState('');
  const [confirmGooglePassword, setConfirmGooglePassword] = useState('');

  const usernameInputRef = useRef<HTMLInputElement>(null);

  const consoleAuthUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      setOperationNotAllowed(false);
      setIsGoogleAccountError(false);
      setCopiedLink(false);
      setAccountNotFoundNotice(false);
      setPendingGoogleUser(null);
      setGoogleUsername('');
      setGooglePassword('');
      setConfirmGooglePassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleRandomizeUsername = () => {
    const random = generateRandomUsername();
    if (pendingGoogleUser) {
      setGoogleUsername(random);
    } else {
      setUsername(random);
    }
    setError(null);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOperationNotAllowed(false);
    setIsGoogleAccountError(false);
    setLoading(true);

    try {
      if (tab === 'signup') {
        if (!username.trim()) {
          setError('Please manually choose a username for your account.');
          setLoading(false);
          usernameInputRef.current?.focus();
          return;
        }

        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError('Passwords do not match. Please ensure both passwords are identical.');
          setLoading(false);
          return;
        }

        const res = await registerWithEmail(email, password, username);
        if (res.operationNotAllowed) {
          setOperationNotAllowed(true);
          setError(res.error || 'Email/Password sign-in is disabled in Firebase.');
        } else if (res.error) {
          setError(res.error);
        } else if (res.user) {
          onAuthSuccess(res.user);
          onClose();
        }
      } else {
        const res = await loginWithEmail(email, password);
        if (res.operationNotAllowed) {
          setOperationNotAllowed(true);
          setIsGoogleAccountError(!!res.isGoogleAccount);
          setError(res.error || 'Email/Password sign-in is disabled in Firebase.');
        } else if (res.accountNotFound) {
          // Immediately switch to manual setup mode so user can set their username and password
          setTab('signup');
          setAccountNotFoundNotice(true);
          setError(null);
          // Focus username input field
          setTimeout(() => {
            usernameInputRef.current?.focus();
          }, 100);
        } else if (res.error) {
          setError(res.error);
        } else if (res.user) {
          onAuthSuccess(res.user);
          onClose();
        }
      }
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
        setOperationNotAllowed(true);
        setError('Email/Password sign-in is disabled in your Firebase project.');
      } else {
        setError(err.message || 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res.error) {
        setError(res.error);
      } else if (res.needsUsername && res.googleUser) {
        // User is logging in with a new Google account that doesn't exist yet:
        // Do NOT set username automatically - let user manually set their username and password first!
        setPendingGoogleUser(res.googleUser);
        setGoogleUsername('');
        setGooglePassword('');
      } else if (res.user) {
        onAuthSuccess(res.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteGoogleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    if (!googleUsername.trim()) {
      setError('Please enter your desired username.');
      return;
    }

    if (googlePassword) {
      if (googlePassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (googlePassword !== confirmGooglePassword) {
        setError('Passwords do not match. Please ensure both passwords are identical.');
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      const res = await completeGoogleSignUp(pendingGoogleUser, googleUsername, googlePassword);
      if (res.error) {
        setError(res.error);
      } else if (res.user) {
        onAuthSuccess(res.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete account setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-xl shadow-2xl p-6 relative">
        {/* Close Button */}
        <button
          id="close-auth-modal"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Close"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wider">AIFINITY ACCOUNT</h2>
            <p className="text-[11px] text-neutral-400">
              Unlock 20 daily free actions & save your adventures
              {ActionLimitService.getPhase() === 'beta' && (
                <span className="text-blue-400 font-medium ml-1">(+10 daily free actions during Beta)</span>
              )}
            </p>
          </div>
        </div>

        {/* Pending Google Setup Mode (New account setup) */}
        {pendingGoogleUser ? (
          <form onSubmit={handleCompleteGoogleUsername} className="space-y-4">
            <div className="p-3 bg-blue-950/60 border border-blue-800/60 rounded-lg text-xs text-blue-200 space-y-1">
              <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Google Account Connected ({pendingGoogleUser.email})</span>
              </div>
              <p className="text-neutral-300 text-[11px] leading-relaxed">
                Please manually set your desired username and an optional password below to finish creating your account.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1">
                Choose Username <span className="text-neutral-400 font-normal">(2-20 letters/numbers)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={20}
                    value={googleUsername}
                    onChange={(e) => setGoogleUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    placeholder="Enter your custom username..."
                    className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRandomizeUsername}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-blue-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Randomize username idea"
                >
                  <Dices size={14} />
                  <span>Random</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1">
                Account Password <span className="text-neutral-400 font-normal">(Optional - for email login)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                <input
                  type="password"
                  minLength={6}
                  value={googlePassword}
                  onChange={(e) => setGooglePassword(e.target.value)}
                  placeholder="Create password (min 6 characters)"
                  className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {googlePassword.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                  <input
                    type="password"
                    minLength={6}
                    value={confirmGooglePassword}
                    onChange={(e) => setConfirmGooglePassword(e.target.value)}
                    placeholder="•••••••• (re-enter password)"
                    className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 bg-red-950/70 border border-red-800 text-red-300 text-xs rounded-lg flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors cursor-pointer shadow-lg shadow-blue-600/20"
            >
              {loading ? 'CREATING ACCOUNT...' : 'CONFIRM & CREATE ACCOUNT'}
            </button>
          </form>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-neutral-800 mb-4">
              <button
                id="tab-login"
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                  setOperationNotAllowed(false);
                  setIsGoogleAccountError(false);
                  setAccountNotFoundNotice(false);
                }}
                className={`flex-1 pb-2.5 text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                  tab === 'login'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <LogIn size={13} />
                <span>LOG IN</span>
              </button>
              <button
                id="tab-signup"
                type="button"
                onClick={() => {
                  setTab('signup');
                  setError(null);
                  setOperationNotAllowed(false);
                  setIsGoogleAccountError(false);
                  setAccountNotFoundNotice(false);
                }}
                className={`flex-1 pb-2.5 text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                  tab === 'signup'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <UserPlus size={13} />
                <span>SIGN UP</span>
              </button>
            </div>

            {/* Account Not Found Notice Banner */}
            {accountNotFoundNotice && tab === 'signup' && (
              <div className="mb-3 p-3 bg-amber-950/70 border border-amber-500/60 rounded-lg text-xs text-amber-200 space-y-1 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>Account doesn't exist yet</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  No existing account was found for <strong>{email}</strong>. Please enter your desired username and password below to create your account!
                </p>
              </div>
            )}

            {/* Firebase auth/operation-not-allowed Helper Box */}
            {operationNotAllowed && (
              <div className="mb-3 p-3.5 bg-amber-950/80 border border-amber-500/70 rounded-xl text-xs text-amber-200 space-y-2.5 shadow-lg shadow-amber-950/40 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertCircle size={16} className="text-amber-400 shrink-0" />
                  <span>Firebase: Email/Password Sign-In Disabled</span>
                </div>

                {isGoogleAccountError ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      The email <strong className="text-white">{email}</strong> is associated with a <strong>Google Sign-In</strong> account.
                    </p>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                    >
                      <span>Sign In With Google</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      Firebase Authentication has <strong>Email/Password</strong> disabled by default. To enable email login & signup:
                    </p>
                    <ol className="text-[11px] list-decimal list-inside space-y-1.5 text-neutral-300 bg-black/50 p-2.5 rounded-lg border border-amber-900/60 font-sans">
                      <li>
                        Open{' '}
                        <a
                          href={consoleAuthUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 underline hover:text-amber-300 font-semibold inline-flex items-center gap-1"
                        >
                          <span>Firebase Console Auth Providers</span>
                          <ExternalLink size={11} />
                        </a>
                      </li>
                      <li>Click on <strong className="text-white">Email/Password</strong> provider</li>
                      <li>Toggle <strong className="text-emerald-400">Enable</strong> to ON and click <strong className="text-white">Save</strong></li>
                    </ol>

                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={consoleAuthUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 px-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Open Firebase Console</span>
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(consoleAuthUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2500);
                        }}
                        className="py-1.5 px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-[11px] transition-colors border border-neutral-700 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedLink ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-amber-900/60 flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase text-neutral-400 font-bold">Or log in immediately with Google (Active):</span>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="w-full py-2 px-3 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-neutral-700"
                      >
                        <span>Continue with Google Sign-In</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              {tab === 'signup' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-neutral-200">
                      Desired Username <span className="text-neutral-400 font-normal">(2-20 alphanumeric characters)</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <User className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                      <input
                        id="signup-username-input"
                        ref={usernameInputRef}
                        type="text"
                        required
                        maxLength={20}
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                        placeholder="Choose your unique username..."
                        className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <button
                      id="randomize-username-btn"
                      type="button"
                      onClick={handleRandomizeUsername}
                      className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-blue-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Generate a random unique username idea"
                    >
                      <Dices size={14} />
                      <span>Random</span>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                  <input
                    id="auth-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                  <input
                    id="auth-password-input"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••• (min 6 characters)"
                    className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {tab === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-200 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                    <input
                      id="auth-confirm-password-input"
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="•••••••• (re-enter password to confirm)"
                      className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {error && !operationNotAllowed && (
                <div className="p-2.5 bg-red-950/70 border border-red-800 text-red-300 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                id="submit-auth-btn"
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors cursor-pointer shadow-lg shadow-blue-600/20 mt-1"
              >
                {loading
                  ? 'PROCESSING...'
                  : tab === 'login'
                  ? 'LOG IN'
                  : accountNotFoundNotice
                  ? 'CREATE ACCOUNT WITH THIS USERNAME & PASSWORD'
                  : 'CREATE ACCOUNT'}
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-800"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-neutral-900 px-2 text-neutral-500">or continue with</span>
              </div>
            </div>

            {/* Google Sign In */}
            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 text-gray-200 font-medium py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
