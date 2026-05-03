import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CockpitLayout } from './components/cockpit/CockpitLayout';
import { Login } from './pages/Login';
// Eager: the home page (most-used + LCP)
import { CockpitDashboard } from './pages/CockpitDashboard';

// Lazy: every other page is split into its own chunk so they're loaded
// on-demand (huge improvement for first paint, esp. on mobile)
const CockpitCave        = lazy(() => import('./pages/CockpitCave').then(m => ({ default: m.CockpitCave })));
const CockpitAddWine     = lazy(() => import('./pages/CockpitAddWine').then(m => ({ default: m.CockpitAddWine })));
const CockpitWineDetails = lazy(() => import('./pages/CockpitWineDetails').then(m => ({ default: m.CockpitWineDetails })));
const CockpitPlan        = lazy(() => import('./pages/CockpitPlan').then(m => ({ default: m.CockpitPlan })));
const CockpitSommelier   = lazy(() => import('./pages/CockpitSommelier').then(m => ({ default: m.CockpitSommelier })));
const CockpitInsights    = lazy(() => import('./pages/CockpitInsights').then(m => ({ default: m.CockpitInsights })));
const CockpitTasting     = lazy(() => import('./pages/CockpitTasting').then(m => ({ default: m.CockpitTasting })));
const SommelierTools     = lazy(() => import('./pages/SommelierTools').then(m => ({ default: m.SommelierTools })));
const Settings           = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Wishlist           = lazy(() => import('./pages/Wishlist').then(m => ({ default: m.Wishlist })));
const CellarJournal      = lazy(() => import('./pages/CellarJournal').then(m => ({ default: m.CellarJournal })));
const RegionMap          = lazy(() => import('./pages/RegionMap').then(m => ({ default: m.RegionMap })));
const CellarMap          = lazy(() => import('./pages/CellarMap').then(m => ({ default: m.CellarMap })));
const CompareWines       = lazy(() => import('./pages/CompareWines').then(m => ({ default: m.CompareWines })));
const DrinkNow           = lazy(() => import('./pages/DrinkNow').then(m => ({ default: m.DrinkNow })));
const Analytics          = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const EditWine           = lazy(() => import('./pages/EditWine').then(m => ({ default: m.EditWine })));
const Bar                = lazy(() => import('./pages/Bar').then(m => ({ default: m.Bar })));
const SpiritDetails      = lazy(() => import('./pages/SpiritDetails').then(m => ({ default: m.SpiritDetails })));
const EditSpirit         = lazy(() => import('./pages/EditSpirit').then(m => ({ default: m.EditSpirit })));

// Legacy classic pages (kept as fallback) — also lazy
const Dashboard      = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const AddWine        = lazy(() => import('./pages/AddWine').then(m => ({ default: m.AddWine })));
const WineDetails    = lazy(() => import('./pages/WineDetails').then(m => ({ default: m.WineDetails })));
const Sommelier      = lazy(() => import('./pages/Sommelier').then(m => ({ default: m.Sommelier })));
const TastingNotes   = lazy(() => import('./pages/TastingNotes').then(m => ({ default: m.TastingNotes })));
const Insights       = lazy(() => import('./pages/Insights').then(m => ({ default: m.Insights })));

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-600"></div>
  </div>
);

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
        <Route path="/cave" element={<Suspense fallback={<PageLoader />}><CockpitCave /></Suspense>} />
        <Route path="/cave-classic" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="/add-wine" element={<Suspense fallback={<PageLoader />}><CockpitAddWine /></Suspense>} />
        <Route path="/add-wine-classic" element={<Suspense fallback={<PageLoader />}><AddWine /></Suspense>} />
        <Route path="/wine/:id" element={<Suspense fallback={<PageLoader />}><CockpitWineDetails /></Suspense>} />
        <Route path="/wine/:id/classic" element={<Suspense fallback={<PageLoader />}><WineDetails /></Suspense>} />
        <Route path="/wine/:id/edit" element={<Suspense fallback={<PageLoader />}><EditWine /></Suspense>} />
        <Route path="/plan" element={<Suspense fallback={<PageLoader />}><CockpitPlan /></Suspense>} />
        <Route path="/cellar-map" element={<Suspense fallback={<PageLoader />}><CellarMap /></Suspense>} />
        <Route path="/cellar-map-classic" element={<Suspense fallback={<PageLoader />}><CellarMap /></Suspense>} />
        <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><Analytics /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="/sommelier" element={<Suspense fallback={<PageLoader />}><CockpitSommelier /></Suspense>} />
        <Route path="/sommelier-classic" element={<Suspense fallback={<PageLoader />}><Sommelier /></Suspense>} />
        <Route path="/bar" element={<Suspense fallback={<PageLoader />}><Bar /></Suspense>} />
        <Route path="/spirit/:id" element={<Suspense fallback={<PageLoader />}><SpiritDetails /></Suspense>} />
        <Route path="/spirit/:id/edit" element={<Suspense fallback={<PageLoader />}><EditSpirit /></Suspense>} />
        <Route path="/tasting" element={<Suspense fallback={<PageLoader />}><CockpitTasting /></Suspense>} />
        <Route path="/tasting/:wineId" element={<Suspense fallback={<PageLoader />}><CockpitTasting /></Suspense>} />
        <Route path="/tasting-classic" element={<Suspense fallback={<PageLoader />}><TastingNotes /></Suspense>} />
        <Route path="/journal" element={<Suspense fallback={<PageLoader />}><CellarJournal /></Suspense>} />
        <Route path="/wishlist" element={<Suspense fallback={<PageLoader />}><Wishlist /></Suspense>} />
        <Route path="/compare" element={<Suspense fallback={<PageLoader />}><CompareWines /></Suspense>} />
        <Route path="/drink-now" element={<Suspense fallback={<PageLoader />}><DrinkNow /></Suspense>} />
        <Route path="/regions" element={<Suspense fallback={<PageLoader />}><RegionMap /></Suspense>} />
        <Route path="/insights" element={<Suspense fallback={<PageLoader />}><CockpitInsights /></Suspense>} />
        <Route path="/insights-classic" element={<Suspense fallback={<PageLoader />}><Insights /></Suspense>} />
        <Route path="/sommelier-tools" element={<Suspense fallback={<PageLoader />}><SommelierTools /></Suspense>} />
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
