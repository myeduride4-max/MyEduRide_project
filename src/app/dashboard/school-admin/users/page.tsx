'use client';

import { useEffect, useState } from 'react';
import { Users, RefreshCcw, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

type UserRow = {
  id: string;
  username: string;
  full_name: string;
  roles: string[];
  password: string;
};

export default function SchoolAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftPasswords, setDraftPasswords] = useState<Record<string, string>>({});

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school-admin/users', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load users');
        return;
      }

      setUsers(data.users || []);
      setDraftPasswords(
        Object.fromEntries((data.users || []).map((u: UserRow) => [u.id, u.password || '']))
      );
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const savePassword = async (userId: string) => {
    const password = (draftPasswords[userId] || '').trim();
    if (!password) {
      toast.error('Enter a password first');
      return;
    }

    setSavingId(userId);
    try {
      const res = await fetch('/api/school-admin/users/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update password');
        return;
      }

      toast.success('Password updated');
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, password } : u)));
    } catch {
      toast.error('Failed to update password');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-primary-700" />
            School Users & Passwords
          </h1>
          <p className="text-sm text-gray-500">
            Manage passwords for users in your school only
          </p>
        </div>
        <button type="button" onClick={fetchUsers} className="btn-secondary flex items-center gap-2">
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-500">Loading users...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Username</th>
                <th className="py-3 pr-4">Roles</th>
                <th className="py-3 pr-4">Password</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0">
                  <td className="py-3 pr-4">{user.full_name || '-'}</td>
                  <td className="py-3 pr-4">{user.username}</td>
                  <td className="py-3 pr-4">{user.roles.length ? user.roles.join(', ') : '-'}</td>
                  <td className="py-3 pr-4 min-w-[260px]">
                    <input
                      type="text"
                      value={draftPasswords[user.id] ?? ''}
                      onChange={(e) =>
                        setDraftPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))
                      }
                      className="input h-9"
                      placeholder="Set user password"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => savePassword(user.id)}
                      disabled={savingId === user.id}
                      className="btn-primary h-9 px-3 inline-flex items-center gap-1.5"
                    >
                      <KeyRound size={14} />
                      {savingId === user.id ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
