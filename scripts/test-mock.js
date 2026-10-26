/** Test local sans serveur : taxes + mock AI + PDF */
const { computeTaxes } = require('../lib/taxes');
const { generateDevis } = require('../lib/ai');
const { buildDevisPdf } = require('../lib/pdf');
const fs = require('fs');
const path = require('path');

async function main() {
  const taxes = computeTaxes([
    { qty: 1, unitPrice: 45 },
    { qty: 1, unitPrice: 15 },
  ]);
  console.log('taxes', taxes);
  if (taxes.tps !== 3 || Math.abs(taxes.tvq - 5.99) > 0.02) {
    console.error('FAIL taxes');
    process.exit(1);
  }

  // force mock path by temporarily clearing key? generateDevis uses env — call with key present still ok
  const devis = await generateDevis({
    notes: 'Déneigement entrée 2 voitures Sainte-Foy 3x semaine',
    companyName: 'Nordet Déneigement',
  });
  console.log('devis title', devis.title, 'items', devis.items.length, 'total', devis.taxes.total, 'mock?', devis._mock);

  const buf = await buildDevisPdf(
    { ...devis, number: 'DN-TEST-001', createdAt: new Date().toISOString() },
    { name: 'Nordet Déneigement', address: 'Québec', phone: '418-555-0100', email: 'info@exemple.ca' }
  );
  const out = path.join(__dirname, '..', 'data', 'test-devis.pdf');
  fs.writeFileSync(out, buf);
  console.log('PDF bytes', buf.length, '->', out);
  if (buf.length < 500) process.exit(1);
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
