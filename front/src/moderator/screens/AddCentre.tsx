import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/*const RED = '#e20514';*/
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export default function AddSession(): React.JSX.Element {
  const nav = useNavigate();

  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // validations simples
    if (!title.trim()) return setErr('يرجى إدخال المركز');
    if (!region.trim()) return setErr('يرجى إدخال الولاية');
    



    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/centres`, {
        method: 'POST',
        headers ,
        cache: 'no-store',
        body: JSON.stringify({ title: title.trim(),region: region.trim()  }),
    });
      if (res.status === 409) throw new Error('المركز موجود بالفعل');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // succès → retour à la liste
      nav('/moderator/centres');
    } catch (e: any) {
      setErr(e.message || 'تعذر الإضافة');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" style={{ display:'grid', gap:16 }}>
      {/* topbar: retour + titre */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={() => nav('/moderator/centres')} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>إضافة مركز تدريب</span>
        </div>
        {/* espace à gauche pour garder l’équilibre visuel */}
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      <form onSubmit={onSubmit} style={styles.form} noValidate>

        {/* Titre */}
        <div style={styles.field}>
          <label style={styles.label}>المركز <span style={{color:RED}}>*</span></label>
          <input type="text" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="اسم المركز"
                 style={styles.input} required />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>الولاية <span style={{color:RED}}>*</span></label>
          <input type="text" value={region} onChange={(e)=>setRegion(e.target.value)} placeholder="الولاية"
                 style={styles.input} required />
        </div>


        {/* Erreur */}
        {err && <div style={{ color:'#b91c1c', marginTop:4 }}>❌ {err}</div>}

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" onClick={()=>nav('/moderator/centres')} style={styles.pillGhost}>إلغاء</button>
          <button type="submit" disabled={submitting} style={styles.pillPrimary}>
            {submitting ? '... جارٍ الحفظ' : 'إضافة'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------- styles --------- */
const RED = '#e20514';

const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8 },

  form: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'18px', display:'grid', gap:14, maxWidth: 720
  },
  row2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  field: { display:'grid', gap:6 },
  label: { color:'#6b7280', fontSize:14 },
  input: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px',
    fontSize:16, outline:'none',
  },
  actions: { display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 },

  pillPrimary: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:700,
  },
  pillGhost: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:700,
  },

  circleRedBtn: {
    width: 46, height: 46, borderRadius: 999,
    background: 'transparent', border: `3px solid ${RED}`, color: RED,
    display: 'grid', placeItems: 'center', cursor: 'pointer'
  },
};

/* --------- icône flèche --------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
