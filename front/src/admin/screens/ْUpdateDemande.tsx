// src/screens/AdminUpdateDemandes.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/api';

const RED = '#e20514';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

type ApplicantSnapshot = {
  idScout: string;
  firstName: string;
  lastName: string;
  email: string;
  region: string;
};

type DemandeRow = {
  _id: string;
  sessionTitle?: string;
  trainingLevel: string;
  branche: string;
  statusRegion: Status;
  statusNational: Status;
  applicantSnapshot: ApplicantSnapshot;
};

type LocationState = {
  state?: {
    userId?: string;
    prenom?: string;
    nom?: string;
  };
};

export default function AdminUpdateDemandes(): React.JSX.Element {
  const nav = useNavigate();
  const { state } = useLocation() as LocationState;

  const userId = state?.userId || '';
  const userName = `${state?.prenom || ''} ${state?.nom || ''}`.trim();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [demandes, setDemandes] = React.useState<DemandeRow[]>([]);
  const [openIds, setOpenIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const list: DemandeRow[] = await api(`/admin/demandes/users/${userId}`);
        setDemandes(list || []);
      } catch (e: any) {
        setErr(e?.message || 'تعذّر تحميل مطالب المشاركة');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function toggleDemande(id: string) {
    setOpenIds(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function changeField<K extends keyof DemandeRow>(
    demandeId: string,
    field: K,
    value: DemandeRow[K]
  ) {
    setDemandes(prev =>
      prev.map(d => (d._id === demandeId ? { ...d, [field]: value } : d))
    );
  }

  function changeSnapshotField(
    demandeId: string,
    field: keyof ApplicantSnapshot,
    value: string
  ) {
    setDemandes(prev =>
      prev.map(d =>
        d._id === demandeId
          ? {
              ...d,
              applicantSnapshot: {
                ...d.applicantSnapshot,
                [field]: value,
              },
            }
          : d
      )
    );
  }

  function labelStatus(s: Status) {
    if (s === 'APPROVED') return 'مقبول';
    if (s === 'REJECTED') return 'مرفوض';
    return 'في الانتظار';
  }

  async function saveDemande(d: DemandeRow) {
    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      const updated = await api(`/admin/demandes/${d._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          trainingLevel: d.trainingLevel,
          branche: d.branche,
          statusRegion: d.statusRegion,
          statusNational: d.statusNational,
          applicantSnapshot: d.applicantSnapshot,
        }),
      });

      const updatedDemande = updated?.demande;

      if (updatedDemande) {
        setDemandes(prev =>
          prev.map(row => {
            const syncedSnapshot: ApplicantSnapshot = {
              idScout:
                updatedDemande.applicantSnapshot?.idScout ??
                row.applicantSnapshot.idScout,
              firstName:
                updatedDemande.applicantSnapshot?.firstName ??
                row.applicantSnapshot.firstName,
              lastName:
                updatedDemande.applicantSnapshot?.lastName ??
                row.applicantSnapshot.lastName,
              email:
                updatedDemande.applicantSnapshot?.email ??
                row.applicantSnapshot.email,
              region:
                updatedDemande.applicantSnapshot?.region ??
                row.applicantSnapshot.region,
            };

            if (row._id === d._id) {
              return {
                ...row,
                trainingLevel:
                  updatedDemande.trainingLevel ?? row.trainingLevel,
                branche: updatedDemande.branche ?? row.branche,
                statusRegion:
                  updatedDemande.statusRegion ?? row.statusRegion,
                statusNational:
                  updatedDemande.statusNational ?? row.statusNational,
                applicantSnapshot: syncedSnapshot,
              };
            }

            return {
              ...row,
              applicantSnapshot: syncedSnapshot,
            };
          })
        );
      }

      setOk('تم حفظ مطلب المشاركة وتحيين بيانات العضو في كل المطالب');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حفظ مطلب المشاركة');
    } finally {
      setLoading(false);
    }
  }

  async function deleteDemande(d: DemandeRow) {
    const confirm = window.confirm('هل تريد فعلاً حذف مطلب المشاركة؟');
    if (!confirm) return;

    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      await api(`/admin/demandes/${d._id}`, { method: 'DELETE' });

      setDemandes(prev => prev.filter(x => x._id !== d._id));
      setOk('تم حذف مطلب المشاركة');
    } catch (e: any) {
      setErr(e?.message || 'تعذّر حذف مطلب المشاركة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={() => nav(-1)}
            style={styles.circleRedBtn}
          >
            ‹
          </button>
          <span style={styles.pageTitle}>
            تعديل مطالب المشاركة {userName || `(${userId})`}
          </span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && <div style={{ color: '#6b7280' }}>… جارِ التحميل</div>}
      {err && <div style={{ color: '#b91c1c', marginTop: 8 }}>❌ {err}</div>}
      {ok && <div style={{ color: '#065f46', marginTop: 8 }}>✅ {ok}</div>}

      <div style={styles.mainCard}>
        <div style={{ fontWeight: 800 }}>مطالب المشاركة</div>

        <div style={styles.cardsList}>
          {demandes.map(d => {
            const isOpen = openIds[d._id] ?? false;

            return (
              <div key={d._id} style={styles.demandeCard}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderInfo}>
                    <div style={styles.sessionTitle}>{d.sessionTitle || '—'}</div>

                    <div style={styles.sessionSubtitle}>
                      {d.trainingLevel || '—'} — {d.branche || '—'}
                    </div>

                    <div style={styles.statusLine}>
                      <span>قرار الجهة: {labelStatus(d.statusRegion)}</span>
                      <span>قرار الوطني: {labelStatus(d.statusNational)}</span>
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => toggleDemande(d._id)}
                      style={styles.toggleBtn}
                    >
                      {isOpen ? '▲ إخفاء التفاصيل' : '▼ عرض التفاصيل'}
                    </button>

                    <button
                      type="button"
                      onClick={() => saveDemande(d)}
                      style={styles.actionBtnPrimary}
                      disabled={loading}
                    >
                      حفظ
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteDemande(d)}
                      style={styles.actionBtnGhost}
                      disabled={loading}
                    >
                      حذف
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <>
                    <div style={styles.sectionTitle}>معطيات العضو</div>

                    <div style={styles.grid5}>
                      <Field label="الاسم">
                        <input
                          value={d.applicantSnapshot?.firstName || ''}
                          onChange={e =>
                            changeSnapshotField(d._id, 'firstName', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="اللقب">
                        <input
                          value={d.applicantSnapshot?.lastName || ''}
                          onChange={e =>
                            changeSnapshotField(d._id, 'lastName', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="البريد">
                        <input
                          type="email"
                          value={d.applicantSnapshot?.email || ''}
                          onChange={e =>
                            changeSnapshotField(d._id, 'email', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="المعرف الكشفي">
                        <input
                          value={d.applicantSnapshot?.idScout || ''}
                          onChange={e =>
                            changeSnapshotField(d._id, 'idScout', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="الجهة">
                        <input
                          value={d.applicantSnapshot?.region || ''}
                          onChange={e =>
                            changeSnapshotField(d._id, 'region', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>
                    </div>

                    <div style={styles.sectionTitle}>معطيات مطلب المشاركة</div>

                    <div style={styles.grid4}>
                      <Field label="المستوى">
                        <input
                          value={d.trainingLevel || ''}
                          onChange={e =>
                            changeField(d._id, 'trainingLevel', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="القسم">
                        <input
                          value={d.branche || ''}
                          onChange={e =>
                            changeField(d._id, 'branche', e.target.value)
                          }
                          style={styles.input}
                        />
                      </Field>

                      <Field label="قرار الجهة">
                        <select
                          value={d.statusRegion}
                          onChange={e =>
                            changeField(
                              d._id,
                              'statusRegion',
                              e.target.value as Status
                            )
                          }
                          style={styles.selectFull}
                        >
                          <option value="PENDING">في الانتظار</option>
                          <option value="APPROVED">مقبول</option>
                          <option value="REJECTED">مرفوض</option>
                        </select>
                      </Field>

                      <Field label="قرار الوطني">
                        <select
                          value={d.statusNational}
                          onChange={e =>
                            changeField(
                              d._id,
                              'statusNational',
                              e.target.value as Status
                            )
                          }
                          style={styles.selectFull}
                        >
                          <option value="PENDING">في الانتظار</option>
                          <option value="APPROVED">مقبول</option>
                          <option value="REJECTED">مرفوض</option>
                        </select>
                      </Field>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {demandes.length === 0 && (
            <div style={{ padding: 10, textAlign: 'center', opacity: 0.7 }}>
              لا توجد مطالب مشاركة لهذا العضو.
            </div>
          )}
        </div>

        <div style={styles.note}>
          ملاحظة: تعديل بيانات الاسم / اللقب / البريد / المعرف الكشفي / الجهة
          يحيّن بيانات العضو وكل مطالب المشاركة المرتبطة به. أما المستوى والقسم
          والقرارات فهي خاصة بالمطلب الحالي فقط.
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.fieldBox}>
      <label style={styles.label}>{props.label}</label>
      {props.children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 1400,
  },

  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },

  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#1f2937',
  },

  redLine: {
    height: 3,
    background: RED,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
    maxWidth: 1400,
  },

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

  mainCard: {
    background: '#fff',
    border: '1px solid #e9edf3',
    borderRadius: 18,
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: 16,
    display: 'grid',
    gap: 12,
    width: '100%',
    maxWidth: 1400,
    marginTop: 8,
  },

  cardsList: {
    display: 'grid',
    gap: 12,
  },

  demandeCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 14,
    background: '#f9fafb',
    display: 'grid',
    gap: 10,
  },

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },

  cardHeaderInfo: {
    display: 'grid',
    gap: 3,
    minWidth: 0,
  },

  sessionTitle: {
    fontWeight: 800,
    color: '#1f2937',
    fontSize: 15,
  },

  sessionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },

  statusLine: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 12,
    color: '#4b5563',
  },

  cardActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  toggleBtn: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 12,
  },

  sectionTitle: {
    fontWeight: 800,
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 10,
  },

  grid5: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 8,
  },

  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 8,
  },

  fieldBox: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },

  label: {
    fontSize: 12,
    fontWeight: 700,
    color: '#6b7280',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '7px 9px',
    fontSize: 13,
    outline: 'none',
    background: '#fff',
  },

  selectFull: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '7px 9px',
    fontSize: 13,
    background: '#fff',
  },

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

  note: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.6,
  },
};