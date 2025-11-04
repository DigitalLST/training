import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type NavState = { sessionId: string; niveau: string };
type ApiSession = { _id: string; title?: string; startDate?: string };

type Row = { id: string; critere: string; maxnote: string; rank: string };

export default function AddCritere(): React.JSX.Element {
  const nav = useNavigate();
  const loc = useLocation() as { state?: Partial<NavState> };

  // ---- contexte (state -> storage fallback)
  const fromState =
    loc.state?.sessionId && loc.state?.niveau ? (loc.state as NavState) : null;

  const fromStorage = React.useMemo<NavState | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('criteres:add_ctx') || 'null');
    } catch {
      return null;
    }
  }, []);

  const ctx = fromState ?? fromStorage;

  React.useEffect(() => {
    if (fromState) {
      sessionStorage.setItem('criteres:add_ctx', JSON.stringify(fromState));
    }
  }, [fromState]);

  React.useEffect(() => {
    if (!ctx?.sessionId || !ctx?.niveau) {
      nav('/moderator/addcritere', { replace: true });
    }
  }, [ctx, nav]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---- en-tête (session title + mois/année AR)
  const [sessionTitle, setSessionTitle] = React.useState('');
  const [monthAr, setMonthAr] = React.useState('');
  const [yearAr, setYearAr] = React.useState('');

  React.useEffect(() => {
    if (!ctx?.sessionId) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/sessions/${ctx.sessionId}?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = (await r.json()) as ApiSession;
        setSessionTitle(String(s?.title ?? '').trim());
        const d = s?.startDate ? new Date(String(s.startDate)) : null;
        if (d && !isNaN(d.getTime())) {
          setMonthAr(d.toLocaleDateString('ar-TN', { month: 'long' }));
          setYearAr(d.toLocaleDateString('ar-TN', { year: 'numeric' }));
        } else {
          setMonthAr(''); setYearAr('');
        }
      } catch (e) {
        // silencieux
      }
    })();
  }, [ctx?.sessionId]);

  // ---- formulaire
  const [famille, setFamille] = React.useState('');
  const [rows, setRows] = React.useState<Row[]>([
    { id: crypto.randomUUID?.() ?? String(Date.now()), critere: '', maxnote: '1', rank: '' },
  ]);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function addRow() {
    setRows(prev => [...prev, {
      id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
      critere: '', maxnote: '1', rank: ''
    }]);
  }
  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }
  function updateRow(id: string, key: keyof Row, val: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!ctx?.sessionId || !ctx?.niveau) {
      return setErr('سياق الجلسة/المستوى مفقود');
    }
    const familleName = String(famille || '').trim();
    if (!familleName) return setErr('يرجى إدخال العائلة');

    // préparer les payloads
    const payloads = rows
      .map(r => {
        const critere = String(r.critere || '').trim();
        const maxnote = Number(r.maxnote);
        const rankNum = r.rank === '' ? undefined : Number(r.rank);
        if (!critere) return null;
        if (!Number.isFinite(maxnote) || maxnote < 1) return null;
        if (rankNum !== undefined && !Number.isFinite(rankNum)) return null;
        return {
          session: ctx.sessionId,
          niveau: ctx.niveau,
          famille: familleName,
          critere,
          maxnote,
          ...(rankNum !== undefined ? { rank: rankNum } : {}),
        };
      })
      .filter(Boolean) as Array<{
        session: string; niveau: string; famille: string;
        critere: string; maxnote: number; rank?: number;
      }>;

    if (payloads.length === 0) return setErr('أضف عنصراً واحداً على الأقل مع عدد أقصى صحيح');

    try {
      setSubmitting(true);
      // envoie séquentiel (simple, clair avec gestion 409)
      for (const p of payloads) {
        const res = await fetch(`${API_BASE}/criteres`, {
          method: 'POST',
          headers: authHeaders(),
          cache: 'no-store',
          body: JSON.stringify(p),
        });
        if (res.status === 409) {
          // critère déjà existant → on continue mais on signale à la fin
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || `HTTP ${res.status}`);
        }
      }
      // succès → retour à la liste des familles pour cette session/niveau
      nav('/moderator/listecriteres', { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'تعذر الإضافة');
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    nav('/moderator/listecriteres');
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
            {sessionTitle || 'جلسة'} - ({monthAr || '—'}-{yearAr || '—'}) - {ctx?.niveau || '—'}
          </span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      <form onSubmit={onSubmit} style={styles.form} noValidate>
        {/* Famille */}
        <div style={styles.field}>
          <label style={styles.label}>العائلة <span style={{color:RED}}>*</span></label>
          <input
            type="text"
            value={famille}
            onChange={(e)=>setFamille(e.target.value)}
            placeholder="اسم العائلة (مجموعة عناصر التقييم)"
            style={styles.input}
            required
          />
        </div>

        {/* Lignes critères */}
        <div style={{ display:'grid', gap:10 }}>
          {rows.map(row => (
            <div key={row.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px 46px', gap:8, alignItems:'center' }}>
              <input
                type="text"
                placeholder="عنصر التقييم"
                value={row.critere}
                onChange={e => updateRow(row.id, 'critere', e.target.value)}
                style={styles.input}
              />
              <input
                type="number"
                min={1}
                step={1}
                placeholder="العدد الأقصى"
                value={row.maxnote}
                onChange={e => updateRow(row.id, 'maxnote', e.target.value)}
                style={styles.input}
                title="العدد الأقصى"
              />
              <input
                type="number"
                min={1}
                step={1}
                placeholder="الترتيب (اختياري)"
                value={row.rank}
                onChange={e => updateRow(row.id, 'rank', e.target.value)}
                style={styles.input}
                title="الترتيب داخل العائلة (اختياري)"
              />
              <button type="button" onClick={()=>removeRow(row.id)} title="حذف" style={styles.circleRedBtn}>×</button>
            </div>
          ))}
        </div>

        {/* Ajouter une ligne */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button type="button" onClick={addRow} style={styles.squareRedBtn} aria-label="إضافة عنصر">
            <PlusIcon />
          </button>
          <span style={{ color: RED }}>إضافة عنصر تقييم</span>
        </div>

        {/* Erreur */}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" onClick={onBack} style={styles.pillGhost}>إلغاء</button>
          <button type="submit" disabled={submitting} style={styles.pillPrimary}>
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
  squareRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
};

/* --------- icônes --------- */
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function PlusIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
