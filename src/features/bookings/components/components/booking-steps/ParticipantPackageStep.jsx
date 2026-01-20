import { useState, useEffect, useMemo } from 'react';
import { Select, Spin, Alert } from 'antd';
import { TagOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

/**
 * Step for assigning packages to participants
 * 
 * @param {Object} props - Component props
 * @param {Object} props.formData - Current form data
 * @param {Function} props.updateFormData - Function to update form data
 * @returns {JSX.Element} ParticipantPackageStep component
 */
const ParticipantPackageStep = ({ formData, updateFormData }) => {
  const [loadingPackages, setLoadingPackages] = useState({});
  const [userPackages, setUserPackages] = useState({});
  
  const participants = useMemo(() => formData.participants || [], [formData.participants]);
  
  // Extract lesson type from service name for display
  const getLessonType = (serviceName) => {
    if (!serviceName) return '';
    const normalized = serviceName.toLowerCase();
    if (normalized.includes('group')) return 'Group';
    if (normalized.includes('semi-private') || normalized.includes('semi private')) return 'Semi-Private';
    if (normalized.includes('private')) return 'Private';
    return serviceName;
  };
  
  const lessonType = getLessonType(formData.serviceName);
  
  // Fetch packages for each participant
  useEffect(() => {
    const fetchPackagesForParticipants = async () => {
      for (const participant of participants) {
        if (!participant.userId || userPackages[participant.userId]) {
          continue;
        }
        
        setLoadingPackages(prev => ({ ...prev, [participant.userId]: true }));
        
        try {
          // Build API URL with service filters to match packages by lesson type AND discipline
          const params = new URLSearchParams();
          if (formData.serviceName) params.append('serviceName', formData.serviceName);
          if (formData.serviceType) params.append('serviceType', formData.serviceType);
          if (formData.serviceCategory) params.append('serviceCategory', formData.serviceCategory);
          
          const url = `/users/${participant.userId}/packages${params.toString() ? `?${params.toString()}` : ''}`;
          
          const response = await apiClient.get(url);
          const packages = response.data || [];
          
          // Filter to active packages with remaining hours
          const activePackages = packages.filter(pkg => 
            pkg.status === 'active' && 
            (pkg.remaining_hours > 0 || pkg.remainingHours > 0)
          );
          
          setUserPackages(prev => ({ ...prev, [participant.userId]: activePackages }));
          
          // NOTE: Removed automatic package selection. Users must explicitly choose a package to use hours.
        } catch {
          // Error fetching packages - set empty array
          setUserPackages(prev => ({ ...prev, [participant.userId]: [] }));
        } finally {
          setLoadingPackages(prev => ({ ...prev, [participant.userId]: false }));
        }
      }
    };
    
    fetchPackagesForParticipants();
  }, [participants, userPackages, formData.serviceName, formData.serviceType, formData.serviceCategory]);
  
  const handlePackageSelection = (participantIndex, packageId) => {
    const updatedParticipants = [...participants];
    const participant = updatedParticipants[participantIndex];
    
    if (packageId) {
      const selectedPackage = userPackages[participant.userId]?.find(pkg => pkg.id === packageId);
      participant.usePackage = true;
      participant.selectedPackageId = packageId;
      participant.selectedPackageName = selectedPackage?.package_name || selectedPackage?.packageName;
      participant.paymentStatus = 'package';
      participant.customerPackageId = packageId; // Ensure this is set
    } else {
      // Explicitly clear ALL package-related fields
      participant.usePackage = false;
      participant.selectedPackageId = null;
      participant.selectedPackageName = null;
      participant.customerPackageId = null;
      participant.paymentStatus = 'paid';
    }

    updateFormData({ participants: updatedParticipants });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <TagOutlined className="text-blue-600" />
          Package & Balance Options
        </h3>
        <p className="text-sm text-gray-600">
          Select a package to use hours, or leave empty to charge from wallet balance.
        </p>
      </div>
      
      {/* Participant Package Selection */}
      <div className="space-y-4">
        {participants.map((participant, index) => {
          const packages = userPackages[participant.userId] || [];
          const loading = loadingPackages[participant.userId];
          const isPrimary = participant.isPrimary;
          
          return (
            <div 
              key={participant.userId}
              className={`border rounded-xl p-5 transition-all ${isPrimary ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-50/30 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">
                      {participant.userName}
                    </h4>
                    {isPrimary && (
                      <span className="text-xs px-2.5 py-0.5 bg-blue-500 text-white rounded-full font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{participant.userEmail}</p>
                </div>
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Spin size="small" />
                  <span className="ml-2 text-sm text-gray-500">Loading packages...</span>
                </div>
              ) : packages.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2.5 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600">
                      <TagOutlined className="text-xs" />
                    </span>
                    Use from Package
                  </label>
                  <Select
                    size="large"
                    style={{ width: '100%' }}
                    className="booking-package-select"
                    placeholder="Select a package or pay with wallet balance"
                    value={participant.selectedPackageId || undefined}
                    onChange={(value) => handlePackageSelection(index, value)}
                    allowClear
                    options={[
                      ...packages.map(pkg => ({
                        value: pkg.id,
                        label: pkg.package_name || pkg.packageName
                      }))
                    ]}
                  />
                  {/* Compute selected package info for display */}
                  {(() => {
                    const selectedPkg = packages.find(p => p.id === participant.selectedPackageId);
                    const remainingHours = Number(selectedPkg?.remaining_hours || selectedPkg?.remainingHours || 0);
                    return participant.selectedPackageId ? (
                      <div className="mt-3 p-3.5 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-xs flex-shrink-0">✓</span>
                          <span className="text-sm font-medium text-green-700">
                            Package selected • {remainingHours.toFixed(2)} hours will be deducted
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex-shrink-0">€</span>
                          <span className="text-sm font-medium text-blue-700">
                            Will be charged from wallet balance
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <Alert
                  message={`No ${lessonType} packages available`}
                  description={`This participant doesn't have any active ${lessonType} packages with remaining hours for this service type.`}
                  type="info"
                  showIcon
                  className="text-xs"
                />
              )}
              
              {/* Note: Removed duplicate gray wallet message; the blue euro-styled wallet message above is the canonical one */}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ParticipantPackageStep;
