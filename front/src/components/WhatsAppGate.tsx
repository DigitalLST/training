import React from 'react';
import { api, ApiError } from '../api/api';
import { useAuth } from '../contexts/UseAuth';
import WhatsAppPhoneFields from './WhatsAppPhoneFields';

export default function WhatsAppGate({ children }: { children: React.ReactNode }) {
  const { token, user, loading, refreshMe} = useAuth();
  const [countryCode, setCountryCode] = React.useState('+216');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const missing = Boolean(token && user && (user.requiresWhatsApp === true || !user.whatsapp));

  React.useEffect(() => {
    if (!missing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [missing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const digits = phoneNumber.replace(/\D/g, '');

if (!digits) {
  setError('رقم واتساب إجباري');
  return;
}

if (countryCode === '+216' && !/^\d{8}$/.test(digits)) {
  setError('رقم الهاتف التونسي يجب أن يتكون من 8 أرقام');
  return;
}

if (
  countryCode === '+33' &&
  !/^(?:0?[1-9]\d{8})$/.test(digits)
) {
  setError('رقم الهاتف الفرنسي غير صالح');
  return;
}

if (countryCode !== '+216' && countryCode !== '+33' &&
    !/^\d{6,14}$/.test(digits)) {
  setError('يرجى إدخال رقم واتساب صالح.');
  return;
}
    if (!/^\d{6,14}$/.test(digits)) { setError('يرجى إدخال رقم واتساب صالح.'); return; }
    setSaving(true);
    try {
      await api('/users/me/whatsapp', { method: 'PATCH', body: JSON.stringify({ countryCode, phoneNumber }) });
      await refreshMe();
      setPhoneNumber('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WHATSAPP_TAKEN') setError('رقم واتساب هذا مستخدم بالفعل في حساب آخر. يرجى إدخال رقم آخر.');
      else setError(err instanceof Error ? err.message : 'تعذر حفظ الرقم. حاول مرة أخرى.');
    } finally { setSaving(false); }
  }

  if (loading && token && !user) return <div dir="rtl" style={{ padding: 30, textAlign: 'center' }}>جارٍ تحميل الحساب...</div>;
  return <>
    {!missing && children}
    {missing && <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgba(5,20,31,.75)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-title" dir="rtl"
        style={{ width: '100%', maxWidth: 440, boxSizing: 'border-box', borderRadius: 18, padding: 26, background: '#fff', boxShadow: '0 18px 60px rgba(0,0,0,.25)', display: 'grid', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 id="whatsapp-title" style={{ margin: '0 0 10px', fontSize: 21, color: '#111827' }}>تأكيد رقم واتساب</h2>
          <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.8 }}>لاستعمال المنظومة الرقمية للتدريب، يجب تسجيل رقم واتساب الخاص بك أولاً.</p>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <WhatsAppPhoneFields countryCode={countryCode} phoneNumber={phoneNumber} onCountryCodeChange={setCountryCode} onPhoneNumberChange={setPhoneNumber} disabled={saving} />
          {error && <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 10, fontSize: 14 }}>{error}</div>}
          <button disabled={saving} type="submit" style={{ border: 0, borderRadius: 999, padding: 13, background: '#e20514', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'جارٍ الحفظ...' : 'تأكيد الرقم والمتابعة'}</button>
        </form>
        <p style={{ fontSize: 12, textAlign: 'center', color: '#6b7280', margin: 0 }}>لن تتمكن من استعمال المنظومة قبل تسجيل الرقم.</p>
      </section>
    </div>}
  </>;
}
