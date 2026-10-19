import { useEffect, useState } from 'react';
import { ArchiveRestore, Search } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AuthUser } from '../../types/eventAttendance';

export default function ArchivedAccounts() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = async () => setUsers(await eventApi.archivedGuestUsers());
  useEffect(() => { void load().catch(caught => setError(caught instanceof Error ? caught.message : 'Archive could not be loaded.')); }, []);

  const restore = async (user: AuthUser) => {
    setBusy(user.username); setError('');
    try {
      await eventApi.restoreGuestUser(user.username);
      setUsers(current => current.filter(row => row.username !== user.username));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Account could not be restored.'); }
    finally { setBusy(''); }
  };
  const visible = users.filter(user => `${user.name} ${user.username} ${user.email} ${user.department}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">Retained accounts</p><h1 className="mt-2 text-3xl font-black text-white">Account archive</h1><p className="mt-1 text-sm text-white/45">Archived accounts cannot sign in. Their attendance, event, and feedback records are retained.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    <div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" /><input className="w-full rounded-xl border border-white/[0.1] bg-white/[0.05] py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-400/60" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search archived accounts" /></div>
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08]"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/[0.08] bg-white/[0.03] text-xs uppercase tracking-wider text-white/40"><tr><th className="px-5 py-4">Account</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Department</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{visible.map(user => <tr key={user.username}><td className="px-5 py-4"><p className="font-semibold text-white">{user.name}</p><p className="text-xs text-white/45">{user.username} · {user.email}</p></td><td className="px-5 py-4 capitalize text-white/70">{user.role}</td><td className="px-5 py-4 text-white/60">{user.department}</td><td className="px-5 py-4 text-right"><button type="button" disabled={busy === user.username} onClick={() => void restore(user)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"><ArchiveRestore size={15} />{busy === user.username ? 'Restoring…' : 'Restore account'}</button></td></tr>)}</tbody></table>{visible.length === 0 && <p className="p-8 text-center text-sm text-white/45">{query ? 'No archived accounts match this search.' : 'No accounts have been archived.'}</p>}</div>
  </section>;
}
