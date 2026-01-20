// src/shared/hooks/useCustomerPackages.js
import { useState, useEffect, useRef, useCallback } from 'react';
import eventBus from '@/shared/utils/eventBus';

/**
 * Custom hook to manage customer packages and hour usage
 * @param {string} customerId - The customer ID to fetch packages for
 * @returns {Object} - Package data and methods
 */
export const useCustomerPackages = (customerId) => {
  const [packages, setPackages] = useState([]);
  const [availableHours, setAvailableHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track last fetch to prevent duplicate requests
  const lastFetchRef = useRef(null);
  const fetchTimeoutRef = useRef(null);

  // Fetch customer packages
  const fetchCustomerPackages = useCallback(async (force = false) => {
    if (!customerId) {
      setPackages([]);
      setAvailableHours(0);
      return;
    }

    // Prevent duplicate requests within 1 second unless forced
    const now = Date.now();
    if (!force && lastFetchRef.current && (now - lastFetchRef.current) < 1000) {
      return;
    }
    
    // Clear any pending timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    try {
      setLoading(true);
      setError(null);
      lastFetchRef.current = now;
      
      const response = await fetch(`/api/services/customer-packages/${customerId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const customerPackages = await response.json();
        
        // Normalize package data to ensure consistent property names
        const normalizedPackages = customerPackages.map(pkg => ({
          ...pkg,
          status: ((pkg.status || pkg.Status || '').toString().toLowerCase()) || pkg.status,
          remainingHours: pkg.remaining_hours || pkg.remainingHours || 0,
          lessonType: pkg.lesson_type || pkg.lessonType || pkg.lesson_service_name || 'lesson',
          packageName: pkg.package_name || pkg.packageName || pkg.name || 'Package',
          expiryDate: pkg.expiry_date || pkg.expiryDate || pkg.expires_at
        }));
        
        setPackages(normalizedPackages);
        
        // Calculate total available hours from active packages
        const totalHours = normalizedPackages
          .filter(pkg => (String(pkg.status || '').toLowerCase() === 'active') && pkg.remainingHours > 0)
          .reduce((sum, pkg) => sum + pkg.remainingHours, 0);
        
        setAvailableHours(totalHours);
      } else {
        await response.text(); // Consume response to avoid memory leaks
        throw new Error(`Failed to fetch customer packages: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setError(err.message);
      setPackages([]);
      setAvailableHours(0);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Use hours from customer packages
  const usePackageHours = async (hoursToUse, bookingData) => {
    try {
      setLoading(true);
      setError(null);

      // Find the best package to use hours from (prioritize oldest packages first)
      const activePackages = packages
        .filter(pkg => pkg.status === 'active' && pkg.remainingHours > 0)
        .sort((a, b) => new Date(a.assigned_date || a.assignedDate) - new Date(b.assigned_date || b.assignedDate));

      if (activePackages.length === 0) {
        throw new Error('No active packages with available hours');
      }

      let remainingHoursToUse = hoursToUse;
      const usageRequests = [];

      // Use hours from packages until we've used all required hours
      for (const pkg of activePackages) {
        if (remainingHoursToUse <= 0) break;

        const hoursFromThisPackage = Math.min(remainingHoursToUse, pkg.remainingHours);
        
        if (hoursFromThisPackage > 0) {
          usageRequests.push({
            packageId: pkg.id,
            hoursToUse: hoursFromThisPackage,
            bookingData: {
              bookingDate: bookingData.date,
              notes: `Used for ${bookingData.serviceName || 'lesson'} booking`
            }
          });
          
          remainingHoursToUse -= hoursFromThisPackage;
        }
      }

      if (remainingHoursToUse > 0) {
        throw new Error(`Not enough package hours available. Need ${hoursToUse}, have ${availableHours}`);
      }

      // Execute all usage requests
      const results = [];
      for (const request of usageRequests) {
        const response = await fetch(`/api/services/customer-packages/${request.packageId}/use-hours`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            hoursToUse: request.hoursToUse,
            bookingDate: request.bookingData.bookingDate,
            notes: request.bookingData.notes
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to use hours from package ${request.packageId}`);
        }

        const result = await response.json();
        results.push(result);
      }

      // Refresh packages after using hours
      await fetchCustomerPackages();
      
      return {
        success: true,
        hoursUsed: hoursToUse,
        packagesUsed: results.length,
        details: results
      };

    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get packages suitable for a specific service type
  const getPackagesForService = (serviceName, serviceDuration = 0) => {
    return packages.filter(pkg => {
      // Check if package is active and has enough hours
      if (pkg.status !== 'active' || pkg.remainingHours <= 0) return false;
      
      // Check if package has enough hours for the service
      if (serviceDuration > 0 && pkg.remainingHours < serviceDuration) return false;
      
      // Check if package service matches the booking service
      if (serviceName && pkg.lessonType) {
        const packageType = pkg.lessonType.toLowerCase();
        const serviceType = serviceName.toLowerCase();
        
        // More sophisticated matching
        if (serviceType.includes('private') && packageType.includes('private')) return true;
        if (serviceType.includes('supervision') && packageType.includes('supervision')) return true;
        if (serviceType.includes('group') && packageType.includes('group')) return true;
        if (packageType.includes('lesson') || packageType.includes('general')) return true;
      }
      
      return true; // Default to allowing any package for any service
    });
  };

  // Calculate payment options (package vs cash)
  const getPaymentOptions = (serviceDuration, servicePrice) => {
    const availablePackageHours = availableHours;
    const canUsePackage = availablePackageHours >= serviceDuration;
    
    return {
      canUsePackage,
      availableHours: availablePackageHours,
      requiredHours: serviceDuration,
      cashPrice: servicePrice,
      packagePayment: canUsePackage ? `${serviceDuration} hours from package` : null
    };
  };

  useEffect(() => {
    if (customerId) {
      // Debounced fetch to prevent rapid calls
      fetchTimeoutRef.current = setTimeout(() => {
        fetchCustomerPackages();
      }, 100);
    }
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [customerId, fetchCustomerPackages]);

  // Auto-refresh when packages change anywhere in the app
  useEffect(() => {
    const unsub = eventBus.on('packages:changed', (payload) => {
      if (!payload) return;
      // If payload.customers is provided, refresh only when it includes current customer
      if (!payload.customers || (customerId && payload.customers.includes(customerId))) {
        fetchCustomerPackages(true);
      }
    });
    return () => { unsub && unsub(); };
  }, [customerId, fetchCustomerPackages]);

  return {
    packages,
    availableHours,
    loading,
    error,
    fetchCustomerPackages,
    usePackageHours,
    getPackagesForService,
    getPaymentOptions
  };
};
