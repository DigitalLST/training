import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type FormationRow = {
  id: string;
  nom: string;
};

type RegionSessionRow = {
  id: string;
  title: string;
  period: string;
  organizer: string;
  trainingLevels: string[];
  branches: string[];
  approvedParticipantsCount: number;
  studiesCount: number;
  trainingCenterId: string;
  customTrainingCenter: string;
  formations: FormationRow[];
};

type TrainingCenterOption = {
  id: string;
  name: string;
};

const PAGE_TITLES: Record<string, string> = {
  '/region/gestionformations': 'إدارة الدراسات التدريبية',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const CUSTOM_CENTER_VALUE = '__custom__';

export default function GestionEtudesTraining(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<RegionSessionRow[]>([]);
  const [centers, setCenters] = useState<TrainingCenterOption[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  const fmtMonth = (iso?: string): string =>
    iso ? new Date(iso).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long' }) : '—';

  const normArray = (v: any): string[] => {
    if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return [];
  };

  useEffect(() => {
    void loadData();
  }, []);

  async function fetchFormationsBySessionId(sessionId: string): Promise<FormationRow[]> {
    try {
      const r = await fetch(`${API_BASE}/formations?sessionId=${sessionId}&ts=${Date.now()}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });

      if (!r.ok) return [];

      const j = await r.json();

      return Array.isArray(j)
        ? j.map((f: any) => ({
            id: String(f._id ?? f.id ?? '').trim(),
            nom: String(f.nom ?? f.title ?? '').trim(),
          }))
        : [];
    } catch {
      return [];
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setErr(null);

      const sessionsRes = await fetch(`${API_BASE}/sessions/ma-region?ts=${Date.now()}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!sessionsRes.ok) throw new Error(`HTTP ${sessionsRes.status}`);
      const sessionsData = await sessionsRes.json();

      const centersRes = await fetch(`${API_BASE}/centres?ts=${Date.now()}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!centersRes.ok) throw new Error(`HTTP ${centersRes.status}`);
      const centersData = await centersRes.json();

      const centersArray: any[] = Array.isArray(centersData)
        ? centersData
        : Array.isArray(centersData?.centres)
          ? centersData.centres
          : Array.isArray(centersData?.centers)
            ? centersData.centers
            : [];

      const centersMapped: TrainingCenterOption[] = centersArray
        .map((c: any) => ({
          id: String(c._id ?? c.id ?? '').trim(),
          name: String(c.title ?? c.name ?? '').trim(),
        }))
        .filter((c: TrainingCenterOption) => !!c.id && !!c.name);

      setCenters(centersMapped);

      const raw: any[] = Array.isArray(sessionsData)
        ? sessionsData
        : Array.isArray(sessionsData?.sessions)
          ? sessionsData.sessions
          : [];

      const baseRows: RegionSessionRow[] = raw.map((s: any): RegionSessionRow => {
        const trainingLevels = normArray(
          s.trainingLevels ?? s.trainingLevel ?? s.levels ?? s.level
        );

        const branches = normArray(
          s.branche ?? s.branches ?? s.branch
        );

        return {
          id: String(s._id ?? s.id ?? '').trim(),
          title: String(s.title ?? s.name ?? '').trim(),
          period: fmtMonth(s.startDate),
          organizer: String(
            s.organizerRegion ??
            s.region ??
            s.organizer ??
            s.organizerName ??
            s.organiser ??
            ''
          ).trim(),
          trainingLevels,
          branches,
          approvedParticipantsCount:
            typeof s.approvedParticipantsCount === 'number'
              ? s.approvedParticipantsCount
              : 0,
          studiesCount:
            typeof s.studiesCount === 'number' && s.studiesCount > 0
              ? s.studiesCount
              : typeof s.formationsCount === 'number' && s.formationsCount > 0
                ? s.formationsCount
                : 1,
          trainingCenterId: String(
            s.trainingCenterId ??
            s.trainingCenter?._id ??
            s.trainingCenterIdRef ??
            ''
          ).trim(),
          customTrainingCenter: '',
          formations: [],
        };
      });

      const mapped = await Promise.all(
        baseRows.map(async (row) => {
          const formations = await fetchFormationsBySessionId(row.id);
          return {
            ...row,
            formations,
            studiesCount: formations.length > 0 ? formations.length : row.studiesCount,
          };
        })
      );

      setRows(mapped);

      const initialExpanded: Record<string, boolean> = {};
      mapped.forEach((r) => {
        if (r.formations.length > 0) initialExpanded[r.id] = true;
      });
      setExpandedRows(initialExpanded);
    } catch (e: any) {
      setErr(e?.message || 'تعذر الجلب');
    } finally {
      setLoading(false);
    }
  }

  function onBack() {
    nav('/region/');
  }

  function updateRow(id: string, patch: Partial<RegionSessionRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function saveRow(row: RegionSessionRow) {
    try {
      setSavingId(row.id);
      setErr(null);

      if (row.approvedParticipantsCount <= 0) {
        throw new Error('لا يمكن الإعداد دون مشاركين موافق عليهم');
      }

      if (Number(row.studiesCount) < 1) {
        throw new Error('عدد الدراسات يجب أن يكون على الأقل 1');
      }

      let finalCenterId = row.trainingCenterId;

      if (!finalCenterId) {
        throw new Error('يرجى اختيار مركز التكوين');
      }

      if (finalCenterId === CUSTOM_CENTER_VALUE) {
        const centerValue = row.customTrainingCenter.trim();

        if (!centerValue) {
          throw new Error('يرجى إدخال اسم مركز التكوين');
        }

        const createRes = await fetch(`${API_BASE}/centres`, {
          method: 'POST',
          headers: authHeaders(),
          cache: 'no-store',
          body: JSON.stringify({
            title: centerValue,
            region: centerValue,
          }),
        });

        if (!createRes.ok) {
          throw new Error('تعذر إنشاء مركز التكوين');
        }

        const created = await createRes.json();
        finalCenterId = String(created._id ?? created.id ?? '').trim();

        if (!finalCenterId) {
          throw new Error('تم إنشاء المركز دون معرف صالح');
        }

        setCenters((prev) => {
          const exists = prev.some((c) => c.id === finalCenterId);
          if (exists) return prev;
          return [...prev, { id: finalCenterId, name: String(created.title ?? centerValue).trim() }];
        });
      }

      const res = await fetch(`${API_BASE}/sessions/${row.id}/training-studies-config`, {
        method: 'PATCH',
        headers: authHeaders(),
        cache: 'no-store',
        body: JSON.stringify({
          studiesCount: Number(row.studiesCount),
          trainingCenterId: finalCenterId,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await res.json();

      const formations = await fetchFormationsBySessionId(row.id);

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                trainingCenterId: finalCenterId,
                customTrainingCenter: '',
                formations,
                studiesCount: formations.length > 0 ? formations.length : Number(row.studiesCount),
              }
            : r
        )
      );

      if (formations.length > 0) {
        setExpandedRows((prev) => ({ ...prev, [row.id]: true }));
      }
    } catch (e: any) {
      setErr(e?.message || 'تعذر الحفظ');
    } finally {
      setSavingId(null);
    }
  }

  function goToFormationSetup(row: RegionSessionRow, formation: FormationRow) {
   const ctx = {
    fid: formation.id,
    sid: row.id,
    title: row.title,
    period: row.period,
   };

   sessionStorage.setItem('aff_ctx_v2', JSON.stringify(ctx));

   nav('/region/affectations'); // ✅ route propre sans id
}

  function goToAttendance(row: RegionSessionRow, formation: FormationRow)  {
    const ctx = {
    fid: formation.id,
    sid: row.id,
    title: row.title,
    period: row.period,
   };

   sessionStorage.setItem('aff_ctx_v2', JSON.stringify(ctx));

   nav('/region/formation_final');
  }

  const pageTitle = PAGE_TITLES[pathname] ?? 'إدارة الدراسات التدريبية';

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
          <span>إدارة الدراسات التدريبية</span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جاري التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((row) => {
          const hasFormations = row.formations.length > 0;
          const isExpanded = !!expandedRows[row.id];

          return (
            <div key={row.id} style={styles.item} dir="rtl">
              <div style={styles.itemRight}>
                <div style={styles.itemHeader}>
                  <div style={styles.itemTitle}>
                    {row.title} - {row.period}
                  </div>

                  {hasFormations && (
                    <button
                      type="button"
                      onClick={() => toggleRow(row.id)}
                      style={styles.eyeBtn}
                      aria-label={isExpanded ? 'إخفاء التكوينات' : 'عرض التكوينات'}
                      title={isExpanded ? 'إخفاء التكوينات' : 'عرض التكوينات'}
                    >
                      {isExpanded ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  )}
                </div>

                <div style={styles.metaBlock}>
                  <div style={styles.metaLine}>
                    <span style={styles.metaLabel}>الجهة المنظمة:</span>
                    <span style={styles.metaValue}>{row.organizer || '—'}</span>
                  </div>

                  <div style={styles.metaLine}>
                    <span style={styles.metaLabel}>عدد المشاركين الموافق عليهم:</span>
                    <span style={styles.metaValue}>{row.approvedParticipantsCount}</span>
                  </div>

                  {!hasFormations && row.approvedParticipantsCount > 0 && (
                    <div style={styles.formRow}>
                      <div style={styles.field}>
                        <span style={styles.metaLabel}>عدد الدراسات</span>
                        <input
                          type="number"
                          min={1}
                          value={row.studiesCount}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            updateRow(row.id, {
                              studiesCount: v < 1 ? 1 : v,
                            });
                          }}
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.field}>
                        <span style={styles.metaLabel}>مركز التكوين</span>
                        <select
                          value={row.trainingCenterId}
                          onChange={(e) =>
                            updateRow(row.id, {
                              trainingCenterId: e.target.value,
                              customTrainingCenter:
                                e.target.value === CUSTOM_CENTER_VALUE ? row.customTrainingCenter : '',
                            })
                          }
                          style={styles.select}
                        >
                          <option value="">اختر مركز التكوين</option>
                          {centers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value={CUSTOM_CENTER_VALUE}>مركز آخر</option>
                        </select>

                        {row.trainingCenterId === CUSTOM_CENTER_VALUE && (
                          <input
                            type="text"
                            value={row.customTrainingCenter}
                            onChange={(e) =>
                              updateRow(row.id, { customTrainingCenter: e.target.value })
                            }
                            placeholder="أدخل اسم مركز التكوين"
                            style={styles.input}
                          />
                        )}
                      </div>

                      <div style={styles.saveWrap}>
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={savingId === row.id}
                          style={styles.saveBtn}
                        >
                          {savingId === row.id ? '... حفظ' : 'حفظ'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!hasFormations && row.approvedParticipantsCount <= 0 && (
                    <div style={styles.noDataText}>لا يوجد مشاركون موافق عليهم</div>
                  )}

                  {hasFormations && isExpanded && (
                    <div style={styles.formationsWrap}>
                      {row.formations.map((formation) => (
                        <div key={formation.id} style={styles.formationItem}>
                          <div style={styles.formationName}>{formation.nom}</div>

                          <div style={styles.formationActions}>
                            <button
                              type="button"
                              onClick={() => goToFormationSetup(row, formation)}
                              style={styles.secondaryBtn}
                            >
                              إضافة قيادة الدراسة و المتدربين
                            </button>

                            <button
                              type="button"
                              onClick={() => goToAttendance(row, formation)}
                              style={styles.secondaryBtn}
                            >
                               التقرير النهائي
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.actions} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  redLine: {
    height: 3,
    background: RED,
    opacity: 0.9,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 8,
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

  eyeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: 'transparent',
    border: `1px solid ${RED}`,
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
    alignItems: 'start',
    minHeight: 78,
  },

  itemRight: { display: 'grid', justifyItems: 'start', gap: 8 },
  itemHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: { fontSize: 18, fontWeight: 200, color: '#374151' },

  metaBlock: { display: 'grid', gap: 8, width: '100%' },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLabel: { fontSize: 13, color: '#6b7280' },
  metaValue: { fontSize: 13, color: '#374151' },

  formRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'end',
    marginTop: 6,
  },

  field: { display: 'grid', gap: 6 },
  input: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    minWidth: 140,
  },
  select: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    minWidth: 220,
    background: '#fff',
  },

  saveWrap: { display: 'flex', alignItems: 'end' },
  saveBtn: {
    padding: '8px 14px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
  },

  secondaryBtn: {
    padding: '8px 14px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
  },

  formationsWrap: {
    display: 'flex',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },

  formationItem: {
    width: '100%',
    border: '1px solid #eef2f7',
    borderRadius: 16,
    padding: '12px 14px',
    display: 'grid',
    gap: 10,
    background: '#fafafa',
  },

  formationName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
  },

  formationActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },

  noDataText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },

  actions: { display: 'flex', gap: 18, color: '#0f172a', alignItems: 'center' },
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

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4.2 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6.2 6.2A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.1-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}