/**
 * Génération de devis structuré via API OpenAI-compatible (Groq, OpenAI, xAI…).
 * Fallback mock si aucune clé.
 */
const { computeTaxes } = require('./taxes');

function assembleKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20) return;
  const parts = [];
  for (let i = 0; i < 20; i++) {
    const p = process.env['OPENAI_API_KEY_P' + i];
    if (!p) break;
    parts.push(p);
  }
  if (parts.length) process.env.OPENAI_API_KEY = parts.join('');
}

assembleKey();

const API_BASE = (process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const MODEL = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile';

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 10);
}

const SYSTEM = `Tu es DevisNord, expert en devis pour artisans solo du Québec (déneigement, entretien, petite rénovation, paysagement).
À partir des notes du technicien (et éventuellement une description de photo), tu produis UNIQUEMENT un JSON valide (pas de markdown, pas de texte autour) avec ce schéma :
{
  "clientName": "string",
  "clientAddress": "string",
  "clientPhone": "string",
  "title": "string court décrivant le travail",
  "items": [
    { "description": "string", "qty": number, "unit": "h|forfait|m2|visite|unité", "unitPrice": number }
  ],
  "notes": "string (conditions, accès, délais)",
  "conditions": "Validité 30 jours. Travaux selon disponibilité. Matériaux et taxes en sus si non inclus.",
  "validDays": 30
}
Règles :
- Prix en CAD, réalistes pour la région de Québec.
- Quantités et prix unitaires numériques (pas de strings).
- Si info manquante, estime raisonnablement et note-le dans "notes".
- Langue : français québécois professionnel (vouvoiement).
- 2 à 6 lignes d'items maximum.`;

function mockDevis(notes, imageDescription) {
  const text = `${notes || ''} ${imageDescription || ''}`.toLowerCase();
  let items = [];
  let title = 'Devis de services';
  let clientName = 'Client';

  if (/d[eé]neig|neige|entr[eé]e|stationnement/.test(text)) {
    title = 'Déneigement — saison / visite';
    items = [
      { description: 'Déneigement entrée et stationnement', qty: 1, unit: 'visite', unitPrice: 45 },
      { description: 'Épandage abrasif / sel (si requis)', qty: 1, unit: 'forfait', unitPrice: 15 },
    ];
  } else if (/pelouse|tonte|gazon|entretien/.test(text)) {
    title = 'Entretien extérieur';
    items = [
      { description: 'Tonte de pelouse', qty: 1, unit: 'visite', unitPrice: 40 },
      { description: 'Taille de haies / bordures', qty: 1, unit: 'h', unitPrice: 55 },
    ];
  } else if (/r[eé]nov|peinture|plomber|atelier|r[eé]paration/.test(text)) {
    title = 'Petite rénovation / réparation';
    items = [
      { description: 'Main-d\'œuvre qualifiée', qty: 3, unit: 'h', unitPrice: 65 },
      { description: 'Matériaux et fournitures (estimé)', qty: 1, unit: 'forfait', unitPrice: 120 },
    ];
  } else {
    items = [
      { description: 'Service selon description fournie', qty: 1, unit: 'forfait', unitPrice: 150 },
      { description: 'Déplacement / mise en place', qty: 1, unit: 'forfait', unitPrice: 35 },
    ];
  }

  const notesOut =
    (notes ? `Notes : ${notes.slice(0, 400)}` : 'Devis généré en mode démo (aucune clé IA).') +
    (imageDescription ? `\nPhoto : ${imageDescription.slice(0, 200)}` : '');

  return {
    clientName,
    clientAddress: '',
    clientPhone: '',
    title,
    items,
    notes: notesOut,
    conditions:
      'Validité 30 jours. Travaux selon disponibilité. Prix en CAD. TPS et TVQ en sus. Mode démo — configurez OPENAI_API_KEY pour l\'IA réelle.',
    validDays: 30,
    _mock: true,
  };
}

function extractJson(text) {
  if (!text) throw new Error('Réponse IA vide');
  let t = text.trim();
  // strip markdown fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

async function generateDevis({ notes, imageDescription, companyName }) {
  if (!hasApiKey()) {
    const d = mockDevis(notes, imageDescription);
    return finalize(d, companyName);
  }

  const userContent = [
    `Notes du technicien :\n${notes || '(aucune)'}`,
    imageDescription ? `Description / contexte photo :\n${imageDescription}` : null,
    companyName ? `Entreprise émettrice : ${companyName}` : null,
    'Réponds uniquement avec le JSON du devis.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('AI error', res.status, errText.slice(0, 400));
    // graceful fallback
    const d = mockDevis(notes, imageDescription);
    d.notes = (d.notes || '') + `\n(IA indisponible ${res.status} — devis estimatif)`;
    return finalize(d, companyName);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = extractJson(content);
  } catch (e) {
    console.error('JSON parse fail', e.message, content.slice(0, 300));
    const d = mockDevis(notes, imageDescription);
    return finalize(d, companyName);
  }
  return finalize(parsed, companyName);
}

function finalize(raw, companyName) {
  const items = (raw.items || []).map((it) => ({
    description: String(it.description || 'Item'),
    qty: Number(it.qty) || 1,
    unit: String(it.unit || 'forfait'),
    unitPrice: Number(it.unitPrice) || 0,
  }));
  const taxes = computeTaxes(items);
  return {
    clientName: raw.clientName || 'Client',
    clientAddress: raw.clientAddress || '',
    clientPhone: raw.clientPhone || '',
    title: raw.title || 'Devis',
    items,
    notes: raw.notes || '',
    conditions:
      raw.conditions ||
      'Validité 30 jours. Travaux selon disponibilité. Prix en dollars canadiens. TPS 5 % et TVQ 9,975 % applicables.',
    validDays: Number(raw.validDays) || 30,
    companyName: companyName || '',
    taxes,
    currency: 'CAD',
    _mock: Boolean(raw._mock),
    model: hasApiKey() ? MODEL : 'mock',
  };
}

module.exports = { generateDevis, hasApiKey, assembleKey, MODEL, API_BASE };
