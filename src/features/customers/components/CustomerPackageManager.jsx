import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Drawer,
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
function CustomerPackageManager({ visible, onClose, customer, onPackageAssigned, embedded = false, restrictParticipants = null, startAssignFlow = false, showHeader = true, showStats = true, showToolbar = true, forceViewMode = null, disableActions = false, discountsByEntity = null, onApplyDiscount = null, onEditPrice = null }) {
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
  const [pkgTypeFilter, setPkgTypeFilter] = useState('all');
  const [customerFinancialData, setCustomerFinancialData] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
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
    setPkgTypeFilter('all');
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
    form.setFieldsValue({ servicePackageId: pkg.id, purchasePrice: pkg.price });
    setManualSelectedPkgId(pkg.id);
  };

  const renderAssignDrawerContent = () => {
    const filtered = (availablePackages || []).filter(pkg => {
      const nameMatch = (pkg?.name || '').toLowerCase().includes(pkgSearch.toLowerCase());
      if (!nameMatch) return false;
      if (pkgTypeFilter === 'all') return true;
      const type = pkg.packageType || 'lesson';
      if (pkgTypeFilter === 'lesson') return type === 'lesson' || (!pkg.includesRental && !pkg.includesAccommodation);
      if (pkgTypeFilter === 'rental') return type === 'rental' || (pkg.includesRental && !pkg.includesAccommodation && type !== 'lesson');
      if (pkgTypeFilter === 'accommodation') return pkg.includesAccommodation === true || type === 'accommodation';
      return true;
    });
    const selPkg = availablePackages.find(p => p.id === manualSelectedPkgId) || selectedPkg;

    return (
      <Form form={form} layout="vertical" onFinish={handleAssignPackage}>
        <Form.Item name="servicePackageId" hidden><InputNumber /></Form.Item>

        {/* ── Package picker ── */}
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Select Package</label>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {[
              { key: 'all',           label: 'All',           active: 'bg-gray-700 text-white border-gray-700',           inactive: 'bg-white text-gray-500 border-gray-200 hover:border-gray-400' },
              { key: 'lesson',        label: 'Lesson',        active: 'bg-blue-500 text-white border-blue-500',           inactive: 'bg-blue-50 text-blue-500 border-blue-200 hover:border-blue-400' },
              { key: 'rental',        label: 'Rental',        active: 'bg-green-500 text-white border-green-500',         inactive: 'bg-green-50 text-green-600 border-green-200 hover:border-green-400' },
              { key: 'accommodation', label: 'Accommodation', active: 'bg-purple-500 text-white border-purple-500',       inactive: 'bg-purple-50 text-purple-600 border-purple-200 hover:border-purple-400' },
            ].map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setPkgTypeFilter(f.key)}
                className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-all ${
                  pkgTypeFilter === f.key ? f.active : f.inactive
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search packages…"
            prefix={<GiftOutlined className="text-gray-300" />}
            value={pkgSearch}
            onChange={e => setPkgSearch(e.target.value)}
            allowClear
            className="mb-3"
          />
          <div className="space-y-2 pr-1">
            {filtered.map(pkg => {
              const isSelected = (manualSelectedPkgId || selectedPkgId) === pkg.id;
              return (
                <div
                  key={pkg.id}
                  onClick={() => selectPackageCard(pkg)}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>{pkg.name}</div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {(pkg.includesLessons || pkg.includes_lessons) && <Tag color="blue" className="text-[10px] leading-none px-1.5 py-0 m-0 border-0 rounded">Lesson</Tag>}
                      {(pkg.includesRental || pkg.includes_rental) && <Tag color="green" className="text-[10px] leading-none px-1.5 py-0 m-0 border-0 rounded">Rental</Tag>}
                      {(pkg.includesAccommodation || pkg.includes_accommodation) && <Tag color="purple" className="text-[10px] leading-none px-1.5 py-0 m-0 border-0 rounded">Accommodation</Tag>}
                      {!(pkg.includesLessons || pkg.includes_lessons) && !(pkg.includesRental || pkg.includes_rental) && !(pkg.includesAccommodation || pkg.includes_accommodation) && <Tag color="default" className="text-[10px] leading-none px-1.5 py-0 m-0 border-0 rounded">Lesson</Tag>}
                    </div>
                    {pkg.description && <div className="text-[11px] text-gray-400 mt-0.5 truncate">{pkg.description.split(/[.\n]/)[0]}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold ${isSelected ? 'text-blue-600' : 'text-gray-700'}`}>
                      {formatCurrency(pkg.price || 0, pkg.currency || businessCurrency || 'EUR')}
                    </span>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                      ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {isSelected && <CheckCircleOutlined className="text-white text-[10px]" />}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm">No packages match your search.</div>
            )}
          </div>
        </div>

        {/* ── Price & Notes (only visible when a package is selected) ── */}
        {selPkg && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-500">Selected</span>
              <span className="text-sm font-semibold text-gray-800">{selPkg.name} · {selPkg.totalHours}h</span>
            </div>

            <Form.Item name="purchasePrice" label={<span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Price</span>} rules={[{ required: true, message: 'Enter price' }]} className="mb-3">
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                addonBefore={getCurrencySymbol(selPkg.currency || businessCurrency || 'EUR')}
              />
            </Form.Item>

            <Form.Item name="notes" label={<span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</span>} className="mb-0">
              <Input.TextArea rows={2} placeholder="Optional notes…" className="resize-none" />
            </Form.Item>
          </div>
        )}
      </Form>
    );
  };

  // eslint-disable-next-line complexity
  const handleAssignPackage = useCallback(async (values) => {
    // Capture customer reference at call time to prevent stale closure
    const currentCustomer = customer;
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
          selectedParticipants[0].userId : currentCustomer.id;
        
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
          if (customerId === currentCustomer.id) {
            setPackages(prev => [...prev, newCustomerPackage]);
          }
          
          const assignedCustomerName = selectedParticipants.length === 1 ? 
            selectedParticipants[0].userName : currentCustomer.name;
          
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
  }, [customer, availablePackages, selectedParticipants, form, loadCustomerFinancialData, onPackageAssigned, startAssignFlow, onClose]);

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
      title: 'Package',
      key: 'package',
      render: (_, record) => {
        // Show the actual stored package name (e.g. "Premium Pro Pack") as the
        // primary label. The combo type ("Lessons + Rental + Accommodation")
        // becomes the small subtitle so staff can still see what's bundled.
        const name = record.packageName || record.package_name || record.name
          || record.lessonServiceName || record.lesson_service_name
          || record.lessonType || 'Package';
        const hasLessons = (record.totalHours || record.total_hours || 0) > 0;
        const hasRental = (record.rentalDaysTotal || record.rental_days_total || 0) > 0;
        const hasAccommodation = (record.accommodationNightsTotal || record.accommodation_nights_total || 0) > 0;
        const typeParts = [];
        if (hasLessons) typeParts.push('Lessons');
        if (hasRental) typeParts.push('Rental');
        if (hasAccommodation) typeParts.push('Accommodation');
        const typeLabel = typeParts.length > 0 ? typeParts.join(' + ') : null;
        return (
          <div>
            <div className="font-medium">{name}</div>
            {typeLabel && <div className="text-xs text-slate-500">{typeLabel}</div>}
            {record.lessonType && record.lessonType !== name && (
              <div className="text-xs text-blue-500">
                <ClockCircleOutlined /> {record.lessonType}
              </div>
            )}
            {record.accommodationType && (
              <div className="text-xs text-gray-600">
                <HomeOutlined /> {record.accommodationType}
              </div>
            )}
          </div>
        );
      }
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
      render: (price, record) => {
        const cur = record.currency || businessCurrency || 'EUR';
        const current = Number(price) || 0;
        const rawOrig = record.originalPrice ?? record.original_price;
        const originalPrice = rawOrig !== null && rawOrig !== undefined ? Number(rawOrig) : null;
        const wasEdited = originalPrice !== null && Math.abs(originalPrice - current) >= 0.005;
        const d = discountsByEntity?.get(`customer_package:${record.id}`);

        // No edit, no discount: just the current price.
        if (!wasEdited && !d) {
          return <span className="tabular-nums">{formatCurrency(current, cur)}</span>;
        }

        // Compose the chain: [original (struck)] -> [current (struck if discounted)] -> [final]
        const final = d ? Math.max(0, current - (Number(d.amount) || 0)) : current;
        return (
          <Space size={4} wrap>
            {wasEdited && (
              <span className="tabular-nums line-through text-slate-400 text-xs">{formatCurrency(originalPrice, cur)}</span>
            )}
            {d ? (
              <>
                <span className="tabular-nums line-through text-slate-400 text-xs">{formatCurrency(current, cur)}</span>
                <span className="tabular-nums font-semibold text-emerald-600">{formatCurrency(final, cur)}</span>
                <Tag color="orange" className="!m-0">−{Number(d.percent)}%</Tag>
              </>
            ) : (
              <span className="tabular-nums font-semibold text-slate-700">{formatCurrency(current, cur)}</span>
            )}
            {wasEdited && !d && (
              <Tag color="blue" className="!m-0">edited</Tag>
            )}
          </Space>
        );
      }
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
          {!disableActions && onApplyDiscount && (
            <Button
              type="link"
              size="small"
              onClick={() => onApplyDiscount({
                entityType: 'customer_package',
                entityId: record.id,
                originalPrice: Number(record.price) || 0,
                currency: record.currency || businessCurrency || 'EUR',
                description: record.packageName || record.package_name || record.name || 'Package',
              })}
            >Discount</Button>
          )}
          {!disableActions && onEditPrice && (
            <Button
              type="link"
              size="small"
              onClick={() => onEditPrice({
                packageId: record.id,
                currentPrice: Number(record.price) || 0,
                originalPrice: record.originalPrice ?? record.original_price ?? null,
                currency: record.currency || businessCurrency || 'EUR',
                description: record.packageName || record.package_name || record.name || 'Package',
              })}
            >Edit Price</Button>
          )}
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
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 whitespace-nowrap flex items-center gap-1.5">
              <GiftOutlined className="text-purple-500" />
              Customer Packages
            </h3>
            <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
              <Input
                placeholder="Search packages…"
                allowClear
                prefix={<span className="text-gray-400 text-xs">🔍</span>}
                value={pkgListSearch}
                onChange={(e) => setPkgListSearch(e.target.value)}
                style={{ maxWidth: 200 }}
                size="small"
              />
              <Segmented
                value={forceViewMode || viewMode}
                onChange={(v) => setViewMode(v)}
                options={[{ label: 'Grid', value: 'grid' }, { label: 'Table', value: 'table' }]}
                disabled={!!forceViewMode}
                size="small"
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={onOpenAssign} size="small">
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

        {/* Assign Package Drawer (embedded context) */}
        <Drawer
          title={<span className="text-sm font-semibold text-gray-700">Assign Package</span>}
          open={assignModalVisible}
          onClose={() => {
            setAssignModalVisible(false);
            setSelectedParticipants([]);
            form.resetFields();
            setManualSelectedPkgId(null);
          }}
          width={420}
          placement="right"
          extra={
            <div className="flex items-center gap-2">
              <Button size="small" onClick={() => {
                setAssignModalVisible(false);
                setSelectedParticipants([]);
                form.resetFields();
                setManualSelectedPkgId(null);
              }}>Cancel</Button>
              <Button size="small" type="primary" loading={loading} disabled={!manualSelectedPkgId && !selectedPkgId} onClick={() => form.submit()}>Assign</Button>
            </div>
          }
          footer={null}
          styles={{ body: { padding: '16px' } }}
        >
          {renderAssignDrawerContent()}
        </Drawer>

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

    {/* Assign Package Drawer */}
  <Drawer
      title={<span className="text-sm font-semibold text-gray-700">Assign Package</span>}
      open={assignModalVisible || (visible && startAssignFlow)}
      onClose={() => {
        setAssignModalVisible(false);
        setSelectedParticipants([]);
        form.resetFields();
        setManualSelectedPkgId(null);
        if (startAssignFlow && typeof onClose === 'function') {
          onClose();
          return;
        }
      }}
      width={420}
      placement="right"
      extra={
        <div className="flex items-center gap-2">
          <Button size="small" onClick={() => {
            setAssignModalVisible(false);
            setSelectedParticipants([]);
            form.resetFields();
            setManualSelectedPkgId(null);
          }}>Cancel</Button>
          <Button size="small" type="primary" loading={loading} disabled={!manualSelectedPkgId && !selectedPkg} onClick={() => form.submit()}>Assign</Button>
        </div>
      }
      footer={null}
      styles={{ body: { padding: '16px' } }}
    >
        {renderAssignDrawerContent()}
      </Drawer>

  {/* Use Hours modal removed per requirements */}
    </div>
  );
}

export default CustomerPackageManager;
