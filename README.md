# M2H

A split-screen Markdown editor. Type on the left, watch clean HTML show up on the right, and export it when you're happy with it. I built it because I kept writing blog drafts in Markdown and then hand-copying them into some online converter to get HTML I could paste into a CMS — this just does that in one place, with a couple of things thrown in that I actually wanted for myself while writing (an outline panel, and a word-goal tracker).

![Editor — light mode](./screenshots/editor.png)
![Editor — dark mode](./screenshots/editor-dark.png)

## What's in it

- **Live preview.** Markdown on the left turns into HTML on the right as you type (short debounce, not instant, so it doesn't hammer the server on every keystroke).
- **Outline panel.** Click "Outline" and every heading in your post shows up as a clickable list, indented by level, so you can jump around a long draft instead of scrolling through it. This runs client-side against whatever the preview just rendered — no extra request.
- **Word goal + streak.** Click the small text under the editor to set a word target for whatever you're writing. A progress bar fills in as you type, and if you hit the target for the first time that day it counts toward a streak (stored in `localStorage`, resets if you miss a day). Mostly an excuse to make writing feel a bit more like a game.
- **Copy / download.** Copy the rendered HTML straight to your clipboard, or download it as a self-contained `.html` file (the CSS for the exported page is inlined server-side, so the file opens fine on its own).
- **Sanitised output.** Everything that comes back from the Markdown parser goes through `bleach` with an explicit tag/attribute allowlist before it ever reaches the page, so a stray `<script>` in your draft (or something pasted in) can't run.
- **Accounts.** Basic username/password auth with JWTs, mainly so the app has a reason to know who's writing — right now it just gates access to the editor, but it's the seam I'd build per-user draft storage on top of later.
- **Dark mode, auto-save, resizable panes, keyboard shortcuts.** The usual editor-quality-of-life stuff — theme and draft persist in `localStorage`, the split between the two panes is draggable and remembers your preferred ratio, and `Ctrl/Cmd+B/I/K` do what you'd expect.

## Stack

Backend is Flask — `markdown` for parsing, `bleach` for sanitising the output, `Flask-SQLAlchemy` + `PyJWT` for the login system. Frontend is plain HTML/CSS/JS, no build step and no framework; I wanted the whole thing to be readable by opening the files, not by running a bundler first.

## Running it

```bash
git clone https://github.com/vedasm/M2H.git
cd M2H

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

pip install -r requirements.txt
python app.py
```

Then open `http://localhost:5000`. Flask serves the page at `/` and the API under `/api/*`; there's no separate frontend server to run.

By default it stores users in a local SQLite file (`users.db`, created automatically on first run). Set `JWT_SECRET` before you do anything real with it — the fallback in `app.py` is fine for poking around locally but not for anything you'd share:

```bash
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
```

Other environment variables it reads: `DATABASE_URL` (any SQLAlchemy URL, defaults to the SQLite file above — also picks up `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` if you're pointing it at Turso), `FLASK_ENV`, and `PORT`.

## API, briefly

Everything except `/api/register` and `/api/login` expects `Authorization: Bearer <token>`.

| Method | Path             | Body                          | Returns                                    |
| ------ | ---------------- | ------------------------------| ------------------------------------------ |
| POST   | `/api/register`  | `{ username, password }`      | `{ token, username }`                      |
| POST   | `/api/login`      | `{ username, password }`     | `{ token, username }`                      |
| POST   | `/api/convert`    | `{ markdown }`                | `{ html, stats }`                          |
| POST   | `/api/download`   | `{ markdown }`                | `{ html, filename }` — full standalone doc |

Usernames are 3–80 characters, letters/numbers/underscores only; passwords need at least 8 characters. `stats` in the convert response is character/word/line counts, an estimated reading time, and the size of the generated HTML — that's what feeds the counters under the editor.

## Deploying

`vercel.json` and `api/index.py` are there so this can be dropped onto Vercel as-is (`api/index.py` just imports the Flask app so Vercel's Python runtime can find it). If you're hosting it somewhere that isn't serverless, `python app.py` behind any WSGI server works the same way.

## Project layout

```
.
├── app.py            # Flask app: auth, markdown → HTML, sanitisation, stats
├── api/index.py       # thin entry point for Vercel's Python runtime
├── app.js             # editor UI, live preview, outline, goal/streak, auth UI
├── index.html         # the page itself
├── styles.css         # theming and layout
├── vercel.json
└── requirements.txt
```

## Known rough edges

- No rate limiting on `/api/login` or `/api/convert` yet — fine for personal use, not for putting in front of strangers.
- Drafts live in `localStorage`, not per-account server-side storage, so switching browsers loses your draft even though you're logged in on both. Accounts currently just gate the editor rather than syncing anything.
- No test suite yet.

## License

MIT © 2026 vedasm
