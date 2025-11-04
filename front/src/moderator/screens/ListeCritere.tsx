import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type NavState = { sessionId: string; niveau: string };
type ApiSession = { _id: string; title?: string; startDate?: string };
type ApiFamilles = { session: string; niveau: string; familles: string[] };

type StatRow = {
  session: string;
  niveau: string;              // 'تمهيدية' | 'شارة خشبية'
  criteresCount: number;
  famillesCount: number;
  title?: string;
  startDate?: string | null;
};

type SourcePair = {
  key: string;                 // `${sessionId}::${niveau}`
  sessionId: string;
  niveau: string;
  label: string;               // "Titre - شهر عربي - Niveau"
};

export default function ListeCritere(): React.JSX.Element {
  const nav = useNavigate();
  const location = useLocation() as { state?: Partial<NavState> };

  // ---- contexte (state puis sessionStorage)
  const fromState = (location.state?.sessionId && location.state?.niveau)
    ? (location.state as NavState) : null;

  const fromStorage = React.useMemo<NavState | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('criteres:selection') || 'null'); } catch { return null; }
  }, []);

  const ctx = fromState ?? fromStorage;

  React.useEffect(() => {
    if (fromState) sessionStorage.setItem('criteres:selection', JSON.stringify(fromState));
  }, [fromState]);

  React.useEffect(() => {
    if (!ctx?.sessionId || !ctx?.niveau) {
      nav('/moderator/gestioncriteres', { replace: true });
    }
  }, [ctx, nav]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---- états affichage
  const [sessionTitle, setSessionTitle] = React.useState<string>('');
  const [sessionStart, setSessionStart] = React.useState<string>(''); // "شهر عربي - سنة"
  const [families, setFamilies] = React.useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<string | null>(null);

  // ---- héritage (UI + data)
  const [showInherit, setShowInherit] = React.useState(false);
  const [pairs, setPairs] = React.useState<SourcePair[]>([]);
  const [srcKey, setSrcKey] = React.useState<string>(''); // `${sessionId}::${niveau}`
  const [inheritBusy, setInheritBusy] = React.useState(false);
  const [inheritErr, setInheritErr] = React.useState<string | null>(null);

  const fmtMonthYear = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';

  // ---- fetch session (title + startDate)
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
        setSessionStart(fmtMonthYear(s.startDate));
      } catch (e: any) {
        console.warn('session fetch failed:', e?.message);
      }
    })();
  }, [ctx?.sessionId]);

  // ---- fetch familles (distinct pour session + niveau)
  async function refreshFamilies() {
    if (!ctx?.sessionId || !ctx?.niveau) return;
    try {
      setLoading(true); setErr(null);
      const r = await fetch(
        `${API_BASE}/criteres/familles?session=${encodeURIComponent(ctx.sessionId)}&niveau=${encodeURIComponent(ctx.niveau)}&ts=${Date.now()}`,
        { headers: authHeaders(), cache: 'no-store' }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ApiFamilles;
      const rows = (data?.familles || []).map((f, i) => ({ id: `${f}#${i}`, label: String(f).trim() }));
      setFamilies(rows);
    } catch (e: any) {
      setErr(e?.message || 'تعذر الجلب');
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { refreshFamilies(); /* eslint-disable-next-line */ }, [ctx?.sessionId, ctx?.niveau]);

  // ---- charger UNIQUEMENT les couples (session, niveau) qui ont des critères ET != couple courant
  React.useEffect(() => {
    if (!showInherit || !ctx?.sessionId || !ctx?.niveau) return;
    (async () => {
      try {
        const rs = await fetch(`${API_BASE}/criteres/stats?ts=${Date.now()}`, {
          headers: authHeaders(), cache: 'no-store'
        });
        if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
        const st = (await rs.json()) as StatRow[];

        const eligible = (Array.isArray(st) ? st : [])
          .filter(row =>
            (row.criteresCount > 0 || row.famillesCount > 0) &&
            !(row.session === ctx.sessionId && row.niveau === ctx.niveau)
          );

        eligible.sort((a, b) => {
          const aSame = a.session === ctx.sessionId ? 0 : 1;
          const bSame = b.session === ctx.sessionId ? 0 : 1;
          if (aSame !== bSame) return aSame - bSame;
          const ta = (a.title || '').localeCompare(b.title || '', 'ar');
          if (ta !== 0) return ta;
          const da = (a.startDate ? new Date(a.startDate).getTime() : 0);
          const db = (b.startDate ? new Date(b.startDate).getTime() : 0);
          return db - da; // récents d'abord
        });

        const mapped: SourcePair[] = eligible.map(row => {
          const label = `${row.title || 'جلسة'} - ${fmtMonthYear(row.startDate ?? undefined)} - ${row.niveau}`; // <<< startDate OK
          return {
            key: `${row.session}::${row.niveau}`,
            sessionId: row.session,
            niveau: row.niveau,
            label,
          };
        });

        setPairs(mapped);
        const prefer = mapped.find(p => p.sessionId === ctx.sessionId) ?? mapped[0];
        setSrcKey(prefer ? prefer.key : '');
      } catch (e) {
        console.warn('load stats failed');
        setPairs([]);
        setSrcKey('');
      }
    })();
  }, [showInherit, ctx?.sessionId, ctx?.niveau]);

  // ---- supprimer une famille (bulk)
  async function onDeleteFamille(label: string) {
    if (!ctx?.sessionId || !ctx?.niveau || !label) return;
    if (!confirm('حذف هذه العائلة (جميع المعايير التابعة لها)؟')) return;

    const snapshot = families;
    setFamilies(list => list.filter(f => f.label !== label)); // optimiste

    try {
      const res = await fetch(`${API_BASE}/criteres/famille/delete`, {
        method: 'POST',
        headers: authHeaders(),
        cache: 'no-store',
        body: JSON.stringify({ session: ctx.sessionId, niveau: ctx.niveau, famille: label })
      });
      if (!res.ok) {
        setFamilies(snapshot); // rollback
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      setFamilies(snapshot);
      alert(e?.message || 'تعذر الحذف');
    }
  }

  // ---- éditer une famille
  function onEditFamille(label: string) {
    const st = { sessionId: ctx?.sessionId!, niveau: ctx?.niveau!, famille: label };
    sessionStorage.setItem('criteres:editfamille', JSON.stringify(st));
    nav('/moderator/updatecritere', { state: st });
  }

  function onBack() { nav('/moderator/gestioncriteres'); }

  function onAdd() {
    if (!ctx?.sessionId || !ctx?.niveau) return;
    const st = { sessionId: ctx.sessionId, niveau: ctx.niveau };
    sessionStorage.setItem('criteres:add_ctx', JSON.stringify(st));
    nav('/moderator/addcritere', { state: st });
  }

  // ---- hériter (overwrite) depuis la paire sélectionnée
  async function onInherit() {
    if (!ctx?.sessionId || !ctx?.niveau || !srcKey) return;
    const [fromSession, fromNiveau] = srcKey.split('::');
    if (!fromSession || !fromNiveau) return;

    setInheritErr(null);
    setInheritBusy(true);
    try {
      const res = await fetch(`${API_BASE}/criteres/inherit`, {
        method: 'POST',
        headers: authHeaders(),
        cache: 'no-store',
        body: JSON.stringify({
          fromSession,
          fromNiveau,
          toSession: ctx.sessionId,
          toNiveau:  ctx.niveau,
          mode:      'overwrite',
        })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      await refreshFamilies();
      setShowInherit(false);
    } catch (e: any) {
      setInheritErr(e?.message || 'تعذر الاستيراد');
    } finally {
      setInheritBusy(false);
    }
  }

  return (
    <div style={{ width:'90vw', alignItems:'center', marginLeft:20, marginRight:20, paddingInline:24 }}>
      {/* Titre */}
      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span>{sessionTitle || 'جلسة'} - {sessionStart || '—'} - {ctx?.niveau || '—'}</span>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setShowInherit(v => !v)} style={styles.squareRedBtn} aria-label="استيراد">
            <ImportIcon />
          </button>
          <button onClick={onAdd} style={styles.circleRedBtn} aria-label="إضافة">
            <PlusIcon />
          </button>
        </div>
      </div>

      <div style={styles.redLine} />

      {/* Panneau héritage */}
      {showInherit && (
        <div style={styles.inheritPanel} dir="rtl">
          <div style={{ display:'grid', gap:10 }}>
            <div style={{ fontWeight:700, color:'#374151' }}>استيراد معايير من جلسة/مستوى آخر</div>

            <div style={styles.inheritRow}>
              <label style={styles.inheritLabel}>المصدر (جلسة + مستوى)</label>
              <select
                value={srcKey}
                onChange={(e)=>setSrcKey(e.target.value)}
                style={styles.select}
              >
                {pairs.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>

            {pairs.length === 0 && (
              <div style={{ fontSize:13, color:'#6b7280' }}>
                لا توجد جلسات/مستويات مصدر تَحتوي معايير قابلة للاستيراد.
              </div>
            )}

            <div style={{ fontSize:13, color:'#6b7280' }}>
              سيتم <b>حذف</b> جميع معايير الجلسة/المستوى الحالي ثم <b>نسخ كل</b> المعايير من المصدر المختار.
            </div>

            {inheritErr && <div style={{ color:'#b91c1c' }}>❌ {inheritErr}</div>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setShowInherit(false)} style={styles.pillGhost} disabled={inheritBusy} type="button">
                إلغاء
              </button>
              <button
                onClick={onInherit}
                style={styles.pillPrimary}
                disabled={inheritBusy || !srcKey}
                type="button"
              >
                {inheritBusy ? '... جارٍ الاستيراد' : 'استيراد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display:'grid', gap:14 }}>
        {families.map(row => (
          <div key={row.id} style={styles.item} dir="rtl">
            <div style={styles.itemRight}>
              <div style={styles.itemTitle}>{row.label || '—'}</div>
            </div>
            <div style={styles.actions}>
              <IconBtn onClick={() => onEditFamille(row.label)} title="تعديل"><EditIcon/></IconBtn>
              <IconBtn onClick={() => onDeleteFamille(row.label)} title="حذف"><TrashIcon/></IconBtn>
            </div>
          </div>
        ))}
        {!loading && families.length === 0 && (
          <div style={{ color: '#6b7280' }}>لا توجد عائلات تقييم لهذا المستوى.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:20 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937', marginBottom:16 },
  redLine: { height:3, background: RED, opacity:.9, borderRadius:2, marginTop:8, marginBottom:8 },

  circleRedBtn: {
    width:46, height:46, borderRadius:14, background:'transparent',
    border:`3px solid ${RED}`, color:RED, display:'grid', placeItems:'center', cursor:'pointer',
  },
  squareRedBtn: {
    width:46, height:46, borderRadius:14, background:'transparent',
    border:`3px solid ${RED}`, color:RED, display:'grid', placeItems:'center', cursor:'pointer',
  },

  inheritPanel: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'16px', display:'grid', gap:12, maxWidth: 840, marginBottom: 12,
  },
  inheritRow: { display:'grid', gridTemplateColumns:'180px 1fr', gap:10, alignItems:'center' },
  inheritLabel: { color:'#6b7280', fontSize:14 },
  select: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px',
    fontSize:16, outline:'none', background:'#fff'
  },

  item: {
    width:'97%', background:'#fff', borderRadius:22, border:'1px solid #e9edf3',
    boxShadow:'0 10px 24px rgba(0,0,0,.05)', padding:'16px 18px',
    display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', minHeight:78,
  },
  itemRight: { display:'grid', justifyItems:'start' },
  itemTitle: { fontSize:18, fontWeight:200, color:'#374151' },
  actions: { display:'flex', gap:18, color:'#0f172a', alignItems:'center' },

  pillPrimary: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:700,
  },
  pillGhost: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:700,
  },
};

/* ---------- petits composants ---------- */
function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ background:'transparent', border:0, padding:0, cursor:'pointer', color:'inherit' }} />;
}

/* ---------- icônes (SVG inline) ---------- */
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function TrashIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 6h18M8 6v-2h8v2M6 6l1 14h10l1-14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function EditIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 15l6-6 4 4-6 6H4v-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 7l2-2 3 3-2 2z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
function PlusIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function ImportIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
