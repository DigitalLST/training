import React from 'react';
import { useNavigate } from 'react-router-dom';
import SignatureModal from '../../components/signature/SignatureModal';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';
const PAGE_SIZE = 50;

/* ---------- Types ---------- */

type CertifLite = {
  code?: string;
  date?: string;
};

type FormationLite = {
  formationId: string;
  nom: string;
  myRole: 'director' | 'trainer' | 'assistant'; // 🔁 on précise les rôles possibles
  sessionTitle?: string;
  startDate?: string;
  endDate?: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionId?: string;
};

type EvaluationItem = {
  critere: string;
  famille?: string;
  note?: number;
  maxnote?: number;
};

type FinalDecisionUI = 'pass' | 'repeat' | 'not_suitable';
type FinalDecisionApi = 'success' | 'retake' | 'incompatible';

type EvaluationApproval = {
  user: string;
  role: 'director' | 'trainer';
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
    phone?: string;
    certifsSnapshot?: CertifLite[];
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
  phone?: string;
  certifsSnapshot?: CertifLite[];
  affectationId: string;
  isPresent?: boolean;
  evaluation: EvaluationLite | null;
};

/** Approbation dans FinalDecision côté API */
type FinalDecisionApproval = {
  userId: string;
  prenom?: string;
  nom?: string;
  role: 'director' | 'trainer' | 'assistant'; // 🔁 on prévoit aussi assistant
  approvedAt?: string | null;
  signatureUrl?: string;
};

type FinalDecisionFromApi = {
  traineeId: string;
  decision?: FinalDecisionApi | null;
  status: 'draft' | 'pending_team' | 'validated';
  approvals: FinalDecisionApproval[];
};

/** Membre de l’équipe pour une formation */
type TeamMember = {
  userId: string;
  prenom: string;
  nom: string;
  role: 'director' | 'trainer' | 'assistant';
  hasApproved: boolean;
  lastApprovedAt?: string | null;
  signatureUrl?: string;
};

/* Pour savoir quelle action on doit exécuter après signature */
type PendingAction =
  | { kind: 'directorSave'; formationId: string }
  | { kind: 'trainerApprove'; formationId: string };

/* ------------------------ Helpers ------------------------ */

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtRange(s?: string, e?: string) {
  if (!s && !e) return '—';
  const sd = s ? new Date(s) : null;
  const ed = e ? new Date(e) : null;
  const F = (d: Date) =>
    d.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: '2-digit' });
  if (sd && ed) return `${F(sd)} — ${F(ed)}`;
  if (sd) return `من ${F(sd)}`;
  return `إلى ${F(ed!)}`;
}

function labelForRole(role: 'director' | 'trainer' | 'assistant'): string {
  if (role === 'director') return 'قائد الدراسة';
  if (role === 'trainer') return 'مساعد قائد الدراسة';
  return 'قيادة الدراسة – حامل شارة';
}

function mapUiDecisionToApi(d: FinalDecisionUI): FinalDecisionApi {
  if (d === 'pass') return 'success';
  if (d === 'repeat') return 'retake';
  return 'incompatible';
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

/* ------------------------ Component ------------------------ */

export default function EvaluationFinale(): React.JSX.Element {
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [formations, setFormations] = React.useState<FormationLite[]>([]);
  const [openId, setOpenId] = React.useState<string>('');

  const [trainees, setTrainees] = React.useState<Record<string, TraineeUser[]>>({});
  const [loadingTrainees, setLoadingTrainees] = React.useState<Record<string, boolean>>({});
  const [errTrainees, setErrTrainees] = React.useState<Record<string, string | null>>({});
  const [pageByFormation, setPageByFormation] = React.useState<Record<string, number>>({});

  /** formationId:traineeId -> décision finale UI */
  const [decisions, setDecisions] = React.useState<Record<string, FinalDecisionUI | undefined>>(
    {}
  );
  const [savingByFormation, setSavingByFormation] = React.useState<Record<string, boolean>>({});
  const [saveErrByFormation, setSaveErrByFormation] = React.useState<
    Record<string, string | null>
  >({});

  /** équipe par formation */
  const [teamByFormation, setTeamByFormation] = React.useState<Record<string, TeamMember[]>>({});
  const [currentUserHasApprovedByFormation, setCurrentUserHasApprovedByFormation] =
    React.useState<Record<string, boolean>>({});

  /** Signature modal */
  const [signatureModalOpen, setSignatureModalOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [signatureErr, setSignatureErr] = React.useState<string | null>(null);

  /* ----------- Load formations ----------- */
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch(`${API_BASE}/affectations/mine-formations?ts=${Date.now()}`, {
          headers: headers(),
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = await r.json();

        setFormations(list || []);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل الدورات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----------- Load trainees & decisions ----------- */
  async function loadTraineesForFormation(fid: string) {
    setLoadingTrainees(prev => ({ ...prev, [fid]: true }));
    setErrTrainees(prev => ({ ...prev, [fid]: null }));

    try {
      const r = await fetch(`${API_BASE}/evaluations/formations/${fid}/trainees?ts=${Date.now()}`, {
        headers: headers(),
        cache: 'no-store',
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();
      const rows = (data.trainees || []) as EvaluationTraineeRow[];

      const onlyTrainees: TraineeUser[] = rows
        .filter(a => !!a.trainee)
        .map(a => ({
          _id: a.trainee!._id,
          prenom: a.trainee!.prenom,
          nom: a.trainee!.nom,
          email: a.trainee!.email,
          idScout: a.trainee!.idScout,
          region: a.trainee!.region,
          phone: (a.trainee as any)?.phone,
          certifsSnapshot: a.trainee!.certifsSnapshot || [],
          affectationId: a.affectationId,
          isPresent: a.isPresent,
          evaluation: a.evaluation || null,
        }));

      setTrainees(prev => ({ ...prev, [fid]: onlyTrainees }));

      // Load final decisions + info équipe
      const rDec = await fetch(`${API_BASE}/final-decisions/formations/${fid}`, {
        headers: headers(),
        cache: 'no-store',
      });

      if (rDec.ok) {
        const dataDec = await rDec.json();
        const decs = (dataDec.decisions || []) as FinalDecisionFromApi[];
        const team = (dataDec.team || []) as TeamMember[];
        const currentUserHasApproved = !!dataDec.currentUserHasApproved;

        setDecisions(prev => {
          const copy = { ...prev };
          for (const fd of decs) {
            const ui = mapApiDecisionToUi(fd.decision || undefined);
            copy[`${fid}:${fd.traineeId}`] = ui;
          }
          return copy;
        });

        setTeamByFormation(prev => ({
          ...prev,
          [fid]: team,
        }));

        setCurrentUserHasApprovedByFormation(prev => ({
          ...prev,
          [fid]: currentUserHasApproved,
        }));
      }
    } catch (e: any) {
      setErrTrainees(prev => ({ ...prev, [fid]: e?.message || 'تعذّر تحميل المتدربين' }));
      setTrainees(prev => ({ ...prev, [fid]: [] }));
    } finally {
      setLoadingTrainees(prev => ({ ...prev, [fid]: false }));
    }
  }

  async function onToggleFormation(fid: string) {
    setOpenId(prev => (prev === fid ? '' : fid));
    setPageByFormation(prev => (prev[fid] ? prev : { ...prev, [fid]: 1 }));

    if (trainees[fid] !== undefined) return;
    await loadTraineesForFormation(fid);
  }

  function decisionKey(formationId: string, traineeId: string) {
    return `${formationId}:${traineeId}`;
  }

  function handleDecisionChange(formationId: string, traineeId: string, value: string) {
    let d: FinalDecisionUI | undefined =
      value === 'pass'
        ? 'pass'
        : value === 'repeat'
        ? 'repeat'
        : value === 'not_suitable'
        ? 'not_suitable'
        : undefined;

    setDecisions(prev => ({ ...prev, [decisionKey(formationId, traineeId)]: d }));
  }

  async function handleSaveDecisions(fid: string) {
    const list = trainees[fid] || [];
    const presentValid = list.filter(t => t.isPresent && t.evaluation?.status === 'validated');

    const payload = presentValid
      .map(t => {
        const d = decisions[decisionKey(fid, t._id)];
        return d ? { traineeId: t._id, decision: mapUiDecisionToApi(d) } : null;
      })
      .filter(Boolean) as { traineeId: string; decision: FinalDecisionApi }[];

    if (!payload.length) {
      setSaveErrByFormation(prev => ({
        ...prev,
        [fid]: 'الرجاء اختيار قرار واحد على الأقل قبل الحفظ.',
      }));
      return;
    }

    try {
      setSavingByFormation(prev => ({ ...prev, [fid]: true }));
      setSaveErrByFormation(prev => ({ ...prev, [fid]: null }));

      const r = await fetch(`${API_BASE}/final-decisions/formations/${fid}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ decisions: payload }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      await loadTraineesForFormation(fid);
    } catch (e: any) {
      setSaveErrByFormation(prev => ({
        ...prev,
        [fid]: e?.message || 'تعذّر حفظ القرارات النهائية',
      }));
    } finally {
      setSavingByFormation(prev => ({ ...prev, [fid]: false }));
    }
  }

  async function approveFinalDecisionsAsTrainer(fid: string) {
    const list = trainees[fid] || [];
    const presentValid = list.filter(t => t.isPresent && t.evaluation?.status === 'validated');

    for (const pv of presentValid) {
      await fetch(`${API_BASE}/final-decisions/approve`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          formation: fid,
          traineeId: pv._id,
        }),
      });
    }

    await loadTraineesForFormation(fid);
  }

  async function startApprovalWithSignature(kind: PendingAction['kind'], formationId: string) {
    try {
      setSignatureErr(null);
      const r = await fetch(`${API_BASE}/signatures/me`, {
        headers: headers(),
        cache: 'no-store',
      });

      if (r.ok) {
        const data = await r.json();
        const hasSignature = !!data?.hasSignature;

        if (hasSignature) {
          if (kind === 'directorSave') {
            await handleSaveDecisions(formationId);
          } else {
            await approveFinalDecisionsAsTrainer(formationId);
          }
          return;
        }
      }
    } catch (e: any) {
      setSignatureErr(e?.message || 'تعذّر التحقق من وجود الإمضاء.');
    }

    setPendingAction({ kind, formationId });
    setSignatureModalOpen(true);
  }

  async function handleSignatureSave(dataUrl: string) {
    if (!pendingAction) {
      setSignatureModalOpen(false);
      return;
    }

    try {
      setSignatureErr(null);

      const r = await fetch(`${API_BASE}/signatures/me`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ dataUrl }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      if (pendingAction.kind === 'directorSave') {
        await handleSaveDecisions(pendingAction.formationId);
      } else {
        await approveFinalDecisionsAsTrainer(pendingAction.formationId);
      }
    } catch (e: any) {
      setSignatureErr(e?.message || 'تعذّر حفظ الإمضاء.');
      return;
    } finally {
      setSignatureModalOpen(false);
      setPendingAction(null);
    }
  }

  function computeTotals(ev: EvaluationLite | null | undefined) {
    if (!ev || !Array.isArray(ev.items)) return { totalNote: 0, totalMax: 0, pct: 0 };

    const totalMax = ev.items.reduce((s, it) => s + (Number(it.maxnote) || 0), 0);
    const totalNote = ev.items.reduce((s, it) => s + (Number(it.note) || 0), 0);
    const pct = totalMax > 0 ? Math.round((totalNote / totalMax) * 1000) / 10 : 0;

    return { totalNote, totalMax, pct };
  }

  /* ------------------------ JSX UI Rendering ------------------------ */

  return (
    <div dir="rtl" style={{ width: '70vw', paddingInline: 24, marginLeft: 20 }}>
      <div style={styles.toolbarRight}>
        <button onClick={() => nav('/trainer')} style={styles.circleRedBtn}>
          <ArrowRightIcon />
        </button>
      </div>
      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {formations.map(f => {
          const fid = f.formationId;
          const opened = openId === fid;
          const list = trainees[fid] || [];
          const isLoadingT = loadingTrainees[fid];
          const errT = errTrainees[fid];

          const myRole = (f.myRole || '').toLowerCase() as 'director' | 'trainer' | 'assistant';
          const isDirector = myRole === 'director';
          const isTrainer = myRole === 'trainer';
          const isAssistant = myRole === 'assistant';

          const present = list.filter(t => t.isPresent);
          const valid = present.filter(t => t.evaluation?.status === 'validated');

          const allValidated = present.length > 0 && present.length === valid.length;

          const sorted = valid
            .map(t => ({ trainee: t, totals: computeTotals(t.evaluation) }))
            .sort((a, b) => b.totals.totalNote - a.totals.totalNote);

          const page = pageByFormation[fid] || 1;
          const start = (page - 1) * PAGE_SIZE;
          const pageItems = sorted.slice(start, start + PAGE_SIZE);

          const allHaveDecision =
            valid.length > 0 &&
            valid.every(t => decisions[decisionKey(fid, t._id)] !== undefined);

          const isSaving = savingByFormation[fid] || false;
          const saveErr = saveErrByFormation[fid] || null;

          const team = teamByFormation[fid] || [];

          // 🔢 nouveaux calculs : uniquement sur les trainers
          const trainers = team.filter(m => m.role === 'trainer');
          const trainersApproved = trainers.filter(m => m.hasApproved);
          const trainersCount = trainers.length;
          const trainersApprovedCount = trainersApproved.length;
          const allTrainersApproved =
            trainersCount > 0 && trainersApprovedCount === trainersCount;
          const currentUserHasApproved = currentUserHasApprovedByFormation[fid] || false;

          const trainerButtonDisabled =
            !isTrainer || currentUserHasApproved || allTrainersApproved;
          const directorButtonDisabled = allTrainersApproved; // une fois tous les trainers OK, on fige

          const approvers = team.filter(m => m.hasApproved);

          const totalPages =
            sorted.length === 0 ? 1 : Math.ceil(sorted.length / PAGE_SIZE);

          return (
            <div key={fid} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  {f.sessionTitle ? `${f.sessionTitle} — ${f.nom}` : f.nom}
                  {f.startDate && (
                    <span style={{ marginInlineStart: 8, fontSize: 12, color: '#6b7280' }}>
                      ({fmtRange(f.startDate, f.endDate)})
                    </span>
                  )}
                </div>
                <button onClick={() => onToggleFormation(fid)} style={styles.eyeBtn}>
                  {opened ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {opened && (
                <div style={styles.detailWrap}>
                  {isLoadingT && <div style={{ color: '#6b7280' }}>… جار التحميل</div>}
                  {errT && <div style={{ color: '#b91c1c' }}>❌ {errT}</div>}

                  {!isLoadingT && !errT && present.length === 0 && (
                    <div style={{ color: '#9ca3af' }}>لا يوجد متدربون حاضرين.</div>
                  )}

                  {!isLoadingT && !errT && present.length > 0 && !allValidated && (
                    <div style={{ color: '#9ca3af' }}>
                      لا يمكن عرض التقييم النهائي قبل المصادقة على جميع الحاضرين
                    </div>
                  )}

                  {/* Assistant : voit le tableau seulement quand tous les trainers ont validé */}
                  {!isLoadingT &&
                    !errT &&
                    allValidated &&
                    isAssistant &&
                    !allTrainersApproved && (
                      <div style={{ color: '#9ca3af' }}>
                        النتائج النهائية قيد المصادقة من طرف المدربين. يمكنك الإطلاع عليها بعد
                        اكتمال جميع المصادقات.
                      </div>
                    )}

                  {!isLoadingT &&
                    !errT &&
                    allValidated &&
                    (!isAssistant || allTrainersApproved) && (
                      <>
                        <div style={{ overflowX: 'auto' }}>
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
                              </tr>
                            </thead>
                            <tbody>
                              {pageItems.map(({ trainee: t, totals }) => {
                                const d = decisions[decisionKey(fid, t._id)];

                                return (
                                  <tr key={t._id}>
                                    <td style={styles.td}>{t.idScout || '—'}</td>
                                    <td style={styles.td}>
                                      {t.prenom} {t.nom}
                                    </td>
                                    <td style={styles.td}>{t.region || '—'}</td>
                                    <td style={styles.td}>{t.email || '—'}</td>
                                    <td style={styles.td}>
                                      {totals.totalNote}/{totals.totalMax}
                                    </td>
                                    <td style={styles.td}>{totals.pct.toFixed(1)}%</td>
                                    <td style={styles.td}>
                                      {isDirector ? (
                                        <select
                                          style={styles.select}
                                          value={d || ''}
                                          onChange={e =>
                                            handleDecisionChange(fid, t._id, e.target.value)
                                          }
                                          disabled={directorButtonDisabled}
                                        >
                                          <option value="">في الانتظار</option>
                                          <option value="pass">يجاز</option>
                                          <option value="repeat">يعيد الدورة</option>
                                          <option value="not_suitable">لا يصلح للدور</option>
                                        </select>
                                      ) : (
                                        <span
                                          style={{
                                            color: d ? '#111' : '#999',
                                            fontSize: 12,
                                          }}
                                        >
                                          {d
                                            ? labelForDecisionUI(d)
                                            : 'في انتظار قرار قائد الدراسة'}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {totalPages > 1 && (
                          <div
                            style={{
                              marginTop: 8,
                              display: 'flex',
                              justifyContent: 'center',
                              gap: 8,
                              fontSize: 12,
                              color: '#4b5563',
                            }}
                          >
                            <button
                              style={styles.pageBtn}
                              disabled={page <= 1}
                              onClick={() =>
                                setPageByFormation(prev => ({
                                  ...prev,
                                  [fid]: Math.max(1, page - 1),
                                }))
                              }
                            >
                              السابق
                            </button>
                            <span>
                              صفحة {page} / {totalPages}
                            </span>
                            <button
                              style={styles.pageBtn}
                              disabled={page >= totalPages}
                              onClick={() =>
                                setPageByFormation(prev => ({
                                  ...prev,
                                  [fid]: Math.min(totalPages, page + 1),
                                }))
                              }
                            >
                              التالي
                            </button>
                          </div>
                        )}

                        {saveErr && <div style={{ color: '#b91c1c' }}>❌ {saveErr}</div>}

                        {/* Director : enregistre les décisions, mais ne valide pas les résultats */}
                        {isDirector && allHaveDecision && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              style={{
                                borderRadius: 999,
                                padding: '6px 18px',
                                border: 'none',
                                background:
                                  !isSaving && !directorButtonDisabled ? RED : '#ccc',
                                color: '#fff',
                                cursor:
                                  isSaving || directorButtonDisabled
                                    ? 'default'
                                    : 'pointer',
                              }}
                              disabled={isSaving || directorButtonDisabled}
                              onClick={() =>
                                startApprovalWithSignature('directorSave', fid)
                              }
                            >
                              {isSaving ? '… جاري الحفظ' : 'حفظ القرارات النهائية'}
                            </button>
                          </div>
                        )}

                        {/* Validation finale : Trainers uniquement */}
                        {isTrainer && allHaveDecision && !allTrainersApproved && (
                          <div
                            style={{
                              marginTop: 12,
                              display: 'flex',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              style={{
                                borderRadius: 999,
                                border: 'none',
                                padding: '6px 18px',
                                background: trainerButtonDisabled ? '#ccc' : RED,
                                color: '#fff',
                                fontSize: 13,
                                cursor: trainerButtonDisabled ? 'default' : 'pointer',
                              }}
                              disabled={trainerButtonDisabled}
                              onClick={() =>
                                startApprovalWithSignature('trainerApprove', fid)
                              }
                            >
                              المصادقة على النتائج النهائية
                            </button>
                          </div>
                        )}

                        {/* Info sur le nombre de trainers ayant validé */}
                        {trainersCount > 0 && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              color: '#6b7280',
                              textAlign: 'left',
                            }}
                          >
                            عدد المدربين الذين صادقوا: {trainersApprovedCount} /{' '}
                            {trainersCount}
                          </div>
                        )}

                        {/* Pastilles des approbateurs (director + trainers + assistants si tu veux) */}
                        {approvers.length > 0 && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color: '#4b5563',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 8,
                              justifyContent: 'flex-end',
                            }}
                          >
                            {approvers.map(ap => {
                              const labelRole = labelForRole(ap.role);
                              const sentence = formatApprovalSentence(ap.lastApprovedAt);

                              return (
                                <span
                                  key={ap.userId}
                                  style={{
                                    background: '#f3f4f6',
                                    borderRadius: 999,
                                    padding: '3px 10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  {ap.signatureUrl && (
                                    <img
                                      src={ap.signatureUrl}
                                      alt="signature"
                                      style={{
                                        height: 24,
                                        maxWidth: 80,
                                        objectFit: 'contain',
                                      }}
                                    />
                                  )}
                                  <span>
                                    {labelRole} – {ap.prenom} {ap.nom}
                                    {sentence && (
                                      <span
                                        style={{
                                          color: '#6b7280',
                                          marginInlineStart: 4,
                                        }}
                                      >
                                        ({sentence})
                                      </span>
                                    )}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && formations.length === 0 && (
          <div style={{ color: '#9ca3af' }}>
            لا توجد دورات أنت مكلّف فيها كقائد دورة أو قيادة دورة.
          </div>
        )}
      </div>

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => {
          setSignatureModalOpen(false);
          setPendingAction(null);
        }}
        onSave={handleSignatureSave}
      />

      {signatureErr && (
        <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 12 }}>❌ {signatureErr}</div>
      )}
    </div>
  );
}

/* ------------------------ Icons ------------------------ */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ------------------------ Styles ------------------------ */
const styles: Record<string, React.CSSProperties> = {
  toolbarRight: { display: 'flex', alignItems: 'center' },
  redLine: { height: 3, background: RED, borderRadius: 2, marginTop: 8, marginBottom: 8 },
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
  cardHeader: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#374151' },
  detailWrap: { borderTop: '1px dashed #e5e7eb', paddingTop: 10, display: 'grid', gap: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
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
  eyeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: `2px solid ${RED}`,
    background: 'transparent',
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },
  select: {
    padding: '4px 4px',
    borderRadius: 4,
    border: '1px solid #d1d5db',
    minWidth: 140,
    fontSize: 12,
  },
  pageBtn: {
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    padding: '4px 10px',
    background: '#f9fafb',
    cursor: 'pointer',
    minWidth: 70,
  },
};
