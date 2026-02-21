import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  IDLE: ["PLANNING"],
  PLANNING: ["SPEC_LOCKED", "EXECUTING", "FAILED"],
  SPEC_LOCKED: ["EXECUTING", "FAILED"],
  EXECUTING: ["VALIDATING", "DONE", "FAILED"],
  VALIDATING: ["EXECUTING", "DONE", "FAILED"],
  DONE: ["IDLE"],
  FAILED: ["IDLE"],
};

// Rate limit check
async function checkRateLimit(supabase: any, sessionId: string, actionType: string, maxPerMinute: number): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count } = await supabase
    .from("activity_logs")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("action", actionType)
    .gte("created_at", oneMinuteAgo);
  return (count || 0) < maxPerMinute;
}

// Get user's GitHub token from DB
async function getGitHubToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select("github_token").eq("id", userId).single();
  return data?.github_token || null;
}

// GitHub API helper
async function githubApi(token: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitMind-AI",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") throw new Error("GitHub API rate limit exceeded");
    throw new Error("GitHub API forbidden");
  }
  if (res.status === 409) throw new Error("Git conflict - file was modified externally");
  if (res.status === 422) throw new Error("GitHub validation error");
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { action } = body;
    let result;

    switch (action) {
      // ===== SESSION MANAGEMENT =====
      case "session.create": {
        const { repoId, mode } = body;
        const { data: active } = await supabase
          .from("sessions").select("id")
          .not("state", "in", '("DONE","FAILED","IDLE")');

        if (active && active.length > 0) {
          return new Response(JSON.stringify({ error: "Max 1 active session allowed" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabase
          .from("sessions").insert({ repo_id: repoId, mode, state: "IDLE" }).select().single();
        if (error) throw error;
        result = { session: data };
        break;
      }

      case "session.get": {
        const { sessionId } = body;
        const { data, error } = await supabase.from("sessions").select().eq("id", sessionId).single();
        if (error) throw error;
        result = { session: data };
        break;
      }

      case "session.transition": {
        const { sessionId, newState } = body;
        const { data: current, error: fetchErr } = await supabase
          .from("sessions").select().eq("id", sessionId).single();
        if (fetchErr) throw fetchErr;

        const allowed = VALID_TRANSITIONS[current.state] || [];
        if (!allowed.includes(newState)) {
          await supabase.from("activity_logs").insert({
            session_id: sessionId,
            action: "state.violation",
            error_type: `${current.state} → ${newState}`,
          });
          return new Response(
            JSON.stringify({ error: `STATE_VIOLATION: ${current.state} → ${newState}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data, error } = await supabase
          .from("sessions").update({ state: newState }).eq("id", sessionId).select().single();
        if (error) throw error;
        result = { session: data };
        break;
      }

      // ===== REPOSITORY MANAGEMENT =====
      case "repo.attach": {
        const { userId, owner, name } = body;
        const { count } = await supabase.from("repositories").select("*", { count: "exact", head: true }).eq("user_id", userId);
        if (count && count >= 5) {
          return new Response(JSON.stringify({ error: "Max 5 repositories allowed" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify repo exists on GitHub
        const token = await getGitHubToken(supabase, userId);
        if (token) {
          try {
            const ghRepo = await githubApi(token, `/repos/${owner}/${name}`);
            const { data, error } = await supabase.from("repositories").insert({
              user_id: userId, owner, name,
              default_branch: ghRepo.default_branch || "main",
              github_repo_id: String(ghRepo.id),
            }).select().single();
            if (error) throw error;
            result = { repository: data };
          } catch (e) {
            return new Response(JSON.stringify({ error: `GitHub: ${e.message}` }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          // No token - store without verification
          const { data, error } = await supabase.from("repositories").insert({
            user_id: userId, owner, name, default_branch: "main",
          }).select().single();
          if (error) throw error;
          result = { repository: data };
        }
        break;
      }

      case "repo.list": {
        const { userId } = body;
        const { data, error } = await supabase.from("repositories").select().eq("user_id", userId).order("created_at", { ascending: false });
        if (error) throw error;
        result = { repositories: data };
        break;
      }

      case "repo.delete": {
        const { repoId, userId } = body;
        const { error } = await supabase.from("repositories").delete().eq("id", repoId).eq("user_id", userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      // ===== GITHUB API PROXY =====
      case "github.fetchTree": {
        const { userId, owner, name, branch, basePath } = body;
        const token = await getGitHubToken(supabase, userId);
        if (!token) return new Response(JSON.stringify({ error: "No GitHub token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

        const tree = await githubApi(token, `/repos/${owner}/${name}/git/trees/${branch || "main"}?recursive=1`);
        
        // Filter: text files only, respect basePath
        const files = (tree.tree || [])
          .filter((t: any) => t.type === "blob" && t.size < 500000) // skip files > 500KB
          .filter((t: any) => !t.path.match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp4|mp3|zip|tar|gz|pdf|exe|dll|so|dylib)$/i))
          .filter((t: any) => basePath ? t.path.startsWith(basePath.replace(/^\//, "")) : true)
          .map((t: any) => ({ path: t.path, size: t.size, sha: t.sha }));

        result = { files, truncated: tree.truncated || false };
        break;
      }

      case "github.fetchFile": {
        const { userId, owner, name, path: filePath } = body;
        const token = await getGitHubToken(supabase, userId);
        if (!token) return new Response(JSON.stringify({ error: "No GitHub token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

        const file = await githubApi(token, `/repos/${owner}/${name}/contents/${filePath}`);
        const content = atob(file.content?.replace(/\n/g, "") || "");

        result = { path: filePath, content, sha: file.sha, size: file.size };
        break;
      }

      case "github.commitFile": {
        const { userId, owner, name, path: filePath, content, message, sha, branch } = body;
        const token = await getGitHubToken(supabase, userId);
        if (!token) return new Response(JSON.stringify({ error: "No GitHub token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

        // Rate limit: max 5 commits per minute
        const sessionId = body.sessionId;
        if (sessionId) {
          const allowed = await checkRateLimit(supabase, sessionId, "github.commit", 5);
          if (!allowed) {
            return new Response(JSON.stringify({ error: "Commit rate limit exceeded (max 5/min)" }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const commitResult = await githubApi(token, `/repos/${owner}/${name}/contents/${filePath}`, "PUT", {
          message: message || "[GitMind] AI-generated change",
          content: btoa(content),
          sha,
          branch: branch || "main",
        });

        // Log commit
        if (sessionId) {
          await supabase.from("activity_logs").insert({
            session_id: sessionId,
            action: "github.commit",
            duration_ms: 0,
          });
        }

        result = {
          commitHash: commitResult.commit?.sha?.slice(0, 7) || "unknown",
          message,
          path: filePath,
        };
        break;
      }

      case "github.listUserRepos": {
        const { userId } = body;
        const token = await getGitHubToken(supabase, userId);
        if (!token) return new Response(JSON.stringify({ error: "No GitHub token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

        const repos = await githubApi(token, "/user/repos?sort=updated&per_page=30");
        result = {
          repos: repos.map((r: any) => ({
            id: r.id,
            owner: r.owner.login,
            name: r.name,
            full_name: r.full_name,
            default_branch: r.default_branch,
            private: r.private,
            updated_at: r.updated_at,
          })),
        };
        break;
      }

      // ===== CHAT MESSAGES =====
      case "chat.saveMessage": {
        const { sessionId, role, content, fileContext } = body;
        const { data, error } = await supabase.from("chat_messages").insert({
          session_id: sessionId, role, content, file_context: fileContext || null,
        }).select().single();
        if (error) throw error;
        result = { message: data };
        break;
      }

      case "chat.getMessages": {
        const { sessionId } = body;
        const { data, error } = await supabase.from("chat_messages")
          .select().eq("session_id", sessionId).order("created_at", { ascending: true });
        if (error) throw error;
        result = { messages: data || [] };
        break;
      }

      case "chat.revertToMessage": {
        const { sessionId, messageId } = body;
        // Get the target message's created_at
        const { data: target, error: tErr } = await supabase.from("chat_messages")
          .select("created_at").eq("id", messageId).single();
        if (tErr) throw tErr;
        // Delete all messages after this one
        const { error: dErr } = await supabase.from("chat_messages")
          .delete().eq("session_id", sessionId).gt("created_at", target.created_at);
        if (dErr) throw dErr;
        // Return remaining messages
        const { data: remaining, error: rErr } = await supabase.from("chat_messages")
          .select().eq("session_id", sessionId).order("created_at", { ascending: true });
        if (rErr) throw rErr;
        result = { messages: remaining || [] };
        break;
      }

      // ===== USER SETTINGS =====
      case "settings.get": {
        const { userId } = body;
        const { data, error } = await supabase.from("user_settings").select("ai_provider, custom_api_key, api_token").eq("user_id", userId).single();
        if (error && error.code !== "PGRST116") throw error;
        result = data || { ai_provider: "lovable", custom_api_key: null, api_token: null };
        break;
      }

      case "settings.save": {
        const { userId, ai_provider, custom_api_key } = body;
        // Upsert
        const { data: existing } = await supabase.from("user_settings").select("id").eq("user_id", userId).single();
        if (existing) {
          const { error } = await supabase.from("user_settings").update({ ai_provider, custom_api_key }).eq("user_id", userId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("user_settings").insert({ user_id: userId, ai_provider, custom_api_key });
          if (error) throw error;
        }
        result = { success: true };
        break;
      }

      case "settings.regenerateToken": {
        const { userId } = body;
        const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const { data: existing } = await supabase.from("user_settings").select("id").eq("user_id", userId).single();
        if (existing) {
          await supabase.from("user_settings").update({ api_token: newToken }).eq("user_id", userId);
        } else {
          await supabase.from("user_settings").insert({ user_id: userId, api_token: newToken });
        }
        result = { api_token: newToken };
        break;
      }

      // ===== AUTONOMOUS MODE =====
      case "autonomous.saveSpec": {
        const { sessionId, specJson } = body;
        const { data, error } = await supabase.from("autonomous_specs").insert({
          session_id: sessionId,
          spec_json: specJson,
        }).select().single();
        if (error) throw error;
        result = { spec: data };
        break;
      }

      case "autonomous.lockSpec": {
        const { specId } = body;
        const { data, error } = await supabase.from("autonomous_specs").update({
          locked_at: new Date().toISOString(),
        }).eq("id", specId).select().single();
        if (error) throw error;
        result = { spec: data };
        break;
      }

      case "autonomous.getSpec": {
        const { sessionId } = body;
        const { data, error } = await supabase.from("autonomous_specs")
          .select().eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1).single();
        if (error) throw error;
        result = { spec: data };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
