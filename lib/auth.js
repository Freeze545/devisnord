/**
 * Auth email/mot de passe + cookie de session.
 * MVP : sessions en mémoire + hash bcrypt. Pas de reset email, pas d'OAuth.
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUsers, saveUsers } = require('./store');

const sessions = new Map(); // token -> { userId, email, exp }
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

function findUserByEmail(email) {
  const db = getUsers();
  return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
}

function register(email, password, companyName) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Courriel invalide.' };
  }
  if (!password || String(password).length < 6) {
    return { error: 'Mot de passe : minimum 6 caractères.' };
  }
  if (findUserByEmail(email)) {
    return { error: 'Ce courriel est déjà inscrit.' };
  }
  const db = getUsers();
  const user = {
    id: uuidv4(),
    email,
    passwordHash: bcrypt.hashSync(String(password), 10),
    company: {
      name: companyName || '',
      address: '',
      phone: '',
      email,
      neq: '',
      tps: '',
      tvq: '',
    },
    plan: 'free',
    devisCountMonth: 0,
    devisMonthKey: currentMonthKey(),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  saveUsers(db);
  return { user: publicUser(user) };
}

function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(String(password), user.passwordHash)) {
    return { error: 'Courriel ou mot de passe incorrect.' };
  }
  const token = uuidv4();
  sessions.set(token, {
    userId: user.id,
    email: user.email,
    exp: Date.now() + SESSION_TTL_MS,
  });
  return { token, user: publicUser(user) };
}

function logout(token) {
  if (token) sessions.delete(token);
}

function sessionUser(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) {
    if (s) sessions.delete(token);
    return null;
  }
  const db = getUsers();
  const user = db.users.find((u) => u.id === s.userId);
  return user ? publicUser(user) : null;
}

function getFullUser(userId) {
  const db = getUsers();
  return db.users.find((u) => u.id === userId) || null;
}

function updateUser(userId, patch) {
  const db = getUsers();
  const i = db.users.findIndex((u) => u.id === userId);
  if (i < 0) return null;
  if (patch.company) {
    db.users[i].company = { ...db.users[i].company, ...patch.company };
  }
  if (patch.plan) db.users[i].plan = patch.plan;
  saveUsers(db);
  return publicUser(db.users[i]);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function checkAndIncQuota(userId) {
  const db = getUsers();
  const i = db.users.findIndex((u) => u.id === userId);
  if (i < 0) return { ok: false, error: 'Utilisateur introuvable.' };
  const u = db.users[i];
  const mk = currentMonthKey();
  if (u.devisMonthKey !== mk) {
    u.devisMonthKey = mk;
    u.devisCountMonth = 0;
  }
  const limits = { free: 3, pro: 9999, business: 99999 };
  const limit = limits[u.plan] || 3;
  if (u.devisCountMonth >= limit) {
    return {
      ok: false,
      error: `Limite atteinte (${limit} devis/mois sur le forfait ${u.plan}). Passez à Pro.`,
      limit,
      used: u.devisCountMonth,
    };
  }
  u.devisCountMonth += 1;
  saveUsers(db);
  return { ok: true, used: u.devisCountMonth, limit };
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    company: u.company,
    plan: u.plan || 'free',
    devisCountMonth: u.devisCountMonth || 0,
    devisMonthKey: u.devisMonthKey,
  };
}

const COOKIE = 'dn_session';

function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE] || req.headers['x-session-token'];
  const user = sessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

module.exports = {
  register,
  login,
  logout,
  sessionUser,
  getFullUser,
  updateUser,
  checkAndIncQuota,
  authMiddleware,
  COOKIE,
  SESSION_TTL_MS,
};
