import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook for managing booking form state and validation
 * Centralizes form logic and provides optimized state management
 */
export const useBookingForm = (initialData = {}) => {
  const [formData, setFormData] = useState({
    userId: '',
    userName: '',
    userEmail: '',
    userPhone: '',
    date: '',
    startTime: '',
    endTime: '',
    instructorId: '',
    instructorName: '',
    serviceId: '',
    serviceName: '',
    servicePrice: 0,
    notes: '',
    isNewUser: false,
    usePackageHours: false,
    selectedPackage: null,
    participants: [],
    isGroupBooking: false,
    slotRefreshKey: 0,
    ...initialData
  });

  const updateFormData = useCallback((newData) => {
    setFormData(prevData => {
      const updatedData = {
        ...prevData,
        ...newData
      };
      return updatedData;
    });
  }, []);

  const resetFormData = useCallback(() => {
    setFormData({
      userId: '',
      userName: '',
      userEmail: '',
      userPhone: '',
      date: '',
      startTime: '',
      endTime: '',
      instructorId: '',
      instructorName: '',
      serviceId: '',
      serviceName: '',
      servicePrice: 0,
      notes: '',
      isNewUser: false,
      usePackageHours: false,
      selectedPackage: null,
      participants: [],
      isGroupBooking: false,
      slotRefreshKey: 0,
      ...initialData
    });
  }, [initialData]);

  // Validation logic
  const validateStep = useCallback((step) => {
    switch (step) {
      case 1: // User Selection
        return formData.participants && formData.participants.length > 0;
      case 2: // Time/Instructor Selection
        return formData.date && formData.startTime && formData.endTime && formData.instructorId;
      case 3: // Service Selection
        const hasService = formData.serviceId;
        if (!hasService) return false;
        
        if (formData.usePackageHours) {
          return formData.selectedPackage && formData.selectedPackage.id;
        }
        return true;
      case 4: // Package Assignment (optional step)
        // Package step is always valid - package assignment is optional
        return true;
      case 5: // Final Confirmation
        return validateStep(1) && validateStep(2) && validateStep(3);
      default:
        return false;
    }
  }, [formData]);

  const getValidationMessage = useCallback((step) => {
    switch (step) {
      case 1:
        return 'Please select at least one participant for the booking';
      case 2:
        return 'Please select date, time, and instructor';
      case 3:
        if (!formData.serviceId) {
          return 'Please select a service for the booking';
        }
        if (formData.usePackageHours && (!formData.selectedPackage || !formData.selectedPackage.id)) {
          return 'Please select a package or choose direct payment';
        }
        return 'Please complete service selection';
      case 4:
        return 'Package assignment is optional - click continue to proceed';
      case 5:
        return 'Please complete all previous steps before confirming';
      default:
        return 'Please complete all required fields';
    }
  }, [formData]);

  // Computed values
  const isGroupBooking = useMemo(() => 
    formData.participants && formData.participants.length > 1, 
    [formData.participants]
  );

  const primaryParticipant = useMemo(() => 
    formData.participants && formData.participants.length > 0 
      ? formData.participants.find(p => p.isPrimary) || formData.participants[0]
      : null, 
    [formData.participants]
  );

  const hasUnsavedChanges = useMemo(() => 
    formData.participants.length > 0 || 
    formData.serviceId || 
    formData.instructorId || 
    formData.date, 
    [formData]
  );

  return {
    formData,
    updateFormData,
    resetFormData,
    validateStep,
    getValidationMessage,
    isGroupBooking,
    primaryParticipant,
    hasUnsavedChanges
  };
};
