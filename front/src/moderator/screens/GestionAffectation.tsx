// src/screens/GestionAffectation.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

type Role = 'trainer' | 'trainee' | 'director';
type UserLite = { _id: string; prenom: string; nom: string; email: string; idScout: string };
type Assign = { user: UserLite; role: Role };

// Contexte: on accepte formationId *ou* sessionId selon d'où on vient
type RawCtx = {
  formationId?: string; fid?: string; // navigation depuis liste formations
  sessionId?: string; sid?: string;   // navigation depuis une session
  title?: string; sessionTitle?: string; name?: string;
  type?: string; TypeSession?: string; sessionType?: string;
  period?: string; dates?: string; range?: string;
};

type Ctx = {
  sid: string;                    // sessionId résolu (utile pour l’en-tête)
  fid?: string | null;            // formationId obligatoire pour les affectations
  title?: string;
  type?: string;
  period?: string;
};

// lecture / stockage local (pour garder le contexte au retour)
const STORE_KEY = 'aff_ctx_v2';

function readCtxFromStorage(): Ctx | null {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); }
  catch { return null; }
}

function normalizeCtx(raw: RawCtx | null | undefined): Partial<Ctx> | null {
  if (!raw) return null;
  const fid = raw.formationId ?? raw.fid ?? undefined;
  const sid = raw.sessionId ?? raw.sid ?? undefined;
  return {
    fid: fid || undefined,
    sid: sid || '',
    title: raw.title ?? raw.sessionTitle ?? raw.name,
    type: raw.type ?? raw.TypeSession ?? raw.sessionType,
    period: raw.period ?? raw.dates ?? raw.range,
  };
}

const RED = '#e20514';
const ROLE_LABEL: Record<Role, string> = {
  trainer: 'قيادة الدورة',
  trainee: 'متدرب',
  director: 'قائد الدورة',
};

export default function GestionAffectation(): React.ReactElement | null {
  const nav = useNavigate();
  const loc = useLocation() as { state?: Partial<RawCtx> };

  const fromState = React.useMemo(() => normalizeCtx(loc.state), [loc.state]);
  const fromStorage = React.useMemo(() => readCtxFromStorage(), []);
  // on fusionne: priorité au state, puis storage
  const [ctx, setCtx] = React.useState<Ctx | null>(() => {
    const base = fromStorage || ({} as Ctx);
    const over = fromState || {};
    return {
      fid: over.fid ?? (base?.fid ?? null),
      sid: over.sid || base?.sid || '',
      title: over.title ?? base?.title,
      type: over.type ?? base?.type,
      period: over.period ?? base?.period,
    };
  });

  // ---- infos formation pour l’en-tête ----
  const [formationInfo, setFormationInfo] = React.useState<{
    nom?: string;
    niveau?: string;
    centreTitle?: string;
    centreRegion?: string;
    branches?: string[];
    sessionTitle?: string;
  } | null>(null);

  // si on a reçu du state, on persiste
  React.useEffect(() => {
    if (fromState) {
      const merged: Ctx = {
        fid: (fromState.fid ?? ctx?.fid) ?? null,
        sid: fromState.sid || ctx?.sid || '',
        title: fromState.title ?? ctx?.title,
        type: fromState.type ?? ctx?.type,
        period: fromState.period ?? ctx?.period,
      };
      setCtx(merged);
      sessionStorage.setItem(STORE_KEY, JSON.stringify(merged));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromState]);

  // Résoudre sessionId + charger détails formation via /formations/:fid
  React.useEffect(() => {
    (async () => {
      if (!ctx) return;
      if (!ctx.fid) return; // formationId requis désormais

      try {
        const f = await api(`/formations/${ctx.fid}`);
        // f: { sessionId, sessionTitle, niveau, nom, branches, centre:{title,region}, ... }
        // 1) set header formation details
        setFormationInfo({
          nom: f?.nom,
          niveau: f?.niveau,
          centreTitle: f?.centre?.title || '',
          centreRegion: f?.centre?.region || '',
          branches: Array.isArray(f?.branches) ? f.branches : [],
          sessionTitle: f?.sessionTitle || '',
        });
        // 2) resolve / compléter sessionId + titre session
        if (!ctx.sid || !ctx.title) {
          const next: Ctx = {
            fid: ctx.fid,
            sid: String(f.sessionId || ctx.sid || ''),
            title: ctx.title ?? f.sessionTitle,
            type: ctx.type ?? '',
            period: ctx.period ?? '',
          };
          setCtx(next);
          sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
        }
      } catch (e) {
        console.error('resolve session/formation failed', e);
      }
    })();
  }, [ctx]);

  // garde-fou: sans formation id -> back
  React.useEffect(() => {
    if (!ctx?.fid) {
      nav('/moderator/gestionparticipant', { replace: true });
    }
  }, [ctx?.fid, nav]);

  if (!ctx?.fid) return null; // le temps du redirect éventuel

  // -------- état data & UI --------
  const { sid, fid } = ctx;
  const [sessionTitle, setSessionTitle] = React.useState(ctx.title ?? '');
  const [sessionType, setSessionType]   = React.useState(ctx.type ?? '');
  const [period, setPeriod]             = React.useState(ctx.period ?? '');

  React.useEffect(() => { setSessionTitle(ctx.title ?? ''); }, [ctx.title]);
  React.useEffect(() => { setSessionType(ctx.type ?? ''); }, [ctx.type]);
  React.useEffect(() => { setPeriod(ctx.period ?? ''); }, [ctx.period]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);
  const [err, setErr]         = React.useState<string|null>(null);

  const [assigns, setAssigns] = React.useState<Assign[]>([]);
  const [initial, setInitial] = React.useState<Assign[]>([]);

  const [role, setRole] = React.useState<Role>('trainee');
  const [q, setQ]       = React.useState('');
  const [sugs, setSugs] = React.useState<UserLite[]>([]);
  const [hi, setHi]     = React.useState(0);

  // charge les affectations existantes (par formation)
  React.useEffect(() => {
    (async () => {
      if (!fid) return;
      try {
        setLoading(true);
        setErr(null);
        const list = await api(`/affectations/formations/${fid}/affectations`);
        const mapped: Assign[] = (list || []).map((a: any) => ({ user: a.user, role: a.role as Role }));
        setAssigns(mapped);
        setInitial(mapped);
      } catch (e: any) {
        setErr(e?.message || 'تعذر تحميل التعيينات');
      } finally {
        setLoading(false);
      }
    })();
  }, [fid]);

  // auto-complétion via endpoints candidats (par formation)
  React.useEffect(() => {
    if (!q.trim()) { setSugs([]); return; }
    const t = setTimeout(async () => {
      try {
        setErr(null);
        if (!fid) {
          setSugs([]);
          setErr('formationId manquant');
          return;
        }
        const params = new URLSearchParams();
        params.set('role', role);
        params.set('q', q.trim());

        const res = await api(`/affectations/formations/${fid}/candidates?${params.toString()}`);
        setSugs(Array.isArray(res) ? res : []);
        setHi(0);
      } catch (e: any) {
        setErr(e?.message || 'تعذر البحث');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, role, fid]);

  function addOrUpdate(u: UserLite, r: Role) {
    setAssigns(prev => {
      const i = prev.findIndex(a => a.user._id === u._id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], role: r }; // un seul rôle par user sur la formation
        return next;
      }
      return [...prev, { user: u, role: r }];
    });
    setQ(''); setSugs([]); setHi(0);
  }

  function removeUser(uid: string) {
    setAssigns(prev => prev.filter(a => a.user._id !== uid));
  }

  async function onSave() {
    try {
      setSaving(true); setErr(null);

      // diff calcul
      const toMap = (xs: Assign[]) => new Map(xs.map(a => [a.user._id, a.role]));
      const cur = toMap(assigns);
      const init = toMap(initial);

      const upserts: { userId: string; role: Role }[] = [];
      cur.forEach((r, uid) => {
        if (!init.has(uid) || init.get(uid) !== r) upserts.push({ userId: uid, role: r });
      });

      const deletes: string[] = [];
      init.forEach((_r, uid) => { if (!cur.has(uid)) deletes.push(uid); });

      await api(`/affectations/formations/${fid}/affectations/diff`, {
        method: 'POST',
        body: JSON.stringify({ upserts, deletes }),
      });

      setInitial(assigns);
      alert('تم الحفظ');
      nav(-1);
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!sugs.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % sugs.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + sugs.length) % sugs.length); }
    else if (e.key === 'Enter') { e.preventDefault(); sugs[hi] && addOrUpdate(sugs[hi], role); }
  }

  const director = assigns.filter(a => a.role === 'director');
  const trainers = assigns.filter(a => a.role === 'trainer');
  const trainees = assigns.filter(a => a.role === 'trainee');

  // ——— header composed title ———
  const formationHeader = React.useMemo(() => {
    if (!formationInfo) return '';
    const parts: string[] = [];
    if (formationInfo.nom) parts.push(formationInfo.nom);
    const centre = [formationInfo.centreTitle].filter(Boolean).join(' ');
    if (centre) parts.push(centre);
    return parts.join(' • ');
  }, [formationInfo]);

  return (
    <div
      style={{
        width: '50vw',
        alignItems: 'center',
        marginLeft: 20,
        marginRight: 20,
        paddingInline: 24,
      }}
    >
      <span style={styles.pageTitle}>إضافة المشاركين</span>

      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button
            onClick={() => nav(-1)}
            style={styles.circleRedBtn}
            aria-label="رجوع"
          >
            <ArrowRightIcon />
          </button>

          <span>
            {/* Session side */}
            {sessionTitle || formationInfo?.sessionTitle || 'جلسة'}

            {/* Separator */}
            {' | '}

            {/* Formation details */}
            {formationHeader}
          </span>
        </div>
      </div>

      <div style={styles.redLine} />

      <div style={styles.card}>
        <div style={{ display:'grid', gap:8 }}>
          <label style={styles.label}>إضافة متدرب / قيادة الدورة</label>
          <div style={{ display:'flex', gridTemplateColumns:'1fr 220px 56px', gap:8 }}>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              style={styles.selection}
            >
              <option value="trainee">{ROLE_LABEL.trainee}</option>
              <option value="trainer">{ROLE_LABEL.trainer}</option>
              <option value="director">{ROLE_LABEL.director}</option>
            </select>

            <input
              style={styles.input}
              placeholder="البريد / المعرف الكشفي / الاسم / اللقب"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              onClick={() => sugs[hi] && addOrUpdate(sugs[hi], role)}
              style={styles.squareRedBtn}
              title="إضافة"
              disabled={!sugs.length}
            >
              <PlusIcon />
            </button>
          </div>

          {q.trim() && sugs.length > 0 && (
            <div style={styles.dropdown}>
              {sugs.map((u, i) => (
                <button
                  key={u._id}
                  onClick={() => addOrUpdate(u, role)}
                  style={{ ...styles.suggestion, background: i === hi ? 'rgba(226,5,20,.08)' : '#fff' }}
                >
                  <div style={{ fontWeight: 800 }}>{u.prenom} {u.nom}</div>
                  <div style={{ opacity: .85, fontSize: 13 }}>{u.email}</div>
                  <div style={{ opacity: .75, fontSize: 12 }}>#{u.idScout}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <List title="قائد الدورة">
            {director.map(a => (
              <Chip
                key={a.user._id}
                label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
                onRemove={() => removeUser(a.user._id)}
              />
            ))}
            {!director.length && <Empty>لم يتم اضافة قيادة الدورة بعد</Empty>}
          </List>

          <List title="قيادة الدورة">
            {trainers.map(a => (
              <Chip
                key={a.user._id}
                label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
                onRemove={() => removeUser(a.user._id)}
              />
            ))}
            {!trainers.length && <Empty>لم يتم اضافة قيادة الدورة بعد</Empty>}
          </List>

          <List title="المتدربون">
            {trainees.map(a => (
              <Chip
                key={a.user._id}
                label={`${a.user.prenom} ${a.user.nom}`}
                onRemove={() => removeUser(a.user._id)}
              />
            ))}
            {!trainees.length && <Empty>لم يتم اضافة المتدربين بعد</Empty>}
          </List>
        </div>

        {loading && <div style={{ color:'#6b7280' }}>… جاري التحميل</div>}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => { sessionStorage.removeItem(STORE_KEY); nav('/moderator/gestionparticipant'); }}
            disabled={saving}
            style={styles.pillGhost}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={styles.pillPrimary}
          >
            {saving ? '... جارٍ الحفظ' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- UI helpers ---- */
function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border:'1px solid #eef1f5', borderRadius:14, padding:12 }}>
      <div style={{ fontWeight:800, marginBottom:8 }}>{title}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{children}</div>
    </div>
  );
}
function Chip({ label, onRemove }: { label: string; onRemove: ()=>void }) {
  return (
    <div style={styles.chip}>
      <span>{label}</span>
      <button onClick={onRemove} style={styles.chipX} title="إزالة">×</button>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ opacity:.65, padding:'6px 0' }}>{children}</div>;
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---- styles ---- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
  },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8 },
  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937', marginBottom: 100 },
  card: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)', padding:18, display:'grid', gap:12, maxWidth: 960
  },
  label: { color:'#6b7280', fontSize:14, fontWeight:700 },
  input: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px',
    fontSize:16, outline:'none', width:400,
  },
  selection: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px', width:200,
    fontSize:16, outline:'none',
  },
  dropdown: { border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' },
  suggestion: { width:'100%', textAlign:'right', padding:'10px 12px', border:0, cursor:'pointer' },

  actions: { display:'flex', gap:10, justifyContent:'flex-end', marginTop:6 },

  pillPrimary: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:700,
  },
  pillGhost: {
    padding:'10px 16px', borderRadius:999, border:`1px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:700,
  },
  squareRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },

  chip: {
    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
    background:'#fff', border:'1px solid #e5e7eb', borderRadius:999,
    boxShadow:'0 2px 8px rgba(0,0,0,.05)'
  },
  chipX: { border:0, background:'transparent', color:'#e11d48', fontSize:18, cursor:'pointer', lineHeight:1 },
  circleRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  item: {
    width: '97%', background: '#fff', borderRadius: 22, border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)', padding: '16px 18px',
    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 78,
  },
  itemRight: { display: 'grid', justifyItems: 'start' },
  itemTitle: { fontSize: 18, fontWeight: 200, color: '#374151' },
};
