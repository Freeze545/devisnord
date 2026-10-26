/**
 * Stockage JSON fichier — MVP léger.
 * Limitation : sur Render free, le disque est éphémère (perdu au redéploiement).
 * Pour la prod : brancher Postgres ou un disque persistant.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  ensureDir();
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  const p = filePath(name);
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  const p = filePath(name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function getUsers() {
  return readJson('users.json', { users: [] });
}

function saveUsers(db) {
  writeJson('users.json', db);
}

function getDevis() {
  return readJson('devis.json', { devis: [] });
}

function saveDevis(db) {
  writeJson('devis.json', db);
}

module.exports = { getUsers, saveUsers, getDevis, saveDevis, DATA_DIR };
