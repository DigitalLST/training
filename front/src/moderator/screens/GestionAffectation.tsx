import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

type Role = 'director' | 'trainer' | 'assistant' | 'coach' | 'trainee';

type UserLite = {
  _id: string;
  prenom: string;
  nom: string;
  email: string;
  idScout: string;
};

type Assign = {
  user: UserLite;
  role: Role;
};

/* ----------- Contexte navigation ----------- */
type RawCtx = {
  formationId?: string; fid?: string;
  sessionId?: string; sid?: string;
  title?: string; sessionTitle?: string; name?: string;
  type?: string; TypeSession?: string; sessionType?: string;
  period?: string; dates?: string; range?: string;
};

type Ctx = {
  fid?: string | null;
  sid: string;
  title?: string;
  type?: string;
  period?: string;
};

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
  director: 'قائد الدورة',
  trainer: 'قيادة الدورة ـ مدرب',
  assistant: 'قيادة الدورة ـ حامل شارة',
  coach: 'المرشد الفني',
  trainee: 'متدرب',
};

export default function GestionAffectation(): React.ReactElement | null {
  const nav = useNavigate();
  const loc = useLocation() as { state?: Partial<RawCtx> };

  const fromState = React.useMemo(() => normalizeCtx(loc.state), [loc.state]);
  const fromStorage = React.useMemo(() => readCtxFromStorage(), []);

  const [ctx, setCtx] = React.useState<Ctx | null>(() => {
    const base = fromStorage || ({} as Ctx);
    const over = fromState || {};
    return {
      fid: over.fid ?? base?.fid ?? null,
      sid: over.sid || base?.sid || '',
      title: over.title ?? base?.title,
      type: over.type ?? base?.type,
      period: over.period ?? base?.period,
    };
  });

  const [formationInfo, setFormationInfo] = React.useState<{
    nom?: string;
    niveau?: string;
    centreTitle?: string;
    centreRegion?: string;
    branches?: string[];
    sessionTitle?: string;
  } | null>(null);

  /* ---------------- Synchronisation du contexte ---------------- */
  React.useEffect(() => {
    if (fromState) {
      const merged: Ctx = {
        fid: fromState.fid ?? ctx?.fid ?? null,
        sid: fromState.sid || ctx?.sid || '',
        title: fromState.title ?? ctx?.title,
        type: fromState.type ?? ctx?.type,
        period: fromState.period ?? ctx?.period,
      };
      setCtx(merged);
      sessionStorage.setItem(STORE_KEY, JSON.stringify(merged));
    }
  }, [fromState]);

  /* ---------------- Charger les infos de formation si fid change ---------------- */
  React.useEffect(() => {
    (async () => {
      if (!ctx?.fid) return;

      try {
        const f = await api(`/formations/${ctx.fid}`);
        setFormationInfo({
          nom: f?.nom,
          niveau: f?.niveau,
          centreTitle: f?.centre?.title || '',
          centreRegion: f?.centre?.region || '',
          branches: Array.isArray(f?.branches) ? f.branches : [],
          sessionTitle: f?.sessionTitle || '',
        });

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
        console.error('resolve formation info failed', e);
      }
    })();
  }, [ctx?.fid]);

  React.useEffect(() => {
    if (!ctx?.fid) {
      nav('/moderator/gestionparticipant', { replace: true });
    }
  }, [ctx?.fid]);

  if (!ctx?.fid) return null;

  const { fid } = ctx;

  const [sessionTitle, setSessionTitle] = React.useState(ctx.title ?? '');
  React.useEffect(() => setSessionTitle(ctx.title ?? ''), [ctx.title]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [assigns, setAssigns] = React.useState<Assign[]>([]);
  const [initial, setInitial] = React.useState<Assign[]>([]);

  const [role, setRole] = React.useState<Role>('director');
  const [q, setQ] = React.useState('');
  const [sugs, setSugs] = React.useState<UserLite[]>([]);
  const [hi, setHi] = React.useState(0);

  /* ---------------- Charger les affectations existantes ---------------- */
  React.useEffect(() => {
    (async () => {
      if (!fid) return;

      try {
        setLoading(true);
        const list = await api(`/affectations/formations/${fid}/affectations`);

        const mapped: Assign[] = list
          .filter((a: any) => a.user)
          .map((a: any) => ({
            user: {
              _id: a.user._id,
              prenom: a.user.prenom,
              nom: a.user.nom,
              email: a.user.email,
              idScout: a.user.idScout,
            },
            role: a.role as Role,
          }));

        setAssigns(mapped);
        setInitial(mapped);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل التعيينات');
      } finally {
        setLoading(false);
      }
    })();
  }, [fid]);

  /* ---------------- Auto-complétion selon rôle ---------------- */
  React.useEffect(() => {
    if (!fid) return;

    // trainee => liste complète sans recherche
    if (role === 'trainee') {
      (async () => {
        try {
          const res = await api(`/affectations/formations/${fid}/candidates?role=trainee`);
          setSugs(Array.isArray(res) ? res : []);
        } catch (e: any) {
          setErr(e?.message || 'تعذّر تحميل المترشحين');
        }
      })();
      return;
    }

    // autres rôles => recherche live
    if (!q.trim()) {
      setSugs([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set('role', role);
        params.set('q', q.trim());

        const res = await api(`/affectations/formations/${fid}/candidates?${params}`);
        setSugs(Array.isArray(res) ? res : []);
        setHi(0);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر البحث');
      }
    }, 250);

    return () => clearTimeout(t);
  }, [fid, q, role]);

  /* ---------------- Ajout / mise à jour assignation ---------------- */
  function addOrUpdate(u: UserLite, r: Role) {
    setAssigns(prev => {
      const i = prev.findIndex(a => a.user._id === u._id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], role: r };
        return next;
      }
      return [...prev, { user: u, role: r }];
    });
    setQ('');
    if (role !== 'trainee') setSugs([]);
  }

  function removeUser(uid: string) {
    setAssigns(prev => prev.filter(a => a.user._id !== uid));
  }

  function addAllTrainees() {
    const byId = new Map(assigns.map(a => [a.user._id, a]));

    sugs.forEach(u => {
      const existing = byId.get(u._id);
      if (existing) byId.set(u._id, { ...existing, role: 'trainee' });
      else byId.set(u._id, { user: u, role: 'trainee' });
    });

    setAssigns([...byId.values()]);
  }

  /* ---------------- Sauvegarde ---------------- */
  async function onSave() {
    try {
      setSaving(true);

      const toMap = (xs: Assign[]) => new Map(xs.map(a => [a.user._id, a.role]));
      const cur = toMap(assigns);
      const init = toMap(initial);

      const upserts: { userId: string; role: Role }[] = [];
      const deletes: string[] = [];

      cur.forEach((r, uid) => {
        if (!init.has(uid) || init.get(uid) !== r) upserts.push({ userId: uid, role: r });
      });

      init.forEach((_r, uid) => {
        if (!cur.has(uid)) deletes.push(uid);
      });

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

  /* ---------------- Tri des rôles ---------------- */
  const directors = assigns.filter(a => a.role === 'director');
  const trainers = assigns.filter(a => a.role === 'trainer');
  const assistants = assigns.filter(a => a.role === 'assistant');
  const coaches = assigns.filter(a => a.role === 'coach');
  const trainees = assigns.filter(a => a.role === 'trainee');

  /* ---------------- UI ---------------- */
  const formationHeader = React.useMemo(() => {
    if (!formationInfo) return '';
    const parts = [];
    if (formationInfo.nom) parts.push(formationInfo.nom);
    if (formationInfo.centreTitle) parts.push(formationInfo.centreTitle);
    return parts.join(' • ');
  }, [formationInfo]);

  return (
    <div style={{ width: '50vw', paddingInline: 24 }}>
      <span style={styles.pageTitle}>إضافة المشاركين</span>

      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button onClick={() => nav(-1)} style={styles.circleRedBtn}>
            <ArrowRightIcon />
          </button>

          <span>
            {sessionTitle || formationInfo?.sessionTitle || 'جلسة'} | {formationHeader}
          </span>
        </div>
      </div>

      <div style={styles.redLine} />

      <div style={styles.card}>

        {/* Sélecteur rôle + input recherche */}
        <div style={{ display:'grid', gap:8 }}>
          <label style={styles.label}>إضافة قيادة الدورة / المتدربين</label>

          <div style={{ display:'flex', gap:8 }}>

            {/* -------- SELECT DES ROLES -------- */}
            <select
              value={role}
              onChange={e => {
                setRole(e.target.value as Role);
                setQ('');
                setSugs([]);
              }}
              style={styles.selection}
            >
              <option value="director">{ROLE_LABEL.director}</option>
              <option value="trainer">{ROLE_LABEL.trainer}</option>
              <option value="assistant">{ROLE_LABEL.assistant}</option>
              <option value="coach">{ROLE_LABEL.coach}</option>
              <option value="trainee">{ROLE_LABEL.trainee}</option>
            </select>

            {role !== 'trainee' && (
              <>
                <input
                  style={styles.input}
                  placeholder="البريد / المعرف الكشفي / الاسم / اللقب"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => sugs[hi] && addOrUpdate(sugs[hi], role)}
                  style={styles.squareRedBtn}
                  disabled={!sugs.length}
                >
                  <PlusIcon />
                </button>
              </>
            )}
          </div>

          {/* DROPDOWN suggestions */}
          {role !== 'trainee' && sugs.length > 0 && q.trim() && (
            <div style={styles.dropdown}>
              {sugs.map((u, i) => (
                <button
                  key={u._id}
                  onClick={() => addOrUpdate(u, role)}
                  style={{
                    ...styles.suggestion,
                    background: i === hi ? 'rgba(226,5,20,.08)' : '#fff',
                  }}
                >
                  <div style={{ fontWeight:800 }}>{u.prenom} {u.nom}</div>
                  <div style={{ fontSize:13, opacity:.85 }}>{u.email}</div>
                  <div style={{ fontSize:12, opacity:.75 }}>#{u.idScout}</div>
                </button>
              ))}
            </div>
          )}

          {/* LISTE CANDIDATS TRAINEE */}
          {role === 'trainee' && (
            <div style={{ display:'grid', gap:8 }}>
              <div style={{ display:'flex', gap:8 }}>
                <button
                  type="button"
                  onClick={addAllTrainees}
                  disabled={!sugs.length}
                  style={styles.pillPrimarySmall}
                >
                  إضافة الكل
                </button>
              </div>

              <div style={styles.candidateWrap}>
                {sugs.map(u => {
                  const selected = trainees.some(a => a.user._id === u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => selected
                        ? removeUser(u._id)
                        : addOrUpdate(u, 'trainee')
                      }
                      style={{
                        ...styles.chip,
                        background: selected ? RED : '#fff',
                        color: selected ? '#fff' : '#111',
                        borderColor: selected ? RED : '#e5e7eb',
                      }}
                    >
                      <span>{u.prenom} {u.nom}</span>
                      <span style={{ fontSize:12, opacity:.85 }}>#{u.idScout}</span>
                    </button>
                  );
                })}
                {!sugs.length && (
                  <Empty>لا يوجد مترشحون لهذه الدورة</Empty>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ----------- LISTES PAR RÔLE ----------- */}
        <List title={ROLE_LABEL.director}>
          {directors.map(a => (
            <Chip
              key={a.user._id}
              label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
              onRemove={() => removeUser(a.user._id)}
            />
          ))}
          {!directors.length && <Empty>لم يتم إضافة قائد الدورة بعد</Empty>}
        </List>

        <List title={ROLE_LABEL.trainer}>
          {trainers.map(a => (
            <Chip
              key={a.user._id}
              label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
              onRemove={() => removeUser(a.user._id)}
            />
          ))}
          {!trainers.length && <Empty>لم يتم إضافة المدربين بعد</Empty>}
        </List>

        <List title={ROLE_LABEL.assistant}>
          {assistants.map(a => (
            <Chip
              key={a.user._id}
              label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
              onRemove={() => removeUser(a.user._id)}
            />
          ))}
          {!assistants.length && <Empty>لم يتم إضافة حاملي الشارة بعد</Empty>}
        </List>

        <List title={ROLE_LABEL.coach}>
          {coaches.map(a => (
            <Chip
              key={a.user._id}
              label={`${a.user.prenom} ${a.user.nom} — ${ROLE_LABEL[a.role]}`}
              onRemove={() => removeUser(a.user._id)}
            />
          ))}
          {!coaches.length && <Empty>لم يتم إضافة المرشد الفني بعد</Empty>}
        </List>

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <List title={ROLE_LABEL.trainee}>
            {trainees.map(a => (
              <Chip
                key={a.user._id}
                label={`${a.user.prenom} ${a.user.nom}`}
                onRemove={() => removeUser(a.user._id)}
              />
            ))}
            {!trainees.length && <Empty>لم يتم إضافة المتدربين بعد</Empty>}
          </List>
        </div>

        {loading && <div style={{ color:'#666' }}>…جاري التحميل</div>}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

        {/* ACTIONS */}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(STORE_KEY);
              nav('/moderator/gestionparticipant');
            }}
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

/* --------- UI helpers --------- */
function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border:'1px solid #eef1f5', borderRadius:14, padding:12 }}>
      <div style={{ fontWeight:800, marginBottom:8 }}>{title}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{children}</div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div style={styles.chip}>
      <span>{label}</span>
      <button onClick={onRemove} style={styles.chipX}>×</button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ opacity:.65 }}>{children}</div>;
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M8 5l8 7-8 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ----------- styles ----------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', justifyContent:'space-between', marginTop:20 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  redLine: { height:3, background:RED, borderRadius:2, margin:'8px 0' },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937', marginBottom:50 },
  card: {
    background:'#fff',
    border:'1px solid #e9edf3',
    borderRadius:18,
    padding:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    display:'grid',
    gap:20,
  },
  label: { fontSize:14, fontWeight:700, color:'#444' },
  input: { border:'1px solid #e5e7eb', borderRadius:12, padding:'10px', width:400 },
  selection: { border:'1px solid #e5e7eb', borderRadius:12, padding:'10px', minWidth:240 },
  dropdown: { border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden' },
  suggestion: { textAlign:'right', padding:'10px', border:0, cursor:'pointer' },

  chip: {
    display:'flex', alignItems:'center', gap:8,
    border:'1px solid #e5e7eb', borderRadius:999,
    padding:'6px 10px',
  },
  chipX: {
    border:0, background:'transparent',
    color:'#e11d48', fontSize:20, cursor:'pointer'
  },

  candidateWrap: { display:'flex', flexWrap:'wrap', gap:8 },
  actions: { display:'flex', justifyContent:'flex-end', gap:10 },

 circleRedBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: 'transparent',
    border: `3px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },

  squareRedBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: 'transparent',
    border: `3px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },

  pillPrimary: {
    padding:'10px 16px',
    borderRadius:999,
    background:RED,
    color:'#fff',
    border:`1px solid ${RED}`,
  },

  pillGhost: {
    padding:'10px 16px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:'transparent',
    color:RED,
  },

  pillPrimarySmall: {
    padding:'6px 12px',
    borderRadius:999,
    background:RED,
    color:'#fff',
    border:`1px solid ${RED}`,
    fontSize:13,
  },
};
