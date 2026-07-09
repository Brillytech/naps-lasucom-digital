import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject =
  process.env.VAPID_SUBJECT || "mailto:brillytechnetworks@gmail.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: "Invalid admin session" });
    }

    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from("admin_profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .single();

    if (adminError || !adminProfile?.is_active) {
      return res.status(403).json({ error: "Admin access denied" });
    }

    if (!["president", "pro"].includes(adminProfile.role)) {
      return res.status(403).json({
        error: "Only President and PRO can send push notifications",
      });
    }

    const {
      title = "NAPS LASUCOM",
      body = "You have a new notification.",
      url = "/notifications",
      image = "",
    } = req.body || {};

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("is_active", true);

    if (error) throw new Error(error.message);

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        message: "No active subscriptions found.",
      });
    }

    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({
      title,
      body,
      url,
      image,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    await Promise.all(
      subscriptions.map(async (item) => {
        try {
          await webpush.sendNotification(item.subscription, payload);
          sent += 1;
        } catch (pushError) {
          failed += 1;

          if (pushError?.statusCode === 404 || pushError?.statusCode === 410) {
            await supabaseAdmin
              .from("push_subscriptions")
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.id);
          }
        }
      })
    );

    return res.status(200).json({
      success: true,
      sent,
      failed,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unable to send push notification.",
    });
  }
}