# PhotoMind 🖼️ — AI Photo Organizer

A full-stack AI-powered photo organization app. Upload local images or connect Google Drive — PhotoMind detects faces, clusters people, classifies scenes, and sorts everything into smart folders automatically.

---

## ✨ Features

- **4 Import modes**: local folder, file picker, Google Drive connect, Google Drive folder scan
- **AI Classification**: Nature, People, Food, Vehicles, Buildings, Items, Mixed, Uncertain
- **Face Detection**: detect faces across thousands of photos
- **Face Clustering**: automatically group photos of the same person
- **Find Me**: upload 1–3 selfies → finds every photo you appear in
- **Smart Gallery**: category tabs, search, confidence indicators
- **Manual Correction**: move categories, merge face clusters, flag for review
- **Pluggable AI**: swap between Mock (zero-config), DeepFace (local), or OpenAI

---

## 🏗️ Architecture

```
photomind/
├── apps/
│   ├── web/          # Next.js 14 (App Router) — TypeScript
│   └── api/          # FastAPI Python backend
├── prisma/           # Database schema reference
├── docker-compose.yml
├── .env.example
└── README.md
```

### Backend (`apps/api/`)
```
main.py               # FastAPI app, CORS, router registration
routers/
  auth.py             # Register, login, JWT
  uploads.py          # Local file upload + validation
  sessions.py         # Session management
  jobs.py             # Progress polling
  photos.py           # Gallery CRUD, category moves
  people.py           # Face clusters, find-me, merge/split
  drive.py            # Google Drive OAuth + folder scanning
services/
  ai/
    base.py           # Abstract AIAdapter
    mock_adapter.py   # Zero-dependency fake results
    deepface_adapter.py # Real face detection (DeepFace)
    __init__.py       # Factory: get_ai_adapter()
  storage.py          # Local disk or Supabase Storage
  queue.py            # In-memory async job queue
workers/
  process_photo.py    # Per-image AI pipeline worker
db/
  database.py         # SQLite via sqlite3 (zero setup)
models/
  schemas.py          # Pydantic models
```

### Frontend (`apps/web/`)
```
src/
  app/
    page.tsx           # Landing page
    (auth)/
      login/           # Email login
      register/        # Register
    (app)/
      layout.tsx       # Sidebar + top nav shell
      dashboard/       # Stats + recent sessions
      upload/          # 4 import entry points
      gallery/         # Smart folders + filters
      people/          # Face clusters + Find Me
      with-me/         # Photos with user
      review/          # Uncertain review queue
      settings/        # Drive, AI config, danger zone
  lib/
    api.ts             # Typed fetch client
    validation.ts      # Client-side file validation
  hooks/
    useJobStatus.ts    # Progress polling hook
    useAuth.ts         # Auth context
  styles/
    globals.css        # Design tokens + all styles
```

---

## 🚀 Quick Start (Local Dev)

### Prerequisites
- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **Python** 3.11+ ([python.org](https://python.org))
- **pip** or **pipenv**

### 1. Clone & configure

```bash
cd photomind
cp .env.example .env
```

Edit `.env` — at minimum set:
```env
NEXTAUTH_SECRET=any-long-random-string
AI_ADAPTER=mock
DATABASE_URL=file:./dev.db
STORAGE_ADAPTER=local
```

### 2. Start the FastAPI backend

```bash
cd apps/api
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be at **http://localhost:8000**
- Auto-docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

> The SQLite database (`dev.db`) is created automatically on first request.

### 3. Start the Next.js frontend

Open a new terminal:

```bash
cd apps/web
npm install
npm run dev
```

The app will be at **http://localhost:3000**

---

## 🤖 AI Adapter Configuration

Set `AI_ADAPTER` in `.env` inside `apps/api/`:

| Value | Description | Requirements |
|-------|-------------|-------------|
| `mock` | Deterministic fake results (default) | None |
| `deepface` | Real face detection via DeepFace | `pip install deepface tensorflow` (~500 MB) |
| `openai` | GPT-4o Vision classification | `OPENAI_API_KEY` |

### Switching to DeepFace

```bash
pip install deepface tensorflow
# In .env:
AI_ADAPTER=deepface
```

### Switching to OpenAI

```env
AI_ADAPTER=openai
OPENAI_API_KEY=sk-...
```

*(OpenAI adapter implementation coming — scaffolded in `services/ai/`)*

---

## ☁️ Google Drive Integration

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Drive API**
3. Create **OAuth 2.0 credentials** (Web application)
4. Add redirect URI: `http://localhost:3000/api/drive/callback`
5. Copy credentials to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback
```

> Without credentials the Drive UI still renders — the OAuth flow will redirect to an error page.

---

## 🗄️ Database

### Default: SQLite (local dev, zero setup)
```env
DATABASE_URL=file:./dev.db
```

### Switch to PostgreSQL (production)

Start Postgres via Docker:
```bash
docker-compose --profile postgres up -d
```

Then update `.env`:
```env
DATABASE_URL=postgresql://photomind:photomind@localhost:5432/photomind
```

### Switch to Supabase

```env
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
STORAGE_ADAPTER=supabase
```

---

## 📦 Upload Validation Rules

| Mode | Minimum |
|------|---------|
| Choose Folder | **More than 10** valid images |
| Choose Pictures | **At least 10** valid images |

Supported formats: **JPG · JPEG · PNG · HEIC**

Validation runs on:
- **Client side** (`src/lib/validation.ts`) — instant feedback
- **Server side** (`routers/uploads.py`) — re-validated before processing

---

## 🧪 Mock Mode / Demo Data

With `AI_ADAPTER=mock`:
- Every photo gets a **deterministic** category seeded from its filename (same result every run)
- 30% of photos will have faces detected
- 15% will be classified as "With Me"
- Categories are weighted: Nature (20%), People (15%), Buildings (12%), With Me (10%)...

This lets you test the full UI flow with any images.

---

## 📡 API Reference

Full interactive docs at **http://localhost:8000/docs** after starting the backend.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login, get JWT |
| `/api/auth/me` | GET | Current user |
| `/api/photos/upload` | POST | Upload local files |
| `/api/jobs/{sessionId}` | GET | Poll progress |
| `/api/photos/` | GET | List photos (filtered) |
| `/api/photos/counts` | GET | Per-category counts |
| `/api/photos/{id}/category` | PATCH | Move to category |
| `/api/photos/{id}/flag` | PATCH | Toggle review flag |
| `/api/sessions/` | GET | List sessions |
| `/api/people/clusters` | GET | Face clusters |
| `/api/people/find-me` | POST | Upload reference faces |
| `/api/people/clusters/merge` | POST | Merge clusters |
| `/api/drive/auth-url` | GET | Get Google OAuth URL |
| `/api/drive/folders` | GET | List Drive folders |
| `/api/drive/scan` | POST | Scan Drive folder |

---

## 🔐 Environment Variables Reference

See `.env.example` for the full annotated list.

---

## 🗺️ Roadmap

- [ ] OpenAI GPT-4o Vision adapter
- [ ] EXIF GPS extraction + map view
- [ ] Bulk re-analysis of selected photos
- [ ] Export/download sorted zip
- [ ] Mobile-optimized gallery
- [ ] Supabase real-time progress via WebSocket
- [ ] Duplicate photo detection

---

## 📄 License

MIT
