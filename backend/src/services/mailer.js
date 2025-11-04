require('dotenv').config();
const nodemailer = require('nodemailer');

const {
  MAIL_HOST = 'smtp.gmail.com',
  MAIL_PORT = '465',
  MAIL_SECURE = 'true',
  MAIL_USER,
  MAIL_PASS,
  MAIL_FROM = '"الكشافة التونسية" <noreplytraininglst@gmail.com>',
  CONTACT_TO,
} = process.env;

const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: Number(MAIL_PORT),
  secure: String(MAIL_SECURE).toLowerCase() === 'true',
  auth: { user: MAIL_USER, pass: MAIL_PASS },
});

// -- helpers
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * Envoie l’email "Contactez-nous"
 * @param {Object} params
 * @param {string} params.subject
 * @param {string} params.text                - corps saisi par l’utilisateur
 * @param {string} [params.email]             - email de l’expéditeur (affiché + replyTo si valide)
 * @param {string} [params.firstName]         - prénom (ou "prenom")
 * @param {string} [params.lastName]          - nom (ou "nom")
 * @param {string} [params.prenom]            - alias de firstName
 * @param {string} [params.nom]               - alias de lastName
 * @param {string} [params.replyTo]           - forcé si tu veux; sinon dérivé de `email` si valide
 * @param {Object} [params.meta]              - { userId, ip, ua, path, at }
 */
async function sendContactUsEmail(params = {}) {
  const {
    subject,
    text,
    email,
    firstName,
    lastName,
    prenom,
    nom,
    replyTo,
    meta = {},
  } = params;

  // normaliser noms
  const fName = (firstName ?? prenom ?? '').trim();
  const lName = (lastName  ?? nom    ?? '').trim();
  const displayName = [fName, lName].filter(Boolean).join(' ').trim();

  // reply-to seulement si email valide (priorité au paramètre explicite)
  const safeReplyTo = replyTo && isValidEmail(replyTo)
    ? replyTo
    : (isValidEmail(email) ? email : undefined);

  // destinataire
  const to = CONTACT_TO || MAIL_USER;

  // HTML
  const infoBlockHtml = `
    <table style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;direction:rtl;text-align:right">
      <tr>
        <td style="padding:2px 0;white-space:nowrap"><b>الاسم:</b></td>
        <td style="padding:2px 8px">${esc(displayName || '—')}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;white-space:nowrap"><b>Email:</b></td>
        <td style="padding:2px 8px">${esc(email || '—')}</td>
      </tr>
    </table>
  `;

  const metaHtml = `
    <div style="color:#6b7280;font-size:12px;margin-top:10px;direction:ltr;text-align:left">
      <div>userId: ${esc(meta.userId || '—')}</div>
      <div>ip: ${esc(meta.ip || '—')}</div>
      <div>ua: ${esc(meta.ua || '—')}</div>
      <div>path: ${esc(meta.path || '—')}</div>
      <div>at: ${esc(meta.at || new Date().toISOString())}</div>
    </div>
  `;

  const html = `
    <div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;direction:rtl;text-align:right">
      <h2 style="margin:0 0 8px">رسالة تواصل جديدة</h2>
      ${infoBlockHtml}
      <hr style="border:none;border-top:1px solid #eee;margin:14px 0" />
      <div><b>الموضوع:</b> ${esc(subject || '')}</div>
      <pre style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:12px;margin-top:8px">${esc(text || '')}</pre>
      ${metaHtml}
    </div>
  `;

  // Texte brut
  const plain = [
    'رسالة تواصل جديدة',
    '',
    `الاسم: ${displayName || '—'}`,
    `Email: ${email || '—'}`,
    '',
    `الموضوع: ${subject || ''}`,
    '',
    (text || ''),
    '',
    `userId: ${meta.userId || '—'}`,
    `ip: ${meta.ip || '—'}`,
    `ua: ${meta.ua || '—'}`,
    `path: ${meta.path || '—'}`,
    `at: ${meta.at || new Date().toISOString()}`,
  ].join('\n');

  try {
    const mail = {
      from: MAIL_FROM,
      to,
      subject: `[Contact] ${subject || ''}${displayName ? ` — ${displayName}` : ''}`,
      text: plain,
      html,
      ...(safeReplyTo ? { replyTo: safeReplyTo } : {}),
      headers: {
        ...(email ? { 'X-Contact-Email': String(email) } : {}),
        ...(displayName ? { 'X-Contact-Name': displayName } : {}),
      },
    };

    const info = await transporter.sendMail(mail);
    console.log('Contact mail sent:', info.response, info.accepted, info.rejected);
    return true;
  } catch (err) {
    console.error('sendContactUsEmail error:', err);
    return false;
  }
}

/**
 * Envoie un mail « Réinitialiser le mot de passe » à l’utilisateur.
 * @param {Object} params
 * @param {string} params.to            - email du destinataire
 * @param {string} params.resetUrl      - URL complète contenant le token (générée côté route /auth/forgot)
 * @param {string} [params.displayName] - nom à afficher (optionnel)
 */
async function sendResetMail({ to, resetUrl, displayName = '' }) {
  try {
    const name = displayName || to;

    const subject = 'إعادة تعيين كلمة السر';
    const text =
`مرحبًا ${name},

لقد طلبت إعادة تعيين كلمة السر. اضغط على الرابط التالي:
${resetUrl}

الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.`;

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;direction:rtl;text-align:right">
        <h2 style="margin:0 0 8px">إعادة تعيين كلمة السر</h2>
        <p>مرحبًا ${esc(name)},</p>
        <p>لقد طلبت إعادة تعيين كلمة السر. اضغط على الزر التالي:</p>
        <p>
          <a href="${esc(resetUrl)}"
             style="display:inline-block;padding:10px 16px;border-radius:8px;background:#e20514;color:#fff;text-decoration:none;font-weight:700">
            إعادة تعيين كلمة السر
          </a>
        </p>
        <p style="color:#6b7280">الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    console.log('Reset mail sent:', info.response, info.accepted, info.rejected);
    return true;
  } catch (err) {
    console.error('sendResetMail error:', err);
    return false;
  }
}

module.exports = { sendContactUsEmail, sendResetMail };
