import React, { useState, useMemo } from 'react';
import { AdjustmentsHorizontalIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';

/**
 * Calendar filters component for filtering bookings by instructor, service, etc.
 * 
 * @returns {JSX.Element} CalendarFilters component
 */
const CalendarFilters = () => {
  const {
    instructors,
    services,
    selectedInstructors,
    setSelectedInstructors,
    selectedServices,
    setSelectedServices,
    refreshData
  } = useCalendar();
    const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState([]);
  const [dateRangeFilter, setDateRangeFilter] = useState({ start: '', end: '' });
  
  // Available booking statuses for filtering
  const availableStatuses = [
    { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
    { value: 'checked-in', label: 'Checked In', color: 'bg-green-100 text-green-800' },
    { value: 'completed', label: 'Completed', color: 'bg-gray-100 text-gray-800' },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
  ];
  
  // Get instructor initials for icons
  const getInstructorInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };
  
  // Enhanced search: filter instructors and services based on search term
  const filteredInstructors = useMemo(() => {
    if (!searchTerm) return instructors;
    return instructors.filter(instructor => 
      instructor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.specialties?.some(specialty => 
        specialty.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [instructors, searchTerm]);

  const filteredServices = useMemo(() => {
    if (!searchTerm) return services;
    return services.filter(service => 
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [services, searchTerm]);
  
  // Toggle filter visibility
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };
  
  /**
   * Toggle instructor selection
   * @param {number} instructorId - ID of instructor to toggle
   */
  const toggleInstructor = (instructorId) => {
    setSelectedInstructors(prevSelected => {
      // If already selected, remove it
      if (prevSelected.includes(instructorId)) {
        return prevSelected.filter(id => id !== instructorId);
      } 
      // Otherwise add it
      return [...prevSelected, instructorId];
    });
  };
    /**
   * Toggle service selection
   * @param {number} serviceId - ID of service to toggle
   */
  const toggleService = (serviceId) => {
    setSelectedServices(prevSelected => {
      if (prevSelected.includes(serviceId)) {
        return prevSelected.filter(id => id !== serviceId);
      }
      return [...prevSelected, serviceId];
    });
  };

  /**
   * Toggle status selection
   * @param {string} status - Status to toggle
   */
  const toggleStatus = (status) => {
    setStatusFilter(prevSelected => {
      if (prevSelected.includes(status)) {
        return prevSelected.filter(s => s !== status);
      }
      return [...prevSelected, status];
    });
  };

  /**
   * Clear all filters
   */
  const clearFilters = () => {
    setSelectedInstructors([]);
    setSelectedServices([]);
    setSearchTerm('');
    setStatusFilter([]);
    setDateRangeFilter({ start: '', end: '' });
  };
    /**
   * Check if there are any active filters
   */
  const hasActiveFilters = selectedInstructors.length > 0 || 
                          selectedServices.length > 0 || 
                          statusFilter.length > 0 ||
                          searchTerm ||
                          dateRangeFilter.start ||
                          dateRangeFilter.end;

  const totalActiveFilters = selectedInstructors.length + 
                           selectedServices.length + 
                           statusFilter.length +
                           (searchTerm ? 1 : 0) +
                           (dateRangeFilter.start ? 1 : 0) +
                           (dateRangeFilter.end ? 1 : 0);
    return (
    <div className="border-b border-gray-200">      <div className="p-3 sm:p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3 flex-1">
          <button
            type="button"
            className={`flex items-center text-sm sm:text-base ${
              showFilters ? 'text-blue-600' : 'text-gray-700 hover:text-gray-900'
            } transition-colors`}
            onClick={toggleFilters}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 text-gray-500" />
            <span className="hidden sm:inline">Filters</span>          <span className="sm:hidden">Filter</span>
            {hasActiveFilters && (
              <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                {totalActiveFilters}
              </span>
            )}
          </button>

          {/* Show selected instructor names in header */}
          {selectedInstructors.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <span className="text-xs text-gray-500">|</span>
              {selectedInstructors.slice(0, 3).map(instructorId => {
                const instructor = instructors.find(i => i.id === instructorId);
                if (!instructor) return null;
                return (
                  <span
                    key={instructorId}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {instructor.name}
                  </span>
                );
              })}
              {selectedInstructors.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{selectedInstructors.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 transition-colors"
            onClick={clearFilters}
          >
            <span className="hidden sm:inline">Clear All</span>
            <span className="sm:hidden">Clear</span>
          </button>
        )}
      </div>

      {showFilters && (
        <div className="p-3 sm:p-4 pt-0 bg-gray-50 border-t border-gray-200 space-y-4">
          {/* Enhanced mobile-friendly search field */}
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search instructors or services..."
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500"
                    onClick={() => setSearchTerm('')}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Enhanced mobile-responsive instructor filters */}
            {filteredInstructors.length > 0 && (
              <div>
                <h4 className="text-xs sm:text-sm font-medium text-gray-500 uppercase mb-2">Instructors</h4>
                <div className="space-y-1.5 max-h-40 sm:max-h-48 overflow-y-auto">
                  {filteredInstructors.map(instructor => (
                    <label key={instructor.id} className="flex items-center cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        checked={selectedInstructors.includes(instructor.id)}
                        onChange={() => toggleInstructor(instructor.id)}
                      />
                      <div className="ml-2 sm:ml-3 flex items-center min-w-0 flex-1">
                        <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-gray-200 flex items-center justify-center mr-2 flex-shrink-0">
                          <span className="text-xs font-medium">{getInstructorInitials(instructor.name)}</span>
                        </div>
                        <span className="text-sm text-gray-700 truncate">{instructor.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>            )}

            {/* Status filters */}
            <div className="sm:col-span-2">
              <h4 className="text-xs sm:text-sm font-medium text-gray-500 uppercase mb-2">Booking Status</h4>
              <div className="flex flex-wrap gap-1.5">
                {availableStatuses.map(status => (
                  <label key={status.value} className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={statusFilter.includes(status.value)}
                      onChange={() => toggleStatus(status.value)}
                    />
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      statusFilter.includes(status.value) 
                        ? `${status.color} ring-2 ring-blue-500 ring-offset-1` 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                      {status.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Enhanced mobile-responsive service filters */}
            {filteredServices.length > 0 && (
              <div>
                <h4 className="text-xs sm:text-sm font-medium text-gray-500 uppercase mb-2">Services</h4>
                <div className="space-y-1.5 max-h-40 sm:max-h-48 overflow-y-auto">
                  {filteredServices.map(service => (
                    <label key={service.id} className="flex items-center cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        checked={selectedServices.includes(service.id)}                        onChange={() => toggleService(service.id)}
                      />
                      <span className="ml-2 sm:ml-3 text-sm text-gray-700 truncate">{service.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarFilters;
