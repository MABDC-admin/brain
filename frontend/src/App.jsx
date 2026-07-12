import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext.jsx';
import Layout from './Layout.jsx';
import HomePage       from './pages/HomePage.jsx';
import SearchPage     from './pages/SearchPage.jsx';
import TodayPage      from './pages/TodayPage.jsx';
import SettingsPage   from './pages/SettingsPage.jsx';
import TaskPage       from './pages/TaskPage.jsx';
import ExpensePage    from './pages/ExpensePage.jsx';
import NotePage       from './pages/NotePage.jsx';
import WorkspacesPage from './pages/WorkspacesPage.jsx';
import ReminderPage   from './pages/ReminderPage.jsx';
import JournalPage    from './pages/JournalPage.jsx';
import ProjectPage    from './pages/ProjectPage.jsx';
import AnalyticsPage  from './pages/AnalyticsPage.jsx';
import ChatPage       from './pages/ChatPage.jsx';
import GalleryPage    from './pages/GalleryPage.jsx';
import VaultPage      from './pages/VaultPage.jsx';
import TimelinePage   from './pages/TimelinePage.jsx';
import SharedDocumentPage from './pages/SharedDocumentPage.jsx';
import OnboardingScreen from './components/OnboardingScreen.jsx';
import InstallBanner  from './components/InstallBanner.jsx';
import SearchOverlay  from './components/SearchOverlay.jsx';
import LockScreen     from './components/LockScreen.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function AnimatedRoutes({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter h-full">
      {children}
    </div>
  );
}

function AppInner() {
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

  const loadItems = () => {
    fetch(`${API}/items?workspace=${workspace}`)
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(() => setItems([]));
  };

  useEffect(() => { loadItems(); }, [workspace]);

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
        <Routes>
          <Route path="/shared/:token" element={<SharedDocumentPage />} />
        </Routes>
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
        </Routes>
      </AnimatedRoutes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner/>
    </ThemeProvider>
  );
}
