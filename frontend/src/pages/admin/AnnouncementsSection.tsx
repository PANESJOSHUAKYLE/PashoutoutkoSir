import { useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AnnouncementRecord } from '../../types/eventAttendance';
import Button from '../../components/common/Button';

const inputClass = 'w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-orange-400/60 focus:ring-2 focus:ring-orange-400/20';

export default function AnnouncementsSection() {
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementRecord['audience']>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    eventApi.adminAnnouncements()
      .then(items => { if (mounted) setAnnouncements(items); })
      .catch(caught => { if (mounted) setError(caught instanceof Error ? caught.message : 'Announcements could not be loaded.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const post = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await eventApi.createAnnouncement({ title: title.trim(), body: body.trim(), audience });
      setAnnouncements(current => [created, ...current]);
      setTitle('');
      setBody('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Announcement could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Guest updates</p><h1 className="mt-2 text-3xl font-black text-white">Announcements</h1><p className="mt-1 text-sm text-white/45">Post news and reminders to student and faculty notification panels.</p></div>
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={post} className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#11151d]/90 p-5 shadow-xl">
        <div className="mb-2 flex items-center gap-3"><span className="rounded-xl bg-orange-400/10 p-2.5 text-orange-200"><Bell size={18} /></span><div><h2 className="font-bold text-white">Post an announcement</h2><p className="text-xs text-white/40">Guests will see it in the bell menu at the top of the portal.</p></div></div>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Title</span><input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={180} required placeholder="Campus update" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Message</span><textarea className={inputClass} value={body} onChange={event => setBody(event.target.value)} rows={5} required placeholder="Write the announcement for students or faculty…" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Send to</span><select className={inputClass} value={audience} onChange={event => setAudience(event.target.value as AnnouncementRecord['audience'])}><option value="all">Students and faculty</option><option value="student">Students only</option><option value="faculty">Faculty only</option></select></label>
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
        <div className="flex justify-end"><Button type="submit" disabled={saving}><Send size={15} /> {saving ? 'Posting…' : 'Post announcement'}</Button></div>
      </form>
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#11151d]/90 p-5 shadow-xl"><div><h2 className="font-bold text-white">Recent announcements</h2><p className="text-xs text-white/40">Event publication announcements appear here too.</p></div>
        {loading ? <p className="py-8 text-center text-sm text-white/40">Loading announcements…</p> : announcements.length === 0 ? <p className="rounded-xl border border-dashed border-white/[0.12] p-8 text-center text-sm text-white/40">No announcements have been posted.</p> : announcements.map(item => <article key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-white">{item.title}</h3><span className="shrink-0 rounded-full bg-orange-400/10 px-2 py-1 text-[10px] font-semibold text-orange-200">{item.audience === 'all' ? 'Students + faculty' : `${item.audience} only`}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/55">{item.body}</p><p className="mt-3 text-[10px] text-white/35">{new Date(item.created_at).toLocaleString()}</p></article>)}
      </section>
    </div>
  </section>;
}
