import { useEffect, useState } from 'react';
import { Archive, Eye, EyeOff, KeyRound, Pencil, Search } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AuthUser, UserRole } from '../../types/eventAttendance';

const inputClass = 'w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400/60';

export default function UserManagement() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [resetPassword, setResetPassword] = useState<{ username: string; value: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => setUsers(await eventApi.guestUsers());
  useEffect(() => { void load().catch(caught => setError(caught instanceof Error ? caught.message : 'Accounts could not be loaded.')); }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(editing.username); setError('');
    try {
      await eventApi.updateGuestUser(editing.username, {
        name: editing.name, email: editing.email, phone: editing.phone,
        department: editing.department, role: editing.role,
      });
      setMessage(`Updated ${editing.username}.`); setEditing(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Account could not be updated.'); }
    finally { setBusy(''); }
  };

  const reset = async (user: AuthUser) => {
    if (!window.confirm(`Generate a new temporary password for ${user.name}? Their current password will stop working.`)) return;
    setBusy(user.username); setError(''); setMessage('');
    try {
      const result = await eventApi.resetGuestPassword(user.username);
      setResetPassword({ username: user.username, value: result.temporary_password });
      setShowPassword(false);
      setMessage(`Temporary password generated for ${user.username}. Copy it before closing.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Password reset failed.'); }
    finally { setBusy(''); }
  };

  const archive = async (user: AuthUser) => {
    if (!window.confirm(`Archive ${user.name} (${user.username})? Their account and attendance history will be retained, and they will no longer be able to sign in.`)) return;
    setBusy(user.username); setError(''); setMessage('');
    try {
      await eventApi.archiveGuestUser(user.username);
      setUsers(current => current.filter(row => row.username !== user.username));
      setMessage(`${user.name} has been archived. You can restore the account from Archive.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Account could not be archived.'); }
    finally { setBusy(''); }
  };

  const visible = users.filter(user => `${user.name} ${user.username} ${user.email} ${user.department}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Accounts</p><h1 className="mt-2 text-3xl font-black text-white">User management</h1><p className="mt-1 text-sm text-white/45">Edit account details, reset passwords, or archive accounts while preserving their records.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {message && <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}
    <div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" /><input className={`${inputClass} pl-10`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, username, email, or department" /></div>
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08]"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-white/[0.08] bg-white/[0.03] text-xs uppercase tracking-wider text-white/40"><tr><th className="px-5 py-4">Account</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Department</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">
      {visible.map(user => <tr key={user.username} className="hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="font-semibold text-white">{user.name}</p><p className="text-xs text-white/45">{user.username} · {user.email}</p></td><td className="px-5 py-4 capitalize text-white/70">{user.role}</td><td className="px-5 py-4 text-white/60">{user.department}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.is_active ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" disabled={busy === user.username} onClick={() => setEditing(user)} className="rounded-lg p-2 text-white/55 hover:bg-blue-400/10 hover:text-blue-200" title="Edit account" aria-label={`Edit ${user.name}`}><Pencil size={16} /></button><button type="button" disabled={busy === user.username} onClick={() => void reset(user)} className="rounded-lg p-2 text-white/55 hover:bg-amber-400/10 hover:text-amber-200" title="Generate temporary password" aria-label={`Generate temporary password for ${user.name}`}><KeyRound size={16} /></button><button type="button" disabled={busy === user.username} onClick={() => void archive(user)} className="rounded-lg p-2 text-white/55 hover:bg-orange-400/10 hover:text-orange-200" title="Archive account" aria-label={`Archive ${user.name}`}><Archive size={16} /></button></div></td></tr>)}
    </tbody></table>{visible.length === 0 && <p className="p-8 text-center text-sm text-white/45">{query ? 'No accounts match this search.' : 'No approved student or faculty accounts are available.'}</p>}</div>

    {editing && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-black/75" aria-label="Close edit account" onClick={() => setEditing(null)} /><section className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#151a23] p-6"><h2 className="text-xl font-bold text-white">Edit account</h2><p className="mt-1 text-sm text-white/45">{editing.username}</p><div className="mt-4 grid gap-3"><label className="text-xs text-white/55">Full name<input className={`${inputClass} mt-1`} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label><label className="text-xs text-white/55">Email<input className={`${inputClass} mt-1`} type="email" value={editing.email} onChange={event => setEditing({ ...editing, email: event.target.value })} /></label><label className="text-xs text-white/55">Phone<input className={`${inputClass} mt-1`} value={editing.phone} onChange={event => setEditing({ ...editing, phone: event.target.value })} /></label><label className="text-xs text-white/55">Department<input className={`${inputClass} mt-1`} value={editing.department} onChange={event => setEditing({ ...editing, department: event.target.value })} /></label><label className="text-xs text-white/55">Role<select className={`${inputClass} mt-1`} value={editing.role} onChange={event => setEditing({ ...editing, role: event.target.value as UserRole })}><option value="student">Student</option><option value="faculty">Faculty</option></select></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="app-button-primary" disabled={Boolean(busy)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button></div></section></div>}

    {resetPassword && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-black/75" aria-label="Close temporary password" onClick={() => setResetPassword(null)} /><section className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#151a23] p-6"><h2 className="text-xl font-bold text-white">Temporary password</h2><p className="mt-2 text-sm text-white/55">Share this securely with {resetPassword.username}. It is shown once and cannot be retrieved after closing.</p><div className="mt-4 flex gap-2"><input className={`${inputClass} min-w-0 flex-1 font-mono`} type={showPassword ? 'text' : 'password'} value={resetPassword.value} readOnly aria-label="Temporary password" /><button type="button" className="app-button-secondary" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}{showPassword ? 'Hide' : 'Show'}</button><button type="button" className="app-button-secondary" onClick={() => void navigator.clipboard.writeText(resetPassword.value).then(() => setMessage('Temporary password copied.')).catch(() => setError('Could not copy the temporary password.'))}>Copy</button></div><div className="mt-5 flex justify-end"><button type="button" className="app-button-primary" onClick={() => setResetPassword(null)}>Done</button></div></section></div>}
  </section>;
}
