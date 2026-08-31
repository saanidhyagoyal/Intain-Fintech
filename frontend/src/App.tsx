import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import OperatorDash from './pages/OperatorDash';
import ReviewerDash from './pages/ReviewerDash';
import ConsumerDash from './pages/ConsumerDash';
import LoanDetail from './pages/LoanDetail';
import AuditTrailDash from './pages/AuditTrailDash';
import RulesDictionaryDash from './pages/RulesDictionaryDash';

function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function ProtectedLayout() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} username={user.username} />
      <main className="flex-1 ml-64 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Role-based default dashboard */
function Dashboard() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'DATA_OPERATOR':
      return <OperatorDash />;
    case 'REVIEWER':
      return <ReviewerDash />;
    case 'DATA_CONSUMER':
      return <ConsumerDash />;
    default:
      return <OperatorDash />;
  }
}

/** Route guard: redirects unauthorized roles */
function RoleGuard({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          {/* Default route renders role-specific dashboard */}
          <Route path="/" element={<Dashboard />} />

          {/* Shared routes (can be caught by Dashboard or directly) */}
          <Route path="/upload" element={<RoleGuard allowed={['DATA_OPERATOR']}><OperatorDash /></RoleGuard>} />
          <Route path="/compliance" element={<RoleGuard allowed={['DATA_OPERATOR']}><OperatorDash /></RoleGuard>} />

          {/* Reviewer routes */}
          <Route path="/exceptions" element={<RoleGuard allowed={['REVIEWER']}><ReviewerDash /></RoleGuard>} />
          <Route path="/approved" element={<RoleGuard allowed={['REVIEWER']}><ReviewerDash /></RoleGuard>} />
          <Route path="/rules-dictionary" element={<RoleGuard allowed={['REVIEWER']}><RulesDictionaryDash /></RoleGuard>} />

          {/* Consumer routes */}
          <Route path="/verified" element={<RoleGuard allowed={['DATA_CONSUMER']}><ConsumerDash /></RoleGuard>} />
          <Route path="/validation" element={<RoleGuard allowed={['DATA_CONSUMER']}><ConsumerDash /></RoleGuard>} />

          {/* Audit routes */}
          <Route path="/audit" element={<RoleGuard allowed={['REVIEWER', 'DATA_CONSUMER']}><AuditTrailDash /></RoleGuard>} />

          {/* Fallback routes */}
          <Route path="/loans/:loanId" element={<LoanDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
