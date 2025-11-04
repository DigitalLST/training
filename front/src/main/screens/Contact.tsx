// src/screens/ContactUs.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

export default function ContactUs(): React.JSX.Element {
  const nav = useNavigate();

  // champs
  const [subject, setSubject]   = React.useState('');
  const [message, setMessage]   = React.useState('');
  const [email, setEmail]       = React.useState('');   // pour non connecté
  const [prenom, setPrenom]     = React.useState('');   // pour non connecté
  const [nom, setNom]           = React.useState('');   // pour non connecté

  // états
  const [sending, setSending]   = React.useState(false);
  const [err, setErr]           = React.useState<string|null>(null);
  const [ok, setOk]             = React.useState<string|null>(null);

  const isAuthed = React.useMemo(() => !!localStorage.getItem('token'), []);

  function authHeaders(): Record<string,string> {
    const h: Record<string,string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);

    const s = subject.trim();
    const m = message.trim();
    if (s.length < 3)    { setErr('الرجاء كتابة موضوع صالح (3 أحرف على الأقل).'); return; }
    if (m.length < 10)   { setErr('نصّ الرسالة قصير جداً (10 أحرف على الأقل).');   return; }

    // si non connecté et email saisi → petite vérif
    if (!isAuthed && email.trim() && !isValidEmail(email)) {
      setErr('الرجاء إدخال بريد إلكتروني صالح.');
      return;
    }

    try {
      setSending(true);

      const body: any = { subject: s, message: m };
      if (!isAuthed) {
        if (email.trim())  body.email  = email.trim();
        if (prenom.trim()) body.prenom = prenom.trim();
        if (nom.trim())    body.nom    = nom.trim();
      }

      const res  = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

      setOk('تم إرسال رسالتك بنجاح ✅');
      setSubject(''); setMessage('');
      if (!isAuthed) { setEmail(''); setPrenom(''); setNom(''); }
    } catch (e:any) {
      setErr(e?.message || 'تعذّر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div dir="rtl" style={{ width:'70vw', alignItems:'center', marginLeft:20, marginRight:20, paddingInline:24 }}>
      <h1 style={styles.pageTitle}>اتصل بنا</h1>

      <div style={styles.card}>
        {/* coordonnées */}
        <div style={styles.topRow}>
          <a href="tel:+21671790501" style={styles.infoItem} title="اتصل بنا">
            <PhoneIcon/> <span>+216 71 790 501</span>
          </a>
          <a
            href="https://maps.google.com/?q=شارع بوغرطة، تونس، تونس"
            target="_blank" rel="noreferrer"
            style={styles.infoItem} title="الموقع"
          >
            <PinIcon/> <span>شارع بوغرطة، تونس، تونس</span>
          </a>
        </div>

        <div style={styles.bodyGrid}>
          {/* Illustration */}
          <div style={styles.illustrationWrap}>
            <img
              src="/update_acc.png"
              alt="Contact illustration"
              style={{ width:'100%', maxWidth:340, height:'auto', objectFit:'contain' }}
            />
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} style={styles.formWrap}>
            {/* champs visibles uniquement si non connecté */}
            {!isAuthed && (
              <>
                <label style={styles.label}>البريد الإلكتروني (اختياري)</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                  style={styles.input}
                  disabled={sending}
                  autoComplete="email"
                />

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={styles.label}>الاسم</label>
                    <input
                      type="text"
                      placeholder="الاسم"
                      value={prenom}
                      onChange={(e)=>setPrenom(e.target.value)}
                      style={styles.input}
                      disabled={sending}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>اللقب</label>
                    <input
                      type="text"
                      placeholder="اللقب"
                      value={nom}
                      onChange={(e)=>setNom(e.target.value)}
                      style={styles.input}
                      disabled={sending}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
              </>
            )}

            <label style={styles.label}>الموضوع</label>
            <input
              type="text"
              placeholder="الموضوع"
              value={subject}
              onChange={(e)=>setSubject(e.target.value)}
              style={styles.input}
              disabled={sending}
            />

            <label style={{ ...styles.label, marginTop:18 }}>نصّ الرسالة</label>
            <textarea
              placeholder="اكتب رسالتك هنا…"
              value={message}
              onChange={(e)=>setMessage(e.target.value)}
              rows={6}
              style={styles.textarea}
              disabled={sending}
            />

            {err && <div style={{ color:'#b91c1c', marginTop:8 }}>❌ {err}</div>}
            {ok  && <div style={{ color:'#059669', marginTop:8 }}>✅ {ok}</div>}

            <div style={{ display:'grid', gap:12, marginTop:18 }}>
              <button type="submit" disabled={sending} style={{ ...styles.pillPrimary, opacity: sending ? .6 : 1 }}>
                {sending ? '… جارِ الإرسال' : 'إرسال'}
              </button>
              <button type="button" onClick={()=>nav('/acceuil')} style={styles.pillGhost}>
                العودة إلى الرئيسية
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------- icons ---------- */
function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginInlineStart:6 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.31 1.77.57 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.09a2 2 0 0 1 2.11-.45c.84.26 1.71.45 2.61.57A2 2 0 0 1 22 16.92z" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginInlineStart:6 }}>
      <path d="M12 21s-6-5.33-6-10a6 6 0 1 1 12 0c0 4.67-6 10-6 10z" fill="none" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize:28, fontWeight:800, color:'#1f2937', textAlign:'center', marginTop:10, marginBottom:20 },

  card: {
    background:'#fff', borderRadius:22, border:'1px solid #e9edf3',
    boxShadow:'0 10px 24px rgba(0,0,0,.05)', padding:'18px 20px', display:'grid', gap:16
  },

  topRow: { display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'center', justifyContent:'center' },
  infoItem: { display:'inline-flex', alignItems:'center', gap:8, justifySelf:'center', color:'#111827', textDecoration:'none', fontSize:18 },

  bodyGrid: {
    display:'grid',
    gridTemplateColumns:'420px 1fr',
    gap:24,
    alignItems:'start',
  },

  illustrationWrap: { display:'grid', placeItems:'center' },

  formWrap: { display:'grid', gap:10 },

  label: { fontWeight:700, color:'#111827' },

  input: {
    border:'2px solid #f5c0c6', borderRadius:16, padding:'14px 16px', outline:'none',
    fontSize:16, transition:'border .2s', background:'#fff'
  },
  textarea: {
    border:'2px solid #f5c0c6', borderRadius:16, padding:'14px 16px', outline:'none',
    fontSize:16, resize:'vertical', minHeight:120, background:'#fff'
  },

  pillPrimary: {
    padding:'12px 18px', borderRadius:999, border:`2px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:800, fontSize:18, textAlign:'center'
  },
  pillGhost: {
    padding:'12px 18px', borderRadius:999, border:`2px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:800, fontSize:18, textAlign:'center'
  },
};
