import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type SessionRow = {
  id: string;
  title: string;
  period: string;
  visible: boolean;
  trainingLevels: string[];
  branches: string[];
};

// titre affiché en haut selon la route
const PAGE_TITLES: Record<string, string> = {
  '/moderator/': '',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export default function Acceuilormation(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // --- HEADERS (token facultatif) ---
  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // --- LISTE SESSIONS ---
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        const res = await fetch(`${API_BASE}/sessions?ts=${Date.now()}`, {
          headers: authHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as any[];

        const fmtMonth = (iso?: string) =>
          iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';

        const normArray = (v: any): string[] =>
          Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : [];

        const mapped: SessionRow[] = data.map((s) => {
          const trainingLevels =
            normArray(s.trainingLevels ?? s.trainingLevel ?? s.levels ?? s.level);
          const branches =
            normArray(s.branche ?? s.branches ?? s.branch);
          return {
            id: String(s._id ?? s.id),
            title: String(s.title ?? '').trim(),
            period: `${fmtMonth(s.startDate)}`,
            visible: Boolean(s.isVisible ?? s.isvisible ?? false),
            trainingLevels,
            branches,
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

  // navigation vers la page critères avec session & niveau
function goToCriteres(sessionId: string, niveau: string) {
  // Sauvegarde en fallback si l’utilisateur fait F5 sur la page cible
  sessionStorage.setItem('criteres:selection', JSON.stringify({ sessionId, niveau }));

  // Navigation sans query ni id dans l'URL
  nav('/moderator/listeformations', {
    state: { sessionId, niveau } as { sessionId: string; niveau: string },
    replace: false,
  });
}

  function onBack() {
    nav('/moderator/');
  }



  const pageTitle = PAGE_TITLES[pathname] ?? '';


  // boutons cliquables (niveaux)
  const renderLevelButtons = (sessionId: string, levels: string[]) => {
    if (!levels?.length) return <span style={{ opacity: 0.6 }}>—</span>;
    return (
      <div style={styles.badges} aria-label="levels">
        {levels.map((lvl, idx) => (
          <button
            key={`${sessionId}-${lvl}-${idx}`}
            type="button"
            title={`اختر المستوى: ${lvl}`}
            onClick={() => goToCriteres(sessionId, lvl)}
            style={styles.badgeButton}
          >
            {lvl}
          </button>
        ))}
      </div>
    );
  };

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
          <span> إدارة الدراسات التدريبية</span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map(row => (
          <div key={row.id} style={styles.item} dir="rtl">
            <div style={styles.itemRight}>
              <div style={styles.itemTitle}>{row.title} - {row.period}</div>

              {/* bloc infos */}
              <div style={styles.metaBlock}>
                <div style={styles.metaLine}>
                  <span style={styles.metaLabel}>المستوى التدريبي:</span>
                  {renderLevelButtons(row.id, row.trainingLevels)}
                </div>
              </div>
            </div>

            {/* Zone actions: on garde l'espace pour la cohérence visuelle,
                mais on ne propose ni modifier, ni supprimer ici */}
            <div style={styles.actions} />
          </div>
        ))}
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
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937', marginBottom: 100 },
  redLine: { height: 3, background: RED, opacity: 0.9, borderRadius: 2, marginTop: 8, marginBottom: 8 },
  squareRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  circleRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  item: {
    width: '97%', background: '#fff', borderRadius: 22, border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)', padding: '16px 18px',
    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 78,
  },
  itemRight: { display: 'grid', justifyItems: 'start', gap: 6 },
  itemTitle: { fontSize: 18, fontWeight: 200, color: '#374151' },

  metaBlock: { display: 'grid', gap: 4 },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLabel: { fontSize: 13, color: '#6b7280' },

  // badges non cliquables
  badges: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    fontSize: 12,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#374151',
  },

  // boutons niveaux cliquables (mêmes dimensions que badges)
  badgeButton: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    lineHeight: 1.6,
  },

  actions: { display: 'flex', gap: 18, color: '#0f172a', alignItems: 'center' },
};

/* ---------- icônes ---------- */
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
