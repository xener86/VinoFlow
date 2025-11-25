import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AddWine } from './pages/AddWine';
import { WineDetails } from './pages/WineDetails';
import { EditWine } from './pages/EditWine';
import { CellarMap } from './pages/CellarMap';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Sommelier } from './pages/Sommelier';
import { Bar } from './pages/Bar';
import { SpiritDetails } from './pages/SpiritDetails';
import { EditSpirit } from './pages/EditSpirit';
import { TastingNotes } from './pages/TastingNotes';
import { CellarJournal } from './pages/CellarJournal';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isConfigured } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wine-600"></div>
      </div>
    );
  }

  if (!isConfigured || !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Routes with Layout */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/add-wine" element={<AddWine />} />
        <Route path="/wine/:id" element={<WineDetails />} />
        <Route path="/wine/:id/edit" element={<EditWine />} />
        <Route path="/cellar-map" element={<CellarMap />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sommelier" element={<Sommelier />} />
        <Route path="/bar" element={<Bar />} />
        <Route path="/spirit/:id" element={<SpiritDetails />} />
        <Route path="/spirit/:id/edit" element={<EditSpirit />} />
        <Route path="/tasting" element={<TastingNotes />} />
        <Route path="/journal" element={<CellarJournal />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;