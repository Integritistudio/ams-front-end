# Integriti Helpdesk — Frontend

Independent Next.js app. Deployable on its own (separate host/domain from the backend). Talks to the API over REST only — no direct database access.

## Stack

- Next.js 15 (App Router)
- React 18
- Consumes backend JWT auth + permission list for UI visibility

## Setup

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:3303
```

Use your real API URL in production (e.g. `https://api.yourcompany.com`).

```bash
npm install
npm run dev
```

UI: `http://localhost:3001`

The backend must already be running and reachable at `NEXT_PUBLIC_API_URL`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint |

## Notes

- Navigation and page access use **module permissions** returned by `/api/auth/me` (not hard-coded role names).
- Backend remains the final authority; frontend checks are for UI only.
- Login uses **email + password**.
