// src/screens/MesResultats.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

/* ---------- types ---------- */
type ApiSession = {
  _id: string; title: string; typeSession: string;
  location?: string; startDate?: string; endDate?: string;
  role?: 'trainer' | 'trainee';
};

type SessionRow = {
  id: string; title: string; TypeSession: string; location: string; period: string; role?: 'trainer'|'trainee';
};

type SummaryPayload = {
  session?: { _id: string; title?: string; typeSession?: string; startDate?: string; endDate?: string } | null;
  evaluated?: { _id: string; name?: string } | null;
  rank: number; // ignoré côté UI (pas de rang global via finalpos)
  steps: { id: string; nom: string; rank?: number }[];
  perEtape: Record<string, number>;
  total: number;
};

type FinalPosByEtape = {
  [etapeId: string]: {
    finalOutcome?: string | null;   // SUCCESS | RETAKE | INCOMPATIBLE
    systemOutcome?: string | null;  // SUCCESS | RETAKE | BUYBACK | INCOMPATIBLE
    sumAvg?: number | null;
    position?: number | null;       // rang final voulu (1..N) par étape
  }
};

type FinalPosMeResponse = {
  sessionId: string;
  trainee: string;
  byEtape: FinalPosByEtape;
};

type StepLine = {
  etapeId: string;
  nom: string;
  note: number;
  rank?: number;       // position (finalpos)
  decision: string;    // texte lisible (ar)
};

/* ---------- helpers généraux ---------- */
function jwtDecodeId(): string | null {
  try {
    const t = localStorage.getItem('token');
    if (!t) return null;
    const p = t.split('.')[1];
    if (!p) return null;
    const json = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.id ? String(json.id) : null;
  } catch { return null; }
}

function authHeaders(): Record<string,string> {
  const h: Record<string,string> = { 'Content-Type':'application/json' };
  const t = localStorage.getItem('token'); if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtMonth(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('ar-TN', { year:'numeric', month:'long' }) : '—';
}

/** Texte UI à partir de (finalOutcome, systemOutcome) */
function outcomeText(finalOutcome?: string | null, systemOutcome?: string | null) {
  const f = String(finalOutcome ?? '').trim().toUpperCase();
  const s = String(systemOutcome ?? '').trim().toUpperCase();

  // règle demandée :
  // - si systemOutcome=BUYBACK ET finalOutcome=SUCCESS → "يؤهل/تؤهل بالإسعاف"
  if (s === 'BUYBACK' && f === 'SUCCESS') return 'يؤهل/تؤهل بالإسعاف';

  if (f === 'SUCCESS')       return 'يؤهل/تؤهل';
  if (f === 'RETAKE')        return 'إعادة الدورة';
  if (f === 'INCOMPATIBLE')  return 'عدم ملائمة الدور';

  // fallback si pas de décision (devrait être rare avec finalpos)
  return 'في انتظار قرار قيادة الدورة';
}

// ✅ lit strictement etape.isVisible; toute erreur => false
async function fetchStepVisible(sessionId: string, etapeId: string, headers: Record<string,string>): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/sessions/${sessionId}/etapes/${etapeId}?ts=${Date.now()}`, { headers, cache:'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    const v = j?.etape?.isVisible ?? j?.isVisible ?? j?.isvisible ?? j?.visible ?? false;
    if (v === true) return true;
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true' || v.trim() === '1';
    if (typeof v === 'number') return v === 1;
    return false;
  } catch { return false; }
}

async function fetchStepsVisibility(sessionId: string, etapeIds: string[], headers: Record<string,string>) {
  const pairs = await Promise.all(etapeIds.map(async eid => [eid, await fetchStepVisible(sessionId, eid, headers)] as [string, boolean]));
  return Object.fromEntries(pairs);
}

/* ---------- helpers FINALPOS côté backend ---------- */
async function rebuildFinalPos(sessionId: string, headers: Record<string,string>) {
  try {
    await fetch(`${API_BASE}/finalpos/rebuild`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId })
    });
  } catch {
    // on ignore les erreurs rebuild pour ne pas bloquer l’affichage
  }
}

async function fetchMyFinalPos(sessionId: string, myId: string, headers: Record<string,string>): Promise<FinalPosMeResponse> {
  const r = await fetch(
    `${API_BASE}/finalpos/refresh-me?sessionId=${sessionId}&evaluatedId=${myId}&ts=${Date.now()}`,
    { headers, cache:'no-store' }
  );
  if (!r.ok) return { sessionId, trainee: myId, byEtape: {} };
  return await r.json();
}

/* ---------- composant principal ---------- */
export default function Parcour(): React.JSX.Element {
  const nav = useNavigate();
  const myId = React.useMemo(() => jwtDecodeId(), []);
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string|null>(null);

  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  type SessionDetailState = {
    loading: boolean; err?: string|null;
    summary?: SummaryPayload|null;
    stepsVisible?: Record<string /* etapeId */, boolean>;
    lines?: StepLine[];
  };
  const [detail, setDetail] = React.useState<Record<string, SessionDetailState>>({});

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        const res = await fetch(`${API_BASE}/affectations/mine?ts=${Date.now()}`, { headers: authHeaders(), cache:'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        const list: ApiSession[] = Array.isArray(payload) ? payload : (payload?.sessions || []);
        const today = new Date(); today.setHours(0,0,0,0);

        const active = list.filter(s => !s.endDate || new Date(s.endDate).getTime() >= today.getTime());
        const traineeOnly = active.filter(s => String(s.role) === 'trainee');

        const mapped: SessionRow[] = traineeOnly.map(s => ({
          id: String(s._id),
          title: String(s.title ?? '').trim(),
          TypeSession: String(s.typeSession ?? '').trim(),
          location: String(s.location ?? '').trim(),
          period: fmtMonth(s.startDate),
          role: s.role as any,
        }));
        setRows(mapped);
      } catch (e:any) {
        setErr(e?.message || 'تعذّر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleSession(sessionId: string) {
    setOpen(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
    const willOpen = !open[sessionId];
    if (!willOpen) return;

    const cached = detail[sessionId];
    if (cached?.summary || cached?.loading) return;

    setDetail(prev => ({ ...prev, [sessionId]: { loading: true, err: null, summary: null, stepsVisible: {}, lines: [] } }));
    try {
      if (!myId) throw new Error('Utilisateur non identifié');

      // 1) (Re)build finalpos pour la session (idempotent)
      await rebuildFinalPos(sessionId, authHeaders());

      // 2) Charger le summary (pour récupérer les étapes et notes)
      const rSummary = await fetch(`${API_BASE}/scores/summary?sessionId=${sessionId}&evaluatedId=${myId}&ts=${Date.now()}`, { headers: authHeaders(), cache:'no-store' });
      if (!rSummary.ok) throw new Error(`summary HTTP ${rSummary.status}`);
      const payloadSummary = await rSummary.json() as SummaryPayload;

      // 3) Visibilité des étapes
      const allEtapeIds = Array.from(new Set((payloadSummary?.steps || []).map(s => String(s.id))));
      const stepsVisible = await fetchStepsVisibility(sessionId, allEtapeIds, authHeaders());
      // 4) Récupérer mes positions/décisions depuis finalpos
      const myPos = await fetchMyFinalPos(sessionId, myId, authHeaders());
      const byEtape = myPos?.byEtape || {};

      // 5) Construire les lignes
      const lines: StepLine[] = (payloadSummary?.steps || [])
        .filter(s => stepsVisible[String(s.id)] === true)
        .map(s => {
          const eid = String(s.id);

          // note: on privilégie la note du summary; sinon fallback sumAvg de finalpos
          const noteFromSummary = Number(payloadSummary?.perEtape?.[eid] ?? 0);
          const note = Number.isFinite(noteFromSummary) && noteFromSummary !== 0
            ? noteFromSummary
            : Number(byEtape?.[eid]?.sumAvg ?? 0);

          const fp = byEtape?.[eid];
          const rankVal = (typeof fp?.position === 'number') ? fp!.position! : undefined;
          const decisionTxt = outcomeText(fp?.finalOutcome, fp?.systemOutcome);

          return {
            etapeId: eid,
            nom: String(s.nom || '—'),
            note,
            rank: rankVal,
            decision: decisionTxt,
          };
        });

      setDetail(prev => ({
        ...prev,
        [sessionId]: { loading:false, err:null, summary: payloadSummary, stepsVisible, lines }
      }));
    } catch (e:any) {
      setDetail(prev => ({ ...prev, [sessionId]: { loading:false, err: (e?.message || 'تعذّر الجلب'), summary: null, stepsVisible: {}, lines: [] } }));
    }
  }

return (
  <div dir="rtl" style={{ width:'70vw', alignItems:'center', marginLeft:20, marginRight:20, paddingInline:24 }}>
    {/* Titre au-dessus, comme MesResultats */}
    <span style={styles.pageTitle}>طلبات المشاركة في الدورات</span>

    {/* Toolbar avec bouton back (à droite), comme MesResultats */}
    <div style={styles.toolbar}>
      <div style={styles.toolbarRight}>
        <button onClick={()=>nav('/acceuil')} style={styles.circleRedBtn} aria-label="رجوع"><ArrowRightIcon/></button>
      </div>
    </div>
    <div style={styles.redLine} />

    {loading && <div style={{ color:'#6b7280' }}>… جارِ التحميل</div>}
    {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

    <div style={{ display:'grid', gap:14 }}>
        {rows.map(row => {
          const isOpen = !!open[row.id];
          const dState = detail[row.id];
          const lines = dState?.lines || [];

          return (
            <div key={row.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display:'grid', gap:4 }}>
                  <div style={styles.cardTitle}>{row.TypeSession} — {row.title}</div>
                  <div style={styles.metaLine}>
                    {row.location && <span>{row.location}</span>}
                    {row.location && <span style={{ opacity:.5, paddingInline:6 }}>-</span>}
                    <span>{row.period}</span>
                  </div>
                </div>
                <button onClick={()=>toggleSession(row.id)} style={styles.eyeBtn} title={isOpen ? 'إخفاء' : 'عرض'}>
                  {isOpen ? <EyeOffIcon/> : <EyeIcon/>}
                </button>
              </div>

              {isOpen && (
                <div style={styles.detailWrap}>
                  {(dState?.loading) && <div style={{ color:'#6b7280', padding:8 }}>… جارِ الجلب</div>}
                  {dState?.err && <div style={{ color:'#b91c1c', padding:8 }}>❌ {dState.err}</div>}

                  {(!dState?.loading) && !dState?.err && (
                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.thText}>المرحلة</th>
                            <th style={styles.thSmall}>المعدّل</th>
                            <th style={styles.thSmall}>الرتبة</th>
                            <th style={styles.thText}>القرار</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((ln) => (
                            <tr key={ln.etapeId}>
                              <td style={styles.td}>{ln.nom}</td>
                              <td style={styles.tdCenter}>{Number.isFinite(ln.note) ? ln.note.toFixed(2) : '—'}</td>
                              <td style={styles.tdCenter}>{typeof ln.rank === 'number' ? `#${ln.rank}` : '—'}</td>
                              <td style={styles.td}>{ln.decision}</td>
                            </tr>
                          ))}
                          {!lines.length && (
                            <tr><td colSpan={4} style={{ padding:12, color:'#6b7280' }}>لا توجد نتائج مرئية بعد لهذه الدورة</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && !rows.length && (
          <div style={{ color:'#9ca3af' }}>لا توجد دورات مُسندة لك كمتدرِّب حالياً</div>
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

  detailWrap: { borderTop:'1px dashed #e5e7eb', paddingTop:10 },

  /* tableau simple */
  tableWrap: {
    border:'1px solid #e5e7eb', borderRadius:12, background:'#fff',
    maxHeight:'52vh', overflowY:'auto', overflowX:'hidden'
  },
  table: { width:'100%', borderCollapse:'separate', borderSpacing:0, tableLayout:'fixed' },

  thText:  { position:'sticky' as any, top:0, zIndex:1, background:'#fff', textAlign:'right' as any, padding:'10px 12px', borderBottom:'1px solid #eef2f7' },
  thSmall: { position:'sticky' as any, top:0, zIndex:1, background:'#fff', textAlign:'center' as any, padding:'10px 12px', borderBottom:'1px solid #eef2ف7', width:120 },

  td:       { padding:'10px 12px', borderTop:'1px solid #f3f4f6', verticalAlign:'middle', overflowWrap:'anywhere', wordBreak:'break-word', whiteSpace:'normal' },
  tdCenter: { padding:'10px 12px', borderTop:'1px solid #f3f4f6', verticalAlign:'middle', textAlign:'center' as any },
};
