import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui';
import { Loading } from './components/ui';
import Shell from './components/Shell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import QrLogin from './pages/QrLogin';
import CitizenOverview from './pages/citizen/CitizenOverview';
import CitizenCases from './pages/citizen/CitizenCases';
import CaseDetail from './pages/citizen/CaseDetail';
import CitizenGrievances from './pages/citizen/CitizenGrievances';
import OfficialDashboard from './pages/official/OfficialDashboard';
import OfficialCases from './pages/official/OfficialCases';
import OfficialCaseDetail from './pages/official/OfficialCaseDetail';
import Treasury from './pages/official/Treasury';
import OfficialGrievances from './pages/official/OfficialGrievances';
import Audit from './pages/official/Audit';
import Analytics from './pages/official/Analytics';

function Guard({ role, children }: { role: 'CITIZEN' | 'OFFICIAL'; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'CITIZEN' && user.role !== 'CITIZEN') return <Navigate to="/official" replace />;
  if (role === 'OFFICIAL' && user.role === 'CITIZEN') return <Navigate to="/citizen" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/qr-login" element={<QrLogin />} />
            <Route path="/citizen" element={<Guard role="CITIZEN"><Shell /></Guard>}>
              <Route index element={<CitizenOverview />} />
              <Route path="cases" element={<CitizenCases />} />
              <Route path="cases/:id" element={<CaseDetail />} />
              <Route path="grievances" element={<CitizenGrievances />} />
            </Route>
            <Route path="/official" element={<Guard role="OFFICIAL"><Shell /></Guard>}>
              <Route index element={<OfficialDashboard />} />
              <Route path="cases" element={<OfficialCases />} />
              <Route path="cases/:id" element={<OfficialCaseDetail />} />
              <Route path="treasury" element={<Treasury />} />
              <Route path="grievances" element={<OfficialGrievances />} />
              <Route path="audit" element={<Audit />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
