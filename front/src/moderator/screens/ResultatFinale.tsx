// src/screens/ModeratorFinalResults.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type CertifLite = {
  code?: string;
  date?: string;
};

type EvaluationItem = {
  critere: string;
  famille?: string;
  note?: number;
  maxnote?: number;
};

type EvaluationApproval = {
  user: string;
  role: 'director' | 'trainer' | 'assistant' | 'coach';
  approvedAt: string;
  signatureUrl?: string;
};

type EvaluationLite = {
  _id: string;
  status: 'draft' | 'pending_team' | 'validated';
  approvals: EvaluationApproval[];
  validatedBy?: string | null;
  validatedAt?: string | null;
  items: EvaluationItem[];
};

type TraineeUser = {
  _id: string;
  prenom: string;
  nom: string;
  email?: string;
  idScout?: string;
  region?: string;
  phone?: string;
  certifsSnapshot?: CertifLite[];
  affectationId: string;
  isPresent?: boolean;
  evaluation: EvaluationLite | null;
};

type FinalDecisionApi = 'success' | 'retake' | 'incompatible';
type FinalDecisionUI = 'pass' | 'repeat' | 'not_suitable';

type FinalDecisionFromApi = {
  traineeId: string;
  decision?: FinalDecisionApi | null;
  status: 'draft' | 'pending_team' | 'validated';
  approvals: {
    userId: string;
    prenom?: string;
    nom?: string;
    role: 'director' | 'trainer' | 'assistant' | 'coach';
    approvedAt?: string | null;
    signatureUrl?: string;
  }[];
};

type TeamMember = {
  userId: string;
  prenom: string;
  nom: string;
  role: 'director' | 'trainer' | 'assistant' | 'coach';
  hasApproved: boolean;
  lastApprovedAt?: string | null;
  signatureUrl?: string;
};

type StaffMember = {
  userId: string;
  prenom: string;
  nom: string;
  role: 'director' | 'trainer' | 'assistant' | 'coach';
};

type FormationHeader = {
  _id: string;
  nom: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionTitle?: string;
  sessionStartDate?: string;
  sessionEndDate?: string;
  directorName?: string;
};

type LocationState = {
  formationId?: string;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function mapApiDecisionToUi(d?: FinalDecisionApi | null): FinalDecisionUI | undefined {
  if (!d) return undefined;
  if (d === 'success') return 'pass';
  if (d === 'retake') return 'repeat';
  if (d === 'incompatible') return 'not_suitable';
  return undefined;
}

function labelForDecisionUI(d: FinalDecisionUI): string {
  if (d === 'pass') return 'يؤهل';
  if (d === 'repeat') return 'يعيد الدورة';
  return 'لا يناسب الدور';
}

function labelForRole(role: 'director' | 'trainer' | 'assistant' | 'coach'): string {
  if (role === 'director') return 'قائد الدراسة';
  if (role === 'trainer') return 'مساعد قائد الدراسة';
  if (role === 'assistant') return 'مساعد قائد الدراسة';
  if (role === 'coach') return 'المرشد الفني';
  return role;
}

function formatApprovalSentence(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeStr = d.toLocaleTimeString('ar-TN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `تمت المصادقة يوم ${dateStr} على الساعة ${timeStr}`;
}

function computeTotals(ev: EvaluationLite | null | undefined) {
  if (!ev || !Array.isArray(ev.items)) return { totalNote: 0, totalMax: 0, pct: 0 };
  const totalMax = ev.items.reduce((s, it) => s + (Number(it.maxnote) || 0), 0);
  const totalNote = ev.items.reduce((s, it) => s + (Number(it.note) || 0), 0);
  const pct = totalMax > 0 ? Math.round((totalNote / totalMax) * 1000) / 10 : 0;
  return { totalNote, totalMax, pct };
}

export default function ModeratorFinalResults(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation();
  const { formationId } = (state || {}) as LocationState;

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [header, setHeader] = React.useState<FormationHeader | null>(null);
  const [trainees, setTrainees] = React.useState<TraineeUser[]>([]);
  const [decisionsByTrainee, setDecisionsByTrainee] = React.useState<
    Record<string, FinalDecisionUI | undefined>
  >({});
  const [globalValidationDate, setGlobalValidationDate] = React.useState<string | null>(null);

  // Staff complet depuis affectations (director / trainer / assistant / coach)
  const [staff, setStaff] = React.useState<StaffMember[]>([]);

  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [pdfErr, setPdfErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!formationId) {
      setErr('لا توجد دراسة محددة.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) Méta formation
        try {
          const rF = await fetch(`${API_BASE}/formations/${formationId}?ts=${Date.now()}`, {
            headers: headers(),
            cache: 'no-store',
          });
          if (rF.ok) {
            const j = await rF.json();
            setHeader({
              _id: String(j._id),
              nom: j.nom || '',
              centreTitle: j.centre?.title || '',
              centreRegion: j.centre?.region || '',
              sessionTitle: j.sessionTitle || j.session?.title || '',
              sessionStartDate: j.session?.startDate || j.sessionStartDate,
              sessionEndDate: j.session?.endDate || j.sessionEndDate,
              directorName: j.directorName || '',
            });
          }
        } catch {
          // ignore meta errors
        }

        // 2) Trainees + évaluations
        const rT = await fetch(
          `${API_BASE}/evaluations/formations/${formationId}/trainees?ts=${Date.now()}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
        if (!rT.ok) throw new Error(`HTTP ${rT.status}`);
        const dataT = await rT.json();

        const rows = (dataT.trainees || []) as {
          affectationId: string;
          isPresent: boolean;
          trainee: any;
          evaluation: EvaluationLite | null;
        }[];

        const list: TraineeUser[] = rows
          .filter(a => !!a.trainee)
          .map(a => ({
            _id: a.trainee._id,
            prenom: a.trainee.prenom,
            nom: a.trainee.nom,
            email: a.trainee.email,
            idScout: a.trainee.idScout,
            region: a.trainee.region,
            phone: a.trainee.phone,
            certifsSnapshot: a.trainee.certifsSnapshot || [],
            affectationId: a.affectationId,
            isPresent: a.isPresent,
            evaluation: a.evaluation || null,
          }));

        setTrainees(list);

        // 3) Décisions finales + équipe direction (pour status + dates)
        const rDec = await fetch(
          `${API_BASE}/final-decisions/formations/${formationId}?ts=${Date.now()}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
        if (rDec.ok) {
          const dataDec = await rDec.json();
          const decs = (dataDec.decisions || []) as FinalDecisionFromApi[];
          const teamArr = (dataDec.team || []) as TeamMember[];

          const byTrainee: Record<string, FinalDecisionUI | undefined> = {};
          decs.forEach(fd => {
            byTrainee[fd.traineeId] = mapApiDecisionToUi(fd.decision || undefined);
          });
          setDecisionsByTrainee(byTrainee);

          // date globale = max(lastApprovedAt)
          const dates: Date[] = [];
          teamArr.forEach(m => {
            if (m.lastApprovedAt) {
              const d = new Date(m.lastApprovedAt);
              if (!isNaN(d.getTime())) dates.push(d);
            }
          });
          if (dates.length) {
            const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
            setGlobalValidationDate(maxD.toISOString());
          }
        }

        // 4) Staff complet depuis affectations (director / trainer / assistant / coach)
        try {
          const rA = await fetch(
            `${API_BASE}/affectations/formations/${formationId}/affectations?ts=${Date.now()}`,
            {
              headers: headers(),
              cache: 'no-store',
            }
          );
          if (rA.ok) {
            const dataA = await rA.json();
            const arr: any[] = Array.isArray(dataA) ? dataA : dataA.affectations || [];

            const staffList: StaffMember[] = arr
              .filter(a => a.role && a.role !== 'trainee' && a.user)
              .map(a => ({
                userId: String(a.user._id),
                prenom: String(a.user.prenom || ''),
                nom: String(a.user.nom || ''),
                role: a.role as StaffMember['role'],
              }));

            setStaff(staffList);
          }
        } catch {
          // on ignore l'erreur de staff, ce n'est pas bloquant
        }
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل النتائج النهائية');
      } finally {
        setLoading(false);
      }
    })();
  }, [formationId]);

  const present = trainees.filter(t => t.isPresent);
  const withValidatedEval = present.filter(t => t.evaluation?.status === 'validated');

  const rowsWithTotals = withValidatedEval
    .map(t => ({
      trainee: t,
      totals: computeTotals(t.evaluation),
      decision: decisionsByTrainee[t._id],
    }))
    .sort((a, b) => b.totals.totalNote - a.totals.totalNote);

  // Stats globales
  const totalPresent = present.length;
  const successCount = rowsWithTotals.filter(r => r.decision === 'pass').length;
  const retakeCount = rowsWithTotals.filter(r => r.decision === 'repeat').length;
  const incompatibleCount = rowsWithTotals.filter(r => r.decision === 'not_suitable').length;
  const successPct =
    totalPresent > 0 ? Math.round((successCount / totalPresent) * 1000) / 10 : 0;

  const formattedValidationDate = globalValidationDate
    ? formatApprovalSentence(globalValidationDate)
    : '';

  async function handleDownloadPdf() {
    if (!formationId) return;
    try {
      setPdfLoading(true);
      setPdfErr(null);

      const r = await fetch(
        `${API_BASE}/final-decisions/formations/${formationId}/report?ts=${Date.now()}`,
        {
          headers: {
            ...headers(),
          },
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const nameSafe =
        header?.sessionTitle && header?.nom
          ? `resultats_${header.sessionTitle}_${header.nom}.pdf`
          : 'resultats_formation.pdf';

      a.download = nameSafe;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setPdfErr(e?.message || 'تعذّر تحميل ملف النتائج.');
    } finally {
      setPdfLoading(false);
    }
  }

  function handleDirectorReport() {
    if (!formationId) return;
    nav('/moderator/rapportdirecteur', { state: { formationId } });
  }

  function handleCoachReport() {
    if (!formationId) return;
    nav('/moderator/rapportcoach', { state: { formationId } });
  }

  // Split staff
  const directionStaff = staff.filter(s => s.role !== 'coach');
  const coachStaff = staff.filter(s => s.role === 'coach');

  return (
    <div
      dir="rtl"
      style={{ width: '80vw', marginInline: 'auto', paddingInline: 24, marginTop: 20 }}
    >
      {/* Toolbar + entête */}
      <div style={styles.toolbar}>
        <button
          onClick={() => nav(-1)}
          style={styles.circleRedBtn}
          aria-label="رجوع"
        >
          <ArrowRightIcon />
        </button>

        <div style={styles.headerInfo}>
          <div style={styles.headerTitle}>
            {header?.sessionTitle || '—'} — {header?.nom || '—'}
          </div>
          <div style={styles.headerSub}>
            {header?.centreTitle || '—'}
            {header?.centreRegion ? ` (${header.centreRegion})` : ''}
          </div>
          {header?.directorName && (
            <div style={styles.headerSub}>قائد الدراسة : {header.directorName}</div>
          )}
        </div>

        {/* (logo si besoin) */}
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && !err && (
        <>
          {/* Tableau figé des résultats */}
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>المعرف الكشفي</th>
                  <th style={styles.th}>الاسم و اللقب</th>
                  <th style={styles.th}>الجهة</th>
                  <th style={styles.th}>البريد الإلكتروني</th>
                  <th style={styles.th}>العلامة</th>
                  <th style={styles.th}>النسبة %</th>
                  <th style={styles.th}>القرار النهائي</th>
                  <th style={styles.th}>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithTotals.map(({ trainee: t, totals, decision }) => (
                  <tr key={t._id}>
                    <td style={styles.td}>{t.idScout || '—'}</td>
                    <td style={styles.td}>
                      {t.prenom} {t.nom}
                    </td>
                    <td style={styles.td}>{t.region || '—'}</td>
                    <td style={styles.td}>{t.email || '—'}</td>
                    <td style={styles.td}>
                      {totals.totalMax}/{totals.totalNote}
                    </td>
                    <td style={styles.td}>{totals.pct.toFixed(1)}%</td>
                    <td style={styles.td}>
                      {decision ? labelForDecisionUI(decision) : '—'}
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.detailsBtn}
                        onClick={() =>
                          nav('/moderator/detailresults', {
                            state: { formationId, traineeId: t._id, decision: decision },
                          })
                        }
                      >
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}

                {rowsWithTotals.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        ...styles.td,
                        textAlign: 'center',
                        color: '#9ca3af',
                      }}
                    >
                      لا توجد نتائج نهائية متاحة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Statistiques globales */}
          <div style={styles.statsRow}>
            <div>عدد المتدربين : {totalPresent}</div>
            <div> يؤهل : {successCount}</div>
            <div> يعيد الدورة : {retakeCount}</div>
            <div> لا يناسب الدور : {incompatibleCount}</div>
            <div>نسبة النجاح : {successPct.toFixed(1)}%</div>
          </div>

          {/* Date unique de validation sous les indicateurs */}
          {formattedValidationDate && (
            <div style={styles.validationRow}>{formattedValidationDate}</div>
          )}

          {/* Staff : séparation قيادة الدراسة / المرشد الفني */}
          {(directionStaff.length > 0 || coachStaff.length > 0) && (
            <div style={styles.teamBlock}>
              {directionStaff.length > 0 && (
                <>
                  <div style={styles.teamTitle}>قيادة الدراسة</div>
                  <div style={styles.teamList}>
                    {directionStaff.map(member => (
                      <div key={member.userId} style={styles.teamItem}>
                        <div>
                          {labelForRole(member.role)} – {member.prenom} {member.nom}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {coachStaff.length > 0 && (
                <>
                  <div style={{ ...styles.teamTitle, marginTop: 10 }}>المرشد الفني</div>
                  <div style={styles.teamList}>
                    {coachStaff.map(member => (
                      <div key={member.userId} style={styles.teamItem}>
                        <div>
                          {labelForRole(member.role)} – {member.prenom} {member.nom}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Boutons en bas à gauche */}
          <div style={styles.actionsRow}>
            <button style={styles.reportBtn} onClick={handleDirectorReport}>
              تقرير قائد الدراسة
            </button>
            <button style={styles.reportBtn} onClick={handleCoachReport}>
              تقرير المرشد الفني
            </button>
            <button
              style={styles.downloadBtn}
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? '… جارٍ توليد بطاقة النتائج' : 'تحميل بطاقة النتائج'}
            </button>
          </div>

          {pdfErr && (
            <div
              style={{
                marginTop: 6,
                textAlign: 'left',
                color: '#b91c1c',
                fontSize: 12,
              }}
            >
              ❌ {pdfErr}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------ Styles & Icons ------------------------ */

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 12,
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
  redLine: {
    height: 3,
    background: RED,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 12,
  },
  headerInfo: { display: 'grid', gap: 4, justifyItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  headerSub: { fontSize: 13, color: '#4b5563' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 },
  th: {
    borderBottom: '1px solid #e5e7eb',
    padding: '8px 6px',
    textAlign: 'right',
    background: '#f9fafb',
    fontWeight: 700,
  },
  td: {
    borderBottom: '1px solid #f3f4f6',
    padding: '6px 6px',
    textAlign: 'right',
  },

  detailsBtn: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
  },

  statsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    fontSize: 13,
    color: '#111827',
    justifyContent: 'flex-start',
  },

  validationRow: {
    marginTop: 8,
    fontSize: 12,
    color: '#16a34a',
    textAlign: 'right',
  },

  teamBlock: {
    marginTop: 18,
    borderTop: '1px dashed #e5e7eb',
    paddingTop: 10,
  },
  teamTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  teamList: { display: 'grid', gap: 8 },
  teamItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#f9fafb',
    padding: '6px 8px',
    borderRadius: 999,
  },

  actionsRow: {
    marginTop: 18,
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },

  reportBtn: {
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: '#fff',
    color: RED,
    cursor: 'pointer',
  },

  downloadBtn: {
    padding: '8px 20px',
    borderRadius: 999,
    border: 'none',
    background: RED,
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
};

function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
