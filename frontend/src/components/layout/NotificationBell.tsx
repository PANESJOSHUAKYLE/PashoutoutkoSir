import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarDays, CheckCheck } from 'lucide-react';
import { eventApi } from '../../data/eventApi';
import type { AnnouncementRecord, UserRole } from '../../types/eventAttendance';

export default function NotificationBell({ role }: { role: UserRole }) {
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [open, setOpen] = useState(false);
  const unreadCount = announcements.filter(item => !item.is_read).length;

  const refresh = useCallback(async () => {
    try { setAnnouncements(role === 'admin' ? await eventApi.adminAnnouncements() : await eventApi.announcements()); } catch { /* keep the last notification list if temporarily offline */ }
  }, [role]);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refresh]);

  const markRead = async (item: AnnouncementRecord) => {
    if (role === 'admin' || item.is_read) return;
    setAnnouncements(current => current.map(row => row.id === item.id ? { ...row, is_read: true } : row));
    try { await eventApi.markAnnouncementRead(item.id); }
    catch { setAnnouncements(current => current.map(row => row.id === item.id ? { ...row, is_read: false } : row)); }
  };

  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={`Notifications${role !== 'admin' && unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={open} className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
      <Bell size={18} />
      {role !== 'admin' && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section aria-label="Notifications" className="absolute right-0 top-12 z-[60] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#151a23] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><div><h2 className="text-sm font-bold text-white">Notifications</h2><p className="mt-0.5 text-[11px] text-white/40">Admin announcements and event updates</p></div>{role !== 'admin' && <span className="text-xs text-white/45">{unreadCount} unread</span>}</div>
      <div className="app-scrollbar max-h-[65vh] overflow-y-auto">
        {announcements.length === 0 ? <p className="px-4 py-8 text-center text-sm text-white/45">No announcements yet.</p> : announcements.map(item => <button key={item.id} type="button" onClick={() => void markRead(item)} className={`block w-full border-b border-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.04] ${item.is_read ? '' : 'bg-orange-400/[0.06]'}`}>
          <span className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-orange-400/10 p-2 text-orange-200">{item.event_id ? <CalendarDays size={16} /> : <Bell size={16} />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white/90">{item.title}</span><span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-white/55">{item.body}</span><span className="mt-2 flex items-center gap-1 text-[10px] text-white/35">{new Date(item.created_at).toLocaleString()}{item.is_read && <><span>·</span><CheckCheck size={12} /> Read</>}</span></span></span>
        </button>)}
      </div>
    </section>}
  </div>;
}
