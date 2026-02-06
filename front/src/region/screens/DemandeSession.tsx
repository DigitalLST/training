import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type RegionRequestRow = {
  id: string;
  name: string;
  region: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | string;
  period: string;

  trainingLevels: string[];
  branche: string[];
  directorName?: string | null;
  participantsCount?: number | null;

  generatedSessionId?: string | null;

  // dates viennent du modèle Session (via generatedSessionId)
  inscriptionStartDate?: string | null;
  inscriptionEndDate?: string | null;

  // pour éviter le "flash" (on n'affiche pas le bloc tant que pas chargé)
  datesLoaded?: boolean;
};

const PAGE_TITLES: Record<string, string> = {
  '/region/demandes': 'قائمة مطالب الدورات',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

const LEVEL_LABEL: Record<string, string> = {
  S1: 'دراسة الاختصاص في التنشيط S1',
  S2: 'دراسة الاختصاص في الاسعافات الاولية S2',
  S3: 'دراسة الاختصاص في امن و سلامة المخيمات S3',
};

const hasNationalLevel = (levels: string[]) =>
  levels.some((l) => l === 'تمهيدية' || l === 'شارة خشبية');

const isRegionalTrack = (levels: string[]) => {
  const lvl = (levels?.[0] || '').trim();
  return lvl === 'S1' || lvl === 'S2' || lvl === 'S3' || lvl === 'الدراسة الابتدائية';
};

const toDateInput = (v: any): string | null => {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

export default function RegionRequests(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<RegionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  const fmtMonth = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';

  const normArray = (v: any): string[] =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];

  const labelStatus = (s: string) => {
    switch (s) {
      case 'SUBMITTED':
        return 'في الانتظار';
      case 'APPROVED':
        return 'تمت الموافقة';
      case 'REJECTED':
        return 'مرفوضة';
      default:
        return s;
    }
  };

  const badgeStyle = (s: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: 12,
      padding: '4px 10px',
      borderRadius: 999,
      border: '1px solid #e5e7eb',
      background: '#f9fafb',
      color: '#374151',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    };
    if (s === 'APPROVED') return { ...base, borderColor: '#16a34a33', background: '#16a34a14', color: '#166534' };
    if (s === 'REJECTED') return { ...base, borderColor: '#dc262633', background: '#dc262614', color: '#7f1d1d' };
    return { ...base, borderColor: '#f59e0b33', background: '#f59e0b14', color: '#92400e' };
  };

  const displayTitle = (r: RegionRequestRow) => {
    if (hasNationalLevel(r.trainingLevels)) return r.name;
    const lvl = r.trainingLevels?.[0] || '';
    if (LEVEL_LABEL[lvl]) return LEVEL_LABEL[lvl];
    return lvl || r.name;
  };

  const renderBadges = (items: string[]) => {
    if (!items?.length) return <span style={{ opacity: 0.6 }}>—</span>;
    return (
      <div style={styles.badges} aria-label="tags">
        {items.map((txt, idx) => (
          <span key={`${txt}-${idx}`} style={styles.badge}>
            {txt}
          </span>
        ))}
      </div>
    );
  };

  const renderTrainingLevelsBadges = (levels: string[]) => {
    const mapped = levels.map((l) => LEVEL_LABEL[l] ?? l);
    return renderBadges(mapped);
  };

  // ---- GET dates depuis le modèle Session ----
  async function fetchSessionDates(sessionId: string): Promise<{ start: string | null; end: string | null }> {
    // ✅ adapte l'URL si ton endpoint diffère
    const res = await fetch(`${API_BASE}/sessions/${sessionId}?ts=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();

    return {
      start: toDateInput(s.inscriptionStartDate ?? s.inscription_start_date ?? s.inscriptionStart ?? s.inscription_start),
      end: toDateInput(s.inscriptionEndDate ?? s.inscription_end_date ?? s.inscriptionEnd ?? s.inscription_end),
    };
  }

  // ---- Save inscription dates (écrit dans Session via endpoint request) ----
  async function saveInscriptionDates(requestId: string, s: string, e: string) {
    const res = await fetch(`${API_BASE}/region-session-requests/${requestId}/inscription-dates`, {
      method: 'PATCH',
      headers: authHeaders(),
      cache: 'no-store',
      body: JSON.stringify({
        inscriptionStartDate: s,
        inscriptionEndDate: e,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // --- LISTE REQUESTS + enrichissement dates depuis Session ---
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`${API_BASE}/region-session-requests?ts=${Date.now()}`, {
          headers: authHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const raw = Array.isArray(data) ? data : Array.isArray(data?.requests) ? data.requests : [];

        const mapped: RegionRequestRow[] = raw.map((d: any) => {
          const trainingLevels =
            normArray(d.training_levels ?? d.trainingLevels ?? (d.training_level ? [d.training_level] : []));

          const branche = normArray(d.branche ?? d.branches ?? d.branch);

          const generatedSessionId = d.generated_session_id
            ? String(d.generated_session_id)
            : d.generatedSessionId
              ? String(d.generatedSessionId)
              : null;

          return {
            id: String(d._id ?? d.id),
            name: String(d.name ?? d.title ?? '').trim(),
            region: String(d.region ?? '').trim(),
            status: String(d.status ?? 'SUBMITTED'),
            period: `${fmtMonth(d.startDate)}`,

            trainingLevels,
            branche,
            directorName: d.director_name ?? d.directorName ?? null,
            participantsCount:
              typeof d.participants_count === 'number'
                ? d.participants_count
                : typeof d.participantsCount === 'number'
                  ? d.participantsCount
                  : null,

            generatedSessionId,

            // par défaut: non chargé
            inscriptionStartDate: null,
            inscriptionEndDate: null,
            datesLoaded: false,
          };
        });

        // tri newest first (best effort)
        mapped.sort((a, b) => (a.id < b.id ? 1 : -1));

        setRows(mapped);

        // ✅ enrichissement: fetch dates pour demandes approuvées + track régional + session générée
        const targets = mapped.filter(
          (r) => r.status === 'APPROVED' && !!r.generatedSessionId && isRegionalTrack(r.trainingLevels)
        );

        if (!targets.length) return;

        const results = await Promise.allSettled(
          targets.map(async (r) => {
            const dts = await fetchSessionDates(r.generatedSessionId!);
            return { requestId: r.id, ...dts };
          })
        );

        const fulfilled = results
          .filter((x): x is PromiseFulfilledResult<{ requestId: string; start: string | null; end: string | null }> => x.status === 'fulfilled')
          .map((x) => x.value);

        setRows((prev) =>
          prev.map((r) => {
            const hit = fulfilled.find((x) => x.requestId === r.id);
            if (!hit) return r;

            return {
              ...r,
              inscriptionStartDate: hit.start,
              inscriptionEndDate: hit.end,
              datesLoaded: true,
            };
          })
        );

        // si certains fetch échouent, on marque quand même datesLoaded=true pour éviter bloc bloqué
        const failedIds = results
          .filter((x) => x.status === 'rejected')
          .map((_, idx) => targets[idx]?.id)
          .filter(Boolean) as string[];

        if (failedIds.length) {
          setRows((prev) =>
            prev.map((r) => (failedIds.includes(r.id) ? { ...r, datesLoaded: true } : r))
          );
        }
      } catch (e: any) {
        setErr(e.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function onAdd() {
    nav('/region/demandes/new');
  }

  const pageTitle = PAGE_TITLES[pathname] ?? 'قائمة مطالب الدورات';

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
          <button onClick={() => nav(-1)} style={styles.circleRedBtn} aria-label="رجوع">
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
        {rows.map((row) => {
          const isNational = hasNationalLevel(row.trainingLevels);

          const hasDates = !!row.inscriptionStartDate && !!row.inscriptionEndDate;

          // ✅ afficher le bloc uniquement si:
          // - track régional
          // - approuvé
          // - session générée
          // - dates chargées
          // - dates pas encore définies
          const canSetInscription =
            !isNational &&
            isRegionalTrack(row.trainingLevels) &&
            row.status === 'APPROVED' &&
            !!row.generatedSessionId &&
            row.datesLoaded === true &&
            !hasDates;

          return (
            <div key={row.id} style={styles.item} dir="rtl">
              <div style={styles.itemRight}>
                <div style={styles.itemTitle}>
                  {displayTitle(row)} - {row.period}
                </div>

                {/* ✅ bloc saisie (une seule fois) */}
                {canSetInscription && (
                  <InscriptionDatesInline
                    requestId={row.id}
                    defaultStart={row.inscriptionStartDate || ''}
                    defaultEnd={row.inscriptionEndDate || ''}
                    onSaved={(s, e) => {
                      setRows((prev) =>
                        prev.map((x) =>
                          x.id === row.id
                            ? { ...x, inscriptionStartDate: s, inscriptionEndDate: e, datesLoaded: true }
                            : x
                        )
                      );
                    }}
                    saveFn={saveInscriptionDates}
                  />
                )}

                {/* ✅ si dates déjà définies -> affichage read-only */}
                {!isNational && hasDates && (
                  <div style={styles.metaLine}>
                    <span style={styles.metaLabel}>فترة التسجيل:</span>
                    <span style={{ fontSize: 13, color: '#374151' }}>
                     من {row.inscriptionStartDate}  الى {row.inscriptionEndDate}
                    </span>
                  </div>
                )}

                {/* ✅ details */}
                {isNational ? (
                  <div style={styles.metaBlock}>
                    <div style={styles.metaLine}>
                      <span style={styles.metaLabel}>المستوى التدريبي:</span>
                      {renderTrainingLevelsBadges(row.trainingLevels)}
                    </div>
                    <div style={styles.metaLine}>
                      <span style={styles.metaLabel}>القسم الفني:</span>
                      {renderBadges(row.branche)}
                    </div>
                  </div>
                ) : (
                  <div style={styles.metaBlock}>
                    <div style={styles.metaLine}>
                      <span style={styles.metaLabel}>القائد:</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{row.directorName || '—'}</span>
                    </div>
                    <div style={styles.metaLine}>
                      <span style={styles.metaLabel}>عدد المشاركين:</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{row.participantsCount ?? '—'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.actions}>
                <span style={badgeStyle(row.status)}>{labelStatus(row.status)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Inline component: set inscription dates ---------- */
function InscriptionDatesInline(props: {
  requestId: string;
  defaultStart: string;
  defaultEnd: string;
  onSaved: (s: string, e: string) => void;
  saveFn: (requestId: string, s: string, e: string) => Promise<any>;
}) {
  const [s, setS] = useState(props.defaultStart);
  const [e, setE] = useState(props.defaultEnd);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);

    if (!s || !e) return setErr('تواريخ التسجيل إجبارية');
    if (new Date(e) < new Date(s)) return setErr('تاريخ نهاية التسجيل يجب أن يكون بعد تاريخ بدايته');

    try {
      setSaving(true);
      await props.saveFn(props.requestId, s, e);
      props.onSaved(s, e);
    } catch (e: any) {
      setErr(e.message || 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={inlineStyles.wrap}>
      <div style={inlineStyles.inputs}>
        <div style={inlineStyles.field}>
          <span style={inlineStyles.label}>بداية التسجيل</span>
          <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} style={inlineStyles.input} />
        </div>
        <div style={inlineStyles.field}>
          <span style={inlineStyles.label}>نهاية التسجيل</span>
          <input type="date" value={e} onChange={(ev) => setE(ev.target.value)} style={inlineStyles.input} />
        </div>
      </div>

      <div style={inlineStyles.actions}>
        <button type="button" onClick={save} disabled={saving} style={inlineStyles.btn}>
          {saving ? '... حفظ' : 'حفظ'}
        </button>
        {err && <div style={inlineStyles.err}>❌ {err}</div>}
      </div>
    </div>
  );
}

const inlineStyles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 8, marginTop: 6 },
  inputs: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  field: { display: 'grid', gap: 4 },
  label: { fontSize: 12, color: '#6b7280' },
  input: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    minWidth: 160,
  },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
  btn: {
    padding: '8px 14px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
  },
  err: { color: '#b91c1c', fontSize: 12 },
};

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
  item: {
    width: '97%',
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
  itemRight: { display: 'grid', justifyItems: 'start', gap: 6 },
  itemTitle: { fontSize: 18, fontWeight: 200, color: '#374151' },

  metaBlock: { display: 'grid', gap: 4 },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLabel: { fontSize: 13, color: '#6b7280' },

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

/* ---------- icônes (SVG inline) ---------- */
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
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
