'use client';

import { useEffect, useState } from 'react';
import { KeyRound, User } from 'lucide-react';
import { toast } from 'sonner';
import { getSession, saveSession } from '@/lib/api';

type AccountSettingsCardProps = {
  onSuccess?: () => void;
};

export function AccountSettingsCard({ onSuccess }: AccountSettingsCardProps) {
  const [currentUsername, setCurrentUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = getSession();
    const username = session?.username || '';
    setCurrentUsername(username);
    setNewUsername(username);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Enter your current password to save changes');
      return;
    }

    const usernameChanging =
      newUsername.trim() &&
      newUsername.trim().toLowerCase() !== currentUsername.toLowerCase();
    const passwordChanging = !!newPassword.trim();

    if (!usernameChanging && !passwordChanging) {
      toast.error('Change your username and/or enter a new password');
      return;
    }

    if (passwordChanging && newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/update-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_username: usernameChanging ? newUsername : undefined,
          new_password: passwordChanging ? newPassword : undefined,
          confirm_password: passwordChanging ? confirmPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not update account');
        return;
      }

      const parts: string[] = [];
      if (data.username_updated) parts.push('username updated');
      if (data.password_updated) parts.push('password updated');
      toast.success(parts.length ? parts.join(' · ') : 'Account updated');

      if (data.username) {
        setCurrentUsername(data.username);
        setNewUsername(data.username);
        const session = getSession();
        if (session) {
          saveSession({ ...session, username: data.username });
        }
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch {
      toast.error('Could not update account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <User size={16} className="text-primary-600" />
        Account settings
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Update your login username and/or password. Your current password is required to confirm any change.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current username</label>
          <p className="text-sm font-mono text-gray-900 bg-gray-50 rounded-lg px-3 py-2 border">
            @{currentUsername || '—'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New username</label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
            className="input font-mono"
            autoComplete="username"
            placeholder="e.g. jsmith"
          />
          <p className="text-[11px] text-gray-400 mt-1">3–30 characters · letters, numbers, underscore, dot</p>
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <KeyRound size={14} />
            Password
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password *</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
                placeholder="Leave blank to keep current password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
