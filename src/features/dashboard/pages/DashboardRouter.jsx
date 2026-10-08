/**
 * DashboardRouter - Renders the appropriate dashboard based on user role
 *
 * - Manager: ManagerTodayDashboard (Today-first operations screen, 2026-10-08)
 * - Admin, Developer, Instructor: AdminDashboard (analytics-focused; also the
 *   "Reports" page managers reach from their dashboard at /admin/dashboard)
 * - Custom roles (like Front Desk): QuickActionsDashboard (action-focused)
 */
import { useAuth } from '@/shared/hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import FrontDeskDashboard from './FrontDeskDashboard';
import ManagerTodayDashboard from '@/features/manager/pages/ManagerTodayDashboard';

// Standard roles that get the Admin Dashboard
const ADMIN_DASHBOARD_ROLES = ['admin', 'developer', 'instructor'];

function DashboardRouter() {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase() || '';

    if (userRole === 'manager') {
        return <ManagerTodayDashboard />;
    }

    // Standard staff roles get AdminDashboard
    if (ADMIN_DASHBOARD_ROLES.includes(userRole)) {
        return <AdminDashboard />;
    }

    // Custom roles (like Front Desk) get the Quick Actions Dashboard
    return <FrontDeskDashboard />;
}

export default DashboardRouter;
