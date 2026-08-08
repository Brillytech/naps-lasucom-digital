import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject =
  process.env.VAPID_SUBJECT || "mailto:brillytechnetworks@gmail.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  // Vercel Cron sends this automatically as a Bearer token matching the
  // CRON_SECRET env var. An external cron service (e.g. cron-job.org) can
  // send the same header manually, or use x-cron-secret instead.
  const authHeader = req.headers.authorization?.replace("Bearer ", "");
  const providedSecret = authHeader || req.headers["x-cron-secret"];

  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const nowIso = new Date().toISOString();

    const { data: dueAnnouncements, error: fetchError } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso);

    if (fetchError) throw new Error(fetchError.message);

    if (!dueAnnouncements || dueAnnouncements.length === 0) {
      return res.status(200).json({
        success: true,
        published: 0,
        message: "No scheduled announcements were due.",
      });
    }

    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("is_active", true);

    let published = 0;

    for (const item of dueAnnouncements) {
      const { error: updateError } = await supabaseAdmin
        .from("announcements")
        .update({
          status: "published",
          published_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", item.id);

      if (updateError) {
        console.error(
          `Failed to publish announcement ${item.id}:`,
          updateError.message
        );
        continue;
      }

      published += 1;

      if (subscriptions && subscriptions.length > 0) {
        const payload = JSON.stringify({
          title: item.title,
          body: item.body,
          url: "/notifications",
          image: item.image_url || "",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        });

        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await webpush.sendNotification(sub.subscription, payload);
            } catch (pushError) {
              if (
                pushError?.statusCode === 404 ||
                pushError?.statusCode === 410
              ) {
                await supabaseAdmin
                  .from("push_subscriptions")
                  .update({ is_active: false, updated_at: nowIso })
                  .eq("id", sub.id);
              }
            }
          })
        );
      }
    }

    return res.status(200).json({
      success: true,
      published,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unable to publish scheduled announcements.",
    });
  }
}
