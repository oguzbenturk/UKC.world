import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { LoadingSpinner } from '../src/components/ui';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(public)" />;
  }

  // Route based on role
  const role = user?.role?.toLowerCase();
  if (role === 'student' || role === 'trusted_customer' || role === 'outsider') {
    return <Redirect href="/(app)/(home)" />;
  }
  if (role === 'instructor') {
    return <Redirect href="/(app)/(home)" />;
  }

  return <Redirect href="/(app)/(home)" />;
}
