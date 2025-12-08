// src/screens/EvaluationTrainee.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';
const PAGE_SIZE = 50;

/* ---------- Types ---------- */

// snapshot certif (si tu veux l’utiliser plus tard)
type CertifLite = {
  code?: string;
  date?: string;
};

// Formation où je suis director / trainer / assistant
type FormationLite = {
  formationId: string;
  nom: string;
  myRole: 'trainer' | 'director' | 'assistant' | string;
  sessionTitle?: string;
  startDate?: string;
  endDate?: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionId?: string;
};

// Critère d’évaluation
type CritereRow = {
  _id: string;
  session: string;
  niveau: string;
  famille: string;
  critere: string;
  maxnote: number;
  rank?: number;
};

// Item d’évaluation (dans Evaluation.items)
type EvaluationItem = {
  critere: string;
  famille?: string;
  note?: number;
  maxnote?: number;
};

// Approbation d’un membre de l’équipe
type EvaluationApproval = {
  user: string;
  role: 'director' | 'trainer' | 'assistant';
  approvedAt: string;
};

// Evaluation côté API
type EvaluationLite = {
  _id: string;
  status: 'draft' | 'pending_team' | 'validated';
  approvals: EvaluationApproval[];
  validatedBy?: string | null;
  validatedAt?: string | null;
  items: EvaluationItem[];
};

// Ligne renvoyée par GET /evaluations/formations/:formationId/trainees
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
    certifsSnapshot?: CertifLite[];
  } | null;
  evaluation: EvaluationLite | null;
};

// Stagiaire dans le state du front
type TraineeUser = {
  _id: string;
  prenom: string;
  nom: string;
  email?: string;
  idScout?: string;
  region?: string;
  certifsSnapshot?: CertifLite[];
  affectationId: string;
  isPresent?: boolean;
  evaluation: EvaluationLite | null;
};

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

export default function EvalutaionTrainee(): React.JSX.Element {
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [formations, setFormations] = React.useState<FormationLite[]>([]);
  const [openId, setOpenId] = React.useState<string>('');

  // formationId -> liste des stagiaires
  const [trainees, setTrainees] = React.useState<Record<string, TraineeUser[]>>({});
  const [loadingTrainees, setLoadingTrainees] = React.useState<Record<string, boolean>>({});
  const [errTrainees, setErrTrainees] = React.useState<Record<string, string | null>>({});

  const [pageByFormation, setPageByFormation] = React.useState<Record<string, number>>({});

  const [activeFormationId, setActiveFormationId] = React.useState<string | null>(null);
  const [activeTrainee, setActiveTrainee] = React.useState<TraineeUser | null>(null);

  const [criteres, setCriteres] = React.useState<CritereRow[]>([]);
  const [loadingCriteres, setLoadingCriteres] = React.useState(false);
  const [errCriteres, setErrCriteres] = React.useState<string | null>(null);

  const [notesByCritere, setNotesByCritere] = React.useState<Record<string, string>>({});
  const [savingEvaluation, setSavingEvaluation] = React.useState(false);
  const [savingApproval, setSavingApproval] = React.useState(false);

  // --------- Chargement des formations où je suis director / trainer / assistant ---------
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch(
          `${API_BASE}/affectations/mine-formations?ts=${Date.now()}`,
          {
            headers: headers(),
            cache: 'no-store',
          }
        );
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

  // --------- Charger les stagiaires + evaluations pour une formation ---------
  async function loadTraineesForFormation(fid: string) {
    setLoadingTrainees(prev => ({ ...prev, [fid]: true }));
    setErrTrainees(prev => ({ ...prev, [fid]: null }));

    try {
      const r = await fetch(
        `${API_BASE}/evaluations/formations/${fid}/trainees?ts=${Date.now()}`,
        {
          headers: headers(),
          cache: 'no-store',
        }
      );
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
          certifsSnapshot: a.trainee!.certifsSnapshot || [],
          affectationId: a.affectationId,
          isPresent: a.isPresent,
          evaluation: a.evaluation || null,
        }));

      setTrainees(prev => ({ ...prev, [fid]: onlyTrainees }));
    } catch (e: any) {
      setErrTrainees(prev => ({
        ...prev,
        [fid]: e?.message || 'تعذّر تحميل المتدربين',
      }));
      setTrainees(prev => ({ ...prev, [fid]: [] }));
    } finally {
      setLoadingTrainees(prev => ({ ...prev, [fid]: false }));
    }
  }

  // --------- Toggle formation (ouvrir / fermer + charger trainees) ---------
  async function onToggleFormation(fid: string) {
    setOpenId(prev => (prev === fid ? '' : fid));

    setPageByFormation(prev => (prev[fid] ? prev : { ...prev, [fid]: 1 }));

    if (trainees[fid] !== undefined) return;
    await loadTraineesForFormation(fid);
  }

  // --------- Charger les critères + pré-remplir les notes depuis Evaluation ---------
  async function loadCriteresForFormation(f: FormationLite, trainee: TraineeUser) {
    if (!f.sessionId) {
      setErrCriteres('لا توجد جلسة مرتبطة بهذه الدورة.');
      setCriteres([]);
      return;
    }

    const niveau = getNiveauForCriteria(f.nom);
    if (!niveau) {
      setErrCriteres('لا يمكن تحديد المستوى (تمهيدية / شارة خشبية) لهذه الدورة.');
      setCriteres([]);
      return;
    }

    try {
      setLoadingCriteres(true);
      setErrCriteres(null);

      const url = `${API_BASE}/criteres?session=${encodeURIComponent(
        f.sessionId
      )}&niveau=${encodeURIComponent(niveau)}`;

      const r = await fetch(url, {
        headers: headers(),
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const list = (await r.json()) as CritereRow[];
      setCriteres(list || []);

      // initialisation des notes
      const initialNotes: Record<string, string> = {};
      list.forEach(c => {
        initialNotes[c._id] = '';
      });

      // si une evaluation existe, on pré-remplit
      const evalItems = trainee.evaluation?.items || [];
      for (const item of evalItems) {
        if (item.critere && initialNotes[item.critere] !== undefined && item.note != null) {
          initialNotes[item.critere] = String(item.note);
        }
      }

      setNotesByCritere(initialNotes);
    } catch (e: any) {
      setErrCriteres(e?.message || 'تعذّر تحميل معايير التقييم');
      setCriteres([]);
      setNotesByCritere({});
    } finally {
      setLoadingCriteres(false);
    }
  }

  // --------- Sélection d’un trainee (pastille) ---------
  async function onSelectTrainee(f: FormationLite, t: TraineeUser) {
    setActiveFormationId(f.formationId);
    setActiveTrainee(t);
    await loadCriteresForFormation(f, t);
  }

  function onChangeNote(critereId: string, value: string) {
    setNotesByCritere(prev => ({
      ...prev,
      [critereId]: value,
    }));
  }

  // --------- Sauvegarder l’évaluation (notes) - Director only ---------
  async function onSaveEvaluation(f: FormationLite) {
    if (!activeTrainee || !activeFormationId || activeFormationId !== f.formationId) return;
    if (!f.sessionId) return;
    if (!criteres.length) return;

    // 🔐 1) Contrôle : aucune note ne doit dépasser maxnote (et pas < 0)
    for (const c of criteres) {
      const raw = notesByCritere[c._id];
      if (raw == null || raw === '') continue;

      const note = Number(raw);
      if (!Number.isFinite(note)) continue;

      if (note < 0 || note > c.maxnote) {
        setErrCriteres('الرجاء إسناد عدد أقل أو يساوي العدد الأقصى المسموح');
        return;
      }
    }

    // 🔢 2) Construction du payload à envoyer au backend
    const items = criteres
      .map(c => {
        const raw = notesByCritere[c._id];
        if (raw == null || raw === '') return null;
        const note = Number(raw);
        if (!Number.isFinite(note)) return null;
        return {
          critere: c._id,
          famille: c.famille,
          note,
          maxnote: c.maxnote,
        };
      })
      .filter(Boolean) as {
      critere: string;
      famille: string;
      note: number;
      maxnote: number;
    }[];

    if (!items.length) {
      setErrCriteres('المرجو إدخال على الأقل نقطة واحدة قبل الحفظ.');
      return;
    }

    try {
      setSavingEvaluation(true);
      setErrCriteres(null);

      const r = await fetch(`${API_BASE}/evaluations/trainee`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          session: f.sessionId,
          formation: f.formationId,
          traineeId: activeTrainee._id,
          items,
        }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      const newEval = data.evaluation as EvaluationLite;

      setTrainees(prev => {
        const arr = prev[f.formationId] || [];
        const updated = arr.map(t =>
          t._id === activeTrainee._id ? { ...t, evaluation: newEval } : t
        );
        return { ...prev, [f.formationId]: updated };
      });

      setActiveTrainee(prev =>
        prev ? { ...prev, evaluation: newEval } : prev
      );
    } catch (e: any) {
      setErrCriteres(e?.message || 'تعذّر حفظ التقييم');
    } finally {
      setSavingEvaluation(false);
    }
  }

  // --------- Approbation du tuteur (trainer only) ---------
  async function onApproveEvaluation(f: FormationLite) {
    if (!activeTrainee || !f.sessionId) return;

    try {
      setSavingApproval(true);
      setErrCriteres(null);

      const r = await fetch(`${API_BASE}/evaluations/trainee/approve`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          session: f.sessionId,
          formation: f.formationId,
          traineeId: activeTrainee._id,
        }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const newEval = data.evaluation as EvaluationLite;

      setTrainees(prev => {
        const arr = prev[f.formationId] || [];
        const updated = arr.map(t =>
          t._id === activeTrainee._id ? { ...t, evaluation: newEval } : t
        );
        return { ...prev, [f.formationId]: updated };
      });

      setActiveTrainee(prev =>
        prev ? { ...prev, evaluation: newEval } : prev
      );
    } catch (e: any) {
      setErrCriteres(e?.message || 'تعذّر المصادقة على التقييم');
    } finally {
      setSavingApproval(false);
    }
  }

  function setPage(fid: string, page: number) {
    setPageByFormation(prev => ({ ...prev, [fid]: page }));
  }

  // --------- Calcul des rowSpan pour مجال التقييم (famille) ---------
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
          onClick={() => nav('/trainer')}
          style={styles.circleRedBtn}
          aria-label="رجوع"
        >
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
          const errT = errTrainees[fid] || null;

          const rawRole = ((f.myRole || '') + '').trim().toLowerCase();
          const isDirector = rawRole === 'director';
          const isTrainer = rawRole === 'trainer';
          const isAssistant = rawRole === 'assistant';

          // on ne garde que les présents
          const presentTrainees = list.filter(t => t.isPresent);
          const totalPages =
            presentTrainees.length === 0 ? 1 : Math.ceil(presentTrainees.length / PAGE_SIZE);
          const currentPage = pageByFormation[fid] || 1;
          const safePage = Math.min(Math.max(currentPage, 1), totalPages);
          const startIndex = (safePage - 1) * PAGE_SIZE;
          const pageItems = presentTrainees.slice(startIndex, startIndex + PAGE_SIZE);

          const isCurrentFormationActive = activeFormationId === fid;

          const currentEval =
            isCurrentFormationActive && activeTrainee
              ? (list.find(t => t._id === activeTrainee._id)?.evaluation || null)
              : null;

          const isEvaluationValidated = currentEval?.status === 'validated';

          // trainer approvals (info)
          const trainerApprovals = (currentEval?.approvals || []).filter(
            a => a.role === 'trainer'
          );
          const distinctTrainerUsers = new Set(trainerApprovals.map(a => a.user));
          const trainerApprovalsCount = distinctTrainerUsers.size;

          // assistant ne voit le tableau que si VALIDATED
          const canShowCriteriaTable =
            !loadingCriteres &&
            !errCriteres &&
            criteres.length > 0 &&
            (!isAssistant || (isAssistant && isEvaluationValidated));

          const allCriteriaEvaluated =
            !!currentEval &&
            criteres.length > 0 &&
            (currentEval.items || []).length === criteres.length;

          return (
            <div key={fid} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={styles.cardTitle}>
                    {f.sessionTitle ? `${f.sessionTitle} — ${f.nom}` : f.nom}
                    <span style={{ opacity: 0.5, paddingInline: 6 }}>•</span>
                    <span style={styles.metaLine}>{fmtRange(f.startDate, f.endDate)}</span>
                    <span style={{ opacity: 0.5, paddingInline: 6 }}>•</span>
                    <span style={styles.metaLine}>
                      {[f.centreTitle || ''].filter(Boolean).join(' - ') || 'مركز تدريب'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => onToggleFormation(fid)}
                    style={styles.eyeBtn}
                    title={opened ? 'إخفاء قائمة المتدربين' : 'عرض قائمة المتدربين'}
                  >
                    {opened ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {opened && (
                <div style={styles.detailWrap}>
                  <div style={styles.formBlock}>
                    {isLoadingT && (
                      <div style={{ color: '#6b7280' }}>
                        … جارِ تحميل قائمة المتدربين
                      </div>
                    )}

                    {errT && <div style={{ color: '#b91c1c' }}>❌ {errT}</div>}

                    {!isLoadingT && !errT && presentTrainees.length === 0 && (
                      <div style={{ color: '#9ca3af' }}>
                        لا يوجد متدربون حاضرين حالياً في هذه الدورة.
                      </div>
                    )}

                    {!isLoadingT && !errT && presentTrainees.length > 0 && (
                      <>
                        <div style={styles.pillsContainer}>
                          {pageItems.map(t => {
                            const selected =
                              isCurrentFormationActive &&
                              activeTrainee &&
                              activeTrainee._id === t._id;

                            return (
                              <button
                                key={t._id}
                                onClick={() => onSelectTrainee(f, t)}
                                style={{
                                  ...styles.pill,
                                  ...(selected ? styles.pillSelected : {}),
                                }}
                              >
                                {t.prenom} {t.nom}
                              </button>
                            );
                          })}
                        </div>

                        {totalPages > 1 && (
                          <div style={styles.pagination}>
                            <button
                              style={styles.pageBtn}
                              onClick={() => setPage(fid, safePage - 1)}
                              disabled={safePage <= 1}
                            >
                              السابق
                            </button>
                            <span style={styles.pageInfo}>
                              صفحة {safePage} / {totalPages}
                            </span>
                            <button
                              style={styles.pageBtn}
                              onClick={() => setPage(fid, safePage + 1)}
                              disabled={safePage >= totalPages}
                            >
                              التالي
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {isCurrentFormationActive && activeTrainee && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ marginBottom: 8, fontWeight: 700 }}>
                          تقييم المتدرب: {activeTrainee.prenom} {activeTrainee.nom}
                        </div>

                        {currentEval && (
                          <div style={{ marginBottom: 8, fontSize: 12, color: '#4b5563' }}>
                            حالة التقييم :{' '}
                            <span style={{ fontWeight: 700 }}>
                              {getStatusLabel(currentEval.status)}
                            </span>
                            {trainerApprovalsCount > 0 && (
                              <span style={{ marginInlineStart: 8 }}>
                                – عدد المدربين الذين صادقوا: {trainerApprovalsCount}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Messages d’info selon le rôle */}
                        {isTrainer && (
                          <div style={{ color: '#6b7280', marginBottom: 8 }}>
                            إدخال النقاط مخصص لقائد الدراسة. يمكنك المصادقة بعد اكتمال التقييم.
                          </div>
                        )}

                        {/* Assistant : tant que pas VALIDATED → pas de tableau */}
                        {isAssistant && !isEvaluationValidated && (
                          <div style={{ color: '#6b7280', marginBottom: 8 }}>
                            التقييم قيد المصادقة من طرف قائد الدراسة والمدربين. يمكنك
                            الإطلاع على تفاصيل التقييم بعد اكتمال جميع المصادقات.
                          </div>
                        )}

                        {loadingCriteres && (
                          <div style={{ color: '#6b7280' }}>
                            … جارِ تحميل معايير التقييم
                          </div>
                        )}

                        {errCriteres && (
                          <div style={{ color: '#b91c1c', marginBottom: 8 }}>
                            ❌ {errCriteres}
                          </div>
                        )}

                        {/* Tableau de critères :
                            - director / trainer : dès que critères chargés
                            - assistant : uniquement si VALIDATED */}
                        {canShowCriteriaTable && (
                          <>
                            <div style={{ overflowX: 'auto' }}>
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

                                    return (
                                      <tr key={c._id}>
                                        {rowSpan && (
                                          <td
                                            style={styles.tdFamille}
                                            rowSpan={rowSpan}
                                          >
                                            {c.famille}
                                          </td>
                                        )}
                                        <td style={styles.td}>{c.critere}</td>
                                        <td style={styles.td}>{c.maxnote}</td>
                                        <td style={styles.td}>
                                          <input
                                            type="number"
                                            min={0}
                                            max={c.maxnote}
                                            step={1}
                                            value={notesByCritere[c._id] ?? ''}
                                            disabled={
                                              !isDirector || isEvaluationValidated || isAssistant
                                            }
                                            onChange={e =>
                                              onChangeNote(c._id, e.target.value)
                                            }
                                            style={styles.noteInput}
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div
                              style={{
                                marginTop: 12,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <div style={{ fontSize: 12, color: '#6b7280' }}>
                                {currentEval
                                  ? `حالة التقييم الحالية: ${getStatusLabel(
                                      currentEval.status
                                    )}`
                                  : 'لم يتم إنشاء تقييم بعد.'}
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 4,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    justifyContent: 'flex-end',
                                  }}
                                >
                                  {/* Director : saisie / validation des notes */}
                                  {isDirector && !isEvaluationValidated && (
                                    <button
                                      onClick={() => onSaveEvaluation(f)}
                                      style={styles.saveEvalBtn}
                                      disabled={savingEvaluation}
                                    >
                                      {savingEvaluation
                                        ? '… جاري الحفظ'
                                        : 'تأكيد التقييم'}
                                    </button>
                                  )}

                                  {/* Trainer : bouton d’approbation uniquement */}
                                  {isTrainer &&
                                    !isEvaluationValidated &&
                                    allCriteriaEvaluated && (
                                      <button
                                        onClick={() => onApproveEvaluation(f)}
                                        style={styles.refreshBtn}
                                        disabled={savingApproval}
                                      >
                                        {savingApproval
                                          ? '… جاري المصادقة'
                                          : 'أصادق على هذا التقييم'}
                                      </button>
                                    )}
                                  {/* Assistant : jamais de bouton */}
                                </div>

                                {/* Message d’info si le trainer ne peut pas encore valider */}
                                {isTrainer &&
                                  !isEvaluationValidated &&
                                  !allCriteriaEvaluated && (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: '#b91c1c',
                                        textAlign: 'left',
                                      }}
                                    >
                                      يجب إسناد عدد لكل معيار تقييم قبل المصادقة على
                                      التقييم.
                                    </div>
                                  )}
                              </div>
                            </div>
                          </>
                        )}

                        {!loadingCriteres &&
                          !errCriteres &&
                          criteres.length === 0 && (
                            <div style={{ color: '#9ca3af', marginTop: 8 }}>
                              لا توجد معايير تقييم معرفة لهذه الدورة/المستوى.
                            </div>
                          )}
                      </div>
                    )}
                  </div>
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

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.82 21.82 0 0 1 5.08-6.36"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10.58 10.58a3 3 0 1 0 4.24 4.24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
  },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },

  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937', marginBottom: 100 },
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
  cardHeader: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#374151' },
  metaLine: { color: '#6b7280', fontSize: 14 },

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

  refreshBtn: {
    borderRadius: 999,
    border: `1px solid ${RED}`,
    padding: '6px 12px',
    background: '#fff',
    color: RED,
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  detailWrap: { borderTop: '1px dashed #e5e7eb', paddingTop: 10, display: 'grid', gap: 14 },

  formBlock: {
    background: '#fff',
    border: '1px solid #e9edf3',
    borderRadius: 18,
    boxShadow: '0 10px 24px rgba(0,0,0,.03)',
    padding: '14px',
    display: 'grid',
    gap: 12,
  },

  pillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 999,
    border: '1px solid #e9edf3',
    padding: '4px 10px',
    background: '#f9fafb',
    cursor: 'pointer',
    fontSize: 13,
  },
  pillSelected: {
    borderColor: RED,
    background: '#fee2e2',
    color: '#b91c1c',
    fontWeight: 600,
  },

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

  noteInput: {
    width: 70,
    padding: '4px 6px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
  },

  saveEvalBtn: {
    borderRadius: 999,
    border: 'none',
    padding: '6px 16px',
    background: RED,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },

  pagination: {
    marginTop: 8,
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    fontSize: 13,
  },
  pageBtn: {
    borderRadius: 999,
    border: '1px solid #e9edf3',
    padding: '4px 10px',
    background: '#f9fafb',
    cursor: 'pointer',
    minWidth: 70,
  },
  pageInfo: {
    color: '#4b5563',
  },
};
