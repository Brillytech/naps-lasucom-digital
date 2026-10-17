import { supabase } from "../lib/supabase";

/** Loose on purpose: the database applies the same check. */
export const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sets, changes or clears the email typed for an executive's line on the
 * Formal Letterhead. A typed email always prints, ahead of the linked admin
 * account's email. Only the President and General Secretary may write it;
 * the database enforces that. Returns the stored value ("" when cleared).
 */
export async function saveLetterheadEmail(executiveId, raw) {
  const value = String(raw || "").trim().toLowerCase();

  if (value && (value.length > 120 || !LOOKS_LIKE_EMAIL.test(value))) {
    throw new Error("That does not look like an email address.");
  }

  const { error } = value
    ? await supabase.from("executive_contacts").upsert({
        executive_id: executiveId,
        letterhead_email: value,
        updated_at: new Date().toISOString(),
      })
    : await supabase.from("executive_contacts").delete().eq("executive_id", executiveId);

  if (error) throw error;
  return value;
}
