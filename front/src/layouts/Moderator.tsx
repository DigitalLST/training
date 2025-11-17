import { Outlet ,useNavigate} from 'react-router-dom'
import Header from '../moderator/components/Header'
import Footer from '../moderator/components/Footer'
import { useAuth } from '../contexts/UseAuth'



export default function ModeratorLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
    const onLogout = async () => {
    try { await logout(); } finally {
      navigate('/acceuil', { replace: true });
      // en cas de state coincé : window.location.replace('/acceuil');
    }
  };

  if (loading) {
    return <p>Chargement...</p>;
  }

  if (!user) {
    return <p>Vous n’êtes pas connecté.</p>;
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <div className="container">
        <Header userName={user.email} onLogout={onLogout} />
      </div>

      <main className="core" style={{ flex:1 }}>
        <Outlet />
      </main>

      <div className="container">
        <Footer version="v0.1.0" />
      </div>
    </div>
  )
}
