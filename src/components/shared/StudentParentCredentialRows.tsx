'use client';

import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export type AuthorisedPickupPerson = {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
};

export type StudentParentCredential = {
  student_id: string;
  student_name: string;
  student_id_number: string;
  class_name: string | null;
  parent_user_id: string | null;
  parent_name: string;
  parent_username: string;
  parent_username_on_file?: string;
  password: string;
  parent_on_file_name?: string;
  parent_phone?: string | null;
  parent_email?: string | null;
  authorised_pickup_persons?: AuthorisedPickupPerson[];
  primary_pickup_person?: string | null;
  needs_parent_account?: boolean;
};

type Props = {
  rows: StudentParentCredential[];
  draftPasswords: Record<string, string>;
  draftConfirmPasswords: Record<string, string>;
  setDraftPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDraftConfirmPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (parentUserId: string) => void;
  onProvision?: (studentId: string, password: string, confirmPassword: string) => Promise<void>;
  savingId: string | null;
  provisioningId: string | null;
  showPasswords: boolean;
};

export function StudentParentCredentialTableHead() {
  return (
    <tr className="text-left border-b bg-white text-xs text-gray-500 uppercase">
      <th className="py-2.5 px-5 font-semibold">Student</th>
      <th className="py-2.5 pr-4 font-semibold">Parent name</th>
      <th className="py-2.5 pr-4 font-semibold">Authorised pickup</th>
      <th className="py-2.5 pr-4 font-semibold">Parent username</th>
      <th className="py-2.5 pr-3 font-semibold">Password</th>
      <th className="py-2.5 pr-4 font-semibold">Confirm</th>
      <th className="py-2.5 pr-5 font-semibold">Actions</th>
    </tr>
  );
}

function PickupCell({ persons, primary }: { persons: AuthorisedPickupPerson[]; primary: string | null }) {
  if (persons.length === 0) {
    return <span className="text-xs text-gray-400">None on file</span>;
  }
  const main = persons[0];
  return (
    <div>
      <p className="text-sm font-medium text-gray-900">{main.name}</p>
      {main.phone && <p className="text-xs font-mono text-gray-500">{main.phone}</p>}
      {main.relationship && <p className="text-xs text-gray-400 capitalize">{main.relationship}</p>}
      {persons.length > 1 && (
        <p className="text-[10px] text-gray-400 mt-0.5">+{persons.length - 1} more</p>
      )}
      {!persons.length && primary && <p className="text-sm text-gray-700">{primary}</p>}
    </div>
  );
}

export function StudentParentCredentialRows({
  rows,
  draftPasswords,
  draftConfirmPasswords,
  setDraftPasswords,
  setDraftConfirmPasswords,
  onSave,
  onProvision,
  savingId,
  provisioningId,
  showPasswords,
}: Props) {
  if (rows.length === 0) return null;

  return (
    <tbody>
      {rows.map((row) => {
        const key = row.parent_user_id || row.student_id;
        const hasParent = !!row.parent_user_id;
        const usernameOnFile = row.parent_username_on_file?.trim() || '';
        const linkingExisting = !hasParent && !!usernameOnFile;
        const displayParentName =
          row.parent_name ||
          row.parent_on_file_name ||
          usernameOnFile ||
          (row.parent_email ? row.parent_email.split('@')[0] : '') ||
          '';
        const showParentBlock =
          !!displayParentName || !!usernameOnFile || !!row.parent_email || hasParent;
        const persons = row.authorised_pickup_persons || [];

        return (
          <tr key={row.student_id} className="border-b last:border-b-0 hover:bg-gray-50/80">
            <td className="py-3 px-5">
              <p className="font-medium text-gray-900">{row.student_name}</p>
              <p className="text-xs font-mono text-gray-500">{row.student_id_number}</p>
              {row.class_name && <p className="text-xs text-gray-400">{row.class_name}</p>}
            </td>
            <td className="py-3 pr-4 text-sm">
              {showParentBlock ? (
                <div>
                  <p className="font-medium text-gray-900">{displayParentName || `@${usernameOnFile}` || row.parent_email}</p>
                  {row.parent_phone && (
                    <p className="text-xs font-mono text-gray-500">{row.parent_phone}</p>
                  )}
                  {row.parent_email && (
                    <p className="text-xs text-gray-500">{row.parent_email}</p>
                  )}
                  {!hasParent && row.needs_parent_account && (
                    <p className="text-xs text-amber-700 mt-0.5">Login not created yet</p>
                  )}
                  {hasParent && !row.parent_username && (
                    <p className="text-xs text-amber-700 mt-0.5">Username missing — click Create login</p>
                  )}
                </div>
              ) : (
                <span className="text-amber-700 text-xs">No parent on file</span>
              )}
            </td>
            <td className="py-3 pr-4 text-sm min-w-[140px]">
              <PickupCell persons={persons} primary={row.primary_pickup_person || null} />
            </td>
            <td className="py-3 pr-4 font-mono text-xs">
              {hasParent ? (
                row.parent_username ? (
                  <span className="font-semibold text-gray-900">{row.parent_username}</span>
                ) : (
                  <span className="text-amber-700">Missing — use Create login</span>
                )
              ) : usernameOnFile ? (
                <span className="font-semibold text-emerald-800">@{usernameOnFile}</span>
              ) : (
                '—'
              )}
            </td>
            <td className="py-3 pr-3 min-w-[160px]">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={draftPasswords[key] ?? (hasParent ? row.password : '')}
                onChange={(e) =>
                  setDraftPasswords((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="input h-9 font-mono text-xs w-full"
                placeholder={
                  linkingExisting
                    ? 'Existing account — no password needed'
                    : hasParent || displayParentName
                      ? 'Password'
                      : 'Set parent name on student first'
                }
                disabled={linkingExisting}
              />
            </td>
            <td className="py-3 pr-4 min-w-[160px]">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={draftConfirmPasswords[key] ?? (hasParent ? row.password : '')}
                onChange={(e) =>
                  setDraftConfirmPasswords((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="input h-9 font-mono text-xs w-full"
                placeholder={linkingExisting ? '—' : 'Confirm'}
                disabled={linkingExisting}
              />
            </td>
            <td className="py-3 pr-5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pw = draftPasswords[key] ?? row.password ?? '';
                    const username = hasParent ? row.parent_username : '(create login first)';
                    navigator.clipboard.writeText(
                      `Student: ${row.student_name}\nParent: ${displayParentName}\nAuthorised pickup: ${persons.map((p) => p.name).join(', ') || '—'}\nParent username: ${username}\nPassword: ${pw || '(not set)'}`
                    );
                    toast.success('Copied');
                  }}
                  className="btn-secondary h-9 px-2.5"
                  title="Copy credentials"
                >
                  <Copy size={14} />
                </button>
                {hasParent && row.parent_username ? (
                  <button
                    type="button"
                    onClick={() => onSave(row.parent_user_id!)}
                    disabled={savingId === row.parent_user_id}
                    className="btn-primary h-9 px-3 inline-flex items-center gap-1.5"
                  >
                    <KeyRound size={14} />
                    {savingId === row.parent_user_id ? 'Saving…' : 'Update'}
                  </button>
                ) : onProvision && showParentBlock ? (
                  <button
                    type="button"
                    onClick={() =>
                      onProvision(
                        row.student_id,
                        linkingExisting ? '' : (draftPasswords[key] || '').trim(),
                        linkingExisting
                          ? ''
                          : (draftConfirmPasswords[key] || draftPasswords[key] || '').trim()
                      )
                    }
                    disabled={provisioningId === row.student_id}
                    className="btn-primary h-9 px-3 inline-flex items-center gap-1.5"
                  >
                    <UserPlus size={14} />
                    {provisioningId === row.student_id
                      ? 'Working…'
                      : linkingExisting
                        ? 'Link parent'
                        : 'Create login'}
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
