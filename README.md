# Fridge to Feast

Tell it what's in your fridge, get back streamed, ranked recipe suggestions from Claude.

## Stack
- **Frontend:** React (Vite)
- **Backend:** FastAPI, streams tokens from the Anthropic API over Server-Sent Events
- **Deployment:** Docker container on **Render.com** (free tier, no credit card required)

## Project structure
```
fridge-to-feast/
├── backend/
│   ├── main.py            # FastAPI app + Claude streaming endpoint
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/                # React app (chip input, filters, streaming recipe cards)
├── Dockerfile               # multi-stage: builds frontend, serves it from FastAPI
├── render.yaml               # Render blueprint (optional one-click config)
└── README.md
```

## Run locally

**1. Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then paste your real ANTHROPIC_API_KEY into .env
uvicorn main:app --reload --port 8000
```

**2. Frontend** (separate terminal)
```bash
cd frontend
npm install
npm run dev
```
Vite dev server proxies `/api` calls to `localhost:8000` (see `vite.config.js`), so open the Vite URL (usually `http://localhost:5173`) and the app talks straight to your local backend.

## Run with Docker (production-style, single container)
```bash
docker build -t fridge-to-feast .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=your-key-here fridge-to-feast
```
Visit `http://localhost:8000` — FastAPI serves the built React app *and* the API from the same container.

## Deploying for free on Render.com (no credit card)

**1. Push this project to GitHub**
```bash
git init
git add .
git commit -m "Fridge to Feast"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fridge-to-feast.git
git push -u origin main
```

**2. Create the Render service**
- Go to render.com → sign up (GitHub login is easiest) → no card required
- Dashboard → **New → Web Service** → connect your GitHub repo
- Render auto-detects the `Dockerfile` → choose **Docker** as the environment
- Under **Environment Variables**, add `ANTHROPIC_API_KEY` with your real key
- Instance type: **Free**
- Click **Create Web Service**

Render builds the image and gives you a public URL like `https://fridge-to-feast.onrender.com` within a few minutes.

**Note on free tier behavior:** the service sleeps after 15 minutes with no traffic and takes 30-60 seconds to wake on the next request. Load the URL once before a demo/screenshot so it's warm.

## Security notes
- `ANTHROPIC_API_KEY` is read from an environment variable on the server only — it never appears in frontend code or gets bundled into the Vite build
- `.env` is git-ignored and docker-ignored so it can't leak into version control or the image
- CORS is wide-open (`*`) here for local dev simplicity; since the frontend is served from the same origin as the API in production, you can tighten `allow_origins` to your exact Render URL before final submission if you want to document that as a hardening step in your report

## Sample prompt used (for your Report's "Prompting Strategy" section)
See `build_prompt()` in `backend/main.py` — it constrains Claude to a strict Markdown structure (`## Title`, `**Time:**`, `**Uses:**`, `**Needs:**`, `**Steps:**`) so the frontend can reliably parse the streamed text into recipe cards as it arrives.
