// ModeratorRegionRequestsByRegionTable.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type RegionRequestRow = {
  id: string;
  name: string;
  region: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | string;
  period: string;

  trainingLevels: string[]; // array (training_levels) OR single wrapped
  branches: string[];
  directorName?: string | null;
  participantsCount?: number | null;

  generatedSessionId?: string | null;
};

const PAGE_TITLES: Record<string, string> = {
  '/moderator/region-requests': 'معالجة مطالب الدورات حسب الجهة',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

const LEVEL_LABEL: Record<string, string> = {
  S1: 'دراسة الاختصاص في التنشيط S1',
  S2: 'دراسة الاختصاص في الاسعافات الاولية S2',
  S3: 'دراسة الاختصاص في امن و سلامة المخيمات S3',
  'الدراسة الابتدائية': 'الدراسة الابتدائية',
  'تمهيدية': 'تمهيدية',
  'شارة خشبية': 'شارة خشبية',
};

const hasNationalLevel = (levels: string[]) =>
  (levels || []).some((l) => l === 'تمهيدية' || l === 'شارة خشبية');

function levelDisplayTitle(r: RegionRequestRow) {
  if (hasNationalLevel(r.trainingLevels)) return r.name;
  const lvl = (r.trainingLevels?.[0] || '').trim();
  return LEVEL_LABEL[lvl] ?? lvl ?? r.name;
}

export default function ModeratorRegionRequestsByRegionTable(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<RegionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI toggles
  const [pendingOnlyByRegion, setPendingOnlyByRegion] = useState<Record<string, boolean>>({});
  const [collapsedByRegion, setCollapsedByRegion] = useState<Record<string, boolean>>({}); // 👁 hide/show

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
      case 'SUBMITTED': return 'في الانتظار';
      case 'APPROVED': return 'تمت الموافقة';
      case 'REJECTED': return 'مرفوضة';
      default: return s;
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

  // fetch all requests (all regions)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`${API_BASE}/region-session-requests/moderator?ts=${Date.now()}`, {
          headers: authHeaders(),
          cache: 'no-store',
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const raw = Array.isArray(data) ? data : Array.isArray(data?.requests) ? data.requests : [];

        const mapped: RegionRequestRow[] = raw.map((d: any) => {
          const trainingLevels =
            normArray(d.training_levels ?? d.trainingLevels ?? (d.training_level ? [d.training_level] : []));
          const branches = normArray(d.branches ?? d.branche ?? d.branch ?? d.branche);

          return {
            id: String(d._id ?? d.id),
            name: String(d.name ?? d.title ?? '').trim(),
            region: String(d.region ?? '').trim(),
            status: String(d.status ?? 'SUBMITTED'),
            period: `${fmtMonth(d.startDate)}`,

            trainingLevels,
            branches,
            directorName: d.director_name ?? null,
            participantsCount: typeof d.participants_count === 'number' ? d.participants_count : null,
            generatedSessionId: d.generated_session_id ? String(d.generated_session_id) : null,
          };
        });

        mapped.sort((a, b) => (a.id < b.id ? 1 : -1));
        setRows(mapped);

        // init toggles per region
        const regions = Array.from(new Set(mapped.map(r => r.region).filter(Boolean)));

        setPendingOnlyByRegion(prev => {
          const next = { ...prev };
          regions.forEach(reg => { if (next[reg] === undefined) next[reg] = false; });
          return next;
        });

        setCollapsedByRegion(prev => {
          const next = { ...prev };
          regions.forEach(reg => { if (next[reg] === undefined) next[reg] = false; }); // default expanded
          return next;
        });

      } catch (e: any) {
        setErr(e.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // group by region
  const grouped = useMemo(() => {
    const m = new Map<string, RegionRequestRow[]>();
    for (const r of rows) {
      const key = r.region || '—';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [rows]);

  async function decideRequest(opts: {
    requestId: string;
    decision: 'APPROVED' | 'REJECTED';
    inscriptionStartDate?: string;
    inscriptionEndDate?: string;
  }) {
    const res = await fetch(`${API_BASE}/region-session-requests/${opts.requestId}/decision`, {
      method: 'PATCH',
      headers: authHeaders(),
      cache: 'no-store',
      body: JSON.stringify({
        decision: opts.decision,
        inscriptionStartDate: opts.inscriptionStartDate,
        inscriptionEndDate: opts.inscriptionEndDate,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error ? String(payload.error) : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return payload;
  }

  const pageTitle = PAGE_TITLES[pathname] ?? ' مطالب تنظيم الدورات  التدريبية';

  return (
    <div style={{ width: '90vw', alignItems: 'center', marginLeft: 20, marginRight: 20, paddingInline: 24 }}>
      {pageTitle && <span style={styles.pageTitle}>{pageTitle}</span>}

      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button onClick={() => nav(-1)} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {grouped.map(([region, reqs]) => {
          const pendingOnly = !!pendingOnlyByRegion[region];
          const collapsed = !!collapsedByRegion[region];

          const shown = pendingOnly ? reqs.filter(r => r.status === 'SUBMITTED') : reqs;

          const total = reqs.length;
          const pendingCount = reqs.filter(r => r.status === 'SUBMITTED').length;

          return (
            <div key={region} style={styles.regionCard} dir="rtl">
              <div style={styles.regionHeader}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={styles.regionTitle}>
                    {region}
                    <span style={styles.counterPill}>{total}/{pendingCount}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setPendingOnlyByRegion(prev => ({ ...prev, [region]: !prev[region] }))}
                      style={styles.filterPill}
                      aria-label="فلترة"
                      title={pendingOnly ? 'إظهار الكل' : 'إظهار في الانتظار فقط'}
                    >
                      {pendingOnly ? 'عرض الكل' : 'في الانتظار فقط'}
                    </button>

                    <div style={styles.regionSub}>
                      {pendingOnly ? 'عرض المطالب في الانتظار فقط' : 'عرض كل المطالب'}
                    </div>
                  </div>
                </div>

                {/* 👁 hide/show TABLE */}
                <button
                  type="button"
                  onClick={() => setCollapsedByRegion(prev => ({ ...prev, [region]: !prev[region] }))}
                  style={styles.eyeBtn}
                  aria-label="إظهار/إخفاء"
                  title={collapsed ? 'إظهار' : 'إخفاء'}
                >
                  {collapsed ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {!collapsed && (
                <div style={{ marginTop: 10 }}>
                  {shown.length === 0 ? (
                    <div style={{ color: '#6b7280', fontSize: 13 }}>— لا يوجد مطالب في انتظار القرار</div>
                  ) : (
                    <div style={styles.tableWrap}>
                      <table style={styles.table} dir="rtl">
                        <thead>
                          <tr>
                            <th style={styles.th}>الدورة</th>
                            <th style={styles.th}>التفاصيل</th>
                            <th style={styles.th}>القرار</th>
                            <th style={styles.th}>الحالة</th>
                          </tr>
                        </thead>

                        <tbody>
                          {shown.map((row) => (
                            <ModeratorRequestTr
                              key={row.id}
                              row={row}
                              badgeStyle={badgeStyle}
                              labelStatus={labelStatus}
                              onDecide={async (decision, extra) => {
                                const resp = await decideRequest({
                                  requestId: row.id,
                                  decision,
                                  inscriptionStartDate: extra?.inscriptionStartDate,
                                  inscriptionEndDate: extra?.inscriptionEndDate,
                                });

                                setRows(prev =>
                                  prev.map(x => {
                                    if (x.id !== row.id) return x;
                                    return {
                                      ...x,
                                      status: resp?.request?.status ?? decision,
                                      generatedSessionId: resp?.request?.generated_session_id
                                        ? String(resp.request.generated_session_id)
                                        : x.generatedSessionId,
                                    };
                                  })
                                );
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
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

function ModeratorRequestTr(props: {
  row: RegionRequestRow;
  badgeStyle: (s: string) => React.CSSProperties;
  labelStatus: (s: string) => string;
  onDecide: (
    decision: 'APPROVED' | 'REJECTED',
    extra?: { inscriptionStartDate?: string; inscriptionEndDate?: string }
  ) => Promise<void>;
}) {
  const { row } = props;
  const isNational = hasNationalLevel(row.trainingLevels);
  const canDecide = row.status === 'SUBMITTED';

  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | ''>('');
  const [insStart, setInsStart] = useState('');
  const [insEnd, setInsEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitDecision() {
    setErr(null);
    if (!decision) return setErr('اختر قبول أو رفض');

    // APPROVE + NATIONAL => require dates
    if (decision === 'APPROVED' && isNational) {
      if (!insStart || !insEnd) return setErr('تواريخ بداية/نهاية التسجيل إجبارية');
      if (new Date(insEnd) < new Date(insStart)) return setErr('تاريخ نهاية التسجيل يجب أن يكون بعد تاريخ بدايته');
    }

    try {
      setSaving(true);
      await props.onDecide(
        decision,
        decision === 'APPROVED' && isNational
          ? { inscriptionStartDate: insStart, inscriptionEndDate: insEnd }
          : undefined
      );
      setDecision('');
      setInsStart('');
      setInsEnd('');
    } catch (e: any) {
      setErr(e.message || 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const title = `${levelDisplayTitle(row)} - ${row.period}`;

  const details = isNational
    ? `المستوى: ${(row.trainingLevels || []).join(' / ')} | الأقسام: ${(row.branches || []).join(' / ')}`
    : `القائد: ${row.directorName || '—'} | المشاركين: ${row.participantsCount ?? '—'}`;

  return (
    <tr style={styles.tr}>
      <td style={styles.td}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 14, color: '#374151', fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{details}</div>
        </div>
      </td>

      <td style={styles.td}>
        {isNational ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={styles.smallLine}>
              <span style={styles.smallLabel}>المستوى:</span>
              <span style={styles.smallValue}>
                {(row.trainingLevels || []).map(l => LEVEL_LABEL[l] ?? l).join(' / ') || '—'}
              </span>
            </div>
            <div style={styles.smallLine}>
              <span style={styles.smallLabel}>القسم:</span>
              <span style={styles.smallValue}>{(row.branches || []).join(' / ') || '—'}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={styles.smallLine}>
              <span style={styles.smallLabel}>القائد:</span>
              <span style={styles.smallValue}>{row.directorName || '—'}</span>
            </div>
            <div style={styles.smallLine}>
              <span style={styles.smallLabel}>المشاركين:</span>
              <span style={styles.smallValue}>{row.participantsCount ?? '—'}</span>
            </div>
          </div>
        )}
      </td>

      <td style={styles.td}>
        {!canDecide ? (
          <span style={{ fontSize: 12, color: '#6b7280' }}>—</span>
        ) : (
          <div style={decisionStyles.wrap}>
            <div style={decisionStyles.radioRow}>
              <label style={decisionStyles.radioLabel}>
                <input
                  type="radio"
                  name={`decision-${row.id}`}
                  checked={decision === 'APPROVED'}
                  onChange={() => setDecision('APPROVED')}
                />
                <span>قبول</span>
              </label>
              <label style={decisionStyles.radioLabel}>
                <input
                  type="radio"
                  name={`decision-${row.id}`}
                  checked={decision === 'REJECTED'}
                  onChange={() => setDecision('REJECTED')}
                />
                <span>رفض</span>
              </label>
            </div>

            {decision === 'APPROVED' && isNational && (
              <div style={decisionStyles.inlineInputs}>
                <div style={decisionStyles.field}>
                  <span style={decisionStyles.label}>بداية التسجيل</span>
                  <input type="date" value={insStart} onChange={(e) => setInsStart(e.target.value)} style={decisionStyles.input} />
                </div>
                <div style={decisionStyles.field}>
                  <span style={decisionStyles.label}>نهاية التسجيل</span>
                  <input type="date" value={insEnd} onChange={(e) => setInsEnd(e.target.value)} style={decisionStyles.input} />
                </div>
              </div>
            )}

            <div style={decisionStyles.actions}>
              <button type="button" onClick={submitDecision} disabled={saving} style={decisionStyles.btn}>
                {saving ? '... حفظ' : 'تأكيد'}
              </button>
              {err && <div style={decisionStyles.err}>❌ {err}</div>}
            </div>
          </div>
        )}
      </td>

      <td style={styles.td}>
        <span style={props.badgeStyle(row.status)}>{props.labelStatus(row.status)}</span>
      </td>
    </tr>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937', marginBottom: 100 },
  redLine: { height: 3, background: RED, opacity: 0.9, borderRadius: 2, marginTop: 8, marginBottom: 8 },

  circleRedBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },

  regionCard: {
    width: '97%',
    background: '#fff',
    borderRadius: 22,
    border: '1px solid #e9edf3',
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: '16px 18px',
    display: 'grid',
    gap: 8,
  },
  regionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  regionTitle: { fontSize: 18, fontWeight: 800, color: '#374151', display: 'flex', alignItems: 'center', gap: 10 },
  regionSub: { fontSize: 12, color: '#6b7280' },

  counterPill: {
    fontSize: 12, padding: '4px 10px', borderRadius: 999,
    border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontWeight: 800,
  },

  filterPill: {
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#374151',
    cursor: 'pointer',
    fontWeight: 800,
  },

  eyeBtn: {
    width: 46, height: 46, borderRadius: 14, background: 'transparent',
    border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },

  // table
  tableWrap: {
    borderRadius: 18,
    border: '1px solid #e9edf3',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
  },
  th: {
    textAlign: 'right',
    padding: '12px 14px',
    fontSize: 12,
    color: '#6b7280',
    background: '#f9fafb',
    borderBottom: '1px solid #e9edf3',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #eef2f7',
  },
  td: {
    padding: '12px 14px',
    verticalAlign: 'top',
  },

  smallLine: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' },
  smallLabel: { fontSize: 12, color: '#6b7280' },
  smallValue: { fontSize: 12, color: '#374151', fontWeight: 700 },
};

const decisionStyles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 8 },
  radioRow: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  radioLabel: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#374151' },

  inlineInputs: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  field: { display: 'grid', gap: 4 },
  label: { fontSize: 12, color: '#6b7280' },
  input: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    minWidth: 150,
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
    whiteSpace: 'nowrap',
  },
  err: { color: '#b91c1c', fontSize: 12 },
};

/* ---------- icons ---------- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
