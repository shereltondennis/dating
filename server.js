const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');

ensureDataStore();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch {
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`HeartBridge server running on http://localhost:${PORT}`);
});

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const seedUsers = [
      {
        id: 'seed-1',
        name: 'Maya',
        email: 'maya@example.com',
        country: 'USA',
        interests: ['Yoga', 'Jazz', 'Travel'],
        bio: 'Entrepreneur who enjoys thoughtful conversations.',
      },
      {
        id: 'seed-2',
        name: 'Omar',
        email: 'omar@example.com',
        country: 'Egypt',
        interests: ['Cooking', 'Football', 'Languages'],
        bio: 'Chef looking to connect with curious minds.',
      },
    ].map((user) => {
      const salt = randomToken(8);
      return {
        ...user,
        salt,
        passwordHash: hashPassword('password123', salt),
      };
    });

    fs.writeFileSync(DB_PATH, JSON.stringify({ users: seedUsers, tokens: [], messages: [] }, null, 2), 'utf-8');
  }
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Payload too large'));
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    country: user.country || '',
    interests: user.interests || [],
    bio: user.bio || '',
    photoUrl: user.photoUrl || '',
  };
}

function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function requireAuth(req, res, db) {
  const token = getAuthToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Missing auth token' });
    return null;
  }

  const session = db.tokens.find((entry) => entry.token === token);
  if (!session) {
    sendJson(res, 401, { error: 'Invalid auth token' });
    return null;
  }

  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) {
    sendJson(res, 401, { error: 'User session is invalid' });
    return null;
  }

  return user;
}

async function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await parseBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const country = String(body.country || '').trim();
    const password = String(body.password || '');

    if (!name || !email || !country || password.length < 6) {
      sendJson(res, 400, { error: 'Name, email, country, and password (min 6 chars) are required' });
      return;
    }

    if (db.users.some((user) => user.email.toLowerCase() === email)) {
      sendJson(res, 409, { error: 'Email already registered' });
      return;
    }

    const salt = randomToken(8);
    const user = {
      id: randomToken(8),
      name,
      email,
      country,
      interests: [],
      bio: '',
      photoUrl: '',
      salt,
      passwordHash: hashPassword(password, salt),
    };

    db.users.push(user);
    const token = randomToken(24);
    db.tokens.push({ token, userId: user.id, createdAt: Date.now() });
    writeDb(db);

    sendJson(res, 201, { token, user: publicUser(user) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await parseBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const user = db.users.find((entry) => entry.email.toLowerCase() === email);
    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return;
    }

    const token = randomToken(24);
    db.tokens.push({ token, userId: user.id, createdAt: Date.now() });
    writeDb(db);

    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = requireAuth(req, res, db);
    if (!user) return;
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/me') {
    const user = requireAuth(req, res, db);
    if (!user) return;

    const body = await parseBody(req);
    const name = String(body.name || '').trim();
    const country = String(body.country || '').trim();
    const bio = String(body.bio || '').trim();
    const photoUrl = String(body.photoUrl || '').trim();
    const interests = Array.isArray(body.interests)
      ? body.interests.map((v) => String(v).trim()).filter(Boolean).slice(0, 20)
      : [];

    if (!name || !country) {
      sendJson(res, 400, { error: 'Name and country are required' });
      return;
    }

    if (photoUrl.length > 500) {
      sendJson(res, 400, { error: 'Photo URL is too long' });
      return;
    }

    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
      sendJson(res, 400, { error: 'Photo URL must start with http:// or https://' });
      return;
    }

    user.name = name;
    user.country = country;
    user.bio = bio;
    user.photoUrl = photoUrl;
    user.interests = interests;
    writeDb(db);

    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/members') {
    const user = requireAuth(req, res, db);
    if (!user) return;

    const query = String(url.searchParams.get('query') || '').trim().toLowerCase();
    const country = String(url.searchParams.get('country') || '').trim().toLowerCase();
    const interest = String(url.searchParams.get('interest') || '').trim().toLowerCase();

    let members = db.users.filter((entry) => entry.id !== user.id).map(publicUser);

    if (query) members = members.filter((entry) => entry.name.toLowerCase().includes(query) || entry.bio.toLowerCase().includes(query));
    if (country) members = members.filter((entry) => entry.country.toLowerCase().includes(country));
    if (interest) members = members.filter((entry) => entry.interests.some((v) => v.toLowerCase().includes(interest)));

    sendJson(res, 200, { members });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/messages/')) {
    const user = requireAuth(req, res, db);
    if (!user) return;

    const targetId = url.pathname.replace('/api/messages/', '').trim();
    if (!targetId || !db.users.some((entry) => entry.id === targetId)) {
      sendJson(res, 404, { error: 'Target user not found' });
      return;
    }

    const messages = db.messages
      .filter((m) => (m.fromUserId === user.id && m.toUserId === targetId) || (m.fromUserId === targetId && m.toUserId === user.id))
      .sort((a, b) => a.createdAt - b.createdAt);

    sendJson(res, 200, { messages });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/messages') {
    const user = requireAuth(req, res, db);
    if (!user) return;

    const body = await parseBody(req);
    const toUserId = String(body.toUserId || '').trim();
    const text = String(body.text || '').trim();

    if (!toUserId || !text) {
      sendJson(res, 400, { error: 'Recipient and message text are required' });
      return;
    }

    if (text.length > 1000) {
      sendJson(res, 400, { error: 'Message is too long' });
      return;
    }

    const recipient = db.users.find((entry) => entry.id === toUserId);
    if (!recipient) {
      sendJson(res, 404, { error: 'Recipient not found' });
      return;
    }

    if (recipient.id === user.id) {
      sendJson(res, 400, { error: 'You cannot message yourself' });
      return;
    }

    const message = {
      id: randomToken(8),
      fromUserId: user.id,
      toUserId: recipient.id,
      text,
      createdAt: Date.now(),
    };

    db.messages.push(message);
    writeDb(db);

    sendJson(res, 201, { message });
    return;
  }

  sendJson(res, 404, { error: 'API endpoint not found' });
}

async function serveStatic(res, pathname) {
  let filePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  filePath = path.normalize(filePath).replace(/^([.][.][/\\])+/, '');
  const absolutePath = path.resolve(ROOT_DIR, filePath);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(absolutePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendJson(res, 404, { error: 'File not found' });
        return;
      }
      sendJson(res, 500, { error: 'Failed to read file' });
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}
