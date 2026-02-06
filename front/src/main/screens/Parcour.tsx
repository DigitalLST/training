// src/screens/MonParcours.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type DirectorInfo = {
  id: string;
  prenom: string;
  nom: string;
};

type ParcoursRow = {
  sessionId: string;
  sessionTitle: string;
  sessionVisible: boolean;

  formationId: string;
  formationNom: string;
  formationNiveau: string;
  centreTitleSnapshot?: string;
  centreRegionSnapshot?: string;
  
  isPresent?: boolean;

  // ✅ nouveau
  director?: DirectorInfo | null;

  decision: 'success' | 'retake' | 'incompatible' | null;
  status: 'draft' | 'pending_team' | 'validated' | null;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function decisionText(d?: string | null) {
  const x = String(d ?? '').toLowerCase();
  if (x === 'success') return 'يؤهل/تؤهل';
  if (x === 'retake') return 'يعيد/تعيد الدورة';
  if (x === 'incompatible') return 'لا يناسب/لا تناسب الدور';
  return '—';
}


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

export default function MonParcours(): React.JSX.Element {
  const nav = useNavigate();

  const [rows, setRows] = React.useState<ParcoursRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // ouverture par formation (un œil par ligne)
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch(`${API_BASE}/me/parcours?ts=${Date.now()}`, {
          headers: authHeaders(),
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();

        const list = Array.isArray(j?.formations) ? (j.formations as ParcoursRow[]) : [];
        setRows(list);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر الجلب');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(formationId: string) {
    setOpen(prev => ({ ...prev, [formationId]: !prev[formationId] }));
  }

  return (
    <div dir="rtl" style={{ width: '70vw', paddingInline: 24, marginLeft: 20, marginRight: 20 }}>
      <div style={styles.toolbar}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937' }}>مساري  التدريبي</div>

        <button onClick={() => nav('/acceuil')} style={styles.circleRedBtn} aria-label="رجوع">
          <ArrowRightIcon />
        </button>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && !rows.length && <div style={{ color: '#9ca3af' }}>لا توجد نتائج متاحة بعد.</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map(row => {
          const isOpen = !!open[row.formationId];

          return (
            <div key={`${row.sessionId}-${row.formationId}`} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={styles.cardTitle}>{row.formationNom}</div>

                  <div style={styles.metaLine}>
                    <span>{row.sessionTitle}</span>
                    {(row.centreTitleSnapshot) && (
                      <>
                        <span style={{ opacity: 0.5, paddingInline: 6 }}>-</span>
                        <span>
                          {row.centreTitleSnapshot || '—'}
                        </span>
                      </>
                    )}
                  </div>
                                    {/* ✅ director */}
                  <div>
                    <span style={styles.infoValue}>قائد(ة) الدراسة : {row.director ? `${row.director.prenom} ${row.director.nom}`.trim() : '—'}</span>
                  </div>
                </div>

                <button
                  onClick={() => toggle(row.formationId)}
                  style={styles.eyeBtn}
                  title={isOpen ? 'إخفاء' : 'عرض'}
                >
                  {isOpen ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {isOpen && (
                <div style={styles.detailWrap}>
                  {/* Si session pas publiée */}
                  {!row.sessionVisible && (
                    <div style={{ color: '#9ca3af', fontSize: 14 }}>النتائج غير منشورة بعد</div>
                  )}

                  {/* Si publiée => afficher décision */}
                  {row.sessionVisible && (
                    <div style={styles.resultBox}>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>القرار</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
                        {decisionText(row.decision)}
                      </div>
                    </div>
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

const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20 },
  redLine: { height: 3, background: RED, opacity: 0.9, borderRadius: 2, marginTop: 8, marginBottom: 8 },

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
  cardTitle: { fontSize: 18, fontWeight: 700, color: '#374151' },
  metaLine: { color: '#6b7280', fontSize: 13, overflowWrap: 'anywhere' },

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

  detailWrap: { borderTop: '1px dashed #e5e7eb', paddingTop: 10, display: 'grid', gap: 10 },

  infoLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid #eef2f7',
    borderRadius: 14,
    background: '#fff',
  },
  infoLabel: { fontSize: 13, color: '#6b7280' },
  infoValue: { fontSize: 14, fontWeight: 800, color: '#111827' },

  resultBox: {
    border: '1px solid #eef2f7',
    borderRadius: 14,
    padding: 12,
    background: '#fff',
    display: 'grid',
    gap: 4,
  },
};
