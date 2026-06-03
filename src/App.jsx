import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { APP_PATHS } from './data/routes.js';
import CalendarPage from './pages/CalendarPage.jsx';
import DetailPage from './pages/DetailPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MyPage from './pages/MyPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import PreviewPage from './pages/PreviewPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to={APP_PATHS.onboarding} replace />} />
        <Route path={APP_PATHS.onboarding} element={<OnboardingPage />} />
        <Route path={APP_PATHS.preview} element={<PreviewPage />} />
        <Route path={APP_PATHS.home} element={<HomePage />} />
        <Route path={APP_PATHS.detail} element={<DetailPage />} />
        <Route path={APP_PATHS.calendar} element={<CalendarPage />} />
        <Route path={APP_PATHS.my} element={<MyPage />} />
        <Route path="*" element={<Navigate to={APP_PATHS.onboarding} replace />} />
      </Route>
    </Routes>
  );
}
