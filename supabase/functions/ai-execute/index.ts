import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Blocked files that AI must never modify — protects app integrity
const BLOCKED_FILES = [
  ".env", "package.json", "package-lock.json", "yarn.lock", "bun.lockb",
  "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
  "vite.config.ts", "vite.config.js",
  "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.js", "postcss.config.cjs",
  "eslint.config.js", ".eslintrc.js", ".eslintrc.json",
  "components.json", "index.html",
  ".gitignore",
];
const BLOCKED_PATTERNS = [
  /\.env\./, /config\.toml$/, /\.lock$/, /\.lockb$/,
  /supabase\/config/, /supabase\/migrations/,
  /\.lovable\//,
];

function isBlockedFile(path: string): boolean {
  const name = path.split("/").pop() || "";
  if (BLOCKED_FILES.includes(name)) return true;
  return BLOCKED_PATTERNS.some((p) => p.test(path));
}

// Dangerous code patterns
const DANGEROUS_PATTERNS = [
  /eval\s*\(/,
  /process\.exit/,
  /rm\s+-rf/,
  /require\s*\(\s*['"]child_process/,
  /exec\s*\(/,
];

function hasDangerousCode(patch: string): string[] {
  const found: string[] = [];
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(patch)) found.push(p.source);
  }
  return found;
}

// Validate unified diff format
function validateDiff(patch: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!patch.includes("---")) errors.push("Missing source file header (---)");
  if (!patch.includes("+++")) errors.push("Missing target file header (+++)");
  if (!patch.includes("@@")) errors.push("Missing hunk header (@@)");
  
  const dangerous = hasDangerousCode(patch);
  if (dangerous.length > 0) errors.push(`Dangerous patterns: ${dangerous.join(", ")}`);

  // Check for blocked files
  const fileMatch = patch.match(/\+\+\+ b\/(.+)/g) || [];
  for (const fm of fileMatch) {
    const filePath = fm.replace("+++ b/", "");
    if (isBlockedFile(filePath)) errors.push(`Blocked file: ${filePath}`);
  }

  return { valid: errors.length === 0, errors };
}

// Intent classification (deterministic)
function classifyIntent(input: string): { intentType: string; confidence: number; riskLevel: string } {
  const lower = input.toLowerCase();
  if (lower.includes("refactor")) return { intentType: "refactor", confidence: 0.92, riskLevel: "medium" };
  if (lower.includes("fix") || lower.includes("bug")) return { intentType: "bugfix", confidence: 0.88, riskLevel: "low" };
  if (lower.includes("add") || lower.includes("create") || lower.includes("new")) return { intentType: "feature_addition", confidence: 0.85, riskLevel: "medium" };
  if (lower.includes("delete") || lower.includes("remove")) return { intentType: "remove_code", confidence: 0.90, riskLevel: "high" };
  if (lower.includes("test")) return { intentType: "add_tests", confidence: 0.87, riskLevel: "low" };
  if (lower.includes("style") || lower.includes("css") || lower.includes("ui")) return { intentType: "ui_update", confidence: 0.83, riskLevel: "low" };
  if (lower.includes("config")) return { intentType: "config_change", confidence: 0.80, riskLevel: "high" };
  return { intentType: "general_edit", confidence: 0.70, riskLevel: "medium" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // --- NORMALIZE INTENT ---
    if (action === "normalize") {
      const { input } = body;
      const result = classifyIntent(input || "");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- COMPILE TASK ---
    if (action === "compile") {
      const { sessionId, intentType, files, basePath } = body;
      const hash = btoa(`${intentType}:${sessionId}:${Date.now()}`).slice(0, 16);
      
      const task = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        intent_type: intentType,
        compiled_prompt_hash: hash,
        allowed_files: (files || []).slice(0, 8), // max 8 files
        base_path: basePath || "/",
        steps: [
          { action: "analyze", target: "selected_files" },
          { action: "generate_patch", format: "unified_diff" },
          { action: "validate_output", checks: ["syntax", "format", "security"] },
        ],
      };

      // Store task in DB
      await supabase.from("ai_tasks").insert({
        session_id: sessionId,
        intent_type: intentType,
        compiled_prompt_hash: hash,
        status: "pending",
        result: task,
      });

      return new Response(JSON.stringify({ task }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- EXECUTE (AI code generation) ---
    if (action === "execute") {
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "AI not configured" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { sessionId, intentType, files, userPrompt } = body;
      const startTime = Date.now();

      // Build file context
      const fileContext = (files || [])
        .map((f: { path: string; content: string }) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");

      const systemPrompt = `You are a precise code modification engine. You MUST follow these rules EXACTLY:

1. ONLY modify the files provided below. Never reference or create other files.
2. Return your changes as UNIFIED DIFF format only.
3. Include a commit message on the first line prefixed with "[GitMind]"
4. Do NOT include any explanation, commentary, or markdown formatting.
5. Each file diff must start with "--- a/<filepath>" and "+++ b/<filepath>"
6. Use proper @@ hunk headers.

Intent: ${intentType}
User request: ${userPrompt}

Files:
${fileContext}

Respond with ONLY the commit message line followed by unified diff patches.`;

      let patches = "";
      let commitMessage = "";
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 4096,
            temperature: 0.2,
          }),
        });

        if (!aiRes.ok) {
          const status = aiRes.status;
          if (status === 429 || status === 402) {
            return new Response(JSON.stringify({ error: "AI rate limit exceeded. Try again later." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          throw new Error(`AI error: ${status}`);
        }

        const aiData = await aiRes.json();
        const rawOutput = aiData.choices?.[0]?.message?.content || "";

        // Parse output: first line = commit message, rest = patches
        const lines = rawOutput.split("\n");
        commitMessage = lines[0]?.replace(/^\[GitMind\]\s*/, "[GitMind] ") || "[GitMind] AI-generated changes";
        if (!commitMessage.startsWith("[GitMind]")) commitMessage = `[GitMind] ${commitMessage}`;
        patches = lines.slice(1).join("\n").trim();

        // Validate
        const validation = validateDiff(patches);
        if (validation.valid) break;

        retries++;
        if (retries > maxRetries) {
          // Log failure
          await supabase.from("activity_logs").insert({
            session_id: sessionId,
            action: "ai.execute.failed",
            duration_ms: Date.now() - startTime,
            retry_count: retries,
            error_type: validation.errors.join("; "),
          });

          return new Response(JSON.stringify({
            error: "AI output validation failed after retries",
            validation_errors: validation.errors,
            raw_output_preview: rawOutput.slice(0, 200),
          }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Log success
      await supabase.from("activity_logs").insert({
        session_id: sessionId,
        action: "ai.execute.success",
        duration_ms: Date.now() - startTime,
        retry_count: retries,
      });

      return new Response(JSON.stringify({ patches, commitMessage, retries }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- VALIDATE DIFF ---
    if (action === "validate") {
      const { patch, allowedFiles, basePath } = body;
      const result = validateDiff(patch || "");

      // Additional: check allowed files
      if (allowedFiles && allowedFiles.length > 0) {
        const patchFiles = (patch || "").match(/\+\+\+ b\/(.+)/g) || [];
        for (const pf of patchFiles) {
          const filePath = pf.replace("+++ b/", "");
          if (!allowedFiles.includes(filePath)) {
            result.valid = false;
            result.errors.push(`File not in allowed list: ${filePath}`);
          }
          if (basePath && !filePath.startsWith(basePath.replace(/^\//, ""))) {
            result.valid = false;
            result.errors.push(`File outside base_path: ${filePath}`);
          }
        }
      }

      return new Response(JSON.stringify(result), {
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
