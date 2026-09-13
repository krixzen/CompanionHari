import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.jsx';
import { StudyDataProvider } from './hooks/useStudyData.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import HomePage from './pages/HomePage.jsx';
import SubjectsPage from './pages/SubjectsPage.jsx';
import TopicsPage from './pages/TopicsPage.jsx';
import ImportPage from './pages/ImportPage.jsx';

export default function App() {
  return (
    <ToastProvider>
      <StudyDataProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/subjects" element={<SubjectsPage />} />
            <Route path="/subjects/:subjectId" element={<TopicsPage />} />
            <Route path="/subjects/:subjectId/import" element={<ImportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </StudyDataProvider>
    </ToastProvider>
  );
}
