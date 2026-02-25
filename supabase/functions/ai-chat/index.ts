import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AI provider endpoints
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Protected files — AI must never generate patches for these
const PROTECTED_FILES = new Set([
  ".env", "package.json", "package-lock.json", "yarn.lock", "bun.lockb",
  "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
  "vite.config.ts", "vite.config.js", "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.js", "postcss.config.cjs", "eslint.config.js",
  "components.json", "index.html", ".gitignore",
]);
const PROTECTED_PATTERNS = [/\.env\./, /\.lock$/, /\.lockb$/, /supabase\/migrations\//, /\.lovable\//];

function isProtectedFile(path: string): boolean {
  const name = path.split("/").pop() || "";
  if (PROTECTED_FILES.has(name) || PROTECTED_FILES.has(path)) return true;
  return PROTECTED_PATTERNS.some(p => p.test(path));
}

const LOVABLE_MODELS = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  "google/gemini-3-pro-image-preview",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5.2",
];

async function getUserSettings(supabase: any, userId?: string) {
  if (!userId) return null;
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).single();
  return data;
}

async function callAI(apiKey: string, endpoint: string, model: string, messages: any[]) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status === 402) throw new Error("PAYMENT_REQUIRED");
    const err = await res.text();
    throw new Error(`AI error ${status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, fileContext, userId, model: requestedModel } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const settings = await getUserSettings(supabase, userId);
    
    let model = requestedModel || settings?.ai_provider || "google/gemini-3-flash-preview";
    
    if (!LOVABLE_MODELS.includes(model)) {
      model = "google/gemini-3-flash-preview";
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Danspace AI, an expert code assistant integrated into a code editor. You analyze codebases and help developers understand and modify their code.

CRITICAL RULES FOR FILE MODIFICATIONS:
When the user asks you to modify, fix, add, or change code in files, you MUST follow this process:

1. First, provide a brief explanation of what you're changing and why (2-3 sentences max).
2. Then, output a JSON block wrapped in \`\`\`json-patches markers containing an array of file patches.

FORMAT:
\`\`\`json-patches
{
  "patches": [
    {
      "file": "path/to/file.ts",
      "content": "...entire new file content..."
    }
  ],
  "commitMessage": "[Danspace] Brief description of changes"
}
\`\`\`

MANDATORY SAFETY RULES — VIOLATIONS WILL BREAK THE APPLICATION:

1. **COMPLETE FILE CONTENT**: When modifying a file, you MUST include the ENTIRE file content, not just changed parts. Copy the original file exactly, then apply only the requested changes. Missing imports, missing functions, or truncated content WILL break the app.

2. **PRESERVE ALL EXISTING CODE**: Never remove, rename, or restructure code that wasn't part of the user's request. If the user asks to change a CSS property, change ONLY that property — do not reorganize the file, remove comments, reorder rules, or change anything else.

3. **PRESERVE FILE STRUCTURE**: Keep the same import order, the same function signatures, the same export patterns. Do not refactor or "improve" code the user didn't ask you to change.

4. **CSS/STYLING SAFETY**: When modifying CSS files (especially index.css, component styles):
   - Keep ALL existing CSS custom properties (--background, --foreground, etc.) exactly as they are unless the user specifically asks to change them
   - Keep ALL existing @layer blocks, @tailwind directives, and utility classes
   - Keep the EXACT same HSL format for CSS variables (e.g., "240 47% 4%" not "hsl(240, 47%, 4%)")
   - Never convert between CSS format conventions
   - Never remove or rename existing utility classes (.glow-accent, .glass-panel, .scrollbar-thin, etc.)

5. **TYPESCRIPT/TSX SAFETY**: When modifying TypeScript/React files:
   - Keep ALL existing imports — do not remove any
   - Keep ALL existing type definitions and interfaces
   - Keep ALL existing props and state variables
   - Do not change function signatures or component prop interfaces unless explicitly asked
   - Ensure JSX is properly closed and balanced

6. **NEVER modify these protected files**: .env, package.json, package-lock.json, bun.lockb, yarn.lock, tsconfig.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, tailwind.config.ts, postcss.config.js, eslint.config.js, components.json, index.html, .gitignore, any file in supabase/migrations/, supabase/config.toml, or any file in .lovable/

7. **VALIDATION**: Before outputting a patch, mentally verify:
   - Does the file still have all its original imports?
   - Does the file still have all its original functions/components?
   - Is the JSX properly balanced (every opening tag has a closing tag)?
   - Are all TypeScript types still correct?
   - Did you ONLY change what the user asked for?

8. If the user is just asking questions (not requesting modifications), respond normally without patches.

${fileContext ? `\nCurrent file context:\n${fileContext}` : ""}`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const rawReply = await callAI(apiKey, LOVABLE_ENDPOINT, model, aiMessages);

    // Parse response: check for json-patches block
    const patchMatch = rawReply.match(/```json-patches\s*\n([\s\S]*?)\n```/);
    
    if (patchMatch) {
      try {
        const patchData = JSON.parse(patchMatch[1]);
        const explanation = rawReply.replace(/```json-patches[\s\S]*?```/, "").trim();
        
        // Filter out any patches targeting protected files
        const safePatches = (patchData.patches || []).filter(
          (p: { file: string }) => !isProtectedFile(p.file)
        );
        const blockedFiles = (patchData.patches || [])
          .filter((p: { file: string }) => isProtectedFile(p.file))
          .map((p: { file: string }) => p.file);
        
        const warning = blockedFiles.length > 0
          ? `\n\n⚠️ Le modifiche ai seguenti file protetti sono state bloccate: ${blockedFiles.join(", ")}`
          : "";
        
        return new Response(JSON.stringify({
          reply: (explanation || "Modifiche pronte da applicare.") + warning,
          patches: safePatches,
          commitMessage: patchData.commitMessage || "[Danspace] AI-generated changes",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        // JSON parse failed, return as plain text
      }
    }

    return new Response(JSON.stringify({ reply: rawReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error.message || "Unknown error";
    if (msg === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "Payment required. Add credits to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
