// src/screens/AdminUpdateAffectations.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

const RED = '#e20514';

type AffectationRow = {
  _id: string;
  formationId: string;
  formationName?: string;
  sessionTitle?: string;
  role: 'director' | 'trainer' | 'trainee' | 'coach' | 'assistant';
  isPresent: boolean;
};

type LocationState = {
  state?: {
    userId?: string;
    prenom?: string;
    nom?: string;
  };
};

export default function AdminUpdateAffectations(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation() as LocationState;

  const userId = state?.userId || '';
  const userName = `${state?.prenom || ''} ${state?.nom || ''}`.trim();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [affectations, setAffectations] = React.useState<AffectationRow[]>([]);

  React.useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const list: AffectationRow[] = await api(`/admin/affectations/users/${userId}`);
        setAffectations(list || []);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل التعيينات');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function changeField<K extends keyof AffectationRow>(
    affectationId: string,
    field: K,
    value: AffectationRow[K]
  ) {
    setAffectations(prev =>
      prev.map(a => (a._id === affectationId ? { ...a, [field]: value } : a))
    );
  }

  async function saveAffectation(a: AffectationRow) {
    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      await api(`/admin/affectations/${a._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: a.role,
          isPresent: a.isPresent,
        }),
      });

      setOk('تم حفظ التعيين');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حفظ التعيين');
    } finally {
      setLoading(false);
    }
  }

  async function deleteAffectation(a: AffectationRow) {
    const confirm = window.confirm('هل تريد فعلاً حذف هذا التعيين؟');
    if (!confirm) return;

    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      await api(`/admin/affectations/${a._id}`, { method: 'DELETE' });

      setAffectations(prev => prev.filter(x => x._id !== a._id));
      setOk('تم حذف التعيين');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حذف التعيين');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button type="button" onClick={() => nav(-1)} style={styles.circleRedBtn}>
            ‹
          </button>
          <span style={styles.pageTitle}>
            تعديل التعيينات {userName || `(${userId})`}
          </span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c', marginTop: 8 }}>❌ {err}</div>}
      {ok && <div style={{ color: '#065f46', marginTop: 8 }}>✅ {ok}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>التعيينات</div>

        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الدورة</th>
                <th style={styles.th}>التكوين</th>
                <th style={styles.th}>الدور</th>
                <th style={styles.th}>الحضور</th>
                <th style={styles.th}>إجراءات</th>
              </tr>
            </thead>

            <tbody>
              {affectations.map(a => (
                <tr key={a._id} style={styles.tr}>
                  <td style={styles.td}>{a.sessionTitle || '—'}</td>
                  <td style={styles.td}>{a.formationName || '—'}</td>

                  <td style={styles.td}>
                    <select
                      value={a.role}
                      onChange={e => changeField(a._id, 'role', e.target.value as any)}
                      style={styles.select}
                    >
                      <option value="director">مدير</option>
                      <option value="trainer">مدرب</option>
                      <option value="trainee">مشارك</option>
                      <option value="coach">مرافق</option>
                      <option value="assistant">مساعد</option>
                    </select>
                  </td>

                  <td style={styles.td}>
                    <select
                      value={a.isPresent ? 'true' : 'false'}
                      onChange={e => changeField(a._id, 'isPresent', e.target.value === 'true')}
                      style={styles.select}
                    >
                      <option value="true">حاضر</option>
                      <option value="false">غير حاضر</option>
                    </select>
                  </td>

                  <td style={styles.td}>
                    <button onClick={() => saveAffectation(a)} style={styles.actionBtnPrimary}>
                      حفظ
                    </button>

                    <button onClick={() => deleteAffectation(a)} style={styles.actionBtnGhost}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}

              {affectations.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 10, textAlign: 'center', opacity: 0.7 }}>
                    لا توجد تعيينات لهذا العضو.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 1400 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937' },
  redLine: { height: 3, background: RED, borderRadius: 2, marginTop: 8, marginBottom: 8, width: '100%', maxWidth: 1400 },
  circleRedBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    background: 'transparent',
    border: `3px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: 28,
  },
  card: {
    background: '#fff',
    border: '1px solid #e9edf3',
    borderRadius: 18,
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: 16,
    display: 'grid',
    gap: 10,
    width: '100%',
    maxWidth: 1400,
    marginTop: 8,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { borderBottom: '1px solid #e5e7eb', padding: 6, textAlign: 'right', background: '#f3f4f6', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: 6, textAlign: 'right', whiteSpace: 'nowrap' },
  select: { border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 10px', fontSize: 13 },
  actionBtnPrimary: {
    marginInline: 4,
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: RED,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  actionBtnGhost: {
    marginInline: 4,
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontWeight: 700,
  },
};