// src/contexts/DataContext.jsx - EMERGENCY SAFE VERSION
/* eslint-disable no-console */
import { createContext, useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DataService from '../services/dataService';
import apiClient from '../services/apiClient';
import { AuthContext } from './AuthContext';
import { apiCallManager } from '../utils/apiCallManager';
import { hasPermission, ROLES } from '../utils/roleUtils';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line react-refresh/only-export-components
export const DataContext = createContext(null);

// NUCLEAR OPTION: Completely rewrite to eliminate all possible destructuring
export function SafeDataProvider({ children }) {
  // STEP 1: State initialization - completely safe
  const stateValues = {
    usersWithStudentRole: useState([]),
    instructors: useState([]),
    equipment: useState([]),
    bookings: useState([]),
    services: useState([]),
    rentals: useState([]),
    payments: useState([]),
    dashboardSummary: useState(null),
    loading: useState(false),
    error: useState(null)
  };
  
  // STEP 2: Extract both getters and setters safely
  const usersWithStudentRole = stateValues.usersWithStudentRole[0];
  const setUsersWithStudentRole = stateValues.usersWithStudentRole[1];
  const instructors = stateValues.instructors[0];
  const setInstructors = stateValues.instructors[1];
  const equipment = stateValues.equipment[0];
  const setEquipment = stateValues.equipment[1];
  const bookings = stateValues.bookings[0];
  const setBookings = stateValues.bookings[1];
  const services = stateValues.services[0];
  const setServices = stateValues.services[1];
  const rentals = stateValues.rentals[0];
  const setRentals = stateValues.rentals[1];
  const payments = stateValues.payments[0];
  const setPayments = stateValues.payments[1];
  const dashboardSummary = stateValues.dashboardSummary[0];
  const setDashboardSummary = stateValues.dashboardSummary[1];
  const loading = stateValues.loading[0];
  const setLoading = stateValues.loading[1];
  const error = stateValues.error[0];
  const setError = stateValues.error[1];
  
  // STEP 3: Safe auth context usage with fallback
  let userIsAuthenticated = false;
  let userRole = null;
  let currentUser = null;
  
  // Try to get auth status safely
  try {
    const authContext = useContext(AuthContext);
    if (authContext && typeof authContext === 'object') {
      if (authContext.isAuthenticated) {
        userIsAuthenticated = true;
      }
      if (authContext.user && typeof authContext.user === 'object') {
        currentUser = authContext.user;
        if (typeof authContext.user.role === 'string') {
          userRole = authContext.user.role;
        } else if (typeof authContext.user.role_name === 'string') {
          userRole = authContext.user.role_name;
        }
      }
      // Check if auth context has an error that might prevent loading completion
       // auth errors handled by AuthProvider
    }
  } catch {
     // Auth context unavailable — leave defaults
  }
  
  const navigate = useNavigate();
  const fetchingRef = useRef(false);

  const canLoadFinanceData = hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER]);
  const canLoadRentalsData = hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER]);

  const actorDirectory = useMemo(() => {
    const lookup = {};
    const register = (candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      const id = candidate.id || candidate.user_id || candidate.userId;
      if (!id) {
        return;
      }

      const nameCandidate =
        candidate.name ||
        candidate.fullName ||
        candidate.full_name ||
        [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() ||
        candidate.email ||
        candidate.username ||
        null;

      if (nameCandidate) {
        lookup[id] = nameCandidate;
      }
    };

    if (Array.isArray(usersWithStudentRole)) {
      usersWithStudentRole.forEach(register);
    }

    if (Array.isArray(instructors)) {
      instructors.forEach(register);
    }

    if (currentUser && typeof currentUser === 'object') {
      register(currentUser);
    }

    return lookup;
  }, [usersWithStudentRole, instructors, currentUser]);

  const resolveActorLabel = useCallback((actorId, preferredLabel) => {
    if (preferredLabel && typeof preferredLabel === 'string' && preferredLabel.trim() !== '') {
      return preferredLabel;
    }

    if (!actorId) {
      return 'System automation';
    }

    const key = String(actorId);
    const directoryMatch = actorDirectory[key];
    if (directoryMatch) {
      return directoryMatch;
    }

    const normalized = key.toLowerCase();
    if (normalized === '00000000-0000-0000-0000-000000000000' || normalized === 'system') {
      return 'System automation';
    }

    if (key.length <= 12) {
      return key;
    }

    return `${key.slice(0, 8)}…${key.slice(-4)}`;
  }, [actorDirectory]);

  const loadServicesData = useCallback(async () => {
    try {
      const servicesData = await apiCallManager.execute('getServices',
        () => DataService.getServices(), 60000);
      setServices(Array.isArray(servicesData) ? servicesData : []);
    } catch (servicesError) {
      console.error('Error fetching services:', servicesError);
      setServices([]);
    }
  }, [setServices]);

  const loadRentalsData = useCallback(async () => {
    if (!canLoadRentalsData) {
      setRentals([]);
      return;
    }

    try {
      const rentalsData = await apiCallManager.execute('getActiveRentals',
        () => DataService.getActiveRentals(), 10000);
      setRentals(Array.isArray(rentalsData) ? rentalsData : []);
    } catch (rentalsError) {
      if (rentalsError?.response?.status === 403) {
        setRentals([]);
      } else {
        console.error('Error fetching rentals:', rentalsError);
        setRentals([]);
      }
    }
  }, [canLoadRentalsData, setRentals]);

  const loadPaymentsData = useCallback(async () => {
    if (!canLoadFinanceData) {
      setPayments([]);
      setDashboardSummary(null);
      return;
    }

    try {
      const transactions = await apiCallManager.execute('getRecentTransactions',
        () => DataService.getTransactions({ limit: 50 }), 5000);
      const normalized = Array.isArray(transactions)
        ? transactions.map((tx) => {
          const createdById = tx?.createdBy ?? tx?.created_by ?? null;
          const createdByLabel = resolveActorLabel(
            createdById,
            tx?.createdByName ?? tx?.created_by_name ?? null
          );

          return {
            ...tx,
            amount: Number(tx?.amount ?? 0),
            createdBy: createdById,
            createdByLabel,
          };
        })
        : [];
      setPayments(normalized);
    } catch (paymentsError) {
      if (paymentsError?.response?.status === 403) {
        setPayments([]);
        setDashboardSummary(null);
      } else {
        console.error('Error fetching transactions:', paymentsError);
        setPayments([]);
        setDashboardSummary(null);
      }
    }
  }, [canLoadFinanceData, setPayments, setDashboardSummary, resolveActorLabel]);

  const loadDashboardSummary = useCallback(async (options = {}) => {
    if (!canLoadFinanceData) {
      setDashboardSummary(null);
      return;
    }

    try {
      const summaryData = await apiCallManager.execute(
        'getDashboardSummary',
        () => DataService.getDashboardSummary(options),
        15000
      );
      setDashboardSummary(summaryData || null);
    } catch (dashboardError) {
      if (dashboardError?.response?.status === 403) {
        setDashboardSummary(null);
      } else {
        console.error('Error fetching dashboard summary:', dashboardError);
        setDashboardSummary(null);
      }
    }
  }, [canLoadFinanceData, setDashboardSummary]);

  const fetchData = useCallback(async () => {
    // Don't try to fetch data if not authenticated or already fetching
    if (!userIsAuthenticated || fetchingRef.current) {
      setLoading(false);
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);      // Stagger the requests to avoid rate limiting with longer delays
      // Use API call manager to prevent duplicate calls
      const usersData = await apiCallManager.execute('getUsersWithStudentRole', 
        () => DataService.getUsersWithStudentRole(), 10000);
      setUsersWithStudentRole(usersData);

      // Add longer delay between requests to prevent rate limiting
      await delay(1500); // Increased delay

      const instructorsData = await apiCallManager.execute('getInstructors',
        () => DataService.getInstructors(), 10000);
      setInstructors(instructorsData);

      await delay(1500); // Increased delay

      const equipmentData = await apiCallManager.execute('getEquipment',
        () => DataService.getEquipment(), 10000);
      setEquipment(equipmentData);

      await delay(1500); // Increased delay

      const bookingsData = await apiCallManager.execute('getBookings',
        () => DataService.getBookings(), 5000); // Shorter cache for bookings as they change more frequently
      setBookings(bookingsData);

      await delay(800);
      await loadServicesData();

      await delay(800);
      await loadRentalsData();

      await delay(800);
      await loadPaymentsData();

      await delay(600);
      await loadDashboardSummary();
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to fetch data");

      // If it's an auth error, redirect to login
      if (err.message.includes("Session expired")) {
        // Use a timeout to avoid immediate redirect during render
        setTimeout(() => {
          navigate('/login');
        }, 0);
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [
    loadServicesData,
    loadRentalsData,
    loadPaymentsData,
    loadDashboardSummary,
    navigate,
    setBookings,
    setEquipment,
    setError,
    setInstructors,
    setLoading,
    setUsersWithStudentRole,
    userIsAuthenticated
  ]);

  // Fetch data when authentication status changes
  useEffect(() => {
    if (userIsAuthenticated) {
      fetchData();
    }
  }, [userIsAuthenticated, fetchData]);

  const addInstructor = async (instructorData) => {
    try {
      // Create instructor via users endpoint with instructor role
      const createdInstructor = await DataService.createInstructor(instructorData);

      // Update instructors list
      setInstructors(prev => [...prev, createdInstructor]);

      return createdInstructor;
    } catch (err) {
      console.error('Error creating instructor:', err);
      throw err;
    }
  };

  const updateInstructor = async (id, instructorData) => {
    try {
      // Update instructor via users endpoint
      const updatedInstructor = await DataService.updateUser(id, instructorData);

      // Update instructors list
      setInstructors(prev =>
        prev.map(instructor =>
          instructor.id === id ? updatedInstructor : instructor
        )
      );

      return updatedInstructor;
    } catch (err) {
      console.error('Error updating instructor:', err);
      throw err;
    }
  };

  const fetchInstructorById = async (id) => {
    try {
      const instructor = await DataService.getInstructorById(id);
      return instructor;
    } catch (err) {
      throw err;
    }
  };

  const deleteInstructor = async (id) => {
    try {
      // Delete instructor via users endpoint
      await DataService.deleteUser(id);

      // Update instructors list by removing the deleted instructor
      setInstructors(prev =>
        prev.filter(instructor => instructor.id !== id)
      );

      return true;
    } catch (err) {
      console.error('Error deleting instructor:', err);
      throw err;
    }
  };

  const value = {
    students: usersWithStudentRole,
    usersWithStudentRole, // Add this for backward compatibility
    instructors,
    equipment,
    bookings,
    services,
    rentals,
    payments,
    dashboardSummary,
    loading,
    error,
    addInstructor,
    updateInstructor,
    deleteInstructor,
    fetchInstructorById,
    refreshData: fetchData,
    loadPaymentsData,
    loadDashboardSummary,
    apiClient // Expose the API client for direct use in components
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// Export both names to ensure compatibility
export { SafeDataProvider as DataProvider };

// Only use the named export, not the default export
// This ensures compatibility with Fast Refresh
// // Only use the named export, not the default export
// This ensures compatibility with Fast Refresh
// export default DataContext;
