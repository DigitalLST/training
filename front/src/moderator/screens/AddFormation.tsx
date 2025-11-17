// src/screens/AddFormation.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type NavState = { sessionId: string; niveau: 'تمهيدية' | 'شارة خشبية' | string };
type ApiSession = {
  _id: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  branches?: string[];
  branche?: string[]; // tolérance
};
type Centre = { _id: string; title: string; region: string };

// ✅ Multi-branches par ligne
type Row = { id: string; branches: string[]; nom: string };

export default function AddFormation(): React.JSX.Element {
  const nav = useNavigate();
  const loc = useLocation() as { state?: Partial<NavState> };

  // ---- contexte (state -> storage fallback)
  const fromState =
    loc.state?.sessionId && loc.state?.niveau ? (loc.state as NavState) : null;

  const fromStorage = React.useMemo<NavState | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('formations:add_ctx') || 'null'); }
    catch { return null; }
  }, []);

  const ctx = fromState ?? fromStorage;

  React.useEffect(() => {
    if (fromState) {
      sessionStorage.setItem('formations:add_ctx', JSON.stringify(fromState));
    }
  }, [fromState]);

  React.useEffect(() => {
    if (!ctx?.sessionId || !ctx?.niveau) {
      nav('/moderator/listeformations', { replace: true });
    }
  }, [ctx, nav]);

  // ---- headers
  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---- session meta + branches autorisées
  const [sessionTitle, setSessionTitle] = React.useState('');
  const [period, setPeriod] = React.useState('—');
  const [sessionBranches, setSessionBranches] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!ctx?.sessionId) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/sessions/${ctx.sessionId}?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = (await r.json()) as ApiSession;

        // titre/période
        setSessionTitle(String(s?.title || '').trim());
        const a = s?.startDate ? new Date(String(s.startDate)) : null;
        const fmt = (d?: Date|null) => d && !isNaN(d.getTime())
          ? d.toLocaleDateString('ar-TN', { year:'numeric', month:'long' })
          : '';
        const pa = fmt(a);
        setPeriod(pa ? `${pa}` : (pa || '—'));

        // branches autorisées (tolérance de clé)
        const raw = Array.isArray(s?.branches) ? s.branches : Array.isArray(s?.branche) ? s.branche : [];
        const norm = raw.map(String).map(x => x.trim()).filter(Boolean);
        setSessionBranches(norm);
      } catch { /* ignore */ }
    })();
  }, [ctx?.sessionId]);

  // ---- centres
  const [centres, setCentres] = React.useState<Centre[]>([]);
  const [centreId, setCentreId] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/centres?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        const j = await r.json();
        const list: Centre[] = (Array.isArray(j) ? j : j.centres || [])
          .map((c: any) => ({ _id: String(c._id), title: String(c.title), region: String(c.region) }));
        setCentres(list);
      } catch { /* ignore */ }
    })();
  }, []);

  // ---- lignes (branches[] + nom)
  const [rows, setRows] = React.useState<Row[]>([
    { id: crypto.randomUUID?.() ?? String(Date.now()), branches: [], nom: '' },
  ]);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function addRow() {
    setRows(prev => [
      ...prev,
      { id: crypto.randomUUID?.() ?? String(Date.now()+Math.random()), branches: [], nom: '' }
    ]);
  }
  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }
  function updateRow(id: string, key: keyof Row, val: any) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!ctx?.sessionId || !ctx?.niveau) return setErr('سياق الجلسة/المستوى مفقود');
    if (!centreId) return setErr('يرجى اختيار مركز التكوين');

    if (!sessionBranches.length) {
      return setErr('لا توجد أقسام فنية مفعّلة لهذه الدورة. حدّد الأقسام ضمن إعدادات الدورة أولاً.');
    }

    // préparer payloads (une formation par ligne) avec branches[]
    const payloads = rows
      .map(r => {
        const nom = String(r.nom || '').trim();
        const branches = Array.isArray(r.branches)
          ? r.branches.map(String).map(x=>x.trim()).filter(Boolean)
          : [];
        if (!nom || !branches.length) return null;
        // sécurité front : toutes ⊆ sessionBranches
        if (!branches.every(b => sessionBranches.includes(b))) return null;
        return {
          sessionId: ctx.sessionId,
          niveau: ctx.niveau,
          centreId,
          nom,
          branches,   // ⬅️ multi-branches
        };
      })
      .filter(Boolean) as Array<{ sessionId:string; niveau:string; centreId:string; nom:string; branches:string[] }>;

    if (!payloads.length) return setErr('أضف سطراً واحداً على الأقل بقسم فني مفعّل واسم دراسة.');

    try {
      setSubmitting(true);
      for (const p of payloads) {
        const res = await fetch(`${API_BASE}/formations`, {
          method: 'POST',
          headers: authHeaders(),
          cache: 'no-store',
          body: JSON.stringify(p),
        });
        if (res.status === 409) continue; // doublon → on ignore
        if (!res.ok) {
          const t = await res.text().catch(()=> '');
          throw new Error(t || `HTTP ${res.status}`);
        }
      }
      nav('/moderator/listeformations', {
        state: { sessionId: ctx.sessionId, niveau: ctx.niveau },
        replace: true
      });
    } catch (e: any) {
      setErr(e?.message || 'تعذر الإضافة');
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    nav('/moderator/listeformations', {
      state: { sessionId: ctx?.sessionId, niveau: ctx?.niveau }
    });
  }
  function toggleBranchInRow(rowId: string, branch: string) {
  setRows(prev => prev.map(r => {
    if (r.id !== rowId) return r;
    const set = new Set(r.branches || []);
    if (set.has(branch)) set.delete(branch); else set.add(branch);
    return { ...r, branches: Array.from(set) };
  }));
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
            {sessionTitle || 'جلسة'} — {period} — {ctx?.niveau || '—'}
          </span>
        </div>
        <div style={{ width:46, height:46 }} />
      </div>

      <div style={styles.redLine} />

      <form onSubmit={onSubmit} style={styles.form} noValidate>
        {/* Centre (appliqué à toutes les lignes) */}
        <div style={styles.fieldRow}>
          <label style={styles.label}>مركز التدريب <span style={{color:RED}}>*</span></label>
          <select value={centreId} onChange={e=>setCentreId(e.target.value)} style={styles.input} required>
            <option value="">— إختر —</option>
            {centres.map(c => <option key={c._id} value={c._id}>{c.title} ({c.region})</option>)}
          </select>
        </div>

        {/* Alerte si pas de branches */}
        {!sessionBranches.length && (
          <div style={{ color:'#b45309', background:'#fffbeb', border:'1px solid #fde68a', padding:'8px 12px', borderRadius:12 }}>
            لا توجد أقسام فنية مفعّلة لهذه الدورة. حدّد الأقسام ضمن إعدادات الدورة أولاً.
          </div>
        )}

        {/* Lignes: Branches (multi depuis session) + Nom formation */}
        <div style={{ display:'grid', gap:10 }}>
          {rows.map(row => (
  <div key={row.id} style={styles.rowGrid}>
    {/* Groupe de cases à cocher en pills */}
    <div style={styles.checkboxGroup} aria-label="الأقسام الفنية">
      {sessionBranches.map(b => {
        const checked = row.branches.includes(b);
        return (
          <label key={`${row.id}-${b}`} style={{ 
            ...styles.checkboxPill, 
            ...(checked ? styles.checkboxPillActive : {}) 
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleBranchInRow(row.id, b)}
              style={{ display: 'none' }}
              aria-label={b}
            />
            <span>{b}</span>
          </label>
        );
      })}
      {!sessionBranches.length && (
        <span style={{ opacity: .6 }}>—</span>
      )}
    </div>

    <input
      type="text"
      placeholder="إسم الدراسة (مثال: دراسة مشتركة L1)"
      value={row.nom}
      onChange={e => updateRow(row.id, 'nom', e.target.value)}
      style={styles.input}
    />

    <button
      type="button"
      onClick={() => removeRow(row.id)}
      title="حذف"
      style={styles.circleRedBtn}
    > ×
    </button>
  </div>
))}
        </div>

        {/* Ajouter une ligne */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button type="button" onClick={addRow} style={styles.squareRedBtn} aria-label="إضافة" disabled={!sessionBranches.length}>
            <PlusIcon />
          </button>
          <span style={{ color: RED }}>إضافة دراسة</span>
        </div>

        {/* Erreur */}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" onClick={onBack} style={styles.pillGhost}>إلغاء</button>
          <button type="submit" disabled={submitting || !sessionBranches.length} style={styles.pillPrimary}>
            {submitting ? '... جارٍ الحفظ' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------- styles --------- */
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

  rowGrid: { display:'flex', gridTemplateColumns:'260px 1fr 46px', gap:8, alignItems:'center' },

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
  squareRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },


  // conteneur des pills (wrap)
  checkboxGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    minHeight: 46,
  },

  // pill “non cochée”
  checkboxPill: {
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    background: '#f9fafb',
    color: '#374151',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: 1.2,
  },

  // pill “cochée”
  checkboxPillActive: {
    border: `1px solid ${RED}`,
    background: RED,
    color: '#fff',
  },
};

/* --------- icônes --------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
