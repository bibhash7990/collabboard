import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { useAuthStore } from './stores/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui/Spinner';
import { Toaster } from './components/ui/Toaster';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { DashboardPage } from './pages/DashboardPage';
import { BoardPage } from './pages/BoardPage';
import { SharePage } from './pages/SharePage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  useAuthBootstrap();
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading CollabBoard…" />
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
        <Route
          path="/register"
          element={user ? <Navigate to="/app" replace /> : <RegisterPage />}
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
        <Route path="/share/:token" element={<SharePage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/board/:boardId"
          element={
            <ProtectedRoute>
              <BoardPage />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to={user ? '/app' : '/login'} replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
