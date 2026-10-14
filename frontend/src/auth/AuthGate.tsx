import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { eventApi } from '../data/eventApi';
import type { AppIntegrationSettings, AuthUser } from '../types/eventAttendance';

type Portal = 'guest' | 'admin';
type Action = 'welcome' | 'login' | 'signup';
type Method = 'choose' | 'google' | 'manual';

function isAuthUser(value: AuthUser | { status: string; message: string }): value is AuthUser {
  return 'username' in value && 'role' in value;
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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
  const portal = (params.get('portal') === 'admin' ? 'admin' : params.get('portal') === 'guest' ? 'guest' : '') as Portal | '';
  const action = (params.get('action') === 'login' || params.get('action') === 'signup' ? params.get('action') : 'welcome') as Action;
  const method = (params.get('method') === 'google' || params.get('method') === 'manual' ? params.get('method') : 'choose') as Method;
  const [settings, setSettings] = useState<AppIntegrationSettings | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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

  const googleOn = false;
  const signupOn = settings?.guest_signup_enabled !== false;
  const showMethod = portal === 'guest' && (action === 'login' || action === 'signup') && method === 'choose';
  const showManual = portal === 'admin' || (portal === 'guest' && method === 'manual');
  const showGoogle = googleOn && portal === 'guest' && method === 'google';

  const title = useMemo(() => {
    if (!portal && action === 'welcome') return 'Welcome';
    if (portal === 'admin') return 'Admin log in';
    if (action === 'signup') return 'Create account';
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
      if (portal === 'guest' && action === 'signup') {
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

  const submitGoogle = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await eventApi.googleAuth({
        email,
        name: name || email.split('@')[0],
        phone,
        intent: action === 'signup' ? 'signup' : 'login',
      });
      if (isAuthUser(result)) {
        finishAuth(result);
        return;
      }
      setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen flex min-h-screen items-center justify-center bg-[#090b10] px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
      </div>
      <section className="auth-card relative w-full max-w-[480px] rounded-[28px] border border-white/15 bg-[#11151d] px-6 py-8 text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:px-10 sm:py-10">
        <div className="mb-8 text-center">
          <img src="/brand/sbo-logo.jpg" alt="College of Technologies Student Body Organization" className="mx-auto mb-5 h-20 w-20 rounded-full bg-[#f8fafc] object-contain p-1 shadow-xl shadow-black/40" />
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-300">COT Event Attendance</p>
          <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-slate-300">
            {portal === 'admin'
              ? 'Administrators sign in with an approved admin ID and password.'
              : action === 'signup'
                ? 'Your details are saved immediately. An administrator must assign Student or Faculty before you can use the website.'
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
              className="app-button-secondary w-full py-4 text-base"
              disabled={!signupOn}
              onClick={() => go({ portal: 'guest', action: 'signup', method: 'choose' })}
            >
              <UserPlus size={18} /> Sign up
            </button>
            {!signupOn && <p className="text-center text-xs text-amber-200">Guest sign-up is currently turned off in app settings.</p>}
            <div className="mt-6 border-t border-white/15 pt-5">
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Choose a portal</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" className="app-button-secondary py-3" onClick={() => go({ portal: 'guest', action: 'login', method: 'choose' })}>Log in as Guest</button>
                <button type="button" className="app-button-secondary py-3" onClick={() => go({ portal: 'admin', action: 'login', method: 'manual' })}>Admin Log in</button>
              </div>
            </div>
          </div>
        )}

        {showMethod && (
          <div className="space-y-3">
            <button type="button" className="mb-2 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" onClick={() => go({ portal: '', action: 'welcome', method: 'choose' })}>
              <ArrowLeft size={16} /> Back
            </button>
            {googleOn ? (
              <button type="button" className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white py-3.5 text-sm font-bold text-slate-900" onClick={() => go({ method: 'google' })}>
                <GoogleMark /> Continue with Google
              </button>
            ) : (
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold leading-5 text-amber-100">
                Google authentication is turned off. Guests must sign in or sign up manually.
              </p>
            )}
            <button type="button" className="app-button-primary w-full py-3.5" onClick={() => go({ method: 'manual' })}>
              {action === 'signup' ? 'Manually sign up' : 'Manually sign in'}
            </button>
          </div>
        )}

        {showGoogle && (
          <form className="space-y-4" onSubmit={submitGoogle}>
            <button type="button" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" onClick={() => go({ method: 'choose' })}>
              <ArrowLeft size={16} /> Back
            </button>
            <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-300">
              Continue with the Google email you want recorded. {action === 'signup' ? 'The request is stored until an administrator assigns Student or Faculty.' : 'Only an already approved Google account can sign in.'}
            </p>
            {action === 'signup' && (
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-200">Full name</span>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-4 text-sm text-white outline-none" value={name} onChange={event => setName(event.target.value)} required />
                </div>
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-200">Google email</span>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="email" className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-4 text-sm text-white outline-none" value={email} onChange={event => setEmail(event.target.value)} required placeholder="name@gmail.com" />
              </div>
            </label>
            {error && <AlertBox message={error} />}
            {notice && <NoticeBox message={notice} />}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-sm font-bold text-slate-900">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <GoogleMark />} Continue with Google
            </button>
          </form>
        )}

        {showManual && action !== 'welcome' && !showMethod && (
          <form className="space-y-4" onSubmit={submitManual}>
            {portal !== 'admin' && (
              <button type="button" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" onClick={() => go({ method: 'choose' })}>
                <ArrowLeft size={16} /> Back
              </button>
            )}
            {portal === 'admin' && (
              <button type="button" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" onClick={() => go({ portal: '', action: 'welcome', method: 'choose' })}>
                <ArrowLeft size={16} /> Back
              </button>
            )}
            {portal === 'guest' && action === 'signup' ? (
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
                placeholder={portal === 'admin' ? 'ADM001' : 'STU001 or your email'}
              />
            )}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-200">Password</label>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-12 text-sm text-white outline-none"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={action === 'signup' ? 8 : undefined}
                />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-300 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <AlertBox message={error} />}
            {notice && <NoticeBox message={notice} />}
            <button type="submit" disabled={busy} className="app-button-primary w-full py-4 text-base">
              {busy ? <><Loader2 size={18} className="animate-spin" /> Please wait…</> : action === 'signup' ? <><UserPlus size={18} /> Submit for approval</> : <><LogIn size={18} /> Sign in</>}
            </button>
          </form>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
          <ShieldCheck size={14} /> {portal === 'admin' ? 'Administrator portal only' : 'Guest accounts stay pending until a role is assigned'}
        </p>
      </section>
    </main>
  );
}

function Field({
  label, value, onChange, icon, type = 'text', placeholder, required = true,
}: {
  label: string; value: string; onChange: (value: string) => void; icon: ReactNode; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-200">{label}</span>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input type={type} required={required} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-3.5 pl-12 pr-4 text-sm text-white outline-none" />
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
