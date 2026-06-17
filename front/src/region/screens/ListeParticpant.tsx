// src/screens/ListeParticipants.tsx — FULL FILE (copy/paste)

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type CertifMini = { title?: string; code?: string; date?: string | null };

type Demande = {
  _id: string;
  applicantSnapshot: { idScout?: string; firstName?: string; lastName?: string; region?: string };
  branche: string;
  trainingLevel?: string;
  statusRegion: 'PENDING' | 'APPROVED' | 'REJECTED';
  statusNational: 'PENDING' | 'APPROVED' | 'REJECTED';
  certifsSnapshot?: CertifMini[];
  s1Hint?: { hasS1Request?: boolean; s1SessionStartDate?: string | null; s1SessionEndDate?: string | null };

  // ajouté via API (pas dans modèle)
  _ui?: {
    level?: string;
    isExcludedLevel?: boolean; // تمهيدية/شارة خشبية
    organizerRegion?: string;
    canSetRegion?: boolean;
    canSetNational?: boolean;
  };
};

type Selection = { sessionId: string; niveau: string };
type SessionMeta = { title?: string; startDate?: string; endDate?: string };

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtMonth(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';
}
function fmtDate(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('ar-TN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
}
function toTime(iso?: string | null) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}
function certDateByCode(d: Demande, code: string): string {
  const c = d.certifsSnapshot?.find(x => (x.code || '').toUpperCase() === code.toUpperCase());
  return fmtDate(c?.date || null);
}
function fmtMsgS1Request(d: Demande): string {
  const hasReq = !!d.s1Hint?.hasS1Request;
  const s1Start = d.s1Hint?.s1SessionStartDate || null;
  if (!hasReq) return '—';
  return `تم ارسال طلب المشاركة لدراسة الاختصاص بتاريخ ${fmtDate(s1Start)}`;
}
function renderS1ForPrimary(d: Demande, primaryStartIso?: string) {
  const direct = certDateByCode(d, 'S1');
  if (direct !== '—') return direct;

  const hasReq = !!d.s1Hint?.hasS1Request;
  if (!hasReq) return '—';

  const primaryStart = toTime(primaryStartIso || null);
  const s1End = toTime(d.s1Hint?.s1SessionEndDate || null);

  if (Number.isFinite(primaryStart) && Number.isFinite(s1End) && s1End > primaryStart) return '—';
  return fmtMsgS1Request(d);
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
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedBranche, setSelectedBranche] = useState('ALL');

  // ✅ décisions séparées
  const [regionDecisions, setRegionDecisions] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({});
  const [nationalDecisions, setNationalDecisions] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({});

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;
  const maxPage = Math.max(1, Math.ceil((total || 0) / pageSize));

  const [syncing, setSyncing] = useState(false);

  const showWoodPrep = selection.niveau === 'تمهيدية' || selection.niveau === 'شارة خشبية';

  useEffect(() => {
    (async () => {
      if (!selection.sessionId) return;
      try {
        const r = await fetch(`${API_BASE}/sessions/${selection.sessionId}?ts=${Date.now()}`, {
          headers: headers(),
          cache: 'no-store',
        });
        if (!r.ok) return;
        const j = await r.json();
        setSessionMeta({ title: j?.title, startDate: j?.startDate, endDate: j?.endDate });
      } catch {
        /* ignore */
      }
    })();
  }, [selection.sessionId]);

  useEffect(() => {
    (async () => {
      if (!selection.sessionId || !selection.niveau) return;
      try {
        setLoading(true);
        setErr(null);

        const params = new URLSearchParams();
        params.set('sessionId', selection.sessionId);
        params.set('trainingLevel', selection.niveau);
        params.set('skip', String(skip));
        params.set('limit', String(pageSize));

        const res = await fetch(`${API_BASE}/demandes/regional?${params.toString()}`, {
          headers: headers(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const rawList: any[] = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        const totalCount = typeof data.total === 'number' ? data.total : rawList.length;

        const list: Demande[] = rawList.map((d: any) => ({
          _id: d._id,
          applicantSnapshot: d.applicantSnapshot || {},
          branche: d.branche,
          trainingLevel: d.trainingLevel,
          statusRegion: d.statusRegion,
          statusNational: d.statusNational,
          certifsSnapshot: Array.isArray(d.certifsSnapshot) ? d.certifsSnapshot : [],
          s1Hint: d.s1Hint || undefined,
          _ui: d._ui || undefined,
        }));

        setDemandes(list);
        setTotal(totalCount);

        const newMax = Math.max(1, Math.ceil(totalCount / pageSize));
        if (page > newMax) setPage(newMax);

        setRegionDecisions({});
        setNationalDecisions({});
      } catch (e: any) {
        setErr(e.message || 'تعذّر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, [selection.sessionId, selection.niveau, skip, page, pageSize]);

  const regions = useMemo(
    () => ['ALL', ...Array.from(new Set(demandes.map(d => d.applicantSnapshot?.region || '').filter(Boolean)))],
    [demandes]
  );
  const branches = useMemo(
    () => ['ALL', ...Array.from(new Set(demandes.map(d => d.branche).filter(Boolean)))],
    [demandes]
  );
  const snapshotCols = useMemo(() => {
  const lvl = selection.niveau;

  if (lvl === 'تمهيدية') {
    return [
      { key: 'E1', label: 'الدراسة الابتدائية', render: (d: Demande) => certDateByCode(d, 'E1') },
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'S2', label: 'S2', render: (d: Demande) => certDateByCode(d, 'S2') },
      { key: 'L2', label: 'L2', render: (d: Demande) => certDateByCode(d, 'L2') },
    ];
  }

  if (lvl === 'شارة خشبية') {
    return [
      { key: 'E0', label: 'الدراسة التمهيدية', render: (d: Demande) => certDateByCode(d, 'E0') },
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'S3', label: 'S3', render: (d: Demande) => certDateByCode(d, 'S3') },
      { key: 'L3', label: 'L3', render: (d: Demande) => certDateByCode(d, 'L3') },
    ];
  }

  if (lvl === 'S1') {
    return [
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'E0', label: 'الدراسة التمهيدية', render: (d: Demande) => certDateByCode(d, 'E0') },
    ];
  }

  if (lvl === 'الدراسة الابتدائية') {
    return [
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'S1', label: 'S1', render: (d: Demande) => renderS1ForPrimary(d, sessionMeta?.startDate) },
    ];
  }

  if (lvl === 'S2') {
    return [
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'L2', label: 'L2', render: (d: Demande) => certDateByCode(d, 'L2') },
      { key: 'E1', label: 'الدراسة الابتدائية', render: (d: Demande) => certDateByCode(d, 'E1') },
      { key: 'S1', label: 'S1', render: (d: Demande) => certDateByCode(d, 'S1') },
    ];
  }

  if (lvl === 'S3') {
    return [
      { key: 'E0', label: 'الدراسة التمهيدية', render: (d: Demande) => certDateByCode(d, 'E0') },
      { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
      { key: 'L3', label: 'L3', render: (d: Demande) => certDateByCode(d, 'L3') },
      { key: 'S2', label: 'S2', render: (d: Demande) => certDateByCode(d, 'S2') },
    ];
  }

  return [
    { key: 'L1', label: 'L1', render: (d: Demande) => certDateByCode(d, 'L1') },
  ];
}, [selection.niveau, sessionMeta?.startDate]);

  const filteredSorted = useMemo(() => {
    const arr = demandes.filter(
      d =>
        d.statusRegion !== 'REJECTED' &&
        (selectedRegion === 'ALL' || d.applicantSnapshot?.region === selectedRegion) &&
        (selectedBranche === 'ALL' || d.branche === selectedBranche)
    );

    return arr.sort((a, b) => {
      const ra = (a.applicantSnapshot.region || '').localeCompare(b.applicantSnapshot.region || '', 'ar');
      if (ra !== 0) return ra;
      return (a.branche || '').localeCompare(b.branche || '', 'ar');
    });
  }, [demandes, selectedRegion, selectedBranche]);

  /* ===========================
      UI CELLS
     =========================== */

  // --- statusRegion (visa région du demandeur)
  function renderRegionDecisionCell(d: Demande) {
    const can = !!d._ui?.canSetRegion;

    // pas le droit => lecture seule
    if (!can) return <StatusBadge value={d.statusRegion} />;

    // déjà tranché => badge
    if (d.statusRegion !== 'PENDING') return <StatusBadge value={d.statusRegion} />;

    // pending + autorisé => radios
    return (
      <>
        <label>
          <input
            type="radio"
            name={`reg-${d._id}`}
            checked={regionDecisions[d._id] === 'APPROVED'}
            onChange={() => setRegionDecisions(prev => ({ ...prev, [d._id]: 'APPROVED' }))}
          />{' '}
          قبول
        </label>
        <label style={{ marginInlineStart: 12 }}>
          <input
            type="radio"
            name={`reg-${d._id}`}
            checked={regionDecisions[d._id] === 'REJECTED'}
            onChange={() => setRegionDecisions(prev => ({ ...prev, [d._id]: 'REJECTED' }))}
          />{' '}
          رفض
        </label>
      </>
    );
  }

  // --- statusNational (final: national pour تمهيدية/خشبية, sinon organisateur)
  function renderFinalDecisionCell(d: Demande) {
    const can = !!d._ui?.canSetNational;
    const excluded = !!d._ui?.isExcludedLevel;

    // lecture seule
    if (!can) return <StatusBadge value={d.statusNational} />;

    // --- cas تمهيدية/شارة خشبية: national décide, mais seulement après APPROVED région
    if (excluded) {
      if (d.statusRegion === 'PENDING') return <span style={{ color: '#6b7280' }}>في انتظار قرار الجهة</span>;
      if (d.statusRegion === 'REJECTED') return <span style={{ color: '#6b7280' }}>تمّ الرفض من الجهة</span>;

      // statusRegion APPROVED
      if (d.statusNational !== 'PENDING') return <StatusBadge value={d.statusNational} />;

      return (
        <>
          <label>
            <input
              type="radio"
              name={`nat-${d._id}`}
              checked={nationalDecisions[d._id] === 'APPROVED'}
              onChange={() => setNationalDecisions(prev => ({ ...prev, [d._id]: 'APPROVED' }))}
            />{' '}
            قبول
          </label>
          <label style={{ marginInlineStart: 12 }}>
            <input
              type="radio"
              name={`nat-${d._id}`}
              checked={nationalDecisions[d._id] === 'REJECTED'}
              onChange={() => setNationalDecisions(prev => ({ ...prev, [d._id]: 'REJECTED' }))}
            />{' '}
            رفض
          </label>
        </>
      );
    }

    // --- cas S1/S2/S3/ابتدائية: organisateur décide, mais seulement après APPROVED région demandeur
    if (d.statusRegion === 'PENDING') return <span style={{ color: '#6b7280' }}>في انتظار موافقة جهة المشارك</span>;
    if (d.statusRegion === 'REJECTED') return <span style={{ color: '#6b7280' }}>مرفوض من جهة المشارك</span>;

    if (d.statusNational !== 'PENDING') return <StatusBadge value={d.statusNational} />;

    return (
      <>
        <label>
          <input
            type="radio"
            name={`org-${d._id}`}
            checked={nationalDecisions[d._id] === 'APPROVED'}
            onChange={() => setNationalDecisions(prev => ({ ...prev, [d._id]: 'APPROVED' }))}
          />{' '}
          قبول
        </label>
        <label style={{ marginInlineStart: 12 }}>
          <input
            type="radio"
            name={`org-${d._id}`}
            checked={nationalDecisions[d._id] === 'REJECTED'}
            onChange={() => setNationalDecisions(prev => ({ ...prev, [d._id]: 'REJECTED' }))}
          />{' '}
          رفض
        </label>
      </>
    );
  }

  async function submitApplicantRegionDecisions() {
    const updates = Object.entries(regionDecisions);
    if (!updates.length) return alert('لم يتم اختيار أي قرار.');

    try {
      await Promise.all(
        updates.map(async ([id, value]) => {
          const r = await fetch(`${API_BASE}/demandes/${id}/region`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ statusRegion: value }),
          });
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            throw new Error(txt || `HTTP ${r.status}`);
          }
        })
      );

      alert('تمّ حفظ قرار جهة المشارك ✅');
      setDemandes(prev =>
        prev.map(d => (regionDecisions[d._id] ? { ...d, statusRegion: regionDecisions[d._id] } : d))
      );
      setRegionDecisions({});
    } catch (e: any) {
      alert(e.message || 'تعذّر الحفظ');
    }
  }

  async function submitFinalDecisions() {
    const updates = Object.entries(nationalDecisions);
    if (!updates.length) return alert('لم يتم اختيار أي قرار.');

    // 🔒 sécurité front: n’envoie que si statusRegion APPROVED
    const safeUpdates = updates.filter(([id]) => {
      const d = demandes.find(x => x._id === id);
      return d && d.statusRegion === 'APPROVED';
    });

    if (!safeUpdates.length) return alert('لا يمكن إرسال قرار قبل الموافقة الجهوية.');

    try {
      await Promise.all(
        safeUpdates.map(async ([id, value]) => {
          const r = await fetch(`${API_BASE}/demandes/${id}/national`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ statusNational: value }),
          });
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            throw new Error(txt || `HTTP ${r.status}`);
          }
        })
      );

      alert('تمّ حفظ القرار النهائي ✅');
      setDemandes(prev =>
        prev.map(d => (nationalDecisions[d._id] ? { ...d, statusNational: nationalDecisions[d._id] } : d))
      );
      setNationalDecisions({});
    } catch (e: any) {
      alert(e.message || 'تعذّر الحفظ');
    }
  }

  async function onResyncCertifs() {
    if (!selection.sessionId) return;
    try {
      setSyncing(true);
      setErr(null);

      const payload = { sessionId: selection.sessionId, trainingLevel: selection.niveau, skip, limit: pageSize };

      const r = await fetch(`${API_BASE}/demandes/regional/resync-page`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error((await r.text().catch(() => '')) || `HTTP ${r.status}`);

      const j = await r.json();
      alert(
        j.rateLimited
          ? `تمّ تحديث شهادات ${j.processed || 0} ثم توقف بسبب حدود e-training.`
          : `تمّ تحديث شهادات ${j.processed || 0}.`
      );
    } catch (e: any) {
      alert(e.message || 'تعذّر تحديث معطيات التدريب عن بعد لهذه الصفحة');
    } finally {
      setSyncing(false);
    }
  }

  const onBack = () => nav('/region/gestionparticipants');
  const headerTitle = `${sessionMeta?.title ?? ''} — ${fmtMonth(sessionMeta?.startDate)} — ${selection.niveau}`;

  const hasAnyRegionDecision = Object.keys(regionDecisions).length > 0;
  const hasAnyFinalDecision = Object.keys(nationalDecisions).length > 0;

  // afficher les boutons seulement si au moins une ligne est actionnable sur la page
  const hasAnyCanSetRegion = demandes.some(d => !!d._ui?.canSetRegion && d.statusRegion === 'PENDING');
  const hasAnyCanSetNational = demandes.some(d => {
    const can = !!d._ui?.canSetNational;
    if (!can) return false;
    if (d.statusRegion !== 'APPROVED') return false;
    return d.statusNational === 'PENDING';
  });

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={onBack} style={styles.circleRedBtn}>
            <ArrowRightIcon />
          </button>
          <span>{headerTitle}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>
            الصفحة {page} / {maxPage} — المجموع: {total}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={styles.pillSecondary}
          >
            الصفحة السابقة
          </button>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(maxPage, p + 1))}
            disabled={page >= maxPage || loading}
            style={styles.pillSecondary}
          >
            الصفحة التالية
          </button>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div>... جاري التحميل</div>}
      {err && <div style={{ color: RED }}>❌ {err}</div>}

      {!loading && (
        <>
          <div style={styles.metaLine}>
            <span>الجهة:</span>
            <div style={styles.badges}>
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegion(r)}
                  style={{ ...styles.badgeButton, ...(r === selectedRegion ? styles.badgeActive : {}) }}
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
                  style={{ ...styles.badgeButton, ...(b === selectedBranche ? styles.badgeActive : {}) }}
                >
                  {b === 'ALL' ? 'الكل' : b}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={styles.table} dir="rtl">
          <thead>
            <tr>
              <th style={styles.thRight}>#</th>
              <th style={styles.thRight}>المعرف الكشفي</th>
              <th style={styles.thRight}>الإسم</th>
              <th style={styles.thRight}>اللقب</th>
              <th style={styles.thRight}>الجهة</th>
              <th style={styles.thRight}>القسم</th>

              {snapshotCols.map(col => (
                <th key={col.key} style={styles.thRight}>
                  {col.label}
                </th>
              ))}

              {/* ✅ Toujours 2 colonnes workflow (sans changer modèle) */}
              <th style={styles.thRight}>{showWoodPrep ? 'قرار الجهة' : 'قرار جهة المشارك'}</th>
              <th style={styles.thRight}>{showWoodPrep ? 'القرار النهائي (وطني)' : 'قرار الجهة المنظمة'}</th>
            </tr>
          </thead>

          <tbody>
            {filteredSorted.map((d, idx) => (
              <tr key={d._id}>
                <td style={styles.tdRight}>{skip + idx + 1}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.idScout || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.firstName || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.lastName || '—'}</td>
                <td style={styles.tdRight}>{d.applicantSnapshot.region || '—'}</td>
                <td style={styles.tdRight}>{d.branche || '—'}</td>

                {snapshotCols.map(col => (
                  <td key={col.key} style={styles.tdRight}>
                    {col.render(d)}
                  </td>
                ))}

                <td style={styles.tdRight}>{renderRegionDecisionCell(d)}</td>
                <td style={styles.tdRight}>{renderFinalDecisionCell(d)}</td>
              </tr>
            ))}

            {!filteredSorted.length && !loading && (
              <tr>
                <td colSpan={8 + snapshotCols.length} style={{ textAlign: 'center', color: '#777' }}>
                  لا توجد مطالب مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'end', marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {hasAnyCanSetRegion && (
          <button onClick={submitApplicantRegionDecisions} style={styles.pillPrimary} disabled={!hasAnyRegionDecision}>
            حفظ قرار جهة المشارك
          </button>
        )}

        {hasAnyCanSetNational && (
          <button onClick={submitFinalDecisions} style={styles.pillPrimary} disabled={!hasAnyFinalDecision}>
            حفظ القرار النهائي
          </button>
        )}

        <button onClick={onResyncCertifs} style={styles.pillPrimary} disabled={syncing || loading || !demandes.length}>
          {syncing ? '... جارٍ التحديث لهذه الصفحة' : 'تحديث معطيات التدريب عن بعد لهذه الصفحة'}
        </button>
      </div>
    </div>
  );
}

/* ---------- Status badge ---------- */
function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, string> = { APPROVED: '#059669', REJECTED: '#b91c1c', PENDING: '#6b7280' };
  const labels: Record<string, string> = { APPROVED: 'مقبول', REJECTED: 'مرفوض', PENDING: 'قيد الدراسة' };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        background: 'rgba(0,0,0,0.05)',
        color: colors[value] || '#000',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {labels[value] || value}
    </span>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 } as any,
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
  redLine: { height: 3, background: RED, borderRadius: 2, margin: '8px 0' },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  badges: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  badgeButton: {
    border: `1px solid ${RED}`,
    color: RED,
    background: 'transparent',
    padding: '4px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
  },
  badgeActive: { background: RED, color: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff' },
  thRight: { textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #eef2f7' },
  tdRight: { textAlign: 'right', padding: '10px 12px', borderTop: '1px solid #f3f4f6' },
  pillPrimary: {
    padding: '10px 16px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: RED,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  pillSecondary: {
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: '#fff',
    color: RED,
    cursor: 'pointer',
    fontSize: 13,
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
