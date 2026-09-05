# M2H — Markdown to HTML Converter

A split-pane Markdown editor that converts your writing to clean HTML as you type. Flask backend, plain JavaScript frontend — no build step, no framework overhead.

## What it does

- Live preview, updates shortly after you stop typing
- Server-side HTML sanitisation via `bleach` (tag/attribute allowlist), so pasted or typed markdown can't inject scripts
- Word/character/line counts, estimated reading time, output size
- Copy the generated HTML, or download it as a standalone `.html` file with the CSS embedded
- Dark/light theme, remembered across sessions
- Auto-saves what you're writing to `localStorage` so a refresh doesn't lose your draft
- Resizable split view (drag or keyboard), remembers your preferred ratio
- Basic keyboard shortcuts for bold/italic/link and for copy/download/theme-toggle
- Login required to use the editor (JWT-based), mainly so drafts and settings persist per user rather than being globally shared in `localStorage`

## Screenshot

![M2H editor — split-pane markdown and live HTML preview](./screenshots/editor.png)

_Dark mode:_

![M2H editor in dark mode](./screenshots/editor-dark.png)

## Tech stack

- Backend: Flask, Flask-CORS, Flask-SQLAlchemy, PyJWT, Werkzeug
- Markdown parsing: `markdown` (with `extra`, `nl2br`, `sane_lists`)
- Sanitisation: `bleach`
- Database: SQLite (`instance/users.db`)
- Frontend: vanilla ES6 + CSS custom properties, no framework

## Running it locally

```bash
git clone https://github.com/vedasm/M2H.git
cd M2H

python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

Flask serves `index.html` at `/` and the API under `/api/*`.

## Configuration

Set these as environment variables, or in a `.env` file at the project root (requires `python-dotenv` if you want it auto-loaded):

| Variable       | Default              | Notes                                                                                                  |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`   | — (must be set)      | Used to sign auth tokens. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | `sqlite:///users.db` | Any SQLAlchemy connection string                                                                       |
| `FLASK_ENV`    | `development`        | Set to `production` when deploying                                                                     |
| `PORT`         | `5000`               | Port the app listens on                                                                                |

## API

All endpoints except `/api/register` and `/api/login` require a Bearer token:

```
Authorization: Bearer <token>
```

**Auth**

| Method | Path            | Body                         | Response                      |
| ------ | --------------- | ---------------------------- | ----------------------------- |
| `POST` | `/api/register` | `{ "username", "password" }` | `201 { "token", "username" }` |
| `POST` | `/api/login`    | `{ "username", "password" }` | `200 { "token", "username" }` |

Username: 3–80 alphanumeric characters or underscores. Password: 8 characters minimum.

**Convert**

`POST /api/convert`

```json
{ "markdown": "# Hello\n\nWorld!" }
```

returns

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

**Download**

`POST /api/download` — same body as `/api/convert`, returns `{ "html": "...", "filename": "hello-world.html" }` for the frontend to save as a file.

## Using it

1. Register or log in (first-visit modal).
2. Write Markdown on the left; HTML renders on the right as you type.
3. Toolbar: **Copy HTML**, **Download** (self-contained `.html` with embedded CSS), **Clear** (asks for confirmation — wipes the editor and saved draft), **Theme** toggle.
4. Drag the divider to resize panels; double-click to reset to 50/50.
5. Your draft auto-saves to `localStorage` under `m2h_md_content`.

**Shortcuts:** `Ctrl/Cmd+B` bold · `Ctrl/Cmd+I` italic · `Ctrl/Cmd+K` link · `Ctrl/Cmd+Shift+C` copy HTML · `Ctrl/Cmd+Shift+D` download · `Ctrl/Cmd+Shift+T` toggle theme

## Tests

```bash
pip install pytest pytest-cov httpx
pytest -q
```

Covers register/login/token validation, `/api/convert` output and stats, sanitisation edge cases (`<script>`, `onerror`, etc.), and `/api/download` file generation.

## Running with Docker

```bash
docker compose up --build -d
```

This builds the Flask app behind gunicorn and mounts `./instance` so the SQLite file persists across container restarts. See `Dockerfile` and `docker-compose.yml` for details.

## Project structure

```
.
├── app.py              # Flask app and API endpoints
├── app.js              # Frontend logic
├── index.html          # Single-page UI
├── styles.css          # Theming, layout, typography
├── requirements.txt
├── instance/
│   └── users.db         # created automatically on first run
└── README.md
```

## Notes on scope

Auth, a user database, and Docker are more infrastructure than a markdown-to-HTML tool strictly needs — they're here because I wanted per-user persistence for drafts/settings and to practice wiring up JWT auth end-to-end, not because the converter itself requires them. If you just want the conversion logic, `app.py`'s `/api/convert` route and the `markdown`/`bleach` pipeline are the part that matters; the rest can be stripped out.

Not yet done, and worth doing before relying on this anywhere public: rate limiting on auth/convert endpoints, HTTPS termination in front of it, and moving schema changes to Flask-Migrate instead of `create_all()`.

## License

MIT © 2026 vedasm
