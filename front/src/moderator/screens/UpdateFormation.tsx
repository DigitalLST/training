// src/screens/EditFormation.tsx
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type Centre = { _id: string; title: string; region: string };

type ApiFormation = {
  _id: string;
  sessionId: string;
  niveau: 'تمهيدية' | 'شارة خشبية' | string;
  nom: string;
  branches: string[];
  centre?: { _id: string | null; title?: string; region?: string } | null;
  sessionTitle?: string; // snapshot or current
  startDate?: string | null;
  endDate?: string | null;
  allowedBranches?: string[]; // from session
};

type PatchPayload = {
  nom?: string;
  centreId?: string;
  niveau?: 'تمهيدية' | 'شارة خشبية';
  branches?: string[];
};

type NavState = {
  id?: string;                 // <-- reçu depuis ListeFormations.onEdit
  sessionId?: string;
  niveau?: 'تمهيدية' | 'شارة خشبية' | string;
};

export default function EditFormation(): React.JSX.Element {
  const nav = useNavigate();

  // --- récupération ID depuis 3 sources: params -> state -> sessionStorage
  const params = useParams();
  const loc = useLocation() as { state?: Partial<NavState> };

  const idFromParams = (params?.id ? String(params.id) : '');
  const idFromState  = (loc.state?.id ? String(loc.state.id) : '');
  const idFromStorage = React.useMemo(() => {
    try { return String(sessionStorage.getItem('formations:edit_id') || ''); }
    catch { return ''; }
  }, []);

  const formationId = idFromParams || idFromState || idFromStorage;

  // persister l'id si on le reçoit via state (utile en cas de refresh)
  React.useEffect(() => {
    if (idFromState) {
      sessionStorage.setItem('formations:edit_id', idFromState);
    }
  }, [idFromState]);

  // ---- headers
  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---- state
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string|null>(null);

  const [formation, setFormation] = React.useState<ApiFormation | null>(null);

  // editable fields
  const [centreId, setCentreId] = React.useState('');
  const [nom, setNom] = React.useState('');
  const [branches, setBranches] = React.useState<string[]>([]);

  const [centres, setCentres] = React.useState<Centre[]>([]);

  const allowed = formation?.allowedBranches || [];

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        if (!formationId) {
          throw new Error('معطيات غير كاملة: المعرّف مفقود');
        }

        // 1) fetch formation
        const fr = await fetch(`${API_BASE}/formations/${formationId}?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        if (!fr.ok) throw new Error(`HTTP ${fr.status}`);
        const f = await fr.json() as ApiFormation;
        setFormation(f);

        setCentreId(String(f.centre?._id || ''));
        setNom(String(f.nom || ''));
        setBranches(Array.isArray(f.branches) ? f.branches : []);

        // 2) fetch centres
        const cr = await fetch(`${API_BASE}/centres?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        const cj = await cr.json();
        const list: Centre[] = (Array.isArray(cj) ? cj : cj.centres || [])
          .map((c: any) => ({ _id: String(c._id), title: String(c.title), region: String(c.region) }));
        setCentres(list);
      } catch (e: any) {
        setErr(e?.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [formationId]);

  function toggleBranch(b: string) {
    setBranches(prev => {
      const s = new Set(prev);
      if (s.has(b)) s.delete(b); else s.add(b);
      return Array.from(s);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formation) return;
    setErr(null);

    // front validation
    if (!centreId) return setErr('يرجى اختيار مركز التكوين');
    if (!branches.length) return setErr('يرجى اختيار قسم فني واحد على الأقل');
    if (!branches.every(b => allowed.includes(b))) return setErr('هناك أقسام غير مسموح بها لهذه الدورة');

    const payload: PatchPayload = {};
    if (nom.trim() && nom.trim() !== formation.nom) payload.nom = nom.trim();
    if (centreId !== (formation.centre?._id || '')) payload.centreId = centreId;
    // always send branches if changed (order-insensitive compare)
    const sameBranches = branches.length === (formation.branches?.length || 0)
      && [...branches].sort().join('|') === [...(formation.branches||[])].sort().join('|');
    if (!sameBranches) payload.branches = branches;

    if (!Object.keys(payload).length) {
      // nothing to patch
      nav(-1);
      return;
    }

    try {
      setSaving(true);
      const r = await fetch(`${API_BASE}/formations/${formation._id}` , {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text().catch(()=> '');
        throw new Error(t || `HTTP ${r.status}`);
      }
      // back to list
      nav('/moderator/listeformations', {
        state: { sessionId: formation.sessionId, niveau: formation.niveau },
        replace: true,
      });
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!formation) return;
    if (!confirm('حذف هذه الدراسة؟ لا يمكن التراجع.')) return;
    try {
      setSaving(true);
      const r = await fetch(`${API_BASE}/formations/${formation._id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      nav('/moderator/listeformations', { state: { sessionId: formation.sessionId, niveau: formation.niveau }, replace: true });
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحذف');
    } finally {
      setSaving(false);
    }
  }

  function onBack() {
    if (!formation) return nav(-1);
    nav('/moderator/listeformations', { state: { sessionId: formation.sessionId, niveau: formation.niveau } });
  }

  const period = React.useMemo(() => {
    if (!formation?.startDate) return '—';
    const a = new Date(String(formation.startDate));
    const fmt = (d?: Date|null) => d && !isNaN(d.getTime())
      ? d.toLocaleDateString('ar-TN', { year:'numeric', month:'long' })
      : '';
    return fmt(a) || '—';
  }, [formation?.startDate]);

  if (loading) {
    return (
      <div dir="rtl" style={{ padding: 18 }}>
        <div style={{ color: '#6b7280' }}>… جاري التحميل</div>
      </div>
    );
  }
  if (!formation) {
    return (
      <div dir="rtl" style={{ padding: 18 }}>
        <div style={{ color: '#b91c1c' }}>❌ غير موجود</div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ display:'grid', gap:16 }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button type="button" onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>
            {formation.sessionTitle || 'جلسة'} — {period} — {formation.niveau}
          </span>
        </div>
        <div style={{ width:46, height:46 }} />
      </div>

      <div style={styles.redLine} />

      <form onSubmit={onSubmit} style={styles.form} noValidate>
        {/* Centre */}
        <div style={styles.fieldRow}>
          <label style={styles.label}>مركز التدريب <span style={{color:RED}}>*</span></label>
          <select value={centreId} onChange={e=>setCentreId(e.target.value)} style={styles.input} required>
            <option value="">— إختر —</option>
            {centres.map(c => <option key={c._id} value={c._id}>{c.title} ({c.region})</option>)}
          </select>
        </div>

        {/* Branches (pills) */}
        <div style={{ display:'grid', gap:8 }}>
          <label style={styles.label}>الأقسام الفنية <span style={{color:RED}}>*</span></label>
          <div style={styles.checkboxGroup} aria-label="الأقسام الفنية">
            {allowed.map(b => {
              const checked = branches.includes(b);
              return (
                <label key={b} style={{ ...styles.checkboxPill, ...(checked ? styles.checkboxPillActive : {}) }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleBranch(b)} style={{ display:'none' }} aria-label={b} />
                  <span>{b}</span>
                </label>
              );
            })}
            {!allowed.length && <span style={{ opacity:.6 }}>—</span>}
          </div>
        </div>

        {/* Nom */}
        <div style={styles.fieldRow}>
          <label style={styles.label}>إسم الدراسة <span style={{color:RED}}>*</span></label>
          <input type="text" value={nom} onChange={e=>setNom(e.target.value)} placeholder="مثال: دراسة مشتركة L1" style={styles.input} />
        </div>

        {/* Error */}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" onClick={onDelete} disabled={saving} style={styles.pillGhost}>حذف</button>
          <div style={{ flex:1 }} />
          <button type="button" onClick={onBack} style={styles.pillGhost}>إلغاء</button>
          <button type="submit" disabled={saving || !allowed.length} style={styles.pillPrimary}>
            {saving ? '... جارٍ الحفظ' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------- styles (copied from Add with reuse) --------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8 },

  form: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'18px', display:'grid', gap:14, maxWidth: 820
  },
  fieldRow: { display:'grid', gap:6 },
  label: { color:'#6b7280', fontSize:14 },
  input: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px',
    fontSize:16, outline:'none',
  },
  checkboxGroup: {
    display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minHeight: 46,
  },
  checkboxPill: {
    border: '1px solid #e5e7eb', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
    userSelect: 'none', background: '#f9fafb', color: '#374151', display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
  },
  checkboxPillActive: { border: `1px solid ${RED}`, background: RED, color: '#fff' },
  actions: { display:'flex', gap:10, alignItems:'center', justifyContent:'flex-end', marginTop:4 },
  pillPrimary: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:700,
  },
  pillGhost: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:700,
  },
  circleRedBtn: {
    width: 46, height: 46, borderRadius: 999, background: 'transparent', border: `3px solid ${RED}`, color: RED,
    display: 'grid', placeItems: 'center', cursor: 'pointer'
  },
};

function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
