# KAFI AI Agents

Unified workspace for KAFI Group AI agents — one localhost, dropdown to switch.

## Agents

| Agent | URL |
|-------|-----|
| International Sales Chatbot | `/` or `/index.html` |
| Supply Chain (Agent 6) | `/supply-chain.html` |
| Sourcing & Procurement | `/sourcing.html` |
| Admin / Training | `/admin.html` |

Use the **dropdown at the top** of any page to switch agents.

## Local development

```bash
pip install -r requirements.txt
python server.py
```

Or double-click `run-server.bat` (Windows).

Opens http://localhost:8000 with all agents and API routes.

**Admin password (local default):** `kafi2026`

## Deploy to Vercel

1. Push this folder to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set environment variables:

| Variable | Example | Purpose |
|----------|---------|---------|
| `KAFI_ADMIN_PASSWORD` | your-secure-password | Settings / API admin auth |
| `KAFI_BASE_URL` | `https://your-app.vercel.app` | Outlook OAuth redirect base |

4. After deploy, add your Vercel URL as Outlook redirect URI in Azure:
   `https://your-app.vercel.app/api/outlook/callback`

### Vercel notes

- Static HTML/JS is served from the CDN
- Python APIs run as serverless functions (`api/index.py`)
- Settings saved in the admin UI use `/tmp` on Vercel (ephemeral). For production, configure API keys via env or re-save after cold starts, or add persistent storage later.

## API endpoints

- `POST /api/search` — web search
- `POST /api/scrape` — scrape URL
- `POST /api/ai/chat` — AI copilot
- `POST /api/outlook/*` — Outlook integration
- `POST /api/enrich/*` — Apollo / Hunter enrichment

## Config files (local only, gitignored)

Copy examples if needed:

```bash
copy data\ai-config.example.json data\ai-config.json
copy data\enrich-config.example.json data\enrich-config.json
copy data\outlook-config.example.json data\outlook-config.json
```
