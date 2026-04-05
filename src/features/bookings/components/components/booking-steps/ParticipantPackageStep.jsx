import { useState, useEffect, useMemo } from 'react';
import { Select, Spin, Alert, Tag, Progress } from 'antd';
import { TagOutlined, ClockCircleOutlined, CalendarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

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
  
  // Format package details for display
  const formatPackageDetails = (pkg) => {
    const remainingHours = Number(pkg.remaining_hours || pkg.remainingHours || 0);
    const totalHours = Number(pkg.total_hours || pkg.totalHours || remainingHours);
    const lessonType = pkg.lesson_service_name || pkg.lessonServiceName || getLessonType(pkg.package_name || pkg.packageName);
    const expiryDate = pkg.expiry_date || pkg.expiryDate;
    const usagePercent = totalHours > 0 ? Math.round((remainingHours / totalHours) * 100) : 100;
    
    return { remainingHours, totalHours, lessonType, expiryDate, usagePercent };
  };
  
  // Check if package is expiring soon (within 7 days)
  const isExpiringSoon = (expiryDate) => {
    if (!expiryDate) return false;
    const expiry = dayjs(expiryDate);
    const now = dayjs();
    return expiry.diff(now, 'day') <= 7 && expiry.isAfter(now);
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
                    Select Package to Use
                  </label>
                  
                  {/* Package Cards Grid */}
                  <div className="grid gap-3">
                    {/* Wallet Balance Option */}
                    <div 
                      onClick={() => handlePackageSelection(index, null)}
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        !participant.selectedPackageId 
                          ? 'border-blue-500 bg-blue-50 shadow-sm' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                          !participant.selectedPackageId ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className="text-lg font-bold">€</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">Pay with Wallet Balance</div>
                          <div className="text-sm text-gray-500">Charge this lesson from customer's wallet</div>
                        </div>
                        {!participant.selectedPackageId && (
                          <CheckCircleOutlined className="text-blue-500 text-xl" />
                        )}
                      </div>
                    </div>
                    
                    {/* Package Options */}
                    {packages.map(pkg => {
                      const { remainingHours, totalHours, lessonType: pkgLessonType, expiryDate, usagePercent } = formatPackageDetails(pkg);
                      const isSelected = participant.selectedPackageId === pkg.id;
                      const expiringSoon = isExpiringSoon(expiryDate);
                      
                      return (
                        <div 
                          key={pkg.id}
                          onClick={() => handlePackageSelection(index, pkg.id)}
                          className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                            isSelected 
                              ? 'border-green-500 bg-green-50 shadow-sm' 
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${
                              isSelected ? 'bg-green-500 text-white' : 'bg-purple-100 text-purple-600'
                            }`}>
                              <TagOutlined className="text-lg" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {/* Package Name & Type */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 truncate">
                                  {pkg.package_name || pkg.packageName}
                                </span>
                                {pkgLessonType && (
                                  <Tag color="blue" className="text-xs">{pkgLessonType}</Tag>
                                )}
                                {expiringSoon && (
                                  <Tag color="orange" className="text-xs">Expiring Soon</Tag>
                                )}
                              </div>
                              
                              {/* Hours Remaining */}
                              <div className="mt-2 flex items-center gap-2">
                                <ClockCircleOutlined className="text-gray-400" />
                                <span className="text-sm text-gray-700 font-medium">
                                  {remainingHours.toFixed(1)} / {totalHours.toFixed(1)} hours remaining
                                </span>
                              </div>
                              
                              {/* Progress Bar */}
                              <Progress 
                                percent={usagePercent} 
                                size="small" 
                                strokeColor={usagePercent > 50 ? '#22c55e' : usagePercent > 20 ? '#f59e0b' : '#ef4444'}
                                showInfo={false}
                                className="mt-1"
                              />
                              
                              {/* Expiry Date */}
                              {expiryDate && (
                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                  <CalendarOutlined />
                                  <span>Expires: {dayjs(expiryDate).format('MMM D, YYYY')}</span>
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <CheckCircleOutlined className="text-green-500 text-xl flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Selection Confirmation */}
                  {participant.selectedPackageId && (
                    <div className="mt-3 p-3.5 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-xs flex-shrink-0">✓</span>
                        <span className="text-sm font-medium text-green-700">
                          Package hours will be deducted for this booking
                        </span>
                      </div>
                    </div>
                  )}
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
