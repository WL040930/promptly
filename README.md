# Promptly

Promptly is an AI-powered automation and workspace builder. It allows users to automate their workflows, build interactive forms, and manage data without writing a single line of code—using a configurable AI provider (OpenRouter with NVIDIA Nemotron is the default).

## 🌟 Features

- **Promptly Agent (AI Chat)**: A conversational assistant that helps you construct automations, extract intents, and manage your workspace interactively.
- **Workflow Builder**: A visual, drag-and-drop node-based editor (`@xyflow/react`) for creating advanced automation sequences with triggers, AI nodes, and integrations.
- **Form Builder**: Create, edit, and deploy beautiful, highly customizable data-collection forms with real-time previews and response tracking.
- **Interactive Dashboards**: Visual analytics and statistics powered by Recharts, enabling users to track workflow runs, form submissions, and active automations.
- **Premium UI/UX**: Built with modern web design principles featuring glassmorphism, responsive Tailwind CSS layouts, and smooth micro-interactions powered by GSAP.

## 🛠 Tech Stack

This project is structured as a monorepo containing a full-stack Javascript application.

### Frontend (`packages/ui`)
- **React 18** + **Vite**: Fast, modern frontend framework.
- **Tailwind CSS**: Utility-first styling for premium, responsive layouts.
- **GSAP**: Industry-standard animation library for smooth UI transitions.
- **React Flow (`@xyflow/react`)**: Interactive node-based workflow builder.
- **Recharts**: Composable charting library for dashboard analytics.

### Backend (`packages/cli`)
- **Node.js** + **Express**: Robust RESTful API server.
- **PostgreSQL** + **Sequelize (ORM)**: Relational database for structured storage.
- **AI providers**: OpenRouter, Google Gemini, Groq, and Cerebras adapters with tiered routing and fallback support.
- **JSON Web Tokens (JWT)** + **Bcrypt**: Secure user authentication.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- OpenRouter API Key (or another configured AI provider)

### 1. Installation

Clone the repository and install dependencies from the root directory:

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory and configure the following variables:

For the complete local, tunnel, and Google OAuth setup—including which URL belongs in each variable—see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). A safe starting point is also available in [.env.example](.env.example).

```env
# Browser-facing frontend origin. This is where you open the app.
CLIENT_ORIGIN=http://localhost:5173

# Canonical site origin used by robots.txt and sitemap.xml.
# Leave unset locally; set this to the real frontend origin in production.
# SITE_URL=https://app.example.com

# Public HTTPS origin used for Google triggers and other external callbacks.
# Leave unset locally unless you are using a tunnel.
# TRIGGER_PUBLIC_ORIGIN=https://your-public-api.example.com

# Server
PORT=3000

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_DATABASE=promptly_db
# Persistent Supabase session-pool settings; tune per production replica count.
DB_POOL_MAX=5
DB_POOL_MIN=0
DB_POOL_ACQUIRE_MS=10000
DB_POOL_IDLE_MS=10000
DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=15000
DB_APPLICATION_NAME=promptly-api

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
# This is an exact callback URL, not a bare origin.
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# External trigger callbacks
# Required for Google Sheets and Gmail push triggers. This must be the public
# origin that actually routes to the API.
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/your-project/topics/promptly-gmail
GOOGLE_PUBSUB_AUDIENCE=https://your-public-api.example.com/api/provider-events/gmail

# Security
JWT_SECRET=your_super_secret_jwt_key

# Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
# Required for private workflow assets, private form uploads, and Drive transfers.
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# Optional rollout switches. Both new capabilities are enabled by default.
# Set either to false only while you need the legacy behavior during a rollout.
# FORM_PRIVATE_UPLOADS=false
# CHAT_WORKFLOW_INVOCATIONS=false

# AI Integration
OPENROUTER_API_KEY=your_openrouter_api_key
AI_DEFAULT_PROVIDER=openrouter
AI_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
# Direct NVIDIA endpoint (optional):
# NVIDIA_API_KEY=your_nvidia_api_key
# AI_DEFAULT_PROVIDER=nvidia
# AI_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b
# NVIDIA_ENABLE_THINKING=true
# NVIDIA_REASONING_BUDGET=16384
# Optional tier overrides and failover providers:
# AI_FAST_PROVIDER=openrouter
# AI_FAST_MODEL=nvidia/nemotron-3-super-120b-a12b:free
# AI_QUALITY_PROVIDER=openrouter
# AI_QUALITY_MODEL=nvidia/nemotron-3-super-120b-a12b:free
# AI_FALLBACK_PROVIDERS=cerebras,openrouter,groq
# Optional completion policy. Unlimited omits the app-level output cap;
# providers still enforce their own context-window and model limits.
# AI_UNLIMITED_COMPLETION_TOKENS=true
# Or use one finite cap for every task (overrides per-task defaults):
# AI_MAX_COMPLETION_TOKENS=4096
# GEMINI_API_KEY=your_gemini_api_key
# Required for managed transcription.
OPENAI_API_KEY=your_openai_api_key
```

Form file fields now use the private `workflow-assets` bucket by default. A
submitted response stores a durable asset reference, so a workflow can pass it
to Google Drive without exposing a public Supabase URL. The existing public
`form-uploads` bucket and `/api/storage/upload/:filename` route remain for
legacy forms when `FORM_PRIVATE_UPLOADS=false`; they are not deleted or
migrated automatically.

For chat-initiated workflows, enable the **Agent Message** trigger on a
published workflow, declare its parameters, and add a description. Promptly
extracts only those parameters, asks for missing values, and always shows a
live-run approval before it executes the workflow.

### 3. Bootstrap a Reset Database

`npm run dev` automatically checks whether the Promptly tables exist and bootstraps a fresh database when they do not. You can also run the bootstrap directly:

```bash
npm run db:bootstrap
```

It creates the Sequelize model tables and indexes, then provisions the PostgreSQL-only pieces that models cannot express (database-change triggers and storage buckets/policy). It is intentionally separate from server startup.

### 4. Running the Application

You can start both the backend server and frontend Vite development server concurrently using a single command from the root directory:

```bash
npm run dev
```

This uses `concurrently` to run:
- Backend API (nodemon watching `packages/cli/server.js`) on `http://localhost:3000`
- Frontend UI (vite dev server) on `http://localhost:5173`

Normal startup does not alter the database schema. The development command only invokes bootstrap when one or more Promptly tables are missing.

The frontend dev server proxies `/api` requests to the local backend. Keep both processes running when using a tunnel; the tunnel setup is documented in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

## 📁 Project Structure

```text
promptly/
├── packages/
│   ├── cli/                  # Backend Node.js/Express Application
│   │   ├── controllers/      # Route logic (chat, dashboard, builder, forms)
│   │   ├── models/           # Sequelize DB models
│   │   ├── routes/           # Express API endpoints
│   │   ├── services/         # AI, workflow, and integration services
│   │   └── server.js         # Backend entry point
│   │
│   └── ui/                   # Frontend React Application
│       ├── src/
│       │   ├── api/          # Backend client wrappers
│       │   ├── builder/      # Workflow and Form Builder UI
│       │   ├── chat/         # AI Chat interface
│       │   ├── components/   # Shared UI components & Toast Context
│       │   └── App.jsx       # Main React entry point
│       └── index.html
│
├── package.json              # Root package configuration & scripts
└── .env                      # Environment variables
```

## 📄 License
MIT License
