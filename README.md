# Promptly

Promptly is an AI-assisted automation workspace for building forms and multi-step administrative workflows. It combines conversational assistants with a visual workflow editor, then lets users review, test, publish, monitor, and pause their automations.

The default AI route uses OpenRouter with NVIDIA Nemotron. Gemini, NVIDIA, Groq, and Cerebras can also be configured.

## What it does

- Create and revise workflows with Workflow AI or Ask Promptly, then review the proposed changes before applying them.
- Build forms manually or with Form AI, publish them, collect responses, manage uploads, and export response data.
- Design workflows in a visual editor with validation, test runs, published revisions, version restoration, and run history.
- Start workflows from form submissions, schedules, webhooks, supported Google events, database events, or approved chat invocations.
- Use workflow nodes for Google Sheets, Gmail, Google Drive, Google Calendar, HTTP requests, email delivery, data transformation, conditions, approvals, delays, error handling, and more.
- Review pending runtime approvals and execution details from the workspace.

Generated workflow and form changes are reviewable before they are applied. A runtime approval is separate: add an **Approval** node when a production workflow must pause for a decision before continuing.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query, React Flow, Recharts, GSAP |
| API | Node.js, Express, Server-Sent Events |
| Data | PostgreSQL, Sequelize, Supabase Storage |
| Identity and integrations | JWT, bcrypt, Google OAuth, SMTP |
| AI | OpenRouter, Gemini, NVIDIA, Groq, or Cerebras |

## Prerequisites

- Node.js 20 or newer
- PostgreSQL
- A Supabase project for workflow assets and form uploads
- Google OAuth client credentials
- An SMTP account for password-reset and email-delivery features
- At least one AI-provider API key

## Local setup

1. Install dependencies.

   ```bash
   npm ci
   ```

2. Create a local environment file.

   ```bash
   cp .env.example .env
   ```

   Fill in every required value. The variable-by-variable reference is in
   [.env.example](.env.example); use [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
   for local, tunnel, and Google OAuth URL configuration.

3. Start the frontend and API.

   ```bash
   npm run dev
   ```

   - Frontend: <http://localhost:5173>
   - API health check: <http://localhost:3000/api/health>

On a new or reset database, startup creates the Sequelize tables and the
PostgreSQL-only schema resources the application needs. Existing initialized
databases are left unchanged. You can also run this setup explicitly:

```bash
npm run db:bootstrap
```

## Environment essentials

The application will not start until these are configured:

| Area | Required values |
| --- | --- |
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` |
| Security | `JWT_SECRET` (at least 32 characters) |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| AI | A key for the provider selected by `AI_DEFAULT_PROVIDER` |

`CLIENT_ORIGIN` is the browser URL used for CORS and post-auth redirects.
`SITE_URL` is only for `robots.txt` and `sitemap.xml`. `TRIGGER_PUBLIC_ORIGIN`
is the public HTTPS API origin used by external callbacks; it is not a frontend
URL unless one tunnel serves both through the Vite proxy.

Private workflow assets, private form uploads, and Google Drive transfers
additionally require `SUPABASE_SERVICE_ROLE_KEY`. Gmail push triggers require
`GOOGLE_GMAIL_PUBSUB_TOPIC`; production Gmail provider events also require
`GOOGLE_PUBSUB_AUDIENCE`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite development server together |
| `npm run start` | Start the API server |
| `npm run build` | Build the frontend for production |
| `npm run db:bootstrap` | Initialize a new or reset database |
| `npm test` | Run the automated test suite |
| `npm run test:e2e` | Run Playwright end-to-end tests |

## Deployment

The included [Dockerfile](Dockerfile) builds the frontend and serves it from
the Express application on port 3000. Set `CLIENT_ORIGIN`, `SITE_URL`, and
`TRIGGER_PUBLIC_ORIGIN` to the deployed public origins, then register the exact
`GOOGLE_REDIRECT_URI` in Google Cloud Console.

If the frontend is deployed separately from the API, set `VITE_API_BASE_URL`
at frontend build time to the public API origin. Leave it unset during ordinary
local Vite development.

## Project structure

```text
promptly/
├── packages/
│   ├── cli/       # Express API, services, models, routes, workflow runtime
│   ├── nodes/     # Dynamic workflow-node definitions and executors
│   ├── shared/    # Shared contracts and utilities
│   └── ui/        # React application
├── .env.example   # Environment-variable template
├── Dockerfile
└── package.json
```

## License

MIT
