// src/screens/GestionUsers.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../contexts/UseAuth';

const RED = '#e20514';

type UserRow = {
  _id: string;
  prenom: string;
  nom: string;
  email: string;
  idScout: string;
  niveau?: string;
  region?: string;
};

export default function GestionUsers(): React.JSX.Element {
  const nav = useNavigate();
  const { user: me } = useAuth();
  const myId = me?._id;

  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // recherche
  const [q, setQ] = React.useState('');

  // édition
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<Partial<UserRow>>({});

  /* --------- chargement liste users --------- */
  const loadUsers = React.useCallback(async () => {
    try {
      setErr(null);
      const list: UserRow[] = await api('/users'); // GET /api/users
      setUsers(list || []);
    } catch (e: any) {
      setErr(e?.message || 'تعذر تحميل قائمة الأعضاء');
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /* --------- filtrage client-side --------- */
  const filteredUsers = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;

    return users.filter(u => {
      const haystack =
        (u.prenom || '') + ' ' +
        (u.nom || '') + ' ' +
        (u.email || '') + ' ' +
        (u.idScout || '') + ' ' +
        (u.niveau || '') + ' ' +
        (u.region || '');
      return haystack.toLowerCase().includes(term);
    });
  }, [users, q]);

  /* --------- helper mise à jour form édition --------- */
  function onEditChange<K extends keyof UserRow>(field: K, value: UserRow[K]) {
    setEditForm(prev => ({
      ...prev,
      [field]: value,
    }));
  }

  /* --------- lancer édition --------- */
  function startEdit(u: UserRow) {
    setEditingId(u._id);
    setEditForm({ ...u });
    setOk(null);
    setErr(null);
  }

  /* --------- annuler édition --------- */
  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  /* --------- sauvegarder édition --------- */
  async function saveEdit(u: UserRow) {
    if (!editingId || editingId !== u._id) return;

    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      const payload: Partial<UserRow> = {
        prenom: editForm.prenom ?? u.prenom,
        nom: editForm.nom ?? u.nom,
        email: editForm.email ?? u.email,
        idScout: editForm.idScout ?? u.idScout,
        niveau: editForm.niveau ?? u.niveau,
        region: editForm.region ?? u.region,
      };

      await api(`/users/${u._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      // mettre à jour la liste locale
      setUsers(prev =>
        prev.map(row =>
          row._id === u._id ? { ...row, ...payload } : row
        )
      );

      setOk('تم حفظ بيانات العضو');
      cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'تعذر حفظ بيانات العضو');
    } finally {
      setLoading(false);
    }
  }

  /* --------- supprimer user --------- */
  async function deleteUser(u: UserRow) {
    if (u._id === myId) {
      setErr('لا يمكنك حذف حسابك الشخصي من هنا.');
      return;
    }
    const confirm = window.confirm(
      `هل تريد فعلاً حذف العضو ${u.prenom} ${u.nom} ؟`
    );
    if (!confirm) return;

    try {
      setLoading(true);
      setErr(null);
      setOk(null);

      await api(`/users/${u._id}`, { method: 'DELETE' });

      setUsers(prev => prev.filter(row => row._id !== u._id));
      setOk('تم حذف العضو');
    } catch (e: any) {
      setErr(e?.message || 'تعذر حذف العضو');
    } finally {
      setLoading(false);
    }
  }

  /* --------- aller vers écran modification résultats --------- */
  function goToUpdateEval(u: UserRow) {
    nav('/admin/updateeval', { state: { userId: u._id,nom:u.nom,prenom:u.prenom } });
  }

  return (
    <div dir="rtl" style={{ width: '90vw', marginInline: 20, paddingInline: 24 }}>
      {/* topbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={() => nav('/admin/')}
            style={styles.circleRedBtn}
            aria-label="رجوع"
          >
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>إدارة الأعضاء</span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      <div style={styles.form}>
        {/* Zone de recherche */}
        <div style={styles.field}>
          <label style={styles.label}>ابحث عن العضو</label>
          <input
            type="text"
            placeholder=" البريد / المعرف الكشفي / الاسم / اللقب / الجهة / المستوى"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Table des users */}
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الاسم</th>
                <th style={styles.th}>اللقب</th>
                <th style={styles.th}>البريد الإلكتروني</th>
                <th style={styles.th}>المعرف الكشفي</th>
                <th style={styles.th}>المستوى التدريبي</th>
                <th style={styles.th}>الجهة</th>
                <th style={styles.th}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isEditing = editingId === u._id;
                const rowVal = (field: keyof UserRow) =>
                  (isEditing ? (editForm[field] as any) : u[field]) ?? '';

                return (
                  <tr key={u._id} style={styles.tr}>
                    {/* prénom */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="text"
                          style={styles.cellInput}
                          value={rowVal('prenom')}
                          onChange={e => onEditChange('prenom', e.target.value)}
                        />
                      ) : (
                        <span>{u.prenom}</span>
                      )}
                    </td>

                    {/* nom */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="text"
                          style={styles.cellInput}
                          value={rowVal('nom')}
                          onChange={e => onEditChange('nom', e.target.value)}
                        />
                      ) : (
                        <span>{u.nom}</span>
                      )}
                    </td>

                    {/* email */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="email"
                          style={styles.cellInput}
                          value={rowVal('email')}
                          onChange={e => onEditChange('email', e.target.value)}
                        />
                      ) : (
                        <span>{u.email}</span>
                      )}
                    </td>

                    {/* idScout */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="text"
                          style={styles.cellInput}
                          value={rowVal('idScout')}
                          onChange={e => onEditChange('idScout', e.target.value)}
                        />
                      ) : (
                        <span>{u.idScout}</span>
                      )}
                    </td>

                    {/* niveau */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="text"
                          style={styles.cellInput}
                          value={rowVal('niveau')}
                          onChange={e => onEditChange('niveau', e.target.value)}
                        />
                      ) : (
                        <span>{u.niveau || '—'}</span>
                      )}
                    </td>

                    {/* région */}
                    <td style={styles.td}>
                      {isEditing ? (
                        <input
                          type="text"
                          style={styles.cellInput}
                          value={rowVal('region')}
                          onChange={e => onEditChange('region', e.target.value)}
                        />
                      ) : (
                        <span>{u.region || '—'}</span>
                      )}
                    </td>

                    {/* actions */}
                    <td style={styles.tdActions}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => saveEdit(u)}
                            style={styles.actionBtnPrimary}
                            disabled={loading}
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            style={styles.actionBtnGhost}
                            disabled={loading}
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <IconBtn onClick={() => startEdit(u)} title="تعديل">
                            <EditIcon />
                          </IconBtn>
                          <IconBtn onClick={() => deleteUser(u)} title="حذف">
                            <TrashIcon />
                          </IconBtn>
                          <button
                            type="button"
                            onClick={() => goToUpdateEval(u)}
                            style={styles.resultsBtn}
                          >
                            تعديل النتائج
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 10, textAlign: 'center', opacity: 0.7 }}>
                    لا توجد نتائج مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Messages */}
        {err && <div style={{ color:'#b91c1c', marginTop: 8 }}>❌ {err}</div>}
        {ok &&  <div style={{ color:'#065f46', marginTop: 8 }}>✅ {ok}</div>}

        {/* actions bas */}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => nav('/admin/')}
            style={styles.pillGhost}
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', maxWidth:1400 },
  toolbarRight: { display:'flex', alignItems:'center', gap:10 },
  pageTitle: { fontSize:18, fontWeight:800, color:'#1f2937' },
  redLine: { height:3, background:RED, borderRadius:2, marginTop:8, marginBottom:8, width:'100%', maxWidth:1400 },

  form: {
    background:'#fff',
    border:'1px solid #e9edf3',
    borderRadius:18,
    boxShadow:'0 10px 24px rgba(0,0,0,.05)',
    padding:'18px',
    display:'grid',
    gap:14,
    width:'100%',
    maxWidth:1400
  },
  field: { display:'grid', gap:6, position:'relative' },
  label: { color:'#6b7280', fontSize:14, fontWeight:700 },
  input: {
    border:'1px solid #e5e7eb',
    borderRadius:12,
    padding:'10px 12px',
    fontSize:14,
    outline:'none',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 700,
    direction: 'rtl',
  },
  th: {
    borderBottom: '1px solid #e5e7eb',
    padding: '8px 6px',
    fontSize: 13,
    fontWeight: 800,
    textAlign: 'center',
    background: '#f9fafb',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '8px 6px',
    fontSize: 13,
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  tdActions: {
    padding: '8px 6px',
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  cellInput: {
    width: '100%',
    border:'1px solid #e5e7eb',
    borderRadius:8,
    padding:'4px 6px',
    fontSize:13,
    outline:'none',
  },

  actions: { display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 },

  pillGhost: {
    padding:'8px 14px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:'transparent',
    color:RED,
    cursor:'pointer',
    fontWeight:700,
    fontSize:14,
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
    cursor: 'pointer'
  },

  actionBtnPrimary: {
    padding:'4px 10px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background: RED,
    color:'#fff',
    cursor:'pointer',
    fontWeight:700,
    fontSize:12,
  },
  actionBtnGhost: {
    padding:'4px 10px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:'transparent',
    color:RED,
    cursor:'pointer',
    fontWeight:700,
    fontSize:12,
  },

  resultsBtn: {
    padding:'4px 10px',
    borderRadius:999,
    border:`1px solid ${RED}`,
    background:'transparent',
    color:RED,
    cursor:'pointer',
    fontWeight:700,
    fontSize:12,
    whiteSpace: 'nowrap',
  },
};

/* --- icônes --- */
function ArrowRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
      }}
    />
  );
}
function TrashIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <path
        d="M3 6h18M8 6v-2h8v2M6 6l1 14h10l1-14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <path
        d="M4 15l6-6 4 4-6 6H4v-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 7l2-2 3 3-2 2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
