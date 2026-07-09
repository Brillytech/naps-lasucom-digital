import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Missing Supabase function environment variables.");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      throw new Error("Missing authorization header.");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Invalid admin session.");
    }

    const { data: presidentProfile, error: presidentError } = await adminClient
      .from("admin_profiles")
      .select("id, user_id, role, is_active, account_status")
      .eq("user_id", user.id)
      .eq("role", "president")
      .eq("is_active", true)
      .single();

    if (presidentError || !presidentProfile) {
      throw new Error("Only the President can invite executive admins.");
    }

    const body = await req.json();

    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const office = String(body.office || "").trim();
    const role = String(body.role || "").trim();
    const decSetIdRaw = String(body.dec_set_id || "").trim();
    const decSetId = decSetIdRaw || null;

    if (!fullName) throw new Error("Full name is required.");
    if (!email) throw new Error("Email is required.");
    if (!office) throw new Error("Office is required.");
    if (!role) throw new Error("Role is required.");

    let invitedUserId = "";
    let inviteWasSent = false;

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/naps-admin/set-password`,
        data: {
          full_name: fullName,
          office,
          role,
          dec_set_id: decSetId,
        },
      });

    if (inviteError) {
      const inviteMessage = inviteError.message || "";

      const userAlreadyExists =
        inviteMessage.toLowerCase().includes("already") ||
        inviteMessage.toLowerCase().includes("registered") ||
        inviteMessage.toLowerCase().includes("exists");

      if (!userAlreadyExists) {
        throw inviteError;
      }

      const existingUser = await findAuthUserByEmail(adminClient, email);

      if (!existingUser?.id) {
        throw new Error(
          "This email already exists in Auth, but the account could not be linked."
        );
      }

      invitedUserId = existingUser.id;
      inviteWasSent = false;
    } else {
      invitedUserId = inviteData?.user?.id || "";
      inviteWasSent = true;
    }

    if (!invitedUserId) {
      throw new Error("Invite sent, but user account was not returned.");
    }

    const profilePayload = {
      user_id: invitedUserId,
      email,
      full_name: fullName,
      office,
      role,
      dec_set_id: decSetId,
      is_active: false,
      account_status: "invited",
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: existingProfileByEmail, error: emailProfileError } =
      await adminClient
        .from("admin_profiles")
        .select("id, role")
        .eq("email", email)
        .maybeSingle();

    if (emailProfileError) {
      throw emailProfileError;
    }

    if (existingProfileByEmail?.role === "president") {
      throw new Error("President profile cannot be overwritten.");
    }

    if (existingProfileByEmail?.id) {
      const { error: updateError } = await adminClient
        .from("admin_profiles")
        .update(profilePayload)
        .eq("id", existingProfileByEmail.id);

      if (updateError) throw updateError;
    } else {
      const { data: existingProfileByUserId, error: userProfileError } =
        await adminClient
          .from("admin_profiles")
          .select("id, role")
          .eq("user_id", invitedUserId)
          .maybeSingle();

      if (userProfileError) {
        throw userProfileError;
      }

      if (existingProfileByUserId?.role === "president") {
        throw new Error("President profile cannot be overwritten.");
      }

      if (existingProfileByUserId?.id) {
        const { error: updateError } = await adminClient
          .from("admin_profiles")
          .update(profilePayload)
          .eq("id", existingProfileByUserId.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await adminClient
          .from("admin_profiles")
          .insert(profilePayload);

        if (insertError) throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite_sent: inviteWasSent,
        message: inviteWasSent
          ? "Executive invite sent successfully."
          : "Admin profile linked as pending invite. Invite email was not resent because the account already exists.",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to send invite.",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function findAuthUserByEmail(adminClient: any, email: string) {
  let page = 1;
  const perPage = 100;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const foundUser = data?.users?.find(
      (item: any) => item.email?.toLowerCase() === email.toLowerCase()
    );

    if (foundUser) return foundUser;

    if (!data?.users || data.users.length < perPage) break;

    page += 1;
  }

  return null;
}