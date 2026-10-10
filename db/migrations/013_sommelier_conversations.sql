-- Discussions avec le sommelier après un accord (propres au compte ; la cave
-- reste partagée). Le prompt est reconstruit à chaque tour depuis ces tables.
CREATE TABLE IF NOT EXISTS sommelier_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    dish text NOT NULL,
    pairing jsonb NOT NULL,                 -- accord d'origine : picks (dont alternatives), rationale, cave_size
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sommelier_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES sommelier_conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL,
    wine_ids jsonb NOT NULL DEFAULT '[]',   -- vins cités (assistant)
    revised_dish text,                      -- plat reformulé si la discussion l'a changé (assistant)
    engine text,                            -- claude | gemini | claude-code (assistant)
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sommelier_messages_conv ON sommelier_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sommelier_conversations_user ON sommelier_conversations (user_id, updated_at DESC);
