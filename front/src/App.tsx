// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import RequireAuth from './guards/RequireAuth';
import ProtectedSection from './components/ProtectedSection';
import MainLayout from './layouts/Main';
import AdminLayout from './layouts/Admin';
import PublicLayout from './layouts/Public';
import ModeratorLayout from './layouts/Moderator';
import TrainerLayout from './layouts/Trainer';
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
import ListeParticipantsModerator from './moderator/screens/ValidationDemandeNational';
import NouveauFormationModerator from './moderator/screens/AcceuilFormation';
import NouvelleFormationModerator  from './moderator/screens/NouvelleFormation';
import AddFormationModerator from './moderator/screens/AddFormation';
import EditFormationModerator from './moderator/screens/UpdateFormation';
import GestionAffectationModerator from './moderator/screens/GestionAffectation';
import GestionModerator from './moderator/screens/GestionModerator';
import ResultatFinaleModerator from './moderator/screens/ResultatFinale';
import ResultatDetailModerator from './moderator/screens/ٍResultatDetail';
import ModeratorCoachReport from './moderator/screens/CoachReport';
import ModeratorDirectorReport from './moderator/screens/DirectorReport';
import TrainerHome from './trainer/screens/Home';
import InfoTrainee from './trainer/screens/InfosTrainee';
import EvalutaionTrainee from './trainer/screens/EvalutaionTrainee';
import EvaluationFinale from './trainer/screens/EvaluationFinale';
import CoachReport from './trainer/screens/RapportCoach';
import DirectorReport from './trainer/screens/ReportDirector';
import AdminHome from './admin/screens/AdminHome';
import GestionAdmins from './admin/screens/ManageAdmins';
import GestionUsers from './admin/screens/ManageUsers';
import AdminUpdateEval from './admin/screens/UpdateEval';

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
            <ProtectedSection section="moderator_national">
              <ModeratorLayout />
            </ProtectedSection>
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
          <Route path="gestionformations" element={<NouveauFormationModerator />} />
          <Route path="listeformations" element={<NouvelleFormationModerator />} />
          <Route path="addformation" element={<AddFormationModerator />} />
          <Route path="updateformation" element={<EditFormationModerator />} />
          <Route path="participantformation" element={<GestionAffectationModerator />} />
          <Route path="gestionmoderators" element={<GestionModerator />} />
          <Route path="finalresults" element={<ResultatFinaleModerator />} />
          <Route path="detailresults" element={<ResultatDetailModerator />} />
          <Route path="rapportdirecteur" element={<ModeratorDirectorReport />} />
          <Route path="rapportcoach" element={<ModeratorCoachReport />} />


        </Route> 
      </Route>  

      <Route element={<RequireAuth />}>
        {/* ----- Admin ----- */}
        <Route
          path="/admin/*"
          element={
            <ProtectedSection section="admin">
              <AdminLayout />
            </ProtectedSection>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="gestionadmin" element={<GestionAdmins />} />
          <Route path="gestionbd" element={<GestionUsers />} />
          <Route path="updateeval" element={<AdminUpdateEval />} />

        </Route> 
      </Route>  
     

      <Route element={<RequireAuth />}>
        {/* ----- Trainer ----- */}
        <Route path="/trainer" element={<TrainerLayout />}>
          <Route index element={
            <ProtectedSection section="direction_space">
            <TrainerHome />
            </ProtectedSection>
            } />
          <Route path="infostrainee" element={
            <ProtectedSection section="team_space">
            <InfoTrainee />
            </ProtectedSection>
            } 
            />
          <Route path="evaluationtrainee" element={<ProtectedSection section="team_space"><EvalutaionTrainee /></ProtectedSection>} />
          <Route path="resultattrainee" element={<ProtectedSection section="team_space"><EvaluationFinale /></ProtectedSection>} />
          <Route
    path="coachreport"
    element={
      <ProtectedSection section="coach_space">
        <CoachReport />
      </ProtectedSection>
    }
  />
   <Route
    path="directorreport"
    element={
      <ProtectedSection section="director_space">
        <DirectorReport />
      </ProtectedSection>
    }
  />

          
        </Route> 
      </Route>  
    </Routes>
  );
}
