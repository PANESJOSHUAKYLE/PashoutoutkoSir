import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AccountRequestRow, AuthUser, UserRole } from '../../types/eventAttendance';

export default function AccountApprovals() {
  const [requests, setRequests] = useState<AccountRequestRow[]>([]);
  const [guests, setGuests] = useState<AuthUser[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [roles, setRoles] = useState<Record<number, 'student' | 'faculty'>>({});
  const [departments, setDepartments] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<AuthUser | null>(null);

  const load = async () => {
    const [nextRequests, nextGuests] = await Promise.all([eventApi.accountRequests(), eventApi.guestUsers()]);
    setRequests(nextRequests);
    setGuests(nextGuests);
  };

  useEffect(() => {
    let active = true;
    Promise.all([eventApi.accountRequests(), eventApi.guestUsers()])
      .then(([nextRequests, nextGuests]) => {
        if (!active) return;
        setRequests(nextRequests);
        setGuests(nextGuests);
      })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : 'Accounts could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  const approve = async (row: AccountRequestRow) => {
    const role = roles[row.id];
    if (!role) {
      setError('Choose Student or Faculty before approving. Use the email they submitted to decide.');
      return;
    }
    setError('');
    try {
      const result = await eventApi.approveAccountRequest(row.id, role, departments[row.id] || 'College of Technologies');
      setMessage(`${row.email} approved as ${result.role} (${result.username}).`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Approval failed.');
    }
  };

  const reject = async (row: AccountRequestRow) => {
    try {
      await eventApi.rejectAccountRequest(row.id);
      setMessage(`${row.email} was rejected.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rejection failed.');
    }
  };

  const saveGuest = async () => {
    if (!editing) return;
    try {
      await eventApi.updateGuestUser(editing.username, {
        name: editing.name,
        email: editing.email,
        phone: editing.phone,
        department: editing.department,
        role: editing.role,
      });
      setEditing(null);
      setMessage('Guest account updated.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Guest account could not be updated.');
    }
  };

  const pending = requests.filter(row => row.status === 'pending');

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Approval queue</p>
          <h2 className="mt-2 text-2xl font-black text-white">Pending sign-ups</h2>
          <p className="mt-1 text-sm text-white/45">Every submitted form is stored. Assign Student or Faculty from the email they used, then approve.</p>
        </div>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">No account requests are waiting.</div>
        ) : pending.map(row => (
          <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-white">{row.name}</p>
                <p className="text-sm text-blue-200">{row.email}</p>
                <p className="mt-1 text-xs text-white/40">{row.signup_method} sign-up · {row.phone || 'No phone'} · {new Date(row.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200">{row.status}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Assign role from this email</span>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                  value={roles[row.id] || ''}
                  onChange={event => setRoles(current => ({ ...current, [row.id]: event.target.value as 'student' | 'faculty' }))}
                >
                  <option value="">Choose Student or Faculty</option>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Department</span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                  value={departments[row.id] ?? 'College of Technologies'}
                  onChange={event => setDepartments(current => ({ ...current, [row.id]: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => void reject(row)} className="app-button-secondary"><X size={15} /> Reject</button>
              <button type="button" onClick={() => void approve(row)} className="app-button-primary"><Check size={15} /> Approve account</button>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-black text-white">Guest accounts</h2>
          <p className="mt-1 text-sm text-white/45">Edit approved student and faculty accounts. Administrators stay on the separate admin portal.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-5 py-4">Guest</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {guests.map(guest => (
                <tr key={guest.username}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-white">{guest.name}</p>
                    <p className="text-xs text-white/40">{guest.username}</p>
                  </td>
                  <td className="px-5 py-4 text-white/65">{guest.email}</td>
                  <td className="px-5 py-4 capitalize text-blue-200">{guest.role}</td>
                  <td className="px-5 py-4 text-white/55">{guest.department}</td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" className="rounded-lg p-2 text-white/45 hover:bg-blue-400/10 hover:text-blue-200" onClick={() => setEditing(guest)} aria-label={`Edit ${guest.name}`}>
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/75" aria-label="Close" onClick={() => setEditing(null)} />
          <section className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#151a23] p-6">
            <h3 className="text-xl font-bold text-white">Edit guest account</h3>
            <div className="mt-4 grid gap-3">
              <input className="app-input" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
              <input className="app-input" type="email" value={editing.email} onChange={event => setEditing({ ...editing, email: event.target.value })} />
              <input className="app-input" value={editing.phone} onChange={event => setEditing({ ...editing, phone: event.target.value })} />
              <input className="app-input" value={editing.department} onChange={event => setEditing({ ...editing, department: event.target.value })} />
              <select className="app-input" value={editing.role} onChange={event => setEditing({ ...editing, role: event.target.value as UserRole })}>
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="app-button-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="app-button-primary" onClick={() => void saveGuest()}>Save changes</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
