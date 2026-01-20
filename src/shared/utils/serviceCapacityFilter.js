/**
 * Service Capacity Filtering Utility
 * Filters services based on the number of participants selected
 */

/**
 * Filters services based on participant capacity
 * @param {Array} services - Array of service objects
 * @param {number} participantCount - Number of participants selected
 * @returns {Array} Filtered services that can accommodate the participant count
 */
export const filterServicesByCapacity = (services, participantCount) => {
  if (!services || !Array.isArray(services)) {
    console.warn('filterServicesByCapacity: Invalid services array provided');
    return [];
  }

  if (!participantCount || participantCount < 1) {
    console.warn('filterServicesByCapacity: Invalid participant count provided');
    return services;
  }

  return services.filter(service => {
    // Handle both field name conventions: max_participants and maxParticipants
    const maxCapacity = service.max_participants || service.maxParticipants;
    const category = (service.category || '').toLowerCase();
    const name = (service.name || '').toLowerCase();
    
    // For single participant bookings (participantCount === 1)
    if (participantCount === 1) {
      // Explicitly reject services that are clearly group-oriented
      if (category.includes('group') || name.includes('group')) {
        return false;
      }
      
      // If max capacity is set and is greater than 1, but less than a reasonable threshold,
      // it's likely a small group service that can accommodate single participants
      if (maxCapacity && maxCapacity > 1) {
        // Services with capacity 2-4 might be flexible (e.g., "Private/Semi-Private")
        // Services with capacity 5+ are likely group-only
        if (maxCapacity >= 5) {
          return false;
        }
      }
    }
    
    if (!maxCapacity || maxCapacity === null || maxCapacity === undefined) {
      // If no capacity limit is set, allow the service for any number of participants
      return true;
    }

    // Filter out services that cannot accommodate the requested number of participants
    const canAccommodate = maxCapacity >= participantCount;
    
    return canAccommodate;
  });
};

/**
 * Checks if a service is private (max capacity of 1)
 * @param {Object} service - Service object
 * @returns {boolean} True if service is private
 */
export const isPrivateService = (service) => {
  const maxCapacity = service.max_participants || service.maxParticipants;
  return maxCapacity === 1;
};

/**
 * Checks if a service is group-based (max capacity > 1)
 * @param {Object} service - Service object
 * @returns {boolean} True if service is group-based
 */
export const isGroupService = (service) => {
  const maxCapacity = service.max_participants || service.maxParticipants;
  return maxCapacity && maxCapacity > 1;
};

/**
 * Gets the capacity label for a service
 * @param {Object} service - Service object
 * @returns {string} Capacity label (e.g., "Private", "Group (max 8)")
 */
export const getCapacityLabel = (service) => {
  const maxCapacity = service.max_participants || service.maxParticipants;
  
  if (!maxCapacity) {
    return 'Unlimited';
  }
  
  if (maxCapacity === 1) {
    return 'Private';
  }
  
  return `Group (max ${maxCapacity})`;
};
