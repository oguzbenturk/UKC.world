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
          // Lesson hours
          remainingHours: pkg.remaining_hours || pkg.remainingHours || 0,
          totalHours: pkg.total_hours || pkg.totalHours || 0,
          usedHours: pkg.used_hours || pkg.usedHours || 0,
          // Rental days
          rentalDaysTotal: pkg.rental_days_total || pkg.rentalDaysTotal || 0,
          rentalDaysUsed: pkg.rental_days_used || pkg.rentalDaysUsed || 0,
          rentalDaysRemaining: pkg.rental_days_remaining || pkg.rentalDaysRemaining || 0,
          // Accommodation nights
          accommodationNightsTotal: pkg.accommodation_nights_total || pkg.accommodationNightsTotal || 0,
          accommodationNightsUsed: pkg.accommodation_nights_used || pkg.accommodationNightsUsed || 0,
          accommodationNightsRemaining: pkg.accommodation_nights_remaining || pkg.accommodationNightsRemaining || 0,
          // Package type flags
          packageType: pkg.package_type || pkg.packageType || 'lesson',
          includesLessons: pkg.includes_lessons !== false,
          includesRental: pkg.includes_rental || false,
          includesAccommodation: pkg.includes_accommodation || false,
          // Service references
          rentalServiceId: pkg.rental_service_id || pkg.rentalServiceId || null,
          rentalServiceName: pkg.rental_service_name || pkg.rentalServiceName || null,
          accommodationUnitId: pkg.accommodation_unit_id || pkg.accommodationUnitId || null,
          accommodationUnitName: pkg.accommodation_unit_name || pkg.accommodationUnitName || null,
          // Other normalizations
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

  // Use rental days from a customer package
  const usePackageRentalDays = async (daysToUse, rentalData) => {
    try {
      setLoading(true);
      setError(null);

      // Find packages with available rental days
      const rentalPackages = packages
        .filter(pkg => pkg.status === 'active' && pkg.includesRental && pkg.rentalDaysRemaining > 0)
        .sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

      if (rentalPackages.length === 0) {
        throw new Error('No active packages with available rental days');
      }

      let remainingDaysToUse = daysToUse;
      const results = [];

      for (const pkg of rentalPackages) {
        if (remainingDaysToUse <= 0) break;

        const daysFromThisPackage = Math.min(remainingDaysToUse, pkg.rentalDaysRemaining);
        
        if (daysFromThisPackage > 0) {
          const response = await fetch(`/api/services/customer-packages/${pkg.id}/use-rental-days`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              daysToUse: daysFromThisPackage,
              rentalDate: rentalData?.date,
              notes: rentalData?.notes || `Used ${daysFromThisPackage} rental days`,
              rentalId: rentalData?.rentalId
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to use rental days from package ${pkg.id}`);
          }

          const result = await response.json();
          results.push(result);
          remainingDaysToUse -= daysFromThisPackage;
        }
      }

      if (remainingDaysToUse > 0) {
        throw new Error(`Not enough rental days available. Need ${daysToUse}, used ${daysToUse - remainingDaysToUse}`);
      }

      await fetchCustomerPackages(true);
      
      return {
        success: true,
        daysUsed: daysToUse,
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

  // Use accommodation nights from a customer package
  const usePackageAccommodationNights = async (nightsToUse, accommodationData) => {
    try {
      setLoading(true);
      setError(null);

      // Find packages with available accommodation nights
      const accommodationPackages = packages
        .filter(pkg => pkg.status === 'active' && pkg.includesAccommodation && pkg.accommodationNightsRemaining > 0)
        .sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

      if (accommodationPackages.length === 0) {
        throw new Error('No active packages with available accommodation nights');
      }

      let remainingNightsToUse = nightsToUse;
      const results = [];

      for (const pkg of accommodationPackages) {
        if (remainingNightsToUse <= 0) break;

        const nightsFromThisPackage = Math.min(remainingNightsToUse, pkg.accommodationNightsRemaining);
        
        if (nightsFromThisPackage > 0) {
          const response = await fetch(`/api/services/customer-packages/${pkg.id}/use-accommodation-nights`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              nightsToUse: nightsFromThisPackage,
              checkInDate: accommodationData?.checkInDate,
              checkOutDate: accommodationData?.checkOutDate,
              notes: accommodationData?.notes || `Used ${nightsFromThisPackage} accommodation nights`,
              accommodationBookingId: accommodationData?.bookingId
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to use accommodation nights from package ${pkg.id}`);
          }

          const result = await response.json();
          results.push(result);
          remainingNightsToUse -= nightsFromThisPackage;
        }
      }

      if (remainingNightsToUse > 0) {
        throw new Error(`Not enough accommodation nights available. Need ${nightsToUse}, used ${nightsToUse - remainingNightsToUse}`);
      }

      await fetchCustomerPackages(true);
      
      return {
        success: true,
        nightsUsed: nightsToUse,
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

  // Get available rental days from active packages
  const getAvailableRentalDays = () => {
    return packages
      .filter(pkg => pkg.status === 'active' && pkg.includesRental && pkg.rentalDaysRemaining > 0)
      .reduce((sum, pkg) => sum + pkg.rentalDaysRemaining, 0);
  };

  // Get available accommodation nights from active packages
  const getAvailableAccommodationNights = () => {
    return packages
      .filter(pkg => pkg.status === 'active' && pkg.includesAccommodation && pkg.accommodationNightsRemaining > 0)
      .reduce((sum, pkg) => sum + pkg.accommodationNightsRemaining, 0);
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
    usePackageRentalDays,
    usePackageAccommodationNights,
    getPackagesForService,
    getPaymentOptions,
    getAvailableRentalDays,
    getAvailableAccommodationNights
  };
};
