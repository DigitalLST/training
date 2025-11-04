// src/screens/DemandeParticipation.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type ApiSession = {
  _id: string;
  title: string;
  organizer?: string;
  startDate?: string;
  endDate?: string;
  inscriptionStartDate?: string;
  inscriptionEndDate?: string;
  isVisible?: boolean;
  trainingLevels?: string[];
  branche?: string[];
};

type UserMe = {
  _id: string;
  idScout?: string;
  firstName?: string; // = prenom
  lastName?: string;  // = nom
  email?: string;
  region?: string;
};

type DemandeMine = {
  _id: string;
  session: string;
  applicant: string;
  applicantSnapshot: {
    idScout?: string; firstName?: string; lastName?: string; email?: string; region?: string;
  };
  trainingLevel: string;
  branche: string;
  status?: string;
};

function headers(): Record<string,string> {
  const h: Record<string,string> = { 'Content-Type':'application/json' };
  const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtRange(s?: string, e?: string) {
  if (!s && !e) return '—';
  const sd = s ? new Date(s) : null;
  const ed = e ? new Date(e) : null;
  const F = (d: Date) => d.toLocaleDateString('ar-TN', { year:'numeric', month:'long', day:'2-digit' });
  if (sd && ed) return `${F(sd)} — ${F(ed)}`;
  if (sd) return `من ${F(sd)}`;
  return `إلى ${F(ed!)}`;
}

/* ---------- normalisation profil (prenom/nom) ---------- */
function normalizeMe(raw: any): UserMe {
  const prenom =
    raw?.prenom ?? raw?.firstName ?? raw?.firstname ?? raw?.first_name ?? raw?.givenName ?? raw?.given_name ?? '';
  const nom =
    raw?.nom ?? raw?.lastName ?? raw?.lastname ?? raw?.last_name ?? raw?.familyName ?? raw?.family_name ?? '';
  return {
    _id: String(raw?._id ?? raw?.id ?? ''),
    idScout: opt(raw?.idScout ?? raw?.scoutId ?? raw?.matricule),
    firstName: String(prenom || ''),
    lastName: String(nom || ''),
    email: opt(raw?.email ?? raw?.mail),
    region: opt(raw?.region ?? raw?.regionName ?? raw?.region_name),
  };
}
function opt(v: any): string|undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

export default function DemandeParticipation(): React.JSX.Element {
  const nav = useNavigate();

  const [me, setMe] = React.useState<UserMe | null>(null);
  const [sessions, setSessions] = React.useState<ApiSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string|null>(null);

  const [openId, setOpenId] = React.useState<string>('');
  const [mine, setMine] = React.useState<Record<string, DemandeMine | null>>({}); // sessionId -> demande

  const [form, setForm] = React.useState<Record<string, {
    trainingLevel: string;
    branche: string;
    submitting: boolean;
    submitErr?: string|null;
  }>>({});

  /* ---------- Chargement profil + sessions ---------- */
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);

        // 1) profil
        const rMe = await fetch(`${API_BASE}/users/me?ts=${Date.now()}`, { headers: headers(), cache:'no-store' });
        if (!rMe.ok) throw new Error(`me HTTP ${rMe.status}`);
        const meJson = await rMe.json();
        setMe(normalizeMe(meJson || {}));

        // 2) sessions (today ∈ [inscriptionStartDate, inscriptionEndDate])
        const rS = await fetch(`${API_BASE}/sessions?ts=${Date.now()}`, { headers: headers(), cache:'no-store' });
        if (!rS.ok) throw new Error(`sessions HTTP ${rS.status}`);
        const list = (await rS.json()) as ApiSession[];

        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const endOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const today = startOfDay(new Date());

        const opened = list.filter(s => {
          if (!s.inscriptionStartDate || !s.inscriptionEndDate) return false;
          const start = startOfDay(new Date(s.inscriptionStartDate));
          const end   = endOfDay(new Date(s.inscriptionEndDate));
          return today >= start && today <= end;
        });

        opened.sort((a,b) => new Date(a.inscriptionStartDate!).getTime() - new Date(b.inscriptionStartDate!).getTime());
        setSessions(opened);
      } catch (e:any) {
        setErr(e?.message || 'تعذّر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- Ouverture carte : charge ma demande si existe ---------- */
  async function onOpen(sessionId: string) {
    setOpenId(prev => prev === sessionId ? '' : sessionId);
    if (mine[sessionId] !== undefined) return;

    try {
      const r = await fetch(`${API_BASE}/demandes/mine?sessionId=${sessionId}&ts=${Date.now()}`, { headers: headers(), cache:'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setMine(prev => ({ ...prev, [sessionId]: d }));

      const sess = sessions.find(s => s._id === sessionId);
      const tl = (sess?.trainingLevels && sess.trainingLevels[0]) || '';
      const br = (sess?.branche && sess.branche[0]) || '';

      setForm(prev => ({
        ...prev,
        [sessionId]: {
          trainingLevel: d?.trainingLevel ?? tl,
          branche:       d?.branche ?? br,
          submitting: false,
          submitErr: null,
        }
      }));
    } catch {
      setMine(prev => ({ ...prev, [sessionId]: null }));
      const sess = sessions.find(s => s._id === sessionId);
      setForm(prev => ({
        ...prev,
        [sessionId]: {
          trainingLevel: (sess?.trainingLevels && sess.trainingLevels[0]) || '',
          branche:       (sess?.branche && sess.branche[0]) || '',
          submitting: false,
          submitErr: null,
        }
      }));
    }
  }

  function setFormField(sessionId: string, key: keyof (typeof form)[string], val: any) {
    setForm(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] || {}), [key]: val }}));
  }

  /* ---------- Création de la demande : envoie uniquement level + branche ---------- */
  async function onSubmit(sessionId: string) {
    const f = form[sessionId]; if (!f) return;
    setFormField(sessionId, 'submitErr', null);
    setFormField(sessionId, 'submitting', true);

    try {
      if (mine[sessionId]) { setFormField(sessionId, 'submitErr', 'تمّ تقديم الطلب سابقاً'); return; }
      if (!f.trainingLevel) throw new Error('اختر المستوى التدريبي');
      if (!f.branche) throw new Error('اختر القسم الفني');

      const payload = {
        sessionId,
        trainingLevel: f.trainingLevel,
        branche: f.branche,
      };

      const res = await fetch(`${API_BASE}/demandes`, {
        method: 'POST',
        headers: headers(),
        cache: 'no-store',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = '';
        try { msg = await res.text(); } catch {}
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const j = await res.json(); // { ok:true, demande:{ _id } }
      const createdId = j?.demande?._id || '';

      const snapshot: DemandeMine = {
        _id: createdId,
        session: sessionId,
        applicant: me?._id || '',
        applicantSnapshot: {
          idScout: me?.idScout || '',
          firstName: me?.firstName || '',
          lastName: me?.lastName || '',
          email: me?.email || '',
          region: me?.region || '',
        },
        trainingLevel: f.trainingLevel,
        branche: f.branche,
        status: 'PENDING'
      };

      setMine(prev => ({ ...prev, [sessionId]: snapshot }));
      alert('تمّ إرسال الطلب بنجاح');
    } catch (e:any) {
      setFormField(sessionId, 'submitErr', e?.message || 'تعذّر الإرسال');
    } finally {
      setFormField(sessionId, 'submitting', false);
    }
  }

  return (
    <div dir="rtl" style={{ width:'70vw', alignItems:'center', marginLeft:20, marginRight:20, paddingInline:24 }}>
      <span style={styles.pageTitle}>طلبات المشاركة في الدورات</span>

      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={()=>nav('/acceuil')} style={styles.circleRedBtn} aria-label="رجوع"><ArrowRightIcon/></button>
        </div>
      </div>
      <div style={styles.redLine} />

      {loading && <div style={{ color:'#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

      <div style={{ display:'grid', gap:14 }}>
        {sessions.map(s => {
          const opened = openId === s._id;
          const d = mine[s._id];
          const f = form[s._id] || {
            trainingLevel: '',
            branche: '',
            submitting: false,
            submitErr: null,
          };
          const disabled = !!d; // si demande existe → champs figés

          const tlOptions = s.trainingLevels || [];
          const brOptions = s.branche || [];

          return (
            <div key={s._id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display:'grid', gap:4 }}>
                  <div style={styles.cardTitle}>{s.title}</div>
                  <div style={styles.metaLine}>
                    <span>{fmtRange(s.startDate, s.endDate)}</span>
                    <span style={{ opacity:.5, paddingInline:6 }}>•</span>
                    <span>{s.organizer || 'اللجنة الوطنية لتنمية القيادات'}</span>
                  </div>
                </div>
                <button onClick={()=>onOpen(s._id)} style={styles.eyeBtn} title={opened ? 'إخفاء' : 'طلب المشاركة'}>
                  {opened ? <EyeOffIcon/> : <EyeIcon/>}
                </button>
              </div>

              {opened && (
                <div style={styles.detailWrap}>
                  {/* Identité (lecture seule) */}
                  <div style={styles.formBlock}>
                    <div style={styles.blockTitle}>معلومات المترشّح</div>
                    <div style={styles.row2}>
                      <div style={styles.field}>
                        <label style={styles.label}>رقم الكشّاف</label>
                        <input style={styles.input} value={me?.idScout || ''} readOnly />
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>البريد الإلكتروني</label>
                        <input style={styles.input} value={me?.email || ''} readOnly />
                      </div>
                    </div>
                    <div style={styles.row2}>
                      <div style={styles.field}>
                        <label style={styles.label}>الإسم</label>
                        <input style={styles.input} value={me?.firstName || ''} readOnly />
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>اللقب</label>
                        <input style={styles.input} value={me?.lastName || ''} readOnly />
                      </div>
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>الجهة</label>
                      <input style={styles.input} value={me?.region || ''} readOnly />
                    </div>
                  </div>

                  {/* Formulaire réduit (sans 3 champs) */}
                  <div style={styles.formBlock}>
                    <div style={styles.blockTitle}>تفاصيل الطلب</div>

                    <div style={styles.row2}>
                      <div style={styles.field}>
                        <label style={styles.label}>المستوى التدريبي <span style={{color:RED}}>*</span></label>
                        <select
                          style={styles.input}
                          value={f.trainingLevel}
                          onChange={e=>setFormField(s._id, 'trainingLevel', e.target.value)}
                          disabled={disabled}
                        >
                          {!f.trainingLevel && <option value="">— اختر —</option>}
                          {tlOptions.map(l => (<option key={l} value={l}>{l}</option>))}
                        </select>
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>القسم الفني <span style={{color:RED}}>*</span></label>
                        <select
                          style={styles.input}
                          value={f.branche}
                          onChange={e=>setFormField(s._id, 'branche', e.target.value)}
                          disabled={disabled}
                        >
                          {!f.branche && <option value="">— اختر —</option>}
                          {brOptions.map(b => (<option key={b} value={b}>{b}</option>))}
                        </select>
                      </div>
                    </div>

                    {f.submitErr && <div style={{ color:'#b91c1c' }}>❌ {f.submitErr}</div>}

                    {!disabled && (
                      <div style={styles.actions}>
                        <button
                          type="button"
                          onClick={()=>onSubmit(s._id)}
                          disabled={f.submitting}
                          style={styles.pillPrimary}
                        >
                          {f.submitting ? '... جارٍ الإرسال' : 'تقديم الطلب'}
                        </button>
                      </div>
                    )}

                    {disabled && (
                      <div style={{ color:'#059669', fontWeight:700 }}>
                        ✅ تمّ تقديم الطلب.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && sessions.length === 0 && (
          <div style={{ color:'#9ca3af' }}>لا توجد دورات مفتوحة للتسجيل حالياً.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- icônes ---------- */
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function EyeIcon()       { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>); }
function EyeOffIcon()    { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.82 21.82 0 0 1 5.08-6.36" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M10.58 10.58a3 3 0 1 0 4.24 4.24" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="2"/></svg>); }

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:20 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },

  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937', marginBottom:100 },
  redLine: { height:3, background:RED, opacity:.9, borderRadius:2, marginTop:8, marginBottom:8 },

  circleRedBtn: {
    width:46, height:46, borderRadius:14, background:'transparent',
    border:`3px solid ${RED}`, color:RED, display:'grid', placeItems:'center', cursor:'pointer',
  },

  card: {
    width:'97%', background:'#fff', borderRadius:22, border:'1px solid #e9edf3',
    boxShadow:'0 10px 24px rgba(0,0,0,.05)', padding:'16px 18px', display:'grid', gap:12
  },
  cardHeader:{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' },
  cardTitle: { fontSize:18, fontWeight:600, color:'#374151' },
  metaLine:  { color:'#6b7280', fontSize:14 },

  eyeBtn: {
    width:42, height:42, borderRadius:12, border:`2px solid ${RED}`, background:'transparent',
    color:RED, display:'grid', placeItems:'center', cursor:'pointer'
  },

  detailWrap: { borderTop:'1px dashed #e5e7eb', paddingTop:10, display:'grid', gap:14 },

  formBlock: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.03)',
    padding:'14px', display:'grid', gap:12,
  },
  blockTitle: { fontWeight:700, color:'#374151' },

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
};
