// src/features/rentals/components/NewRentalDrawer.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Drawer,
  Form,
  Select,
  DatePicker,
  Input,
  Button,
  Tag,
  Checkbox,
  Radio,
  Spin,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import Rental from '@/shared/models/Rental';
import { useData } from '@/shared/hooks/useData';
import { useAuth } from '@/shared/hooks/useAuth';
import { serviceApi } from '@/shared/services/serviceApi';
import apiClientDefault from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { Option } = Select;

const formatRentalDuration = (duration) => {
  const hours = Number(duration);
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (hours < 1) {
    const minutes = Math.max(15, Math.round(hours * 60));
    return `${minutes}m`;
  }
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${parseFloat(hours.toFixed(2))}h`;
};

const toArray = (value) => (Array.isArray(value) ? value : []);

// eslint-disable-next-line complexity
function NewRentalDrawer({ isOpen, onClose, onSuccess, editingRental }) {
  const { apiClient } = useData();
  const { user } = useAuth();
  const { businessCurrency, formatCurrency } = useCurrency();
  const messageApi = message;
  const [form] = Form.useForm();

  const canSelectPastDates = ['admin', 'manager', 'super_admin', 'owner'].includes(user?.role?.toLowerCase?.());

  const [customers, setCustomers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [participantMode, setParticipantMode] = useState('single');
  const [usePackage, setUsePackage] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [availableRentalPackages, setAvailableRentalPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);

  // Load customers
  const loadCustomers = useCallback(async () => {
    try {
      const client = apiClient || apiClientDefault;
      const response = await client.get('/users');
      const users = Array.isArray(response.data) ? response.data : [];
      setCustomers(
        users.filter(
          (u) => !u.user_role || u.user_role === 'student' || u.user_role === 'customer'
        )
      );
    } catch {
      setCustomers([]);
    }
  }, [apiClient]);

  // Load equipment (rental services only)
  const loadEquipment = useCallback(async () => {
    try {
      const [servicesData, categoriesData] = await Promise.all([
        serviceApi.getServices(),
        serviceApi.getFullServiceCategories(),
      ]);
      const rentalCats = categoriesData.filter(
        (cat) =>
          cat.status === 'active' &&
          (cat.type === 'rental' ||
            cat.name.toLowerCase().includes('rental') ||
            cat.name.toLowerCase().includes('equipment'))
      );
      const rentalCategoryNames = rentalCats.map((cat) => cat.name.toLowerCase());

      const isRentalService = (service) => {
        const cat = service.category?.toLowerCase() || '';
        const name = service.name?.toLowerCase() || '';
        const categoryMatch =
          rentalCategoryNames.includes(cat) ||
          cat === 'rental' ||
          cat === 'rentals' ||
          cat.includes('rental') ||
          cat.includes('equipment');
        const nameMatch = name.includes('rental') || name.includes('equipment');
        return Boolean(categoryMatch || nameMatch);
      };

      setEquipment(servicesData.filter(isRentalService));
    } catch {
      setEquipment([]);
    }
  }, []);

  // Load data when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    loadCustomers();
    loadEquipment();
  }, [isOpen, loadCustomers, loadEquipment]);

  // Pre-fill or reset form when drawer opens / editing target changes
  useEffect(() => {
    if (!isOpen) return;
    if (editingRental) {
      const isMultiple = editingRental.participant_type === 'multiple';
      setParticipantMode(isMultiple ? 'multiple' : 'single');
      form.setFieldsValue({
        customer_id: isMultiple ? undefined : editingRental.user_id,
        customer_ids: isMultiple ? [editingRental.user_id] : undefined,
        equipment_ids: editingRental.equipment_ids || [],
        rental_date: editingRental.rental_date ? dayjs(editingRental.rental_date) : dayjs(),
        status: editingRental.status || 'active',
        notes: editingRental.notes,
      });
    } else {
      form.resetFields();
      setParticipantMode('single');
      form.setFieldsValue({ status: 'active', rental_date: dayjs() });
    }
  }, [isOpen, editingRental, form]);

  // Sync participant mode → clear unused customer field
  useEffect(() => {
    if (participantMode === 'single') {
      form.setFieldsValue({ customer_ids: undefined });
    } else {
      form.setFieldsValue({ customer_id: undefined });
    }
  }, [participantMode, form]);

  // Fetch rental packages for selected customer
  const watchedCustomerId = Form.useWatch('customer_id', form);
  useEffect(() => {
    const fetchPackages = async () => {
      if (!watchedCustomerId || !apiClient) {
        setAvailableRentalPackages([]);
        setUsePackage(false);
        setSelectedPackageId(null);
        return;
      }
      setPackagesLoading(true);
      try {
        const res = await apiClient.get(`/services/customer-packages/${watchedCustomerId}/rental`);
        setAvailableRentalPackages(Array.isArray(res.data) ? res.data : []);
        setUsePackage(false);
        setSelectedPackageId(null);
      } catch {
        setAvailableRentalPackages([]);
      } finally {
        setPackagesLoading(false);
      }
    };
    fetchPackages();
  }, [watchedCustomerId, apiClient]);

  // Equipment summary
  const watchedEquipmentIds = Form.useWatch('equipment_ids', form);
  const normalizedEquipmentIds = useMemo(
    () => (Array.isArray(watchedEquipmentIds) ? watchedEquipmentIds : []),
    [watchedEquipmentIds]
  );
  const selectedEquipmentItems = useMemo(
    () => equipment.filter((item) => normalizedEquipmentIds.includes(item.id)),
    [equipment, normalizedEquipmentIds]
  );
  const equipmentSummary = useMemo(() => {
    if (!selectedEquipmentItems.length) return { count: 0, durationLabel: null, priceLabel: null };
    const totalDuration = selectedEquipmentItems.reduce((t, i) => t + (Number(i.duration) || 0), 0);
    const totalPrice = selectedEquipmentItems.reduce((t, i) => t + (Number(i.price) || 0), 0);
    return {
      count: selectedEquipmentItems.length,
      durationLabel: formatRentalDuration(totalDuration) || null,
      priceLabel: totalPrice
        ? formatCurrency(totalPrice, selectedEquipmentItems.find((i) => i.currency)?.currency || businessCurrency)
        : null,
    };
  }, [selectedEquipmentItems, businessCurrency, formatCurrency]);

  // Option renderers
  const renderCustomerOptions = useCallback(() => {
    if (!customers.length)
      return <Option disabled value="" key="no-customers">No customers available</Option>;
    return customers.map((c) => {
      const name = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
      const label = name || c.email || 'Customer';
      // searchText is a flat string AntD can match against via filterOption.
      const searchText = `${label} ${c.phone || ''}`.toLowerCase();
      return (
        <Option key={c.id} value={c.id} label={label} data-search={searchText}>
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{label}</span>
            {c.email && c.email !== label && (
              <span className="text-xs text-slate-500">{c.email}</span>
            )}
          </div>
        </Option>
      );
    });
  }, [customers]);

  // AntD can't search through nested JSX children, so match against the
  // flat `data-search` string we attach to each Option. Tokenise the input
  // on whitespace so "alper g" matches "Güralp Alper" regardless of order.
  const customerFilterOption = useCallback((input, option) => {
    if (!input) return true;
    const haystack = String(option?.['data-search'] || option?.label || '').toLowerCase();
    const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every((t) => haystack.includes(t));
  }, []);

  const renderEquipmentOptions = useCallback(() => {
    if (!equipment.length)
      return <Option disabled value="" key="no-equipment">No rental services available</Option>;
    return equipment.map((item) => {
      const meta = [];
      if (item.price != null) meta.push(formatCurrency(item.price, item.currency || businessCurrency || 'EUR'));
      const dur = formatRentalDuration(item.duration);
      if (dur) meta.push(dur);
      return (
        <Option key={item.id} value={item.id}>
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{item.name}</span>
            {meta.length > 0 && <span className="text-xs text-slate-500">{meta.join(' • ')}</span>}
          </div>
        </Option>
      );
    });
  }, [equipment, formatCurrency, businessCurrency]);

  // Handlers
  const handleClose = useCallback(() => {
    form.resetFields();
    setParticipantMode('single');
    setUsePackage(false);
    setSelectedPackageId(null);
    setAvailableRentalPackages([]);
    onClose();
  }, [form, onClose]);

  // eslint-disable-next-line complexity
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const rentalDate = values.rental_date || dayjs();

      const basePayload = {
        equipment_ids: values.equipment_ids,
        rental_date: rentalDate.format('YYYY-MM-DD'),
        status: values.status || 'active',
        notes: values.notes,
        start_date: rentalDate.startOf('day').toISOString(),
        end_date: rentalDate.endOf('day').toISOString(),
        participant_type: participantMode,
        use_package: usePackage && !!selectedPackageId,
        customer_package_id: usePackage ? selectedPackageId : null,
        rental_days: 1,
      };

      const customerIds = toArray(values.customer_ids);
      const isMultipleCreation = !editingRental && participantMode === 'multiple';

      if (isMultipleCreation) {
        if (!customerIds.length) { messageApi.warning('Select at least one customer'); return; }
        await Promise.all(
          customerIds.map((id) => Rental.create({ ...basePayload, user_id: id }, apiClient || apiClientDefault))
        );
        messageApi.success(`Created ${customerIds.length} rental${customerIds.length > 1 ? 's' : ''}`);
        onSuccess?.();
        handleClose();
        return;
      }

      const primaryCustomerId =
        participantMode === 'multiple' ? customerIds[0] ?? null : values.customer_id;
      if (!primaryCustomerId) { messageApi.warning('Please select a customer'); return; }

      const client = apiClient || apiClientDefault;
      const payload = { ...basePayload, user_id: primaryCustomerId };
      if (editingRental) {
        await Rental.update(editingRental.id, payload, client);
        messageApi.success('Rental updated successfully');
      } else {
        await Rental.create(payload, client);
        messageApi.success('Rental created successfully');
      }

      onSuccess?.();
      handleClose();
    } catch {
      messageApi.error('Failed to save rental');
    }
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      placement="right"
      width={560}
      destroyOnHidden
      footer={null}
      title={
        <span className="font-semibold text-slate-800">
          {editingRental ? 'Edit Rental' : 'New Rental'}
        </span>
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto">
        <Form form={form} layout="vertical" preserve={false} className="px-5 py-4">
          <div className="space-y-1">
            {/* Customer */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Customer</span>
              <Radio.Group
                value={participantMode}
                onChange={(e) => setParticipantMode(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="single">Single</Radio.Button>
                <Radio.Button
                  value="multiple"
                  disabled={Boolean(editingRental)}
                  title={editingRental ? 'Not available when editing' : undefined}
                >
                  Multiple
                </Radio.Button>
              </Radio.Group>
            </div>

            {participantMode === 'single' ? (
              <Form.Item
                name="customer_id"
                rules={[{ required: true, message: 'Please select a customer' }]}
                className="!mb-4"
              >
                <Select
                  placeholder="Search customer name or email"
                  showSearch
                  size="large"
                  filterOption={customerFilterOption}
                  optionLabelProp="label"
                  className="w-full"
                >
                  {renderCustomerOptions()}
                </Select>
              </Form.Item>
            ) : (
              <Form.Item
                name="customer_ids"
                rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one customer' }]}
                className="!mb-4"
              >
                <Select
                  mode="multiple"
                  placeholder="Select customers"
                  showSearch
                  size="large"
                  filterOption={customerFilterOption}
                  optionLabelProp="label"
                  className="w-full"
                  maxTagCount="responsive"
                >
                  {renderCustomerOptions()}
                </Select>
              </Form.Item>
            )}

            {/* Equipment */}
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Equipment</p>
            <Form.Item
              name="equipment_ids"
              rules={[{ required: true, message: 'Select at least one rental service' }]}
              className="!mb-1"
            >
              <Select
                mode="multiple"
                placeholder="Add rental equipment"
                showSearch
                size="large"
                optionFilterProp="children"
                className="w-full"
                maxTagCount="responsive"
                open={equipmentDropdownOpen}
                onOpenChange={setEquipmentDropdownOpen}
                onSelect={() => setEquipmentDropdownOpen(false)}
              >
                {renderEquipmentOptions()}
              </Select>
            </Form.Item>
            {equipmentSummary.count > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-1 pb-3 text-xs text-slate-500">
                <span>{equipmentSummary.count} {equipmentSummary.count === 1 ? 'item' : 'items'}</span>
                {equipmentSummary.durationLabel && <span>· {equipmentSummary.durationLabel}</span>}
                {equipmentSummary.priceLabel && !usePackage && <span>· {equipmentSummary.priceLabel}</span>}
                {usePackage && selectedPackageId && <Tag color="green">Using Package</Tag>}
              </div>
            )}

            {/* Package — only shown when customer has active rental packages */}
            {participantMode === 'single' && !editingRental && watchedCustomerId && (
              packagesLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <Spin size="small" /> Checking packages…
                </div>
              ) : availableRentalPackages.length > 0 ? (
                <div className="pt-1 pb-3 border-t border-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2 mt-3">
                    Included in Package
                  </p>
                  <Checkbox
                    checked={usePackage}
                    onChange={(e) => {
                      setUsePackage(e.target.checked);
                      if (!e.target.checked) setSelectedPackageId(null);
                      else if (availableRentalPackages.length === 1)
                        setSelectedPackageId(availableRentalPackages[0].id);
                    }}
                  >
                    <span className="text-sm text-slate-700">Use rental days from an active package</span>
                  </Checkbox>
                  {usePackage && (
                    <Select
                      value={selectedPackageId}
                      onChange={setSelectedPackageId}
                      placeholder="Select a package"
                      className="w-full mt-2"
                      size="middle"
                    >
                      {availableRentalPackages.map((pkg) => (
                        <Option key={pkg.id} value={pkg.id}>
                          <span>{pkg.packageName}</span>
                          <Tag color="green" className="ml-2">{pkg.rentalDaysRemaining}d left</Tag>
                        </Option>
                      ))}
                    </Select>
                  )}
                  {usePackage && selectedPackageId && (
                    <p className="text-xs text-emerald-600 mt-1">
                      1 rental day will be deducted — no wallet charge.
                    </p>
                  )}
                </div>
              ) : null
            )}

            {/* Date & Status */}
            <div className="grid gap-3 grid-cols-2 pt-2 border-t border-slate-100">
              <Form.Item
                name="rental_date"
                label="Rental date"
                rules={[{ required: true, message: 'Please select a date' }]}
                className="!mb-2"
              >
                <DatePicker
                  size="large"
                  className="w-full"
                  placeholder="Choose date"
                  disabledDate={canSelectPastDates ? undefined : (current) => current && current < dayjs().startOf('day')}
                />
              </Form.Item>
              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true, message: 'Required' }]}
                className="!mb-2"
              >
                <Select placeholder="Status" size="large">
                  <Option value="active">Active</Option>
                  <Option value="completed">Completed</Option>
                </Select>
              </Form.Item>
            </div>

            {/* Notes */}
            <Form.Item name="notes" label="Notes" className="!mb-0">
              <Input.TextArea
                rows={3}
                placeholder="Handover notes, customer preferences…"
                className="resize-none"
                showCount
                maxLength={500}
              />
            </Form.Item>
          </div>
        </Form>
      </div>

      {/* Sticky footer */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-4 flex justify-end gap-3">
        <Button onClick={handleClose} className="rounded-xl">
          Cancel
        </Button>
        <Button
          type="primary"
          onClick={handleSubmit}
          className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 border-0 shadow-md hover:shadow-lg transition-all font-semibold"
        >
          {editingRental ? 'Update Rental' : 'Create Rental'}
        </Button>
      </div>
    </Drawer>
  );
}

NewRentalDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  editingRental: PropTypes.object,
};

export default NewRentalDrawer;
