const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

// petit helper local pour libellé décision
function labelDecision(decision) {
  if (decision === 'success') return 'يؤهل';
  if (decision === 'retake') return 'يعيد الدورة';
  if (decision === 'incompatible') return '  لا يناسب الدور';
  return '—';
}

// helper pour formater date+heure en arabe
function formatDateTimeAr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dateStr = d.toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeStr = d.toLocaleTimeString('ar-TN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return { dateStr, timeStr, full: `تم الإمضاء يوم ${dateStr} على الساعة ${timeStr}` };
}

// ✅ AJOUT: helper date simple (validation CN)
function toDateStrAr(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
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

  // 🔹 Team : rôle + signature en base64 + assistantName + coachName
  let assistantName = '';
  let coachName = '';

  (data.team || []).forEach(m => {
    // Libellé du rôle
    if (m.role === 'director') m.roleLabel = 'قائد الدراسة';
    else if (m.role === 'trainer') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'assistant') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'coach') m.roleLabel = 'المرشد الفني';
    else m.roleLabel = m.role || '';

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
          m.signatureDataUrl = 'data:image/png;base64,' + sigBuf.toString('base64');
        } else {
          console.warn('Signature file not found:', abs);
        }
      } catch (err) {
        console.warn('Error reading signature:', err.message);
      }
    }
  });

  // 🔹 Réinjecter nom / prénom / signature dans les rapports directorReport & coachReport
  const directorMember = (data.team || []).find(m => m.role === 'director');
  const coachMember = (data.team || []).find(m => m.role === 'coach');

  if (data.directorReport && directorMember) {
    data.directorReport.prenom = data.directorReport.prenom || directorMember.prenom || '';
    data.directorReport.nom = data.directorReport.nom || directorMember.nom || '';
    data.directorReport.signatureDataUrl =
      data.directorReport.signatureDataUrl || directorMember.signatureDataUrl || null;
  }

  if (data.coachReport && coachMember) {
    data.coachReport.prenom = data.coachReport.prenom || coachMember.prenom || '';
    data.coachReport.nom = data.coachReport.nom || coachMember.nom || '';
    data.coachReport.signatureDataUrl =
      data.coachReport.signatureDataUrl || coachMember.signatureDataUrl || null;
  }

  data.assistantName = assistantName || '';
  data.coachName = coachName || '';

  // 🔹 Trainees : labels + lignes détaillées (groupées par famille)
  (data.trainees || []).forEach(t => {
    t.decisionLabel = labelDecision(t.decision);
    t.pct = t.pct || 0;

    const ev = t.evaluation || {};
    const items = Array.isArray(ev.items) ? ev.items : [];

    const flatRows = items.map(it => ({
      famille: it.familleLabel || it.famille || '',
      critere: it.critereLabel || it.critere || '',
      note: it.note !== undefined && it.note !== null ? String(it.note) : '',
      maxnote: it.maxnote !== undefined && it.maxnote !== null ? String(it.maxnote) : '',
    }));

    const groups = [];
    flatRows.forEach(row => {
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.famille !== row.famille) {
        groups.push({ famille: row.famille, rows: [] });
      }
      groups[groups.length - 1].rows.push({
        critere: row.critere,
        note: row.note,
        maxnote: row.maxnote,
      });
    });

    t.evaluationRows = flatRows;
    t.evaluationGroups = groups;
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

  // 🔹 Rapports directeur / coach
  let directorReport = data.directorReport || null;
  let coachReport = data.coachReport || null;

  if (directorReport) {
    const fullName = `${directorReport.prenom || ''} ${directorReport.nom || ''}`.trim();
    directorReport.fullName = fullName || data.directorName || '';
    const dt = formatDateTimeAr(directorReport.signedAt);
    directorReport.signedAtText = dt ? dt.full : null;
  }

  if (coachReport) {
    const fullName = `${coachReport.prenom || ''} ${coachReport.nom || ''}`.trim();
    coachReport.fullName = fullName || data.coachName || '';
    const dt = formatDateTimeAr(coachReport.signedAt);
    coachReport.signedAtText = dt ? dt.full : null;
  }

  data.directorReport = directorReport;
  data.coachReport = coachReport;

  // Trier résultats finaux par région (puis nom/prenom pour stabilité)
  const regionRank = (r) => (r == null ? 'ZZZ' : String(r).trim() || 'ZZZ');

  data.trainees = (data.trainees || []).slice().sort((a, b) => {
    const ra = regionRank(a.region).localeCompare(regionRank(b.region), 'ar', { sensitivity: 'base' });
    if (ra !== 0) return ra;

    const ln = String(a.nom || '').localeCompare(String(b.nom || ''), 'ar', { sensitivity: 'base' });
    if (ln !== 0) return ln;

    return String(a.prenom || '').localeCompare(String(b.prenom || ''), 'ar', { sensitivity: 'base' });
  });

  // ✅ AJOUT: CN president/commissioner (date + signature base64)
  function readSignatureDataUrl(signatureUrl) {
    if (!signatureUrl) return null;
    try {
      const rel = String(signatureUrl).replace(/^\//, '');
      const abs = path.join(__dirname, '..', rel);
      if (!fs.existsSync(abs)) {
        console.warn('CN signature file not found:', abs);
        return null;
      }
      const buf = fs.readFileSync(abs);
      return 'data:image/png;base64,' + buf.toString('base64');
    } catch (err) {
      console.warn('CN signature read error:', err.message);
      return null;
    }
  }

  if (data.cnPresident) {
    data.cnPresident.validatedAtText = toDateStrAr(data.cnPresident.validatedAt);
    data.cnPresident.signatureDataUrl = readSignatureDataUrl(data.cnPresident.signatureUrl);
  }
  if (data.cnCommissioner) {
    data.cnCommissioner.validatedAtText = toDateStrAr(data.cnCommissioner.validatedAt);
    data.cnCommissioner.signatureDataUrl = readSignatureDataUrl(data.cnCommissioner.signatureUrl);
  }

  // --------- Render HTML ---------
  const html = await ejs.renderFile(templatePath, data, { async: true });
  console.log('HTML LENGTH:', html.length);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
