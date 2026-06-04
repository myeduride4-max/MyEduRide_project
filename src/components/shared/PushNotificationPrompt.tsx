'use client';

import { useEffect, useState } from 'react';
import { subscribeToPush } from '@/lib/push/subscribe';
import { Bell, X } from 'lucide-react';

export function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Only show if push is supported and not already subscribed
    if (!('PushManager' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    // Show prompt after 3 seconds
    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubscribe = async () => {
    setSubscribing(true);
    const success = await subscribeToPush();
    if (success) {
      setShow(false);
    }
    setSubscribing(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-lg border p-4 z-50 animate-in slide-in-from-bottom">
      <button onClick={() => setShow(false)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary-100 rounded-lg shrink-0">
          <Bell className="text-primary-600" size={20} />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Enable Notifications</h4>
          <p className="text-xs text-gray-500 mt-1">
            Get instant alerts when your child arrives or leaves school.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="btn-primary text-xs mt-3 py-1.5 px-3"
          >
            {subscribing ? 'Enabling...' : 'Enable Push Notifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
