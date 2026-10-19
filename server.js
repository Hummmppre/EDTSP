require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');

/* ---------- Settings ---------- */
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_SECRET,
  ADMIN_SIGNUP_CODE,
  PORT = 3000,
  NODE_ENV
} = process.env;

const ROOT = __dirname;
const TRAINEE_LOGIN_PAGE = '/src/traineelogin.html';
const ADMIN_LOGIN_PAGE = '/src/adminlogin.html';
const isProd = NODE_ENV === 'production';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET || !ADMIN_SIGNUP_CODE) {
  console.error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET or ADMIN_SIGNUP_CODE in .env');
  process.exit(1);
}

/* ---------- Tiny user "database" (JSON file) ---------- */
const DB_FILE = path.join(ROOT, 'data', 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (err) { return []; }
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

const roleOf = u => u.role || 'trainee';

const publicUser = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  picture: u.picture || '',
  role: roleOf(u)
});

function findOrCreateGoogleUser(profile) {
  const users = loadUsers();
  let user =
    users.find(u => u.googleId === profile.sub) ||
    users.find(u => u.email === profile.email);

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      role: 'trainee',
      googleId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture || '',
      createdAt: new Date().toISOString()
    };
    users.push(user);
  } else {
    user.googleId = profile.sub;
    user.picture = profile.picture || user.picture;
  }

  saveUsers(users);
  return user;
}

/* ---------- Helpers ---------- */
const clean = v => (typeof v === 'string' ? v.trim() : '');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const passwordOk = p =>
  typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Z]/.test(p) && /\d/.test(p);

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) if (now > rec.reset) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip);
    if (!rec || now > rec.reset) {
      hits.set(req.ip, { count: 1, reset: now + windowMs });
      return next();
    }
    rec.count++;
    if (rec.count > max) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

function startSession(req, res, user) {
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start your session.' });
    req.session.userId = user.id;
    res.json({ ok: true, user: publicUser(user) });
  });
}

/* ---------- App setup ---------- */
const app = express();
if (isProd) app.set('trust proxy', 1);

app.use(express.json());
app.use(session({
  name: 'esperon.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

function requireRole(role, loginPage) {
  return (req, res, next) => {
    const user = req.session.userId && loadUsers().find(u => u.id === req.session.userId);
    if (user && (!role || roleOf(user) === role)) {
      req.user = user;
      return next();
    }
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(user ? 403 : 401).json({ error: user ? 'Not allowed.' : 'Not logged in.' });
    }
    res.redirect(loginPage || TRAINEE_LOGIN_PAGE);
  };
}

/* ---------- Google sign-in (trainees) ---------- */
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');

app.post('/api/auth/google', async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string' || !code) {
    return res.status(400).json({ error: 'Missing Google code.' });
  }

  try {
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const profile = ticket.getPayload();

    if (!profile.email || !profile.email_verified) {
      return res.status(403).json({ error: 'Your Google email is not verified.' });
    }

    const user = findOrCreateGoogleUser(profile);
    if (roleOf(user) !== 'trainee') {
      return res.status(403).json({ error: 'Administrators must use the administrator login.' });
    }
    startSession(req, res, user);
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

/* ---------- Administrator signup + login ---------- */
/* ---------- Google sign-in (administrators) ---------- */
// Only works for an admin account that already exists (created with the access code)
app.post('/api/admin/google', adminLimiter, async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string' || !code) {
    return res.status(400).json({ error: 'Missing Google code.' });
  }

  try {
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const profile = ticket.getPayload();

    if (!profile.email || !profile.email_verified) {
      return res.status(403).json({ error: 'Your Google email is not verified.' });
    }

    const users = loadUsers();
    const user = users.find(u =>
      roleOf(u) === 'admin' && (u.email || '').toLowerCase() === profile.email.toLowerCase()
    );
    if (!user) {
      return res.status(403).json({ error: 'No administrator account uses this Google email. Create an admin account first.' });
    }

    user.googleId = profile.sub;
    user.picture = profile.picture || user.picture;
    saveUsers(users);
    startSession(req, res, user);
  } catch (err) {
    console.error('Admin Google sign-in failed:', err.message);
    res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

app.post('/api/admin/signup', adminLimiter, async (req, res) => {
  const b = req.body || {};

  if (!safeEqual(clean(b.accessCode), ADMIN_SIGNUP_CODE)) {
    return res.status(403).json({ error: 'Invalid admin access code.' });
  }

  const firstName = clean(b.firstName);
  const lastName = clean(b.lastName);
  const email = clean(b.email).toLowerCase();
  const phone = clean(b.phone);
  const username = clean(b.username);
  const password = typeof b.password === 'string' ? b.password : '';

  if (!firstName || !lastName || !email || !phone || !username || !password) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, . - _).' });
  }
  if (!passwordOk(password)) {
    return res.status(400).json({ error: 'Password needs 8+ characters, one uppercase letter and one number.' });
  }

  const users = loadUsers();
  if (users.some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (users.some(u => (u.email || '').toLowerCase() === email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const user = {
    id: crypto.randomUUID(),
    role: 'admin',
    firstName,
    lastName,
    name: firstName + ' ' + lastName,
    email,
    phone,
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);

  startSession(req, res, user);
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

app.post('/api/admin/login', adminLimiter, async (req, res) => {
  const id = clean((req.body || {}).username).toLowerCase();
  const password = typeof (req.body || {}).password === 'string' ? req.body.password : '';

  if (!id || !password) {
    return res.status(400).json({ error: 'Enter your username or email and your password.' });
  }

  const user = loadUsers().find(u =>
    roleOf(u) === 'admin' &&
    ((u.username || '').toLowerCase() === id || (u.email || '').toLowerCase() === id)
  );

  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  startSession(req, res, user);
});

/* ---------- Session routes ---------- */
app.get('/api/me', requireRole(null), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('esperon.sid');
    res.json({ ok: true });
  });
});

/* ---------- Protected pages (files live in /private, never served directly) ---------- */
app.use('/api/trainee', requireRole('trainee'), require('./routes/trainee'));
app.get('/portal', requireRole('trainee', TRAINEE_LOGIN_PAGE), (req, res) => {
  res.sendFile(path.join(ROOT, 'private', 'portal.html'));
});

app.get('/admin-portal', requireRole('admin', ADMIN_LOGIN_PAGE), (req, res) => {
  res.sendFile(path.join(ROOT, 'private', 'dashboard.html'));
});

/* ---------- Public files ----------
   Only these folders are served, so server.js, .env, data/ and
   package.json can never be downloaded. */
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/img', express.static(path.join(ROOT, 'img')));
app.use('/src', express.static(path.join(ROOT, 'src')));

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => console.log(`Esperon running at http://localhost:${PORT}`));