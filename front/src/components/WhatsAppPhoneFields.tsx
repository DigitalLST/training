import React from 'react';
type Props = { countryCode: string; phoneNumber: string;
  onCountryCodeChange: (value: string) => void; onPhoneNumberChange: (value: string) => void; disabled?: boolean };
const countries = [
  ['+216', '🇹🇳 تونس (+216)'], ['+33', '🇫🇷 فرنسا (+33)'],
  ['+213', '🇩🇿 الجزائر (+213)'], ['+212', '🇲🇦 المغرب (+212)'],
  ['+218', '🇱🇾 ليبيا (+218)'], ['+32', '🇧🇪 بلجيكا (+32)'],
  ['+49', '🇩🇪 ألمانيا (+49)'], ['+39', '🇮🇹 إيطاليا (+39)'],
  ['+44', '🇬🇧 بريطانيا (+44)'], ['+1', '🇺🇸 أمريكا / كندا (+1)'],
  ['+966', '🇸🇦 السعودية (+966)'], ['+971', '🇦🇪 الإمارات (+971)'],
  ['+974', '🇶🇦 قطر (+974)'], ['+41', '🇨🇭 سويسرا (+41)'],
];
const field: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 10, padding: '11px 12px', fontSize: 15, width: '100%', boxSizing: 'border-box', background: '#fff' };
export default function WhatsAppPhoneFields({ countryCode, phoneNumber, onCountryCodeChange, onPhoneNumberChange, disabled }: Props) {
  return <div dir="rtl" style={{ display: 'grid', gap: 7, width: '100%' }}>
    <label style={{ color: '#374151', fontWeight: 700, fontSize: 14 }}>رقم واتساب <span style={{ color: '#e20514' }}>*</span></label>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(0, 1.4fr)', gap: 8 }}>
      <select dir="ltr" aria-label="رمز البلد" value={countryCode} disabled={disabled} onChange={e => onCountryCodeChange(e.target.value)} style={field}>
        {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <input aria-label="رقم واتساب" type="tel" inputMode="tel" autoComplete="tel-national" required disabled={disabled}
        value={phoneNumber} onChange={e => onPhoneNumberChange(e.target.value)} placeholder="رقم الهاتف" dir="ltr" style={{ ...field, textAlign: 'left' }} />
    </div>
    <small style={{ color: '#6b7280' }}>يرجى إدخال رقم واتساب صالح. رمز البلد قابل للتغيير.</small>
  </div>;
}
