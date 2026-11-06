import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Pos from './pages/Pos';
import Admin from './pages/Admin';
import Order from './pages/Order';

function RequireRole({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    return <div className="p-6 text-center">無權存取此頁面</div>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/pos"
            element={
              <RequireRole allowedRoles={['Boss', 'Store Manager', 'Supervisor', 'Staff']}>
                <Pos />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole allowedRoles={['Boss', 'Store Manager']}>
                <Admin />
              </RequireRole>
            }
          />
          <Route path="/order" element={<Order />} />
          <Route path="/" element={<Navigate to="/pos" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}