import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, redirectUri, userId: verifyUserId } = await req.json();
    const clientId = Deno.env.get("GITHUB_CLIENT_ID");
    const clientSecret = Deno.env.get("GITHUB_CLIENT_SECRET");

    if (action === "get_auth_url") {
      if (!clientId) {
        return new Response(JSON.stringify({ error: "GitHub OAuth not configured. Add GITHUB_CLIENT_ID secret." }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const scopes = "repo,read:user";
      const state = crypto.randomUUID();
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${scopes}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri || "")}`;
      return new Response(JSON.stringify({ url, state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "callback") {
      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ error: "GitHub OAuth not configured" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = tokenData.access_token;

      // Fetch GitHub user profile
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Danspace-AI" },
      });
      const ghUser = await userRes.json();

      // Store in DB
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Upsert user (use github_id to find existing)
      const { data: existingUsers } = await supabase
        .from("users")
        .select()
        .eq("github_id", String(ghUser.id));

      let userId: string;
      if (existingUsers && existingUsers.length > 0) {
        userId = existingUsers[0].id;
        await supabase.from("users").update({
          name: ghUser.login,
          avatar_url: ghUser.avatar_url,
          github_token: accessToken, // stored server-side only
        }).eq("id", userId);
      } else {
        const { data: newUser, error } = await supabase.from("users").insert({
          name: ghUser.login,
          avatar_url: ghUser.avatar_url,
          github_id: String(ghUser.id),
          github_token: accessToken,
        }).select().single();
        if (error) throw error;
        userId = newUser.id;
      }

      // Return user info (never return token to frontend)
      return new Response(JSON.stringify({
        user: {
          id: userId,
          name: ghUser.login,
          avatar_url: ghUser.avatar_url,
          github_id: String(ghUser.id),
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify session
    if (action === "verify") {
      if (!verifyUserId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const { data: user } = await supabase.from("users").select("id, name, avatar_url, github_id").eq("id", verifyUserId).single();
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
