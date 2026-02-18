// src/shared/services/packageBookingService.js
import { logger } from '@/shared/utils/logger';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * Service to handle package hour usage during booking
 */
export class PackageBookingService {
  
  /**
   * Use package hours for a booking
   * @param {string} customerId - Customer ID
   * @param {number} hoursToUse - Number of hours to use
   * @param {Object} bookingData - Booking data
   * @returns {Promise<Object>} - Usage result
   */
  static async usePackageHoursForBooking(customerId, hoursToUse, bookingData) {
    try {
      // First, get customer packages
      const packagesResponse = await fetch(`/api/services/customer-packages/${customerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!packagesResponse.ok) {
        throw new Error('Failed to fetch customer packages');
      }

      const packages = await packagesResponse.json();
      
      // Normalize package data to ensure consistent property names (same as useCustomerPackages hook)
      const normalizedPackages = packages.map(pkg => ({
        ...pkg,
        remainingHours: parseFloat(pkg.remaining_hours || pkg.remainingHours) || 0,
        totalHours: parseFloat(pkg.total_hours || pkg.totalHours) || 0,
        usedHours: parseFloat(pkg.used_hours || pkg.usedHours) || 0,
        lessonType: pkg.lesson_type || pkg.lessonType || pkg.lesson_service_name || 'lesson',
        packageName: pkg.package_name || pkg.packageName || pkg.name || 'Package',
        assignedDate: pkg.assigned_date || pkg.assignedDate || pkg.created_at,
        expiryDate: pkg.expiry_date || pkg.expiryDate || pkg.expires_at
      }));
      
      // Find active packages with available hours
      const activePackages = normalizedPackages
        .filter(pkg => pkg.status === 'active' && pkg.remainingHours > 0)
        .sort((a, b) => new Date(a.assignedDate) - new Date(b.assignedDate)); // Use oldest first

      if (activePackages.length === 0) {
        throw new Error('No active packages with available hours');
      }

      // Check if customer has enough total hours
      const totalAvailableHours = activePackages.reduce((sum, pkg) => sum + pkg.remainingHours, 0);
      if (totalAvailableHours < hoursToUse) {
        throw new Error(`Not enough package hours available. Need ${hoursToUse}, have ${totalAvailableHours}`);
      }

      // Use hours from packages (starting with oldest)
      let remainingHoursToUse = hoursToUse;
      const usageResults = [];

      for (const pkg of activePackages) {
        if (remainingHoursToUse <= 0) break;

        const hoursFromThisPackage = Math.min(remainingHoursToUse, pkg.remainingHours);
        
        if (hoursFromThisPackage > 0) {
          const usageResponse = await fetch(`/api/services/customer-packages/${pkg.id}/use-hours`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              hoursToUse: hoursFromThisPackage,
              bookingDate: bookingData.date,
              notes: `Used for ${bookingData.serviceName || 'lesson'} booking on ${bookingData.date}`
            })
          });

          if (!usageResponse.ok) {
            const errorData = await usageResponse.json();
            throw new Error(errorData.error || `Failed to use hours from package ${pkg.id}`);
          }

          const usageResult = await usageResponse.json();
          usageResults.push({
            packageId: pkg.id,
            packageName: pkg.packageName,
            hoursUsed: hoursFromThisPackage,
            remainingHours: usageResult.remainingHours,
            ...usageResult
          });

          remainingHoursToUse -= hoursFromThisPackage;
        }
      }

      return {
        success: true,
        totalHoursUsed: hoursToUse,
        packagesUsed: usageResults.length,
        details: usageResults,
        message: `Successfully used ${hoursToUse} hours from ${usageResults.length} package(s)`
      };

    } catch (error) {
      logger.error('Error using package hours for booking', { error });
      throw error;
    }
  }

  /**
   * Check if customer has enough package hours for a service
   * @param {string} customerId - Customer ID
   * @param {number} requiredHours - Required hours
   * @param {string} serviceType - Service type (for filtering compatible packages)
   * @returns {Promise<Object>} - Availability check result
   */
  static async checkPackageHoursAvailability(customerId, requiredHours, serviceType = 'private') {
    try {
      const response = await fetch(`/api/services/customer-packages?customerId=${customerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        return {
          available: false,
          availableHours: 0,
          packages: [],
          error: 'Failed to fetch packages'
        };
      }

      const packages = await response.json();
      
      // Normalize package data to ensure consistent property names (same as useCustomerPackages hook)
      const normalizedPackages = packages.map(pkg => ({
        ...pkg,
        remainingHours: pkg.remaining_hours || pkg.remainingHours || 0,
        lessonType: pkg.lesson_type || pkg.lessonType || pkg.lesson_service_name || 'lesson',
        packageName: pkg.package_name || pkg.packageName || pkg.name || 'Package',
        assignedDate: pkg.assigned_date || pkg.assignedDate || pkg.created_at,
        expiryDate: pkg.expiry_date || pkg.expiryDate || pkg.expires_at
      }));
      
      // Filter compatible packages
      const compatiblePackages = normalizedPackages.filter(pkg => {
        if (pkg.status !== 'active' || pkg.remainingHours <= 0) return false;
        
        // Check if package is compatible with service type
        if (serviceType === 'private' && pkg.lessonType) {
          return pkg.lessonType.toLowerCase().includes('private');
        }
        
        return true; // Default to allowing all packages
      });

      const totalAvailableHours = compatiblePackages.reduce((sum, pkg) => sum + pkg.remainingHours, 0);

      return {
        available: totalAvailableHours >= requiredHours,
        availableHours: totalAvailableHours,
        requiredHours,
        packages: compatiblePackages,
        canPartiallyUse: totalAvailableHours > 0 && totalAvailableHours < requiredHours
      };

    } catch (error) {
      logger.error('Error checking package hours availability', { error });
      return {
        available: false,
        availableHours: 0,
        packages: [],
        error: error.message
      };
    }
  }

  /**
   * Get payment options for a service
   * @param {string} customerId - Customer ID
   * @param {number} serviceDuration - Service duration in hours
   * @param {number} servicePrice - Service price
   * @param {string} serviceType - Service type
   * @returns {Promise<Object>} - Payment options
   */
  static async getPaymentOptions(customerId, serviceDuration, servicePrice, serviceType = 'private') {
    const availability = await this.checkPackageHoursAvailability(customerId, serviceDuration, serviceType);
    const code = (typeof window !== 'undefined' && window.__APP_CURRENCY__?.business) || 'EUR';
    
    return {
      cashOption: {
        available: true,
        price: servicePrice,
        description: `Pay ${formatCurrency(servicePrice, code)}`
      },
      packageOption: {
        available: availability.available,
        hoursRequired: serviceDuration,
        hoursAvailable: availability.availableHours,
        description: availability.available 
          ? `Use ${serviceDuration} hours from package`
          : `Need ${serviceDuration} hours, have ${availability.availableHours} hours`,
        packages: availability.packages
      }
    };
  }
}

export default PackageBookingService;
