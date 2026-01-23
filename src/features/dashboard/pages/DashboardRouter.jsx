/**
 * DashboardRouter - Renders the appropriate dashboard based on user role
 * 
 * - Admin, Manager, Developer, Instructor: ExecutiveDashboard (analytics-focused)
 * - Custom roles (like Front Desk): QuickActionsDashboard (action-focused)
 */
import { useAuth } from '@/shared/hooks/useAuth';
import ExecutiveDashboard from './ExecutiveDashboard';
import DashboardNew from './DashboardNew';

// Standard roles that get the Executive Dashboard
const EXECUTIVE_DASHBOARD_ROLES = ['admin', 'manager', 'developer', 'instructor'];

function DashboardRouter() {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase() || '';

    // Standard staff roles get ExecutiveDashboard
    if (EXECUTIVE_DASHBOARD_ROLES.includes(userRole)) {
        return <ExecutiveDashboard />;
    }

    // Custom roles (like Front Desk) get the Quick Actions Dashboard
    return <DashboardNew />;
}

export default DashboardRouter;
