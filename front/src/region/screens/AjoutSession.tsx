import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

type SessionType = 'NATIONAL' | 'REGIONAL';

export default function DemandeSession(): React.JSX.Element {
  const nav = useNavigate();

  const [sessionType, setSessionType] = useState<SessionType>('NATIONAL');

  // مشتركة
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // dates مشتركة
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ✅ وطنية: ممكن تختار الاثنين
  const [trainingLevels, setTrainingLevels] = useState<string[]>([]); // ["تمهيدية","شارة خشبية"]
  const [branches, setBranches] = useState<string[]>([]);

  // ✅ جهوية: اختيار واحد
  const [regionalLevel, setRegionalLevel] = useState(''); // S1/S2/S3/الدراسة الابتدائية
  const [directorName, setDirectorName] = useState('');
  const [participantsCount, setParticipantsCount] = useState<string>('');

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  function toggleLevel(level: string) {
    setTrainingLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  }

  function toggleBranch(branch: string) {
    setBranches((prev) => (prev.includes(branch) ? prev.filter((b) => b !== branch) : [...prev, branch]));
  }

  function resetNationalFields() {
    setTrainingLevels([]);
    setBranches([]);
  }

  function resetRegionalFields() {
    setRegionalLevel('');
    setDirectorName('');
    setParticipantsCount('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // validations مشتركة
    if (!title.trim()) return setErr('يرجى إدخال العنوان');
    if (!startDate || !endDate) return setErr('تاريخا البداية والنهاية إجباريان');
    if (new Date(endDate) < new Date(startDate)) return setErr('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');

    try {
      setSubmitting(true);

      // ✅ ALWAYS send to /region-session-requests (RegionSessionRequest)
      // ✅ NEW: use training_levels (array) for both national & regional
      let payload: any = {
        name: title.trim(),
        startDate,
        endDate
      };

      if (sessionType === 'NATIONAL') {
        // لازم يختار تمهيدية و/أو شارة خشبية
        if (trainingLevels.length === 0) return setErr('اختر المستوى التدريبي (تمهيدية و/أو شارة خشبية)');
        if (branches.length === 0) return setErr('اختر القسم الفني');

        payload = {
          ...payload,
          training_levels: trainingLevels, // ✅ 1 request, 1 row in DB
          branches
        };

        const res = await fetch(`${API_BASE}/region-session-requests`, {
          method: 'POST',
          headers,
          cache: 'no-store',
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        nav('/region/demandes');
        return;
      }

      // sessionType === 'REGIONAL'
      if (!regionalLevel) return setErr('اختر نوع الدورة الجهوية');
      if (!directorName.trim()) return setErr('يرجى إدخال اسم القائد');
      const n = Number(participantsCount);
      if (!Number.isFinite(n) || n <= 0) return setErr('العدد المتوقع للمشاركين يجب أن يكون رقمًا أكبر من 0');

      payload = {
        ...payload,
        training_levels: [regionalLevel], // ✅ 1 element array
        director_name: directorName.trim(),
        participants_count: n
        // branches not needed for regional (backend will force [])
      };

      const res = await fetch(`${API_BASE}/region-session-requests`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      nav('/region/demandes');
    } catch (e: any) {
      setErr(e.message || 'تعذر الإضافة');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" style={{ display: 'grid', gap: 16 }}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarRight}>
          <button onClick={() => nav(-1)} style={styles.circleRedBtn} aria-label="رجوع">
            <ArrowRightIcon />
          </button>
          <span style={styles.pageTitle}>طلب إضافة دورة</span>
        </div>
        <div style={{ width: 46, height: 46 }} />
      </div>

      <div style={styles.redLine} />

      <form onSubmit={onSubmit} style={styles.form} noValidate>
        {/* نوع الدورة */}
        <div style={styles.field}>
          <label style={styles.label}>
            نوع الدورة <span style={{ color: RED }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="sessionType"
                checked={sessionType === 'NATIONAL'}
                onChange={() => {
                  setSessionType('NATIONAL');
                  resetRegionalFields();
                }}
              />
              <span>دورة وطنية</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="sessionType"
                checked={sessionType === 'REGIONAL'}
                onChange={() => {
                  setSessionType('REGIONAL');
                  resetNationalFields();
                }}
              />
              <span>دورة جهوية</span>
            </label>
          </div>
        </div>

        {/* العنوان */}
        <div style={styles.field}>
          <label style={styles.label}>
            العنوان <span style={{ color: RED }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان الدورة"
            style={styles.input}
            required
          />
        </div>

        {/* dates */}
        <div style={styles.row2}>
          <div style={styles.field}>
            <label style={styles.label}>
              تاريخ البداية <span style={{ color: RED }}>*</span>
            </label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>
              تاريخ النهاية <span style={{ color: RED }}>*</span>
            </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} required />
          </div>
        </div>

        {/* ======== وطنية ======== */}
        {sessionType === 'NATIONAL' && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>
                المستوى التدريبي <span style={{ color: RED }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={trainingLevels.includes('شارة خشبية')}
                    onChange={() => toggleLevel('شارة خشبية')}
                  />
                  <span>شارة خشبية</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={trainingLevels.includes('تمهيدية')}
                    onChange={() => toggleLevel('تمهيدية')}
                  />
                  <span>تمهيدية</span>
                </label>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                القسم الفني <span style={{ color: RED }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {['جوالة', 'دليلات', 'كشافة', 'مرشدات', 'أشبال', 'زهرات', 'عصافير', 'رواد'].map((b) => (
                  <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={branches.includes(b)} onChange={() => toggleBranch(b)} />
                    <span>{b}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ======== جهوية ======== */}
        {sessionType === 'REGIONAL' && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>
                نوع الدورة الجهوية <span style={{ color: RED }}>*</span>
              </label>
              <select value={regionalLevel} onChange={(e) => setRegionalLevel(e.target.value)} style={styles.input}>
                <option value="">-- اختر --</option>
                <option value="S1">S1</option>
                <option value="S2">S2</option>
                <option value="S3">S3</option>
                <option value="الدراسة الابتدائية">الدراسة الابتدائية</option>
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                اسم القائد <span style={{ color: RED }}>*</span>
              </label>
              <input
                type="text"
                value={directorName}
                onChange={(e) => setDirectorName(e.target.value)}
                placeholder="قائدها"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                العدد المتوقع للمشاركين <span style={{ color: RED }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                value={participantsCount}
                onChange={(e) => setParticipantsCount(e.target.value)}
                placeholder="مثال: 24"
                style={styles.input}
              />
            </div>
          </>
        )}

        {err && <div style={{ color: '#b91c1c', marginTop: 4 }}>❌ {err}</div>}

        <div style={styles.actions}>
          <button type="button" onClick={() => nav(-1)} style={styles.pillGhost}>
            إلغاء
          </button>
          <button type="submit" disabled={submitting} style={styles.pillPrimary}>
            {submitting ? '... جارٍ الحفظ' : 'إضافة'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------- styles --------- */
const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 18, fontWeight: 800, color: '#1f2937' },
  redLine: { height: 3, background: RED, borderRadius: 2, marginTop: 8, marginBottom: 8 },

  form: {
    background: '#fff',
    border: '1px solid #e9edf3',
    borderRadius: 18,
    boxShadow: '0 10px 24px rgba(0,0,0,.05)',
    padding: '18px',
    display: 'grid',
    gap: 14,
    maxWidth: 720
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'grid', gap: 6 },
  label: { color: '#6b7280', fontSize: 14 },
  input: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 16,
    outline: 'none'
  },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },

  pillPrimary: {
    padding: '10px 16px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: RED,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700
  },
  pillGhost: {
    padding: '10px 16px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    fontWeight: 700
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
  }
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
