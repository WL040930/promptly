# Local development guide

This guide covers a clean local setup, running the frontend and API together,
testing them, and exposing the app temporarily for OAuth or external-trigger
testing.

The API reads the root `.env` file. Vite also reads root environment values, so
there is one configuration file for ordinary local development.

## 1. Prerequisites

Install the following before starting:

- Node.js 20 or later and npm
- PostgreSQL, with a database created for Promptly
- A Supabase project
- Google OAuth client credentials
- SMTP credentials
- An API key for at least one supported AI provider

The application validates its database, JWT, Google OAuth, SMTP, Supabase, and
AI settings when the API starts. Google, SMTP, and Supabase values therefore
need to be present even if you are initially testing only a small part of the
interface.

## 2. First-time setup

From the repository root, install the locked dependencies and create a local
environment file:

```bash
npm ci
cp .env.example .env
```

Create the PostgreSQL database named by `DB_DATABASE` before running the app.
For example, if your local PostgreSQL account is allowed to create databases:

```bash
createdb promptly_db
```

Open `.env` and replace every required placeholder. Do not commit this file.
The checked-in [.env.example](.env.example) remains the complete variable
reference.

### Minimum local configuration

For a normal local run, keep these URL values:

```env
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Leave these unset until a tunnel or deployment is needed:
# SITE_URL=
# TRIGGER_PUBLIC_ORIGIN=
# VITE_API_BASE_URL=
```

Then configure the remaining required groups.

| Group | Required settings | Local notes |
| --- | --- | --- |
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | The database itself must already exist. |
| Security | `JWT_SECRET` | Use a unique value of at least 32 characters. |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Register the exact callback URL in Google Cloud Console. |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Used by password reset and email-delivery features. |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Add `SUPABASE_SERVICE_ROLE_KEY` for private workflow assets, private form uploads, and Google Drive transfers. |
| AI | `AI_DEFAULT_PROVIDER`, `AI_DEFAULT_MODEL`, and that provider's API key | The template uses OpenRouter by default. Gemini, NVIDIA, Groq, and Cerebras are also supported. |

Do not paste real credentials into documentation, screenshots, test cases, or
commits. Use `.env.example` for placeholders.

## 3. Initialize and run the application

On a new or reset database, initialize the schema explicitly:

```bash
npm run db:bootstrap
```

Then start both development servers:

```bash
npm run dev
```

This starts:

```text
npm run dev
├── Vite frontend: http://localhost:5173
│   └── /api/* proxies to http://127.0.0.1:3000
└── Express API: http://localhost:3000
```

Open [http://localhost:5173](http://localhost:5173) in the browser. Check the
API directly at [http://localhost:3000/api/health](http://localhost:3000/api/health).

The normal API startup performs the same bootstrap check. It creates missing
model tables and required PostgreSQL resources for an empty or reset database,
but leaves an already initialized database alone. Running `npm run db:bootstrap`
first makes setup failures easier to identify.

During local Vite development, leave `VITE_API_BASE_URL` unset. Browser requests
to `/api` are forwarded to the local API by Vite, so a separate API URL is not
needed.

## 4. Everyday commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite frontend and API watcher together. |
| `npm run cli:dev` | Run only the API. |
| `npm run ui:dev` | Run only the Vite frontend. The API must already be running. |
| `npm run db:bootstrap` | Initialize an empty or reset database. |
| `npm test` | Run the automated test suite. |
| `npm run test:e2e` | Run the Playwright end-to-end tests. |
| `npm run test:e2e:headed` | Run end-to-end tests with a visible browser. |
| `npm run build` | Create the production frontend build in `packages/ui/dist`. |
| `npm run start` | Run the API without the development watcher; use after `npm run build` for a production-like local run. |

Use `Ctrl+C` in the terminal that runs `npm run dev` to stop both local servers.

## 5. URL settings

The following values may look similar, but they serve different roles.

| Setting | Example | Used for |
| --- | --- | --- |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS, password-reset links, and redirects after Google OAuth. |
| Local API address | `http://localhost:3000` | The API behind Vite's local proxy. It is not an environment variable. |
| `SITE_URL` | `https://app.example.com` | The canonical website origin for `robots.txt` and `sitemap.xml`. |
| `TRIGGER_PUBLIC_ORIGIN` | `https://api.example.com` | A public HTTPS origin for external Google callbacks and triggers. |
| `GOOGLE_REDIRECT_URI` | `https://api.example.com/api/auth/google/callback` | The exact OAuth callback registered in Google Cloud Console. |
| `VITE_API_BASE_URL` | `https://api.example.com` | The API origin for a separately hosted frontend build. Leave unset when Vite proxies local requests. |

`SITE_URL` and `TRIGGER_PUBLIC_ORIGIN` are deliberately separate. Do not use an
API callback URL as the canonical website URL unless one hostname genuinely
serves both roles.

## 6. Local-only development

Use this mode when you do not need an outside service to reach your laptop.

```env
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# SITE_URL=
# TRIGGER_PUBLIC_ORIGIN=
# VITE_API_BASE_URL=
```

Run `npm run dev`, open the frontend URL, and use the health endpoint to confirm
that the API is available. Google OAuth can use the localhost callback only if
that exact callback is registered for the OAuth client.

## 7. Public testing with a Cloudflare quick tunnel

Use a public tunnel only when Google or another external service must call the
application. Start `npm run dev` before starting either tunnel.

### One public URL

Expose the Vite frontend, not the API:

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

Vite forwards `/api` requests to the local API, so the one public URL can serve
the frontend and its API calls. If Cloudflare gives you
`https://some-words.trycloudflare.com`, use that same URL for these values:

```env
CLIENT_ORIGIN=https://some-words.trycloudflare.com
SITE_URL=https://some-words.trycloudflare.com
TRIGGER_PUBLIC_ORIGIN=https://some-words.trycloudflare.com
GOOGLE_REDIRECT_URI=https://some-words.trycloudflare.com/api/auth/google/callback
```

Register the exact redirect URI in Google Cloud Console and restart `npm run dev`
after changing `.env`.

### Separate public UI and API URLs

Use this layout when provider callbacks should reach the API through a distinct
public hostname:

```bash
# Terminal A: frontend
cloudflared tunnel --url http://127.0.0.1:5173

# Terminal B: API
cloudflared tunnel --url http://127.0.0.1:3000
```

If the resulting URLs are `https://ui-words.trycloudflare.com` and
`https://api-words.trycloudflare.com`, configure:

```env
CLIENT_ORIGIN=https://ui-words.trycloudflare.com
SITE_URL=https://ui-words.trycloudflare.com
TRIGGER_PUBLIC_ORIGIN=https://api-words.trycloudflare.com
GOOGLE_REDIRECT_URI=https://api-words.trycloudflare.com/api/auth/google/callback

# Keep this empty while the UI is served by Vite and its proxy:
# VITE_API_BASE_URL=
```

Open the UI URL in the browser. In this development layout, Vite still proxies
browser `/api` requests to the local API. The API tunnel is used for external
callbacks and trigger requests.

Quick-tunnel hostnames change when a tunnel is recreated. When that happens,
update the affected `.env` values, update Google Cloud Console when OAuth is
enabled, and restart the development servers.

## 8. Separately hosted frontend or production-like local run

When the frontend is built or hosted separately from the API, set
`VITE_API_BASE_URL` before running `npm run build`:

```env
VITE_API_BASE_URL=https://api.example.com
```

For a single-host production-like local check, build the frontend and run the
API:

```bash
npm run build
npm run start
```

The Express application serves the built frontend from `packages/ui/dist`.

## 9. Troubleshooting

### The API exits with a missing environment-variable error

Copy `.env.example` to `.env` and replace every required placeholder. The API
requires configuration for the database, JWT, Google OAuth, SMTP, Supabase, and
at least one usable AI-provider route before it will start.

### The database connection or bootstrap fails

Confirm PostgreSQL is running, the database named by `DB_DATABASE` exists, and
the `DB_*` values are correct. The database user needs sufficient permissions to
create the schema resources used by the application. Run `npm run db:bootstrap`
again after correcting the connection.

### Port 3000 or 5173 is already in use

Stop the existing process using that port, or set a different API `PORT`. The
Vite development server is fixed to port 5173, so it must be free while using
`npm run dev`.

### OAuth reports an invalid redirect URI

`GOOGLE_REDIRECT_URI` must match the Google Cloud Console value exactly,
including the scheme, hostname, port, and `/api/auth/google/callback` path.

### A tunnel reports `connection refused`

The tunnel target is not listening. Start `npm run dev`, check the local health
endpoint, and use `127.0.0.1` in the tunnel command. This avoids an IPv6
`localhost` resolution when a service is listening only on IPv4.

### The browser returns to localhost after OAuth

Set `CLIENT_ORIGIN` to the URL open in the browser, then restart the API.
`CLIENT_ORIGIN` controls browser redirects; `TRIGGER_PUBLIC_ORIGIN` controls
server-side callbacks.
