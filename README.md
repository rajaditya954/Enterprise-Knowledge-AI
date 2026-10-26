# Enterprise Knowledge AI

A production-grade, secure Retrieval-Augmented Generation (RAG) platform that centralizes organizational knowledge into one conversational system with access-controlled, citation-backed answers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  React Frontend (Vite)                       │
│  Chat UI │ Document Upload │ User Mgmt │ Audit Logs         │
└─────────────┬───────────────────────────────────────────────┘
              │ REST + SSE
┌─────────────▼───────────────────────────────────────────────┐
│                Node.js / Express Backend                     │
│  Auth (JWT) │ RBAC │ Rate Limiting │ Zod Validation         │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │              RAG Orchestration                    │       │
│  │  Query Rewrite → Embed → Retrieve → Ground →     │       │
│  │  Stream → Validate Citations → Audit Log          │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │           Ingestion Pipeline                      │       │
│  │  Upload → Extract → Chunk → Embed → Persist       │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────┬──────────────────────┬────────────────────────┘
              │                      │
┌─────────────▼──────┐   ┌─────────▼──────────────────┐
│ PostgreSQL + pgvector│   │ Google Gemini API           │
│ HNSW Index          │   │ Embeddings + Generation     │
│ RBAC Function       │   │ gemini-embedding-001        │
│ Audit Logs          │   │ gemini-2.0-flash            │
└────────────────────┘   └────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Google Gemini API key

### 1. Clone and configure

```bash
cd enterprise-knowledge-ai
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
```

### 2. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL 16 with pgvector 0.8.0, runs schema migration and seeds demo data.

### 3. Install dependencies and start the server

```bash
npm install
npm run dev
```

The API server starts at `http://localhost:3001`.

### 4. Start the frontend

```bash
cd client
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`.

### 5. Login

Use the demo credentials:
- **Admin:** `admin@company.com` / `Password123!`
- **Manager (HR):** `manager.hr@company.com` / `Password123!`
- **Employee (Eng):** `employee.eng@company.com` / `Password123!`

## RBAC Rules

| Role     | Own Department    | Other Departments |
|----------|-------------------|-------------------|
| ADMIN    | All levels (1-4)  | All levels (1-4)  |
| MANAGER  | Up to level 3     | Up to level 2     |
| EMPLOYEE | Up to level 2     | Level 1 only      |

**Permission Levels:**
1. Public — accessible to all
2. Internal — department + managers
3. Confidential — department managers
4. Restricted — admins only

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| POST | `/api/documents` | Upload document |
| GET | `/api/documents` | List documents |
| GET | `/api/documents/:id` | Get document |
| POST | `/api/documents/:id/reindex` | Re-ingest |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/chat/query` | Query (SSE stream) |
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/:id` | Get conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create user |
| PATCH | `/api/admin/users/:id` | Update user |
| GET | `/api/admin/audit-logs` | Audit logs |
| GET | `/api/admin/departments` | Departments |
| GET | `/api/admin/rbac` | RBAC info |
| GET | `/api/health` | Health check |

## Scripts

```bash
# Development
npm run dev          # Start server with watch
cd client && npm run dev  # Start frontend

# Testing
npm test             # Run unit tests
npm run eval         # Run evaluation suite
npm run benchmark    # Run retrieval benchmark

# Database
npm run db:reset     # Reset database (destructive!)
```

## Project Structure

```
├── server/           # Express backend
│   ├── middleware/    # Auth, RBAC, validation, errors
│   ├── routes/       # REST endpoints
│   ├── services/     # Gemini, RAG, chunking, retrieval
│   └── adapters/     # PDF, DOCX, MD, TXT extractors
├── client/           # React frontend (Vite)
│   └── src/
│       ├── components/  # Chat, Admin, Layout
│       └── context/     # Auth context
├── db/               # Schema + seed SQL
├── eval/             # Evaluation suite + benchmark
└── tests/            # Unit tests (Vitest)
```

## Security

- JWT access tokens (short-lived) + refresh tokens (httpOnly cookies)
- bcrypt password hashing (cost ≥ 12)
- RBAC enforced server-side only (never trusts client)
- Parameterized SQL (no string interpolation)
- Zod input validation on all endpoints
- Helmet security headers
- CORS allowlist
- Rate limiting on login and globally
- Account lockout after failed attempts
- Prompt injection defense (retrieved text treated as untrusted)
- Audit logging for all queries and access denials

## Evaluation

The eval suite measures:
- **Retrieval:** Precision@K, Recall@K, MRR, nDCG
- **Faithfulness:** LLM-as-judge claim verification
- **Citation accuracy:** Valid source references
- **Refusal correctness:** Out-of-scope question handling
- **Access control:** Zero-tolerance unauthorized chunk leakage
- **Performance:** p50/p95 retrieval latency

```bash
npm run eval               # Run evaluation
npm run eval -- --threshold # CI mode: fails on violations
npm run benchmark          # Retrieval latency benchmark
```
