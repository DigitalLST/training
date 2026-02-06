import React from 'react';
import { useNavigate } from 'react-router-dom';
import SignatureModal from '../../components/signature/SignatureModal';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type RoleMe = 'cn_president' | 'cn_commissioner' | null;

type SessionTotals = {
  participants: number; // عدد المشاركين
  present: number; // الحضور
  success: number; // يجاز
  retake: number; // يعيد الدورة
  incompatible: number; // لا يناسب الدور
};

type FormationRow = {
  formationId: string;
  nom: string;
  niveau: string;
  branche: string;
  centreTitleSnapshot?: string;
  centreRegionSnapshot?: string;
  stats: SessionTotals;
  isValidated: boolean;
};

type BrancheGroup = {
  branche: string;
  subtotal: SessionTotals;
  formations: FormationRow[];
};

type NiveauGroup = {
  niveau: string;
  subtotal: SessionTotals;
  branches: BrancheGroup[];
};

type SessionCard = {
  sessionId: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  organizer?: string;

  isVisible: boolean;

  validations: {
    commissioner: { isValidated: boolean; validatedAt?: string | null };
    president: { isValidated: boolean; validatedAt?: string | null };
  };

  allFormationsValidated: boolean;

  totals: SessionTotals;
  niveaux: NiveauGroup[];
};

type PendingAction = { kind: 'validateSession'; sessionId: string };

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtRange(s?: string | null, e?: string | null) {
  if (!s && !e) return '—';
  const sd = s ? new Date(s) : null;
  const ed = e ? new Date(e) : null;

  const F = (d: Date) =>
    d.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: '2-digit' });

  if (sd && ed) return `${F(sd)} — ${F(ed)}`;
  if (sd) return `من ${F(sd)}`;
  return `إلى ${F(ed!)}`;
}

function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function pctSuccess(t: SessionTotals): number {
  const den = safeNum(t.present);
  if (den <= 0) return 0;
  return Math.round((safeNum(t.success) / den) * 1000) / 10;
}

function pill(text: string) {
  return (
    <span
      style={{
        background: '#f3f4f6',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 12,
        color: '#374151',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {text}
    </span>
  );
}

type FlatRow =
  | { kind: 'total'; label: string; totals: SessionTotals }
  | { kind: 'niveauSubtotal'; niveau: string; totals: SessionTotals }
  | { kind: 'brancheSubtotal'; branche: string; totals: SessionTotals }
  | { kind: 'formation'; formation: FormationRow };

function flattenSessionToRows(session: SessionCard): FlatRow[] {
  const rows: FlatRow[] = [];

  rows.push({ kind: 'total', label: 'المجموع العام', totals: session.totals });

  for (const nv of session.niveaux || []) {
    rows.push({ kind: 'niveauSubtotal', niveau: nv.niveau, totals: nv.subtotal });

    for (const br of nv.branches || []) {
      rows.push({ kind: 'brancheSubtotal', branche: br.branche, totals: br.subtotal });

      for (const f of br.formations || []) {
        rows.push({ kind: 'formation', formation: f });
      }
    }
  }

  return rows;
}

function validateButtonLabel(meRole: RoleMe): string {
  if (meRole === 'cn_commissioner') return 'مصادقة القائد العام';
  if (meRole === 'cn_president') return 'مصادقة رئيس اللجنة الوطنية';
  return 'المصادقة على النتائج';
}

function alreadyValidatedByRole(session: SessionCard, meRole: RoleMe): boolean {
  if (meRole === 'cn_president') return !!session.validations?.president?.isValidated;
  if (meRole === 'cn_commissioner') return !!session.validations?.commissioner?.isValidated;
  return true;
}

export default function AdminResultsValidation(): React.JSX.Element {
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [meRole, setMeRole] = React.useState<RoleMe>(null);
  const [sessions, setSessions] = React.useState<SessionCard[]>([]);
  const [openId, setOpenId] = React.useState<string>('');

  const [savingBySession, setSavingBySession] = React.useState<Record<string, boolean>>({});
  const [saveErrBySession, setSaveErrBySession] = React.useState<Record<string, string | null>>({});

  // ✅ NEW: download state
  const [downloadingBySession, setDownloadingBySession] = React.useState<Record<string, boolean>>(
    {}
  );
  const [downloadErrBySession, setDownloadErrBySession] = React.useState<
    Record<string, string | null>
  >({});

  const [signatureModalOpen, setSignatureModalOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [signatureErr, setSignatureErr] = React.useState<string | null>(null);

  async function loadAll() {
    try {
      setLoading(true);
      setErr(null);

      const rRole = await fetch(`${API_BASE}/admin/results/me-role?ts=${Date.now()}`, {
        headers: headers(),
        cache: 'no-store',
      });
      if (rRole.ok) {
        const dataRole = await rRole.json();
        setMeRole((dataRole?.role as RoleMe) || null);
      } else {
        setMeRole(null);
      }

      const r = await fetch(`${API_BASE}/admin/results/sessions?ts=${Date.now()}`, {
        headers: headers(),
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();
      const sessionsList = Array.isArray(data) ? data : (data?.sessions || []);

      sessionsList.sort((a: any, b: any) => {
        const da = a?.endDate ? new Date(a.endDate).getTime() : 0;
        const db = b?.endDate ? new Date(b.endDate).getTime() : 0;
        return db - da;
      });

      setSessions(sessionsList);
    } catch (e: any) {
      setErr(e?.message || 'تعذّر تحميل الجلسات');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
  }, []);

  async function onToggleSession(sid: string) {
    setOpenId(prev => (prev === sid ? '' : sid));
  }

  async function startValidationWithSignature(sessionId: string) {
    try {
      setSignatureErr(null);
      const r = await fetch(`${API_BASE}/signatures/me`, {
        headers: headers(),
        cache: 'no-store',
      });

      if (r.ok) {
        const data = await r.json();
        if (data?.hasSignature) {
          await validateSession(sessionId);
          return;
        }
      }
    } catch (e: any) {
      setSignatureErr(e?.message || 'تعذّر التحقق من وجود الإمضاء.');
    }

    setPendingAction({ kind: 'validateSession', sessionId });
    setSignatureModalOpen(true);
  }

  async function handleSignatureSave(dataUrl: string) {
    if (!pendingAction) {
      setSignatureModalOpen(false);
      return;
    }

    try {
      setSignatureErr(null);

      const r = await fetch(`${API_BASE}/signatures/me`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ dataUrl }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      await validateSession(pendingAction.sessionId);
    } catch (e: any) {
      setSignatureErr(e?.message || 'تعذّر حفظ الإمضاء.');
      return;
    } finally {
      setSignatureModalOpen(false);
      setPendingAction(null);
    }
  }

  async function validateSession(sessionId: string) {
    try {
      setSavingBySession(prev => ({ ...prev, [sessionId]: true }));
      setSaveErrBySession(prev => ({ ...prev, [sessionId]: null }));

      const r = await fetch(`${API_BASE}/admin/results/sessions/${sessionId}/validate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(txt || `HTTP ${r.status}`);
      }

      await loadAll();
    } catch (e: any) {
      setSaveErrBySession(prev => ({ ...prev, [sessionId]: e?.message || 'تعذّر المصادقة' }));
    } finally {
      setSavingBySession(prev => ({ ...prev, [sessionId]: false }));
    }
  }

  // ✅ NEW: download ZIP by region (hidden when session.isVisible === true)
  async function downloadZipByRegion(sessionId: string, sessionTitle?: string) {
    try {
      setDownloadingBySession(prev => ({ ...prev, [sessionId]: true }));
      setDownloadErrBySession(prev => ({ ...prev, [sessionId]: null }));

      const url = `${API_BASE}/final-decisions/sessions/${sessionId}/report-by-region.zip?ts=${Date.now()}`;

      const token = localStorage.getItem('token') || '';
      const r = await fetch(url, {
        method: 'GET',
        headers: token ? ({ Authorization: `Bearer ${token}` } as any) : ({} as any),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(txt || `HTTP ${r.status}`);
      }

      const blob = await r.blob();

      const safe = (s: any) =>
        String(s || 'session')
          .normalize('NFKD')
          .replace(/[^\w\-ء-ي]+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 80);

      const filename = `results_by_region_${safe(sessionTitle)}.zip`;

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setDownloadErrBySession(prev => ({
        ...prev,
        [sessionId]: e?.message || 'تعذّر تحميل الملف',
      }));
    } finally {
      setDownloadingBySession(prev => ({ ...prev, [sessionId]: false }));
    }
  }

  function goToDetails(formationId: string) {
    nav('/moderator/finalresults', { state: { formationId } });
  }

  return (
    <div dir="rtl" style={{ width: '70vw', paddingInline: 24, marginLeft: 20 }}>
      <div style={styles.toolbarRight}>
        <button onClick={() => nav('/admin')} style={styles.circleRedBtn} title="رجوع">
          <ArrowRightIcon />
        </button>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      {!loading && sessions.length === 0 && <div style={{ color: '#9ca3af' }}>لا توجد جلسات.</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {sessions.map(s => {
          const opened = openId === s.sessionId;

          const saving = !!savingBySession[s.sessionId];
          const saveErr = saveErrBySession[s.sessionId] || null;

          const downloading = !!downloadingBySession[s.sessionId];
          const downloadErr = downloadErrBySession[s.sessionId] || null;

          const canValidateRole = meRole === 'cn_president' || meRole === 'cn_commissioner';

          const disabledBecauseNotAllValidated = !s.allFormationsValidated;
          const alreadyByMeRole = alreadyValidatedByRole(s, meRole);

          // ✅ UX: cacher le bouton du commissaire tant que le président n'a pas validé
          const hideValidateButtonForUX =
            meRole === 'cn_commissioner' && !s.validations?.president?.isValidated;

          const validateDisabled =
            !canValidateRole || disabledBecauseNotAllValidated || alreadyByMeRole || saving;

          const validateLabel = validateButtonLabel(meRole);

          const rows = flattenSessionToRows(s);

          // ✅ show ZIP button unless session.isVisible === true
          const showZipBtn = s.isVisible;
          const zipDisabled = downloading; // keep simple; add more conditions if you want

          return (
            <div key={s.sessionId} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  {s.title}
                  {s.endDate && (
                    <span style={{ marginInlineStart: 8, fontSize: 12, color: '#6b7280' }}>
                      ({fmtRange(s.startDate || null, s.endDate || null)})
                    </span>
                  )}
                </div>

                <button onClick={() => onToggleSession(s.sessionId)} style={styles.eyeBtn}>
                  {opened ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {/* résumé badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                {pill(`عدد المشاركين: ${safeNum(s.totals?.participants)}`)}
                {pill(`الحضور: ${safeNum(s.totals?.present)}`)}
                {pill(`يجاز: ${safeNum(s.totals?.success)}`)}
                {pill(`يعيد الدورة: ${safeNum(s.totals?.retake)}`)}
                {pill(`لا يناسب الدور: ${safeNum(s.totals?.incompatible)}`)}
                {pill(`% النجاح: ${pctSuccess(s.totals).toFixed(1)}%`)}
              </div>

              {/* état validations */}
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                حالة المصادقة:
                <span style={{ marginInlineStart: 8 }}>
                  رئيس اللجنة الوطنية: {s.validations?.president?.isValidated ? '✅' : '—'}
                </span>
                <span style={{ marginInlineStart: 8 }}>
                  القائد العام: {s.validations?.commissioner?.isValidated ? '✅' : '—'}
                </span>
                <span style={{ marginInlineStart: 8 }}>
                  عرض للمتدربين: {s.isVisible ? '✅' : '—'}
                </span>
              </div>

              {opened && (
                <div style={styles.detailWrap}>
                  {/* bouton validation session + bouton ZIP */}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    {!hideValidateButtonForUX && (
                      <button
                        style={{
                          borderRadius: 999,
                          border: 'none',
                          padding: '8px 16px',
                          background: validateDisabled ? '#ccc' : RED,
                          color: '#fff',
                          cursor: validateDisabled ? 'default' : 'pointer',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                        }}
                        disabled={validateDisabled}
                        onClick={() => startValidationWithSignature(s.sessionId)}
                        title={
                          !canValidateRole
                            ? 'غير مخوّل'
                            : disabledBecauseNotAllValidated
                            ? 'يجب المصادقة على جميع الدراسات أولاً'
                            : alreadyByMeRole
                            ? 'تمت المصادقة مسبقاً'
                            : ''
                        }
                      >
                        {saving ? '… جارِ التنفيذ' : validateLabel}
                      </button>
                    )}

                    {/* ✅ NEW ZIP button (hidden if isVisible=true) */}
                    {showZipBtn && (
                      <button
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${RED}`,
                          padding: '8px 16px',
                          background: zipDisabled ? '#f3f4f6' : 'transparent',
                          color: zipDisabled ? '#9ca3af' : RED,
                          cursor: zipDisabled ? 'default' : 'pointer',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                        }}
                        disabled={zipDisabled}
                        onClick={() => downloadZipByRegion(s.sessionId, s.title)}
                        title="تحميل تقرير حسب الجهة (ZIP)"
                      >
                        {downloading ? '… جارِ التحميل' : 'تحميل ZIP حسب الجهة'}
                      </button>
                    )}

                    {/* petit hint UX si commissaire */}
                    {hideValidateButtonForUX && (
                      <div style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
                        في انتظار مصادقة رئيس اللجنة الوطنية لتنمية القيادات .
                      </div>
                    )}

                    {!s.allFormationsValidated && (
                      <div style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
                        لا يمكن المصادقة قبل اكتمال مصادقة جميع الدراسات.
                      </div>
                    )}
                  </div>

                  {saveErr && <div style={{ color: '#b91c1c', fontSize: 12 }}>❌ {saveErr}</div>}
                  {downloadErr && <div style={{ color: '#b91c1c', fontSize: 12 }}>❌ {downloadErr}</div>}

                  {/* tableau unique */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>المستوى</th>
                          <th style={styles.th}>القسم الفني</th>
                          <th style={styles.th}>الدراسة</th>
                          <th style={styles.th}>عدد المشاركين</th>
                          <th style={styles.th}>الحضور</th>
                          <th style={styles.th}>يجاز</th>
                          <th style={styles.th}>يعيد الدورة</th>
                          <th style={styles.th}>لا يناسب الدور</th>
                          <th style={styles.th}>% النجاح</th>
                          <th style={styles.th}>تفاصيل</th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((r, idx) => {
                          if (r.kind === 'total') {
                            const p = pctSuccess(r.totals);
                            return (
                              <tr key={`total-${idx}`} style={styles.rowTotal}>
                                <td style={styles.td}>
                                  <strong>—</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>—</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>المجموع العام</strong>
                                </td>

                                <td style={styles.td}>
                                  <strong>{r.totals.participants}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.present}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.success}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.retake}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.incompatible}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{p.toFixed(1)}%</strong>
                                </td>
                                <td style={styles.td}>—</td>
                              </tr>
                            );
                          }

                          if (r.kind === 'niveauSubtotal') {
                            const p = pctSuccess(r.totals);
                            return (
                              <tr key={`nv-${idx}`} style={styles.rowSubtotal}>
                                <td style={styles.td}>
                                  <strong>{r.niveau}</strong>
                                </td>
                                <td style={styles.td}>—</td>
                                <td style={styles.td}>
                                  <strong>مجموع المستوى</strong>
                                </td>

                                <td style={styles.td}>
                                  <strong>{r.totals.participants}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.present}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.success}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.retake}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.incompatible}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{p.toFixed(1)}%</strong>
                                </td>
                                <td style={styles.td}>—</td>
                              </tr>
                            );
                          }

                          if (r.kind === 'brancheSubtotal') {
                            const p = pctSuccess(r.totals);
                            return (
                              <tr key={`br-${idx}`} style={styles.rowSubSubTotal}>
                                <td style={styles.td}>—</td>
                                <td style={styles.td}>
                                  <strong>{r.branche}</strong>
                                </td>
                                <td style={styles.td}></td>

                                <td style={styles.td}>
                                  <strong>{r.totals.participants}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.present}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.success}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.retake}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{r.totals.incompatible}</strong>
                                </td>
                                <td style={styles.td}>
                                  <strong>{p.toFixed(1)}%</strong>
                                </td>
                                <td style={styles.td}>—</td>
                              </tr>
                            );
                          }

                          const f = r.formation;
                          const p = pctSuccess(f.stats);
                          const showDetailsBtn = !!f.isValidated;

                          return (
                            <tr key={`f-${f.formationId}`}>
                              <td style={styles.td}></td>
                              <td style={styles.td}></td>

                              <td style={styles.td}>
                                <div style={{ display: 'grid', gap: 2 }}>
                                  <span style={{ fontWeight: 600, color: '#111827' }}>{f.nom}</span>
                                  {(f.centreTitleSnapshot || f.centreRegionSnapshot) && (
                                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                                      {f.centreTitleSnapshot || '—'} — {f.centreRegionSnapshot || '—'}
                                    </span>
                                  )}
                                  {!f.isValidated && (
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                      (غير مصادق عليه بعد)
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td style={styles.td}>{f.stats.participants}</td>
                              <td style={styles.td}>{f.stats.present}</td>
                              <td style={styles.td}>{f.stats.success}</td>
                              <td style={styles.td}>{f.stats.retake}</td>
                              <td style={styles.td}>{f.stats.incompatible}</td>
                              <td style={styles.td}>{p.toFixed(1)}%</td>

                              <td style={styles.td}>
                                {showDetailsBtn ? (
                                  <button
                                    style={styles.detailsBtn}
                                    onClick={() => goToDetails(f.formationId)}
                                  >
                                    النتائج المفصلة
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => {
          setSignatureModalOpen(false);
          setPendingAction(null);
        }}
        onSave={handleSignatureSave}
      />

      {signatureErr && (
        <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 12 }}>❌ {signatureErr}</div>
      )}
    </div>
  );
}

/* ------------------------ Icons ------------------------ */
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
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ------------------------ Styles ------------------------ */
const styles: Record<string, React.CSSProperties> = {
  toolbarRight: { display: 'flex', alignItems: 'center' },
  redLine: { height: 3, background: RED, borderRadius: 2, marginTop: 8, marginBottom: 8 },
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
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#374151' },
  detailWrap: { borderTop: '1px dashed #e5e7eb', paddingTop: 10, display: 'grid', gap: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    borderBottom: '1px solid #e5e7eb',
    padding: '8px 6px',
    textAlign: 'right',
    background: '#f9fafb',
    fontWeight: 800,
    color: '#111827',
    whiteSpace: 'nowrap',
  },
  td: {
    borderBottom: '1px solid #f3f4f6',
    padding: '8px 6px',
    textAlign: 'right',
    verticalAlign: 'top',
  },
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
  rowTotal: { background: '#fff7f7' },
  rowSubtotal: { background: '#f9fafb' },
  rowSubSubTotal: { background: '#fcfcfd' },
  detailsBtn: {
    borderRadius: 999,
    border: `1px solid ${RED}`,
    padding: '6px 12px',
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
};
