ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS valid_ai_provider;
ALTER TABLE user_settings ADD CONSTRAINT valid_ai_provider 
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