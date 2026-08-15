# Local development and public tunnel guide

Promptly has a frontend, a backend, and several kinds of public URL. They can
point to the same hostname in a simple setup, but they have different jobs and
should not be copied between environment variables without checking the job
first.

## The URL map

| Setting | Example | Meaning |
| --- | --- | --- |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Browser-facing frontend origin. Used for CORS, password-reset links, and redirects after Google OAuth. |
| Local API origin | `http://localhost:3000` | Backend address used by the Vite proxy. It is not a `.env` setting today. |
| `SITE_URL` | `https://app.example.com` | Canonical website origin used only by `robots.txt` and `sitemap.xml`. |
| `TRIGGER_PUBLIC_ORIGIN` | `https://api.example.com` | Public HTTPS origin that routes external Google trigger callbacks to the backend. |
| `GOOGLE_REDIRECT_URI` | `https://api.example.com/api/auth/google/callback` | The exact Google OAuth callback URL. It must match Google Cloud Console exactly. |
| `VITE_API_BASE_URL` | `https://api.example.com` | Optional frontend API base when the frontend is hosted separately. Leave it empty for local Vite development. |

The backend now keeps `SITE_URL` separate from `TRIGGER_PUBLIC_ORIGIN`. If
`SITE_URL` is omitted, the backend uses the origin of the incoming request for
SEO responses; it never silently turns an API trigger URL into the site URL.

## 1. Local-only development

Use this when you are testing the app in your own browser and do not need
Google to call your laptop from the internet.

Create the root `.env` from the checked-in template, then edit the URL values:

```bash
cp .env.example .env
```

In the root `.env`:

```env
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Omit these locally:
# SITE_URL=...
# TRIGGER_PUBLIC_ORIGIN=...
```

Start the app from the repository root:

```bash
cd /Users/wl/Documents/promptly
npm run dev
```

Open the frontend at [http://localhost:5173](http://localhost:5173).
The backend health check is [http://localhost:3000/api/health](http://localhost:3000/api/health).

The Vite frontend proxies `/api/*` to `http://127.0.0.1:3000`, so the browser
does not need a separate API base URL in local development.

## 2. Public testing with one URL

This is the easiest tunnel setup. Expose the Vite frontend, not the backend:

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

Cloudflare prints a URL such as:

```text
https://some-words.trycloudflare.com
```

Because the Vite server proxies `/api` to the backend, that one public URL can
serve the browser app and forward API requests. In this mode it is expected
that the public values are the same URL:

```env
CLIENT_ORIGIN=https://some-words.trycloudflare.com
SITE_URL=https://some-words.trycloudflare.com
TRIGGER_PUBLIC_ORIGIN=https://some-words.trycloudflare.com
GOOGLE_REDIRECT_URI=https://some-words.trycloudflare.com/api/auth/google/callback
```

Use the tunnel URL in the browser. Restart `npm run dev` after changing `.env`.
Also add the exact `GOOGLE_REDIRECT_URI` to the OAuth client in Google Cloud
Console. A quick tunnel URL changes when the tunnel is recreated, so update
both `.env` and Google Cloud Console each time it changes.

## 3. Public testing with separate UI and API URLs

Use this when you want the URL roles to be visibly separate.

Keep `npm run dev` running, then open two additional terminals:

Terminal A, for the frontend:

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

Terminal B, for the backend:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Suppose Cloudflare prints:

```text
UI:  https://ui-words.trycloudflare.com
API: https://api-words.trycloudflare.com
```

Use this configuration:

```env
CLIENT_ORIGIN=https://ui-words.trycloudflare.com
SITE_URL=https://ui-words.trycloudflare.com
TRIGGER_PUBLIC_ORIGIN=https://api-words.trycloudflare.com
GOOGLE_REDIRECT_URI=https://api-words.trycloudflare.com/api/auth/google/callback
```

Open the UI URL, not the API URL. The API URL is for health checks, OAuth
callbacks, and provider-trigger requests. The UI URL is the public website.
When Google finishes OAuth, the backend uses `CLIENT_ORIGIN` to send the
browser back to the UI.

## What each command exposes

```text
npm run dev
├── Vite frontend: http://localhost:5173
│   └── /api/* proxies to http://127.0.0.1:3000
└── Express backend: http://localhost:3000
```

```text
cloudflared --url http://127.0.0.1:5173
└── public website + Vite /api proxy

cloudflared --url http://127.0.0.1:3000
└── public API only
```

If you expose port `3000` and open that URL while running only the Vite dev
server, you are not looking at the active frontend dev server. The backend can
serve a previously built `packages/ui/dist` directory, or it may have no
frontend build at all. For normal development, expose port `5173`.

## Troubleshooting

### `Unable to reach the origin service` / `connection refused`

The tunnel itself is healthy, but nothing is listening on the local port that
you gave Cloudflare. Start the app first and check the port directly:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:5173
```

Then start the tunnel with the matching target. Prefer `127.0.0.1` instead of
`localhost` in the tunnel command so macOS does not choose an IPv6 `::1`
address when the server is listening only on IPv4.

### OAuth says the redirect URI is invalid

`GOOGLE_REDIRECT_URI` must be the exact full callback URL, including
`/api/auth/google/callback`. The scheme, hostname, port, and path must match
the authorized redirect URI in Google Cloud Console. Update both places after a
quick tunnel URL changes.

### External triggers say a public URL is required

Set `TRIGGER_PUBLIC_ORIGIN` to a public HTTPS origin that reaches the backend,
then restart the backend. In the one-URL setup this is the UI tunnel because
Vite forwards `/api` to the backend. In the split setup it is the API tunnel.

### The app redirects to localhost after OAuth

Set `CLIENT_ORIGIN` to the URL you opened in the browser and restart the
backend. `CLIENT_ORIGIN` controls browser redirects; `TRIGGER_PUBLIC_ORIGIN`
controls server-side provider callbacks. They are separate settings.

### The tunnel URL changes

That is normal for a Cloudflare quick tunnel. Treat the URL as temporary:

1. Stop the old tunnel.
2. Start a new tunnel and copy its new URL.
3. Update the relevant `.env` values.
4. Update Google Cloud Console if OAuth is being used.
5. Restart `npm run dev`.

Never commit `.env`; it contains credentials. Commit `.env.example` instead.
