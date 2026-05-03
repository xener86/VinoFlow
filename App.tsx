import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CockpitLayout } from './components/cockpit/CockpitLayout';
import { Login } from './pages/Login';
import { CockpitDashboard } from './pages/CockpitDashboard';
import { Dashboard } from './pages/Dashboard';
import { AddWine } from './pages/AddWine';
import { WineDetails } from './pages/WineDetails';
import { EditWine } from './pages/EditWine';
import { CellarMap } from './pages/CellarMap';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Sommelier } from './pages/Sommelier';
import { CockpitSommelier } from './pages/CockpitSommelier';
import { Bar } from './pages/Bar';
import { SpiritDetails } from './pages/SpiritDetails';
import { EditSpirit } from './pages/EditSpirit';
import { TastingNotes } from './pages/TastingNotes';
import { CellarJournal } from './pages/CellarJournal';
import { Wishlist } from './pages/Wishlist';
import { CompareWines } from './pages/CompareWines';
import { DrinkNow } from './pages/DrinkNow';
import { RegionMap } from './pages/RegionMap';
import { Insights } from './pages/Insights';
import { CockpitInsights } from './pages/CockpitInsights';
import { CockpitCave } from './pages/CockpitCave';
import { SommelierTools } from './pages/SommelierTools';

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

      {/* Protected Routes with new Cockpit Layout */}
      <Route element={<ProtectedRoute><CockpitLayout /></ProtectedRoute>}>
        <Route path="/" element={<CockpitDashboard />} />
        <Route path="/cave" element={<CockpitCave />} />
        <Route path="/cave-classic" element={<Dashboard />} />
        <Route path="/add-wine" element={<AddWine />} />
        <Route path="/wine/:id" element={<WineDetails />} />
        <Route path="/wine/:id/edit" element={<EditWine />} />
        <Route path="/cellar-map" element={<CellarMap />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sommelier" element={<CockpitSommelier />} />
        <Route path="/sommelier-classic" element={<Sommelier />} />
        <Route path="/bar" element={<Bar />} />
        <Route path="/spirit/:id" element={<SpiritDetails />} />
        <Route path="/spirit/:id/edit" element={<EditSpirit />} />
        <Route path="/tasting" element={<TastingNotes />} />
        <Route path="/journal" element={<CellarJournal />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/compare" element={<CompareWines />} />
        <Route path="/drink-now" element={<DrinkNow />} />
        <Route path="/regions" element={<RegionMap />} />
        <Route path="/insights" element={<CockpitInsights />} />
        <Route path="/insights-classic" element={<Insights />} />
        <Route path="/sommelier-tools" element={<SommelierTools />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;