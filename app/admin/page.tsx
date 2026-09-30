'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { GlowCard } from '../../components/ui/glow-card';
import { SectionHeading } from '../../components/ui/section-heading';
import { GradientBorderButton } from '../../components/ui/gradient-border-button';
import { Footer } from '../../components/ui/footer';
import { Skeleton } from '../../components/ui/skeleton';
import AdminSubscriptionTable from '../../components/AdminSubscriptionTable';

interface UserItem {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'enterprise_admin';
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

interface OrganizationItem {
  _id: string;
  name: string;
  domain?: string;
  billingPlan: string;
  memberCount: number;
  policies: {
    recordingAllowed: boolean;
    chatEnabled: boolean;
    requirePassword: boolean;
  };
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalMeetings: number;
  totalOrganizations: number;
  activeMeetings: number;
  roles: {
    admin: number;
    enterprise_admin: number;
    user: number;
  };
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'users' | 'meetings' | 'organizations' | 'subscriptions' | 'danger'>('users');
  
  // Data states
  const [users, setUsers] = useState<UserItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  
  // Search states
  const [userSearch, setUserSearch] = useState('');
  const [meetingSearch, setMeetingSearch] = useState('');
  
  // Form states (create organization)
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');
  const [newOrgPlan, setNewOrgPlan] = useState('enterprise');
  const [newOrgRecAllowed, setNewOrgRecAllowed] = useState(true);
  const [newOrgChatEnabled, setNewOrgChatEnabled] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showTerminateRoomsModal, setShowTerminateRoomsModal] = useState(false);
  const [terminateRoomsConfirmation, setTerminateRoomsConfirmation] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        if (status === 'authenticated') {
          const userRole = (session?.user as any)?.role;
          if (userRole !== 'admin') {
            router.push('/lms');
            return;
          }
          await fetchAllData();
          return;
        }

        if (status === 'unauthenticated') {
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
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, meetingsRes, orgsRes] = await Promise.all([
        fetch('/api/admin/stats', { credentials: 'include' }),
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/meetings', { credentials: 'include' }),
        fetch('/api/admin/organizations', { credentials: 'include' }),
      ]);

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
      if (orgsRes.ok) {
        const d = await orgsRes.json();
        setOrganizations(d.organizations || []);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
      showToast('Failed to load dashboard data', 'error');
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

      showToast('User updated successfully');
      
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

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('org-create');
      const response = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newOrgName,
          domain: newOrgDomain || undefined,
          billingPlan: newOrgPlan,
          recordingAllowed: newOrgRecAllowed,
          chatEnabled: newOrgChatEnabled,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create organization');

      showToast('Organization created successfully');
      setShowOrgModal(false);
      
      // Reset form
      setNewOrgName('');
      setNewOrgDomain('');
      setNewOrgPlan('enterprise');
      setNewOrgRecAllowed(true);
      setNewOrgChatEnabled(true);

      // Refresh organizations
      const orgsRes = await fetch('/api/admin/organizations', { credentials: 'include' });
      if (orgsRes.ok) {
        const d = await orgsRes.json();
        setOrganizations(d.organizations || []);
      }
      
      // Refresh stats
      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to create organization', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteOrg = async (orgId: string) => {
    if (!confirm('Are you sure you want to delete this organization? All member links will be dissolved.')) return;

    try {
      setActionLoading(`org-delete-${orgId}`);
      const response = await fetch(`/api/admin/organizations?orgId=${orgId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete organization');

      showToast('Organization deleted successfully');
      setOrganizations((prev) => prev.filter((o) => o._id !== orgId));
      
      // Refresh users (since their org relations changed)
      const usersRes = await fetch('/api/admin/users', { credentials: 'include' });
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users || []);
      }

      // Refresh stats
      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to delete organization', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const closeTerminateRoomsModal = () => {
    if (actionLoading === 'meetings-terminate-all') return;
    setShowTerminateRoomsModal(false);
    setTerminateRoomsConfirmation('');
  };

  const handleTerminateAllRooms = async () => {
    if (terminateRoomsConfirmation !== 'TERMINATE') return;

    try {
      setActionLoading('meetings-terminate-all');
      const response = await fetch('/api/admin/meetings?all=true', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmation: terminateRoomsConfirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to terminate rooms');

      setMeetings([]);
      setShowTerminateRoomsModal(false);
      setTerminateRoomsConfirmation('');
      showToast(data.message || 'All rooms terminated successfully');

      void fetch('/api/admin/stats', { credentials: 'include' }).then((res) => {
        if (res.ok) res.json().then((d) => setStats(d.stats));
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to terminate rooms', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const closeDeleteAllModal = () => {
    if (actionLoading === 'delete-all') return;
    setShowDeleteAllModal(false);
    setDeleteConfirmation('');
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmation !== 'DELETE') return;

    try {
      setActionLoading('delete-all');
      const response = await fetch('/api/admin/delete-all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete application data');

      setUsers([]);
      setMeetings([]);
      setOrganizations([]);
      setStats({
        totalUsers: 0,
        totalMeetings: 0,
        totalOrganizations: 0,
        activeMeetings: 0,
        roles: {
          admin: 0,
          enterprise_admin: 0,
          user: 0,
        },
      });
      setShowDeleteAllModal(false);
      setDeleteConfirmation('');
      showToast('All application data deleted successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete application data', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const s = userSearch.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u.organizationName || '').toLowerCase().includes(s)
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
        <section className="relative overflow-hidden rounded-[2.75rem] border border-white/70 bg-white/75 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur sm:p-10">
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
      <section className="overflow-hidden rounded-lg border border-[#2a3039] bg-[#12151a] p-6 sm:p-8">
        <div className="space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                Administration Portal
              </p>
              <h1 className="font-display text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                🛡️ System Console
              </h1>
              <p className="text-base text-slate-600">
                Manage global users, organization billing/policies, and monitor system rooms.
              </p>
            </div>
            {activeTab === 'organizations' && (
              <GradientBorderButton variant="create" onClick={() => setShowOrgModal(true)}>
                ➕ Create Organization
              </GradientBorderButton>
            )}
          </div>

          {/* Stats Section */}
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Total Users</p>
                <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{stats.totalUsers}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Admins: {stats.roles.admin} | Enterprise: {stats.roles.enterprise_admin}
                </p>
              </GlowCard>
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Organizations</p>
                <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{stats.totalOrganizations}</p>
                <p className="mt-1 text-sm text-slate-500">Registered SaaS enterprises</p>
              </GlowCard>
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Meetings Created</p>
                <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{stats.totalMeetings}</p>
                <p className="mt-1 text-sm text-slate-500">Cumulative room logs</p>
              </GlowCard>
              <GlowCard className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Active Sessions</p>
                <p className="mt-3 font-display text-3xl font-semibold text-emerald-600">{stats.activeMeetings}</p>
                <p className="mt-1 text-sm text-slate-500">Live or touched in last 2h</p>
              </GlowCard>
            </div>
          )}

          {/* Tabs Switcher */}
          <div className="flex flex-wrap border-b border-slate-200">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                activeTab === 'users'
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              👥 User Accounts
            </button>
            <button
              onClick={() => setActiveTab('meetings')}
              className={`px-6 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                activeTab === 'meetings'
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              📞 Video Rooms
            </button>
            <button
              onClick={() => setActiveTab('organizations')}
              className={`px-6 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                activeTab === 'organizations'
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              🏢 Organizations
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`px-6 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                activeTab === 'subscriptions'
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              💳 Subscriptions
            </button>
            <button
              onClick={() => setActiveTab('danger')}
              className={`px-6 py-3 text-sm font-semibold transition border-b-2 -mb-[2px] ${
                activeTab === 'danger'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-red-600'
              }`}
            >
              Danger Zone
            </button>
          </div>
          {/* Tab Contents */}
          <div className="mt-6">
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="text"
                    placeholder="Search users by name, email, or organization..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="input-modern max-w-md w-full"
                  />
                  <span className="text-sm text-slate-500">
                    Showing {filteredUsers.length} of {users.length} users
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-800 font-semibold">
                      <tr>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Organization</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Joined Date</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                            No users found matching query
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                          <tr key={user._id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900">{user.name || 'No Name'}</div>
                              <div className="text-xs text-slate-500">{user.email}</div>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={user.role}
                                disabled={actionLoading === `user-update-${user._id}` || user.email === session?.user?.email}
                                onChange={(e) => handleUpdateUser(user._id, { role: e.target.value as any })}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              >
                                <option value="user">User</option>
                                <option value="enterprise_admin">Enterprise Admin</option>
                                <option value="admin">System Admin</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {user.organizationName ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                                  🏢 {user.organizationName}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">None</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                disabled={actionLoading === `user-update-${user._id}` || user.email === session?.user?.email}
                                onClick={() =>
                                  handleUpdateUser(user._id, { status: user.status === 'active' ? 'disabled' : 'active' })
                                }
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                                  user.status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
                                    : 'bg-red-500/10 text-red-700 ring-red-500/20'
                                }`}
                              >
                                {user.status === 'active' ? '🟢 Active' : '🔴 Disabled'}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                disabled={actionLoading === `user-delete-${user._id}` || user.email === session?.user?.email}
                                onClick={() => handleDeleteUser(user._id)}
                                className="text-red-500 hover:text-red-700 font-semibold text-xs disabled:opacity-50 transition"
                              >
                                {actionLoading === `user-delete-${user._id}` ? 'Deleting...' : 'Delete'}
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

            {activeTab === 'meetings' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="text"
                    placeholder="Search meetings by title, room ID, or host email..."
                    value={meetingSearch}
                    onChange={(e) => setMeetingSearch(e.target.value)}
                    className="input-modern max-w-md w-full"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-500">
                      Showing {filteredMeetings.length} of {meetings.length} rooms
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTerminateRoomsModal(true)}
                      disabled={meetings.length === 0}
                      className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Terminate all rooms
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-800 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Room Title</th>
                        <th className="px-6 py-4">Room ID</th>
                        <th className="px-6 py-4">Host Email</th>
                        <th className="px-6 py-4">Participant Joins</th>
                        <th className="px-6 py-4">Created At</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMeetings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                            No active or logged rooms found
                          </td>
                        </tr>
                      ) : (
                        filteredMeetings.map((meeting) => (
                          <tr key={meeting._id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              {meeting.title}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">
                              {meeting.meetingId}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {meeting.hostEmail}
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              {meeting.joinCount}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
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

            {activeTab === 'organizations' && (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-800 font-semibold">
                      <tr>
                        <th className="px-6 py-4">Organization Name</th>
                        <th className="px-6 py-4">Domain Domain</th>
                        <th className="px-6 py-4">Plan Tier</th>
                        <th className="px-6 py-4">Active Members</th>
                        <th className="px-6 py-4">Meeting Policies</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {organizations.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                            No organizations created yet. Click "Create Organization" to add one.
                          </td>
                        </tr>
                      ) : (
                        organizations.map((org) => (
                          <tr key={org._id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-900">{org.name}</div>
                              <div className="text-xs text-slate-400">Registered {new Date(org.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                              {org.domain ? `@${org.domain}` : <span className="text-slate-400 italic">No restriction</span>}
                            </td>
                            <td className="px-6 py-4 uppercase font-semibold text-cyan-600 text-xs">
                              {org.billingPlan}
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              {org.memberCount} members
                            </td>
                            <td className="px-6 py-4 text-xs space-y-0.5">
                              <div>Recordings: {org.policies.recordingAllowed ? '✅ Allowed' : '❌ Disallowed'}</div>
                              <div>Chat: {org.policies.chatEnabled ? '✅ Enabled' : '❌ Disabled'}</div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                disabled={actionLoading === `org-delete-${org._id}`}
                                onClick={() => handleDeleteOrg(org._id)}
                                className="text-red-500 hover:text-red-700 font-semibold text-xs disabled:opacity-50 transition"
                              >
                                {actionLoading === `org-delete-${org._id}` ? 'Deleting...' : 'Delete'}
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
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-600">
                    Manage app memberships, activation, cancellation, period extensions, manual Pro or Business grants, extra credits, and credit resets.
                  </p>
                </div>
                <AdminSubscriptionTable />
              </div>
            )}

            {activeTab === 'danger' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-700">Destructive action</p>
                      <h2 className="mt-2 font-display text-2xl font-semibold text-red-950">Delete All Data</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-red-800">
                        This opens a confirmation modal before any deletion can occur. You must type DELETE exactly to enable the final delete action.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteAllModal(true)}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 sm:w-auto"
                    >
                      Delete All Data
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Create Org Modal */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl font-semibold text-slate-950">
              Create Enterprise Organization
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Set up a new company account with domain mapping and default meeting policies.
            </p>

            <form onSubmit={handleCreateOrg} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Organization Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="input-modern mt-1.5 w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Domain Mapping (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme.com"
                  value={newOrgDomain}
                  onChange={(e) => setNewOrgDomain(e.target.value)}
                  className="input-modern mt-1.5 w-full"
                />
                <span className="text-sm text-slate-400 mt-1 block">
                  New sign-ups matching this domain automatically link to this organization.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Billing Plan Tier
                </label>
                <select
                  value={newOrgPlan}
                  onChange={(e) => setNewOrgPlan(e.target.value)}
                  className="input-modern mt-1.5 w-full"
                >
                  <option value="enterprise">Enterprise Tier</option>
                  <option value="premium">Premium Tier</option>
                  <option value="basic">Basic Tier</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrgRecAllowed}
                    onChange={(e) => setNewOrgRecAllowed(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-600 font-medium">Allow Recording</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrgChatEnabled}
                    onChange={(e) => setNewOrgChatEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-600 font-medium">Enable Chat</span>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOrgModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <GradientBorderButton type="submit" variant="create" disabled={actionLoading === 'org-create'}>
                  {actionLoading === 'org-create' ? 'Creating...' : 'Create Org'}
                </GradientBorderButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete All Data Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-700">Danger confirmation</p>
              <h3 className="mt-2 font-display text-2xl font-semibold text-red-950">
                Delete All Data
              </h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-red-800">
                This action permanently deletes ALL application data and cannot be undone.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Type DELETE to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                autoComplete="off"
                className="input-modern w-full border-red-200 focus:border-red-500 focus:ring-red-500"
                placeholder="DELETE"
              />
              <p className="text-xs leading-5 text-slate-500">
                The delete button remains disabled until the confirmation text exactly matches DELETE.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteAllModal}
                disabled={actionLoading === 'delete-all'}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllData}
                disabled={deleteConfirmation !== 'DELETE' || actionLoading === 'delete-all'}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
              >
                {actionLoading === 'delete-all' ? 'Deleting...' : 'Delete All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTerminateRoomsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-700">Room management</p>
              <h3 className="mt-2 font-display text-2xl font-semibold text-red-950">Terminate all rooms</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-red-800">
                This permanently removes all {meetings.length} room records. This action cannot be undone.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Type TERMINATE to confirm
              </label>
              <input
                type="text"
                value={terminateRoomsConfirmation}
                onChange={(e) => setTerminateRoomsConfirmation(e.target.value)}
                autoComplete="off"
                className="input-modern w-full border-red-200 focus:border-red-500 focus:ring-red-500"
                placeholder="TERMINATE"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeTerminateRoomsModal}
                disabled={actionLoading === 'meetings-terminate-all'}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTerminateAllRooms}
                disabled={terminateRoomsConfirmation !== 'TERMINATE' || actionLoading === 'meetings-terminate-all'}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
              >
                {actionLoading === 'meetings-terminate-all' ? 'Terminating...' : 'Terminate all rooms'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {message && (
        <div
          className={`fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-xl px-5 py-3.5 text-white shadow-xl ${
            message.type === 'error' ? 'bg-red-500/90' : 'bg-slate-900/90'
          }`}
        >
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <Footer />
    </div>
  );
}
