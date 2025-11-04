// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import RequireAuth from './guards/RequireAuth';
//import ProtectedSection from './components/ProtectedSection';
import MainLayout from './layouts/Main';
import PublicLayout from './layouts/Public';
import ModeratorLayout from './layouts/Moderator';

import HomeMain from './main/screens/Home';
import LandingMain from './main/screens/Landing';
import Parcour from './main/screens/Parcour';
import UpdateAccount from './main/screens/UpdateAccount';
import ContactUs from './main/screens/Contact';
import ForgotPwd from './main/screens/ForgotPwd';
import ResetPwd from './main/screens/ResetPwd';
import Participation from './main/screens/DemandeParticipation';
import HomeModerator from './moderator/screens/Home';
import AcceuilSessionModerator from './moderator/screens/AcceuilSessions';
import NouvelleSessionModerator from './moderator/screens/NouvelleSession';
import AddSessionModerator from './moderator/screens/AddSession';
import UpdateSessionModerator from './moderator/screens/UpdateSession';
import NouveauCentreModerator from './moderator/screens/NouveauCentre';
import AddCentreModerator from './moderator/screens/AddCentre';
import UpdateCentreModerator from './moderator/screens/UpdateCentre';
import NouveauCritereModerator from './moderator/screens/NouveauCritere';
import ListeCritereModerator from './moderator/screens/ListeCritere';
import AddCritereModerator from './moderator/screens/AddCritere';
import UpdateCritereModerator from './moderator/screens/UpdateCritere';
import NouveauParticipantModerator from './moderator/screens/NouveauParticipant';
import ListeParticipantsModerator from './main/screens/ValidationDemandeNational';

export default function App() {
  return (
    <Routes>
      {/* ---------- Public ---------- */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomeMain />} />
        <Route path="acceuil" element={<LandingMain />} />
      </Route>

      <Route path="acceuil" element={<MainLayout />}>
        <Route index element={<LandingMain />} />
      </Route>

      <Route path="participation" element={<MainLayout />}>
        <Route index element={<Participation />} />
      </Route>

      <Route path="parcours" element={<MainLayout />}>
        <Route index element={<Parcour />} />
      </Route>

      <Route path="profile" element={<MainLayout />}>
        <Route index element={<UpdateAccount />} />
      </Route>

      <Route path="contact_us" element={<MainLayout />}>
        <Route index element={<ContactUs />} />
      </Route>

      <Route path="forgot" element={<MainLayout />}>
        <Route index element={<ForgotPwd />} />
      </Route>

      <Route path="reset/:token" element={<MainLayout />}>
        <Route index element={<ResetPwd />} />
      </Route>

      <Route element={<RequireAuth />}>
        {/* ----- Moderator ----- */}
        <Route
          path="/moderator/*"
          element={
            //<ProtectedSection section="moderator">
              <ModeratorLayout />
            //</ProtectedSection>
          }
        >
          <Route index element={<HomeModerator />} />
          <Route path="gestionsessions" element={<AcceuilSessionModerator />} />
          <Route path="sessions" element={<NouvelleSessionModerator />} />
          <Route path="addsession" element={<AddSessionModerator />} />
          <Route path="session/:id/edit" element={<UpdateSessionModerator />} />
          <Route path="centres" element={<NouveauCentreModerator />} />
          <Route path="addcentre" element={<AddCentreModerator />} />
          <Route path="centre/:id/edit" element={<UpdateCentreModerator />} />
          <Route path="gestioncriteres" element={<NouveauCritereModerator />} />
          <Route path="listecriteres" element={<ListeCritereModerator />} />
          <Route path="addcritere" element={<AddCritereModerator />} />
          <Route path="updatecritere" element={<UpdateCritereModerator />} />
          <Route path="gestionparticipants" element={<NouveauParticipantModerator />} />
          <Route path="listeparticipants" element={<ListeParticipantsModerator />} />

        </Route> 
      </Route>  
    </Routes>
  );
}
