from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import markdown
import bleach
import os
import math
import re
import jwt
import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Config
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///users.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET'] = os.environ.get('JWT_SECRET', 'dev-only-change-me-use-env-in-production-32')
app.config['JWT_EXP_DELTA_SECONDS'] = 86400  # 24h

db = SQLAlchemy(app)

# USER MODEL
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# Create tables
with app.app_context():
    db.create_all()

# JWT HELPERS
def create_token(user_id):
    payload = {
        'sub': str(user_id),
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=app.config['JWT_EXP_DELTA_SECONDS'])
    }
    return jwt.encode(payload, app.config['JWT_SECRET'], algorithm='HS256')

def decode_token(token):
    try:
        payload = jwt.decode(token, app.config['JWT_SECRET'], algorithms=['HS256'])
        return int(payload['sub'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid token'}), 401
        token = auth.split(' ')[1]
        user_id = decode_token(token)
        if not user_id:
            return jsonify({'error': 'Token expired or invalid'}), 401
        request.user_id = user_id # type: ignore
        return f(*args, **kwargs)
    return decorated

# ═════════════════════════════════════════════════════════════
# CONFIGURATION
# ═════════════════════════════════════════════════════════════
ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'blockquote', 'ul', 'ol', 'li', 'hr',
    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'dl', 'dt', 'dd', 'sup', 'sub', 'del', 'ins', 'abbr'
]

ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'code': ['class'],
    'th': ['scope'],
    'td': ['colspan', 'rowspan']
}

ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']
HTML_CLEANER = bleach.Cleaner(
    tags=ALLOWED_TAGS,
    attributes=ALLOWED_ATTRIBUTES,
    protocols=ALLOWED_PROTOCOLS,
    strip=True,
    strip_comments=True
)

# FUNCTIONS

def escape_html_attr(text):
    """Escape a string for use in HTML attributes."""
    return (text
        .replace('&', '&amp;')
        .replace('"', '&quot;')
        .replace('<', '&lt;')
        .replace('>', '&gt;'))

def format_bytes(num_bytes):
    """Convert bytes to human-readable format."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1048576:
        return f"{num_bytes / 1024:.1f} KB"
    else:
        return f"{num_bytes / 1048576:.2f} MB"

def calculate_reading_time(text):
    """Estimate reading time (avg 225 wpm for technical content)."""
    words = len(text.strip().split())
    mins = max(1, math.ceil(words / 225))
    return f"~{mins} min read"

def calculate_statistics(markdown_text, html_text):
    """Calculate all statistics for the markdown and HTML."""
    char_count = len(markdown_text)
    word_count = len(markdown_text.split()) if markdown_text.strip() else 0
    line_count = len(markdown_text.split('\n'))
    html_bytes = len(html_text.encode('utf-8'))
    read_time = calculate_reading_time(markdown_text)
    
    return {
        'chars': char_count,
        'words': word_count,
        'lines': line_count,
        'read_time': read_time,
        'html_size': format_bytes(html_bytes)
    }

def sanitize_html(html):
    """Sanitize HTML for XSS prevention."""
    return HTML_CLEANER.clean(html)

def convert_markdown_to_html(md_text):
    """Convert Markdown to compact, semantic, sanitized HTML."""
    md = markdown.Markdown(
        extensions=[
            'extra',
            'nl2br',
            'sane_lists'
        ]
    )
    html = md.convert(md_text)
    return sanitize_html(html)

def extract_title(markdown_text):
    """Extract title from first H1 heading in markdown."""
    lines = markdown_text.split('\n')
    for line in lines:
        if line.startswith('# '):
            return line[2:].strip()
    return 'Blog Post'

def build_document(html, title):
    """Build a complete, self-contained HTML document."""
    escaped_title = escape_html_attr(title)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escaped_title}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html {{ font-size: 16px; -webkit-font-smoothing: antialiased; }}
    body {{
      font-family: 'Lora', Georgia, serif;
      background: #FAFAF8;
      color: #1A1730;
      max-width: 740px;
      margin: 0 auto;
      padding: 48px 24px 80px;
      line-height: 1.8;
    }}
    h1,h2,h3,h4,h5,h6 {{ font-family: 'Lora',serif; font-weight:700; margin:1.8em 0 0.5em; line-height:1.25; letter-spacing:-0.02em; }}
    h1 {{ font-size:2.2rem; margin-top:0; border-bottom:2px solid #E3E1F0; padding-bottom:0.3em; }}
    h2 {{ font-size:1.55rem; border-bottom:1px solid #E3E1F0; padding-bottom:0.25em; }}
    h3 {{ font-size:1.25rem; }} h4 {{ font-size:1.05rem; }} h5 {{ font-size:.95rem; }} h6 {{ font-size:.875rem; color:#5B5878; }}
    p  {{ margin:0 0 1.2em; }}
    a  {{ color:#6C63FF; text-underline-offset:3px; }}
    strong {{ font-weight:700; }} em {{ font-style:italic; color:#5B5878; }}
    ul,ol {{ margin:0 0 1.2em 1.4em; padding-left:1em; }}
    li {{ margin-bottom:.35em; }}
    blockquote {{ margin:1.5em 0; padding:1em 1.2em 1em 1.4em; border-left:4px solid #6C63FF; background:rgba(108,99,255,.08); border-radius:0 8px 8px 0; color:#5B5878; font-style:italic; }}
    blockquote p {{ margin:0; }}
    code:not(pre code) {{ font-family:'JetBrains Mono',monospace; font-size:.82em; background:rgba(108,99,255,.1); color:#6C63FF; padding:.15em .4em; border-radius:4px; }}
    pre {{ background:#1A1730; color:#E8E6FF; border-radius:8px; padding:1.2em 1.4em; overflow-x:auto; margin:1.5em 0; font-family:'JetBrains Mono',monospace; font-size:.82rem; line-height:1.65; }}
    pre code {{ background:transparent; color:inherit; padding:0; }}
    table {{ width:100%; border-collapse:collapse; margin:1.5em 0; font-size:.92rem; border-radius:8px; overflow:hidden; }}
    thead {{ background:#6C63FF; color:#fff; }}
    th {{ padding:10px 14px; font-family:'Inter',sans-serif; font-size:.78rem; font-weight:600; text-align:left; text-transform:uppercase; letter-spacing:.06em; }}
    td {{ padding:9px 14px; border-bottom:1px solid #EDECF5; }}
    tbody tr:nth-child(even) {{ background:#F6F5FB; }}
    hr {{ border:none; height:2px; background:linear-gradient(90deg,rgba(108,99,255,.1),#E3E1F0,rgba(108,99,255,.1)); margin:2.5em 0; }}
    img {{ max-width:100%; height:auto; border-radius:8px; margin:1em 0; }}
  </style>
</head>
<body>
{html}
</body>
</html>'''


# AUTH ENDPOINTS
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({'error': 'Username and password are required'}), 400
    if not re.fullmatch(r'[A-Za-z0-9_]{3,80}', username):
        return jsonify({'error': 'Username must be 3-80 letters, numbers, or underscores'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 400
    user = User(username=username) # type: ignore
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    token = create_token(user.id)
    return jsonify({'token': token, 'username': user.username}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '')
    password = data.get('password', '')
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    user = User.query.filter_by(username=username.strip()).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    token = create_token(user.id)
    return jsonify({'token': token, 'username': user.username}), 200

# API ENDPOINTS

@app.route('/')
def index():
    """Serve the main HTML page."""
    return send_from_directory('.', 'index.html')

@app.route('/api/convert', methods=['POST'])
@token_required
def convert():
    """Convert markdown to HTML and return statistics."""
    data = request.get_json()
    if not data or 'markdown' not in data:
        return jsonify({'error': 'Missing markdown field'}), 400
    
    markdown_text = data['markdown']
    if not isinstance(markdown_text, str):
        return jsonify({'error': 'Markdown must be a string'}), 400
    
    # Handle empty input
    if not markdown_text.strip():
        return jsonify({
            'html': '',
            'stats': {
                'chars': 0,
                'words': 0,
                'lines': 1,
                'read_time': '<1 min read',
                'html_size': '0 B'
            }
        })
    
    # Convert markdown to HTML
    html = convert_markdown_to_html(markdown_text)
    
    # Calculate all statistics
    stats = calculate_statistics(markdown_text, html)
    
    return jsonify({
        'html': html,
        'stats': stats
    })

@app.route('/api/download', methods=['POST'])
@token_required
def download():
    """Generate a complete HTML document for download."""
    data = request.get_json()
    if not data or 'markdown' not in data:
        return jsonify({'error': 'Missing markdown field'}), 400
    
    markdown_text = data['markdown']
    if not isinstance(markdown_text, str):
        return jsonify({'error': 'Markdown must be a string'}), 400
    html = convert_markdown_to_html(markdown_text)
    title = extract_title(markdown_text)
    document = build_document(html, title)
    
    # Create filename from title
    filename = re.sub(r'[^a-z0-9]+', '-', title.lower())
    filename = filename.strip('-')
    filename = filename or 'blog-post'
    
    return jsonify({
        'html': document,
        'filename': f'{filename}.html'
    })


if __name__ == '__main__':
    environment = os.environ.get('FLASK_ENV', 'development').lower()
    port = int(os.environ.get('PORT', '5000'))
    app.run(debug=environment == 'development', host='0.0.0.0', port=port)