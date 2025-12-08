// src/components/trainer/Header.tsx (par ex.)
import React from 'react';
import { NavLink, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '../../contexts/UseAuth';
import {
  isSessionDirector,
  isSessionCoach,
} from '../../utils/role';

type HeaderProps = {
  userName?: string;          // ex: "digital digital - Tunis"
  onLogout?: () => void;      // callback au clic sur "تسجيل الخروج"
};

type Visibility = 'allExceptCoach' | 'coachOnly' | 'directorOnly' | undefined;

type MenuItem = {
  label: string;
  to: string;
  activeFor?: string[];
  visibleFor?: Visibility;
};

const MENU: MenuItem[] = [
  {
    label: 'الرئيسية',
    to: '/acceuil',
  },
  {
    label: 'قائمة المتدربين',
    to: '/trainer/infostrainee',
    activeFor: ['/trainer/infostrainee'],
    visibleFor: 'allExceptCoach',
  },
  {
    label: 'تقييم المتدربين',
    to: '/trainer/evaluationtrainee',
    activeFor: ['/trainer/evaluationtrainee', '/admin/evaluation'],
    visibleFor: 'allExceptCoach',
  },
  {
    label: 'النتائج النهائية',
    to: '/trainer/resultattrainee',
    activeFor: ['/trainer/resultattrainee'],
    visibleFor: 'allExceptCoach',
  },
  {
    label: 'تقرير قائد الدورة',
    to: '/trainer/directorreport',
    activeFor: ['/trainer/directorreport'],
    visibleFor: 'directorOnly',
  },
  {
    label: 'تقرير المرشد الفني',
    to: '/trainer/coachreport',
    activeFor: ['/trainer/coachreport'],
    visibleFor: 'coachOnly',
  },
];

export default function Header({
  userName = 'مستخدم',
  onLogout,
}: HeaderProps): React.JSX.Element {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const at = pathname.replace(/\/+$/, '') || '/'; // normalize trailing slash

  const isDirector = isSessionDirector(user);
  const isCoach = isSessionCoach(user);
  // (assistant / trainer dispo si tu veux raffiner plus tard)

  const canSeeItem = (item: MenuItem): boolean => {
    if (!user) return false; // zone protégée, par sécurité

    switch (item.visibleFor) {
      case 'coachOnly':
        return isCoach;
      case 'directorOnly':
        return isDirector;
      case 'allExceptCoach':
        return !isCoach;
      default:
        return true;
    }
  };

  const isActive = (item: MenuItem) => {
    // "الرئيسية" = home → exact
    if (item.to === '/acceuil') {
      return !!matchPath({ path: '/acceuil', end: true }, at);
    }
    // Si aliases fournis, match n'importe lequel
    if (item.activeFor?.length) {
      return item.activeFor.some((p) =>
        !!matchPath({ path: p, end: false }, at),
      );
    }
    // Sinon, actif sur la section + ses enfants
    return (
      !!matchPath({ path: item.to, end: false }, at) ||
      !!matchPath({ path: `${item.to}/*`, end: false }, at)
    );
  };

  const visibleMenu = MENU.filter(canSeeItem);

  return (
    <>
      <div style={styles.header}>
        {/* Bloc marque / logos */}
        <div style={styles.brand}>
          <div>
            <img src="/logo.png" alt="" style={styles.logo} />
          </div>
          <div>
            <div style={styles.brand}>الكشافة التونسية</div>
            <div style={styles.brand}>اللجنة الوطنية لتنمية القيادات</div>
          </div>
        </div>

        {/* Navigation (pills) */}
        <nav style={styles.nav}>
          {visibleMenu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/acceuil'}
              style={() => pill(isActive(item))}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Profil + logout */}
        <div style={styles.profile}>
          <div style={styles.avatarOutline} />
          <div>{userName}</div>
          <button onClick={onLogout} style={pill(false)}>
            تسجيل الخروج
          </button>
        </div>
      </div>

      <div style={styles.separator} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '12px 24px',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'rgba(245,246,248,.7)',
    backdropFilter: 'blur(6px)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { height: 50, width: 80 },
  brandSub: { color: '#9ca3af', fontSize: 14 },
  nav: { justifySelf: 'center', display: 'flex', gap: 12, flexWrap: 'wrap' },
  profile: {
    justifySelf: 'end',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    border: '1px solid #e5e7eb',
    background: '#fff',
    padding: '8px 12px',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,.06)',
  },
  avatarOutline: {
    width: 28,
    height: 28,
    border: '2px solid #e20514',
    borderRadius: '50%',
  },
  separator: { height: 1, background: '#e9edf3', margin: '6px 0 24px' },
};

function pill(active: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: 999,
    textDecoration: 'none',
    color: active ? '#fff' : '#e20514',
    background: active ? '#e20514' : 'transparent',
    border: '1px solid #e20514',
    cursor: 'pointer',
  };
}
