import { describe, expect, it } from 'vitest';
import {
  ROLES,
  getRoleLevel,
  hasPermission,
  getPermissionsForRole,
  canEditUser,
  PAY_AT_CENTER_ALLOWED_ROLES
} from '@/shared/utils/roleUtils';

// ============================================
// 1. Role hierarchy level checks
// ============================================
describe('getRoleLevel', () => {
  it('returns correct hierarchy: outsider < student < trusted_customer < instructor < manager < admin < developer', () => {
    expect(getRoleLevel(ROLES.OUTSIDER)).toBeLessThan(getRoleLevel(ROLES.STUDENT));
    expect(getRoleLevel(ROLES.STUDENT)).toBeLessThan(getRoleLevel(ROLES.TRUSTED_CUSTOMER));
    expect(getRoleLevel(ROLES.TRUSTED_CUSTOMER)).toBeLessThan(getRoleLevel(ROLES.INSTRUCTOR));
    expect(getRoleLevel(ROLES.INSTRUCTOR)).toBeLessThan(getRoleLevel(ROLES.MANAGER));
    expect(getRoleLevel(ROLES.MANAGER)).toBeLessThan(getRoleLevel(ROLES.ADMIN));
    expect(getRoleLevel(ROLES.ADMIN)).toBeLessThan(getRoleLevel(ROLES.DEVELOPER));
  });

  it('is case-insensitive', () => {
    expect(getRoleLevel('MANAGER')).toBe(getRoleLevel('manager'));
    expect(getRoleLevel('Admin')).toBe(getRoleLevel('admin'));
  });

  it('returns -1 for unknown roles like front_desk (custom role)', () => {
    expect(getRoleLevel('front_desk')).toBe(-1);
    expect(getRoleLevel('custom_role')).toBe(-1);
  });
});

// ============================================
// 2. hasPermission — direct role matching
// ============================================
describe('hasPermission', () => {
  it('grants manager access when manager is in allowedRoles', () => {
    expect(hasPermission('manager', ['admin', 'manager'])).toBe(true);
  });

  it('grants admin access when admin is in allowedRoles', () => {
    expect(hasPermission('admin', ['admin', 'manager'])).toBe(true);
  });

  it('denies student when only admin/manager allowed', () => {
    expect(hasPermission('student', ['admin', 'manager'])).toBe(false);
  });

  it('denies front_desk when only admin/manager/instructor allowed', () => {
    expect(hasPermission('front_desk', ['admin', 'manager', 'instructor'])).toBe(false);
  });

  it('grants front_desk only when explicitly listed', () => {
    expect(hasPermission('front_desk', ['admin', 'manager', 'front_desk'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hasPermission('Manager', ['manager'])).toBe(true);
    expect(hasPermission('ADMIN', ['admin'])).toBe(true);
  });

  it('handles single role (not array)', () => {
    expect(hasPermission('manager', 'manager')).toBe(true);
    expect(hasPermission('student', 'manager')).toBe(false);
  });

  it('returns false for null/undefined user role', () => {
    expect(hasPermission(null, ['admin'])).toBe(false);
    expect(hasPermission(undefined, ['admin'])).toBe(false);
  });
});

// ============================================
// 3. getPermissionsForRole — manager permissions
// ============================================
describe('getPermissionsForRole — manager', () => {
  const perms = getPermissionsForRole(ROLES.MANAGER);

  it('manager can view dashboard', () => {
    expect(perms.canViewDashboard).toBe(true);
  });

  it('manager can view students', () => {
    expect(perms.canViewStudents).toBe(true);
  });

  it('manager can manage students', () => {
    expect(perms.canManageStudents).toBe(true);
  });

  it('manager can view bookings', () => {
    expect(perms.canViewBookings).toBe(true);
  });

  it('manager can create bookings', () => {
    expect(perms.canCreateBookings).toBe(true);
  });

  it('manager can manage all bookings', () => {
    expect(perms.canManageAllBookings).toBe(true);
  });

  it('manager can view equipment', () => {
    expect(perms.canViewEquipment).toBe(true);
  });

  it('manager can manage equipment', () => {
    expect(perms.canManageEquipment).toBe(true);
  });

  it('manager can view finances', () => {
    expect(perms.canViewFinances).toBe(true);
  });

  it('manager can view settings', () => {
    expect(perms.canViewSettings).toBe(true);
  });

  it('manager can view reports', () => {
    expect(perms.canViewReports).toBe(true);
  });
});

// ============================================
// 4. getPermissionsForRole — front_desk (custom role)
// ============================================
describe('getPermissionsForRole — front_desk (unknown custom role)', () => {
  const perms = getPermissionsForRole('front_desk');

  it('front_desk gets role level -1 (unknown)', () => {
    expect(getRoleLevel('front_desk')).toBe(-1);
  });

  it('front_desk cannot manage students', () => {
    expect(perms.canManageStudents).toBe(false);
  });

  it('front_desk cannot manage finances', () => {
    expect(perms.canManageFinances).toBe(false);
  });

  it('front_desk cannot manage settings', () => {
    expect(perms.canManageSettings).toBe(false);
  });

  it('front_desk cannot view reports', () => {
    expect(perms.canViewReports).toBe(false);
  });

  it('front_desk cannot access debug info', () => {
    expect(perms.canViewDebugInfo).toBe(false);
  });
});

// ============================================
// 5. getPermissionsForRole — student restrictions
// ============================================
describe('getPermissionsForRole — student', () => {
  const perms = getPermissionsForRole(ROLES.STUDENT);

  it('student can view dashboard', () => {
    expect(perms.canViewDashboard).toBe(true);
  });

  it('student can view bookings', () => {
    expect(perms.canViewBookings).toBe(true);
  });

  it('student cannot view students list', () => {
    expect(perms.canViewStudents).toBe(false);
  });

  it('student cannot manage bookings', () => {
    expect(perms.canManageAllBookings).toBe(false);
  });

  it('student cannot view finances', () => {
    expect(perms.canViewFinances).toBe(false);
  });

  it('student cannot view settings', () => {
    expect(perms.canViewSettings).toBe(false);
  });
});

// ============================================
// 6. getPermissionsForRole — outsider restrictions
// ============================================
describe('getPermissionsForRole — outsider', () => {
  const perms = getPermissionsForRole(ROLES.OUTSIDER);

  it('outsider cannot view dashboard', () => {
    expect(perms.canViewDashboard).toBe(false);
  });

  it('outsider cannot view bookings', () => {
    expect(perms.canViewBookings).toBe(false);
  });

  it('outsider cannot view students', () => {
    expect(perms.canViewStudents).toBe(false);
  });

  it('outsider cannot view equipment', () => {
    expect(perms.canViewEquipment).toBe(false);
  });
});

// ============================================
// 7. canEditUser — role-based editing
// ============================================
describe('canEditUser', () => {
  it('manager can edit instructor', () => {
    expect(canEditUser({ id: 'm1', role: 'manager' }, { id: 'i1', role: 'instructor' })).toBe(true);
  });

  it('manager can edit student', () => {
    expect(canEditUser({ id: 'm1', role: 'manager' }, { id: 's1', role: 'student' })).toBe(true);
  });

  it('manager cannot edit admin', () => {
    expect(canEditUser({ id: 'm1', role: 'manager' }, { id: 'a1', role: 'admin' })).toBe(false);
  });

  it('instructor cannot edit manager', () => {
    expect(canEditUser({ id: 'i1', role: 'instructor' }, { id: 'm1', role: 'manager' })).toBe(false);
  });

  it('user can edit themselves', () => {
    expect(canEditUser({ id: 'u1', role: 'student' }, { id: 'u1', role: 'student' })).toBe(true);
  });

  it('returns false for null inputs', () => {
    expect(canEditUser(null, { id: 's1', role: 'student' })).toBe(false);
    expect(canEditUser({ id: 'm1', role: 'manager' }, null)).toBe(false);
  });
});

// ============================================
// 8. PAY_AT_CENTER_ALLOWED_ROLES
// ============================================
describe('PAY_AT_CENTER_ALLOWED_ROLES', () => {
  it('includes admin', () => {
    expect(PAY_AT_CENTER_ALLOWED_ROLES).toContain(ROLES.ADMIN);
  });

  it('includes manager', () => {
    expect(PAY_AT_CENTER_ALLOWED_ROLES).toContain(ROLES.MANAGER);
  });

  it('includes trusted_customer', () => {
    expect(PAY_AT_CENTER_ALLOWED_ROLES).toContain(ROLES.TRUSTED_CUSTOMER);
  });

  it('does not include student', () => {
    expect(PAY_AT_CENTER_ALLOWED_ROLES).not.toContain(ROLES.STUDENT);
  });

  it('does not include instructor', () => {
    expect(PAY_AT_CENTER_ALLOWED_ROLES).not.toContain(ROLES.INSTRUCTOR);
  });
});
