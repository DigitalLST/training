import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/UseAuth';

const RED = '#e20514';

type AdminAccess = 'simple' | 'cn_president' | 'cn_commissioner';

type MandateLite = {
  _id: string;
  type: 'cn_president' | 'cn_commissioner' | 'regional_president';
  startDate: string;
  endDate?: string | null;
  active?: boolean;
};

type UserLite = {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  idScout: string;
  region?: string;
  role?: 'user' | 'moderator' | 'admin';
  adminAccess?: AdminAccess;
  mandates?: MandateLite[];
};

export default function GestionAdmins(): React.JSX.Element {
  const nav = useNavigate();
  const { user: me } = useAuth();
  const myId = me?._id;

  // recherche
  const [q, setQ] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<UserLite[]>([]);
  const [highlight, setHighlight] = React.useState(0);

  // sélection courante (user choisi pour ajout/maj)
  const [selected, setSelected] = React.useState<UserLite | null>(null);
  const [adminAccess, setAdminAccess] = React.useState<AdminAccess>('simple');
  const [mandateStartDate, setMandateStartDate] = React.useState<string>('');

  // liste admins
  const [admins, setAdmins] = React.useState<UserLite[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  /* --------- chargement liste admins --------- */
  const loadAdmins = React.useCallback(async () => {
    try {
      setErr(null);
      const list: UserLite[] = await api('/admins'); // GET /api/admins
      setAdmins(list || []);
    } catch (e: any) {
      setErr(e?.message || 'تعذر تحميل قائمة الإداريين');
    }
  }, []);

  React.useEffect(() => { loadAdmins(); }, [loadAdmins]);

  /* --------- recherche users (debounce) --------- */
  React.useEffect(() => {
    setOk(null);
    if (!q.trim()) { setSuggestions([]); setHighlight(0); return; }

    const t = setTimeout(async () => {
      try {
        const res: UserLite[] = await api(`/users/search?q=${encodeURIComponent(q.trim())}`);
        setSuggestions(res || []);
        setHighlight(0);
      } catch (e: any) {
        setErr(e?.message || 'تعذر البحث');
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q]);

  /* --------- sélection user --------- */
  function pickUser(u: UserLite) {
    setSelected(u);
    setAdminAccess(u.adminAccess || (u.role === 'admin' ? 'simple' : 'simple'));
    setMandateStartDate('');
    setQ('');
    setSuggestions([]);
    setOk(null);
    setErr(null);
  }

  /* --------- clavier dans la zone de recherche --------- */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickUser(suggestions[highlight]);
    }
  }

  /* --------- promotion / mise à jour admin --------- */
  async function saveAdmin() {
    if (!selected) return;

    try {
      setLoading(true);
      setErr(null); setOk(null);

      const payload: any = {
        makeAdmin: true,
        adminAccess,
      };

      // si rôle signataire → on peut envoyer une date de début de mandat
      if (adminAccess !== 'simple' && mandateStartDate) {
        payload.mandateStartDate = mandateStartDate; // ex: '2025-12-31'
      }

      await api(`/admins/${selected._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setOk('تم حفظ بيانات المشرف الإداري');
      setSelected(null);
      setAdminAccess('simple');
      setMandateStartDate('');
      await loadAdmins();
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحفظ');
    } finally {
      setLoading(false);
    }
  }

  /* --------- suppression admin (→ user) --------- */
  async function removeAdmin(u: UserLite) {
    if (u._id === myId) return; // منع إزالة نفسك
    try {
      setLoading(true);
      setErr(null); setOk(null);
      await api(`/admins/${u._id}`, { method: 'DELETE' });
      await loadAdmins();
      setOk('تمت الإزالة');
    } catch (e: any) {
      setErr(e?.message || 'تعذر الإزالة');
    } finally {
      setLoading(false);
    }
  }

  /* --------- ajout mandat (si non simple) --------- */
  async function addMandate() {
    if (!selected) return;
    if (adminAccess === 'simple') return;
    if (!mandateStartDate) {
      setErr('الرجاء تحديد تاريخ بداية النيابة');
      return;
    }
    try {
      setLoading(true);
      setErr(null); setOk(null);

      await api(`/admins/${selected._id}/mandates`, {
        method: 'POST',
        body: JSON.stringify({
          type: adminAccess === 'cn_president' ? 'cn_president' : 'cn_commissioner',
          startDate: mandateStartDate,
        }),
      });

      setOk('تم تسجيل النيابة');
      setMandateStartDate('');
      await loadAdmins();
    } catch (e: any) {
      setErr(e?.message || 'تعذر تسجيل النيابة');
    } finally {
      setLoading(false);
    }
  }

  /* --------- helpers affichage mandat / adminAccess --------- */
  function labelAdminAccess(a?: AdminAccess) {
    if (a === 'cn_president') return 'رئيس اللجنة الوطنية';
    if (a === 'cn_commissioner') return 'القائد العام';
    return 'مشرف إداري (عادي)';
  }

  function labelMandateType(t: MandateLite['type']) {
    if (t === 'cn_president') return 'رئيس اللجنة الوطنية';
    if (t === 'cn_commissioner') return 'القائد العام';
    if (t === 'regional_president') return 'رئيس لجنة جهوية';
    return t;
  }

  function formatDate(d?: string | null) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('fr-TN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return d;
    }
  }

  const selectedMandates: MandateLite[] =
    (selected?.mandates || []).map(m => ({
      ...m,
      active: m.endDate ? false : true,
    }));

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={() => nav('/admin/')}
            style={styles.circleRedBtn}
            aria-label="رجوع"
          >
            <ArrowRightIcon />
          </button>
        <span style={styles.pageTitle}>إدارة الإداريين</span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      <div style={styles.form}>

        {/* Zone de recherche utilisateur */}
        <div style={styles.field}>
          <label style={styles.label}>ابحث عن العضو<span style={{color:RED}}>*</span></label>
          <input
            type="text"
            placeholder="البريد / المعرف الكشفي / الاسم / اللقب"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            onKeyDown={onKeyDown}
            style={styles.input}
          />
          {q.trim() && suggestions.length > 0 && (
            <div style={styles.dropdown}>
              {suggestions.map((u, idx) => (
                <button
                  key={u._id}
                  onClick={() => pickUser(u)}
                  style={{
                    ...styles.suggestion,
                    background: idx === highlight ? 'rgba(226,5,20,.08)' : '#fff'
                  }}
                  title={`${u.prenom} ${u.nom}`}
                >
                  <div style={{ fontWeight:800 }}>{u.prenom} {u.nom}</div>
                  <div style={{ opacity:.85, fontSize:13 }}>{u.email}</div>
                  <div style={{ opacity:.75, fontSize:12 }}>#{u.idScout}</div>
                  {u.role === 'admin' && (
                    <div style={{ opacity:.8, fontSize:11, color: RED }}>
                      (إداري حاليًا)
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carte d’édition (user sélectionné) */}
        {selected && (
          <div style={styles.card}>
            <div style={{ display:'grid', gap:8 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>
                {selected.prenom} {selected.nom}
              </div>
              <div style={{ opacity:.85, fontSize:13 }}>{selected.email}</div>
              <div style={{ opacity:.8, fontSize:12 }}>#{selected.idScout}</div>
              {selected.role === 'admin' && (
                <div style={{ opacity:.85, fontSize:12, color:RED }}>
                  الدور الحالي: إداري ({labelAdminAccess(selected.adminAccess)})
                </div>
              )}
            </div>

            {/* Choix type d’accès admin */}
            <div style={{ display:'flex', gap:6, marginTop:10 }}>
              <label style={styles.label}>نوع صلاحية الإداري</label>
              <select
                value={adminAccess}
                onChange={(e)=>setAdminAccess(e.target.value as AdminAccess)}
                style={styles.input}
              >
                <option value="simple">مشرف إداري (عادي)</option>
                <option value="cn_president">رئيس اللجنة الوطنية</option>
                <option value="cn_commissioner">القائد العام</option>
              </select>
            </div>

            {/* Zone des mandats uniquement si ce n’est pas un simple admin */}
            {adminAccess !== 'simple' && (
              <div style={{ marginTop:12, display:'grid', gap:8 }}>
                <div style={{ fontWeight:800, fontSize:14 }}>
                  النيابات الخاصة بالتوقيع ({labelAdminAccess(adminAccess)})
                </div>

                {/* Ajout d'un mandat en cours */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <label style={styles.label}>تاريخ بداية النيابة</label>
                  <input
                    type="date"
                    value={mandateStartDate}
                    onChange={(e)=>setMandateStartDate(e.target.value)}
                    style={{ ...styles.input, maxWidth:220 }}
                  />
                  <button
                    type="button"
                    onClick={addMandate}
                    style={styles.pillPrimary}
                    disabled={loading}
                  >
                    تسجيل نيابة جديدة
                  </button>
                </div>

                {/* Liste des mandats */}
                <div style={{ display:'grid', gap:6, marginTop:4 }}>
                  {selectedMandates.length === 0 && (
                    <div style={{ opacity:.7, fontSize:13 }}>
                      لا توجد نيابات مسجلة بعد لهذا العضو.
                    </div>
                  )}
                  {selectedMandates.map(m => (
                    <div key={m._id} style={styles.mandateChip}>
                      <div>
                        <strong>{labelMandateType(m.type)}</strong>{' '}
                        <span style={{ opacity:.8 }}>
                          ({m.active ? 'سارية المفعول' : 'منتهية'})
                        </span>
                      </div>
                      <div style={{ fontSize:12, opacity:.85 }}>
                        من {formatDate(m.startDate)}
                        {'  '}إلى {m.endDate ? formatDate(m.endDate) : '...'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button
                type="button"
                onClick={()=>{ setSelected(null); setAdminAccess('simple'); setMandateStartDate(''); }}
                style={styles.pillGhost}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveAdmin}
                style={styles.pillPrimary}
                disabled={loading}
              >
                تعيين كإداري / تحديث
              </button>
            </div>
          </div>
        )}

        {/* Liste des admins */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight:800, marginBottom:6 }}>قائمة الإداريين</div>
          <div style={{ display:'grid', gap:8 }}>
            {admins.map((a) => {
              const showLabel =
                a.adminAccess && a.adminAccess !== 'simple';

              return (
                <div key={a._id} style={styles.chip}>
                  <span>
                    <strong>{a.prenom} {a.nom}</strong>
                    <span style={{ opacity:.7 }}> — {a.email}</span>

                    {showLabel && (
                      <span style={{ opacity:.8, marginInlineStart:8 }}>
                        [{labelAdminAccess(a.adminAccess)}]
                      </span>
                    )}

                    {a._id === myId && <em style={styles.selfTag}> (أنت)</em>}
                  </span>
                  {a._id !== myId && (
                    <button onClick={() => removeAdmin(a)} style={styles.chipX} title="إزالة">
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {!admins.length && <div style={{ opacity:.7 }}>لا يوجد إداريون بعد</div>}
          </div>
        </div>

        {/* Messages */}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}
        {ok &&  <div style={{ color:'#065f46' }}>✅ {ok}</div>}

        {/* actions bas */}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={()=>nav('/moderator/gestionusers')}
            style={styles.pillGhost}
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', maxWidth:1400 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8, width:'100%', maxWidth:1400 },

  form: {
    background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'18px', display:'grid', gap:14, width:'100%', maxWidth:1400
  },
  field: { display:'grid', gap:6, position:'relative' },
  label: { color:'#6b7280', fontSize:14, fontWeight:700 },
  input: {
    border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px',
    fontSize:14, outline:'none',display:'grid'
  },
  dropdown: {
    position:'absolute', top:'calc(100% + 4px)', insetInline:0, zIndex:5,
    border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden', background:'#fff'
  },
  suggestion: {
    textAlign:'right', width:'100%', padding:'10px 12px',
    border:0, cursor:'pointer',
  },

  card: {
    border:'1px solid #e5e7eb', borderRadius:14, padding:12,
    display:'grid', gap:10, background:'#fafafa'
  },

  actions: { display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 },

  pillPrimary: {
    padding:'8px 14px', borderRadius:999, border:`1px solid ${RED}`,
    background: RED, color:'#fff', cursor:'pointer', fontWeight:700,
    fontSize:14,
  },
  pillGhost: {
    padding:'8px 14px', borderRadius:999, border:`1px solid ${RED}`,
    background:'transparent', color:RED, cursor:'pointer', fontWeight:700,
    fontSize:14,
  },

  circleRedBtn: {
    width: 46, height: 46, borderRadius: 999,
    background: 'transparent', border: `3px solid ${RED}`, color: RED,
    display: 'grid', placeItems: 'center', cursor: 'pointer'
  },
  chip: {
    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
    background:'#fff', border:'1px solid #e5e7eb', borderRadius:999,
    boxShadow:'0 2px 8px rgba(0,0,0,.05)', justifyContent:'space-between',
    fontSize:13,
  },
  chipX: {
    border:0, background:'transparent', color:'#e11d48',
    fontSize:18, cursor:'pointer', lineHeight:1
  },
  selfTag: { marginInlineStart: 6, opacity:.8, fontStyle:'normal', fontWeight:700, fontSize:12 },

  mandateChip: {
    border:'1px solid #e5e7eb',
    borderRadius:10,
    padding:'6px 10px',
    background:'#fff',
    boxShadow:'0 1px 4px rgba(0,0,0,.04)',
    fontSize:12,
  },
};

/* --- icône --- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
