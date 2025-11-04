import { Link } from 'react-router-dom';
import React from 'react';

const CARDS = [
  { label: 'إضافة دورة تدريبية',   to: '/moderator/sessions'  },
  { label: 'إضافة مركز تدريب',    to: '/moderator/centres'   },
  { label: 'مطالب الجهات',    to: '/moderator/demanderegion'   },
  { label: 'إدارة معايير التقييم',       to: '/moderator/gestioncriteres' },
];

export default function Home(): React.JSX.Element {
  return (
    
    <div style={styles.grid}>
      {CARDS.map((c) => (
        <Link key={c.to} to={c.to} style={styles.link}>
          <div style={styles.card}>
            <div style={styles.title}>{c.label}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** petit pictogramme “éditer” en bas-gauche (inline SVG, aucune dépendance) */

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'flex',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 48,
    paddingBlock: 16,
  },
  link: {
    textDecoration: 'none',
    color: 'inherit',
  },
  card: {
    position: 'relative',
    background: '#fff',
    borderRadius: 28,
    boxShadow: '0 12px 28px rgba(0,0,0,.06)',
    border: '1px solid #e9edf3',
    minHeight: 500,
    width:320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    textAlign: 'center',
    color: '#374151',
  },
  icon: {
    position: 'absolute',
    left: 18,
    bottom: 16,
    color: '#111827',
    opacity: .85,
  },
};
