import React from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AddWine } from './pages/AddWine';
import { EditWine } from './pages/EditWine';
import { Sommelier } from './pages/Sommelier';
import { Analytics } from './pages/Analytics';
import { CellarMap } from './pages/CellarMap';
import { Bar } from './pages/Bar';
import { Settings } from './pages/Settings';
import { WineDetails } from './pages/WineDetails';
import { SpiritDetails } from './pages/SpiritDetails';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC = () => {
  const { user, loading, isConfigured } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-wine-500" size={48} />
      </div>
    );
  }

  if (!isConfigured || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/wine/:id" element={<WineDetails />} />
        <Route path="/wine/:id/edit" element={<EditWine />} />
        <Route path="/spirit/:id" element={<SpiritDetails />} />
        <Route path="/map" element={<CellarMap />} />
        <Route path="/bar" element={<Bar />} />
        <Route path="/add" element={<AddWine />} />
        <Route path="/sommelier" element={<Sommelier />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
