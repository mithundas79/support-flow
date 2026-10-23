CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tickets (
 id uuid PRIMARY KEY, external_id text UNIQUE NOT NULL, subject text NOT NULL, body text NOT NULL,
 customer_name text NOT NULL, customer_email text NOT NULL, category text NOT NULL DEFAULT 'other', priority text NOT NULL DEFAULT 'normal',
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','awaiting_review','needs_attention','approved','sending','sent','rejected','failed')),
 summary text NOT NULL DEFAULT '', draft text NOT NULL DEFAULT '', draft_version integer NOT NULL DEFAULT 0 CHECK(draft_version>=0),
 disposition text NOT NULL DEFAULT 'escalate', sources jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_events (id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES tickets(id), type text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ticket_events_ticket ON ticket_events(ticket_id,created_at);
CREATE TABLE IF NOT EXISTS processing_jobs (
 id uuid PRIMARY KEY, ticket_id uuid UNIQUE NOT NULL REFERENCES tickets(id), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','completed','failed')),
 attempts integer NOT NULL DEFAULT 0, lease_token uuid, lease_expires_at timestamptz, worker_id text, retrieved_sources jsonb NOT NULL DEFAULT '[]', result_hash text, usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS delivery_outbox (
 id uuid PRIMARY KEY, ticket_id uuid UNIQUE NOT NULL REFERENCES tickets(id), draft_version integer NOT NULL,
 recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','sent','failed','uncertain')),
 claim_token uuid, claim_expires_at timestamptz, worker_id text, provider_message_id text, failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_outbox_pending ON delivery_outbox(created_at) WHERE state='pending';
CREATE TABLE IF NOT EXISTS reviewer_sessions (token_hash text PRIMARY KEY, csrf_token text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_documents (id text PRIMARY KEY, title text NOT NULL, content text NOT NULL, url text, embedding vector(1536), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
