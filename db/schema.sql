-- ============================================================
-- Enterprise Knowledge AI — Database Schema (Idempotent)
-- PostgreSQL 16+ with pgvector 0.8.0+
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ──────────────────────────────────────────────
-- Departments
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Users
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 VARCHAR(255)  NOT NULL UNIQUE,
  password_hash         VARCHAR(255)  NOT NULL,
  role                  VARCHAR(20)   NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  department_id         UUID          REFERENCES departments(id),
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER       NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Documents
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             VARCHAR(500)  NOT NULL,
  original_filename VARCHAR(500)  NOT NULL,
  storage_path      VARCHAR(1000) NOT NULL,
  mime_type         VARCHAR(100)  NOT NULL,
  content_hash      VARCHAR(64)   NOT NULL,
  department_id     UUID          NOT NULL REFERENCES departments(id),
  permission_level  INTEGER       NOT NULL CHECK (permission_level BETWEEN 1 AND 4),
  doc_type          VARCHAR(50),
  status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  error_message     TEXT,
  uploaded_by       UUID          NOT NULL REFERENCES users(id),
  version           INTEGER       NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(content_hash, department_id)
);

-- ──────────────────────────────────────────────
-- Document Chunks (denormalized dept + perm)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_chunks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id       UUID          NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index       INTEGER       NOT NULL,
  content           TEXT          NOT NULL,
  page_number       INTEGER,
  token_count       INTEGER,
  metadata          JSONB         DEFAULT '{}',
  department_id     UUID          NOT NULL REFERENCES departments(id),
  permission_level  INTEGER       NOT NULL CHECK (permission_level BETWEEN 1 AND 4),
  embedding         vector(768),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Conversations & Messages
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id),
  title       VARCHAR(500),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID          NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              VARCHAR(20)   NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT          NOT NULL,
  sources           JSONB,
  follow_ups        JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Audit Logs (append-only for non-admin DB roles)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID          REFERENCES users(id),
  event_type          VARCHAR(30)   NOT NULL
                        CHECK (event_type IN (
                          'QUERY', 'UPLOAD', 'DELETE', 'LOGIN',
                          'ROLE_CHANGE', 'ACCESS_DENIED'
                        )),
  query_text          TEXT,
  retrieved_chunk_ids UUID[],
  similarity_scores   DOUBLE PRECISION[],
  answer_status       VARCHAR(20)
                        CHECK (answer_status IN ('ANSWERED', 'REFUSED', 'ERROR')),
  latency_ms          INTEGER,
  ip_address          INET,
  metadata            JSONB         DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Refresh Tokens
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255)  NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- HNSW index on embeddings for vector cosine similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- B-tree indexes for RBAC-filtered queries (hot path)
CREATE INDEX IF NOT EXISTS idx_chunks_dept_perm
  ON document_chunks (department_id, permission_level);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id
  ON document_chunks (document_id);

-- Audit log lookups
CREATE INDEX IF NOT EXISTS idx_audit_user_created
  ON audit_logs (user_id, created_at);

-- Document status lookups
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents (status);

CREATE INDEX IF NOT EXISTS idx_documents_dept
  ON documents (department_id);

-- Conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id);

-- ============================================================
-- RBAC FUNCTION
-- Reusable predicate for vector search and document listing.
-- Returns TRUE if the user is authorized to see the chunk/doc.
-- ============================================================
CREATE OR REPLACE FUNCTION check_rbac_access(
  p_user_role           VARCHAR,
  p_user_department_id  UUID,
  p_chunk_department_id UUID,
  p_chunk_permission_level INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  -- ADMIN: all departments and all permission levels
  IF p_user_role = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- MANAGER: own department up to level 3, plus level 1-2 company-wide
  IF p_user_role = 'MANAGER' THEN
    IF p_chunk_department_id = p_user_department_id AND p_chunk_permission_level <= 3 THEN
      RETURN TRUE;
    END IF;
    IF p_chunk_permission_level <= 2 THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- EMPLOYEE: own department up to level 2, plus level 1 company-wide
  IF p_user_role = 'EMPLOYEE' THEN
    IF p_chunk_department_id = p_user_department_id AND p_chunk_permission_level <= 2 THEN
      RETURN TRUE;
    END IF;
    IF p_chunk_permission_level <= 1 THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Default deny
  RETURN FALSE;
END;
$$;

-- ============================================================
-- ROW-LEVEL SECURITY (defense in depth)
-- ============================================================

-- Audit logs: non-admin DB roles can only INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_append_only'
  ) THEN
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY audit_append_only ON audit_logs
      FOR ALL
      USING (current_user = 'postgres')
      WITH CHECK (TRUE);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Silently skip if RLS is already configured
  NULL;
END;
$$;
