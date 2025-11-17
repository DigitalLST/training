// src/screens/AdminModerators.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/UseAuth';

type UserLite = {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  idScout: string;
  region?: string;
  role?: 'user'|'moderator'|'admin';
};

const RED = '#e20514';

// Liste officielle des régions (value = DB, label = affichage)
const REGIONS: Array<{value:string; label:string}> = [
  { value:'تونس',       label:'تونس' },
  { value:'اريانة',     label:'اريانة' },
  { value:'بن عروس',    label:'بن عروس' },
  { value:'منوبة',      label:'منوبة' },
  { value:'نابل',       label:'نابل' },
  { value:'زغوان',      label:'زغوان' },
  { value:'بنزرت',      label:'بنزرت' },
  { value:'باجة',       label:'باجة' },
  { value:'جندوبة',     label:'جندوبة' },
  { value:'سليانة',     label:'سليانة' },
  { value:'الكاف',      label:'الكاف' },
  { value:'سوسة',       label:'سوسة' },
  { value:'المنستير',   label:'المنستير' },
  { value:'المهدية',    label:'المهدية' },
  { value:'القيروان',   label:'القيروان' },
  { value:'القصرين',    label:'القصرين' },
  { value:'صفاقس',      label:'صفاقس' },
  { value:'سيدي بوزيد', label:'سيدي بوزيد' },
  { value:'قفصة',       label:'قفصة' },
  { value:'توزر',       label:'توزر' },
  { value:'قابس',       label:'قابس' },
  { value:'قبلي',       label:'قبلي' },
  { value:'مدنين',      label:'مدنين' },
  { value:'تطاوين',     label:'تطاوين' },
  { value:'المهجر',     label:'المهجر' },
  { value:'وطني',       label:'قائد وطني' }
];

export default function GestionModerator(): React.JSX.Element {
  const nav = useNavigate();
  const { user: me } = useAuth();
  const myId = me?._id;

  // recherche
  const [q, setQ] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<UserLite[]>([]);
  const [highlight, setHighlight] = React.useState(0);

  // sélection courante (user choisi pour ajout/maj)
  const [selected, setSelected] = React.useState<UserLite | null>(null);
  const [selectedRegion, setSelectedRegion] = React.useState<string>('');

  // liste modérateurs
  const [mods, setMods] = React.useState<UserLite[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const loadMods = React.useCallback(async () => {
    try {
      setErr(null);
      const list: UserLite[] = await api('/moderators'); // GET /api/moderators
      setMods(list || []);
    } catch (e: any) {
      setErr(e?.message || 'تعذر تحميل قائمة المشرفين');
    }
  }, []);

  React.useEffect(() => { loadMods(); }, [loadMods]);

  // recherche (debounce)
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

  // quand on choisit un user → préremplir région
  function pickUser(u: UserLite) {
    setSelected(u);
    setSelectedRegion(u.region || '');
    setQ('');
    setSuggestions([]);
    setOk(null);
    setErr(null);
  }

  // clavier dans la zone de recherche
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

  // PATCH /api/moderators/:id  (role=moderator + region)
  async function saveModerator() {
    if (!selected) return;
    if (!selectedRegion?.trim()) { setErr('الرجاء اختيار جهة'); return; }
    try {
      setLoading(true);
      setErr(null); setOk(null);
      await api(`/moderators/${selected._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ region: selectedRegion.trim() }),
      });
      setOk('تم حفظ المعطيات');
      setSelected(null);
      setSelectedRegion('');
      await loadMods();
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحفظ');
    } finally {
      setLoading(false);
    }
  }

  // DELETE /api/moderators/:id (→ role=user)
  async function removeModerator(u: UserLite) {
    if (u._id === myId) return; // منع إزالة نفسك
    try {
      setLoading(true);
      setErr(null); setOk(null);
      await api(`/moderators/${u._id}`, { method: 'DELETE' });
      await loadMods();
      setOk('تمت الإزالة');
    } catch (e: any) {
      setErr(e?.message || 'تعذر الإزالة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button type="button" onClick={() => nav('/moderator/')} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>إدارة المشرفين</span>
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
            </div>

            <div style={{ display:'flex', gap:6, marginTop:10 }}>
              <select
                value={selectedRegion}
                onChange={(e)=>setSelectedRegion(e.target.value)}
                style={styles.input}
              >
                <option value="" disabled>إختر الجهة</option>
                {REGIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:12 }}>
              <button type="button" onClick={()=>{ setSelected(null); setSelectedRegion(''); }} style={styles.pillGhost}>
                إلغاء
              </button>
              <button type="button" onClick={saveModerator} style={styles.pillPrimary} disabled={loading}>
                تعيين كمشرف
              </button>
            </div>
          </div>
        )}

        {/* Liste des modérateurs */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight:800, marginBottom:6 }}>قائمة المشرفين</div>
          <div style={{ display:'grid', gap:8 }}>
            {mods.map((m) => (
              <div key={m._id} style={styles.chip}>
                <span>
                  <strong>{m.prenom} {m.nom}</strong>
                  <span style={{ opacity:.7 }}> — {m.email}</span>
                  <span style={{ opacity:.8, marginInlineStart:8 }}>[{m.region}]</span>
                  {m._id === myId && <em style={styles.selfTag}> (أنت)</em>}
                </span>
                {m._id !== myId && (
                  <button onClick={() => removeModerator(m)} style={styles.chipX} title="إزالة">×</button>
                )}
              </div>
            ))}
            {!mods.length && <div style={{ opacity:.7 }}>لا يوجد مشرفون بعد</div>}
          </div>
        </div>

        {/* Messages */}
        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}
        {ok &&  <div style={{ color:'#065f46' }}>✅ {ok}</div>}

        {/* actions bas */}
        <div style={styles.actions}>
          <button type="button" onClick={()=>nav('/moderator/gestionusers')} style={styles.pillGhost}>رجوع</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fff',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-start',
    gap: 16, paddingTop: 0, paddingBottom: 0,
  },
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
    fontSize:16, outline:'none',display:'grid'
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
    display:'grid', gap:8, background:'#fafafa'
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
  chip: {
    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
    background:'#fff', border:'1px solid #e5e7eb', borderRadius:999,
    boxShadow:'0 2px 8px rgba(0,0,0,.05)', justifyContent:'space-between'
  },
  chipX: {
    border:0, background:'transparent', color:'#e11d48',
    fontSize:18, cursor:'pointer', lineHeight:1
  },
  selfTag: { marginInlineStart: 6, opacity:.8, fontStyle:'normal', fontWeight:700, fontSize:12 },
};

/* --- icône --- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
