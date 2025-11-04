// src/main/screens/Landing.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/UseAuth';

//const asBool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

export default function LandingMain(): React.JSX.Element {
  const {  loading } = useAuth();
  const nav = useNavigate();

  if (loading) return <></>;


  return (
    <div dir="rtl" style={{ display:'grid', gap:24 }}>
      <h1 style={{ textAlign:'center', margin:0, fontSize:28, fontWeight:600 }}>الرئيسية</h1>

      {/* grille 2x2 */}
      <div style={grid}>
        <Card onClick={()=>nav('/participation')}    img="/parcours.png"     title="طلب المشاركة في دورة تدريبية" />
        <Card onClick={()=>nav('/parcours')}    img="/parcours.png"     title="مساري التدريبي" />


  <Card onClick={()=>nav('/moderator')} img="" title="فضاء إدارة التدريب" />

  <Card onClick={()=>nav('/admin')} img="" title="فضاء قائد الدورة" />

  <Card onClick={()=>nav('/superadmin')} img="/national_committee.png" title="فضاء اللجنة الوطنية" />
    <Card onClick={()=>nav('/adminregion')} img="/national_committee.png" title="فضاء اللجنة الجهوية" />

        <Card onClick={()=>nav('/contact_us')}  img="/contact_us.png"  title="إتصل بنا" />
        <Card onClick={()=>nav('/profile')}  img="/account.png"  title="تغيير معطيات الحساب" />
      </div>
    </div>
  );
}

/* --------- petits composants --------- */
function Card({ img, title, onClick }: { img:string; title:string; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={card}>
      <img src={img} alt="" style={{ height:120, objectFit:'contain' }} />
      <div style={{ fontSize:28, color:'#3b3b3b', fontWeight:700 }}>{title}</div>
    </button>
  );
}

/* --------- styles --------- */
const grid: React.CSSProperties = {
  display:'grid',
  gridTemplateColumns:'1fr 1fr',
  gap:28,
};

const card: React.CSSProperties = {
  display:'flex',
  alignItems:'center',
  fontWeight:400,
  fontSize:12,
  padding:'6px 7px',
  background:'#fff',
  border:'1px solid #eef1f5',
  borderRadius:32,
  boxShadow:'0 6px 22px rgba(0,0,0,.08)',
  cursor:'pointer',
};

