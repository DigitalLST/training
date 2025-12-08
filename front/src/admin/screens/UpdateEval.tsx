// src/screens/AdminUpdateEval.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

const RED = '#e20514';

type FormationEvalLite = {
  formationId: string;
  formationName: string;
  niveau: string;
  sessionTitle?: string;
  centreTitle?: string;
  centreRegion?: string;
  totalNote?: number;
  totalMax?: number;
  decision?: 'success' | 'retake' | 'incompatible' | null;
};

type CritereEditRow = {
  critereId: string;
  famille?: string;
  label: string;
  maxnote: number;
  note?: number | null;
};

type DetailResponse = {
  formation: {
    _id: string;
    nom: string;
    niveau: string;
    sessionTitle?: string;
    centreTitle?: string;
    centreRegion?: string;
  };
  trainee: {
    _id: string;
    prenom: string;
    nom: string;
    email?: string;
    idScout?: string;
    region?: string;
  };
  evaluation: {
    _id: string;
    status: 'draft' | 'pending_team' | 'validated';
  } | null;
  items: CritereEditRow[];
  finalDecision: {
    _id?: string;
    totalNote: number;
    totalMax: number;
    decision: 'success' | 'retake' | 'incompatible' | null;
    status: 'draft' | 'pending_team' | 'validated';
  } | null;
};

type LocationState = {
  state?: {
    userId?: string;
    prenom?: string;
    nom?: string;
  };
};

export default function AdminUpdateEval(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation() as LocationState;
  const userId = state?.userId || '';
  const userName = `${state?.prenom || ''} ${state?.nom || ''}`.trim();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const [formations, setFormations] = React.useState<FormationEvalLite[]>([]);
  const [selectedFormationId, setSelectedFormationId] = React.useState<string | null>(null);

  const [detail, setDetail] = React.useState<DetailResponse | null>(null);
  const [editItems, setEditItems] = React.useState<CritereEditRow[]>([]);
  const [decision, setDecision] = React.useState<'success' | 'retake' | 'incompatible' | ''>('');

  /* --------- chargement liste formations pour ce user --------- */
  React.useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const list: FormationEvalLite[] = await api(
          `/admin/evaluations/users/${userId}`
        );
        setFormations(list || []);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل الدورات لهذا العضو');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  /* --------- charger détail d'une formation sélectionnée --------- */
  async function openFormation(formationId: string) {
    try {
      setLoading(true);
      setErr(null);
      setOk(null);
      setSelectedFormationId(formationId);

      const d: DetailResponse = await api(
        `/admin/evaluations/users/${userId}/formations/${formationId}`
      );
      setDetail(d || null);

      const items = (d?.items || []).map(it => ({
        ...it,
        note: typeof it.note === 'number' ? it.note : null,
      }));
      setEditItems(items);

      const dec = d?.finalDecision?.decision || null;
      setDecision(dec || '');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تحميل تفاصيل التقييم');
    } finally {
      setLoading(false);
    }
  }

  /* --------- mise à jour note dans le form --------- */
  function changeNote(critereId: string, value: string) {
    const parsed = value === '' ? null : Number(value);
    if (value !== '' && Number.isNaN(parsed)) return;

    setEditItems(prev =>
      prev.map(it =>
        it.critereId === critereId ? { ...it, note: parsed } : it
      )
    );
  }

  /* --------- sauvegarder modifications --------- */
  async function saveChanges() {
    if (!userId || !selectedFormationId || !editItems.length) return;

    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      const payload = {
        items: editItems.map(it => ({
          critere: it.critereId,
          note: typeof it.note === 'number' ? it.note : null,
        })),
        decision: decision || null,
      };

      const d: DetailResponse = await api(
        `/admin/evaluations/users/${userId}/formations/${selectedFormationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      setDetail(d || null);

      const items = (d?.items || []).map(it => ({
        ...it,
        note: typeof it.note === 'number' ? it.note : null,
      }));
      setEditItems(items);
      const dec = d?.finalDecision?.decision || null;
      setDecision(dec || '');

      setOk('تم حفظ التعديلات على التقييم والقرار النهائي');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حفظ التعديلات');
    } finally {
      setLoading(false);
    }
  }

  function labelDecision(dec?: 'success' | 'retake' | 'incompatible' | null) {
    if (!dec) return '—';
    if (dec === 'success') return 'يجاز';
    if (dec === 'retake') return 'يعيد الدورة';
    if (dec === 'incompatible') return 'لا يصلح للدور';
    return dec;
  }

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      {/* Topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={() => nav(-1)}
            style={styles.circleRedBtn}
            aria-label="رجوع"
          >
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>
            تعديل نتائج  {userName || `(${userId})`}
          </span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color:'#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color:'#b91c1c', marginTop:8 }}>❌ {err}</div>}
      {ok &&  <div style={{ color:'#065f46', marginTop:8 }}>✅ {ok}</div>}

      {/* Liste des formations */}
      <div style={styles.card}>
        <div style={{ fontWeight:800, marginBottom:8 }}>الدورات التي شارك فيها </div>
        {formations.length === 0 && (
          <div style={{ opacity:.7, fontSize:13 }}>لا توجد دورات مرتبطة بهذا المستخدم.</div>
        )}
        <div style={{ display:'grid', gap:8 }}>
          {formations.map(f => (
            <div key={f.formationId} style={styles.formationRow}>
              <div style={{ display:'grid', gap:2 }}>
                <div style={{ fontWeight:600 }}>
                  {f.sessionTitle || '—'} — {f.formationName}
                </div>
                <div style={{ fontSize:12, color:'#6b7280' }}>
                  المستوى: {f.niveau || '—'} — المركز: {f.centreTitle || '—'} — الجهة: {f.centreRegion || '—'}
                </div>
                <div style={{ fontSize:12, color:'#4b5563' }}>
                  المجموع: {f.totalNote ?? '—'} / {f.totalMax ?? '—'} — القرار: {labelDecision(f.decision)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openFormation(f.formationId)}
                style={styles.eyeBtn}
              >
                👁 عرض / تعديل
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Détail formation sélectionnée */}
      {detail && (
        <div style={{ ...styles.card, marginTop:12 }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>
            تفاصيل التقييم – {detail.formation.sessionTitle || '—'} — {detail.formation.nom}
          </div>

          <div style={{ fontSize:13, color:'#4b5563', marginBottom:8 }}>
            المتدرب: {detail.trainee.prenom} {detail.trainee.nom} ({detail.trainee.idScout || '—'})
          </div>

          <div style={{ overflowX:'auto', marginTop:8 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>مجال التقييم</th>
                  <th style={styles.th}>المعيار</th>
                  <th style={styles.th}>العلامة القصوى</th>
                  <th style={styles.th}>النقطة</th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((it, idx) => (
                  <tr key={it.critereId} style={styles.tr}>
                    <td style={styles.td}>{it.famille || (idx === 0 ? '—' : '')}</td>
                    <td style={styles.td}>{it.label}</td>
                    <td style={styles.td}>{it.maxnote}</td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        min={0}
                        max={it.maxnote}
                        value={it.note ?? ''}
                        onChange={e => changeNote(it.critereId, e.target.value)}
                        style={styles.cellInput}
                      />
                    </td>
                  </tr>
                ))}
                {editItems.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding:8, textAlign:'center', opacity:.7 }}>
                      لا توجد معايير تقييم لهذه الدورة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop:12, display:'grid', gap:8, alignItems:'flex-end' }}>
            {/* décision finale */}
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
              <label style={{ fontSize:13, fontWeight:700 }}>القرار النهائي</label>
              <select
                value={decision}
                onChange={e => setDecision(e.target.value as any)}
                style={styles.select}
              >
                <option value="">— لا قرار —</option>
                <option value="success">يجاز</option>
                <option value="retake">يعيد الدورة</option>
                <option value="incompatible">لا يصلح للدور</option>
              </select>
            </div>

            {/* totaux, si finalDecision dispo */}
            {detail.finalDecision && (
              <div style={{ fontSize:13, textAlign:'left', direction:'ltr' }}>
                Total: {detail.finalDecision.totalNote} / {detail.finalDecision.totalMax}
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:6 }}>
              <button
                type="button"
                onClick={saveChanges}
                style={styles.actionBtnPrimary}
                disabled={loading || !editItems.length}
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', maxWidth:1400 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8, width:'100%', maxWidth:1400 },

  circleRedBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    background: 'transparent',
    border: `3px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer'
  },

  card: {
    background:'#fff',
    border:'1px solid #e9edf3',
    borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'16px',
    display:'grid',
    gap:10,
    width:'100%',
    maxWidth:1400,
    marginTop:8,
  },

  formationRow: {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:10,
    padding:'8px 10px',
    borderRadius:12,
    border:'1px solid #e5e7eb',
    background:'#f9fafb',
  },

  eyeBtn: {
    padding:'6px 10px',
    borderRadius:999,
    border:'1px solid #e5e7eb',
    background:'#fff',
    cursor:'pointer',
    fontSize:12,
  },

  table: {
    width:'100%',
    borderCollapse:'collapse',
    fontSize:13,
  },
  th: {
    borderBottom:'1px solid #e5e7eb',
    padding:'6px',
    textAlign:'right',
    background:'#f3f4f6',
    fontWeight:700,
    whiteSpace:'nowrap',
  },
  tr: {
    borderBottom:'1px solid #f3f4f6',
  },
  td: {
    padding:'6px',
    textAlign:'right',
    whiteSpace:'nowrap',
    verticalAlign:'middle',
  },
  cellInput: {
    width:'80px',
    border:'1px solid #e5e7eb',
    borderRadius:8,
    padding:'4px 6px',
    fontSize:13,
    outline:'none',
  },
  select: {
    border:'1px solid #e5e7eb',
    borderRadius:999,
    padding:'4px 10px',
    fontSize:13,
  },

  actionBtnPrimary: {
    padding:'8px 16px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:RED,
    color:'#fff',
    cursor:'pointer',
    fontWeight:700,
    fontSize:14,
  },
};

/* --- icône back --- */
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
