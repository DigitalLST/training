// src/screens/ResultatDetail.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

/* ---------- Types ---------- */

type FormationLite = {
  formationId: string;
  nom: string;
  myRole: 'trainer' | 'director';
  sessionTitle?: string;
  startDate?: string;
  endDate?: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionId?: string;
};

type CritereRow = {
  _id: string;
  session: string;
  niveau: string;
  famille: string;
  critere: string;
  maxnote: number;
  rank?: number;
};

type EvaluationItem = {
  critere: string;  // id du critère
  famille?: string;
  note?: number;
  maxnote?: number;
};

type EvaluationApproval = {
  user: string;
  role: 'director' | 'trainer';
  approvedAt: string;
};

type EvaluationLite = {
  _id: string;
  status: 'draft' | 'pending_team' | 'validated';
  approvals: EvaluationApproval[];
  validatedBy?: string | null;
  validatedAt?: string | null;
  items: EvaluationItem[];
};

type EvaluationTraineeRow = {
  affectationId: string;
  isPresent: boolean;
  trainee: {
    _id: string;
    prenom: string;
    nom: string;
    email?: string;
    idScout?: string;
    region?: string;
  } | null;
  evaluation: EvaluationLite | null;
};

type TraineeUser = {
  _id: string;
  prenom: string;
  nom: string;
  email?: string;
  idScout?: string;
  region?: string;
  affectationId: string;
  isPresent?: boolean;
  evaluation: EvaluationLite | null;
};
type FinalDecisionUI = 'pass' | 'repeat' | 'not_suitable';
function labelForDecisionUI(d: FinalDecisionUI): string {
  if (d === 'pass') return 'يجاز';
  if (d === 'repeat') return 'يعيد الدورة';
  if (d === 'not_suitable') return 'لا يصلح للدور';
  else return '-';
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function getNiveauForCriteria(nom: string): string | null {
  if (nom.includes('شارة')) return 'شارة خشبية';
  if (nom.includes('تمهيدية')) return 'تمهيدية';
  return null;
}

function getStatusLabel(status?: EvaluationLite['status']): string {
  if (!status || status === 'draft') return 'مسودة (غير مكتملة)';
  if (status === 'pending_team') return 'في انتظار مصادقة قيادة الدراسة  ';
  if (status === 'validated') return 'تمّت المصادقة النهائية';
  return status;
}

export default function ResultatDetail(): React.JSX.Element {
  const nav = useNavigate();
  const location = useLocation() as {
    state?: { formationId?: string; traineeId?: string; decision?: string };
  };

  const formationId = location.state?.formationId || '';
  const traineeId = location.state?.traineeId || '';
  const decisionRaw = location.state?.decision as FinalDecisionUI | undefined;
  const decision = decisionRaw ? labelForDecisionUI(decisionRaw) : '';

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [formation, setFormation] = React.useState<FormationLite | null>(null);
  const [trainee, setTrainee] = React.useState<TraineeUser | null>(null);
  const [criteres, setCriteres] = React.useState<CritereRow[]>([]);
  const [notesByCritere, setNotesByCritere] = React.useState<Record<string, number>>({});
  const [total, setTotal] = React.useState<number>(0);
  const [totalMax, setTotalMax] = React.useState<number>(0);

  // map pour rowSpan famille
  const familleRowSpanByIndex = React.useMemo(() => {
    const map: Record<number, number> = {};
    if (!criteres.length) return map;

    let i = 0;
    while (i < criteres.length) {
      const currentFamille = criteres[i].famille;
      let span = 1;
      let j = i + 1;
      while (j < criteres.length && criteres[j].famille === currentFamille) {
        span++;
        j++;
      }
      map[i] = span;
      i = j;
    }

    return map;
  }, [criteres]);

  React.useEffect(() => {
    (async () => {
      try {
        if (!formationId || !traineeId) {
          setErr('المعطيات غير متوفّرة. الرجاء العودة إلى قائمة النتائج.');
          setLoading(false);
          return;
        }

        setLoading(true);
        setErr(null);

        // 1) Récupérer toutes les formations où je suis trainer/director
        const rFormations = await fetch(
          `${API_BASE}/affectations/mine-formations?ts=${Date.now()}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
        if (!rFormations.ok) throw new Error(`HTTP ${rFormations.status}`);
        const formations = (await rFormations.json()) as FormationLite[];

        const f = formations.find(x => x.formationId === formationId) || null;
        if (!f) {
          throw new Error('تعذّر العثور على الدورة المطلوبة.');
        }

        if (!f.sessionId) {
          throw new Error('لا توجد جلسة مرتبطة بهذه الدورة.');
        }

        setFormation(f);

        // 2) Charger la liste des trainee + evaluations pour cette formation
        const rEval = await fetch(
          `${API_BASE}/evaluations/formations/${formationId}/trainees?ts=${Date.now()}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
        if (!rEval.ok) throw new Error(`HTTP ${rEval.status}`);
        const data = await rEval.json();
        const rows = (data.trainees || []) as EvaluationTraineeRow[];

        const row = rows.find(r => r.trainee && r.trainee._id === traineeId) || null;
        if (!row || !row.trainee) {
          throw new Error('تعذّر العثور على المتدرّب المطلوب.');
        }

        const currentEval = row.evaluation || null;

        const traineeObj: TraineeUser = {
          _id: row.trainee._id,
          prenom: row.trainee.prenom,
          nom: row.trainee.nom,
          email: row.trainee.email,
          idScout: row.trainee.idScout,
          region: row.trainee.region,
          affectationId: row.affectationId,
          isPresent: row.isPresent,
          evaluation: currentEval,
        };
        setTrainee(traineeObj);

        // 3) Charger les critères de la session/niveau
        const niveau = getNiveauForCriteria(f.nom);
        if (!niveau) {
          throw new Error('لا يمكن تحديد المستوى (تمهيدية / شارة خشبية) لهذه الدورة.');
        }

        const rCriteres = await fetch(
          `${API_BASE}/criteres?session=${encodeURIComponent(
            f.sessionId
          )}&niveau=${encodeURIComponent(niveau)}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
        if (!rCriteres.ok) throw new Error(`HTTP ${rCriteres.status}`);
        const list = (await rCriteres.json()) as CritereRow[];
        setCriteres(list || []);

        // 4) Construire la map critere -> note
        const notesMap: Record<string, number> = {};
        if (currentEval?.items) {
          for (const it of currentEval.items) {
            if (it.critere && typeof it.note === 'number') {
              notesMap[it.critere] = it.note;
            }
          }
        }
        setNotesByCritere(notesMap);

        // 5) Calculer total et total max
        const tMax = (list || []).reduce((acc, c) => acc + (c.maxnote || 0), 0);
        let t = 0;
        for (const c of list || []) {
          const n = notesMap[c._id];
          if (typeof n === 'number') t += n;
        }

        setTotalMax(tMax);
        setTotal(t);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل تفاصيل النتيجة');
      } finally {
        setLoading(false);
      }
    })();
  }, [formationId, traineeId]);

  const statusLabel = trainee?.evaluation
    ? getStatusLabel(trainee.evaluation.status)
    : 'لا يوجد تقييم';

  const teamApprovalsCount = React.useMemo(() => {
    if (!trainee?.evaluation?.approvals) return 0;
    const distinctUsers = new Set(trainee.evaluation.approvals.map(a => a.user));
    return distinctUsers.size;
  }, [trainee]);

  return (
    <div
      dir="rtl"
      style={{
        width: '70vw',
        alignItems: 'center',
        marginLeft: 20,
        marginRight: 20,
        paddingInline: 24,
      }}
    >
      <div style={styles.toolbarRight}>
        <button
          onClick={() => nav(-1)}
          style={styles.circleRedBtn}
          aria-label="رجوع"
        >
          <ArrowRightIcon />
        </button>
      </div>
      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && !err && trainee && formation && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={styles.cardTitle}>
                نتيجة التقييم – {trainee.prenom} {trainee.nom}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                الدورة: {formation.sessionTitle ? `${formation.sessionTitle} — ${formation.nom}` : formation.nom}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#4b5563' }}>
            حالة التقييم :{' '}
            <span style={{ fontWeight: 700 }}>{statusLabel}</span>
            {teamApprovalsCount > 0 && (
              <span style={{ marginInlineStart: 8 }}>
                – عدد القيادات التي صادقت: {teamApprovalsCount}
              </span>
            )}
          </div>

          {criteres.length > 0 ? (
            <>
              <div style={{ marginTop: 16, overflowX: 'auto' }}>
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
                    {criteres.map((c, idx) => {
                      const rowSpan = familleRowSpanByIndex[idx];
                      const note = notesByCritere[c._id];

                      return (
                        <tr key={c._id}>
                          {rowSpan && (
                            <td style={styles.tdFamille} rowSpan={rowSpan}>
                              {c.famille}
                            </td>
                          )}
                          <td style={styles.td}>{c.critere}</td>
                          <td style={styles.td}>{c.maxnote}</td>
                          <td style={styles.td}>
                            {typeof note === 'number' ? note : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totaux + décision */}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  المجموع: {total} / {totalMax}
                </div>
                <div style={{ fontSize: 14, color: '#111827' }}>
                  القرار النهائي:{' '}
                  <span style={{ fontWeight: 700 }}>
                    {decision || '—'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#9ca3af', marginTop: 12 }}>
              لا توجد معايير تقييم معرفة لهذه الدورة/المستوى.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- icônes ---------- */
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

/* ---------- styles (reprise de EvaluationTrainee pour cohérence) ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },

  redLine: {
    height: 3,
    background: RED,
    opacity: 0.9,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 8,
  },

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

  card: {
    width: '97%',
    background: '#fff',
    borderRadius: 22,
    border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: '16px 18px',
    display: 'grid',
    gap: 12,
  },

  cardHeader: { display: 'grid', gridTemplateColumns: '1fr', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#374151' },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    borderBottom: '1px solid #e5e7eb',
    padding: '8px 6px',
    textAlign: 'right',
    background: '#f9fafb',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  td: {
    borderBottom: '1px solid #f3f4f6',
    padding: '6px 6px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
  },
  tdFamille: {
    borderBottom: '1px solid #f3f4f6',
    padding: '6px 6px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
    fontWeight: 700,
    background: '#f9fafb',
  },
};
