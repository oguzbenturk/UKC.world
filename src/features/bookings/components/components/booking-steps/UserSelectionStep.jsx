import { useState, useMemo } from 'react';
import { Modal } from 'antd';
import { PlusCircleIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../../../../../shared/contexts/ToastContext';
import UserForm from '../../../../../shared/components/ui/UserForm';

/**
 * Step 1: User Selection (Multi-User Support)
 * Allows selecting one or multiple users for bookings
 * Automatically handles single vs group bookings based on selection
 * 
 * @param {Object} props - Component props
 * @param {Object} props.formData - Current form data
 * @param {Function} props.updateFormData - Function to update form data
 * @param {Array} props.users - List of available users
 * @param {Function} props.onNext - Function to move to next step (optional if hideNavigation is true)
 * @param {boolean} props.hideNavigation - Whether to hide the navigation buttons
 * @returns {JSX.Element} UserSelectionStep component
 */
const UserSelectionStep = ({ formData, updateFormData, users, onNext, onRefreshUsers, hideNavigation = false }) => {
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { showSuccess } = useToast();
  
  // Get selected participants from formData (supporting both single and multi-user)
  const selectedParticipants = formData.participants || [];
  const _isMultiUserMode = selectedParticipants.length > 1;
  
  // Handle user selection (add to participants) or toggle deselection
  const handleUserSelect = async (user) => {
    const isAlreadySelected = selectedParticipants.some(p => p.userId === user.id);
    
    if (isAlreadySelected) {
      // If user is already selected, deselect them (toggle behavior)
      handleRemoveParticipant(user.id);
      return;
    }
    
    const newParticipant = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
      isPrimary: selectedParticipants.length === 0, // First participant is primary
      paymentStatus: 'paid', // Pay-and-go: default to paid
      notes: ''
    };
    
    const updatedParticipants = [...selectedParticipants, newParticipant];
    
    updateFormData({
      participants: updatedParticipants,
      // Keep backwards compatibility with single user fields
      userId: updatedParticipants[0]?.userId || '',
      userName: updatedParticipants[0]?.userName || '',
      userEmail: updatedParticipants[0]?.userEmail || '',
      userPhone: updatedParticipants[0]?.userPhone || '',
      // Set group booking flag based on participant count
      isGroupBooking: updatedParticipants.length > 1
    });
  };
  
  // Handle removing a selected participant
  const handleRemoveParticipant = (userId) => {
    const updatedParticipants = selectedParticipants.filter(p => p.userId !== userId);
    
    // Update primary flag if removing primary participant
    if (updatedParticipants.length > 0 && !updatedParticipants.some(p => p.isPrimary)) {
      updatedParticipants[0].isPrimary = true;
    }
    
    updateFormData({
      participants: updatedParticipants,
      userId: updatedParticipants[0]?.userId || '',
      userName: updatedParticipants[0]?.userName || '',
      userEmail: updatedParticipants[0]?.userEmail || '',
      userPhone: updatedParticipants[0]?.userPhone || '',
      isGroupBooking: updatedParticipants.length > 1
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
    // Filter users based on search term with memoization for performance
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users || [];
    
    return (users || []).filter(user => {
      const name = user.name || '';
      const email = user.email || '';
      const searchLower = searchTerm.toLowerCase();
      
      return name.toLowerCase().includes(searchLower) ||
             email.toLowerCase().includes(searchLower);    });
  }, [users, searchTerm]);
  
  // Determine if next button should be enabled
  const isNextEnabled = selectedParticipants.length > 0;
  
  return (
    <div>
      {/* Search bar */}
      <div className="mb-4 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search customers to add to booking..."
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Error handling for empty users */}
      {(!users || users.length === 0) && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800 text-sm">
            No customers available. You can add a new customer below.
          </p>
        </div>
      )}
      
      {/* No search results */}
      {users && users.length > 0 && filteredUsers.length === 0 && searchTerm && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-gray-600 text-sm">
            No customers found matching "{searchTerm}". Try a different search or add a new customer.
          </p>
        </div>
      )}
      
      {/* User list with improved mobile scrolling */}
      <div className="max-h-60 sm:max-h-80 overflow-y-auto mb-4 border border-gray-200 rounded-lg">
        {filteredUsers.length > 0 ? (
          <div className="space-y-1 sm:space-y-2 p-1 sm:p-2">
            {filteredUsers.map(user => {
              const selectedIndex = selectedParticipants.findIndex(p => p.userId === user.id);
              const isSelected = selectedIndex !== -1;
              const selectionOrder = selectedIndex + 1;
              
              const getOrdinalSuffix = (num) => {
                if (num % 100 >= 11 && num % 100 <= 13) return 'th';
                switch (num % 10) {
                  case 1: return 'st';
                  case 2: return 'nd';
                  case 3: return 'rd';
                  default: return 'th';
                }
              };

              return (
                <div 
                  key={user.id}
                  className={`relative p-3 sm:p-4 rounded-lg cursor-pointer transition-all duration-200 border ${
                    isSelected 
                      ? 'bg-green-50/50 border-green-300/50 shadow-sm' 
                      : 'bg-white border-gray-200 hover:border-blue-300/50 hover:shadow-sm hover:bg-gray-50/30'
                  }`}
                  onClick={() => handleUserSelect(user)}
                >
                  {/* Selection Order Badge */}
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-green-500 text-white text-xs font-bold rounded-full h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center border-2 border-white shadow-sm">
                      {selectionOrder}
                    </div>
                  )}
                  
                  {/* Selection Order Text */}
                  {isSelected && (
                    <div className="absolute top-1 left-1 sm:top-2 sm:left-2 bg-green-50/80 text-green-700 text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-green-200/50">
                      {selectionOrder}{getOrdinalSuffix(selectionOrder)} Selected
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className={`flex-1 ${isSelected ? 'mt-4 sm:mt-6' : ''}`}>
                      <h5 className="font-medium text-gray-900 text-sm sm:text-base">{user.name}</h5>
                      {user.email && (
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">{user.email}</p>
                      )}
                      {user.phone && (
                        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{user.phone}</p>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-center space-y-2 ml-4">
                      {/* Selection Circle */}
                      <div className={`h-5 w-5 rounded-full border-2 transition-all duration-200 ${
                        isSelected 
                          ? 'bg-green-500 border-green-500' 
                          : 'border-gray-300 hover:border-blue-400'
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-white m-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      
                      {/* Remove button for selected users - now also serves as visual indicator */}
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveParticipant(user.id);
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50/50 p-1 rounded-full transition-colors"
                          title="Remove from selection"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">
            {searchTerm ? 'No customers match your search.' : 'No customers available.'}
          </div>
        )}
      </div>
      
      {/* Add new user button - Mobile optimized */}
      <button
        type="button"
        className="w-full py-2.5 sm:py-3 px-3 sm:px-4 flex justify-center items-center border border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 bg-gray-50/30 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 mb-3 sm:mb-4"
        onClick={() => setShowNewUserModal(true)}
      >
        <PlusCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
        Add New Customer
      </button>
      
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
          onSuccess={handleUserCreated}
          onCancel={handleModalCancel}
        />
      </Modal>
      
      {/* Next button - Only render if navigation is not hidden */}
      {!hideNavigation && (
        <div className="mt-4 sm:mt-6">
          <button
            type="button"
            className={`w-full px-4 py-2.5 sm:py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors ${
              isNextEnabled 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            onClick={onNext}
            disabled={!isNextEnabled}
          >
            {selectedParticipants.length === 0 ? (
              'Select a customer to continue'
            ) : selectedParticipants.length === 1 ? (
              'Continue with Single Booking'
            ) : (
              `Continue with Group Booking (${selectedParticipants.length} participants)`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserSelectionStep;
