import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AI provider endpoints
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

    // Get user settings to determine model preference
    const settings = await getUserSettings(supabase, userId);
    
    // Use requested model, or user's saved model, or default
    let model = requestedModel || settings?.ai_provider || "google/gemini-3-flash-preview";
    
    // Validate model is in allowed list
    if (!LOVABLE_MODELS.includes(model)) {
      model = "google/gemini-3-flash-preview";
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are GitMind AI, an expert code assistant integrated into a code editor. You analyze codebases and help developers understand and modify their code.

IMPORTANT RULES FOR FILE MODIFICATIONS:
When the user asks you to modify, fix, add, or change code in files, you MUST respond with a structured format:
1. First, provide a brief explanation of what you're changing and why (2-3 sentences max).
2. Then, output a JSON block wrapped in \`\`\`json-patches markers containing an array of file patches:

\`\`\`json-patches
{
  "patches": [
    {
      "file": "path/to/file.ts",
      "content": "...entire new file content..."
    }
  ],
  "commitMessage": "[GitMind] Brief description of changes"
}
\`\`\`

Rules:
- When modifying a file, include the COMPLETE new file content (not just the changed parts)
- Be concise and technical in explanations
- Reference specific files and line numbers when relevant
- If the user is just asking questions (not requesting modifications), respond normally without patches
- Never modify .env, package-lock.json, or config files
- If file context is provided, use it to give accurate answers

${fileContext ? `\nCurrent file context:\n${fileContext}` : ""}`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const rawReply = await callAI(apiKey, endpoint, model, aiMessages, provider);

    // Parse response: check for json-patches block
    const patchMatch = rawReply.match(/```json-patches\s*\n([\s\S]*?)\n```/);
    
    if (patchMatch) {
      try {
        const patchData = JSON.parse(patchMatch[1]);
        const explanation = rawReply.replace(/```json-patches[\s\S]*?```/, "").trim();
        
        return new Response(JSON.stringify({
          reply: explanation || "Modifiche pronte da applicare.",
          patches: patchData.patches || [],
          commitMessage: patchData.commitMessage || "[GitMind] AI-generated changes",
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
