import { supabase } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function enablePushNotifications() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this browser.");
  }

  if (!("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported on this browser.");
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Missing VAPID public key.");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subscriptionJson = subscription.toJSON();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: subscription.endpoint,
      subscription: subscriptionJson,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "endpoint",
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return subscriptionJson;
}

export async function sendPushNotification({ title, body, image }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Admin session not found.");
  }

  const response = await fetch("/api/send-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      title,
      body,
      image,
      url: "/notifications",
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Unable to send push notification.");
  }

  return result;
}