'use client';

import { AccountSettingsCard } from '@/components/shared/AccountSettingsCard';

/** @deprecated Use AccountSettingsCard — kept for existing imports */
export function ChangePasswordCard(props: { onSuccess?: () => void }) {
  return <AccountSettingsCard {...props} />;
}
