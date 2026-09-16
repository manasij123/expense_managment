import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FlatExpense from './pages/FlatExpense';
import History from './pages/History';
import Newspaper from './pages/Newspaper';
import NewspaperHistory from './pages/NewspaperHistory';
import SharedNewspaper from './pages/SharedNewspaper';
import GasExpense from './pages/GasExpense';

function Root() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/flat_expense"
        element={
          <ProtectedRoute>
            <FlatExpense />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        }
      />
      <Route
        path="/newspaper"
        element={
          <ProtectedRoute>
            <Newspaper />
          </ProtectedRoute>
        }
      />
      <Route
        path="/newspaper/history"
        element={
          <ProtectedRoute>
            <NewspaperHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gas_expense"
        element={
          <ProtectedRoute>
            <GasExpense />
          </ProtectedRoute>
        }
      />
      <Route path="/shared/report/:token" element={<SharedNewspaper />} />
    </Routes>
  );
}
