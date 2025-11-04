// src/screens/UpdateCritere.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type NavState = { sessionId: string; niveau: string; famille: string };

type ApiCritere = {
  _id: string;
  session: string;
  niveau: string;
  famille: string;
  critere: string;
  maxnote?: number;
  rank?: number;
};

type Pair = { id: string; _id?: string; label: string; max: string; rank?: string };

export default function UpdateCritere(): React.JSX.Element {
  const nav = useNavigate();
  const location = useLocation() as { state?: Partial<NavState> };

  // ---- contexte (state puis sessionStorage)
  const fromState =
    (location.state?.sessionId && location.state?.niveau && location.state?.famille)
      ? (location.state as NavState)
      : null;

  const fromStorage = React.useMemo<NavState | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('criteres:editfamille') || 'null'); }
    catch { return null; }
  }, []);

  const ctx = fromState ?? fromStorage;

  React.useEffect(() => {
    if (fromState) sessionStorage.setItem('criteres:editfamille', JSON.stringify(fromState));
  }, [fromState]);

  React.useEffect(() => {
    if (!ctx?.sessionId || !ctx?.niveau || !ctx?.famille) {
      nav('/moderator/gestioncriteres', { replace: true });
    }
  }, [ctx, nav]);

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---- états page
  const [familleName, setFamilleName] = React.useState<string>(ctx?.famille || '');
  const [items, setItems] = React.useState<Pair[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  // ---- charger critères existants de la famille sélectionnée
  React.useEffect(() => {
    if (!ctx?.sessionId || !ctx?.niveau || !ctx?.famille) return;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const url = `${API_BASE}/criteres?session=${encodeURIComponent(ctx.sessionId)}&niveau=${encodeURIComponent(ctx.niveau)}&famille=${encodeURIComponent(ctx.famille)}&ts=${Date.now()}`;
        const r = await fetch(url, { headers: headers(), cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as ApiCritere[];

        const pairs: Pair[] = (Array.isArray(data) ? data : []).map((c) => ({
          id: String(c._id || crypto.randomUUID?.() || Date.now() + Math.random()),
          _id: c._id ? String(c._id) : undefined,
          label: String(c.critere ?? ''),
          max: Number.isFinite(Number(c.maxnote)) ? String(Number(c.maxnote)) : '',
          rank: Number.isFinite(Number(c.rank)) ? String(Number(c.rank)) : '',
        }));

        // tri initial par rank asc (les vides vont en bas)
        pairs.sort((a, b) => (Number(a.rank) || 1e9) - (Number(b.rank) || 1e9));
        setItems(pairs);
        // nom de famille par défaut (editable)
        setFamilleName(ctx.famille);
      } catch (e: any) {
        setErr(e?.message || 'تعذر الجلب');
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [ctx?.sessionId, ctx?.niveau, ctx?.famille]);

  // ---- helpers UI
  function addPair() {
    setItems(prev => [
      ...prev,
      { id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), label: '', max: '', rank: '' }
    ]);
  }
  function updatePair(id: string, key: 'label' | 'max' | 'rank', value: string) {
    setItems(prev => prev.map(p => (p.id === id ? { ...p, [key]: value } : p)));
  }
  function removePair(id: string) {
    setItems(prev => prev.filter(p => p.id !== id));
  }

  const itemsSorted = React.useMemo(() => {
    const norm = (s?: string) => {
      const n = Number(s); return Number.isFinite(n) ? n : 1e9;
    };
    return [...items].sort((a, b) => norm(a.rank) - norm(b.rank));
  }, [items]);

  // ---- submit : overwrite (delete famille d’origine → recreate)
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx?.sessionId || !ctx?.niveau || !ctx?.famille) return;

    const newFamille = String(familleName ?? '').trim();
    if (!newFamille) { alert('اسم العائلة إجباري'); return; }

    // lignes valides à recréer
    const toInsert = itemsSorted
      .map(p => ({
        famille: newFamille,
        critere: String(p.label || '').trim(),
        maxnote: Number(p.max),
        rank: Number(p.rank),
      }))
      .filter(x => x.critere && Number.isFinite(x.maxnote) && x.maxnote > 0)
      .map(x => {
        if (!Number.isFinite(x.rank)) { const { rank, ...rest } = x as any; return rest; }
        return x;
      });

    if (toInsert.length === 0) {
      const ok = confirm('لا توجد عناصر تقييم صالحة. سيتم حذف العائلة ومحتوياتها. متابعة؟');
      if (!ok) return;
    }

    try {
      setSubmitting(true);

      // 1) vider l’ancienne famille (couple session+niveau+famille ORIGINE)
      const del = await fetch(`${API_BASE}/criteres/famille/delete`, {
        method: 'POST',
        headers: headers(),
        cache: 'no-store',
        body: JSON.stringify({
          session: ctx.sessionId,
          niveau: ctx.niveau,
          famille: ctx.famille, // ⚠️ famille d'origine
        }),
      });
      if (!del.ok) {
        const t = await del.text().catch(()=>'');
        throw new Error(t || `Delete HTTP ${del.status}`);
      }

      // 2) recréer toutes les lignes (potentiellement avec un NOUVEAU nom de famille)
      for (const c of toInsert) {
        const res = await fetch(`${API_BASE}/criteres`, {
          method: 'POST',
          headers: headers(),
          cache: 'no-store',
          body: JSON.stringify({
            session: ctx.sessionId,
            niveau: ctx.niveau,
            famille: c.famille,
            critere: c.critere,
            ...(typeof c.maxnote === 'number' ? { maxnote: c.maxnote } : {}),
            ...(typeof c.rank === 'number' ? { rank: c.rank } : {}),
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || `Create HTTP ${res.status}`);
        }
      }

      // succès → retour à la liste (on garde le couple session+niveau en selection)
      sessionStorage.setItem('criteres:selection',
        JSON.stringify({ sessionId: ctx.sessionId, niveau: ctx.niveau })
      );
      nav('/moderator/gestioncriteres', { replace: true });
    } catch (e: any) {
      console.warn(e?.message);
      alert('تعذر الحفظ');
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    nav('/moderator/gestioncriteres');
  }

  return (
    <div dir="rtl" style={{ display:'grid', gap:16, paddingInline:24, width:'90vw' }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>
            تحيين معايير التقييم — {ctx?.niveau || '—'}{ctx?.famille ? ` - ${ctx.famille}` : ''}
          </span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && (
        <form onSubmit={onSubmit} style={styles.form} noValidate>
          {/* Nom de famille (renommage éventuel) */}
          <div style={styles.field}>
            <label style={styles.label}>اسم العائلة<span style={{color:RED}}>*</span></label>
            <input
              type="text"
              value={familleName}
              onChange={e=>setFamilleName(e.target.value)}
              placeholder="معيار التقييم (اسم العائلة)"
              style={styles.input}
              required
            />
          </div>

          {/* Lignes critères */}
          <div style={{ display:'grid', gap:8 }}>
            {itemsSorted.map(it => (
              <div
                key={it.id}
                style={{ display:'grid', gridTemplateColumns:'1fr 140px 120px 46px', gap:8, alignItems:'center' }}
              >
                <input
                  type="text"
                  placeholder="عنصر التقييم"
                  value={it.label}
                  onChange={e=>updatePair(it.id, 'label', e.target.value)}
                  style={styles.input}
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="العدد الأقصى"
                  value={it.max}
                  onChange={e=>updatePair(it.id, 'max', e.target.value)}
                  style={styles.input}
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="الترتيب"
                  value={it.rank || ''}
                  onChange={e=>updatePair(it.id, 'rank', e.target.value)}
                  style={styles.input}
                  title="الترتيب داخل العائلة"
                />
                <button type="button" onClick={()=>removePair(it.id)} title="حذف" style={styles.circleRedBtn}>×</button>
              </div>
            ))}
          </div>

          {/* Ajouter un critère */}
          <div style={styles.toolbarRight}>
            <button type="button" onClick={addPair} style={styles.squareRedBtn} aria-label="إضافة">
              <PlusIcon />
            </button>
            <span style={{color:RED}}>إضافة عنصر تقييم</span>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button type="button" onClick={onBack} style={styles.pillGhost}>إلغاء</button>
            <button type="submit" disabled={submitting} style={styles.pillPrimary}>
              {submitting ? '... جارٍ الحفظ' : 'حفظ'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:20 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, opacity:.9, borderRadius:2, marginTop:8, marginBottom:8 },

  form: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'18px', display:'grid', gap:14, maxWidth: 860
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

/* ---------- icônes ---------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
