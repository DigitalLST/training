// src/services/pdf.js
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

// petit helper local pour libellé décision
function labelDecision(decision) {
  if (decision === 'success') return 'يؤهل';
  if (decision === 'retake') return 'يعيد الدورة';
  if (decision === 'incompatible') return 'لا يناسب الدور';
  return '—';
}
function roleLabelRegion(role) {
  if (role === 'director_reg') return 'قائد الدراسة';
  if (role === 'trainer_reg') return 'مساعد قائد الدراسة';
  if (role === 'assistant_reg') return 'حامل شارة';
  if (role === 'coach_reg') return 'المرشد الفني';
  return role || '';
}

function formatDateArLong(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
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

// ✅ helper date simple (validation CN)
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

function readSignatureDataUrl(signatureUrl) {
  if (!signatureUrl) return null;
  try {
    const rel = String(signatureUrl).replace(/^\//, '');
    const abs = path.join(__dirname, '..', rel);
    if (!fs.existsSync(abs)) {
      console.warn('Signature file not found:', abs);
      return null;
    }
    const buf = fs.readFileSync(abs);
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (err) {
    console.warn('Signature read error:', err.message);
    return null;
  }
}

/**
 * Détecte si on est sur Render/Prod
 * (tu peux ajouter d'autres flags si besoin)
 */
function isProdLike() {
  return (
    process.env.RENDER ||
    process.env.NODE_ENV === 'production' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL
  );
}

/**
 * ✅ Lance un browser compatible Render (Sparticuz chromium)
 * + fallback local si jamais chromium.executablePath() échoue
 */
async function launchBrowser() {
  // Sur Render / prod : on utilise Sparticuz
  if (isProdLike()) {
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
  }

  // Local : Sparticuz marche aussi, mais parfois tu préfères un Chrome installé.
  // On tente Sparticuz d'abord, puis fallback sans executablePath (si tu as un Chrome local détectable).
  try {
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });
  } catch (e) {
    console.warn('chromium.executablePath() failed locally, fallback:', e?.message || e);
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ignoreHTTPSErrors: true,
    });
  }
}

/**
 * @param {object} rawData - data “brut” venant de buildFinalResultsReportData
 * @param {object} opts
 * @param {'full'|'light'} [opts.variant] - default: 'full'
 * @param {boolean} [opts.light] - alias
 */
async function generateFinalResultsPdf(rawData, opts = {}) {
  const variant =
    (opts && opts.variant === 'light') || (opts && opts.light === true) ? 'light' : 'full';

  const templateFile = variant === 'light' ? 'report_light.ejs' : 'report.ejs';
  const templatePath = path.join(__dirname, '..', 'views', templateFile);

  console.log('PDF VARIANT:', variant);
  console.log('TEMPLATE PATH:', templatePath);

  const data = JSON.parse(JSON.stringify(rawData || {}));

  // ✅ light: on neutralise ce qui ne doit pas apparaître
  if (variant === 'light') {
    data.coachReport = null;
    // data.cnPresident = null;
    // data.cnCommissioner = null;
  }

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
    const endStr = session.endDate ? new Date(session.endDate).toLocaleDateString('ar-TN') : '';
    data.periodLine = `من ${startStr} إلى ${endStr}`;
  } else {
    data.periodLine = '';
  }

  data.directorName = director ? `${director.prenom || ''} ${director.nom || ''}`.trim() : '';

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
    if (m.role === 'director') m.roleLabel = 'قائد الدراسة';
    else if (m.role === 'trainer') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'assistant') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'coach') m.roleLabel = 'المرشد الفني';
    else m.roleLabel = m.role || '';

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

    m.signatureDataUrl = null;
    if (m.signatureUrl) {
      m.signatureDataUrl = readSignatureDataUrl(m.signatureUrl);
    }
  });

  // 🔹 Réinjecter nom / prénom / signature dans le rapport directeur & coach
  const directorMember = (data.team || []).find(m => m.role === 'director');
  const coachMember = (data.team || []).find(m => m.role === 'coach');

  if (data.directorReport && directorMember) {
    data.directorReport.prenom = data.directorReport.prenom || directorMember.prenom || '';
    data.directorReport.nom = data.directorReport.nom || directorMember.nom || '';
    data.directorReport.signatureDataUrl =
      data.directorReport.signatureDataUrl || directorMember.signatureDataUrl || null;
  }

  if (variant === 'full' && data.coachReport && coachMember) {
    data.coachReport.prenom = data.coachReport.prenom || coachMember.prenom || '';
    data.coachReport.nom = data.coachReport.nom || coachMember.nom || '';
    data.coachReport.signatureDataUrl =
      data.coachReport.signatureDataUrl || coachMember.signatureDataUrl || null;
  } else {
    data.coachReport = null;
  }

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
  if (data.directorReport) {
    const fullName = `${data.directorReport.prenom || ''} ${data.directorReport.nom || ''}`.trim();
    data.directorReport.fullName = fullName || data.directorName || '';
    const dt = formatDateTimeAr(data.directorReport.signedAt);
    data.directorReport.signedAtText = dt ? dt.full : null;
  }

  if (variant === 'full' && data.coachReport) {
    const fullName = `${data.coachReport.prenom || ''} ${data.coachReport.nom || ''}`.trim();
    data.coachReport.fullName = fullName || '';
    const dt = formatDateTimeAr(data.coachReport.signedAt);
    data.coachReport.signedAtText = dt ? dt.full : null;
  }

  // Trier résultats finaux par région (puis nom/prenom pour stabilité)
  const regionRank = r => (r == null ? 'ZZZ' : String(r).trim() || 'ZZZ');

  data.trainees = (data.trainees || []).slice().sort((a, b) => {
    const ra = regionRank(a.region).localeCompare(regionRank(b.region), 'ar', {
      sensitivity: 'base',
    });
    if (ra !== 0) return ra;

    const ln = String(a.nom || '').localeCompare(String(b.nom || ''), 'ar', {
      sensitivity: 'base',
    });
    if (ln !== 0) return ln;

    return String(a.prenom || '').localeCompare(String(b.prenom || ''), 'ar', {
      sensitivity: 'base',
    });
  });

  // ✅ CN president/commissioner (date + signature base64)
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

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Important: attends le chargement (fonts/images base64 ok)
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    console.log('PDF BUFFER SIZE:', pdfBuffer.length);
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
async function generatePdfFromTemplate(rawData, templateFile) {
  const templatePath = path.join(__dirname, '..', 'views', templateFile);

  const data = JSON.parse(JSON.stringify(rawData || {}));

  // ---- Reprend l’enrichissement “commun” (copie de ce que tu fais déjà) ----
  const session = data.session || {};
  const formation = data.formation || {};
  const director = data.director || null;

  data.sessionTitle = session.title || 'الدورة';
  data.formationTitle = formation.nom || '';
  data.centreLine = `${formation.centreTitle || ''}${
    formation.centreRegion ? ' - ' + formation.centreRegion : ''
  }`;

  if (session.startDate || session.endDate) {
    const startStr = session.startDate ? new Date(session.startDate).toLocaleDateString('ar-TN') : '';
    const endStr = session.endDate ? new Date(session.endDate).toLocaleDateString('ar-TN') : '';
    data.periodLine = `من ${startStr} إلى ${endStr}`;
  } else {
    data.periodLine = '';
  }

  data.directorName = director ? `${director.prenom || ''} ${director.nom || ''}`.trim() : '';

  // logo
  let logoDataUrl = null;
  try {
    const logoAbs = path.join(__dirname, '..', 'public', 'fonts', 'logo.png');
    const logoBuf = fs.readFileSync(logoAbs);
    logoDataUrl = 'data:image/png;base64,' + logoBuf.toString('base64');
  } catch (err) {}
  data.logoDataUrl = logoDataUrl;

  // team roleLabel + signatures
  (data.team || []).forEach(m => {
    if (m.role === 'director') m.roleLabel = 'قائد الدراسة';
    else if (m.role === 'trainer') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'assistant') m.roleLabel = 'مساعد قائد الدراسة';
    else if (m.role === 'coach') m.roleLabel = 'المرشد الفني';
    else m.roleLabel = m.role || '';

    if (m.lastApprovedAt) {
      const d = new Date(m.lastApprovedAt);
      m.lastApprovedAtText = d.toLocaleDateString('ar-TN', { year:'numeric', month:'2-digit', day:'2-digit' });
    } else {
      m.lastApprovedAtText = '';
    }

    m.signatureDataUrl = m.signatureUrl ? readSignatureDataUrl(m.signatureUrl) : null;
  });

  // CN signatures (comme chez toi)
  if (data.cnPresident) {
    data.cnPresident.validatedAtText = toDateStrAr(data.cnPresident.validatedAt);
    data.cnPresident.signatureDataUrl = readSignatureDataUrl(data.cnPresident.signatureUrl);
  }
  if (data.cnCommissioner) {
    data.cnCommissioner.validatedAtText = toDateStrAr(data.cnCommissioner.validatedAt);
    data.cnCommissioner.signatureDataUrl = readSignatureDataUrl(data.cnCommissioner.signatureUrl);
  }

  // ---- Render / PDF ----
  const html = await ejs.renderFile(templatePath, data, { async: true });

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
async function generateRegionResultsPdf(rawData) {
  const templatePath = path.join(__dirname, '..', 'views', 'report_region.ejs');
  const data = JSON.parse(JSON.stringify(rawData || {}));

  // session / formation
  data.sessionTitle = data.sessionTitle || data.session?.title || 'الدورة';
  data.formationTitle = data.formationTitle || data.formation?.nom || '';

  // centre
  if (!data.centreLine) {
    const centreTitle = data.formation?.centreTitle || data.formation?.centre?.title || '';
    const centreRegion = data.formation?.centreRegion || data.formation?.centre?.region || '';
    data.centreLine = `${centreTitle}${centreRegion ? ' - ' + centreRegion : ''}`;
  }

  // période
  if (!data.periodLine) {
    const startDate = data.session?.startDate || null;
    const endDate = data.session?.endDate || null;
    const startStr = formatDateArLong(startDate);
    const endStr = formatDateArLong(endDate);

    if (startStr && endStr) data.periodLine = `${startStr} - ${endStr}`;
    else if (startStr) data.periodLine = `من ${startStr}`;
    else if (endStr) data.periodLine = `إلى ${endStr}`;
    else data.periodLine = '';
  }

  // logo
  if (!data.logoDataUrl) {
    try {
      const logoAbs = path.join(__dirname, '..', 'public', 'fonts', 'logo.png');
      const logoBuf = fs.readFileSync(logoAbs);
      data.logoDataUrl = 'data:image/png;base64,' + logoBuf.toString('base64');
    } catch (err) {
      data.logoDataUrl = null;
    }
  }

  // team regional labels
  data.team = (data.team || []).map(m => ({
    ...m,
    roleLabel: m.roleLabel || roleLabelRegion(m.role),
  }));

  // sécurisation trainees
  data.trainees = (data.trainees || []).map(t => ({
    idScout: t.idScout || '',
    prenom: t.prenom || '',
    nom: t.nom || '',
    region: t.region || '',
    email: t.email || '',
  }));

  const html = await ejs.renderFile(templatePath, data, { async: true });

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generateFinalResultsPdf, generatePdfFromTemplate,generateRegionResultsPdf };
