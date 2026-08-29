import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import OperatorDash, { OperatorHub, OperatorLogs } from './pages/OperatorDash';
import ReviewerDash, { ExceptionQueue, SelfHealingRules } from './pages/ReviewerDash';
import ConsumerDash, { VerifiedPortfolio, AuditLineage } from './pages/ConsumerDash';
import AdminDash from './pages/AdminDash';
import LoanDetail from './pages/LoanDetail';

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

/** Role-based default dashboard redirector */
function DashboardRedirect() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'DATA_OPERATOR':
      return <Navigate to="/operator" replace />;
    case 'REVIEWER':
      return <Navigate to="/reviewer" replace />;
    case 'DATA_CONSUMER':
      return <Navigate to="/consumer" replace />;
    case 'ADMIN':
      return <Navigate to="/admin" replace />;
    default:
      return <Navigate to="/operator" replace />;
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
          <Route path="/" element={<DashboardRedirect />} />

          {/* Operator Routes (Nested) */}
          <Route path="/operator" element={
            <RoleGuard allowed={['ADMIN', 'DATA_OPERATOR']}>
              <OperatorDash />
            </RoleGuard>
          }>
            <Route index element={<OperatorHub />} />
            <Route path="logs" element={<OperatorLogs />} />
          </Route>

          {/* Reviewer Routes (Nested) */}
          <Route path="/reviewer" element={
            <RoleGuard allowed={['ADMIN', 'REVIEWER']}>
              <ReviewerDash />
            </RoleGuard>
          }>
            <Route index element={<ExceptionQueue />} />
            <Route path="rules" element={<SelfHealingRules />} />
          </Route>

          {/* Consumer Routes (Nested) */}
          <Route path="/consumer" element={
            <RoleGuard allowed={['ADMIN', 'DATA_CONSUMER']}>
              <ConsumerDash />
            </RoleGuard>
          }>
            <Route index element={<VerifiedPortfolio />} />
            <Route path="audit" element={<AuditLineage />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin" element={
            <RoleGuard allowed={['ADMIN']}>
              <AdminDash />
            </RoleGuard>
          } />

          {/* Legacy or Shared routes */}
          <Route path="/loans/:loanId" element={<LoanDetail />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
