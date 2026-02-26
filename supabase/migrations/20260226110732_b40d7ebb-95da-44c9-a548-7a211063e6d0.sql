
-- Drop old CHECK constraint if exists
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS valid_ai_provider;

-- Add new columns for BYOK (Bring Your Own Key) support
ALTER TABLE public.user_settings 
  ADD COLUMN IF NOT EXISTS use_custom_key boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_provider text DEFAULT NULL;

-- Add flexible CHECK constraint
ALTER TABLE public.user_settings ADD CONSTRAINT valid_ai_provider 
  CHECK (ai_provider = ANY (ARRAY[
    'lovable',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash', 
    'google/gemini-2.5-flash-lite',
    'google/gemini-3-flash-preview',
    'google/gemini-3-pro-preview',
    'google/gemini-3-pro-image-preview',
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'openai/gpt-5.2'
  ]));

-- Add constraint for custom_provider
ALTER TABLE public.user_settings ADD CONSTRAINT valid_custom_provider
  CHECK (custom_provider IS NULL OR custom_provider = ANY (ARRAY['openai', 'gemini']));
