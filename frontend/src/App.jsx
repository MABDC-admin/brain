import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext.jsx';
import Layout from './Layout.jsx';
import OnboardingScreen from './components/OnboardingScreen.jsx';
import InstallBanner  from './components/InstallBanner.jsx';
import SearchOverlay  from './components/SearchOverlay.jsx';
import LockScreen     from './components/LockScreen.jsx';
import { DeleteConfirmationProvider } from './components/DeleteConfirmationProvider.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const HomePage = React.lazy(() => import('./pages/HomePage.jsx'));
const SearchPage = React.lazy(() => import('./pages/SearchPage.jsx'));
const TodayPage = React.lazy(() => import('./pages/TodayPage.jsx'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage.jsx'));
const TaskPage = React.lazy(() => import('./pages/TaskPage.jsx'));
const ExpensePage = React.lazy(() => import('./pages/ExpensePage.jsx'));
const NotePage = React.lazy(() => import('./pages/NotePage.jsx'));
const WorkspacesPage = React.lazy(() => import('./pages/WorkspacesPage.jsx'));
const ReminderPage = React.lazy(() => import('./pages/ReminderPage.jsx'));
const JournalPage = React.lazy(() => import('./pages/JournalPage.jsx'));
const ProjectPage = React.lazy(() => import('./pages/ProjectPage.jsx'));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage.jsx'));
const ChatPage = React.lazy(() => import('./pages/ChatPage.jsx'));
const GalleryPage = React.lazy(() => import('./pages/GalleryPage.jsx'));
const VaultPage = React.lazy(() => import('./pages/VaultPage.jsx'));
const TimelinePage = React.lazy(() => import('./pages/TimelinePage.jsx'));
const SharedDocumentPage = React.lazy(() => import('./pages/SharedDocumentPage.jsx'));
const HabitsPage = React.lazy(() => import('./pages/HabitsPage.jsx'));
const GoalsPage = React.lazy(() => import('./pages/GoalsPage.jsx'));
const ContactsPage = React.lazy(() => import('./pages/ContactsPage.jsx'));
const DocumentsPage = React.lazy(() => import('./pages/DocumentsPage.jsx'));
const KnowledgePage = React.lazy(() => import('./pages/KnowledgePage.jsx'));
const HealthPage = React.lazy(() => import('./pages/HealthPage.jsx'));
const TravelPage = React.lazy(() => import('./pages/TravelPage.jsx'));
const AssetsPage = React.lazy(() => import('./pages/AssetsPage.jsx'));
const FinancePlanPage = React.lazy(() => import('./pages/FinancePlanPage.jsx'));
const AutomationPage = React.lazy(() => import('./pages/AutomationPage.jsx'));

const routeFallback = (
  <div className="h-full bg-[#0b0c10] flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"/>
  </div>
);

function AnimatedRoutes({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter h-full">
      <React.Suspense fallback={routeFallback}>{children}</React.Suspense>
    </div>
  );
}

function AppInner() {
  const location = useLocation();
  const [items,      setItems]      = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [onboarded,  setOnboarded]  = useState(() => !!localStorage.getItem('onboarded'));
  const [showSearch, setShowSearch] = useState(false);
  const [workspace,  setWorkspace]  = useState(() => localStorage.getItem('workspace') || 'Personal');
  const fileInputRef = useRef(null);
  
  const savedPin = localStorage.getItem('app_pin') ? JSON.parse(localStorage.getItem('app_pin')) : '';
  const [isUnlocked, setIsUnlocked] = useState(!savedPin);

  // Persist workspace
  useEffect(() => { localStorage.setItem('workspace', workspace); }, [workspace]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const loadItems = useCallback(() => {
    fetch(`${API}/items?workspace=${encodeURIComponent(workspace)}`)
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(() => setItems([]));
  }, [workspace]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsScanning(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
    try {
      const res = await fetch(`${API}/api/scan`, { method: 'POST', body: formData });
      if (res.ok) loadItems();
      else alert('Scan failed. Set your API key in Settings → AI & Privacy');
    } catch { alert('Cannot connect to backend.'); }
    finally { setIsScanning(false); if (e.target) e.target.value = ''; }
  };

  const shared = { items, loadItems, workspace };

  if (!onboarded) {
    return <OnboardingScreen onComplete={() => setOnboarded(true)} />;
  }

  const isSharedRoute = location.pathname.startsWith('/shared/');
  if (isSharedRoute) {
    return (
      <ThemeProvider>
        <React.Suspense fallback={routeFallback}>
          <Routes>
            <Route path="/shared/:token" element={<SharedDocumentPage />} />
          </Routes>
        </React.Suspense>
      </ThemeProvider>
    );
  }

  if (!isUnlocked && savedPin) {
    return <LockScreen correctPin={savedPin} onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <Layout isScanning={isScanning} fileInputRef={fileInputRef} onFileChange={handleFileChange} loadItems={loadItems} onSearchOpen={() => setShowSearch(true)} workspace={workspace} setWorkspace={setWorkspace}>
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)}/>}
      <InstallBanner/>
      <AnimatedRoutes>
        <Routes>
          <Route path="/"           element={<HomePage       {...shared} />} />
          <Route path="/search"     element={<SearchPage     items={items} />} />
          <Route path="/today"      element={<TodayPage      items={items} />} />
          <Route path="/settings"   element={<SettingsPage />} />
          <Route path="/tasks"      element={<TaskPage       {...shared} />} />
          <Route path="/expenses"   element={<ExpensePage    {...shared} />} />
          <Route path="/notes"      element={<NotePage       {...shared} />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/reminders"  element={<ReminderPage   {...shared} />} />
          <Route path="/journal"    element={<JournalPage />} />
          <Route path="/projects"   element={<ProjectPage />} />
          <Route path="/analytics"  element={<AnalyticsPage />} />
          <Route path="/chat"       element={<ChatPage />} />
          <Route path="/gallery"    element={<GalleryPage />} />
          <Route path="/vault"      element={<VaultPage workspace={workspace} />} />
          <Route path="/timeline"   element={<TimelinePage workspace={workspace} />} />
          <Route path="/habits"     element={<HabitsPage     {...shared} />} />
          <Route path="/goals"      element={<GoalsPage      {...shared} />} />
          <Route path="/contacts"   element={<ContactsPage   {...shared} />} />
          <Route path="/documents"  element={<DocumentsPage  {...shared} />} />
          <Route path="/knowledge"  element={<KnowledgePage  {...shared} />} />
          <Route path="/health"     element={<HealthPage     {...shared} />} />
          <Route path="/travel"     element={<TravelPage     {...shared} />} />
          <Route path="/assets"     element={<AssetsPage     {...shared} />} />
          <Route path="/finance-planning" element={<FinancePlanPage {...shared} />} />
          <Route path="/automation" element={<AutomationPage />} />
        </Routes>
      </AnimatedRoutes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DeleteConfirmationProvider>
        <AppInner/>
      </DeleteConfirmationProvider>
    </ThemeProvider>
  );
}
