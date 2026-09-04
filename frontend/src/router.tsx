import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { TelegramAccounts } from './pages/TelegramAccounts';
import { Groups } from './pages/Groups';
import { MigrationsList } from './pages/MigrationsList';
import { MigrationWizard } from './pages/migration/MigrationWizard';
import { MigrationProgress } from './pages/migration/MigrationProgress';
import { MigrationResults } from './pages/migration/MigrationResults';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { AdminDashboard } from './pages/admin/AdminDashboard';

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/accounts', element: <TelegramAccounts /> },
      { path: '/groups', element: <Groups /> },
      { path: '/migrations', element: <MigrationsList /> },
      { path: '/migrations/new', element: <MigrationWizard /> },
      { path: '/migrations/:id/progress', element: <MigrationProgress /> },
      { path: '/migrations/:id/results', element: <MigrationResults /> },
      { path: '/history', element: <History /> },
      { path: '/settings', element: <Settings /> },
      { path: '/admin', element: <AdminDashboard /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
