// src/screens/ListeParticipants.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type Demande = {
  _id: string;
  applicantSnapshot: {
    idScout?: string;
    firstName?: string;
    lastName?: string;
    region?: string;
  };
  branche: string;
  statusRegion: 'PENDING' | 'APPROVED' | 'REJECTED';
  statusNational: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type Selection = { sessionId: string; niveau: string };
type SessionMeta = { title?: string; startDate?: string };

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtMonth(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';
}

export default function ListeParticipants(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation();

  const selection: Selection = useMemo(() => {
    const fromState = (state || {}) as Selection;
    if (fromState.sessionId && fromState.niveau) return fromState;
    try {
      const raw = sessionStorage.getItem('criteres:selection');
      return raw ? JSON.parse(raw) : { sessionId: '', niveau: '' };
    } catch {
      return { sessionId: '', niveau: '' };
    }
  }, [state]);

  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedBranche, setSelectedBranche] = useState('ALL');
  const [decisions, setDecisions] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({});

  // ---- Fetch session meta ----
  useEffect(() => {
    (async () => {
      if (!selection.sessionId) return;
      try {
        const r = await fetch(`${API_BASE}/sessions/${selection.sessionId}?ts=${Date.now()}`, {
          headers: headers(), cache: 'no-store',
        });
        if (!r.ok) return;
        const j = await r.json();
        setSessionMeta({ title: j?.title, startDate: j?.startDate });
      } catch { /* ignore */ }
    })();
  }, [selection.sessionId]);

  // ---- Fetch demandes ----
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        const url = `${API_BASE}/demandes?sessionId=${selection.sessionId}&trainingLevel=${selection.niveau}`;
        const res = await fetch(url, { headers: headers(), cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: Demande[] = (Array.isArray(data) ? data : data.demandes || [])
          .map((d: any) => ({
            _id: d._id,
            applicantSnapshot: d.applicantSnapshot || {},
            branche: d.branche,
            statusRegion: d.statusRegion,
            statusNational: d.statusNational,
          }));
        setDemandes(list);
      } catch (e: any) {
        setErr(e.message || 'تعذّر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [selection.sessionId, selection.niveau]);

  // ---- Filtres ----
  const regions = useMemo(
    () => ['ALL', ...Array.from(new Set(demandes.map(d => d.applicantSnapshot?.region || '').filter(Boolean)))],
    [demandes]
  );
  const branches = useMemo(
    () => ['ALL', ...Array.from(new Set(demandes.map(d => d.branche).filter(Boolean)))],
    [demandes]
  );

  // ---- Filtrage + tri ----
  const filteredSorted = useMemo(() => {
    const arr = demandes.filter(
      d =>
        d.statusRegion !== 'REJECTED' &&
        (selectedRegion === 'ALL' || d.applicantSnapshot?.region === selectedRegion) &&
        (selectedBranche === 'ALL' || d.branche === selectedBranche)
    );
    return arr.sort((a, b) => {
      const ra = (a.applicantSnapshot.region || '').localeCompare(b.applicantSnapshot.region || 'ar');
      if (ra !== 0) return ra;
      return (a.branche || '').localeCompare(b.branche || 'ar');
    });
  }, [demandes, selectedRegion, selectedBranche]);

  function setDecision(id: string, value: 'APPROVED' | 'REJECTED') {
    setDecisions(prev => ({ ...prev, [id]: value }));
  }

  // ---- Affichage décision nationale ----
  function renderNationalCell(d: Demande) {
    const regionName = d.applicantSnapshot.region || '';
    const isNational = regionName === 'قائد وطني';

    // ✅ Cas 1 : si "قائد وطني" → afficher radios directement
    if (isNational) {
      if (d.statusNational === 'PENDING') {
        return (
          <>
            <label>
              <input
                type="radio"
                name={`nat-${d._id}`}
                checked={decisions[d._id] === 'APPROVED'}
                onChange={() => setDecision(d._id, 'APPROVED')}
              />{' '}قبول
            </label>
            <label style={{ marginInlineStart: 12 }}>
              <input
                type="radio"
                name={`nat-${d._id}`}
                checked={decisions[d._id] === 'REJECTED'}
                onChange={() => setDecision(d._id, 'REJECTED')}
              />{' '}رفض
            </label>
          </>
        );
      }
      return <StatusBadge value={d.statusNational} />;
    }

    // ✅ Cas 2 : si région "PENDING"
    if (d.statusRegion === 'PENDING') {
      return <span style={{ color: '#6b7280' }}>في انتظار قرار اللجنة الجهوية</span>;
    }

    // ✅ Cas 3 : décision nationale normale
    if (d.statusNational === 'PENDING') {
      return (
        <>
          <label>
            <input
              type="radio"
              name={`nat-${d._id}`}
              checked={decisions[d._id] === 'APPROVED'}
              onChange={() => setDecision(d._id, 'APPROVED')}
            />{' '}قبول
          </label>
          <label style={{ marginInlineStart: 12 }}>
            <input
              type="radio"
              name={`nat-${d._id}`}
              checked={decisions[d._id] === 'REJECTED'}
              onChange={() => setDecision(d._id, 'REJECTED')}
            />{' '}رفض
          </label>
        </>
      );
    }

    return <StatusBadge value={d.statusNational} />;
  }

  async function submitNationalDecisions() {
    const updates = Object.entries(decisions);
    if (!updates.length) return alert('لم يتم اختيار أي قرار.');
    try {
      await Promise.all(
        updates.map(async ([id, value]) => {
          const r = await fetch(`${API_BASE}/demandes/${id}/national`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ statusNational: value }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        })
      );
      alert('تمّ حفظ القرارات الوطنية بنجاح ✅');
      setDemandes(prev =>
        prev.map(d => (decisions[d._id] ? { ...d, statusNational: decisions[d._id] } : d))
      );
      setDecisions({});
    } catch (e: any) {
      alert(e.message || 'تعذّر الحفظ');
    }
  }

  const onBack = () => nav('/moderator/gestionparticipants');
  const headerTitle = `${sessionMeta?.title ?? ''} — ${fmtMonth(sessionMeta?.startDate)} — ${selection.niveau}`;

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn}><ArrowRightIcon /></button>
          <span>{headerTitle}</span>
        </div>
      </div>
      <div style={styles.redLine} />

      {loading && <div>... جاري التحميل</div>}
      {err && <div style={{ color: RED }}>❌ {err}</div>}

      {/* Filtres */}
      {!loading && (
        <>
          <div style={styles.metaLine}>
            <span>الجهة:</span>
            <div style={styles.badges}>
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegion(r)}
                  style={{
                    ...styles.badgeButton,
                    ...(r === selectedRegion ? styles.badgeActive : {}),
                  }}
                >
                  {r === 'ALL' ? 'الكل' : r}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.metaLine}>
            <span>القسم الفني:</span>
            <div style={styles.badges}>
              {branches.map(b => (
                <button
                  key={b}
                  onClick={() => setSelectedBranche(b)}
                  style={{
                    ...styles.badgeButton,
                    ...(b === selectedBranche ? styles.badgeActive : {}),
                  }}
                >
                  {b === 'ALL' ? 'الكل' : b}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Tableau */}
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={styles.table} dir="rtl">
          <thead>
            <tr>
              <th style={styles.thRight}>#</th>
              <th style={styles.thRight}>رقم الكشاف</th>
              <th style={styles.thRight}>اللقب</th>
              <th style={styles.thRight}>الإسم</th>
              <th style={styles.thRight}>الجهة</th>
              <th style={styles.thRight}>القسم</th>
              <th style={styles.thRight}>قرار الجهة</th>
              <th style={styles.thRight}>القرار الوطني</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((d, idx) => (
              <tr key={d._id}>
                <td style={styles.tdRight}>{idx + 1}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.idScout || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.lastName || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.firstName || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.region || '—'}</td>
                <td style={styles.tdRight}>{d.branche || '—'}</td>
                <td style={styles.tdRight}><StatusBadge value={d.statusRegion} /></td>
                <td style={styles.tdRight}>{renderNationalCell(d)}</td>
              </tr>
            ))}
            {!filteredSorted.length && !loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#777' }}>لا توجد مطالب مطابقة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'end', marginTop: 16 }}>
        <button onClick={submitNationalDecisions} style={styles.pillPrimary}>
          حفظ القرارات الوطنية
        </button>
      </div>
    </div>
  );
}

/* ---------- badge ---------- */
function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    APPROVED: '#059669',
    REJECTED: '#b91c1c',
    PENDING: '#6b7280',
  };
  const labels: Record<string, string> = {
    APPROVED: 'مقبول',
    REJECTED: 'مرفوض',
    PENDING: 'قيد الدراسة',
  };
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.05)',
      color: colors[value] || '#000',
      fontSize: 12,
      fontWeight: 700,
    }}>
      {labels[value] || value}
    </span>
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
  redLine: { height: 3, background: RED, borderRadius: 2, margin: '8px 0' },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  badges: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  badgeButton: {
    border: `1px solid ${RED}`, color: RED, background: 'transparent',
    padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
  },
  badgeActive: { background: RED, color: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff' },
  thRight: { textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #eef2f7' },
  tdRight: { textAlign: 'right', padding: '10px 12px', borderTop: '1px solid #f3f4f6' },
  pillPrimary: {
    padding: '10px 16px', borderRadius: 999, border: `1px solid ${RED}`,
    background: RED, color: '#fff', cursor: 'pointer', fontWeight: 700,
  },
};

/* ---------- icon ---------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
