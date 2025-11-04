import React from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
const RED = '#e20514';

export default function ForgotPwd(): React.JSX.Element {
  const nav = useNavigate();
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [msg, setMsg] = React.useState<string|null>(null);
  const [err, setErr] = React.useState<string|null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);

    const em = email.trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr('الرجاء إدخال بريد إلكتروني صحيح');
      return;
    }

    try {
      setSending(true);
      // Toujours 200 côté API (anti-énumération). On ne révèle pas si l’email existe.
      await fetch(`${API_BASE}/auth/forgot`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email: em }),
      });
      setMsg('إذا كان البريد موجودًا لدينا، سيتم إرسال رابط إعادة التعيين.');
    } catch (e:any) {
      // Même message neutre
      setMsg('إذا كان البريد موجودًا لدينا، سيتم إرسال رابط إعادة التعيين.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div dir="rtl" style={{ width:'70vw', margin:'0 auto', paddingInline:24 }}>
      <h1 style={{ fontSize:24, fontWeight:800, color:'#1f2937', margin:'12px 0 18px' }}>نسيت كلمة السر</h1>

      <form onSubmit={onSubmit} style={{ display:'grid', gap:10, background:'#fff', border:'1px solid #e9edf3', borderRadius:18, padding:16 }}>
        <label style={{ fontWeight:700 }}>البريد الإلكتروني</label>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          disabled={sending}
          style={{ border:'2px solid #f5c0c6', borderRadius:14, padding:'12px 14px', fontSize:16, outline:'none' }}
        />

        {err && <div style={{ color:'#b91c1c' }}>❌ {err}</div>}
        {msg && <div style={{ color:'#059669' }}>✅ {msg}</div>}

        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button type="submit" disabled={sending}
            style={{ padding:'10px 16px', borderRadius:999, border:`2px solid ${RED}`, background:RED, color:'#fff', fontWeight:800 }}>
            {sending ? '... جاري الإرسال' : 'إرسال الرابط'}
          </button>
          <button type="button" onClick={()=>nav('')}
            style={{ padding:'10px 16px', borderRadius:999, border:`2px solid ${RED}`, background:'transparent', color:RED, fontWeight:800 }}>
            العودة لتسجيل الدخول
          </button>
        </div>
      </form>
    </div>
  );
}
