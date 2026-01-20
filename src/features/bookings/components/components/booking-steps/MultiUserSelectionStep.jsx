import React, { useState, useMemo } from 'react';
import { Modal, Tag, Divider, Switch, Select } from 'antd';
import { PlusCircleIcon, MagnifyingGlassIcon, XMarkIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useToast } from '../../../../../shared/contexts/ToastContext';
import UserForm from '../../../../../shared/components/ui/UserForm';

/**
 * Step 1: Multi-User Selection
 * Allows selecting multiple users for group bookings with package support
 * 
 * @param {Object} props - Component props
 * @param {Object} props.formData - Current form data
 * @param {Function} props.updateFormData - Function to update form data
 * @param {Array} props.users - List of available users
 * @param {Function} props.onNext - Function to move to next step
 * @returns {JSX.Element} MultiUserSelectionStep component
 */
const MultiUserSelectionStep = ({ formData, updateFormData, users, onNext, onRefreshUsers }) => {
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userPackages, setUserPackages] = useState({}); // Store available packages for each user
  const { showSuccess, showError } = useToast();
  
  // Get selected participants from formData
  const selectedParticipants = formData.participants || [];
  
  // Fetch user packages when needed
  const fetchUserPackages = async (userId) => {
    if (userPackages[userId]) return userPackages[userId]; // Use cached data
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${userId}/packages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const packages = await response.json();
        const activePackages = packages.filter(pkg => 
          pkg.status === 'active' && 
          pkg.remaining_hours > 0
        );
        
        setUserPackages(prev => ({
          ...prev,
          [userId]: activePackages
        }));
        
        return activePackages;
      }
    } catch (error) {
      console.error('Error fetching user packages:', error);
    }
    
    return [];
  };
  
  // Handle user selection (add to participants)
  const handleUserSelect = async (user) => {
    const isAlreadySelected = selectedParticipants.some(p => p.userId === user.id);
    
    if (isAlreadySelected) {
      // Don't show error for clicking on already selected users - this is expected behavior
      // User might be clicking to review selection or by accident
      return;
    }
    
    // Fetch available packages for this user
    const availablePackages = await fetchUserPackages(user.id);
    
    const newParticipant = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
      isPrimary: selectedParticipants.length === 0, // First participant is primary
      paymentStatus: 'paid', // Pay-and-go: default to paid
      usePackage: false,
      selectedPackageId: null,
      availablePackages: availablePackages,
      manualCashPreference: false,
      notes: ''
    };
    
    const updatedParticipants = [...selectedParticipants, newParticipant];
    
    updateFormData({
      participants: updatedParticipants,
      // Keep backwards compatibility with single user fields
      userId: updatedParticipants[0]?.userId || '',
      userName: updatedParticipants[0]?.userName || '',
      userEmail: updatedParticipants[0]?.userEmail || '',
      userPhone: updatedParticipants[0]?.userPhone || ''
    });
  };
  
  // Handle user removal from participants
  const handleUserRemove = (userIdToRemove) => {
    const updatedParticipants = selectedParticipants.filter(p => p.userId !== userIdToRemove);
    
    // If removing the primary participant, make the first remaining participant primary
    if (updatedParticipants.length > 0) {
      const wasRemovingPrimary = selectedParticipants.find(p => p.userId === userIdToRemove)?.isPrimary;
      if (wasRemovingPrimary) {
        updatedParticipants[0].isPrimary = true;
      }
    }
    
    updateFormData({
      participants: updatedParticipants,
      // Update backwards compatibility fields
      userId: updatedParticipants[0]?.userId || '',
      userName: updatedParticipants[0]?.userName || '',
      userEmail: updatedParticipants[0]?.userEmail || '',
      userPhone: updatedParticipants[0]?.userPhone || ''
    });
  };
  
  // Set primary participant
  const handleSetPrimary = (userIdToSetPrimary) => {
    const updatedParticipants = selectedParticipants.map(p => ({
      ...p,
      isPrimary: p.userId === userIdToSetPrimary
    }));
    
    updateFormData({
      participants: updatedParticipants,
      // Update backwards compatibility fields with new primary
      userId: userIdToSetPrimary,
      userName: updatedParticipants.find(p => p.isPrimary)?.userName || '',
      userEmail: updatedParticipants.find(p => p.isPrimary)?.userEmail || '',
      userPhone: updatedParticipants.find(p => p.isPrimary)?.userPhone || ''
    });
  };
  
  // Handle package toggle for a participant
  const handlePackageToggle = (userId, usePackage) => {
    const updatedParticipants = selectedParticipants.map(p => {
      if (p.userId === userId) {
        return {
          ...p,
          usePackage: usePackage,
          selectedPackageId: usePackage && p.availablePackages?.length > 0 ? p.availablePackages[0].id : null,
          paymentStatus: usePackage ? 'package' : 'paid', // Pay-and-go: default to paid
          manualCashPreference: !usePackage
        };
      }
      return p;
    });
    
    updateFormData({
      participants: updatedParticipants
    });
  };
  
  // Handle package selection for a participant
  const handlePackageSelect = (userId, packageId) => {
    const updatedParticipants = selectedParticipants.map(p => {
      if (p.userId === userId) {
        return {
          ...p,
          selectedPackageId: packageId,
          manualCashPreference: false
        };
      }
      return p;
    });
    
    updateFormData({
      participants: updatedParticipants
    });
  };
  
  // Handle payment status change for a participant
  const handlePaymentStatusChange = (userId, paymentStatus) => {
    const updatedParticipants = selectedParticipants.map(p => {
      if (p.userId === userId) {
        return {
          ...p,
          paymentStatus: paymentStatus,
          manualCashPreference: true
        };
      }
      return p;
    });
    
    updateFormData({
      participants: updatedParticipants
    });
  };
  
  // Handle successful user creation
  const handleUserCreated = async () => {
    setShowNewUserModal(false);
    showSuccess('User created successfully! Please select the new user from the list below.');
    
    // Refresh the users list
    if (onRefreshUsers) {
      await onRefreshUsers();
    }
  };
  
  // Handle modal cancel
  const handleModalCancel = () => {
    setShowNewUserModal(false);
  };
  
  // Filter users based on search term and exclude already selected users
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    
    const selectedUserIds = selectedParticipants.map(p => p.userId);
    const availableUsers = users.filter(user => !selectedUserIds.includes(user.id));
    
    if (!searchTerm.trim()) return availableUsers;
    
    return availableUsers.filter(user => {
      const name = user.name || '';
      const email = user.email || '';
      const phone = user.phone || '';
      const searchLower = searchTerm.toLowerCase();
      
      return name.toLowerCase().includes(searchLower) ||
             email.toLowerCase().includes(searchLower) ||
             phone.toLowerCase().includes(searchLower);
    });
  }, [users, searchTerm, selectedParticipants]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-2">
          <UsersIcon className="h-8 w-8 text-blue-500 mr-2" />
          <h2 className="text-2xl font-bold text-gray-900">Select Participants</h2>
        </div>
        <p className="text-gray-600">Choose participants for this group booking. The first person selected will be the primary organizer.</p>
      </div>

      {/* Selected Participants */}
      {selectedParticipants.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-900">Selected Participants ({selectedParticipants.length})</h3>
            <Tag color="blue">{selectedParticipants.length} person{selectedParticipants.length !== 1 ? 's' : ''}</Tag>
          </div>
          
          <div className="space-y-3">
            {selectedParticipants.map((participant, index) => (
              <div key={participant.userId} className="bg-white rounded-md p-4 border border-gray-200">
                {/* Participant Info Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{participant.userName}</span>
                      {participant.isPrimary && (
                        <Tag color="gold" size="small">Primary Organizer</Tag>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {participant.userEmail && <div>{participant.userEmail}</div>}
                      {participant.userPhone && <div>{participant.userPhone}</div>}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {!participant.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(participant.userId)}
                        className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 border border-blue-300 rounded"
                      >
                        Make Primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUserRemove(participant.userId)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Remove participant"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Payment Options */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Payment Method</h4>
                  
                  {/* Package Option */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Switch
                          size="small"
                          checked={participant.usePackage || false}
                          onChange={(checked) => handlePackageToggle(participant.userId, checked)}
                          disabled={!participant.availablePackages || participant.availablePackages.length === 0}
                        />
                        <span className="text-sm">
                          Use Package Hours 
                          {participant.availablePackages && participant.availablePackages.length > 0 && 
                            ` (${participant.availablePackages.length} available)`
                          }
                        </span>
                      </div>
                      
                      {participant.usePackage && participant.availablePackages && participant.availablePackages.length > 0 && (
                        <Select
                          size="small"
                          style={{ width: 200 }}
                          value={participant.selectedPackageId}
                          onChange={(value) => handlePackageSelect(participant.userId, value)}
                          placeholder="Select package"
                        >
                          {participant.availablePackages.map(pkg => (
                            <Select.Option key={pkg.id} value={pkg.id}>
                              {pkg.package_name} ({pkg.remaining_hours}h left)
                            </Select.Option>
                          ))}
                        </Select>
                      )}
                    </div>
                    
                    {participant.availablePackages && participant.availablePackages.length === 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        No active packages with available hours
                      </div>
                    )}
                  </div>
                  
                  {/* Individual Payment Option */}
                  {!participant.usePackage && (
                    <div>
                      <span className="text-sm text-gray-600">Payment Status: </span>
                      <Select
                        size="small"
                        style={{ width: 120 }}
                        value={participant.paymentStatus || 'paid'}
                        onChange={(value) => handlePaymentStatusChange(participant.userId, value)}
                      >
                        <Select.Option value="paid">Paid</Select.Option>
                        <Select.Option value="paid">Paid</Select.Option>
                      </Select>
                    </div>
                  )}
                  
                  {participant.usePackage && (
                    <div className="text-sm text-green-600 font-medium">
                      ✓ Paying with package hours (no additional charge)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Available Users List */}
      <div className="bg-white border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
        {filteredUsers && filteredUsers.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {filteredUsers.map(user => {
              const isSelected = selectedParticipants.some(p => p.userId === user.id);
              return (
                <li 
                  key={user.id}
                  className={`px-4 py-3 transition-colors ${
                    isSelected 
                      ? 'bg-green-50 border-l-4 border-green-500 cursor-default' 
                      : 'cursor-pointer hover:bg-blue-50'
                  }`}
                  onClick={() => !isSelected && handleUserSelect(user)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className={`font-medium ${isSelected ? 'text-green-800' : 'text-gray-900'}`}>
                          {user.name}
                        </h5>
                        {isSelected && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                            ✓ Selected
                          </span>
                        )}
                      </div>
                      {user.email && <p className={`text-sm ${isSelected ? 'text-green-600' : 'text-gray-500'}`}>{user.email}</p>}
                      {user.phone && <p className={`text-sm ${isSelected ? 'text-green-600' : 'text-gray-500'}`}>{user.phone}</p>}
                    </div>
                    <div className={`${isSelected ? 'text-green-600' : 'text-blue-600 hover:text-blue-800'}`}>
                      {isSelected ? (
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      ) : (
                        <PlusCircleIcon className="h-5 w-5" />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-4 text-center text-gray-500">
            {searchTerm ? 'No users match your search.' : 'No additional users available.'}
          </div>
        )}
      </div>

      {/* Add new user button */}
      <button
        type="button"
        className="w-full py-3 px-4 flex justify-center items-center border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setShowNewUserModal(true)}
      >
        <PlusCircleIcon className="h-5 w-5 mr-2 text-gray-500" />
        Add New Customer
      </button>

      {/* Continue Button */}
      <div className="flex justify-between">
        <div></div>
        <button
          type="button"
          onClick={onNext}
          disabled={selectedParticipants.length === 0}
          className={`px-6 py-2 rounded-md font-medium ${
            selectedParticipants.length > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue ({selectedParticipants.length} participant{selectedParticipants.length !== 1 ? 's' : ''})
        </button>
      </div>
      
      {/* New User Modal */}
      <Modal
        title="Add New Customer"
        open={showNewUserModal}
        onCancel={handleModalCancel}
        footer={null}
        width={600}
  destroyOnHidden={true}
      >
        <UserForm 
          user={null} // New user
          roles={[]} // Will use default student role
          onSave={handleUserCreated}
          onCancel={handleModalCancel}
        />
      </Modal>
    </div>
  );
};

export default MultiUserSelectionStep;
