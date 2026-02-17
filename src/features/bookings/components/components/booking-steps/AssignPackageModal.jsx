import { useState, useEffect, useCallback, useMemo } from 'react';
import eventBus from '@/shared/utils/eventBus';
import { Modal, Form, Select } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

// Helper to get package price in specific currency from prices array
const getPackagePriceInCurrency = (pkg, targetCurrency) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  
  // Try to find price in target currency from the prices array
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const currencyPrice = pkg.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  // Fallback to default package price/currency
  return { price: pkg.price || 0, currency: pkg.currency || 'EUR' };
};

/**
 * Simple Assign Package Modal for direct package assignment during booking
 * Extracts just the assign functionality from CustomerPackageManager
 */
const AssignPackageModal = ({ 
  visible, 
  onClose, 
  customer, 
  onPackageAssigned, 
  restrictParticipants = null,
  service = null
}) => {
  const { formatCurrency, businessCurrency } = useCurrency();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [filteredPackages, setFilteredPackages] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [customerActivePackages, setCustomerActivePackages] = useState([]);
  
  // Get customer's preferred currency for price display
  const customerCurrency = customer?.preferred_currency || customer?.preferredCurrency || businessCurrency || 'EUR';

  // Load customer active packages function
  const loadCustomerActivePackages = useCallback(async (participantList) => {
    if (!participantList || participantList.length === 0) return;
    
    try {
      const token = localStorage.getItem('token');
      
      // Get customer IDs from participant list
      const customerIds = participantList.map(p => p.userId);
      const allPackages = [];
      
      for (const customerId of customerIds) {
        const response = await fetch(`/api/users/${customerId}/packages`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const packages = await response.json();
          // Normalize and filter active packages
          const normalized = packages.map(pkg => ({
            ...pkg,
            status: String(pkg.status || pkg.Status || '').toLowerCase(),
            remaining_hours: pkg.remaining_hours ?? pkg.remainingHours ?? 0,
            lesson_type: pkg.lesson_type ?? pkg.lessonType ?? pkg.lesson_service_name,
            package_name: pkg.package_name ?? pkg.packageName ?? pkg.name,
          }));
          const activePackages = normalized.filter(pkg => 
            pkg.status === 'active' && 
            (pkg.remaining_hours || 0) > 0
          );
          
          // Add customer info to each package for group bookings
          const packagesWithCustomer = activePackages.map(pkg => ({
            ...pkg,
            customerName: participantList.find(p => p.userId === customerId)?.userName || customer.name
          }));
          
          allPackages.push(...packagesWithCustomer);
        }
      }
      
      setCustomerActivePackages(allPackages);
    } catch {
      // Error loading customer packages
      setCustomerActivePackages([]);
    }
  }, [customer.name]);

  // Load available packages when modal opens
  useEffect(() => {
    if (visible) {
      loadAvailablePackages();
      
      // Set default participants first
      const defaultParticipants = (restrictParticipants && restrictParticipants.length > 0)
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
            isPrimary: true,
          }];
      
      setSelectedParticipants(defaultParticipants);
      
      // Load packages for default participants
      loadCustomerActivePackages(defaultParticipants);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer, restrictParticipants, loadCustomerActivePackages]);

  const normalize = (s = '') => (s || '').toString().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const hasAny = useCallback((str, keywords) => {
    const n = normalize(str);
    return keywords.some(k => n.includes(k));
  }, []);
  const LEVEL_TAGS = useMemo(() => ['premium','advanced','intermediate','beginner'], []);
  /* eslint-disable-next-line complexity */
  const inferServiceTags = useCallback((svc) => {
    const tags = new Set();
    const dTag = (svc?.disciplineTag || '').toLowerCase();
    const cTag = (svc?.lessonCategoryTag || '').toLowerCase();
    const lTag = (svc?.levelTag || '').toLowerCase();
    if (['foil','wing','kite'].includes(dTag)) tags.add(dTag);
    if (['group','semi-private','private','supervision'].includes(cTag)) tags.add(cTag);
    if (LEVEL_TAGS.includes(lTag)) tags.add(lTag);
    if (tags.size === 0) {
      const name = normalize(svc?.name);
      const category = normalize(svc?.category);
      const src = `${name} ${category}`;
      if (hasAny(src, ['foil'])) tags.add('foil');
      if (hasAny(src, ['wing'])) tags.add('wing');
      if (hasAny(src, ['kite','kitesurf','kitesurfing'])) tags.add('kite');
      if (hasAny(src, ['group'])) tags.add('group');
      if (hasAny(src, ['semi private','semi-private'])) tags.add('semi-private');
      if (hasAny(src, ['private']) && !tags.has('semi-private')) tags.add('private');
      if (hasAny(src, ['supervision'])) tags.add('supervision');
      LEVEL_TAGS.forEach(l => { if (hasAny(src, [l])) tags.add(l); });
    }
    return tags;
  }, [LEVEL_TAGS, hasAny]);
  const buildTagsFromSrc = useCallback((src) => {
    const tags = new Set();
    if (hasAny(src, ['foil'])) tags.add('foil');
    if (hasAny(src, ['wing'])) tags.add('wing');
    if (hasAny(src, ['kite','kitesurf','kitesurfing'])) tags.add('kite');
    if (hasAny(src, ['group'])) tags.add('group');
    if (hasAny(src, ['semi private','semi-private'])) tags.add('semi-private');
    if (hasAny(src, ['private']) && !tags.has('semi-private')) tags.add('private');
    if (hasAny(src, ['supervision'])) tags.add('supervision');
    LEVEL_TAGS.forEach(l => { if (hasAny(src, [l])) tags.add(l); });
    return tags;
  }, [LEVEL_TAGS, hasAny]);

  /* eslint-disable-next-line complexity */
  const inferPackageTags = useCallback((pkg) => {
    const tags = new Set();
    const dTag = (pkg?.disciplineTag || '').toLowerCase();
    const cTag = (pkg?.lessonCategoryTag || '').toLowerCase();
    const lTag = (pkg?.levelTag || '').toLowerCase();
    if (['foil','wing','kite'].includes(dTag)) tags.add(dTag);
    if (['group','semi-private','private','supervision'].includes(cTag)) tags.add(cTag);
    if (LEVEL_TAGS.includes(lTag)) tags.add(lTag);
    if (tags.size === 0) {
      const name = normalize(pkg?.name || pkg?.package_name);
      const lesson = normalize(pkg?.lessonServiceName || pkg?.lesson_service_name || pkg?.lesson_type);
      const src = `${name} ${lesson}`;
      return buildTagsFromSrc(src);
    }
    return tags;
  }, [buildTagsFromSrc, LEVEL_TAGS]);
  /* eslint-disable-next-line complexity */
  const matchesServiceByName = useCallback((svcName, pkg) => {
    const pkgName = normalize(pkg.name || pkg.package_name || '');
    const pkgLesson = normalize(pkg.lessonServiceName || pkg.lesson_service_name || '');
    
    return svcName.includes('group') && (pkgName.includes('group') || pkgLesson.includes('group')) ||
           svcName.includes('private') && (pkgName.includes('private') || pkgLesson.includes('private')) ||
           svcName.includes('premium') && (pkgName.includes('premium') || pkgLesson.includes('premium')) ||
           svcName.includes('beginner') && (pkgName.includes('beginner') || pkgLesson.includes('beginner'));
  }, []);

  // eslint-disable-next-line complexity
  const matchesServicePackage = useCallback((svc, pkg) => {
    if (!svc) return true; // if no specific service, show all
    
  // If service has structured tags, use strict tag matching
    if (svc.disciplineTag || svc.lessonCategoryTag || svc.levelTag) {
      const sTags = inferServiceTags(svc);
      const pTags = inferPackageTags(pkg);
      
      const discipline = ['foil','wing','kite'].find(t => sTags.has(t)) || null;
      if (discipline && !pTags.has(discipline)) return false;
      
      const category = ['group','semi-private','private','supervision'].find(t => sTags.has(t)) || null;
      if (category && !pTags.has(category)) return false;
      
      const level = LEVEL_TAGS.find(l => sTags.has(l)) || null;
      if (level && !pTags.has(level)) return false;
      
      return true;
    }
    
  // Fallback to name-based matching; if no clear signal, allow
  const byName = matchesServiceByName(normalize(svc.name || ''), pkg);
  return byName || true;
  }, [inferServiceTags, inferPackageTags, LEVEL_TAGS, matchesServiceByName]);

  const loadAvailablePackages = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/services/packages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const packages = await response.json();
        setAvailablePackages(packages);
        const fp = Array.isArray(packages) ? packages.filter(p => matchesServicePackage(service, p)) : [];
        setFilteredPackages(fp);
      }
    } catch {
      // Error loading packages
      message.error('Failed to load available packages');
    }
  }, [service, matchesServicePackage]);

  useEffect(() => {
    const fp = Array.isArray(availablePackages) ? availablePackages.filter(p => matchesServicePackage(service, p)) : [];
    setFilteredPackages(fp);
  }, [service, availablePackages, matchesServicePackage]);

  // Check if selected package is a group package
  const isGroupPackage = () => {
    const selectedServicePackage = availablePackages.find(pkg => 
      pkg.id === form.getFieldValue('servicePackageId')
    );
    
    if (!selectedServicePackage) return false;
    
    const packageName = (selectedServicePackage.name || '').toLowerCase();
    const lessonServiceName = (selectedServicePackage.lessonServiceName || '').toLowerCase();
    
    return packageName.includes('group') || 
           packageName.includes('semi-private') || 
           packageName.includes('semi private') ||
           lessonServiceName.includes('group') ||
           lessonServiceName.includes('semi-private') ||
           lessonServiceName.includes('semi private');
  };

  // Helper function to assign package to a single participant
  const assignPackageToParticipant = async (servicePackageId, participant) => {
    // Get the selected service package details
    const selectedServicePackage = availablePackages.find(pkg => pkg.id === servicePackageId);
    if (!selectedServicePackage) {
      throw new Error('Selected package not found');
    }

    const assignmentData = {
      customerId: participant.userId,
      servicePackageId: servicePackageId,
      packageName: selectedServicePackage.name,
      lessonServiceName: selectedServicePackage.lessonServiceName,
      totalHours: selectedServicePackage.totalHours,
      purchasePrice: selectedServicePackage.price,
  currency: selectedServicePackage.currency || businessCurrency || 'EUR',
      expiryDate: null, // No expiry date set during assignment
      notes: `Assigned during booking for ${participant.userName}`
    };

    const token = localStorage.getItem('token');
    const response = await fetch('/api/services/customer-packages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(assignmentData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to assign package to ${participant.userName}`);
    }
    
    return response;
  };

  // Helper function to handle group package assignment
  const handleGroupAssignment = async (servicePackageId, selectedServicePackage) => {
    if (selectedParticipants.length === 0) {
      throw new Error('Please select at least one participant for the group package');
    }
    
    // Create package assignments for all participants
    for (const participant of selectedParticipants) {
      await assignPackageToParticipant(servicePackageId, participant);
    }
    
    const participantNames = selectedParticipants.map(p => p.userName).join(', ');
    message.success(`Package "${selectedServicePackage.name}" successfully assigned to ${participantNames}!`);
  };

  // Helper function to handle single package assignment
  const handleSingleAssignment = async (servicePackageId, selectedServicePackage) => {
    const participant = selectedParticipants[0] || { userId: customer.id, userName: customer.name };
    await assignPackageToParticipant(servicePackageId, participant);
    
    message.success(`Package "${selectedServicePackage.name}" successfully assigned to ${participant.userName}!`);
  };

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
        await handleGroupAssignment(values.servicePackageId, selectedServicePackage);
      } else {
        await handleSingleAssignment(values.servicePackageId, selectedServicePackage);
      }
      
      // Reset form and close modal
      form.resetFields();
      setSelectedParticipants([]);
      onClose();
      // Broadcast change so other parts of the app refresh packages
      try {
        const affectedCustomerIds = selectedParticipants.length > 0
          ? selectedParticipants.map(p => p.userId)
          : [customer.id];
        eventBus.emit('packages:changed', { reason: 'assigned-in-step-booking', customers: affectedCustomerIds });
      } catch {}
      // Immediately refresh local active packages display in this modal context
      await loadCustomerActivePackages(selectedParticipants.length > 0 ? selectedParticipants : [{ userId: customer.id, userName: customer.name }]);
      
      if (onPackageAssigned) {
        onPackageAssigned();
      }
      
    } catch (error) {
      // Error assigning package
      message.error(error.message || 'Failed to assign package');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedParticipants([]);
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Assign Service Package"
      open={visible}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      width={800}
    >
      <Form form={form} layout="vertical" onFinish={handleAssignPackage}>
        <Form.Item 
          name="servicePackageId" 
          label="Select Package" 
          rules={[{ required: true, message: 'Please select a package' }]}
        >
          <Select
            placeholder="Choose a service package"
            onChange={(_value) => {
              // Just store the selection, don't reset participants
              // Participants are already set based on restrictParticipants
            }}
          >
            {(filteredPackages.length > 0 ? filteredPackages : availablePackages).map(pkg => {
              const { price: pkgPrice, currency: pkgCurrency } = getPackagePriceInCurrency(pkg, customerCurrency);
              return (
                <Option key={pkg.id} value={pkg.id}>
                  <div className="flex justify-between">
                    <span>{pkg.name}</span>
                    <span className="text-gray-500">{pkg.totalHours}h • {formatCurrency(pkgPrice, pkgCurrency)}</span>
                  </div>
                </Option>
              );
            })}
          </Select>
        </Form.Item>

        {/* Show customer's current active packages */}
        {customerActivePackages.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="text-sm font-medium text-amber-900 mb-2">
              {selectedParticipants.length > 1 ? "Participants' Active Packages:" : "Customer's Active Packages:"}
            </h4>
            <div className="space-y-2">
              {customerActivePackages.map((pkg) => (
                <div key={`${pkg.id}-${pkg.customerName || 'default'}`} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium text-amber-800">{pkg.package_name}</span>
                    {pkg.lesson_type && pkg.lesson_type !== pkg.package_name && (
                      <span className="text-amber-700 ml-2">({pkg.lesson_type})</span>
                    )}
                    {pkg.customerName && selectedParticipants.length > 1 && (
                      <span className="text-amber-600 ml-2">- {pkg.customerName}</span>
                    )}
                  </div>
                  <div className="text-amber-600">
                    {pkg.remaining_hours}h remaining
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700 mt-2">
              ℹ️ Consider the existing packages when choosing a new one to assign
            </p>
          </div>
        )}

        {/* Show selected participants */}
        {selectedParticipants.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">
              Package will be assigned to:
            </h4>
            <div className="space-y-1">
              {selectedParticipants.map((participant) => (
                <div key={participant.userId} className="text-sm text-blue-800">
                  {participant.userName} ({participant.userEmail})
                  {participant.isPrimary && <span className="ml-1 text-xs">(Primary)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Form>
    </Modal>
  );
};

export default AssignPackageModal;
