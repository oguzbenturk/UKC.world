import { useAuth } from '@/shared/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import GdprDataManager from './GdprDataManager';

/**
 * Privacy & GDPR Page Wrapper
 * - Redirects admins to Legal Documents admin page
 * - Shows GDPR data manager for regular users
 */
const PrivacyGdprPage = () => {
  const { user } = useAuth();
  
  // Check if user is admin/manager/developer
  const isAdmin = user && ['admin', 'manager', 'developer'].includes(user.role);
  
  // Redirect admins to legal documents configuration page
  if (isAdmin) {
    return <Navigate to="/admin/legal-documents" replace />;
  }
  
  // Show GDPR data manager for regular users
  return <GdprDataManager />;
};

export default PrivacyGdprPage;
