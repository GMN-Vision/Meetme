'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { GlowCard } from '../../components/ui/glow-card';
import { Users, Video, CreditCard, LayoutDashboard, ArrowRight } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import AdminSubscriptionTable from '../../components/AdminSubscriptionTable';

interface UserItem {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  organizationId: string | null;
  organizationName?: string | null;
  createdAt: string;
}

interface MeetingItem {
  _id: string;
  meetingId: string;
  title: string;
  hostEmail: string;
  joinCount: number;
  createdAt: string;
  lastSessionAt?: string | null;
}

interface AdminStats {
  totalUsers: number;
  totalMeetings: number;
  totalOrganizations: number;
  activeMeetings: number;
  roles: {
    admin: number;
    user: number;
  };
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'meetings' | 'subscriptions'>('overview');
  
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [userFilter, setUserFilter] = useState('all');
  const [loadError, setLoadError] = useState('');
  const navigation = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Choose what you want to manage.' },
    { id: 'users', label: 'People', icon: Users, description: 'Find a person and manage account access.' },
    { id: 'subscriptions', label: 'Plans & credits', icon: CreditCard, description: 'Change memberships, billing details, and AI credits.' },
    { id: 'meetings', label: 'Meeting rooms', icon: Video, description: 'Find rooms and manage their records.' },
  ] as const;
  // Data states
  const [users, setUsers] = useState<UserItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  
  // Search states
  const [userSearch, setUserSearch] = useState('');
  const [meetingSearch, setMeetingSearch] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        if (status === 'authenticated') {
          const userRole = (session?.user as any)?.role;
          if (userRole === 'admin') {
            await fetchAllData();
            return;
          }
        }

        if (status !== 'loading') {
          // Check admin cookie-based session as a fallback (admins authenticate via env creds)
          try {
            const s = await fetch('/api/admin/auth/session', { credentials: 'include' });
            const d = await s.json();
            if (s.ok && d?.authenticated) {
              // admin cookie valid; mark authorized and load admin data
              setAdminAuthorized(true);
              await fetchAllData();
              return;
            }
          } catch (e) {
            // ignore and redirect to admin login below
          }

          router.push('/admin/login');
        }
      } catch (err) {
        console.error('Admin access check failed', err);
      }
    })();
  }, [status, session, router]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    if (type === 'success') setTimeout(() => setMessage(current => current?.text === text ? null : current), 5000);
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const [statsRes, usersRes, meetingsRes] = await Promise.all([
        fetch('/api/admin/stats', { credentials: 'include' }),
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/meetings', { credentials: 'include' }),
      ]);

      if ([statsRes, usersRes, meetingsRes].some(res => !res.ok)) setLoadError('Some data could not be loaded. Refresh to try again.');
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats);
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users || []);
      }
      if (meetingsRes.ok) {
        const d = await meetingsRes.json();
        setMeetings(d.meetings || []);
      }

    } catch (err) {
      console.error('Error fetching admin data:', err);
      setLoadError('Could not load dashboard data. Check your connection and refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<UserItem>) => {
    try {
      setActionLoading(`user-update-${userId}`);
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, ...updates }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update user');

      showToast('Changes saved');
      setEditingUser(null);
      
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, ...updates } : u))
      );
      
      // Refresh stats
      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to update user', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;

    try {
      setActionLoading(`user-delete-${userId}`);
      const response = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete user');

      showToast('User deleted successfully');
      setUsers((prev) => prev.filter((u) => u._id !== userId));
      
      // Refresh stats
      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to terminate/delete this meeting room?')) return;

    try {
      setActionLoading(`meeting-delete-${meetingId}`);
      const response = await fetch(`/api/admin/meetings?meetingId=${meetingId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete meeting');

      showToast('Meeting deleted successfully');
      setMeetings((prev) => prev.filter((m) => m.meetingId !== meetingId));
      
      // Refresh stats
      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to delete meeting', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (userFilter !== 'all' && u.status !== userFilter) return false;
    const s = userSearch.trim().toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s)
    );
  });

  const filteredMeetings = meetings.filter((m) => {
    const s = meetingSearch.toLowerCase();
    return (
      m.title.toLowerCase().includes(s) ||
      m.hostEmail.toLowerCase().includes(s) ||
      m.meetingId.toLowerCase().includes(s)
    );
  });

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell-wide space-y-10">
        <section className="relative overflow-hidden rounded-[2.75rem] border border-zinc-800 bg-zinc-900/75 p-6 shadow-xl backdrop-blur sm:p-10">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-12 w-full max-w-2xl" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`admin-skeleton-stat-${index}`} className="h-28 rounded-[1.75rem]" />
            ))}
          </div>
          <div className="mt-10 h-96 rounded-[1.75rem]">
            <Skeleton className="h-full w-full rounded-[1.75rem]" />
          </div>
        </section>
      </div>
    );
  }

  // Allow render when NextAuth session indicates admin OR when admin cookie auth succeeded
  const sessionIsAdmin = status === 'authenticated' && (session?.user as any)?.role === 'admin';
  if (!sessionIsAdmin && !adminAuthorized) {
    return null;
  }

  return (
    <div className="page-shell-wide space-y-10 pb-16">
      <section className="overflow-hidden rounded-lg border border-[#27272a] bg-[#18181b] p-6 sm:p-8">
        <div className="space-y-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="section-kicker">Melanam administration</p><h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1><p className="mt-2 text-sm text-zinc-400">People, plans, and meeting settings in one place.</p></div>
            <button className="button-secondary" disabled={!!actionLoading} onClick={() => void fetchAllData()}>Refresh data</button>
          </header>
          {loadError && <div role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">{loadError}</div>}
          {/* Stats Section */}
          {stats && activeTab === 'overview' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Total Users</p>
                <p className="mt-3 font-display text-3xl font-semibold text-zinc-100">{stats.totalUsers}</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Admins: {stats.roles.admin}
                </p>
              </GlowCard>
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Meetings Created</p>
                <p className="mt-3 font-display text-3xl font-semibold text-zinc-100">{stats.totalMeetings}</p>
                <p className="mt-1 text-sm text-zinc-400">Total room records</p>
              </GlowCard>
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Recent Sessions</p>
                <p className="mt-3 font-display text-3xl font-semibold text-emerald-600">{stats.activeMeetings}</p>
                <p className="mt-1 text-sm text-zinc-400">Active in the last two hours</p>
              </GlowCard>
            </div>
          )}

          <nav aria-label="Admin sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {navigation.map(item => <button key={item.id} onClick={() => setActiveTab(item.id)} aria-current={activeTab === item.id ? 'page' : undefined} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm transition ${activeTab === item.id ? 'bg-zinc-50 font-semibold text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}><item.icon size={16} />{item.label}</button>)}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-xl font-semibold">{navigation.find(item => item.id === activeTab)?.label}</h2><p className="mt-1 text-sm text-zinc-400">{navigation.find(item => item.id === activeTab)?.description}</p></div>
          </div>
          {activeTab === 'overview' && <div className="grid gap-4 sm:grid-cols-2">{navigation.filter(item => item.id !== 'overview').map(item => <button key={item.id} onClick={() => setActiveTab(item.id)} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-left transition hover:border-zinc-600 hover:bg-zinc-900"><item.icon size={24} className="mb-4 text-zinc-400" /><span className="flex items-center justify-between font-semibold">{item.label}<ArrowRight size={16} /></span><p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p></button>)}</div>}
          <div className="mt-6">
            {activeTab === 'users' && <div className="space-y-4">
              <div className="flex flex-wrap gap-3"><input aria-label="Search people" className="input-modern min-w-0 basis-full sm:flex-1" placeholder="Search name or email" value={userSearch} onChange={e => setUserSearch(e.target.value)} /><select aria-label="Filter account status" className="px-3 py-2 text-sm" value={userFilter} onChange={e => setUserFilter(e.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="disabled">Disabled</option></select></div>
              <p className="text-xs text-zinc-400">{filteredUsers.length} of {users.length} people</p>
              {!filteredUsers.length && <p className="py-8 text-center text-sm text-zinc-400">No accounts match your search.</p>}
              {filteredUsers.map(user => <article key={user._id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="break-all font-medium">{user.name || user.email}</h3><p className="break-all text-sm text-zinc-400">{user.email}</p><p className="mt-2 text-xs text-zinc-500">{user.role === 'admin' ? 'Admin' : 'Member'} · {user.status === 'active' ? 'Active' : 'Disabled'}</p></div><button disabled={!!actionLoading} className="button-secondary" onClick={() => setEditingUser({ ...user })}>Edit access</button></div>
                {editingUser?._id === user._id && <form className="mt-5 border-t border-zinc-800 pt-5" onSubmit={e => { e.preventDefault(); void handleUpdateUser(user._id, { role: editingUser.role, status: editingUser.status }); }}>
                  <fieldset disabled={!!actionLoading} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm text-zinc-400"><span>Account role</span><select aria-label="Account role" className="input-modern" disabled={user.email === session?.user?.email} value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserItem['role'] })}><option value="user">Member</option><option value="admin">Admin</option></select></label>
                      <label className="space-y-2 text-sm text-zinc-400"><span>Account access</span><select aria-label="Account access" className="input-modern" disabled={user.email === session?.user?.email} value={editingUser.status} onChange={e => setEditingUser({ ...editingUser, status: e.target.value as UserItem['status'] })}><option value="active">Active — can sign in</option><option value="disabled">Disabled — sign-in blocked</option></select></label>
                    </div>
                    <p className="text-xs text-zinc-400">Admins can manage all users and application data. Changes apply when you save.</p>
                    <div className="flex flex-wrap items-center gap-3"><button className="button-primary" type="submit">{actionLoading ? 'Saving…' : 'Save changes'}</button><button className="button-secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button><button type="button" disabled={user.email === session?.user?.email} className="ml-auto text-sm text-red-300" onClick={() => void handleDeleteUser(user._id)}>Delete account</button></div>
                  </fieldset>
                </form>}
              </article>)}
            </div>}
            {activeTab === 'meetings' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="text"
                    aria-label="Search rooms"
                    placeholder="Search title, room ID, or host email"
                    value={meetingSearch}
                    onChange={(e) => setMeetingSearch(e.target.value)}
                    className="input-modern max-w-md w-full"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-zinc-400">
                      Showing {filteredMeetings.length} of {meetings.length} rooms
                    </span>

                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
                  <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-400">
                    <thead className="bg-zinc-900 text-zinc-100 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Room Title</th>
                        <th className="px-6 py-4">Room ID</th>
                        <th className="px-6 py-4">Host Email</th>
                        <th className="px-6 py-4">Participant Joins</th>
                        <th className="px-6 py-4">Created At</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {filteredMeetings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-zinc-400">
                            No active or logged rooms found
                          </td>
                        </tr>
                      ) : (
                        filteredMeetings.map((meeting) => (
                          <tr key={meeting._id} className="hover:bg-zinc-900/50 transition">
                            <td className="px-6 py-4 font-semibold text-zinc-100">
                              {meeting.title}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-zinc-400">
                              {meeting.meetingId}
                            </td>
                            <td className="px-6 py-4 text-zinc-400">
                              {meeting.hostEmail}
                            </td>
                            <td className="px-6 py-4 font-semibold text-zinc-100">
                              {meeting.joinCount}
                            </td>
                            <td className="px-6 py-4 text-xs text-zinc-400">
                              {new Date(meeting.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                disabled={actionLoading === `meeting-delete-${meeting.meetingId}`}
                                onClick={() => handleDeleteMeeting(meeting.meetingId)}
                                className="text-red-500 hover:text-red-700 font-semibold text-xs disabled:opacity-50 transition"
                              >
                                {actionLoading === `meeting-delete-${meeting.meetingId}` ? 'Terminating...' : 'Terminate'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'subscriptions' && (
              <div className="space-y-4">
                <AdminSubscriptionTable />
              </div>
            )}

          </div>
        </div>
      </section>

      {/* Floating Toast Notification */}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[1200] flex items-center gap-2 rounded-xl px-5 py-3.5 text-white shadow-xl ${
            message.type === 'error' ? 'bg-red-500/90' : 'bg-zinc-900/90'
          }`}
        >
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}


    </div>
  );
}
