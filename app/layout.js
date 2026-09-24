import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ApiLoadingProvider } from '../context/ApiLoadingContext';
import PortalAppearanceBootstrap from '../components/PortalAppearanceBootstrap';

export const metadata = {
  title: 'IT Service Desk',
  description: 'Centralized IT Service Desk & Asset Procurement Portal',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <ToastProvider>
            <ApiLoadingProvider>
              <PortalAppearanceBootstrap />
              {children}
            </ApiLoadingProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
