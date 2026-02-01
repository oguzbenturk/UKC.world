import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Table,
  Button,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Space,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Progress,
  Empty,
  Alert,
  Steps,
  Segmented
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  GiftOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import moment from 'moment';
import FinancialService from '../../finances/services/financialService';
import eventBus from '@/shared/utils/eventBus';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

// Select.Option not used in the new wizard UI

// eslint-disable-next-line complexity
function CustomerPackageManager({ visible, onClose, customer, onPackageAssigned, embedded = false, restrictParticipants = null, startAssignFlow = false, showHeader = true, showStats = true, showToolbar = true, forceViewMode = null, disableActions = false }) {
  const { formatCurrency, businessCurrency, getCurrencySymbol } = useCurrency();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  // Removed unused lesson/accommodation services state to reduce noise
  // Use Hours flow removed; modal and selected package state no longer needed
  const [availablePackages, setAvailablePackages] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignStep, setAssignStep] = useState(1);
  const [pkgSearch, setPkgSearch] = useState('');
  const [customerFinancialData, setCustomerFinancialData] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'grid' | 'table'
  const [pkgListSearch, setPkgListSearch] = useState('');
  const [manualSelectedPkgId, setManualSelectedPkgId] = useState(null); // Track selected package for Next button

  // Pick a sensible default view based on viewport
  useEffect(() => {
    try {
      if (forceViewMode) {
        setViewMode(forceViewMode);
        return;
      }
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setViewMode(isMobile ? 'grid' : 'table');
    } catch {}
  }, [forceViewMode]);

  // Loaders wrapped in useCallback for stable identities
  const loadCustomerFinancialData = useCallback(async () => {
    try {
      if (customer?.id) {
        const financialData = await FinancialService.getUserBalance(customer.id);
        setCustomerFinancialData(financialData);
      }
    } catch {}
  }, [customer?.id]);

  const loadCustomerPackages = useCallback(async () => {
    try {
      setLoading(true);
      // Use the new API endpoint for customer packages
      const response = await fetch(`/api/services/customer-packages/${customer.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
  if (response.ok) {
        const customerPackages = await response.json();
        setPackages(customerPackages);
      } else {
        // For now, use mock data if API fails
        const mockPackages = [
          {
            id: 1,
            packageType: 'combo',
            lessonType: 'Private Lessons',
            accommodationType: 'Beachfront Villa',
            totalHours: 8,
            usedHours: 2,
            remainingHours: 6,
            accommodationNights: 5,
            usedNights: 1,
            remainingNights: 4,
            purchaseDate: '2025-06-20',
            expiryDate: '2025-09-20',
            status: 'active',
            price: 1200
          },
          {
            id: 2,
            packageType: 'lesson-only',
            lessonType: 'Semi Private Lessons',
            totalHours: 4,
            usedHours: 1,
            remainingHours: 3,
            purchaseDate: '2025-06-25',
            expiryDate: '2025-08-25',
            status: 'active',
            price: 320
          }
        ];
        setPackages(mockPackages);
      }
    } catch {
      message.error('Failed to load customer packages');
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  const loadAvailablePackages = useCallback(async () => {
    try {
      // Load available service packages that can be assigned to customers
      const response = await fetch('/api/services/packages', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const servicePackages = await response.json();
        setAvailablePackages(servicePackages);
      } else {
        // Failed to load packages - set empty list
        setAvailablePackages([]);
      }
    } catch {
      // Error loading packages - ignore and clear list
      setAvailablePackages([]);
    }
  }, []);

  const loadAvailableUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const users = await response.json();
        // Show all users (students, instructors, etc.) for group package assignment
        // Filter only to exclude the current user to avoid duplicate selection
        const allUsersExceptCurrent = users.filter(user => user.id !== customer.id);
        setAvailableUsers(allUsersExceptCurrent);
        
      } else {
        setAvailableUsers([]);
      }
    } catch {
      setAvailableUsers([]);
    }
  }, [customer?.id]);

  useEffect(() => {
    if ((visible || embedded) && customer) {
      loadCustomerPackages();
      loadAvailablePackages();
      if (!restrictParticipants || restrictParticipants.length === 0) {
        loadAvailableUsers();
      }
      loadCustomerFinancialData();
    }
  }, [visible, embedded, customer, restrictParticipants, loadCustomerPackages, loadAvailablePackages, loadAvailableUsers, loadCustomerFinancialData]);

  // Prepare assign flow opener before effects to avoid TDZ
  const onOpenAssign = useCallback(() => {
    form.resetFields();
    setAssignStep(1);
    setPkgSearch('');
    setManualSelectedPkgId(null); // Reset manual selection
    const defaults = (restrictParticipants && restrictParticipants.length > 0)
      ? restrictParticipants.map(p => ({
          userId: p.userId || p.id,
          userName: p.userName || p.name,
          userEmail: p.userEmail || p.email,
          isPrimary: !!p.isPrimary,
        }))
      : [{
          userId: customer.id,
          userName: customer.name,
          userEmail: customer.email,
          isPrimary: true
        }];
    setSelectedParticipants(defaults);
    // Ensure packages are fresh
    loadAvailablePackages();
    setAssignModalVisible(true);
  }, [form, restrictParticipants, customer?.id, customer?.name, customer?.email, loadAvailablePackages]);

  // Auto-open the assign wizard if requested by parent
  useEffect(() => {
    if (visible && startAssignFlow && !assignModalVisible) {
      onOpenAssign();
    }
  }, [visible, startAssignFlow, assignModalVisible, onOpenAssign]);

  // Wizard helpers
  const selectedPkgId = Form.useWatch('servicePackageId', form);
  const selectedPkg = availablePackages.find(p => p.id === selectedPkgId);
  
  // Log selection state changes
  useEffect(() => {
    if (selectedPkgId) {
      // selection changed (debug logs removed)
    }
  }, [selectedPkgId]);
  
  const hasParticipantStep = () => {
    // Admin/manager flow: never show participant step
    return false;
  };
  const totalSteps = () => 2;

  // Navigation handled directly in modal footer buttons

  // moved above to avoid TDZ

  const selectPackageCard = (pkg) => {
    // Set both form value AND state variable to ensure Next button enables
    form.setFieldsValue({ servicePackageId: pkg.id, purchasePrice: pkg.price });
    setManualSelectedPkgId(pkg.id);
    
    // For admin/manager assigning packages, always go directly to details step
    // The participant selection step is only needed for student self-booking with friends
    // Admin can assign the same package to multiple customers individually if needed
    setAssignStep(2);
  };

  const renderStepHeader = () => (
    <div className="mb-3">
      <Steps size="small" current={assignStep - 1} items={[
        { title: 'Package' },
        ...(hasParticipantStep() ? [{ title: 'Participants' }] : []),
        { title: 'Details' },
      ]} />
    </div>
  );

  const renderStep1Package = () => {
    const filtered = (availablePackages || []).filter(pkg =>
      (pkg?.name || '').toLowerCase().includes(pkgSearch.toLowerCase())
    );
    // Debug info removed
    return (
      <div className="space-y-3">
        {selectedPkg && isGroupPackage() && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded mb-3">
            <p className="text-sm text-blue-800">
              ✓ Selected: <strong>{selectedPkg.name}</strong> (Group Package)
              <br />
              Click "Next" to select participants for this group package.
            </p>
          </div>
        )}
        <Input
          placeholder="Search packages by name"
          value={pkgSearch}
          onChange={e => setPkgSearch(e.target.value)}
          allowClear
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(pkg => {
            const selected = selectedPkgId === pkg.id;
            return (
              <Card
                key={pkg.id}
                hoverable
                onClick={() => selectPackageCard(pkg)}
                className={selected ? 'border-blue-500' : ''}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{pkg.name}</div>
                    <div className="text-xs text-gray-500">{pkg.totalHours}h</div>
                  </div>
                  <div className="text-sm font-semibold">
                    {formatCurrency(pkg.price || 0, pkg.currency || businessCurrency || 'EUR')}
                  </div>
                </div>
                {pkg.description && (
                  <div className="mt-2 text-xs text-gray-600">{pkg.description}</div>
                )}
                {selected && <Tag color="blue" className="mt-2">Selected</Tag>}
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-gray-500 col-span-2">No packages match your search.</div>
          )}
        </div>
      </div>
    );
  };

  const renderStep2Participants = () => (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800 mb-2">Select participants for this group package:</p>
        {selectedParticipants.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Selected Participants:</p>
            <div className="flex flex-wrap gap-2">
              {selectedParticipants.map(participant => (
                <Tag key={participant.userId} color={participant.isPrimary ? 'gold' : 'blue'} closable onClose={() => handleParticipantToggle(participant.userId)}>
                  {participant.userName} {participant.isPrimary && '(Primary)'}
                </Tag>
              ))}
            </div>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
          {availableUsers.map(user => {
            const isSelected = selectedParticipants.some(p => p.userId === user.id);
            return (
              <div key={user.id} className={`p-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`} onClick={() => handleParticipantToggle(user.id)}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <div className="flex items-center">
                    {isSelected ? (
                      <CheckCircleOutlined className="text-blue-500" />
                    ) : (
                      <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderStepDetails = () => (
    <div className="space-y-3">
      {/* Keep fields wired to existing handler */}
      <Form.Item name="servicePackageId" hidden>
        <InputNumber />
      </Form.Item>
      <Form.Item name="purchasePrice" label="Purchase Price" rules={[{ required: true, message: 'Please enter purchase price' }]}> 
        <InputNumber
          min={0}
          precision={2}
          style={{ width: '100%' }}
          addonBefore={getCurrencySymbol((availablePackages.find(pkg => pkg.id === form.getFieldValue('servicePackageId'))?.currency) || businessCurrency || 'EUR')}
          placeholder="Package price"
        />
      </Form.Item>
      <Form.Item name="notes" label="Notes">
        <Input.TextArea rows={4} placeholder="Optional notes about this assignment" />
      </Form.Item>
    </div>
  );

  // eslint-disable-next-line complexity
  const handleAssignPackage = async (values) => {
    try {
      setLoading(true);
      
      const selectedServicePackage = availablePackages.find(pkg => pkg.id === values.servicePackageId);
      if (!selectedServicePackage) {
        message.error('Selected package not found');
        return;
      }

      // Determine if this is a group package assignment
      const isGroupAssignment = isGroupPackage() && selectedParticipants.length > 1;
      
      if (isGroupAssignment) {
        // Handle group package assignment
        if (selectedParticipants.length === 0) {
          message.error('Please select at least one participant for the group package');
          return;
        }
        
        // Create package assignments for all participants
        const assignmentPromises = selectedParticipants.map(participant => 
          fetch('/api/services/customer-packages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              customerId: participant.userId,
              servicePackageId: selectedServicePackage.id,
              packageName: selectedServicePackage.name,
              lessonServiceName: selectedServicePackage.lessonServiceName,
              totalHours: selectedServicePackage.totalHours,
              purchasePrice: values.purchasePrice || selectedServicePackage.price,
              currency: selectedServicePackage.currency,
              // expiry removed
              notes: `${values.notes || ''} - Group package assignment${participant.isPrimary ? ' (Primary)' : ''}`
            })
          })
        );
        
        const responses = await Promise.all(assignmentPromises);
        const successfulAssignments = [];
        const failedAssignments = [];
        
        for (let i = 0; i < responses.length; i++) {
          const response = responses[i];
          const participant = selectedParticipants[i];
          
          if (response.ok) {
            const newPackage = await response.json();
            successfulAssignments.push({ participant, package: newPackage });
          } else {
            const error = await response.json();
            failedAssignments.push({ participant, error: error.error || 'Unknown error' });
          }
        }
        
        // Show results
        if (successfulAssignments.length > 0) {
          message.success(`Successfully assigned package to ${successfulAssignments.length} participant(s)!`);
          eventBus.emit('packages:changed', { reason: 'assign', customers: selectedParticipants.map(p => p.userId) });
          
          // If the current customer got a package, update the local state
          const currentCustomerAssignment = successfulAssignments.find(
            assignment => assignment.participant.userId === customer.id
          );
          if (currentCustomerAssignment) {
            setPackages(prev => [...prev, currentCustomerAssignment.package]);
          }
        }
        
        if (failedAssignments.length > 0) {
          message.error(`Failed to assign package to ${failedAssignments.length} participant(s)`);
        }
        
      } else {
        // Handle single customer assignment (existing logic)
        const customerId = selectedParticipants.length === 1 ? 
          selectedParticipants[0].userId : customer.id;
        
        const response = await fetch('/api/services/customer-packages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            customerId: customerId,
            servicePackageId: selectedServicePackage.id,
            packageName: selectedServicePackage.name,
            lessonServiceName: selectedServicePackage.lessonServiceName,
            totalHours: selectedServicePackage.totalHours,
            purchasePrice: values.purchasePrice || selectedServicePackage.price,
            currency: selectedServicePackage.currency,
            // expiry removed
            notes: values.notes
          })
        });
        
        if (response.ok) {
          const newCustomerPackage = await response.json();
          
          // Only update local state if assigning to current customer
          if (customerId === customer.id) {
            setPackages(prev => [...prev, newCustomerPackage]);
          }
          
          const assignedCustomerName = selectedParticipants.length === 1 ? 
            selectedParticipants[0].userName : customer.name;
          
          message.success(`Package "${selectedServicePackage.name}" assigned to ${assignedCustomerName}!`);
          eventBus.emit('packages:changed', { reason: 'assign', customers: [customerId] });
        } else {
          const error = await response.json();
          message.error(error.error || 'Failed to assign package');
        }
      }
      
      // Reset form and close modal; close parent when in standalone assign mode
      setAssignModalVisible(false);
      setSelectedParticipants([]);
      form.resetFields();
      
      // Refresh financial data after package assignment
      await loadCustomerFinancialData();
      
      if (onPackageAssigned) {
        onPackageAssigned();
      }
      if (startAssignFlow && typeof onClose === 'function') {
        onClose();
      }
      
  } catch {
      message.error('Failed to assign package');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePackage = async (packageId) => {
    try {
      setLoading(true);
      
      // Actually delete the package from the database
      const response = await fetch(`/api/services/customer-packages/${packageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        // Only remove from local state if API call succeeds
  setPackages(prev => prev.filter(p => p.id !== packageId));
        message.success('Package deleted successfully');
  eventBus.emit('packages:changed', { reason: 'delete', customers: [customer.id] });
        
        // Refresh financial data after package deletion
        await loadCustomerFinancialData();
        
        // Notify parent component to reload financial data
        if (onPackageAssigned) {
          onPackageAssigned();
        }
      } else {
        const error = await response.json();
        message.error(error.error || 'Failed to delete package');
      }
  } catch {
      message.error('Failed to delete package');
    } finally {
      setLoading(false);
    }
  };

  // Use Hours flow disabled per request; related handlers removed

  // Handle participant selection for group packages
  const handleParticipantToggle = (userId) => {
    setSelectedParticipants(prev => {
      const isSelected = prev.some(p => p.userId === userId);
      if (isSelected) {
        return prev.filter(p => p.userId !== userId);
      } else {
        const user = availableUsers.find(u => u.id === userId);
        if (user) {
          return [...prev, {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            isPrimary: prev.length === 0, // First participant is primary
          }];
        }
        return prev;
      }
    });
  };

  // Check if selected package is a group package
  const isGroupPackage = () => {
    const selectedServicePackage = availablePackages.find(pkg => 
      pkg.id === form.getFieldValue('servicePackageId')
    );
    
    if (!selectedServicePackage) return false;
    
    // Check for group indicators in package name or lesson service name
    const packageName = (selectedServicePackage.name || '').toLowerCase();
    const lessonServiceName = (selectedServicePackage.lessonServiceName || '').toLowerCase();
    
    return packageName.includes('group') || 
           lessonServiceName.includes('group') ||
           packageName.includes('semi private') ||
           lessonServiceName.includes('semi private') ||
           packageName.includes('duo') ||
           lessonServiceName.includes('duo');
  };

  const getStatusColor = (pkg) => {
    const remainingHours = pkg.remainingHours !== undefined ? pkg.remainingHours : pkg.remaining_hours;
    const remainingNights = pkg.accommodationNightsRemaining !== undefined ? pkg.accommodationNightsRemaining : pkg.accommodation_nights_remaining;
    const remainingRentalDays = pkg.rentalDaysRemaining !== undefined ? pkg.rentalDaysRemaining : pkg.rental_days_remaining;
    
    // Check what resources this package has
    const hasLessons = (pkg.totalHours || pkg.total_hours || 0) > 0;
    const hasAccommodation = (pkg.accommodationNightsTotal || pkg.accommodation_nights_total || 0) > 0;
    const hasRental = (pkg.rentalDaysTotal || pkg.rental_days_total || 0) > 0;
    
    // If no tracked resources at all, check package type or name to determine if it should be "Active"
    const hasNoTrackedResources = !hasLessons && !hasAccommodation && !hasRental;
    if (hasNoTrackedResources) {
      // Package with no tracking is considered active (e.g., rental/accommodation without proper tracking setup)
      return 'green';
    }
    
    // Check if all tracked resources are exhausted
    let allExhausted = true;
    if (hasLessons && (remainingHours === undefined || remainingHours > 0)) allExhausted = false;
    if (hasAccommodation && (remainingNights === undefined || remainingNights > 0)) allExhausted = false;
    if (hasRental && (remainingRentalDays === undefined || remainingRentalDays > 0)) allExhausted = false;
    
    return allExhausted ? 'blue' : 'green';
  };

  const getStatusText = (pkg) => {
    const remainingHours = pkg.remainingHours !== undefined ? pkg.remainingHours : pkg.remaining_hours;
    const remainingNights = pkg.accommodationNightsRemaining !== undefined ? pkg.accommodationNightsRemaining : pkg.accommodation_nights_remaining;
    const remainingRentalDays = pkg.rentalDaysRemaining !== undefined ? pkg.rentalDaysRemaining : pkg.rental_days_remaining;
    
    // Check what resources this package has
    const hasLessons = (pkg.totalHours || pkg.total_hours || 0) > 0;
    const hasAccommodation = (pkg.accommodationNightsTotal || pkg.accommodation_nights_total || 0) > 0;
    const hasRental = (pkg.rentalDaysTotal || pkg.rental_days_total || 0) > 0;
    
    // If no tracked resources at all, check package type or name to determine if it should be "Active"
    const hasNoTrackedResources = !hasLessons && !hasAccommodation && !hasRental;
    if (hasNoTrackedResources) {
      // Package with no tracking is considered active (e.g., rental/accommodation without proper tracking setup)
      return 'Active';
    }
    
    // Check if all tracked resources are exhausted
    let allExhausted = true;
    if (hasLessons && (remainingHours === undefined || remainingHours > 0)) allExhausted = false;
    if (hasAccommodation && (remainingNights === undefined || remainingNights > 0)) allExhausted = false;
    if (hasRental && (remainingRentalDays === undefined || remainingRentalDays > 0)) allExhausted = false;
    
    return allExhausted ? 'Completed' : 'Active';
  };

  const columns = [
    {
      title: 'Package Type',
      key: 'packageType',
      render: (_, record) => (
        <div>
          <div className="font-medium">
            {record.packageType === 'combo' ? 'Combo Package' : 
             record.packageType === 'lesson-only' ? 'Lessons Only' : 
             'Accommodation Only'}
          </div>
          {record.lessonType && (
            <div className="text-xs text-gray-600">
              <ClockCircleOutlined /> {record.lessonType}
            </div>
          )}
          {record.accommodationType && (
            <div className="text-xs text-gray-600">
              <HomeOutlined /> {record.accommodationType}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, record) => (
        <div className="space-y-2">
          {/* Lesson Hours Progress */}
          {((record.totalHours || record.total_hours || 0) > 0) && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Hours: {record.usedHours || record.used_hours || 0}/{record.totalHours || record.total_hours}</span>
                <span>{record.remainingHours !== undefined ? record.remainingHours : record.remaining_hours} left</span>
              </div>
              <Progress 
                percent={Math.round(((record.usedHours || record.used_hours || 0) / (record.totalHours || record.total_hours)) * 100)}
                size="small"
                strokeColor="var(--brand-success)"
              />
            </div>
          )}

          {/* Rental Days Progress */}
          {((record.rentalDaysTotal || record.rental_days_total || 0) > 0) && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Rental: {record.rentalDaysUsed || record.rental_days_used || 0}/{record.rentalDaysTotal || record.rental_days_total}</span>
                <span>{record.rentalDaysRemaining !== undefined ? record.rentalDaysRemaining : record.rental_days_remaining} left</span>
              </div>
              <Progress 
                percent={Math.round(((record.rentalDaysUsed || record.rental_days_used || 0) / (record.rentalDaysTotal || record.rental_days_total)) * 100)}
                size="small"
                strokeColor="#52c41a"
              />
            </div>
          )}

          {/* Accommodation Nights Progress */}
          {((record.accommodationNightsTotal || record.accommodation_nights_total || 0) > 0) && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Nights: {record.accommodationNightsUsed || record.accommodation_nights_used || 0}/{record.accommodationNightsTotal || record.accommodation_nights_total}</span>
                <span>{record.accommodationNightsRemaining !== undefined ? record.accommodationNightsRemaining : record.accommodation_nights_remaining} left</span>
              </div>
              <Progress 
                percent={Math.round(((record.accommodationNightsUsed || record.accommodation_nights_used || 0) / (record.accommodationNightsTotal || record.accommodation_nights_total)) * 100)}
                size="small"
                strokeColor="var(--brand-primary)"
              />
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Purchase Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      render: (date) => moment(date).format('MMM DD, YYYY')
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => formatCurrency(price || 0, record.currency || businessCurrency || 'EUR')
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <Tag color={getStatusColor(record)}>
          {getStatusText(record)}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {/* Use Hours UI intentionally hidden across the app per requirements */}
          
          <Popconfirm
            title="Are you sure you want to delete this package?"
            onConfirm={() => handleDeletePackage(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button 
              type="text" 
              danger
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const filteredPackages = (packages || []).filter((p) => {
    const q = (pkgListSearch || '').trim().toLowerCase();
    if (!q) return true;
    const name = (p.packageName || p.package_name || p.name || p.lessonType || p.serviceName || p.service_name || '').toLowerCase();
    const acc = (p.accommodationType || '').toLowerCase();
    return name.includes(q) || acc.includes(q);
  });

  const getPackageTitle = (record) => (
    record.packageName || record.package_name || record.name || record.lessonType || record.serviceName || record.service_name || 'Package'
  );

  const renderLessonProgress = (record) => {
    // Support both camelCase and snake_case field names from API
    const totalHours = record.totalHours || record.total_hours;
    const usedHours = record.usedHours || record.used_hours || 0;
    const remainingHours = record.remainingHours !== undefined ? record.remainingHours : record.remaining_hours;
    
    // Show lesson progress if package has hours data (regardless of packageType)
    if (totalHours > 0) {
      return (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>🎓 Hours: {usedHours}/{totalHours}</span>
            <span>{remainingHours !== undefined ? remainingHours : (totalHours - usedHours)} left</span>
          </div>
          <Progress percent={Math.round((usedHours / totalHours) * 100)} size="small" strokeColor="#1890ff" />
        </div>
      );
    }
    return null;
  };

  const renderRentalProgress = (record) => {
    // Support both camelCase and snake_case field names from API
    const rentalDaysTotal = record.rentalDaysTotal || record.rental_days_total || 0;
    const rentalDaysUsed = record.rentalDaysUsed || record.rental_days_used || 0;
    const rentalDaysRemaining = record.rentalDaysRemaining !== undefined ? record.rentalDaysRemaining : record.rental_days_remaining;
    
    // Show rental progress if package has rental days data
    if (rentalDaysTotal > 0) {
      return (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>🏄 Rental Days: {rentalDaysUsed}/{rentalDaysTotal}</span>
            <span>{rentalDaysRemaining !== undefined ? rentalDaysRemaining : (rentalDaysTotal - rentalDaysUsed)} left</span>
          </div>
          <Progress percent={Math.round((rentalDaysUsed / rentalDaysTotal) * 100)} size="small" strokeColor="#52c41a" />
        </div>
      );
    }
    return null;
  };

  const renderNightProgress = (record) => {
    // Support both camelCase and snake_case field names from API
    const accommodationNights = record.accommodationNightsTotal || record.accommodation_nights_total || 0;
    const usedNights = record.accommodationNightsUsed || record.accommodation_nights_used || 0;
    const remainingNights = record.accommodationNightsRemaining !== undefined 
      ? record.accommodationNightsRemaining 
      : (record.accommodation_nights_remaining !== undefined 
        ? record.accommodation_nights_remaining 
        : (accommodationNights - usedNights));
    
    // Show night progress if package has accommodation data
    if (accommodationNights > 0) {
      return (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>🏨 Nights: {usedNights}/{accommodationNights}</span>
            <span>{remainingNights} left</span>
          </div>
          <Progress percent={Math.round((usedNights / accommodationNights) * 100)} size="small" strokeColor="#fa8c16" />
        </div>
      );
    }
    return null;
  };

  const renderCardActions = (record, _statusText) => (
    disableActions ? null : (
      <Space size="small">
        {/* Use Hours button removed per requirements */}
        <Popconfirm
          title="Delete this package?"
          onConfirm={() => handleDeletePackage(record.id)}
        >
          <Button danger size="small">Delete</Button>
        </Popconfirm>
      </Space>
    )
  );

  const renderPackageCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {filteredPackages.map((record) => {
        const title = getPackageTitle(record);
        const statusText = getStatusText(record);
        const statusColor = getStatusColor(record);
        
        // Check if package has any tracking data
        const hasLessonTracking = (record.totalHours || record.total_hours || 0) > 0;
        const hasRentalTracking = (record.rentalDaysTotal || record.rental_days_total || 0) > 0;
        const hasAccommodationTracking = (record.accommodationNightsTotal || record.accommodation_nights_total || 0) > 0;
        const hasAnyTracking = hasLessonTracking || hasRentalTracking || hasAccommodationTracking;
        
        // Determine package type from name if not explicitly set
        const packageName = (title || '').toLowerCase();
        const isRentalPackage = packageName.includes('rental') || record.packageType === 'rental' || record.includes_rental;
        const isAccommodationPackage = packageName.includes('stay') || packageName.includes('accommodation') || record.packageType === 'accommodation' || record.includes_accommodation;
        
        return (
          <Card key={record.id} className="shadow-sm" hoverable>
            <div className="flex justify-between items-start mb-2">
              <div className="font-medium text-gray-900">{title}</div>
              <Tag color={statusColor}>{statusText}</Tag>
            </div>
            <div className="space-y-2 text-sm">
              {/* Show tracking progress if available */}
              {renderLessonProgress(record)}
              {renderRentalProgress(record)}
              {renderNightProgress(record)}
              
              {/* If no tracking data but package appears to be rental/accommodation, show a note */}
              {!hasAnyTracking && (isRentalPackage || isAccommodationPackage) && (
                <div className="text-xs text-gray-500 italic">
                  {isRentalPackage && !hasRentalTracking && '🏄 Rental package'}
                  {isRentalPackage && isAccommodationPackage && ' + '}
                  {isAccommodationPackage && !hasAccommodationTracking && '🏨 Stay package'}
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-between items-center">
              <div className="text-xs text-gray-500">{formatCurrency(record.price || 0, record.currency || businessCurrency || 'EUR')}</div>
              {renderCardActions(record, statusText)}
            </div>
          </Card>
        );
      })}
      {filteredPackages.length === 0 && (
        <div className="col-span-1 sm:col-span-2 lg:col-span-3"><Empty description="No packages match your search" /></div>
      )}
    </div>
  );

  const totalPackages = packages.length;
  const activePackages = packages.filter(p => getStatusText(p) === 'Active').length;
  const totalValue = packages.reduce((sum, p) => sum + (p.price || 0), 0);

  const Body = (
      <div className="space-y-6">
        {/* Header Stats */}
        {showStats && (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Total Packages"
                  value={totalPackages}
                  prefix={<GiftOutlined />}
                  valueStyle={{ color: 'var(--brand-primary)' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Active Packages"
                  value={activePackages}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: 'var(--brand-success)' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Total Value"
                  valueRender={() => (
                    <span style={{ color: '#722ed1', fontWeight: 600 }}>
                      {formatCurrency(totalValue, packages[0]?.currency || businessCurrency || 'EUR')}
                    </span>
                  )}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Customer Balance Alert */}
        {showStats && (
          <Alert
            message={`Customer Balance: ${formatCurrency(customerFinancialData?.currentBalance || 0, businessCurrency || 'EUR')}`}
            description="Balance will be deducted when packages are purchased"
            type="info"
            showIcon
          />
        )}

        {/* Toolbar: title, search, view toggle, assign */}
        {showToolbar && (
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <h3 className="text-lg font-semibold">Customer Packages</h3>
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <Input
                placeholder="Search packages"
                allowClear
                value={pkgListSearch}
                onChange={(e) => setPkgListSearch(e.target.value)}
                style={{ maxWidth: 260 }}
              />
              <Segmented
                value={forceViewMode || viewMode}
                onChange={(v) => setViewMode(v)}
                options={[{ label: 'Grid', value: 'grid' }, { label: 'Table', value: 'table' }]}
                disabled={!!forceViewMode}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={onOpenAssign}>
                Assign Package
              </Button>
            </div>
          </div>
        )}

        {/* Packages List - responsive */}
        {packages.length > 0 ? (
          (forceViewMode || viewMode) === 'grid' ? (
            renderPackageCards()
          ) : (
            <UnifiedTable title="Customer Packages" density="comfortable">
              <Table
                columns={columns}
                dataSource={filteredPackages}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="middle"
                loading={loading}
              />
            </UnifiedTable>
          )
        ) : (
          <Empty description="No packages found for this customer" />
        )}
      </div>
  );

  if (embedded) {
    // Render the body content and keep internal modals so `form` is connected
    return (
      <div className="p-2">
        {showHeader && (
          <div className="mb-3 flex items-center gap-2 text-base font-semibold">
            <GiftOutlined />
            <span>Package Manager - {customer?.name}</span>
          </div>
        )}
        {Body}

        {/* Assign Package Modal (embedded context) - Wizard */}
        <Modal
          title="Assign Service Package"
          open={assignModalVisible}
          onCancel={() => {
            setAssignModalVisible(false);
            setSelectedParticipants([]);
            form.resetFields();
            setAssignStep(1);
            setManualSelectedPkgId(null);
          }}
          footer={(() => {
            const currentTotalSteps = totalSteps();
            const hasNext = assignStep < currentTotalSteps;
            // Check form value directly instead of relying on state
            const formPackageId = form.getFieldValue('servicePackageId');
            const nextDisabled = assignStep === 1 && !(formPackageId || manualSelectedPkgId);
            

            
            return [
              <Button key="cancel" onClick={() => {
                setAssignModalVisible(false);
                setSelectedParticipants([]);
                form.resetFields();
                setAssignStep(1);
                setManualSelectedPkgId(null);
              }}>Cancel</Button>,
              assignStep > 1 && (
                <Button key="back" onClick={() => setAssignStep(assignStep - 1)}>Back</Button>
              ),
              hasNext ? (
                <Button key="next" type="primary" onClick={() => setAssignStep(assignStep + 1)} disabled={nextDisabled}>Next</Button>
              ) : (
                <Button key="assign" type="primary" loading={loading} onClick={() => form.submit()}>Assign</Button>
              )
            ];
          })()}
          width={800}
        >
          {renderStepHeader()}
          <Form form={form} layout="vertical" onFinish={handleAssignPackage}>
            {assignStep === 1 && renderStep1Package()}
            {hasParticipantStep() && assignStep === 2 && renderStep2Participants()}
            {assignStep === totalSteps() && renderStepDetails()}
          </Form>
        </Modal>

  {/* Use Hours Modal removed per requirements */}
      </div>
    );
  }

  return (
    <div>
      <Modal
        title={
          <div className="flex items-center space-x-2">
            <GiftOutlined />
            <span>Package Manager - {customer?.name}</span>
          </div>
        }
        open={visible && !startAssignFlow}
        onCancel={onClose}
        footer={null}
        width={1200}
        style={{ top: 20 }}
      >
        {Body}
      </Modal>

    {/* Assign Package Modal */}
  {/* Assign Package Modal - Wizard */}
  <Modal
      title="Assign Service Package"
      open={assignModalVisible || (visible && startAssignFlow)}
      onCancel={() => {
        setAssignModalVisible(false);
        setSelectedParticipants([]);
        form.resetFields();
        setAssignStep(1);
        if (startAssignFlow && typeof onClose === 'function') {
          onClose();
          return;
        }
      }}
      footer={[
        <Button key="cancel" onClick={() => {
          setAssignModalVisible(false);
          setSelectedParticipants([]);
          form.resetFields();
          setAssignStep(1);
        }}>Cancel</Button>,
        assignStep > 1 && (
          <Button key="back" onClick={() => setAssignStep(assignStep - 1)}>Back</Button>
        ),
        assignStep < totalSteps() ? (
          <Button key="next" type="primary" onClick={() => setAssignStep(assignStep + 1)} disabled={assignStep === 1 && !selectedPkg}>Next</Button>
        ) : (
          <Button key="assign" type="primary" loading={loading} onClick={() => form.submit()}>Assign</Button>
        )
      ]}
      width={800}
    >
        {renderStepHeader()}
        <Form form={form} layout="vertical" onFinish={handleAssignPackage}>
          {assignStep === 1 && renderStep1Package()}
          {hasParticipantStep() && assignStep === 2 && renderStep2Participants()}
          {assignStep === totalSteps() && renderStepDetails()}
        </Form>
      </Modal>

  {/* Use Hours modal removed per requirements */}
    </div>
  );
}

export default CustomerPackageManager;
