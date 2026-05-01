// src/features/instructors/components/InstructorServiceCommission.jsx
import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form, Select, Button, Spin, Modal, InputNumber, Radio, Tag,
  Typography, Tooltip, Space, Empty
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  SaveOutlined, CloseOutlined, InfoCircleOutlined,
  DollarOutlined, PercentageOutlined, CheckOutlined
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;
const { Option } = Select;

const LESSON_CATEGORIES = ['private', 'semi-private', 'group', 'supervision', 'semi-private-supervision'];
const CATEGORY_COLORS = { private: 'blue', group: 'green', supervision: 'orange', 'semi-private': 'purple', 'semi-private-supervision': 'gold' };

const InstructorServiceCommission = forwardRef(({
  instructorId,
  onSave = () => {},
}, ref) => {
  const { t } = useTranslation(['instructor']);
  const { apiClient } = useData();
  const { businessCurrency, getCurrencySymbol } = useCurrency();
  const currencySymbol = getCurrencySymbol(businessCurrency || 'EUR');

  const [services, setServices] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [addForm] = Form.useForm();

  // Default commission
  const [defaultCommission, setDefaultCommission] = useState({ commissionType: 'percentage', commissionValue: 50 });
  const [defaultDirty, setDefaultDirty] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);

  // Category rates
  const [categoryRates, setCategoryRates] = useState([]);
  const [categoryRatesLoading, setCategoryRatesLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm] = Form.useForm();
  const addFormCommissionType = Form.useWatch('commissionType', addForm);

  const hasFetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!instructorId) return;
    setLoading(true);
    try {
      const [servicesRes, commissionsRes] = await Promise.all([
        apiClient.get('/services'),
        apiClient.get(`/instructor-commissions/instructors/${instructorId}/commissions`),
      ]);

      setServices(servicesRes.data || []);
      const data = commissionsRes.data || {};

      if (data.defaultCommission) {
        setDefaultCommission({
          commissionType: data.defaultCommission.type || 'fixed',
          commissionValue: data.defaultCommission.value || 50,
        });
      }

      setCommissions((data.commissions || []).map(c => ({
        key: c.serviceId,
        serviceId: c.serviceId,
        serviceName: c.serviceName,
        serviceCategory: c.serviceCategory,
        serviceLevel: c.serviceLevel,
        commissionType: c.commissionType,
        commissionValue: c.commissionValue,
      })));
    } catch (error) {
      message.error(t('instructor:commissions.failedToLoad', { error: error.response?.data?.error || error.message }));
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructorId]);

  const fetchCategoryRates = useCallback(async () => {
    if (!instructorId) return;
    setCategoryRatesLoading(true);
    try {
      const res = await apiClient.get(`/instructor-commissions/instructors/${instructorId}/category-rates`);
      setCategoryRates(res.data?.categoryRates || []);
    } catch {
      setCategoryRates([]);
    } finally {
      setCategoryRatesLoading(false);
    }
  }, [apiClient, instructorId]);

  // Only fetch once when mounted, not on every re-render
  useEffect(() => {
    if (instructorId && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
      fetchCategoryRates();
    }
  }, [instructorId, fetchData, fetchCategoryRates]);

  useImperativeHandle(ref, () => ({
    refreshData: () => { fetchData(); fetchCategoryRates(); }
  }));

  // ── Service commission handlers ──
  const handleEditService = (record) => {
    form.setFieldsValue({
      commissionType: record.commissionType || 'percentage',
      commissionValue: record.commissionValue || 0,
    });
    setEditingServiceId(record.serviceId);
  };

  const handleSaveService = async (serviceId) => {
    try {
      const values = await form.validateFields();
      await apiClient.put(`/instructor-commissions/instructors/${instructorId}/commissions/${serviceId}`, {
        commissionType: values.commissionType,
        commissionValue: values.commissionValue,
      });
      setEditingServiceId(null);
      fetchData();
      onSave();
    } catch {
      message.error(t('instructor:commissions.failedToSave'));
    }
  };

  const handleDeleteService = async (serviceId) => {
    try {
      await apiClient.delete(`/instructor-commissions/instructors/${instructorId}/commissions/${serviceId}`);
      setCommissions(prev => prev.filter(c => c.serviceId !== serviceId));
      message.success(t('instructor:commissions.commissionRemoved'));
      onSave();
    } catch {
      message.error(t('instructor:commissions.failedToDelete'));
    }
  };

  const handleAddCommissions = async () => {
    try {
      const values = await addForm.validateFields();
      const ids = Array.isArray(values.serviceIds) ? values.serviceIds : [];
      if (!ids.length) { message.error(t('instructor:commissions.selectAtLeastOneService')); return; }

      const tasks = ids.map(id => {
        const svc = services.find(s => s.id === id);
        if (!svc) return Promise.resolve({ ok: false, id });
        return apiClient
          .post(`/instructor-commissions/instructors/${instructorId}/commissions`, {
            serviceId: id,
            commissionType: values.commissionType || 'fixed',
            commissionValue: values.commissionValue || 0,
          })
          .then(() => ({ ok: true, id, svc }))
          .catch(() => ({ ok: false, id, svc }));
      });

      const results = await Promise.all(tasks);
      const ok = results.filter(r => r.ok);
      const fail = results.filter(r => !r.ok);
      if (ok.length) {
        setCommissions(prev => [
          ...prev,
          ...ok.map(({ id, svc }) => ({
            key: id, serviceId: id, serviceName: svc.name,
            serviceCategory: svc.category, serviceLevel: svc.level,
            commissionType: values.commissionType || 'fixed',
            commissionValue: values.commissionValue || 0,
          })),
        ]);
        message.success(t('instructor:commissions.addedCount', { count: ok.length }));
        onSave();
      }
      if (fail.length) message.warning(t('instructor:commissions.servicesFailed', { count: fail.length }));
      setAddModalVisible(false);
      addForm.resetFields();
    } catch { /* validation */ }
  };

  // ── Default commission handlers ──
  const handleSaveDefault = async () => {
    setSavingDefault(true);
    try {
      await apiClient.put(`/instructor-commissions/instructors/${instructorId}/default-commission`, defaultCommission);
      setDefaultDirty(false);
      onSave();
    } catch {
      message.error(t('instructor:commissions.failedToSaveDefault'));
    } finally {
      setSavingDefault(false);
    }
  };

  // ── Category rate handlers ──
  const handleSaveCategoryRate = async (category) => {
    try {
      const values = await categoryForm.validateFields();
      await apiClient.put(`/instructor-commissions/instructors/${instructorId}/category-rates`, {
        rates: [{ lessonCategory: category, rateType: values.rateType, rateValue: values.rateValue }],
      });
      message.success(t('instructor:commissions.categoryRateSaved', { category }));
      setEditingCategory(null);
      fetchCategoryRates();
      onSave();
    } catch {
      message.error(t('instructor:commissions.failedToSaveCategoryRate'));
    }
  };

  const handleDeleteCategoryRate = async (category) => {
    try {
      await apiClient.delete(`/instructor-commissions/instructors/${instructorId}/category-rates/${category}`);
      message.success(t('instructor:commissions.categoryRateRemoved', { category }));
      fetchCategoryRates();
      onSave();
    } catch {
      message.error(t('instructor:commissions.failedToDeleteCategoryRate'));
    }
  };

  // ── Render helpers ──
  const renderCommissionBadge = (type, value) => {
    if (type === 'percentage') {
      return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-medium"><PercentageOutlined /> {value}%</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium"><DollarOutlined /> {formatCurrency(Number(value || 0), businessCurrency || 'EUR')}/h</span>;
  };

  const renderEditableRate = (formInstance, typeField, valueField) => (
    <div className="flex items-center gap-2">
      <Form.Item name={typeField || 'commissionType'} noStyle>
        <Select size="small" className="w-28">
          <Option value="fixed">{t('instructor:addInstructor.fixedPerHour')}</Option>
          <Option value="percentage">{t('instructor:addInstructor.percentage')}</Option>
        </Select>
      </Form.Item>
      <Form.Item name={valueField || 'commissionValue'} noStyle rules={[{ required: true, message: t('instructor:addInstructor.required') }]}>
        <InputNumber
          size="small"
          min={0}
          max={formInstance.getFieldValue(typeField || 'commissionType') === 'percentage' ? 100 : undefined}
          className="w-24"
          addonAfter={formInstance.getFieldValue(typeField || 'commissionType') === 'percentage' ? '%' : currencySymbol}
        />
      </Form.Item>
    </div>
  );

  return (
    <Spin spinning={loading}>
      <div className="space-y-6">
        {/* ── SECTION 1: Default Commission ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">{t('instructor:commissions.defaultCommissionTitle')}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{t('instructor:commissions.defaultCommissionHint')}</p>
              </div>
              {defaultDirty && (
                <Button
                  type="primary"
                  size="small"
                  icon={<SaveOutlined />}
                  loading={savingDefault}
                  onClick={handleSaveDefault}
                >
                  {t('instructor:commissions.save')}
                </Button>
              )}
            </div>
          </div>
          <div className="p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-2">{t('instructor:addInstructor.commissionType')}</div>
                <Radio.Group
                  value={defaultCommission.commissionType}
                  onChange={(e) => {
                    setDefaultCommission(prev => ({ ...prev, commissionType: e.target.value }));
                    setDefaultDirty(true);
                  }}
                  size="small"
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="fixed">
                    <DollarOutlined className="mr-1" /> {t('instructor:addInstructor.fixedPerHour')}
                  </Radio.Button>
                  <Radio.Button value="percentage">
                    <PercentageOutlined className="mr-1" /> {t('instructor:addInstructor.percentage')}
                  </Radio.Button>
                </Radio.Group>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-2">{t('instructor:bulkCommissions.value')}</div>
                <InputNumber
                  min={0}
                  max={defaultCommission.commissionType === 'percentage' ? 100 : undefined}
                  value={defaultCommission.commissionValue}
                  onChange={(value) => {
                    setDefaultCommission(prev => ({ ...prev, commissionValue: value }));
                    setDefaultDirty(true);
                  }}
                  addonAfter={defaultCommission.commissionType === 'percentage' ? '%' : currencySymbol}
                  className="w-36"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Category Rates ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-800">{t('instructor:commissions.categoryRatesTitle')}</h4>
            <p className="text-xs text-gray-400 mt-0.5">{t('instructor:commissions.categoryRatesHint')}</p>
          </div>
          <Spin spinning={categoryRatesLoading}>
            <div className="divide-y divide-gray-100">
              {LESSON_CATEGORIES.map(cat => {
                const existing = categoryRates.find(r => r.lesson_category === cat);
                const hasRate = !!existing;
                const isEditing = editingCategory === cat;

                return (
                  <div key={cat} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Tag color={CATEGORY_COLORS[cat]} bordered={false} className="rounded-full capitalize m-0">{cat}</Tag>
                    </div>

                    {isEditing ? (
                      <Form form={categoryForm} component={false}>
                        <div className="flex items-center gap-2">
                          {renderEditableRate(categoryForm, 'rateType', 'rateValue')}
                          <Button type="text" size="small" icon={<CheckOutlined />} className="text-green-600" onClick={() => handleSaveCategoryRate(cat)} />
                          <Button type="text" size="small" icon={<CloseOutlined />} className="text-gray-400" onClick={() => setEditingCategory(null)} />
                        </div>
                      </Form>
                    ) : (
                      <div className="flex items-center gap-2">
                        {hasRate ? (
                          <>
                            {renderCommissionBadge(existing.rate_type, parseFloat(existing.rate_value))}
                            <Button type="text" size="small" icon={<EditOutlined />} className="text-gray-400 hover:text-blue-600"
                              onClick={() => {
                                categoryForm.setFieldsValue({ rateType: existing.rate_type || 'fixed', rateValue: parseFloat(existing.rate_value) || 0 });
                                setEditingCategory(cat);
                              }}
                            />
                            <Button type="text" size="small" icon={<DeleteOutlined />} className="text-gray-400 hover:text-red-500"
                              onClick={() => handleDeleteCategoryRate(cat)}
                            />
                          </>
                        ) : (
                          <Button type="dashed" size="small" icon={<PlusOutlined />}
                            onClick={() => {
                              categoryForm.setFieldsValue({ rateType: 'fixed', rateValue: 0 });
                              setEditingCategory(cat);
                            }}
                          >
                            {t('instructor:commissions.setRate')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Spin>
          <div className="px-5 py-2.5 bg-gray-50/70 border-t border-gray-100">
            <Text className="text-[11px] text-gray-400">
              <InfoCircleOutlined className="mr-1" />
              {t('instructor:commissions.priorityNote')}
            </Text>
          </div>
        </div>

        {/* ── SECTION 3: Service Commissions ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">{t('instructor:commissions.serviceCommissionsTitle')}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{t('instructor:commissions.serviceCommissionsHint')}</p>
              </div>
              <Button size="small" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddModalVisible(true); }}>
                {t('instructor:commissions.add')}
              </Button>
            </div>
          </div>

          {commissions.length === 0 ? (
            <div className="py-10">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span className="text-gray-400 text-sm">
                    {t('instructor:commissions.noServiceCommissions')}
                    <br />
                    <span className="text-xs">{t('instructor:commissions.noServiceCommissionsHint')}</span>
                  </span>
                }
              >
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddModalVisible(true); }}>
                  {t('instructor:commissions.addServiceCommission')}
                </Button>
              </Empty>
            </div>
          ) : (
            <Form form={form} component={false}>
              <div className="divide-y divide-gray-100">
                {commissions.map(record => {
                  const isEditing = editingServiceId === record.serviceId;
                  return (
                    <div key={record.serviceId} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800 truncate">{record.serviceName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {record.serviceCategory && <Tag bordered={false} className="text-[10px] rounded-full m-0 px-1.5 py-0 leading-4">{record.serviceCategory}</Tag>}
                          {record.serviceLevel && <Tag bordered={false} color="green" className="text-[10px] rounded-full m-0 px-1.5 py-0 leading-4">{record.serviceLevel}</Tag>}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          {renderEditableRate(form, 'commissionType', 'commissionValue')}
                          <Button type="text" size="small" icon={<CheckOutlined />} className="text-green-600" onClick={() => handleSaveService(record.serviceId)} />
                          <Button type="text" size="small" icon={<CloseOutlined />} className="text-gray-400" onClick={() => setEditingServiceId(null)} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {renderCommissionBadge(record.commissionType, record.commissionValue)}
                          <Button type="text" size="small" icon={<EditOutlined />} className="text-gray-400 hover:text-blue-600"
                            onClick={() => handleEditService(record)} />
                          <Button type="text" size="small" icon={<DeleteOutlined />} className="text-gray-400 hover:text-red-500"
                            onClick={() => handleDeleteService(record.serviceId)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Form>
          )}
        </div>
      </div>

      {/* Add Commission Modal */}
      <Modal
        title={t('instructor:commissions.addServiceCommissionsModal')}
        open={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        onOk={handleAddCommissions}
        destroyOnHidden
        width={480}
      >
        <Form form={addForm} layout="vertical" initialValues={{ commissionType: 'fixed', commissionValue: 50 }}>
          <Form.Item name="serviceIds" label={t('instructor:commissions.selectServices')} rules={[{ required: true, message: t('instructor:commissions.selectAtLeastOneService') }]}>
            <Select mode="multiple" placeholder={t('instructor:commissions.searchSelectServices')} showSearch optionFilterProp="children" maxTagCount="responsive">
              {services
                .filter(s => !commissions.some(c => c.serviceId === s.id))
                .map(s => (
                  <Option key={s.id} value={s.id}>{s.name} — {s.category} · {s.level}</Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="commissionType" label={t('instructor:addInstructor.commissionType')}>
            <Radio.Group optionType="button" buttonStyle="solid" size="small">
              <Radio.Button value="fixed"><DollarOutlined className="mr-1" />{t('instructor:addInstructor.fixedPerHour')}</Radio.Button>
              <Radio.Button value="percentage"><PercentageOutlined className="mr-1" />{t('instructor:addInstructor.percentage')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="commissionValue"
            label={t('instructor:bulkCommissions.value')}
            rules={[
              { required: true, message: t('instructor:commissions.enterValue') },
              { type: 'number', min: 0, message: t('instructor:commissions.mustBePositive') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (getFieldValue('commissionType') === 'percentage' && value > 100) return Promise.reject(t('instructor:commissions.max100'));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber
              min={0}
              className="w-full"
              addonAfter={addFormCommissionType === 'percentage' ? '%' : currencySymbol}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
});

export default InstructorServiceCommission;
