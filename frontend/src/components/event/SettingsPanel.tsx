import { useEffect, useState, type FormEvent } from 'react';
import { Moon, Save, Sun, UserRound } from 'lucide-react';
import type { AppIntegrationSettings, AuthUser } from '../../types/eventAttendance';
import { eventApi } from '../../data/eventApi';
import { useTheme } from '../../context/ThemeContext';

const integrationCopy: Array<{ key: keyof AppIntegrationSettings; title: string; detail: string }> = [
  { key: 'guest_signup_enabled', title: 'Guest self-registration', detail: 'When off, new visitors cannot submit a sign-up request.' },
  { key: 'qr_checkin_enabled', title: 'QR check-in', detail: 'Allow QR attendance scanning at events.' },
  { key: 'barcode_checkin_enabled', title: 'Barcode check-in', detail: 'Allow barcode attendance scanning at events.' },
  { key: 'rfid_checkin_enabled', title: 'RFID / ID check-in', detail: 'Allow RFID or ID card attendance scanning.' },
];

interface Props {
  user: AuthUser;
  onSaveProfile: (values: { name: string; email: string; phone: string }) => Promise<void>;
}

export default function SettingsPanel({ user, onSaveProfile }: Props) {
  const isAdmin = user.role === 'admin';
  const { darkMode, setDarkMode } = useTheme();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppIntegrationSettings | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone);
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    eventApi.appSettings().then(setSettings).catch(caught => setError(caught instanceof Error ? caught.message : 'Settings could not be loaded.'));
  }, [isAdmin]);

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await onSaveProfile({ name, email, phone });
      setMessage('Profile updated and recorded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const toggleIntegration = async (key: keyof AppIntegrationSettings) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try {
      const saved = await eventApi.updateAppSettings({ [key]: next[key] });
      setSettings(saved);
      setSettingsMessage('Integration settings saved.');
    } catch (caught) {
      setSettings(settings);
      setError(caught instanceof Error ? caught.message : 'Integration could not be updated.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="app-label">App settings</p>
        <h1 className="app-page-title">Settings</h1>
        <p className="app-page-subtitle">Update your profile, switch appearance, and {isAdmin ? 'control sign-in integrations.' : 'manage your account preferences.'}</p>
      </div>

      <section className="app-card max-w-3xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <UserRound className="text-blue-300" size={20} />
          <h2 className="text-lg font-bold text-white">Update profile</h2>
        </div>
        <form onSubmit={submitProfile} className="space-y-4">
          <div>
            <label className="app-label" htmlFor="settings-name">Full name</label>
            <input id="settings-name" className="app-input" value={name} onChange={event => setName(event.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="app-label" htmlFor="settings-email">Email</label>
              <input id="settings-email" type="email" className="app-input" value={email} onChange={event => setEmail(event.target.value)} />
            </div>
            <div>
              <label className="app-label" htmlFor="settings-phone">Phone</label>
              <input id="settings-phone" className="app-input" value={phone} onChange={event => setPhone(event.target.value)} />
            </div>
          </div>
          <p className="text-xs text-white/40">Your role and account ID stay administrator-managed. Profile changes are written to the database.</p>
          {error && <p className="text-sm text-rose-200">{error}</p>}
          {message && <p className="text-sm text-emerald-200">{message}</p>}
          <button type="submit" disabled={saving} className="app-button-primary"><Save size={16} />{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>

      <section className="app-card max-w-3xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Dark mode</h2>
            <p className="mt-1 text-sm text-white/45">Switch the website between dark and light appearance.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            onClick={() => void setDarkMode(!darkMode)}
            className={`relative h-8 w-14 rounded-full transition ${darkMode ? 'bg-blue-500' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-900 transition ${darkMode ? 'left-7' : 'left-1'}`}>
              {darkMode ? <Moon size={14} /> : <Sun size={14} />}
            </span>
          </button>
        </div>
      </section>

      {isAdmin && settings && (
        <section className="app-card max-w-3xl p-6">
          <h2 className="text-lg font-bold text-white">Integrations</h2>
          <p className="mt-1 text-sm text-white/45">Turn common sign-in and attendance tools on or off. These choices are stored in MongoDB and SQLite.</p>
          <div className="mt-5 space-y-3">
            {integrationCopy.map(item => (
              <div key={item.key} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 p-4">
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">{item.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings[item.key]}
                  onClick={() => void toggleIntegration(item.key)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition ${settings[item.key] ? 'bg-blue-500' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${settings[item.key] ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
          {settingsMessage && <p className="mt-4 text-sm text-emerald-200">{settingsMessage}</p>}
        </section>
      )}
    </div>
  );
}
