import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type SessionRow = {
  id: string;
  title: string;
  period: string;
  visible: boolean;
  trainingLevels: string[]; // ⬅️ nouvel affichage
  branches: string[];       // ⬅️ nouvel affichage (branche = array en base)
};

// titre affiché en haut selon la route
const PAGE_TITLES: Record<string, string> = {
  '/moderator/sessionnational': 'إدارة الدورات التدريبية',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export default function NouvelleSession(): React.JSX.Element {
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

        // _id -> id, title, visible, + trainingLevels, branches
        const mapped: SessionRow[] = data.map((s) => {
          const trainingLevels =
            normArray(s.trainingLevels ?? s.trainingLevel ?? s.levels ?? s.level); // tolérance
          const branches =
            normArray(s.branche ?? s.branches ?? s.branch); // tolérance de clés
          return {
            id: String(s._id ?? s.id),
            title: String(s.title ?? '').trim(),
            period: `${fmtMonth(s.startDate)}`,
            visible: Boolean(s.isVisible ?? s.isvisible ?? false),
            trainingLevels,
            branches,
          };
        });

        const allowed = new Set(['تمهيدية', 'شارة خشبية']);
        const filtered = mapped.filter(r => r.trainingLevels.some(lvl => allowed.has(lvl)));
        setRows(filtered);
      } catch (e: any) {
        setErr(e.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function onAdd() {
    nav('/moderator/addsession');
  }
  function onEdit(id: string) {
    nav(`/moderator/session/${id}/edit`);
  }

  // --- SUPPRESSION ---
  async function onDelete(id: string) {
    if (!confirm('حذف هذه الدورة؟')) return;
    const keep = rows;
    setRows(r => r.filter(x => x.id !== id)); // optimiste
    try {
      const res = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (res.status === 404 || res.status === 204) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      alert('تعذر الحذف');
      setRows(keep); // rollback
    }
  }

  // anti double-clic basique par session id
  const togglingIds = React.useRef(new Set<string>());

  async function onToggle(id: string) {
    if (togglingIds.current.has(id)) return;
    togglingIds.current.add(id);

    const prev = rows.find(r => r.id === id)?.visible ?? false;
    const next = !prev;

    // UI optimiste
    setRows(rs => rs.map(r => (r.id === id ? { ...r, visible: next } : r)));

    try {
      const res = await fetch(`${API_BASE}/sessions/${id}/toggle-visibility`, {
        method: 'POST',
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      // rollback si erreur
      setRows(rs => rs.map(r => (r.id === id ? { ...r, visible: prev } : r)));
      setErr(e.message || 'تعذر التحديث');
    } finally {
      togglingIds.current.delete(id);
    }
  }

  const pageTitle = PAGE_TITLES[pathname] ?? '';

  // helpers d’affichage
  const renderBadges = (items: string[]) => {
    if (!items?.length) return <span style={{ opacity: 0.6 }}>—</span>;
    return (
      <div style={styles.badges} aria-label="tags">
        {items.map((txt, idx) => (
          <span key={`${txt}-${idx}`} style={styles.badge}>{txt}</span>
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
          <button onClick={() => nav('/moderator/gestionsessions')} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
        </div>
        <button onClick={onAdd} style={styles.squareRedBtn} aria-label="إضافة">
          <PlusIcon />
        </button>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map(row => (
          <div key={row.id} style={styles.item} dir="rtl">
            <div style={styles.itemRight}>
              <div style={styles.itemTitle}>{row.title} - {row.period}</div>

              {/* ⬇️ Nouveau bloc sous le titre */}
              <div style={styles.metaBlock}>
                <div style={styles.metaLine}>
                  <span style={styles.metaLabel}>المستوى التدريبي:</span>
                  {renderBadges(row.trainingLevels)}
                </div>
                <div style={styles.metaLine}>
                  <span style={styles.metaLabel}>القسم الفني:</span>
                  {renderBadges(row.branches)}
                </div>
              </div>
            </div>

            <div style={styles.actions}>
              <IconBtn onClick={() => onToggle(row.id)} title={row.visible ? 'إخفاء' : 'إظهار'}>
                {row.visible ? <EyeIcon /> : <EyeOffIcon />}
              </IconBtn>
              <IconBtn onClick={() => onEdit(row.id)} title="تعديل"><EditIcon /></IconBtn>
              <IconBtn onClick={() => onDelete(row.id)} title="حذف"><TrashIcon /></IconBtn>
            </div>
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

  // nouveau bloc meta
  metaBlock: { display: 'grid', gap: 4 },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLabel: { fontSize: 13, color: '#6b7280' },

  // badges
  badges: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    fontSize: 12,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#374151',
  },

  actions: { display: 'flex', gap: 18, color: '#0f172a', alignItems: 'center' },
};

/* ---------- petits composants ---------- */
function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} />;
}

/* ---------- icônes (SVG inline) ---------- */
function PlusIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function TrashIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 6h18M8 6v-2h8v2M6 6l1 14h10l1-14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function EditIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 15l6-6 4 4-6 6H4v-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 7l2-2 3 3-2 2z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
function EyeIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
function EyeOffIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8"/></svg>); }
