// src/screens/UpdateAccount.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type Me = {
  _id: string;
  email?: string;
  region?: string;         // nom de la région (ou code)
  idScout?: string;        // المعرف الكشفي
  prenom?: string;         // الاسم
  nom?: string;            // اللقب
};

export default function UpdateAccount(): React.JSX.Element {
  const nav = useNavigate();

  // lecture infos utilisateur (affichage en lecture seule)
  const [me, setMe] = React.useState<Me | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // champs mot de passe
  const [currentPwd, setCurrentPwd] = React.useState('');
  const [newPwd, setNewPwd] = React.useState('');
  const [confirmPwd, setConfirmPwd] = React.useState('');
  const [showCurr, setShowCurr] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConf, setShowConf] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const headers = React.useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        const r = await fetch(`${API_BASE}/users/me?ts=${Date.now()}`, { headers, cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const payload = await r.json();
        // Essaie d’être tolérant sur les noms de champs
        const m: Me = {
          _id: String(payload?._id || ''),
          email: String(payload?.email || payload?.mail || ''),
          region: String(payload?.regionName || payload?.region || ''),
          idScout: String(payload?.idScout),
          prenom: String(payload?.prenom || payload?.firstName || ''),
          nom: String(payload?.nom || payload?.lastName || ''),
        };
        setMe(m);
      } catch (e: any) {
        setErr(e?.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [headers]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // validations simples côté client
    if (!currentPwd.trim()) { alert('الرجاء إدخال كلمة السر الحالية'); return; }
    if (newPwd.length < 8) { alert('كلمة السر الجديدة يجب أن تكون 8 أحرف على الأقل'); return; }
    if (newPwd !== confirmPwd) { alert('التأكيد لا يطابق كلمة السر الجديدة'); return; }

    try {
      setSubmitting(true);
      const r = await fetch(`${API_BASE}/users/me/password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ oldPassword: currentPwd, newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      if (!r.ok) {
        const msg = await r.text().catch(()=> '');
        throw new Error(msg || `HTTP ${r.status}`);
      }
      alert('تم تحديث كلمة السر بنجاح ✅');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e: any) {
      alert('تعذر التحديث: ' + (e?.message || ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" style={styles.page}>
      <span  style={styles.page} />
      <div style={styles.card}>
        <div style={styles.headerLogos}>
          {/* place pour الشعارات إن لزم */}
        </div>

        <h1 style={styles.title}>تغيير معطيات الحساب</h1>

        {loading && <div style={{ color:'#6b7280', marginBottom:12 }}>… جاري التحميل</div>}
        {err && <div style={{ color:'#b91c1c', marginBottom:12 }}>❌ {err}</div>}
        
        <form onSubmit={onSubmit} style={styles.form}>

          

 

          {/* صف 3: اللقب + الاسم (عرض فقط) */}
            <label style={styles.label}>
            <span>الاسم</span>
            <input style={styles.inputRO} value={me?.prenom || '—'} readOnly disabled />
          </label>
          <label style={styles.label}>
            <span>اللقب</span>
            <input style={styles.inputRO} value={me?.nom || '—'} readOnly disabled />
          </label>
         {/* صف 2: المعرّف الكشفي (عرض فقط) — يمتد على عمودين */}
          <label style={{ ...styles.label, gridColumn:'1 / span 2' }}>
            <span>المعرف الكشفي</span>
            <input style={styles.inputRO} value={me?.idScout || '—'} readOnly disabled />
          </label>
          {/* صف 1: البريد + الجهة (غير قابلين للتعديل) */}
          <label style={styles.label}>
            <span>البريد الإلكتروني</span>
            <input style={styles.inputRO} value={me?.email || '—'} readOnly disabled />
          </label>
          <label style={styles.label}>
            <span>الجهة</span>
            <input style={styles.inputRO} value={me?.region || '—'} readOnly disabled />
          </label>
          {/* صف 4: كلمة السر الحالية (يمتد على عمودين) */}
          <label style={{ ...styles.label, gridColumn:'1 / span 2' }}>
            <span>كلمة السر الحالية</span>
            <div style={styles.pwdWrap}>
              <input
                type={showCurr ? 'text' : 'password'}
                value={currentPwd}
                onChange={e=>setCurrentPwd(e.target.value)}
                style={styles.input}
                placeholder="كلمة السر الحالية"
              />
              <button type="button" onClick={() => setShowCurr((s) => !s)} aria-label={showCurr ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} title={showCurr ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} style={styles.inputIconBtn}>{showCurr ? <EyeOffIcon /> : <EyeIcon />}</button>
            </div>
          </label>

          {/* صف 5: الجديدة + التأكيد */}
          <label style={styles.label}>
            <span>كلمة السر الجديدة</span>
            <div style={styles.pwdWrap}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e=>setNewPwd(e.target.value)}
                style={styles.input}
                placeholder="كلمة السر الجديدة"
              />
            
              <button type="button" onClick={() => setShowNew((s) => !s)} aria-label={showNew ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} title={showNew ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} style={styles.inputIconBtn}>{showNew ? <EyeOffIcon /> : <EyeIcon />}</button>
            
            </div>
          </label>

          <label style={styles.label}>
            <span>تأكيد كلمة السر الجديدة</span>
            <div style={styles.pwdWrap}>
              <input
                type={showConf ? 'text' : 'password'}
                value={confirmPwd}
                onChange={e=>setConfirmPwd(e.target.value)}
                style={styles.input}
                placeholder="تأكيد كلمة السر الجديدة"
              />
              <button type="button" onClick={() => setShowConf((s) => !s)} aria-label={showConf ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} title={showNew ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} style={styles.inputIconBtn}>{showNew ? <EyeOffIcon /> : <EyeIcon />}</button>

            </div>
          </label>

          {/* أزرار */}
          <div style={{ gridColumn:'1 / span 2', display:'grid', gap:10 }}>
            <button type="submit" disabled={submitting} style={styles.primaryBtn}>
              {submitting ? '… جاري التحديث' : 'تغيير كلمة السر'}
            </button>
            <button type="button" onClick={()=>nav('/acceuil')} style={styles.ghostBtn}>
              العودة إلى الرئيسية
            </button>
          </div>
        </form>
        
        <div style={{ textAlign:'center', color:'#6b7280', fontSize:13, marginTop:8 }}>
          إذا أردت تغيير معطيات مغلقة إتصل بنا
          
        </div>
    
        
      </div>
      
    </div>
  );
}
function EyeIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
function EyeOffIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8"/></svg>); }

/* ---------------- styles ---------------- */
const styles: Record<string, React.CSSProperties> = {
  page: {
    width:'70%', minHeight:'calc(100vh - 120px)', // laisse MainLayout gérer l’entête
    display:'grid', gridTemplateColumns:'360px 1fr', gap:20, alignItems:'start',
    padding:'12px 16px',
  },
  heroImg: {
    width:'100%', maxWidth:360, height:'auto', objectFit:'contain', alignSelf:'start',
  },
  card: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:22,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)', padding:'20px 24px',
  },
  headerLogos:{ display:'grid', justifyContent:'center', marginBottom:10 },
  title: { textAlign:'center', fontSize:28, fontWeight:800, color:'#1f2937', margin:'4px 0 18px' },

  form: {
    display:'grid',
    gridTemplateColumns:'1fr 1fr',
    gap:14,
  },
    inputIconBtn: {
    position: 'absolute',
    zIndex:2,
    top: '50%',
    left: 10,                 // icône à GAUCHE du champ (en RTL)
    transform: 'translateY(-50%)',
    width: 32,
    height: 32,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    color: '#9ca3af',
  },
  label: {
    display:'grid',
    gap:6,
    fontSize:14,
    color:'#374151',
  },
  input: {
    border:'1px solid #ef9aa4', // léger rose comme l’exemple
    background:'#fff',
    borderRadius:20,
    padding:'10px 14px',
    outline:'none',
    fontSize:14,
  },
  inputRO: {
    border:'1px solid #ef9aa4',
    background:'#f9fafb',
    color:'#6b7280',
    borderRadius:20,
    padding:'10px 14px',
    outline:'none',
    fontSize:14,
  },
  pwdWrap: {
    position:'relative',
    display:'grid',
  },
  eyeBtn: {
    position:'absolute',
    insetInlineStart:8,
    top: '50%',
    transform: 'translateY(-50%)',
    border:'none',
    background:'transparent',
    cursor:'pointer',
    fontSize:16,
  },
  primaryBtn: {
    padding:'12px 18px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:RED, color:'#fff',
    cursor:'pointer', fontWeight:700, fontSize:16,
  },
  ghostBtn: {
    padding:'12px 18px',
    borderRadius:999,
    border:`2px solid ${RED}`,
    background:'transparent', color:RED,
    cursor:'pointer', fontWeight:700, fontSize:16,
  },
};
