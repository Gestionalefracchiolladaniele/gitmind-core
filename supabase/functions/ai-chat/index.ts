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

async function callAI(apiKey: string, endpoint: string, model: string, messages: any[], provider: string) {
  if (provider === "anthropic") {
    // Anthropic has a different API format
    const systemMsg = messages.find((m: any) => m.role === "system");
    const otherMsgs = messages.filter((m: any) => m.role !== "system");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemMsg?.content || "",
        messages: otherMsgs,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  // OpenAI-compatible (Lovable, OpenAI, Gemini)
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
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
    const { messages, fileContext, userId } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user settings to determine provider
    const settings = await getUserSettings(supabase, userId);
    const provider = settings?.ai_provider || "lovable";
    let apiKey: string;
    let endpoint: string;
    let model: string;

    if (provider !== "lovable" && settings?.custom_api_key) {
      apiKey = settings.custom_api_key;
      endpoint = PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.lovable;
      model = PROVIDER_MODELS[provider] || PROVIDER_MODELS.lovable;
    } else {
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
      endpoint = PROVIDER_ENDPOINTS.lovable;
      model = PROVIDER_MODELS.lovable;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured. Set an API key in Settings." }), {
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
