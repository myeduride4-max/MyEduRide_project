'use client';

type Props = {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  label?: string;
  hint?: string;
  required?: boolean;
};

export function InitialPasswordFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmChange,
  label = 'Default password',
  hint = 'Share this with the user. They should change it after first login.',
  required = true,
}: Props) {
  return (
    <div className="space-y-3 border border-slate-100 rounded-xl p-3 bg-slate-50/80">
      <p className="text-xs font-semibold text-slate-700">{label}{required ? ' *' : ''}</p>
      {hint && <p className="text-[11px] text-slate-500 -mt-2">{hint}</p>}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
        <input
          type="text"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="input font-mono text-sm"
          placeholder="e.g. Welcome2026"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>
        <input
          type="text"
          value={confirmPassword}
          onChange={(e) => onConfirmChange(e.target.value)}
          className="input font-mono text-sm"
          placeholder="Re-enter password"
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}
