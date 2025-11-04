import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

export default function ResetPwd(): React.JSX.Element {
  const nav = useNavigate();
  const params = useParams<{ token?: string }>();
  const [qs] = useSearchParams();
  const token = params.token || qs.get('token') || ''; // supporte /reset/:token ou /reset?token=

  const [p1, setP1] = React.useState('');
  const [p2, setP2] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string|null>(null);
  const [ok, setOk] = React.useState<string|null>(null);

  const isStrong = (s:string) => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);

    if (!token) { setErr('رمز غير صالح'); return; }
    if (p1 !== p2) { setErr('كلمتا السر غير متطابقتين'); return; }
    if (!isStrong(p1)) { setErr('كلمة السر ضعيفة (8 أحرف على الأقل مع أرقام وحروف)'); return; }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/auth/reset`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ token, password: p1 }),
      });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOk('تم تحديث كلمة السر بنجاح ✅');
      setTimeout(()=> nav('/'), 1200);
    } catch (e:any) {
      setErr(e?.message || 'تعذر إتمام العملية. ربما انتهت صلاحية الرابط.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" style={{ width:'70vw', margin:'0 auto', paddingInline:24 }}>
      <h1 style={{ fontSize:24, fontWeight:800, color:'#1f2937', margin:'12px 0 18px' }}>إعادة تعيين كلمة السر</h1>

      <form onSubmit={onSubmit} style={{ display:'grid', gap:10, background:'#fff', border:'1px solid #e9edf3', borderRadius:18, padding:16 }}>
        <label style={{ fontWeight:700 }}>كلمة السر الجديدة</label>
        <div style={{ display:'flex', gap:8 }}>
          <input
            type={show ? 'text' : 'password'}
            value={p1}
            onChange={e=>setP1(e.target.value)}
            placeholder="••••••••"
            disabled={saving}
            style={{ flex:1, border:'2px solid #f5c0c6', borderRadius:14, padding:'12px 14px', fontSize:16, outline:'none' }}
          />
          <button type="button" onClick={()=>setShow(s=>!s)}
            style={{ padding:'10px 14px', borderRadius:12, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>
            {show ? 'إخفاء' : 'إظهار'}
          </button>
        </div>
        <small style={{ color:isStrong(p1)?'#059669':'#b91c1c' }}>
          يجب أن تحتوي على 8 أحرف على الأقل وتتضمن أرقامًا وحروفًا.
        </small>

        <label style={{ fontWeight:700, marginTop:8 }}>تأكيد كلمة السر</label>
        <input
          type={show ? 'text' : 'password'}
          value={p2}
          onChange={e=>setP2(e.target.value)}
          placeholder="••••••••"
          disabled={saving}
          style={{ border:'2px solid #f5c0c6', borderRadius:14, padding:'12px 14px', fontSize:16, outline:'none' }}
        />

        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}
        {ok  && <div style={{ color:'#059669' }}>✅ {ok}</div>}

        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button type="submit" disabled={saving}
            style={{ padding:'10px 16px', borderRadius:999, border:`2px solid ${RED}`, background:RED, color:'#fff', fontWeight:800 }}>
            {saving ? '... جاري الحفظ' : 'تحديث كلمة السر'}
          </button>
          <button type="button" onClick={()=>nav('/')}
            style={{ padding:'10px 16px', borderRadius:999, border:`2px solid ${RED}`, background:'transparent', color:RED, fontWeight:800 }}>
            العودة لتسجيل الدخول
          </button>
        </div>
      </form>
    </div>
  );
}
