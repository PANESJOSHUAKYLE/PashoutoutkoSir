import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AccountRequestRow } from '../../types/eventAttendance';

export default function AccountApprovals() {
  const [requests, setRequests] = useState<AccountRequestRow[]>([]);
  const [roles, setRoles] = useState<Record<number, 'student' | 'faculty'>>({});
  const [departments, setDepartments] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => setRequests(await eventApi.accountRequests());
  useEffect(() => { void load().catch(caught => setError(caught instanceof Error ? caught.message : 'Approval requests could not be loaded.')); }, []);

  const updateRequest = (id: number, patch: Partial<Pick<AccountRequestRow, 'name' | 'email' | 'phone'>>) => {
    setRequests(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };
  const approve = async (row: AccountRequestRow) => {
    const role = roles[row.id];
    if (!role) { setError('Choose Student or Faculty before approving.'); return; }
    setBusy(row.id); setError(''); setMessage('');
    try {
      const result = await eventApi.approveAccountRequest(row.id, role, departments[row.id] || 'College of Technologies', { name: row.name, email: row.email, phone: row.phone });
      setMessage(`${row.email} approved as ${result.role} (${result.username}).`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Approval failed.'); }
    finally { setBusy(null); }
  };
  const reject = async (row: AccountRequestRow) => {
    setBusy(row.id); setError(''); setMessage('');
    try { await eventApi.rejectAccountRequest(row.id); setMessage(`${row.email} was rejected.`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Rejection failed.'); }
    finally { setBusy(null); }
  };
  const pending = requests.filter(row => row.status === 'pending');

  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Account approvals</p><h1 className="mt-2 text-3xl font-black text-white">Pending sign-ups</h1><p className="mt-1 text-sm text-white/45">Review each request, assign a role, and approve or reject it.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>}
    {message && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}
    {pending.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">No account requests are waiting.</div> : pending.map(row => <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold text-white">Review sign-up request</p><p className="mt-1 text-xs text-white/40">{row.signup_method} sign-up · {row.phone || 'No phone'} · {new Date(row.created_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200">{row.status}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Full name</span><input className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white" value={row.name} onChange={event => updateRequest(row.id, { name: event.target.value })} required /></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Email</span><input type="email" className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white" value={row.email} onChange={event => updateRequest(row.id, { email: event.target.value })} required /></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Phone</span><input className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white" value={row.phone} onChange={event => updateRequest(row.id, { phone: event.target.value })} /></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Role</span><select className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white" value={roles[row.id] || ''} onChange={event => setRoles(current => ({ ...current, [row.id]: event.target.value as 'student' | 'faculty' }))}><option value="">Choose Student or Faculty</option><option value="student">Student</option><option value="faculty">Faculty</option></select></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Department</span><input className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white" value={departments[row.id] ?? 'College of Technologies'} onChange={event => setDepartments(current => ({ ...current, [row.id]: event.target.value }))} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy === row.id} onClick={() => void reject(row)} className="app-button-secondary"><X size={15} /> Reject</button><button type="button" disabled={busy === row.id} onClick={() => void approve(row)} className="app-button-primary"><Check size={15} /> Approve account</button></div>
    </article>)}
  </section>;
}
