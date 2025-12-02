// backend/src/services/pdf.js
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

// petit helper local pour libellé décision
function labelDecision(decision) {
  if (decision === 'success') return 'يجاز';
  if (decision === 'retake') return 'يعيد الدورة';
  if (decision === 'incompatible') return 'لا يصلح للدور';
  return '—';
}

async function generateFinalResultsPdf(rawData) {
  const templatePath = path.join(__dirname, '..', 'views', 'report.ejs');
  console.log('TEMPLATE PATH:', templatePath);

  // On clone pour ne pas muter l’original
  const data = JSON.parse(JSON.stringify(rawData));

  // --------- Enrichissement des données pour le template ---------

  const session = data.session || {};
  const formation = data.formation || {};
  const director = data.director || null;

  data.sessionTitle = session.title || 'الدورة';
  data.formationTitle = formation.nom || '';
  data.centreLine = `${formation.centreTitle || ''}${
    formation.centreRegion ? ' - ' + formation.centreRegion : ''
  }`;

  if (session.startDate || session.endDate) {
    const startStr = session.startDate
      ? new Date(session.startDate).toLocaleDateString('ar-TN')
      : '';
    const endStr = session.endDate
      ? new Date(session.endDate).toLocaleDateString('ar-TN')
      : '';
    data.periodLine = `من ${startStr} إلى ${endStr}`;
  } else {
    data.periodLine = '';
  }

  data.directorName = director
    ? `${director.prenom || ''} ${director.nom || ''}`.trim()
    : '';

  // 🔹 Logo => data URL base64
  let logoDataUrl = null;
  try {
    const logoAbs = path.join(__dirname, '..', 'public', 'fonts', 'logo.png');
    const logoBuf = fs.readFileSync(logoAbs);
    logoDataUrl = 'data:image/png;base64,' + logoBuf.toString('base64');
  } catch (err) {
    console.warn('Logo not found or unreadable:', err.message);
  }
  data.logoDataUrl = logoDataUrl;

  // 🔹 Team : rôle + signature en base64
  (data.team || []).forEach(m => {
    m.roleLabel = m.role === 'director' ? 'قائد الدراسة' : 'مساعد قائد الدراسة';

    // date d’approbation lisible
    if (m.lastApprovedAt) {
      const d = new Date(m.lastApprovedAt);
      m.lastApprovedAtText = d.toLocaleDateString('ar-TN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } else {
      m.lastApprovedAtText = '';
    }

    // signature en base64 si dispo
    m.signatureDataUrl = null;
    if (m.signatureUrl) {
      try {
        const rel = m.signatureUrl.replace(/^\//, ''); // "uploads/..."
        const abs = path.join(__dirname, '..', rel);   // backend/src + rel
        if (fs.existsSync(abs)) {
          const sigBuf = fs.readFileSync(abs);
          m.signatureDataUrl =
            'data:image/png;base64,' + sigBuf.toString('base64');
        } else {
          console.warn('Signature file not found:', abs);
        }
      } catch (err) {
        console.warn('Error reading signature:', err.message);
      }
    }
  });

  // 🔹 Trainees : labels + lignes détaillées (groupées par famille)
  (data.trainees || []).forEach(t => {
    t.decisionLabel = labelDecision(t.decision);
    t.pct = t.pct || 0;

    const ev = t.evaluation || {};
    const items = Array.isArray(ev.items) ? ev.items : [];

    // Normalisation des lignes
    const flatRows = items.map(it => ({
      famille: it.familleLabel || it.famille || '',
      critere: it.critereLabel || it.critere || '',
      note:
        it.note !== undefined && it.note !== null
          ? String(it.note)
          : '',
      maxnote:
        it.maxnote !== undefined && it.maxnote !== null
          ? String(it.maxnote)
          : '',
    }));

    // Groupement par famille (en respectant l’ordre)
    const groups = [];
    flatRows.forEach(row => {
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.famille !== row.famille) {
        groups.push({
          famille: row.famille,
          rows: [],
        });
      }
      groups[groups.length - 1].rows.push({
        critere: row.critere,
        note: row.note,
        maxnote: row.maxnote,
      });
    });

    // Pour le template
    t.evaluationRows = flatRows;   // si tu veux garder la version “flat”
    t.evaluationGroups = groups;   // pour le rowspan dans report.ejs
  });

  // 🔹 Phrase de validation globale
  if (data.stats && data.stats.validationDate) {
    const d = new Date(data.stats.validationDate);
    const dateStr = d.toLocaleDateString('ar-TN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeStr = d.toLocaleTimeString('ar-TN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    data.validationSentence = `تمت المصادقة على النتائج يوم ${dateStr} على الساعة ${timeStr}`;
  } else {
    data.validationSentence = '';
  }

  // --------- Render HTML ---------

  const html = await ejs.renderFile(templatePath, data, { async: true });
  console.log('HTML LENGTH:', html.length);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });

  console.log('PDF BUFFER SIZE:', pdfBuffer.length);

  await browser.close();
  return pdfBuffer;
}

module.exports = { generateFinalResultsPdf };
