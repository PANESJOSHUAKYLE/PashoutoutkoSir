import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { eventApi } from '../data/eventApi';
import GoogleSignInButton from './GoogleSignInButton';
import type { AppIntegrationSettings, AuthUser } from '../types/eventAttendance';

type Portal = 'guest' | 'admin';
type Action = 'welcome' | 'login' | 'signup' | 'forgot' | 'reset';
type Method = 'choose' | 'google' | 'manual';

function isAuthUser(value: AuthUser | { status: string; message: string }): value is AuthUser {
  return 'username' in value && 'role' in value;
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l6.2 5.2C37.3 38.3 44 33.5 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function AuthGate() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { login, setSessionUser } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const portal = (params.get('portal') === 'admin' ? 'admin' : params.get('portal') === 'guest' ? 'guest' : '') as Portal | '';
  const action = (['login', 'signup', 'forgot', 'reset'].includes(params.get('action') || '') ? params.get('action') : 'welcome') as Action;
  const method = (params.get('method') === 'google' || params.get('method') === 'manual' ? params.get('method') : 'choose') as Method;
  const [settings, setSettings] = useState<AppIntegrationSettings | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    eventApi.appSettings().then(setSettings).catch(() => setSettings({
      google_auth_enabled: false,
      google_auth_configured: false,
      google_client_id: '',
      guest_signup_enabled: true,
      email_notifications_enabled: true,
      qr_checkin_enabled: true,
      barcode_checkin_enabled: true,
      rfid_checkin_enabled: true,
    }));
  }, []);

  const go = (next: { portal?: Portal | ''; action?: Action; method?: Method }) => {
    const query = new URLSearchParams();
    const nextPortal = next.portal === undefined ? portal : next.portal;
    const nextAction = next.action === undefined ? action : next.action;
    const nextMethod = next.method === undefined ? method : next.method;
    if (nextPortal) query.set('portal', nextPortal);
    if (nextAction && nextAction !== 'welcome') query.set('action', nextAction);
    if (nextMethod && nextMethod !== 'choose') query.set('method', nextMethod);
    setError('');
    setNotice('');
    setParams(query, { replace: false });
  };

  const googleOn = settings?.google_auth_enabled === true && settings.google_auth_configured && Boolean(settings.google_client_id);
  const signupOn = settings?.guest_signup_enabled !== false;
  const showMethod = portal === 'guest' && (action === 'login' || action === 'signup') && method === 'choose';
  const showManual = action === 'forgot' || action === 'reset' || portal === 'admin' || (portal === 'guest' && method === 'manual');
  const showGoogle = googleOn && portal === 'guest' && method === 'google';

  const title = useMemo(() => {
    if (!portal && action === 'welcome') return 'Welcome';
    if (portal === 'admin') return 'Admin log in';
    if (action === 'signup') return 'Create account';
    if (action === 'forgot') return 'Reset your password';
    if (action === 'reset') return 'Choose a new password';
    return 'Log in';
  }, [action, portal]);

  const finishAuth = (user: AuthUser) => {
    setSessionUser(user);
    navigate(user.role === 'admin' ? '/admin/dashboard' : '/portal?view=dashboard', { replace: true });
  };

  const submitManual = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'forgot') {
        const result = await eventApi.requestPasswordReset(email);
        setNotice(result.message);
        return;
      }
      if (action === 'reset') {
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const result = await eventApi.confirmPasswordReset({ uid: params.get('uid') || '', token: params.get('token') || '', password });
        setNotice(result.message);
        setPassword('');
        setConfirmPassword('');
        return;
      }
      if (portal === 'guest' && action === 'signup') {
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const result = await eventApi.signup({ email, name, phone, password });
        setNotice(result.message);
        return;
      }
      const user = await login(
        action === 'signup' ? email : identifier,
        password,
        portal === 'admin' ? 'admin' : 'guest',
      );
      finishAuth(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const submitGoogleCredential = async (credential: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await eventApi.googleAuth({
        credential,
        intent: action === 'signup' ? 'signup' : 'login',
      });
      if (isAuthUser(result)) finishAuth(result);
      else setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (portal === 'admin' || method === 'choose') {
      go({ portal: '', action: 'welcome', method: 'choose' });
      return;
    }
    go({ method: 'choose' });
  };

  return (
    <main className="auth-screen relative flex min-h-screen items-center justify-center bg-[#090b10] px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
      </div>
      {action !== 'welcome' && <button type="button" onClick={goBack} className="app-button-secondary absolute left-4 top-4 z-20 min-h-12 px-5 text-base shadow-lg sm:left-6 sm:top-6" aria-label="Back">
        <ArrowLeft size={20} /> Back
      </button>}
      <button
        type="button"
        onClick={() => void setDarkMode(!darkMode)}
        aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        className="app-button-secondary absolute right-4 top-4 z-20 min-h-12 px-5 text-base shadow-lg sm:right-6 sm:top-6"
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <section className="auth-card relative w-full max-w-[980px] overflow-hidden rounded-[28px] border border-white/15 bg-[#11151d] text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-sky-950 via-blue-950 to-indigo-950 p-8 sm:p-10 md:min-h-[610px]">
          <div className="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative">
            <img src="/brand/sbo-logo.jpg" alt="College of Technologies Student Body Organization" className="mb-8 h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow-xl" />
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">COT Event Attendance</p>
            <h2 className="max-w-sm text-3xl font-black leading-tight text-white sm:text-4xl">Stay connected to every campus event.</h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-blue-100/80">One secure place for event updates, registration, and your attendance record.</p>
          </div>
          <div className="relative mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm leading-6 text-blue-100/80">
            <ShieldCheck className="mb-2 text-cyan-200" size={20} />
            Your account and attendance details are protected by secure sign-in.
          </div>
        </aside>
        <div className="p-6 sm:p-10">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
            {portal === 'admin'
              ? 'Administrators sign in with an approved admin ID and password.'
              : action === 'signup'
                ? 'Your details are saved immediately. An administrator must assign Student or Faculty before you can use the website.'
                : action === 'forgot'
                  ? 'Enter your account email. If it matches an active account, we’ll send a secure reset link.'
                  : action === 'reset'
                    ? 'Choose a strong password you have not used for this account before.'
                    : 'Students and faculty sign in as guests. New accounts wait for administrator approval.'}
          </p>
        </div>

        {action === 'welcome' && (
          <div className="space-y-3">
            <button type="button" className="app-button-primary w-full py-4 text-base" onClick={() => go({ portal: 'guest', action: 'login', method: 'choose' })}>
              <LogIn size={18} /> Log in
            </button>
            <button
              type="button"
              className="app-button-primary w-full py-4 text-base"
              disabled={!signupOn}
              onClick={() => go({ portal: 'guest', action: 'signup', method: 'choose' })}
            >
              <UserPlus size={18} /> Sign up
            </button>
            {!signupOn && <p className="text-center text-xs text-amber-200">Guest sign-up is currently turned off in app settings.</p>}
            <div className="mt-6 border-t border-white/15 pt-5">
              <button type="button" className="app-button-primary w-full py-4 text-base" onClick={() => go({ portal: 'admin', action: 'login', method: 'manual' })}>Admin Log in</button>
            </div>
          </div>
        )}

        {showMethod && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={!googleOn}
              aria-disabled={!googleOn}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white py-3.5 text-sm font-bold text-slate-900 transition disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => { if (googleOn) go({ method: 'google' }); }}
            >
              <GoogleMark />
              <span>{action === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}</span>
              {!googleOn && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">Not available</span>}
            </button>
            <button type="button" className="app-button-primary w-full py-3.5" onClick={() => go({ method: 'manual' })}>
              {action === 'signup' ? 'Sign up with Email' : 'Sign in with Email'}
            </button>
          </div>
        )}

        {showGoogle && (
          <div className="space-y-4">
            <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-300">
              {action === 'signup' ? 'Continue with Google to submit an account request. An administrator must approve it before you can sign in.' : 'Only approved Student or Faculty accounts can sign in with Google.'}
            </p>
            {error && <AlertBox message={error} />}
            {notice && <NoticeBox message={notice} />}
            {busy ? <p className="text-center text-sm text-white/60"><Loader2 className="mr-2 inline animate-spin" size={16} />Verifying Google account…</p> : <GoogleSignInButton
              clientId={settings?.google_client_id || ''}
              text={action === 'signup' ? 'signup_with' : 'signin_with'}
              onCredential={credential => void submitGoogleCredential(credential)}
              onError={setError}
            />}
          </div>
        )}

        {showManual && action !== 'welcome' && !showMethod && (
          <form className="space-y-4" onSubmit={submitManual}>
            {action === 'forgot' ? (
              <Field label="Email address" type="email" icon={<Mail size={18} />} value={email} onChange={setEmail} placeholder="you@example.com" />
            ) : portal === 'guest' && action === 'signup' ? (
              <>
                <Field label="Full name" icon={<UserRound size={18} />} value={name} onChange={setName} />
                <Field label="Email" type="email" icon={<Mail size={18} />} value={email} onChange={setEmail} />
                <Field label="Phone" icon={<UserRound size={18} />} value={phone} onChange={setPhone} required={false} />
              </>
            ) : (
              <Field
                label={portal === 'admin' ? 'Admin ID or username' : 'ID, username, or email'}
                icon={<UserRound size={18} />}
                value={identifier}
                onChange={setIdentifier}
                placeholder="Username"
              />
            )}
            {action !== 'forgot' && (
            <div>
              <label className="mb-2 block text-center text-sm font-bold text-slate-200">Password</label>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-12 text-sm text-white outline-none"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={portal === 'guest' && action === 'login' ? 'Password' : 'Enter your password'}
                  required
                  minLength={action === 'signup' || action === 'reset' ? 12 : undefined}
                  autoComplete={action === 'signup' || action === 'reset' ? 'new-password' : 'current-password'}
                />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-300 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {(action === 'signup' || action === 'reset') && <PasswordGuidance password={password} />}
            </div>
            )}
            {(action === 'signup' || action === 'reset') && (
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200" htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter the password again" className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" />
              </div>
            )}
            {error && <AlertBox message={error} />}
            {notice && <NoticeBox message={notice} />}
            <button type="submit" disabled={busy} className="app-button-primary w-full py-4 text-base">
              {busy ? <><Loader2 size={18} className="animate-spin" /> Please wait…</> : action === 'signup' ? <><UserPlus size={18} /> Submit for approval</> : action === 'forgot' ? 'Send reset link' : action === 'reset' ? 'Save new password' : <><LogIn size={18} /> Sign in</>}
            </button>
            {action === 'login' && portal === 'guest' && <button type="button" className="w-full py-2 text-sm font-semibold text-cyan-200 hover:text-white" onClick={() => go({ action: 'forgot', method: 'manual' })}>Forgot password?</button>}
            {(action === 'forgot' || action === 'reset') && <button type="button" className="w-full py-2 text-sm font-semibold text-cyan-200 hover:text-white" onClick={() => go({ portal: 'guest', action: 'login', method: 'manual' })}>Back to sign in</button>}
            {action === 'signup' && <p className="text-center text-xs text-slate-400">Already have an account? <button type="button" className="font-bold text-cyan-200 hover:text-white" onClick={() => go({ portal: 'guest', action: 'login', method: 'manual' })}>Sign in</button></p>}
          </form>
        )}

        {portal === 'admin' && (
          <p className="mt-8 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
            <ShieldCheck size={14} /> Administrator portal only
          </p>
        )}
        </div>
        </div>
      </section>
    </main>
  );
}

function PasswordGuidance({ password }: { password: string }) {
  const checks = [
    ['At least 12 characters', password.length >= 12],
    ['Lowercase and uppercase letters', /[a-z]/.test(password) && /[A-Z]/.test(password)],
    ['At least one number', /\d/.test(password)],
    ['At least one symbol', /[^A-Za-z0-9]/.test(password)],
  ] as const;
  return <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <p className="mb-2 text-xs font-semibold text-slate-300">Use a strong password</p>
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {checks.map(([label, passed]) => <li key={label} className={`flex items-center gap-2 text-xs ${passed ? 'text-emerald-300' : 'text-slate-400'}`}><Check size={13} />{label}</li>)}
    </ul>
  </div>;
}

function Field({
  label, value, onChange, icon, type = 'text', placeholder, required = true,
}: {
  label: string; value: string; onChange: (value: string) => void; icon: ReactNode; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-center text-sm font-bold text-slate-200">{label}</span>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input type={type} required={required} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-12 text-center text-sm text-white outline-none" />
      </div>
    </label>
  );
}

function AlertBox({ message }: { message: string }) {
  return <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/35 bg-rose-400/10 p-3 text-xs font-bold leading-5 text-rose-100"><AlertCircle className="mt-0.5 shrink-0" size={16} />{message}</p>;
}

function NoticeBox({ message }: { message: string }) {
  return <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs font-semibold leading-5 text-emerald-100">{message}</p>;
}
