import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import OperatorDash from './pages/OperatorDash';
import ReviewerDash from './pages/ReviewerDash';
import ConsumerDash from './pages/ConsumerDash';
import LoanDetail from './pages/LoanDetail';
import AdminDash from './pages/AdminDash';

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
    case 'ADMIN':
      return <AdminDash />;
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
          <Route path="/" element={<Dashboard />} />

          {/* Operator-only routes */}
          <Route path="/upload" element={
            <RoleGuard allowed={['ADMIN', 'DATA_OPERATOR']}>
              <OperatorDash />
            </RoleGuard>
          } />

          {/* Reviewer-only routes */}
          <Route path="/exceptions" element={
            <RoleGuard allowed={['ADMIN', 'REVIEWER']}>
              <ReviewerDash />
            </RoleGuard>
          } />
          <Route path="/self-healing" element={
            <RoleGuard allowed={['ADMIN', 'REVIEWER']}>
              <ReviewerDash />
            </RoleGuard>
          } />

          {/* Consumer-only routes */}
          <Route path="/verified" element={
            <RoleGuard allowed={['ADMIN', 'DATA_CONSUMER']}>
              <ConsumerDash />
            </RoleGuard>
          } />
          <Route path="/audit" element={
            <RoleGuard allowed={['ADMIN', 'DATA_CONSUMER']}>
              <ConsumerDash />
            </RoleGuard>
          } />

          {/* Shared routes */}
          <Route path="/loans" element={<OperatorDash />} />
          <Route path="/loans/:loanId" element={<LoanDetail />} />

          {/* Admin-only */}
          <Route path="/admin" element={
            <RoleGuard allowed={['ADMIN']}>
              <AdminDash />
            </RoleGuard>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
