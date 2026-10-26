/**
 * Génération PDF devis — pdfkit
 */
const PDFDocument = require('pdfkit');
const { computeTaxes, round2 } = require('./taxes');

function formatMoney(n) {
  return (
    round2(n).toLocaleString('fr-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' $'
  );
}

/**
 * @returns {Promise<Buffer>}
 */
function buildDevisPdf(devis, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const co = company || {};
    const navy = '#0B1F3A';
    const accent = '#1E6BB8';

    // Header
    doc.fillColor(navy).fontSize(22).font('Helvetica-Bold').text('DEVISNORD', { continued: false });
    doc.fillColor(accent).fontSize(10).font('Helvetica').text('Devis professionnel — Québec', { continued: false });
    doc.moveDown(0.5);

    doc.fillColor('#333').fontSize(11);
    if (co.name) doc.font('Helvetica-Bold').text(co.name);
    doc.font('Helvetica');
    if (co.address) doc.text(co.address);
    if (co.phone) doc.text(`Tél. : ${co.phone}`);
    if (co.email) doc.text(co.email);
    if (co.neq) doc.text(`NEQ : ${co.neq}`);
    if (co.tps || co.tvq) {
      doc.text([co.tps ? `TPS : ${co.tps}` : null, co.tvq ? `TVQ : ${co.tvq}` : null].filter(Boolean).join('  ·  '));
    }

    doc.moveDown();
    doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text(devis.title || 'Devis');
    doc.font('Helvetica').fillColor('#555').fontSize(10);
    const num = devis.number || devis.id || '';
    const date = devis.createdAt ? new Date(devis.createdAt).toLocaleDateString('fr-CA') : new Date().toLocaleDateString('fr-CA');
    doc.text(`N° ${num}  ·  Date : ${date}`);
    if (devis.validDays) doc.text(`Validité : ${devis.validDays} jours`);

    doc.moveDown();
    doc.fillColor(navy).fontSize(12).font('Helvetica-Bold').text('Client');
    doc.font('Helvetica').fillColor('#333').fontSize(11);
    doc.text(devis.clientName || 'Client');
    if (devis.clientAddress) doc.text(devis.clientAddress);
    if (devis.clientPhone) doc.text(devis.clientPhone);

    doc.moveDown();
    // Table header
    const items = devis.items || [];
    const startY = doc.y;
    doc.fillColor(accent).rect(50, startY, 512, 22).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    doc.text('Description', 55, startY + 6, { width: 240 });
    doc.text('Qté', 300, startY + 6, { width: 40 });
    doc.text('Unité', 345, startY + 6, { width: 50 });
    doc.text('P.U.', 400, startY + 6, { width: 70 });
    doc.text('Total', 480, startY + 6, { width: 70 });

    let y = startY + 28;
    doc.fillColor('#222').font('Helvetica').fontSize(10);
    items.forEach((it, idx) => {
      if (y > 680) {
        doc.addPage();
        y = 50;
      }
      const lineTotal = round2(Number(it.qty) * Number(it.unitPrice));
      if (idx % 2 === 0) {
        doc.fillColor('#F4F7FB').rect(50, y - 4, 512, 20).fill();
        doc.fillColor('#222');
      }
      doc.text(String(it.description || ''), 55, y, { width: 240 });
      doc.text(String(it.qty), 300, y, { width: 40 });
      doc.text(String(it.unit || ''), 345, y, { width: 50 });
      doc.text(formatMoney(it.unitPrice), 400, y, { width: 70 });
      doc.text(formatMoney(lineTotal), 480, y, { width: 70 });
      y += 22;
    });

    const taxes = devis.taxes || computeTaxes(items);
    y += 10;
    doc.y = y;
    doc.fillColor('#333').fontSize(11);
    const right = (label, val, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(label, 350, doc.y, { width: 100, continued: false });
      const yy = doc.y - 14;
      doc.text(val, 450, yy, { width: 110, align: 'right' });
      doc.moveDown(0.3);
    };
    right('Sous-total', formatMoney(taxes.subtotal));
    right('TPS (5 %)', formatMoney(taxes.tps));
    right('TVQ (9,975 %)', formatMoney(taxes.tvq));
    doc.moveDown(0.2);
    doc.fillColor(navy);
    right('TOTAL CAD', formatMoney(taxes.total), true);

    doc.moveDown();
    if (devis.notes) {
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(11).text('Notes');
      doc.fillColor('#444').font('Helvetica').fontSize(9).text(devis.notes, { width: 500 });
      doc.moveDown(0.5);
    }
    if (devis.conditions) {
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(11).text('Conditions');
      doc.fillColor('#444').font('Helvetica').fontSize(9).text(devis.conditions, { width: 500 });
    }

    doc.moveDown(2);
    doc.fillColor('#888').fontSize(8).text('Document généré par DevisNord — devisnord.app (MVP). Les taxes sont calculées selon TPS 5 % et TVQ 9,975 %.', {
      align: 'center',
      width: 500,
    });

    doc.end();
  });
}

module.exports = { buildDevisPdf, formatMoney };
