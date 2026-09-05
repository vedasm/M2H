# Markdown → HTML Blog Post Converter (M2H)

A modern, full‑stack Markdown editor that converts your writing to clean, sanitized HTML in real time.  
Built with **Flask** (Python) + **Vanilla JS** (ES6) — no heavy front‑end framework.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Live preview** | Updates ≤ 150 ms after you stop typing. |
| **XSS‑safe output** | Server‑side sanitisation via **bleach** (allow‑list of tags/attrs). |
| **Statistics** | Characters, words, lines, reading time, HTML byte size. |
| **Export** | • Copy raw HTML  • Download a self-contained `.html` with embedded CSS. |
| **Authentication** | JWT‑based register / login; tokens stored in `localStorage`. |
| **Dark / Light theme** | Persisted in `localStorage`. |
| **Auto‑save** | Editor content persisted to `localStorage`. |
| **Responsive split view** | Draggable resize handle, keyboard‑adjustable, remembers ratio. |
| **Keyboard shortcuts** | `Ctrl/Cmd+B/I/K` – bold/italic/link · `Ctrl/Cmd+Shift+C/D` – copy / download · `Ctrl/Cmd+Shift+T` – toggle theme. |
| **Accessibility** | ARIA labels, focus management, reduced‑motion support, print stylesheet. |

---

## 📦 Tech Stack

| Layer | Library |
|-------|---------|
| Backend | Flask, Flask‑CORS, Flask‑SQLAlchemy, PyJWT, Werkzeug |
| Markdown → HTML | `markdown` (extra, nl2br, sane_lists) |
| Sanitisation | `bleach` |
| Database | SQLite (file `instance/users.db`) |
| Front‑end | Vanilla ES6, CSS custom properties, no build step |

---

## 🚀 Quick Start (Development)

```bash
# 1. Clone & cd
git clone <your-repo-url>
cd Markdown_to_HTML_Blog_Post_Converter

# 2. Create & activate venv
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. Install Python deps
pip install -r requirements.txt

# 4. Run the dev server
python app.py
# → http://localhost:5000
```

The server serves the static `index.html` at `/` and the API under `/api/*`.

---

## ⚙️ Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `dev-only-change-me-use-env-in-production-32` | **Must** be overridden in production (≥ 32 random chars). |
| `DATABASE_URL` | `sqlite:///users.db` | SQLAlchemy connection string. |
| `FLASK_ENV` | `development` | Set to `production` for prod. |
| `PORT` | `5000` | Port the app listens on. |

Example `.env` (create in project root):

```
TURSO_DATABASE_URL=libsql://your-database-your-org.turso.io
TURSO_AUTH_TOKEN=your-turso-token
JWT_SECRET=your-long-random-secret
FLASK_ENV=production
```

Load it with `python-dotenv` if you add the package.

---

## 📚 API Reference

All endpoints require a **Bearer JWT** (except `/api/register` & `/api/login`).

> **Header**  
> `Authorization: Bearer <token>`

### Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/register` | `{ "username": "string", "password": "string" }` | `201 { "token": "<jwt>", "username": "..." }` |
| `POST` | `/api/login`    | `{ "username": "string", "password": "string" }` | `200 { "token": "<jwt>", "username": "..." }` |

*Username rules:* 3‑80 alphanumerics/underscore.  
*Password:* min 8 chars.

### Convert Markdown → HTML (with stats)

`POST /api/convert`

```json
{ "markdown": "# Hello\n\nWorld!" }
```

**Success 200**

```json
{
  "html": "<h1>Hello</h1>\n<p>World!</p>",
  "stats": {
    "chars": 18,
    "words": 2,
    "lines": 3,
    "read_time": "~1 min read",
    "html_size": "62 B"
  }
}
```

### Download self‑contained HTML file

`POST /api/download`

Same request body as `/api/convert`.

**Success 200**

```json
{
  "html": "<!DOCTYPE html>…",
  "filename": "hello-world.html"
}
```

Front‑end turns this into a file download.

---

## 🖥️ Front‑end Usage

Open `http://localhost:5000` (or your domain).  

1. **Log in / Sign up** – modal appears automatically.  
2. Write Markdown in the left panel.  
3. Right panel shows live, styled preview.  
4. Toolbar actions:  
   * **Copy HTML** – copies sanitized HTML to clipboard.  
  * **Download** – saves a complete `.html` file with embedded CSS and system font fallbacks.
   * **Clear** – wipes editor & localStorage (confirmation modal).  
   * **Theme** – toggles dark/light mode.  
5. Drag the vertical handle to resize panels; double‑click to reset 50/50.  
6. All changes auto‑saved to `localStorage` (`inkwell_md_content`).

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + K` | Insert link |
| `Ctrl/Cmd + Shift + C` | Copy HTML |
| `Ctrl/Cmd + Shift + D` | Download HTML |
| `Ctrl/Cmd + Shift + T` | Toggle theme |

---

## 🧪 Testing (suggested)

```bash
# Install test deps
pip install pytest pytest-cov httpx

# Run
pytest -q
```

*Add tests under `tests/` covering:*
- Auth register/login/token validation
- `/api/convert` markdown → HTML + stats
- Sanitisation edge‑cases (`<script>`, `onerror`, etc.)
- `/api/download` file generation
- Rate‑limit / error responses

---

## 🐳 Docker (production‑ready)

```Dockerfile
# Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV FLASK_ENV=production
EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
```

```yaml
# docker-compose.yml
version: "3.9"
services:
  web:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    volumes:
      - ./instance:/app/instance   # persist SQLite
```

Run:

```bash
docker compose up --build -d
```

---

## 📂 Project Structure

```
.
├── app.py                # Flask app + API endpoints
├── app.js                # Front‑end logic (ES6 modules via IIFE)
├── index.html            # Single‑page UI
├── styles.css            # Theming, layout, typography
├── requirements.txt      # Python dependencies
├── instance/
│   └── users.db          # SQLite DB (auto‑created)
├── .venv/                # Virtual env (ignored)
└── README.md             # You are here
```

---

## 🔐 Security Checklist (Production)

- [ ] Set a strong `JWT_SECRET` via env var.
- [ ] Enable **HTTPS** (reverse proxy + TLS termination).
- [ ] Add **rate limiting** (`Flask-Limiter`) on auth & convert endpoints.
- [ ] Set **secure cookie flags** if you move token to cookies (`Secure; HttpOnly; SameSite=Lax`).
- [ ] Add **CSP / HSTS** via `flask-talisman`.
- [ ] Run DB migrations with **Flask‑Migrate** (Alembic) instead of `create_all()`.
- [ ] Rotate secrets, monitor logs (`structlog` + JSON).

---

## 🤝 Contributing

1. Fork & create a feature branch.
2. Follow existing code style (PEP8 / ESLint‑like JS).
3. Add tests for new behaviour.
4. Open a PR with a clear description.

---

## 📄 License

MIT © 2025 – vedasm
