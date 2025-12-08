// src/screens/CoachReport.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/UseAuth';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type ReportFormationLite = {
  formationId: string;
  nom: string;
  role: 'director' | 'coach';
  sessionTitle?: string;
  startDate?: string;
  endDate?: string;
  centreTitle?: string;
  centreRegion?: string;
  sessionId?: string;
};

type ReportData = {
  block1: string;
  block2: string;
  block3: string;
  updatedAt?: string | null;
  hasSignature?: boolean;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function fmtRange(s?: string, e?: string) {
  if (!s && !e) return '—';
  const sd = s ? new Date(s) : null;
  const ed = e ? new Date(e) : null;
  const F = (d: Date) =>
    d.toLocaleDateString('ar-TN', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
  if (sd && ed) return `${F(sd)} — ${F(ed)}`;
  if (sd) return `من ${F(sd)}`;
  return `إلى ${F(ed!)}`;
}

export default function CoachReport(): React.JSX.Element {
  const nav = useNavigate();
  const { user: _user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [formations, setFormations] = React.useState<ReportFormationLite[]>([]);
  const [openId, setOpenId] = React.useState<string>('');

  const [reports, setReports] = React.useState<Record<string, ReportData>>({});
  const [savingByFormation, setSavingByFormation] = React.useState<Record<string, boolean>>(
    {}
  );
  const [errByFormation, setErrByFormation] = React.useState<Record<string, string | null>>(
    {}
  );

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch(`${API_BASE}/reports/mine-formations?ts=${Date.now()}`, {
          headers: headers(),
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = (await r.json()) as ReportFormationLite[];
        setFormations((list || []).filter(f => f.role === 'coach'));
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل الدورات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadReport(fid: string) {
    try {
      setErrByFormation(prev => ({ ...prev, [fid]: null }));
      const r = await fetch(
        `${API_BASE}/reports/formations/${fid}/my?role=coach&ts=${Date.now()}`,
        {
          headers: headers(),
          cache: 'no-store',
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setReports(prev => ({
        ...prev,
        [fid]: {
          block1: data.block1 || '',
          block2: data.block2 || '',
          block3: data.block3 || '',
          updatedAt: data.updatedAt || null,
          hasSignature: data.hasSignature,
        },
      }));
    } catch (e: any) {
      setErrByFormation(prev => ({
        ...prev,
        [fid]: e?.message || 'تعذّر تحميل التقرير',
      }));
    }
  }

  async function onToggleFormation(fid: string) {
    setOpenId(prev => (prev === fid ? '' : fid));
    if (!reports[fid]) {
      await loadReport(fid);
    }
  }

  function onChangeBlock(fid: string, key: keyof ReportData, value: string) {
    setReports(prev => ({
      ...prev,
      [fid]: {
        ...(prev[fid] || { block1: '', block2: '', block3: '' }),
        [key]: value,
      },
    }));
  }

  async function onSave(fid: string) {
    const rep = reports[fid];
    if (!rep) return;

    try {
      setSavingByFormation(prev => ({ ...prev, [fid]: true }));
      setErrByFormation(prev => ({ ...prev, [fid]: null }));

      const r = await fetch(`${API_BASE}/reports/formations/${fid}/my?role=coach`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          block1: rep.block1,
          block2: rep.block2,
          block3: rep.block3,
        }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const newRep = data.report;
      setReports(prev => ({
        ...prev,
        [fid]: {
          block1: newRep.block1 || '',
          block2: newRep.block2 || '',
          block3: newRep.block3 || '',
          updatedAt: newRep.updatedAt || null,
          hasSignature: rep.hasSignature,
        },
      }));
    } catch (e: any) {
      setErrByFormation(prev => ({
        ...prev,
        [fid]: e?.message || 'تعذّر حفظ التقرير',
      }));
    } finally {
      setSavingByFormation(prev => ({ ...prev, [fid]: false }));
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        width: '70vw',
        alignItems: 'center',
        marginLeft: 20,
        marginRight: 20,
        paddingInline: 24,
      }}
    >
      <div style={styles.toolbarRight}>
        <button
          onClick={() => nav('/trainer')}
          style={styles.circleRedBtn}
          aria-label="رجوع"
        >
          <ArrowRightIcon />
        </button>
      </div>
      <div style={styles.redLine} />

      {/* Message général pour le coach (signature, etc.) */}
      <div style={{ marginBottom: 12, fontSize: 14, color: '#4b5563' }}>
        هذا الفضاء مخصص لتقرير <strong>المرشد الفني</strong> حول الدورة.  
        الرجاء تدوين ملاحظاتك حول قائد الدورة وقيادة الدورة والملاحظات العامة.
      </div>

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c' }}>❌ {err}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {formations.map(f => {
          const fid = f.formationId;
          const opened = openId === fid;
          const rep = reports[fid];
          const saving = !!savingByFormation[fid];
          const errF = errByFormation[fid] || null;

          return (
            <div key={fid} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={styles.cardTitle}>
                    {f.sessionTitle ? `${f.sessionTitle} — ${f.nom}` : f.nom}
                    <span style={{ opacity: 0.5, paddingInline: 6 }}>•</span>
                    <span style={styles.metaLine}>{fmtRange(f.startDate, f.endDate)}</span>
                    <span style={{ opacity: 0.5, paddingInline: 6 }}>•</span>
                    <span style={styles.metaLine}>
                      {[f.centreTitle || ''].filter(Boolean).join(' - ') || 'مركز تدريب'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onToggleFormation(fid)}
                  style={styles.eyeBtn}
                  title={opened ? 'إخفاء التقرير' : 'عرض التقرير'}
                >
                  {opened ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {opened && (
                <div style={styles.detailWrap}>
                  {errF && (
                    <div style={{ color: '#b91c1c', marginBottom: 8 }}>❌ {errF}</div>
                  )}

                  {!rep && !errF && (
                    <div style={{ color: '#6b7280' }}>… جارِ تحميل التقرير</div>
                  )}

                  {rep && (
                    <>
                      <div style={styles.formBlock}>
                        <label style={styles.label}>
                          ملاحظات حول قائد الدراسة
                          <textarea
                            style={styles.textArea}
                            value={rep.block1}
                            onChange={e => onChangeBlock(fid, 'block1', e.target.value)}
                          />
                        </label>

                        <label style={styles.label}>
                          ملاحظات حول قيادة الدراسة
                          <textarea
                            style={styles.textArea}
                            value={rep.block2}
                            onChange={e => onChangeBlock(fid, 'block2', e.target.value)}
                          />
                        </label>

                        <label style={styles.label}>
                          ملاحظات عامة
                          <textarea
                            style={styles.textArea}
                            value={rep.block3}
                            onChange={e => onChangeBlock(fid, 'block3', e.target.value)}
                          />
                        </label>

                        {rep.updatedAt && (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                            آخر تحديث:{' '}
                            {new Date(rep.updatedAt).toLocaleString('ar-TN')}
                          </div>
                        )}

                        {/* Plus tard tu pourras conditionner ça sur hasSignature === false */}
                        {/* {rep.hasSignature === false && (
                          <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>
                            لم تقم بعد بإضافة إمضائك. الرجاء التوجه إلى صفحة الحساب لإضافة الإمضاء قبل اعتماد التقرير.
                          </div>
                        )} */}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <button
                            onClick={() => onSave(fid)}
                            style={styles.saveEvalBtn}
                            disabled={saving}
                          >
                            {saving ? '… جاري الحفظ' : 'حفظ التقرير'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && formations.length === 0 && (
          <div style={{ color: '#9ca3af' }}>
            لا توجد دورات أنت مكلّف فيها كمرشد فني.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- icônes ---------- */
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
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
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

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
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
  metaLine: { color: '#6b7280', fontSize: 14 },
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
  detailWrap: { borderTop: '1px dashed #e5e7eb', paddingTop: 10, display: 'grid', gap: 14 },
  formBlock: {
    background: '#fff',
    border: '1px solid #e9edf3',
    borderRadius: 18,
    boxShadow: '0 10px 24px rgba(0,0,0,.03)',
    padding: '14px',
    display: 'grid',
    gap: 12,
  },
  label: {
    display: 'grid',
    gap: 4,
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
  },
  textArea: {
    minHeight: 120,
    resize: 'vertical',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    padding: '8px 10px',
    fontSize: 14,
  },
  saveEvalBtn: {
    borderRadius: 999,
    border: 'none',
    padding: '6px 16px',
    background: RED,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
};
