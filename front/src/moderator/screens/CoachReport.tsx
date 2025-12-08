// src/screens/ModeratorCoachReport.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type ReportData = {
  block1: string;
  block2: string;
  block3: string;
  updatedAt?: string | null;
  hasSignature?: boolean;
};

type FormationHeader = {
  _id: string;
  nom: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionTitle?: string;
  sessionStartDate?: string;
  sessionEndDate?: string;
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

function fmtRange(s?: string, e?: string) {
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

export default function ModeratorCoachReport(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation();
  const { formationId } = (state || {}) as LocationState;

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [header, setHeader] = React.useState<FormationHeader | null>(null);
  const [report, setReport] = React.useState<ReportData | null>(null);

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
          const rF = await fetch(
            `${API_BASE}/formations/${formationId}?ts=${Date.now()}`,
            { headers: headers(), cache: 'no-store' }
          );
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
            });
          }
        } catch {
          /* ignore meta errors */
        }

        // 2) Rapport du coach (endpoint à adapter si besoin)
        const r = await fetch(
          `${API_BASE}/reports/formations/${formationId}?role=coach&ts=${Date.now()}`,
          { headers: headers(), cache: 'no-store' }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const data = await r.json();
        setReport({
          block1: data.block1 || '',
          block2: data.block2 || '',
          block3: data.block3 || '',
          updatedAt: data.updatedAt || null,
          hasSignature: data.hasSignature,
        });
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل تقرير المرشد الفني');
      } finally {
        setLoading(false);
      }
    })();
  }, [formationId]);

  function onBack() {
    if (formationId) {
      nav(-1);
    } else {
      nav(-1);
    }
  }

  return (
    <div
      dir="rtl"
      style={{ width: '70vw', marginInline: 'auto', paddingInline: 24, marginTop: 20 }}
    >
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
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
          {header?.sessionStartDate && (
            <div style={styles.headerSub}>
              {fmtRange(header.sessionStartDate, header.sessionEndDate)}
            </div>
          )}
        </div>

        <div />
      </div>

      <div style={styles.redLine} />

      {/* Message général */}
      <div style={{ marginBottom: 12, fontSize: 14, color: '#4b5563' }}>
        هذا الفضاء مخصص لعرض تقرير <strong>المرشد الفني</strong> حول الدورة.
      </div>

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && !err && (
        <>
          {!report && (
            <div style={{ color: '#9ca3af', marginTop: 8 }}>
              لا يوجد تقرير مرشد فني متاح لهذه الدراسة.
            </div>
          )}

          {report && (
            <div style={styles.card}>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>ملاحظات حول قائد الدراسة</div>
                <div style={styles.sectionBody}>
                  {report.block1?.trim() ? report.block1 : 'لا يوجد نص.'}
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>ملاحظات حول قيادة الدراسة</div>
                <div style={styles.sectionBody}>
                  {report.block2?.trim() ? report.block2 : 'لا يوجد نص.'}
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>ملاحظات عامة</div>
                <div style={styles.sectionBody}>
                  {report.block3?.trim() ? report.block3 : 'لا يوجد نص.'}
                </div>
              </div>

              {report.updatedAt && (
                <div style={styles.footerInfo}>
                  آخر تحديث:{' '}
                  {new Date(report.updatedAt).toLocaleString('ar-TN')}
                </div>
              )}
            </div>
          )}
        </>
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

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 12,
  },
  headerInfo: { display: 'grid', gap: 4, justifyItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  headerSub: { fontSize: 13, color: '#4b5563' },

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
    opacity: 0.9,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 12,
  },

  card: {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e5e7eb',
    boxShadow: '0 10px 24px rgba(0,0,0,.03)',
    padding: 16,
    display: 'grid',
    gap: 14,
    marginTop: 8,
  },

  section: {
    display: 'grid',
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#374151',
  },
  sectionBody: {
    fontSize: 14,
    color: '#111827',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.7,
  },
  footerInfo: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'left',
  },
};
