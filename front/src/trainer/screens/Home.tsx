// src/screens/trainer/Home.tsx (par ex.)
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/UseAuth';
import {
  isSessionDirector,
  isSessionCoach,
} from '../../utils/role';

type Visibility = 'allExceptCoach' | 'coachOnly' | 'directorOnly' | undefined;

type Card = {
  label: string;
  to: string;
  visibleFor?: Visibility;
};

const CARDS: Card[] = [
  { label: 'قائمة المتدربين',   to: '/trainer/infostrainee',    visibleFor: 'allExceptCoach' },
  { label: 'تقييم المتدربين',   to: '/trainer/evaluationtrainee', visibleFor: 'allExceptCoach' },
  { label: 'النتائج النهائية', to: '/trainer/resultattrainee',  visibleFor: 'allExceptCoach' },
  { label: 'تقرير قائد الدورة', to: '/trainer/directorreport',  visibleFor: 'directorOnly' },
  { label: 'تقرير المرشد الفني', to: '/trainer/coachreport',    visibleFor: 'coachOnly' },
];

export default function Home(): React.JSX.Element {
  const { user } = useAuth();

  const isDirector = isSessionDirector(user);
  const isCoach = isSessionCoach(user);
  // (assistant / trainer dispos si tu veux affiner encore plus tard)

  const canSeeCard = (card: Card): boolean => {
    if (!user) return false; // par sécurité

    switch (card.visibleFor) {
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

  const visibleCards = CARDS.filter(canSeeCard);

  return (
    <div style={styles.grid}>
      {visibleCards.map((c) => (
        <Link key={c.to} to={c.to} style={styles.link}>
          <div style={styles.card}>
            <div style={styles.title}>{c.label}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Styles */

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
    width: 320,
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
    opacity: 0.85,
  },
};
