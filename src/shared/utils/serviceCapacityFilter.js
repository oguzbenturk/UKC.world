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
  if (!services || !Array.isArray(services)) return [];
  if (!participantCount || participantCount < 1) return services;

  return services.filter(service => {
    const maxCapacity = service.max_participants || service.maxParticipants;
    const type = (service.service_type || service.serviceType || '').toLowerCase();
    const tag = (service.lesson_category_tag || service.lessonCategoryTag || '').toLowerCase();

    // Use structured type/tag AND name to determine lesson kind
    const name = (service.name || '').toLowerCase();
    const isGroup = type === 'group' || tag === 'group' || (name.includes('group') && !name.includes('semi'));
    const isSemiPrivate = type === 'semi-private' || tag === 'semi-private' || tag === 'semi private' || name.includes('semi');
    const isPrivate = type === 'private' || tag === 'private';

    if (participantCount === 1) {
      // Single participant: exclude group and semi-private lessons
      if (isGroup || isSemiPrivate) return false;
    }

    if (participantCount > 1) {
      // Multiple participants: exclude strictly private services (max 1)
      if (isPrivate && maxCapacity === 1) return false;
    }

    // Respect max_participants ceiling
    if (maxCapacity && maxCapacity >= 1 && maxCapacity < participantCount) return false;

    return true;
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
