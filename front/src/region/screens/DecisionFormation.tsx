import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

const RED = '#e20514';
const STORE_KEY = 'aff_ctx_v2';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

type Ctx = {
  fid?: string | null;
  sid?: string;
  title?: string;
  period?: string;
};

type FormationInfo = {
  _id: string;
  sessionId: string;
  nom: string;
  niveau?: string;
  branches?: string[];
  centre?: {
    _id?: string | null;
    title?: string;
    region?: string;
  };
  sessionTitle?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type AffectationRow = {
  _id: string;
  role: string;
  isPresent?: boolean;
  user: {
    _id: string;
    prenom: string;
    nom: string;
    email?: string;
    idScout?: string;
    region?: string | null;
  } | null;
};

type FinalDecisionLite = {
  traineeId: string;
  decision?: 'success' | 'retake' | 'incompatible' | null;
  status: 'draft' | 'pending_team' | 'validated';
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function readCtxFromStorage(): Ctx | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

function fmtRange(s?: string | null, e?: string | null) {
  if (!s && !e) return '—';
  const sd = s ? new Date(s) : null;
  const ed = e ? new Date(e) : null;

  const F = (d: Date) =>
    d.toLocaleDateString('ar-TN', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });

  if (sd && ed) return `${F(sd)} — ${F(ed)}`;
  if (sd) return `من ${F(sd)}`;
  return `إلى ${F(ed!)}`;
}

function lockAfter7Days(endDate?: string | null) {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  const limit = new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000);
  return new Date() > limit;
}

function roleLabel(role: string) {
  if (role === 'director_reg') return 'قائد الدراسة';
  if (role === 'trainer_reg') return 'مساعد قائد الدراسة';
  if (role === 'assistant_reg') return 'حامل شارة';
  if (role === 'coach_reg') return 'المرشد الفني';
  return role;
}

export default function FormationFinalRegion(): React.ReactElement | null {
  const nav = useNavigate();

  const [ctx, setCtx] = React.useState<Ctx | null>(() => readCtxFromStorage());

  const [formation, setFormation] = React.useState<FormationInfo | null>(null);
  const [trainees, setTrainees] = React.useState<AffectationRow[]>([]);
  const [team, setTeam] = React.useState<AffectationRow[]>([]);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = readCtxFromStorage();
    setCtx(stored);
    if (!stored?.fid) {
      nav('/region/gestionformations', { replace: true });
    }
  }, [nav]);

  const fid = ctx?.fid || null;

  const downloadPdf = async () => {
    if (!fid) return;

    try {
      setDownloading(true);
      setErr(null);

      const url = `${API_BASE}/final-decisions/formations/${fid}/report-region?ts=${Date.now()}`;

      const r = await fetch(url, {
        method: 'GET',
        headers: headers(),
        cache: 'no-store',
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const contentType = r.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) {
        const text = await r.text();
        throw new Error(text || 'تعذّر تحميل ملف PDF');
      }

      const blob = await r.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report_region_${fid}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تحميل PDF');
    } finally {
      setDownloading(false);
    }
  };

  React.useEffect(() => {
    (async () => {
      if (!fid) return;

      try {
        setLoading(true);
        setErr(null);

        const [formationRes, affectationsRes, finalDecisionsRes] = await Promise.all([
          api(`/formations/${fid}`),
          api(`/affectations/formations/${fid}/affectations`),
          api(`/final-decisions/formations/${fid}`),
        ]);

        const formationData: FormationInfo = {
          _id: formationRes?._id,
          sessionId: formationRes?.sessionId,
          nom: formationRes?.nom || '',
          niveau: formationRes?.niveau || '',
          branches: Array.isArray(formationRes?.branches) ? formationRes.branches : [],
          centre: formationRes?.centre || null,
          sessionTitle: formationRes?.sessionTitle || ctx?.title || '',
          startDate: formationRes?.startDate || null,
          endDate: formationRes?.endDate || null,
        };

        setFormation(formationData);

        const allRows: AffectationRow[] = Array.isArray(affectationsRes) ? affectationsRes : [];

        const traineeRows = allRows.filter(r => r.role === 'trainee' && !!r.user);
        const teamRows = allRows.filter(
          r =>
            ['director_reg', 'trainer_reg', 'assistant_reg', 'coach_reg'].includes(r.role) &&
            !!r.user
        );

        setTrainees(traineeRows);
        setTeam(teamRows);

        const decisions: FinalDecisionLite[] = Array.isArray(finalDecisionsRes?.decisions)
          ? finalDecisionsRes.decisions
          : [];

        const successSet = new Set(
          decisions
            .filter(
              d => d && d.traineeId && d.decision === 'success' && d.status === 'validated'
            )
            .map(d => String(d.traineeId))
        );

        const nextChecked: Record<string, boolean> = {};
        for (const row of traineeRows) {
          const traineeId = String(row.user!._id);
          nextChecked[traineeId] = successSet.has(traineeId);
        }
        setChecked(nextChecked);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل البيانات');
      } finally {
        setLoading(false);
      }
    })();
  }, [fid, ctx?.title]);

  if (!ctx?.fid) return null;

  const locked = lockAfter7Days(formation?.endDate);

  async function onValidate() {
    if (!fid || locked) return;

    try {
      setSaving(true);
      setErr(null);

      const items = trainees
        .filter(r => r.user)
        .map(r => ({
          traineeId: String(r.user!._id),
          participated: !!checked[String(r.user!._id)],
        }));

      await api(`/final-decisions/formations/${fid}/validate-region`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });

      alert('تم الحفظ');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" style={{ width: '70vw', paddingInline: 24, marginLeft: 20 }}>
      <div style={styles.toolbarRight}>
        <button onClick={() => nav(-1)} style={styles.circleRedBtn}>
          <ArrowRightIcon />
        </button>
      </div>

      <div style={styles.redLine} />

      <div style={styles.card}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={styles.cardTitle}>
            {ctx.title || formation?.sessionTitle || 'جلسة'} — {formation?.nom || 'الدورة'}
          </div>

          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {formation?.centre?.title || '—'}
            {formation?.centre?.region ? ` — ${formation.centre.region}` : ''}
          </div>

          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {fmtRange(formation?.startDate, formation?.endDate)}
          </div>

          {locked && (
            <div style={{ color: '#b91c1c', fontSize: 12 }}>
              انتهت مهلة التعديل بعد 7 أيام من تاريخ نهاية الدورة
            </div>
          )}
        </div>

        {team.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, color: '#374151' }}>قيادة الدراسة</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {team.map(member => (
                <span key={member._id} style={styles.badge}>
                  {member.user?.prenom} {member.user?.nom} — {roleLabel(member.role)}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
        {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

        {!loading && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>تأكيد المشاركة</th>
                    <th style={styles.th}>المعرف الكشفي</th>
                    <th style={styles.th}>الاسم و اللقب</th>
                    <th style={styles.th}>الجهة</th>
                    <th style={styles.th}>البريد الإلكتروني</th>
                  </tr>
                </thead>
                <tbody>
                  {trainees.map(row => {
                    if (!row.user) return null;
                    const traineeId = String(row.user._id);

                    return (
                      <tr key={row._id}>
                        <td style={styles.td}>
                          <input
                            type="checkbox"
                            checked={!!checked[traineeId]}
                            disabled={locked}
                            onChange={e =>
                              setChecked(prev => ({
                                ...prev,
                                [traineeId]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td style={styles.td}>{row.user.idScout || '—'}</td>
                        <td style={styles.td}>
                          {row.user.prenom} {row.user.nom}
                        </td>
                        <td style={styles.td}>{row.user.region || '—'}</td>
                        <td style={styles.td}>{row.user.email || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!locked && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onValidate}
                  disabled={saving}
                  style={styles.saveBtn}
                >
                  {saving ? '... جارٍ الحفظ' : 'حفظ'}
                </button>
              </div>
            )}

            {locked && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={downloading}
                  style={styles.saveBtn}
                >
                  {downloading ? '... جارٍ التحميل' : 'بطاقة النتائج'}
                </button>
              </div>
            )}

            {!trainees.length && !loading && (
              <div style={{ color: '#9ca3af' }}>لا يوجد متدربون في هذه الدورة.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

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
    gap: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#374151' },
  badge: {
    background: '#f3f4f6',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    color: '#374151',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
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
  saveBtn: {
    borderRadius: 999,
    padding: '6px 18px',
    border: 'none',
    background: RED,
    color: '#fff',
    cursor: 'pointer',
  },
};