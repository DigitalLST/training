// src/layouts/Main.tsx  (extension .tsx)
import React, { type CSSProperties } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth';
import {
  isAdmin,
  canAccessModeratorNational,
  canAccessModeratorRegional,
  canAccessDirectorSpace,
} from '../utils/role';

const RED1 = '#e20514';
const RED2 = '#b80d1d';

//const asBool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

export default function MainLayout(): React.JSX.Element {
  const { user, logout } = useAuth();
  const nav = useNavigate();


  const onLogout = () => { logout(); nav('/', { replace: true }); };

  return (
    // ⚠️ pas de dir="rtl" ici pour ne pas inverser la grille
    <div style={styles.shell}>
      {/* zone gauche (blanche) */}
      <main style={{ ...styles.main }} dir="rtl">
        <div style={styles.logoHeader}>
          <img src="/logo.png" alt="logo" style={{ height: 80, objectFit: 'contain' }} />
        </div>
        <div style={styles.pageContent}>
          <Outlet />
        </div>
      </main>

      {/* panneau droit (rouge) */}
      <aside style={{ ...styles.sidebar }} dir="rtl">
        <div style={styles.userCard}>
          <div style={{ display:'flex', alignItems:'center', gap:10, fontWeight:700 }}>
            <div style={{ color: '#fff' }}><UserIcon size={20} /></div>
            <span>{user ? `${user.prenom} ${user.nom}` : '—'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, fontWeight:700 }}>
            <div style={{ color: '#fff' }}><MailIcon size={20} /></div>
            <span> {user?.email || '—'}</span>
          </div>
        </div>

        <div style={styles.hr}/>

        <nav style={styles.menu}>
          <MenuLink to="/acceuil">الرئيسية</MenuLink>
          <MenuLink to="/parcours">مساري التدريبي</MenuLink>
          <MenuLink to="/participation">طلب المشاركة في دورة تدريبية</MenuLink>
          {canAccessModeratorNational(user) && (
            <>
              <MenuLink to="/moderator">فضاء إدارة التدريب</MenuLink>
            </>
            )}
            {canAccessDirectorSpace(user) && (
            <>
              <MenuLink to="/trainer">فضاء قائد الدورة</MenuLink>
            </>
            )}
            {isAdmin(user) && (
            <>
              <MenuLink to='/admin'>فضاء اللجنة الوطنية </MenuLink>
            </>
            )}
            {canAccessModeratorRegional(user) && (
                        <>
              <MenuLink to='/moderatorregion'>فضاء اللجنة الجهوية </MenuLink>
            </>
            )}

          <MenuLink to="/contact_us">إتصل بنا</MenuLink>
        </nav>

        <div style={{ marginTop:'auto' }}>
          <button onClick={onLogout} style={styles.logoutBtn}>تسجيل الخروج</button>
        </div>
      </aside>
    </div>
  );
}

function MenuLink(props: React.ComponentProps<typeof NavLink>) {
  return (
    <NavLink
      {...props}
      style={({ isActive }) => ({
        ...styles.menuItem,
        background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
        fontWeight: isActive ? 800 : 600,
      })}
    />
  );
}
function UserIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"   // ← inherits from parent color
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a8.5 8.5 0 0 1 13 0" />
    </svg>
  );
}
function MailIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16v12H4z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}
const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight:'100vh',
    display:'grid',
    // 👉 on force l’ordre: main (gauche) | aside (droite)
    gridTemplateAreas: '"main aside"',
    gridTemplateColumns: '1fr 340px',
    background:'#fff',
    direction: 'ltr', // sécurité : la grille reste LTR
  },
  main: {
    gridArea: 'main',
    background:'#fff',
    display:'grid',
    gridTemplateRows:'auto 1fr',
  },
  logoHeader: {
    display:'grid',
    placeItems:'center',
    padding:'18px 12px',
  },
  pageContent: { padding:'12px 18px 32px' },

  sidebar: {
    gridArea: 'aside',
    background:`linear-gradient(180deg, ${RED1} 0%, ${RED2} 100%)`,
    color:'#fff',
    display:'flex',
    flexDirection:'column',
    padding:'14px 16px',
    gap:12,
    borderTopLeftRadius:22,
    borderBottomLeftRadius:22,
  },
  userCard: {
    background:'rgba(255,255,255,0.12)',
    border:'0px solid rgba(255,255,255,0.18)',
    padding:12,
    borderRadius:14,
    display:'grid',
    gap:6,
  },
  userLine: { opacity:.95, fontSize:14 },
  hr: { height:1, background:'rgba(255,255,255,0.35)', margin:'8px 0' },
  menu: { display:'grid', gap:6 },
  menuSectionTitle: { marginTop:10, marginBottom:4, opacity:.9, fontSize:13, fontWeight:800 },
  menuItem: {
    color:'#fff',
    textDecoration:'none',
    padding:'10px 12px',
    borderRadius:12,
    border:'0px solid rgba(255,255,255,0.22)',
    display:'block',
  },
  logoutBtn: {
    width:'100%',
    padding:'10px 14px',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,0.7)',
    background:'transparent',
    color:'#fff',
    fontWeight:800,
    cursor:'pointer',
  },
  
};
