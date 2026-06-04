import { createClient } from '@/lib/supabase/client';

export async function subscribeToPush(): Promise<boolean> {
  try {
    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push notification permission denied');
      return false;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ) as any,
    });

    // Save subscription to database
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const subJson = subscription.toJSON();

    await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subJson.endpoint!,
      keys_p256dh: subJson.keys!.p256dh!,
      keys_auth: subJson.keys!.auth!,
    }, {
      onConflict: 'user_id,endpoint',
    });

    return true;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();

    // Remove from database
    const supabase = createClient();
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
