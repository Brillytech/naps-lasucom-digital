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
    const siteUrl = Deno.env.get("SITE_URL");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !siteUrl) {
      throw new Error("Missing environment variables.");
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

    const { data: president, error: presidentError } = await adminClient
      .from("admin_profiles")
      .select("role,is_active")
      .eq("user_id", user.id)
      .single();

    if (
      presidentError ||
      !president ||
      president.role !== "president" ||
      !president.is_active
    ) {
      throw new Error("Only the President can reset admin passwords.");
    }

    const { email } = await req.json();

    if (!email) {
      throw new Error("Email is required.");
    }

    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/naps-admin/set-password`,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset email sent successfully.",
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
          error instanceof Error
            ? error.message
            : "Unable to send password reset email.",
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