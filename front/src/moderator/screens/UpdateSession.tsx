import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type ApiSession = {
  _id: string;
  title: string;
  startDate: string; // ISO
  endDate: string;
  inscriptionStartDate: string;
  inscriptionEndDate: string;
  trainingLevels: string[]; 
  branche: string[];// ⬅️ array, pas string
};

// constants (libellés)
const LEVEL_WOODBADGE = 'شارة خشبية';
const LEVEL_PREP      = 'تمهيدية';
const Rover='جوالة';
const Ranger='دليلات';
const Scout='كشافة';
const Guide='مرشدات';
const Cub='أشبال';
const Brownie='زهرات';
const Beaver='عصافير';
const pioneer='رواد';

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

/* ------------ helpers réseau ------------- */
async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  ms = 10000,
  externalSignal?: AbortSignal
) {
  if (externalSignal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort((externalSignal as any).reason ?? 'aborted');
    externalSignal.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([
        fetch(input, { ...init, signal: ctrl.signal }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), ms)
        ),
      ]);
    } finally {
      externalSignal.removeEventListener('abort', onAbort);
    }
  }

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort('timeout'), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  baseDelay = 500
) {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, init, 10000, (init as any)?.signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i))); // 0.5s, 1s, 2s
    }
  }
  throw lastErr;
}

export default function EditSession(): React.JSX.Element {
  const nav = useNavigate();
  const { id = '' } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // chrono loader (diagnostic)
  const [elapsedMs, setElapsedMs] = useState(0);
  const loaderTimerRef = useRef<number | null>(null);

  // champs éditables
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(''); // "YYYY-MM-DD"
  const [endDate, setEndDate] = useState('');
  const [inscriptionStartDate, setinscriptionStartDate] = useState('');
  const [inscriptionEndDate, setinscriptionEndDate] = useState('');
  const [trainingLevels, setTrainingLevels] = useState<string[]>([]);
  const [branche, setBranche] = useState<string[]>([]);

  function toggleLevel(level: string) {
    setTrainingLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  }
    function toggleBranch(branch: string) {
    setBranche(prev =>
      prev.includes(branch) ? prev.filter(l => l !== branch) : [...prev, branch]
    );
  }

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  // ⛔️ Guard contre le double useEffect en dev (StrictMode)
  const didFetchRef = useRef(false);

  // charger la session (cache + retry + timeout + guard)
  useEffect(() => {
    if (!id) return;
    if (didFetchRef.current) return;     // ← évite le double fetch StrictMode dev
    didFetchRef.current = true;

    const ac = new AbortController();

    const startTs = performance.now();
    setElapsedMs(0);
    if (loaderTimerRef.current) window.clearInterval(loaderTimerRef.current);
    loaderTimerRef.current = window.setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startTs));
    }, 100);

    const cacheKey = `session:${id}`;

    // 1) lecture cache immédiate (si déjà visité)
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        const s: ApiSession = JSON.parse(cachedStr);
        startTransition(() => {
          setTitle(s.title ?? '');
          setStartDate(s.startDate ? s.startDate.slice(0, 10) : '');
          setEndDate(s.endDate ? s.endDate.slice(0, 10) : '');
          setinscriptionStartDate(s.inscriptionStartDate ? s.inscriptionStartDate.slice(0, 10) : '');
          setinscriptionEndDate(s.inscriptionEndDate ? s.inscriptionEndDate.slice(0, 10) : '');
          setTrainingLevels(Array.isArray(s.trainingLevels) ? s.trainingLevels : []);
          setBranche(Array.isArray(s.branche) ? s.branche : []);
          setLoading(false); // show immédiat
        });
      } catch {
        // ignore cache corrompu
      }
    }

    // 2) fetch réseau (rafraîchit l'écran + alimente le cache)
    (async () => {
      try {
        setErr(null);
        if (!cachedStr) setLoading(true);

        const url = `${API_BASE}/sessions/${id}?ts=${Date.now()}`;
        const res = await fetchWithRetry(url, { headers, cache: 'no-store', signal: ac.signal });

        const s: ApiSession = await res.json();
        if (ac.signal.aborted) return;

        // write-through cache
        sessionStorage.setItem(cacheKey, JSON.stringify({
          _id: s._id,
          title: s.title ?? '',
          startDate: s.startDate ?? '',
          endDate: s.endDate ?? '',
          inscriptionStartDate: s.inscriptionStartDate ?? '',
          inscriptionEndDate: s.inscriptionEndDate ?? '',
          trainingLevels: Array.isArray(s.trainingLevels) ? s.trainingLevels : [],
          branche: Array.isArray(s.branche) ? s.branche : [],
        }));

        startTransition(() => {
          setTitle(s.title ?? '');
          setStartDate(s.startDate ? s.startDate.slice(0, 10) : '');
          setEndDate(s.endDate ? s.endDate.slice(0, 10) : '');
          setinscriptionStartDate(s.inscriptionStartDate ? s.inscriptionStartDate.slice(0, 10) : '');
          setinscriptionEndDate(s.inscriptionEndDate ? s.inscriptionEndDate.slice(0, 10) : '');
          setTrainingLevels(Array.isArray(s.trainingLevels) ? s.trainingLevels : []);
          setBranche(Array.isArray(s.branche) ? s.branche : []);
          setNotFound(false);
          setLoading(false);
        });
      } catch (e: any) {
        if (ac.signal.aborted) return;
        if (e?.message?.includes('HTTP 404')) {
          setNotFound(true);
        } else {
          setErr(e.message || 'تعذر الجلب');
        }
        setLoading(false);
      } finally {
        if (loaderTimerRef.current) {
          window.clearInterval(loaderTimerRef.current);
          loaderTimerRef.current = null;
        }
        const total = Math.round(performance.now() - startTs);
        // Diagnostic console
        // eslint-disable-next-line no-console
        console.log(`[EditSession] Chargement terminé en ${total}ms (cache=${!!cachedStr})`);
      }
    })();

    return () => {
      ac.abort();
      if (loaderTimerRef.current) {
        window.clearInterval(loaderTimerRef.current);
        loaderTimerRef.current = null;
      }
    };
  }, [id, headers]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!title.trim()) return setErr('يرجى إدخال العنوان');
    if (!startDate || !endDate) return setErr('تاريخا البداية والنهاية إجباريان');
    if (new Date(endDate) < new Date(startDate)) return setErr('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    if (trainingLevels.length === 0) return setErr('اختر المستوى التدريبي (شارة خشبية أو تمهيدية)');
    if (branche.length === 0) return setErr('اختر القسم الفني');

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'PATCH',
        headers,
        cache: 'no-store',
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          endDate,
          inscriptionStartDate,
          inscriptionEndDate,
          trainingLevels,
          branche,
          // ⚠️ on NE PASSE PAS typeSession ici (non modifiable)
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // MAJ cache locale pour un ressenti instantané en revenant à la liste
      const cacheKey = `session:${id}`;
      sessionStorage.setItem(cacheKey, JSON.stringify({
        _id: id,
        title: title.trim(),
        startDate,
        endDate,
        inscriptionStartDate,
        inscriptionEndDate,
        trainingLevels,
        branche,
      }));

      nav('/moderator/sessions');
    } catch (e: any) {
      setErr(e.message || 'تعذر التحديث');
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div dir="rtl" style={{ display:'grid', gap:16 }}>
        <div style={styles.toolbar}>
          <div style={styles.toolbarRight}>
            <button onClick={() => nav('/moderator/gestionsessions')} style={styles.circleRedBtn} aria-label="رجوع"><ArrowRightIcon/></button>
            <span style={styles.pageTitle}>الدورة غير موجودة</span>
          </div>
          <div style={{ width:46, height:46 }} />
        </div>
        <div style={styles.redLine} />
        <div style={{ color:'#b91c1c' }}>❌ لا توجد دورة بهذا المعرف.</div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ display:'grid', gap:16 }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={() => nav(-1)} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>تعديل دورة تدريبية</span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      {loading ? (
        <div style={{ color:'#6b7280' }}>
          … جاري التحميل
          {elapsedMs > 400 && (
            <span style={{ marginInlineStart: 8, fontSize: 12, opacity: 0.7 }}>
              ({elapsedMs} ms)
            </span>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} style={styles.form} noValidate>
          {/* Titre */}
          <div style={styles.field}>
            <label style={styles.label}>العنوان <span style={{color:RED}}>*</span></label>
            <input
              type="text"
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="عنوان الدورة"
              style={styles.input}
              required
            />
          </div>

          {/* Dates */}
          <div style={styles.row2}>
            <div style={styles.field}>
              <label style={styles.label}>تاريخ البداية <span style={{color:RED}}>*</span></label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={styles.input} required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>تاريخ النهاية <span style={{color:RED}}>*</span></label>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={styles.input} required />
            </div>
          </div>

          <div style={styles.row2}>
            <div style={styles.field}>
              <label style={styles.label}>تاريخ بداية التسجيل <span style={{color:RED}}>*</span></label>
              <input type="date" value={inscriptionStartDate} onChange={e=>setinscriptionStartDate(e.target.value)} style={styles.input} required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>تاريخ نهاية التسجيل <span style={{color:RED}}>*</span></label>
              <input type="date" value={inscriptionEndDate} onChange={e=>setinscriptionEndDate(e.target.value)} style={styles.input} required />
            </div>
          </div>

          {/* المستوى التدريبي */}
          <div style={styles.field}>
            <label style={styles.label}>المستوى التدريبي <span style={{color:RED}}>*</span></label>

            <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input
                  type="checkbox"
                  checked={trainingLevels.includes(LEVEL_WOODBADGE)}
                  onChange={() => toggleLevel(LEVEL_WOODBADGE)}
                />
                <span>{LEVEL_WOODBADGE}</span>
              </label>

              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input
                  type="checkbox"
                  checked={trainingLevels.includes(LEVEL_PREP)}
                  onChange={() => toggleLevel(LEVEL_PREP)}
                />
                <span>{LEVEL_PREP}</span>
              </label>
            </div>
          </div>
        {/* القسم الفني */}
          <div style={styles.field}>
            <label style={styles.label}>القسم الفني <span style={{color:RED}}>*</span></label>

            <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input
                 type="checkbox"
                 checked={branche.includes(Rover)}
                 onChange={() => toggleBranch(Rover)}
                />
               <span>{Rover}</span>
             </label>

             <label style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input
        type="checkbox"
        checked={branche.includes(Ranger)}
        onChange={() => toggleBranch(Ranger)}
              />
              <span>{Ranger}</span>
             </label>
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(Scout)}
        onChange={() => toggleBranch(Scout)}
      />
      <span>{Scout}</span>
    </label>  
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(Guide)}
        onChange={() => toggleBranch(Guide)}
      />
      <span>{Guide}</span>
    </label> 
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(Cub)}
        onChange={() => toggleBranch(Cub)}
      />
      <span>{Cub}</span>
    </label>  
     <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(Brownie)}
        onChange={() => toggleBranch(Brownie)}
      />
      <span>{Brownie}</span>
    </label>  
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(Beaver)}
        onChange={() => toggleBranch(Beaver)}
      />
      <span>{Beaver}</span>
    </label> 
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input
        type="checkbox"
        checked={branche.includes(pioneer)}
        onChange={() => toggleBranch(pioneer)}
      />
      <span>{pioneer}</span>
    </label>                        
  </div>
</div>       

          {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

          <div style={styles.actions}>
            <button type="button" onClick={()=>nav('/moderator/sessions')} style={styles.pillGhost}>إلغاء</button>
            <button type="submit" disabled={submitting} style={styles.pillPrimary}>
              {submitting ? '... جارٍ الحفظ' : 'حفظ'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* --------- styles (repris de AddSession) --------- */
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
  input: { border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px', fontSize:16, outline:'none' },
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

/* --------- icône --------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
