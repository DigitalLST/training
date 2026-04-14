import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type SessionRow = {
  id: string;
  title: string;
  period: string;
  visible: boolean;
  organizer?: string;
  trainingLevels: string[];
  branches: string[];
};

type FormationLite = {
  _id: string;
  niveau?: string;
  nom: string;
  branches?: string[];
};

type SessionTraineeRow = {
  key: string;
  traineeId: string;
  idScout: string;
  fullName: string;
  email: string;
  formationName: string;
  decision?: string;
};

type ExpandedState = {
  loading: boolean;
  error: string | null;
  rows: SessionTraineeRow[];
  showDecision: boolean;
};

const PAGE_TITLES: Record<string, string> = {
  '/region/': '',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export default function ResultatSession(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userRegion, setUserRegion] = useState('');

  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, ExpandedState>>({});

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  function norm(v?: string): string {
    return String(v || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function isDetailedLevel(level?: string): boolean {
    const v = String(level || '').trim();
    return v === 'تمهيدية' || v === 'شارة خشبية';
  }

  function mapDecisionLabel(decision?: string | null): string {
    if (decision === 'success') return 'يؤهل';
    if (decision === 'retake') return 'يعيد الدورة';
    if (decision === 'incompatible') return 'لا يناسب الدور';
    return '—';
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const fmtMonth = (iso?: string) =>
          iso
            ? new Date(iso).toLocaleDateString('ar-TN', {
                year: 'numeric',
                month: 'long',
              })
            : '—';

        const normArray = (v: any): string[] =>
          Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : [];

        async function fetchMe() {
          const r = await fetch(`${API_BASE}/users/me?ts=${Date.now()}`, {
            headers: authHeaders(),
            cache: 'no-store',
          });

          if (!r.ok) throw new Error(`ME HTTP ${r.status}`);
          return await r.json();
        }

        async function fetchSessionsPreferRegional(): Promise<any[]> {
          const r1 = await fetch(`${API_BASE}/sessions/regional?ts=${Date.now()}`, {
            headers: authHeaders(),
            cache: 'no-store',
          });

          if (r1.ok) return (await r1.json()) as any[];

          if (r1.status === 404) {
            const r2 = await fetch(`${API_BASE}/sessions?ts=${Date.now()}`, {
              headers: authHeaders(),
              cache: 'no-store',
            });
            if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
            return (await r2.json()) as any[];
          }

          throw new Error(`HTTP ${r1.status}`);
        }

        const [me, data] = await Promise.all([fetchMe(), fetchSessionsPreferRegional()]);

        setUserRegion(String(me?.region || '').trim());

        const mapped: SessionRow[] = data
          .filter((s) => Boolean(s.isVisible ?? s.isvisible ?? false) === true)
          .map((s) => {
            const trainingLevels = normArray(
              s.trainingLevels ?? s.trainingLevel ?? s.levels ?? s.level
            );

            const branches = normArray(s.branche ?? s.branches ?? s.branch);

            const organizer = String(
              s.organizer ??
                s.organizerRegion ??
                s.organizerName ??
                s.organiser ??
                s.regionOrganizer ??
                ''
            ).trim();

            return {
              id: String(s._id ?? s.id),
              title: String(s.title ?? '').trim(),
              period: `${fmtMonth(s.startDate)}`,
              visible: Boolean(s.isVisible ?? s.isvisible ?? false),
              trainingLevels,
              branches,
              organizer,
            };
          });

        setRows(mapped);
      } catch (e: any) {
        setErr(e.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleSession(session: SessionRow) {
    const sessionId = session.id;

    if (openSessionId === sessionId) {
      setOpenSessionId(null);
      return;
    }

    setOpenSessionId(sessionId);

    if (expanded[sessionId]) return;

    setExpanded(prev => ({
      ...prev,
      [sessionId]: {
        loading: true,
        error: null,
        rows: [],
        showDecision: false,
      },
    }));

    try {
      const rf = await fetch(`${API_BASE}/formations?sessionId=${sessionId}&ts=${Date.now()}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });

      if (!rf.ok) throw new Error(`FORMATIONS HTTP ${rf.status}`);

      const formations = (await rf.json()) as FormationLite[];

      const showDecision =
        formations.some(f => isDetailedLevel(f.niveau)) ||
        session.trainingLevels.some(lvl => isDetailedLevel(lvl));

      const formationPayloads = await Promise.all(
        formations.map(async (formation) => {
          const rt = await fetch(
            `${API_BASE}/evaluations/formations/${formation._id}/trainees?ts=${Date.now()}`,
            {
              headers: authHeaders(),
              cache: 'no-store',
            }
          );

          if (!rt.ok) {
            throw new Error(`TRAINEES HTTP ${rt.status}`);
          }

          const data = await rt.json();
          const trainees = Array.isArray(data?.trainees) ? data.trainees : [];

          const rowsForFormation: SessionTraineeRow[] = trainees
            .filter((r: any) => {
              const trainee = r?.trainee;
              if (!trainee) return false;

              return norm(trainee.region) === norm(userRegion);
            })
            .map((r: any) => {
              const trainee = r.trainee || {};
              const decisionRaw = r.finalDecision?.decision ?? null;

              return {
                key: `${formation._id}-${trainee._id}`,
                traineeId: String(trainee._id || ''),
                idScout: String(trainee.idScout || ''),
                fullName: `${String(trainee.prenom || '').trim()} ${String(
                  trainee.nom || ''
                ).trim()}`.trim(),
                email: String(trainee.email || ''),
                formationName: String(formation.nom || ''),
                decision: showDecision ? mapDecisionLabel(decisionRaw) : undefined,
              };
            });

          return rowsForFormation;
        })
      );

      const merged = formationPayloads.flat().sort((a, b) => {
        if (a.formationName !== b.formationName) {
          return a.formationName.localeCompare(b.formationName, 'ar');
        }
        return a.fullName.localeCompare(b.fullName, 'ar');
      });

      setExpanded(prev => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: null,
          rows: merged,
          showDecision,
        },
      }));
    } catch (e: any) {
      setExpanded(prev => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: e?.message || 'تعذر تحميل قائمة المتدربين',
          rows: [],
          showDecision: false,
        },
      }));
    }
  }

  function onBack() {
    nav('/region/');
  }

  const pageTitle = PAGE_TITLES[pathname] ?? '';

  return (
    <div
      style={{
        width: '90vw',
        alignItems: 'center',
        marginLeft: 20,
        marginRight: 20,
        paddingInline: 24,
      }}
    >
      {pageTitle && <span style={styles.pageTitle}>{pageTitle}</span>}

      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span> النتائج النهائية لمتدربي جهة {userRegion || ''} </span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((row) => {
          const isOpen = openSessionId === row.id;
          const details = expanded[row.id];

          return (
            <div key={row.id} style={styles.cardWrap} dir="rtl">
              <div style={styles.item}>
                <div style={styles.itemRight}>
                  <div style={styles.itemTitle}>
                    {row.title} - {row.period}
                  </div>

                  <div style={styles.metaLine}>
                    <span style={styles.metaLabel}>الجهة المنظمة:</span>
                    <span style={styles.metaLabel}>{row.organizer || '—'}</span>
                  </div>
                </div>

                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.eyeBtn}
                    onClick={() => toggleSession(row)}
                    title={isOpen ? 'إخفاء القائمة' : 'عرض القائمة'}
                    aria-label={isOpen ? 'إخفاء القائمة' : 'عرض القائمة'}
                  >
                    {isOpen ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={styles.expandedBlock}>
                  {details?.loading && (
                    <div style={{ color: '#6b7280' }}>… جاري تحميل المتدربين</div>
                  )}

                  {details?.error && (
                    <div style={{ color: '#b91c1c' }}>❌ {details.error}</div>
                  )}

                  {!details?.loading && !details?.error && (
                    <>
                      {details.rows.length === 0 ? (
                        <div style={{ padding: 12, color: '#6b7280' }}>
                          لا يوجد متدربون من جهتك في هذه الدورة
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>المعرف الكشفي</th>
                                <th style={styles.th}>الاسم و اللقب</th>
                                <th style={styles.th}>البريد الإلكتروني</th>
                                <th style={styles.th}> الدراسة</th>
                                {details.showDecision && (
                                  <th style={styles.th}>القرار النهائي</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {details.rows.map((t) => (
                                <tr key={t.key}>
                                  <td style={styles.td}>{t.idScout || '—'}</td>
                                  <td style={styles.td}>{t.fullName || '—'}</td>
                                  <td style={styles.td}>{t.email || '—'}</td>
                                  <td style={styles.td}>{t.formationName || '—'}</td>
                                  {details.showDecision && (
                                    <td style={styles.td}>{t.decision || '—'}</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#1f2937',
    marginBottom: 100,
  },
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
  cardWrap: {
    width: '97%',
    display: 'grid',
    gap: 8,
  },
  item: {
    background: '#fff',
    borderRadius: 22,
    border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: '16px 18px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    minHeight: 78,
  },
  itemRight: {
    display: 'grid',
    justifyItems: 'start',
    gap: 6,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 200,
    color: '#374151',
  },
  metaLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  actions: {
    display: 'flex',
    gap: 18,
    color: '#0f172a',
    alignItems: 'center',
  },
  eyeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: 'transparent',
    border: `2px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },
  expandedBlock: {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e9edf3',
    boxShadow: '0 8px 18px rgba(0,0,0,.04)',
    padding: '14px 16px',
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
    verticalAlign: 'top',
  },
};

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
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4.2 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6.2 6.2A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.1-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}