// src/screens/ListeFormations.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type Selection = { sessionId: string; niveau: 'تمهيدية' | 'شارة خشبية' | string };

type Formation = {
  _id: string;
  nom: string;
  niveau: 'تمهيدية' | 'شارة خشبية';
  centre?: { _id: string | null; title: string; region?: string };
  sessionTitle?: string;
};
type SessionMeta = { title?: string; startDate?: string; endDate?: string };




function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export default function NouvelleFormation(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation();

  // Récup sélection (state → storage fallback)
  const selection: Selection = useMemo(() => {
    const fromState = (state || {}) as any;
    if (fromState?.sessionId && fromState?.niveau) return fromState;
    try {
      const raw = sessionStorage.getItem('criteres:selection');
      const parsed = raw ? JSON.parse(raw) : {};
      return { sessionId: parsed.sessionId || '', niveau: parsed.niveau || '' };
    } catch {
      return { sessionId: '', niveau: '' };
    }
  }, [state]);

  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  function fmtMonth(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';
}
function fmtPeriod(meta?: SessionMeta | null) {
  if (!meta) return '—';
  const a = fmtMonth(meta.startDate);
  // si endDate absent, on affiche juste le mois de début (comme tes autres écrans)
  return a && a !== '—' ? `${a}` : a;
}
useEffect(() => {
  if (!selection.sessionId) return;
  (async () => {
    try {
      const r = await fetch(`${API_BASE}/sessions/${selection.sessionId}?ts=${Date.now()}`, {
        headers: headers(), cache: 'no-store'
      });
      if (r.ok) {
        const j = await r.json();
        setSessionMeta({ title: j?.title, startDate: j?.startDate, endDate: j?.endDate });
      }
    } catch {/* ignore */}
  })();
}, [selection.sessionId]);


  // Charger formations de la session
  useEffect(() => {
    if (!selection.sessionId) return;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const r = await fetch(`${API_BASE}/formations?sessionId=${selection.sessionId}&ts=${Date.now()}`, {
          headers: headers(), cache: 'no-store'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const list: Formation[] = (Array.isArray(j) ? j : []).map((f: any) => ({
          _id: String(f._id),
          nom: String(f.nom || ''),
          niveau: f.niveau,
          centre: f.centre ? { _id: f.centre._id ? String(f.centre._id) : null, title: String(f.centre.title || ''), region: f.centre.region } : { _id: null, title: '', region: '' },
          sessionTitle: f.sessionTitle || f.sessionTitleSnapshot || '',
        }));
        // filtre niveau sélectionné
        setFormations(list.filter(x => !selection.niveau || x.niveau === selection.niveau));
      } catch (e: any) {
        setErr(e.message || 'تعذّر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [selection.sessionId, selection.niveau]);

  // Actions
  function onBack() {
    nav('/moderator/gestionformations'); // adapte si autre route d’accueil
  }

  function onAdd() {
    // On passe la sélection pour pré-remplir l’écran d’ajout
    nav('/moderator/addformation', { state: selection });
  }

  function onEdit(id: string) {
    nav('/moderator/updateformation', { state: { ...selection, id } });
  }

  async function onDelete(id: string) {
    if (!confirm('حذف هذه الدراسة')) return;
    const keep = formations;
    setFormations(fs => fs.filter(f => f._id !== id)); // UI optimiste
    try {
      const r = await fetch(`${API_BASE}/formations/${id}`, {
        method: 'DELETE',
        headers: headers(),
        cache: 'no-store',
      });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      alert('تعذّر الحذف');
      setFormations(keep);
    }
  }
  function onParticipants(id: string) {
  nav('/moderator/participantformation', { state: { formationId: id } });
}


  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={{ fontWeight: 700 }}>
             {sessionMeta?.title || '—'} — {fmtPeriod(sessionMeta)} — {selection.niveau || '—'}

          </span>
        </div>

        {/* bouton + (haut gauche visuellement selon ton layout global) */}
        <button onClick={onAdd} style={styles.squareRedBtn} aria-label="إضافة">
          <PlusIcon />
        </button>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {formations.map((f) => (
          <div key={f._id} style={styles.item}>
            <div style={styles.itemRight}>
              {/* Ligne principale */}
              <div style={styles.itemTitle}>
                {f.nom || '—'} — {f.centre?.title || '—'} — {f.centre?.region || '—'}
              </div>
            </div>

            <div style={styles.actions}>
              <button
    onClick={() => onParticipants(f._id)}
    style={styles.badgeButton}
    title="إضافة قيادة الدورة والمتدربين"
  >
    إضافة قيادة الدورة والمتدربين
  </button>
              <IconBtn onClick={() => onEdit(f._id)} title="تعديل">
                <EditIcon />
              </IconBtn>
              <IconBtn onClick={() => onDelete(f._id)} title="حذف">
                <TrashIcon />
              </IconBtn>
            </div>
          </div>
        ))}

        {!formations.length && !loading && (
          <div style={{ textAlign: 'center', color: '#777', padding: 16 }}>
            لا توجد دراسات بعد.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  circleRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  squareRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  redLine: { height: 3, background: RED, borderRadius: 2, margin: '8px 0' },

  item: {
    width: '97%', background: '#fff', borderRadius: 22, border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)', padding: '16px 18px',
    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 78,
  },
  itemRight: { display: 'grid', justifyItems: 'start', gap: 4 },
  itemTitle: { fontSize: 16, fontWeight: 600, color: '#374151' },
  itemSub: { fontSize: 12, color: '#6b7280' },

  actions: { display: 'flex', gap: 18, color: '#0f172a', alignItems: 'center' },
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
};

/* ---------- boutons/icônes ---------- */
function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} />;
}
function PlusIcon() { return (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
function ArrowRightIcon() { return (<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function TrashIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 6h18M8 6v-2h8v2M6 6l1 14h10l1-14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function EditIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 15l6-6 4 4-6 6H4v-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 7l2-2 3 3-2 2z" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
