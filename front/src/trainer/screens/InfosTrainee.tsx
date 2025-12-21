import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';
const PAGE_SIZE = 15;

// Snapshot de certif e-training (à adapter à ton backend)
type CertifLite = {
  code?: string; // ex: 'L1', 'L2', 'L3', 'F6', 'F7'
  date?: string; // ISO date
};

// Formation où je suis director/trainer
type FormationLite = {
  formationId: string;         // ✅ au lieu de _id
  nom: string;
  myRole: 'trainer' | 'director';
  sessionTitle?: string;
  startDate?: string;
  endDate?: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionId?: string;          // toujours dispo si tu en as besoin ailleurs
};

// Trainee minimal (vient de /affectations/formations/:fid/affectations)
type TraineeUser = {
  _id: string;                 // id user
  prenom: string;
  nom: string;
  email?: string;
  idScout?: string;
  region?: string;
  certifsSnapshot?: CertifLite[];
  affectationId: string;       // 👈 id de l'affectation (SessionAffectation._id)
  isPresent?: boolean;         // 👈 flag présence
};

type AffectationRow = {
  _id: string;                 // id affectation
  role: 'director' | 'trainer' | 'trainee';
  isPresent?: boolean;         // 👈 renvoyé par l'API
  user: {
    _id: string;
    prenom: string;
    nom: string;
    email?: string;
    idScout?: string;
    region?: string;
    certifsSnapshot?: CertifLite[];
  } | null;
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

function fmtCertifDate(date?: string) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-TN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Quels niveaux afficher selon le nom de la formation ?
function getLevelsForFormation(nom: string): string[] {
  if (nom.includes('شارة')) {
    // شارة خشبية
    return ['L1', 'L3', 'F6', 'F7'];
  }
  if (nom.includes('تمهيدية')) {
    return ['L1', 'L2'];
  }
  return [];
}

export default function InfosTrainee(): React.JSX.Element {
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [formations, setFormations] = React.useState<FormationLite[]>([]);
  const [openId, setOpenId] = React.useState<string>('');

  // formationId -> liste des trainees
  const [trainees, setTrainees] = React.useState<Record<string, TraineeUser[]>>({});
  const [loadingTrainees, setLoadingTrainees] = React.useState<Record<string, boolean>>({});
  const [errTrainees, setErrTrainees] = React.useState<Record<string, string | null>>({});

  // formationId -> page courante (1-based)
  const [pageByFormation, setPageByFormation] = React.useState<Record<string, number>>({});

  // formationId -> refresh certifs en cours ?
  const [refreshing, setRefreshing] = React.useState<Record<string, boolean>>({});

  // formationId -> sauvegarde présence en cours ?
  const [savingPresence, setSavingPresence] = React.useState<Record<string, boolean>>({});

  /* ------- Chargement de mes formations (où je suis director / trainer) ------- */
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

        // On suppose que l'API renvoie déjà { formationId, nom, ..., sessionId }
        setFormations(list || []);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل الدورات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------- helper : charger les trainees pour une formation ------- */
  async function loadTraineesForFormation(fid: string) {
    setLoadingTrainees(prev => ({ ...prev, [fid]: true }));
    setErrTrainees(prev => ({ ...prev, [fid]: null }));

    try {
      const r = await fetch(
        `${API_BASE}/affectations/formations/${fid}/affectations?ts=${Date.now()}`,
        {
          headers: headers(),
          cache: 'no-store',
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const rows = (await r.json()) as AffectationRow[];

      const onlyTrainees: TraineeUser[] = rows
        .filter(a => a.role === 'trainee' && a.user)
        .map(a => ({
          _id: a.user!._id,
          prenom: a.user!.prenom,
          nom: a.user!.nom,
          email: a.user!.email,
          idScout: a.user!.idScout,
          region: a.user!.region,
          certifsSnapshot: a.user!.certifsSnapshot || [],
          affectationId: a._id,
          isPresent: a.isPresent ?? false,
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

  /* ------- Ouverture carte : charge la liste des trainees ------- */
  async function onToggleFormation(fid: string) {
    setOpenId(prev => (prev === fid ? '' : fid));

    // si on ouvre pour la première fois, initialiser la page à 1
    setPageByFormation(prev => (prev[fid] ? prev : { ...prev, [fid]: 1 }));

    if (trainees[fid] !== undefined) return; // déjà chargé
    await loadTraineesForFormation(fid);
  }

  /* ------- Rafraîchir les certifsSnapshot seulement pour les trainees de la page affichée ------- */
 /* ------- Rafraîchir les certifsSnapshot pour TOUS les trainees de la formation (via affectations) ------- */
async function onRefreshCertifs(f: FormationLite) {
  const fid = f.formationId;
  const list = trainees[fid] || [];

  if (!list.length) return; // rien à faire

  // 👇 Liste des affectationIds pour tous les trainees de cette formation
  const affectationIds = list
    .map(u => u.affectationId)
    .filter(Boolean);

  if (!affectationIds.length) return;

  try {
    setRefreshing(prev => ({ ...prev, [fid]: true }));
    setErrTrainees(prev => ({ ...prev, [fid]: null }));

    const r = await fetch(`${API_BASE}/demandes/resync-affectations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        affectationIds,
      }),
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    // Une fois la resync terminée, on recharge les trainees de cette formation
    await loadTraineesForFormation(fid);
  } catch (e: any) {
    setErrTrainees(prev => ({
      ...prev,
      [fid]: e?.message || 'تعذّر تحديث الشهادات',
    }));
  } finally {
    setRefreshing(prev => ({ ...prev, [fid]: false }));
  }
}


  /* ------- Toggle présence pour un trainee (dans le state local) ------- */
  function onTogglePresence(formationId: string, userId: string, value: boolean) {
    setTrainees(prev => {
      const current = prev[formationId] || [];
      const updated = current.map(u =>
        u._id === userId ? { ...u, isPresent: value } : u
      );
      return { ...prev, [formationId]: updated };
    });
  }

  /* ------- Sauvegarder la présence en base (POST /affectations/trainee-presence) ------- */
  async function onSavePresence(fid: string) {
    const list = trainees[fid] || [];
    if (!list.length) return;

    try {
      setSavingPresence(prev => ({ ...prev, [fid]: true }));
      setErrTrainees(prev => ({ ...prev, [fid]: null }));

      const items = list
        .filter(u => u.affectationId)
        .map(u => ({
          affectationId: u.affectationId,
          isPresent: !!u.isPresent,
        }));

      const r = await fetch(`${API_BASE}/affectations/trainee-presence`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ items }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // const resJson = await r.json();
    } catch (e: any) {
      setErrTrainees(prev => ({
        ...prev,
        [fid]: e?.message || 'تعذّر حفظ الحضور',
      }));
    } finally {
      setSavingPresence(prev => ({ ...prev, [fid]: false }));
    }
  }

  function setPage(fid: string, page: number) {
    setPageByFormation(prev => ({ ...prev, [fid]: page }));
  }

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
          const isRefreshing = refreshing[fid] || false;
          const isSaving = savingPresence[fid] || false;

          const levelsToShow = getLevelsForFormation(f.nom);
          const isDirector = f.myRole === 'director'; // 👈 clef de la gestion de présence
          function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
          const todayYmd = toYMD(new Date());
          const startYmd = f?.startDate ? toYMD(new Date(f.startDate)) : null;
          const canEditPresence = isDirector && startYmd !== null && todayYmd >= startYmd;

          const totalPages =
            list.length === 0 ? 1 : Math.ceil(list.length / PAGE_SIZE);
          const currentPage = pageByFormation[fid] || 1;
          const safePage = Math.min(Math.max(currentPage, 1), totalPages);
          const startIndex = (safePage - 1) * PAGE_SIZE;
          const pageItems = list.slice(startIndex, startIndex + PAGE_SIZE);

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
                    onClick={() => onRefreshCertifs(f)}
                    style={styles.refreshBtn}
                    disabled={isRefreshing}
                    title="تحديث شهادات المتدربين"
                  >
                    {isRefreshing ? '… تحديث الشهادات' : 'تحديث الشهادات'}
                  </button>

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
                    {/* Pagination + bouton sauvegarde présence (réservé au director) */}
                    {list.length > 0 && (
                      <div style={styles.pagination}>
                        {totalPages > 1 && (
                          <>
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
                          </>
                        )}

                        {canEditPresence && (
                          <button
                            onClick={() => onSavePresence(fid)}
                            style={styles.refreshBtn}
                            disabled={isSaving}
                            title="تسجيل حضور المتدربين"
                          >
                            {isSaving ? '… جاري الحفظ' : 'تسجيل الحضور'}
                          </button>
                        )}
                      </div>
                    )}

                    {isLoadingT && (
                      <div style={{ color: '#6b7280' }}>
                        … جارِ تحميل قائمة المتدربين
                      </div>
                    )}

                    {errT && <div style={{ color: '#b91c1c' }}>❌ {errT}</div>}

                    {!isLoadingT && !errT && list.length === 0 && (
                      <div style={{ color: '#9ca3af' }}>
                        لا يوجد متدربون معيّنون في هذه الدورة حالياً.
                      </div>
                    )}

                    {!isLoadingT && !errT && list.length > 0 && (
                      <>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>#</th>
                                <th style={styles.th}>المعرف الكشفي</th>
                                <th style={styles.th}>الاسم و اللقب</th>
                                <th style={styles.th}>الجهة</th>
                                <th style={styles.th}>البريد الإلكتروني</th>
                                <th style={styles.th}>الحضور</th>
                                {levelsToShow.map(level => (
                                  <th key={level} style={styles.th}>
                                    {level}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pageItems.map((u, idx) => {
                                const certifs = u.certifsSnapshot || [];
                                const rank = startIndex + idx + 1;

                                return (
                                  <tr key={u._id}>
                                    <td style={styles.td}>{rank}</td>
                                    <td style={styles.td}>{u.idScout || '—'}</td>
                                    <td style={styles.td}>
                                      {u.prenom} {u.nom}
                                    </td>
                                    <td style={styles.td}>{u.region || '—'}</td>
                                    <td style={styles.td}>{u.email || '—'}</td>
                                    <td style={styles.td}>
                                      {canEditPresence ? (
                                        <input
                                          type="checkbox"
                                          checked={!!u.isPresent}
                                          onChange={e =>
                                            onTogglePresence(fid, u._id, e.target.checked)
                                          }
                                        />
                                      ) : (
                                        // lecture seule pour trainer
                                        <input
                                          type="checkbox"
                                          checked={!!u.isPresent}
                                          readOnly
                                          disabled
                                        />
                                      )}
                                    </td>
                                    {levelsToShow.map(levelCode => {
                                      const c = certifs.find(
                                        x => x.code === levelCode
                                      );
                                      return (
                                        <td key={levelCode} style={styles.td}>
                                          {fmtCertifDate(c?.date)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
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
  blockTitle: { fontWeight: 700, color: '#374151', marginBottom: 4 },

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
  },

  pagination: {
    marginTop: 8,
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
