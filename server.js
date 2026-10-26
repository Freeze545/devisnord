/**
 * DevisNord — serveur Express MVP
 * Devis IA mobile pour artisans du Québec (TPS/TVQ, PDF, auth légère).
 */
require('dotenv').config();
const { assembleKey, generateDevis, hasApiKey, MODEL, API_BASE } = require('./lib/ai');
assembleKey();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const {
  register,
  login,
  logout,
  sessionUser,
  updateUser,
  checkAndIncQuota,
  authMiddleware,
  COOKIE,
  SESSION_TTL_MS,
} = require('./lib/auth');
const { getDevis, saveDevis } = require('./lib/store');
const { computeTaxes } = require('./lib/taxes');
const { buildDevisPdf } = require('./lib/pdf');

const app = express();
const PORT = process.env.PORT || 3850;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  });
}

/* ——— Santé ——— */
app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    name: 'DevisNord',
    version: '1.0.0',
    apiConfigured: hasApiKey(),
    model: hasApiKey() ? MODEL : null,
    mode: hasApiKey() ? 'cloud' : 'demo',
    taxes: { tps: 0.05, tvq: 0.09975, currency: 'CAD' },
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')),
    auth: 'email-password (sqlite-less JSON store; ephemeral on free Render)',
  });
});

/* ——— Auth ——— */
app.post('/api/auth/register', (req, res) => {
  const { email, password, companyName } = req.body || {};
  const result = register(email, password, companyName);
  if (result.error) return res.status(400).json(result);
  const loginResult = login(email, password);
  setSessionCookie(res, loginResult.token);
  res.json({ user: loginResult.user, token: loginResult.token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const result = login(email, password);
  if (result.error) return res.status(401).json(result);
  setSessionCookie(res, result.token);
  res.json({ user: result.user, token: result.token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  logout(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[COOKIE] || req.headers['x-session-token'];
  const user = sessionUser(token);
  if (!user) return res.status(401).json({ error: 'Non connecté.' });
  res.json({ user });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const company = req.body?.company || {};
  const user = updateUser(req.user.id, { company });
  res.json({ user });
});

/* ——— Devis ——— */
app.get('/api/devis', authMiddleware, (req, res) => {
  const db = getDevis();
  const list = db.devis
    .filter((d) => d.userId === req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ devis: list });
});

app.get('/api/devis/:id', authMiddleware, (req, res) => {
  const db = getDevis();
  const d = db.devis.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
  res.json({ devis: d });
});

app.post('/api/devis/generate', authMiddleware, async (req, res) => {
  try {
    const { notes, imageDescription, clientName, clientAddress, clientPhone, photoDataUrl } = req.body || {};
    if (!notes && !imageDescription) {
      return res.status(400).json({ error: 'Ajoutez des notes ou une description photo.' });
    }

    const quota = checkAndIncQuota(req.user.id);
    if (!quota.ok) return res.status(402).json(quota);

    const generated = await generateDevis({
      notes,
      imageDescription: imageDescription || (photoDataUrl ? 'Photo jointe (aperçu non analysé côté vision MVP — décrire dans notes).' : ''),
      companyName: req.user.company?.name,
    });

    if (clientName) generated.clientName = clientName;
    if (clientAddress) generated.clientAddress = clientAddress;
    if (clientPhone) generated.clientPhone = clientPhone;

    const id = uuidv4();
    const number = `DN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const record = {
      id,
      number,
      userId: req.user.id,
      ...generated,
      photoAttached: Boolean(photoDataUrl),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const db = getDevis();
    db.devis.push(record);
    saveDevis(db);

    res.json({ devis: record, quota: { used: quota.used, limit: quota.limit }, mode: hasApiKey() ? 'cloud' : 'demo' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la génération du devis.' });
  }
});

app.put('/api/devis/:id', authMiddleware, (req, res) => {
  const db = getDevis();
  const i = db.devis.findIndex((x) => x.id === req.params.id && x.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Devis introuvable.' });
  const patch = req.body || {};
  const allowed = ['clientName', 'clientAddress', 'clientPhone', 'title', 'items', 'notes', 'conditions', 'validDays'];
  for (const k of allowed) {
    if (patch[k] !== undefined) db.devis[i][k] = patch[k];
  }
  if (patch.items) {
    db.devis[i].taxes = computeTaxes(patch.items);
  }
  db.devis[i].updatedAt = new Date().toISOString();
  saveDevis(db);
  res.json({ devis: db.devis[i] });
});

app.delete('/api/devis/:id', authMiddleware, (req, res) => {
  const db = getDevis();
  const before = db.devis.length;
  db.devis = db.devis.filter((x) => !(x.id === req.params.id && x.userId === req.user.id));
  if (db.devis.length === before) return res.status(404).json({ error: 'Devis introuvable.' });
  saveDevis(db);
  res.json({ ok: true });
});

app.get('/api/devis/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const db = getDevis();
    const d = db.devis.find((x) => x.id === req.params.id && x.userId === req.user.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    const buf = await buildDevisPdf(d, req.user.company);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="devis-${d.number || d.id}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur PDF.' });
  }
});

/* ——— Stripe stubs ——— */
app.post('/api/stripe/checkout', authMiddleware, async (req, res) => {
  const plan = (req.body?.plan || 'pro').toLowerCase();
  const secret = process.env.STRIPE_SECRET_KEY || '';
  const pricePro = process.env.STRIPE_PRICE_PRO || '';
  const priceBiz = process.env.STRIPE_PRICE_BUSINESS || '';
  const priceId = plan === 'business' ? priceBiz : pricePro;

  if (!secret || !secret.startsWith('sk_') || !priceId) {
    return res.json({
      stub: true,
      message:
        'Paiements bientôt disponibles. Configurez STRIPE_SECRET_KEY et STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS (mode test Stripe). Aucun montant n\'a été débité.',
      plan,
      instructions: [
        '1. Créer un compte Stripe (dashboard.stripe.com)',
        '2. Mode test → créer produits Pro 29 CAD/mois et Business 79 CAD/mois',
        '3. Copier price_… dans les variables d\'environnement Render',
        '4. Redéployer — le bouton activera Checkout',
      ],
    });
  }

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', process.env.STRIPE_SUCCESS_URL || `${origin}/app.html?paid=1`);
    params.set('cancel_url', process.env.STRIPE_CANCEL_URL || `${origin}/pricing.html?cancel=1`);
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('client_reference_id', req.user.id);
    params.set('customer_email', req.user.email);

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: data.error?.message || 'Stripe erreur', stub: false });
    }
    res.json({ url: data.url, id: data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Impossible de créer la session Stripe.' });
  }
});

/* SPA-ish fallbacks */
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => {
  console.log(`DevisNord http://localhost:${PORT} mode=${hasApiKey() ? 'cloud' : 'demo'} model=${MODEL} base=${API_BASE}`);
});
