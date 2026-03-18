/**
 * DashboardRouter - Renders the appropriate dashboard based on user role
 * 
 * - Admin, Manager, Developer, Instructor: AdminDashboard (analytics-focused)
 * - Custom roles (like Front Desk): QuickActionsDashboard (action-focused)
 */
import { useAuth } from '@/shared/hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import FrontDeskDashboard from './FrontDeskDashboard';

// Standard roles that get the Admin Dashboard
const ADMIN_DASHBOARD_ROLES = ['admin', 'manager', 'developer', 'instructor'];

function DashboardRouter() {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase() || '';

    // Standard staff roles get AdminDashboard
    if (ADMIN_DASHBOARD_ROLES.includes(userRole)) {
        return <AdminDashboard />;
    }

    // Custom roles (like Front Desk) get the Quick Actions Dashboard
    return <FrontDeskDashboard />;
}

export default DashboardRouter;
