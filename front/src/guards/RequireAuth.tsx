
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth';
export default function RequireAuth({ section }: { section?: 'admin' | 'moderator' | 'superadmin' }) {
  const { user, token, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!token || !user) return <Navigate to="/" replace state={{ from: location }} />;
  // Pendant la complétion du profil, WhatsAppGate reste seul visible.
  if (user.requiresWhatsApp || !user.whatsapp) return <Outlet />;
  if (section === 'admin' && user.role !== 'admin') return <Navigate to="/acceuil" replace />;
  if (section === 'moderator' && user.role !== 'moderator') return <Navigate to="/acceuil" replace />;
  if (section === 'superadmin' && !(user as typeof user & { isSuperAdmin?: boolean }).isSuperAdmin) return <Navigate to="/acceuil" replace />;
  return <Outlet />;
}
