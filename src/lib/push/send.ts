import webpush from 'web-push';

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  'mailto:notifications@myeduride.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface PushPayload {
  title: string;
  message: string;
  type: 'arrival' | 'departure' | 'late' | 'dismissal' | 'system';
  student_id?: string;
  url?: string;
  tag?: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys_p256dh,
          auth: subscription.keys_auth,
        },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (error: any) {
    // If subscription is expired/invalid, return false so caller can clean up
    if (error.statusCode === 410 || error.statusCode === 404) {
      return false;
    }
    console.error('Push notification failed:', error);
    return false;
  }
}

export async function sendPushToUser(
  supabase: any,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  // Get all push subscriptions for this user
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const success = await sendPushNotification(sub, payload);
    if (success) {
      sent++;
    } else {
      failed++;
      // Remove invalid subscription
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', sub.id);
    }
  }

  return { sent, failed };
}
