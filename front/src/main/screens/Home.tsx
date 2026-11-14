import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/UseAuth'

const RED = '#e20514'
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api'

export default function PublicHome(): React.JSX.Element {
  const nav = useNavigate()
  const [tab, setTab] = React.useState<'login'|'register'>('login')
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const { login,setSession, refreshMe  } = useAuth();

  // login
  const [loginId, setLoginId] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPwd, setShowPwd] = React.useState(false)
  /*const [showPwd2, setShowPwd2] = React.useState(false)*/

  // register
  const [firstName, setFirstName] = React.useState('')
  const [lastName,  setLastName]  = React.useState('')
  const [email,     setEmail]     = React.useState('')
  const [scoutId,   setScoutId]   = React.useState('')
  const [role,      setRole]      = React.useState('')
  const [region,      setRegion]      = React.useState('')
  const [pwd1,      setPwd1]      = React.useState('')
  const [pwd2,      setPwd2]      = React.useState('')


async function onLogin(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setErr(null);
  if (!loginId.trim() || !password) { setErr('Email et mot de passe requis'); return; }

  try {
    setLoading(true);
    await login(loginId.trim(), password);   // ← via useAuth()
    nav('/acceuil', { replace: true });
  } catch (e: any) {
    setErr(e?.message || 'Échec de connexion');
  } finally {
    setLoading(false);
  }
}

async function onRegister(e: React.FormEvent) {
  e.preventDefault();
  setErr(null);

  // validations strictes (alignées backend)
  if (!firstName.trim() || !lastName.trim()) return setErr('الاسم واللقب إجباريان');
  if (!email.trim()) return setErr('البريد الإلكتروني إجباري');
  if (!pwd1) return setErr('كلمة السر إجبارية');
  if (pwd1 !== pwd2) return setErr('تأكيد كلمة السر غير مطابق');

  const sid = (scoutId || '').trim();
  if (!sid) return setErr('رقم الكشاف إجباري');
  if (!/^\d{10}$/.test(sid)) return setErr('رقم الكشاف يجب أن يتكون من 10 أرقام');

  const niv = (role || '').trim();
  if (!niv) return setErr('المستوى التدريبي إجباري');

  const reg = (region || '').trim();
  if (!reg) return setErr('الجهة إجبارية');

  try {
    setLoading(true);

    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        prenom:   firstName.trim(),
        nom:      lastName.trim(),
        email:    email.trim(),
        password: pwd1,
        idScout:  sid,        // requis (10 chiffres)
        region:   reg,        // requis
        niveau:   niv,        // requis (provient de select "role")
      }),
    });

    // Conflit (email/idScout déjà utilisé)
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || 'البريد الإلكتروني أو رقم الكشاف مستخدم مسبقًا');
    }

    // Mauvaise validation (422) ou autre
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      // si backend renvoie details d’express-validator
      if (res.status === 422 && Array.isArray(j?.details) && j.details.length) {
        const firstMsg = j.details[0]?.msg || j.error;
        throw new Error(firstMsg || 'مدخلات غير صحيحة');
      }
      throw new Error(j?.error || `HTTP ${res.status}`);
    }

    const data = await res.json(); // { token, user }
    setSession(String(data.token || ''), data.user);
    await refreshMe();
    nav('/acceuil', { replace: true });

   
    const token = String(data?.token || '');
    if (!token) throw new Error('فشل إنشاء الجلسة');

    nav('/acceuil'); // ajuste la route si besoin
  } catch (err: any) {
    setErr(err?.message || 'تعذر إنشاء الحساب');
  } finally {
    setLoading(false);
  }
}


  
  return (
    // white background + center everything
    <div dir="rtl" style={styles.page}>
      <div style={styles.header}>
        {/* header logos */}
        <div style={{ textAlign:'center', marginBottom: 18 }}>
          <img src="/logo.png" alt="" style={{ height: 120 }}/>
          <div style={styles.brandSub}>المنظومة الرقمية للتدريب  </div>
        </div>

       

        {/* card */}
        <div style={styles.card}>
          <div style={styles.tabs}>
             {/* tabs */}
          <button
            type="button"
            onClick={() => setTab('login')}
            style={pill(tab === 'login')}
          >تسجيل الدخول</button>  
                    <button
            type="button"
            onClick={() => setTab('register')}
            style={pill(tab === 'register')}
          >إنشاء حساب</button>
        </div>
          {tab === 'login' ? (
            <form onSubmit={onLogin} style={{ display:'grid', gap:14 }}>
              <label style={styles.label}>البريد الإلكتروني</label>
              <input
                style={styles.input}
                placeholder="البريد الإلكتروني"
                type="email"
                value={loginId}
                onChange={e=>setLoginId(e.target.value)}
              />
              <div style={styles.field}>
               <label style={styles.label}>كلمة السر</label>
               {/* wrapper relatif */}
               <div style={styles.inputWrap} dir="rtl">
                <input style={{ ...styles.input }} placeholder="كلمة السر" type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}/>
                {/* bouton icône DANS le champ */}
                <button type="button" onClick={() => setShowPwd((s) => !s)} aria-label={showPwd ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} title={showPwd ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'} style={styles.inputIconBtn}>{showPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
               </div>
               {/* lien "oubli" en dessous à gauche */}
               <div style={styles.forgotRow}>
                <button type="button" onClick={() => nav('/forgot')} style={styles.forgotLink}>
                  نسيت كلمة السر؟
                </button>
               </div>
                
              {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}
              {/* actions on ONE line */}
              </div>    
              <div style={styles.actions}>
                <button type="submit" disabled={loading} style={styles.pillPrimary}>
                  {loading ? '... جارٍ الدخول' : 'تسجيل الدخول'}
                </button>
                {<button type="button" onClick={() => nav('/contact_us')} style={styles.forgotLink}>
                  اتصل بنا
                </button>}
              </div>
            </form>
          ) : (
            <form onSubmit={onRegister} style={{ display:'grid', gap:14 }}>
              <div style={{ display:'flex', gap:14 }}>
                <div>
                  <label style={styles.label}>الاسم</label>
                  <input style={styles.input} value={firstName} onChange={e=>setFirstName(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>اللقب</label>
                  <input style={styles.input} value={lastName} onChange={e=>setLastName(e.target.value)} />
                </div>
              </div>
              <div style={{ display:'flex', gap:14 }}>
                <div>
                  <label style={styles.label}>البريد الإلكتروني</label>
                  <input style={styles.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>المعرف الكشفي</label>
                  <input style={styles.input} value={scoutId} onChange={e=>setScoutId(e.target.value)} />
                </div>
              </div> 
              <div style={{ display:'flex', gap:70 }}>
                <div>
                  <label style={styles.label}>المستوى التدريبي</label>
                  <select style={styles.input} value={role} onChange={e=>setRole(e.target.value)}>
                  <option value=""></option>
                  <option value="بدون تدريب">بدون تدريب</option>
                  <option value="إبتدائية">إبتدائية</option>
                  <option value="تمهيدية">تمهيدية</option>
                  <option value="شارة خشبية">شارة خشبية</option>
                  <option value="مساعد قائد تدريب">مساعد قائد تدريب</option>
                  <option value="قائد تدريب">قائد تدريب</option>
                </select>
                </div>
                <div>
                  <label style={styles.label}>الجهة</label>
                  <select style={styles.input} value={region} onChange={e=>setRegion(e.target.value)}>
                    <option value=""></option>
                    <option value="تونس">تونس</option>
                    <option value="اريانة">اريانة</option>
                    <option value="بن عروس">بن عروس</option>
                    <option value="منوبة">منوبة</option>
                    <option value="نابل">نابل</option>
                    <option value="زغوان">زغوان</option>
                    <option value="بنزرت">بنزرت</option>
                    <option value="باجة">باجة</option>
                    <option value="جندوبة">جندوبة</option>
                    <option value="سليانة">سليانة</option>
                    <option value="الكاف">الكاف</option>
                    <option value="سوسة">سوسة</option>
                    <option value="المنستير">المنستير</option>
                    <option value="المهدية">المهدية</option>
                    <option value="القيروان">القيروان</option>
                    <option value="القصرين">القصرين</option>
                    <option value="صفاقس">صفاقس</option>
                    <option value="سيدي بوزيد">سيدي بوزيد</option>
                    <option value="قفصة">قفصة</option>
                    <option value="توزر">توزر</option>
                    <option value="قابس">قابس</option>
                    <option value="قبلي">قبلي</option>
                    <option value="مدنين">مدنين</option>
                    <option value="تطاوين">تطاوين</option>
                    <option value="المهجر">المهجر</option>
                    <option value="وطني">قائد وطني</option>

                </select>
                </div>
              </div> 


              <div style={{ display:'flex', gap:14 }}>
                <div>
                  <label style={styles.label}>كلمة السر</label>
                  <input style={styles.input} type="password" value={pwd1} onChange={e=>setPwd1(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>تأكيد كلمة السر</label>
                  <input style={styles.input} type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)} />
                </div>
              </div>

              {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}

              {/* actions on ONE line */}
              <div style={styles.actions}>
                <button type="submit" disabled={loading} style={styles.pillPrimary}>
                  {loading ? '... جارٍ الإنشاء' : 'إنشاء الحساب'}
                </button>
                <button type="button" onClick={()=>setTab('login')} style={styles.pillPrimary}>عودة</button>
                
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
/*function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} />;
}*/
function EyeIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>); }
function EyeOffIcon() { return (<svg width="26" height="26" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8"/></svg>); }

/* ---------- styles ---------- */
const styles: Record<string, React.CSSProperties> = {
page: {
  minHeight: '100vh',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',     // centre horizontal
  justifyContent: 'flex-start', // colle en haut
  paddingTop: 0,           // espace au-dessus (ajuste 24–64 selon goût)
  paddingBottom: 0,
  gap: 16,
},
 pwdWrap: {
    position:'relative',
    display:'grid',
  },
  inputWrap: {
    position: 'relative',
    width: '100%',
    display:'grid',
    gap:20,
  },
  input: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 16,
    outline: 'none',
    display:'grid'
    // width défini dans le JSX pour forcer 100%
  },
    inputIconBtn: {
    position: 'absolute',
    zIndex:2,
    top: '50%',
    left: 10,                 // icône à GAUCHE du champ (en RTL)
    transform: 'translateY(-50%)',
    width: 32,
    height: 32,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    color: '#9ca3af',
  },

  // "نسيت كلمة السر؟" en dessous à gauche
  forgotRow: {
    marginTop: 6,
    width: '100%',
    textAlign: 'left',        // force l’alignement à gauche
  },
  forgotLink: {
    background: 'transparent',
    border: 0,
    padding: 0,
    color: '#aaababff',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 800,
  },
  header: { display:'grid', justifyItems:'center', gap: 6, marginBottom: 8 },
  logos: { display:'flex', gap:12, alignItems:'center', justifyContent:'center' },
  logo: { width: 200, height: 200, objectFit: 'contain' },
  brandLines: { textAlign:'center' },
  brandTitle: { fontSize:18, fontWeight:800, color:'#020202ff' },
  brandSub: { fontSize:14, color:'#222222ff' },

card: {
  width: '100%', maxWidth: 520,
  background:'#fff', border:'1px solid #e9edf3', borderRadius:18,
  boxShadow:'0 10px 24px rgba(0,0,0,.06)', padding:20,
  marginTop: 8
},

  tabs: {
    display:'flex',
    justifyContent:'center',
    gap: 12,
    marginBottom: 16,
  },

  form: { display:'grid', gap: 12 },
  field: { display:'grid', gap:6 },
  label: { color:'#6b7280', fontSize:14, fontWeight:700 },
  actions: { display:'grid',justifyItems:'center', justifyContent:'center', marginTop: 6,gap:4 },

  pillPrimary: {
    padding:'10px 16px',
    borderRadius: 999,
    border:`1px solid ${RED}`,
    background: RED,
    color:'#fff',
    cursor:'pointer',
    fontWeight:700,
    minWidth: 180,
  },
    pillGhost: {
    padding:'10px 16px',
    borderRadius: 999,
    border:`1px solid ${RED}`,
    background: 'transparent',
    color:'#fff',
    cursor:'pointer',
    fontWeight:700,
    minWidth: 180,
  },
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding:'8px 14px',
    borderRadius: 999,
    border:`1px solid ${RED}`,
    background: active ? RED : 'transparent',
    color: active ? '#fff' : RED,
    cursor:'pointer',
    fontWeight:700,
    minWidth: 140,
  }
}
