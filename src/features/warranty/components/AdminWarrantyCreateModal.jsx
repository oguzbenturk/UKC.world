import React, { useState } from 'react';
import {
  Modal, Form, Input, DatePicker, Select, Button, Switch,
  Progress, Alert, message, Divider
} from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import WarrantyFileUploader from './WarrantyFileUploader';
import { useAdminCreateClaim } from '../hooks/useWarranty';

const { TextArea } = Input;

export default function AdminWarrantyCreateModal({ open, onClose, onCreated }) {
  const { t } = useTranslation(['admin', 'public']);
  const [form] = Form.useForm();
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const createMutation = useAdminCreateClaim();

  const handleClose = () => {
    if (createMutation.isPending) return;
    form.resetFields();
    setFiles([]);
    setProgress(0);
    onClose?.();
  };

  const handleSubmit = async (values) => {
    setProgress(0);
    const formData = new FormData();
    formData.append('customer_name', values.customer_name);
    formData.append('customer_email', values.customer_email);
    if (values.customer_phone) formData.append('customer_phone', values.customer_phone);
    formData.append('product_name', values.product_name);
    if (values.product_brand)  formData.append('product_brand', values.product_brand);
    if (values.product_model)  formData.append('product_model', values.product_model);
    if (values.product_serial) formData.append('product_serial', values.product_serial);
    if (values.purchase_date)  formData.append('purchase_date', dayjs(values.purchase_date).format('YYYY-MM-DD'));
    if (values.purchase_location) formData.append('purchase_location', values.purchase_location);
    formData.append('issue_description', values.issue_description);
    formData.append('preferred_language', values.preferred_language || 'en');
    if (values.external_claim_number) {
      formData.append('external_claim_number', values.external_claim_number);
    }
    formData.append('notify_customer', values.notify_customer === false ? 'false' : 'true');
    files.forEach((f) => formData.append('files', f, f.name));

    try {
      const claim = await createMutation.mutateAsync({
        formData,
        onUploadProgress: (e) => {
          if (e.total) setProgress((e.loaded / e.total) * 100);
        }
      });
      message.success(t('admin:warranty.create.success', 'Warranty claim created.'));
      form.resetFields();
      setFiles([]);
      setProgress(0);
      onCreated?.(claim);
      onClose?.();
    } catch (err) {
      const apiError = err?.response?.data?.error;
      message.error(apiError || t('admin:warranty.create.errorGeneric', 'Could not create the claim.'));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={760}
      destroyOnClose
      maskClosable={!createMutation.isPending}
      title={
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-600">
            {t('admin:warranty.create.eyebrow', 'UKC.Care')}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {t('admin:warranty.create.title', 'New warranty claim')}
          </h2>
          <p className="mt-1 text-xs text-slate-500 font-normal">
            {t('admin:warranty.create.subtitle',
              'Log a claim on behalf of a customer. The customer will receive a tracking link by email.')}
          </p>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={createMutation.isPending}
        requiredMark="optional"
        initialValues={{ preferred_language: 'en', notify_customer: true }}
      >
        <Divider orientation="left" plain>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.create.section.customer', 'Customer')}
          </span>
        </Divider>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item
            name="customer_name"
            label={t('public:warranty.submit.fields.name', 'Full name')}
            rules={[{ required: true, min: 2, max: 120 }]}
          >
            <Input placeholder="Jamie Rivera" />
          </Form.Item>
          <Form.Item
            name="customer_email"
            label={t('public:warranty.submit.fields.email', 'Email')}
            rules={[{ required: true, type: 'email', max: 200 }]}
          >
            <Input placeholder="name@example.com" />
          </Form.Item>
        </div>
        <Form.Item
          name="customer_phone"
          label={t('public:warranty.submit.fields.phone', 'Phone')}
          rules={[{ max: 50 }]}
        >
          <Input placeholder="+90 ..." />
        </Form.Item>

        <Divider orientation="left" plain>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.create.section.product', 'Product')}
          </span>
        </Divider>
        <Form.Item
          name="product_name"
          label={t('public:warranty.submit.fields.product', 'Product')}
          rules={[{ required: true, max: 200 }]}
        >
          <Input placeholder="e.g. Duotone Juice 11m" />
        </Form.Item>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item
            name="product_brand"
            label={t('public:warranty.submit.fields.brand', 'Brand')}
            rules={[{ max: 120 }]}
          >
            <Input placeholder="Duotone" />
          </Form.Item>
          <Form.Item
            name="product_model"
            label={t('public:warranty.submit.fields.model', 'Model')}
            rules={[{ max: 120 }]}
          >
            <Input placeholder="2024 / SLS" />
          </Form.Item>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item
            name="product_serial"
            label={t('public:warranty.submit.fields.serial', 'Serial number')}
            rules={[{ max: 120 }]}
          >
            <Input placeholder="DT-2024-XXXXXX" />
          </Form.Item>
          <Form.Item
            name="purchase_date"
            label={t('public:warranty.submit.fields.purchaseDate', 'Purchase date')}
          >
            <DatePicker style={{ width: '100%' }} placeholder="YYYY-MM-DD" />
          </Form.Item>
        </div>
        <Form.Item
          name="purchase_location"
          label={t('public:warranty.submit.fields.purchaseLocation', 'Bought from')}
          rules={[{ max: 200 }]}
        >
          <Input placeholder={t('public:warranty.submit.placeholders.purchase', 'Shop or order #')} />
        </Form.Item>

        <Divider orientation="left" plain>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.create.section.case', 'Case')}
          </span>
        </Divider>
        <Form.Item
          name="issue_description"
          label={t('public:warranty.submit.fields.issue', 'Describe the problem')}
          rules={[{ required: true, min: 5, max: 5000 }]}
        >
          <TextArea
            rows={4}
            placeholder={t('public:warranty.submit.fields.issuePlaceholder',
              'What went wrong with the product?')}
          />
        </Form.Item>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item
            name="external_claim_number"
            label={
              <span>
                {t('admin:warranty.create.fields.externalClaim', 'Manufacturer claim #')}
                <span className="ml-2 text-[10px] font-normal text-slate-400">
                  {t('admin:warranty.create.fields.externalClaimHint', 'if you already have one')}
                </span>
              </span>
            }
            rules={[{ max: 120 }]}
          >
            <Input placeholder="RMA-1234" />
          </Form.Item>
          <Form.Item
            name="preferred_language"
            label={t('admin:warranty.create.fields.language', "Customer's language")}
          >
            <Select
              options={[
                { value: 'tr', label: 'Türkçe' },
                { value: 'en', label: 'English' }
              ]}
            />
          </Form.Item>
        </div>

        <Divider orientation="left" plain>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.create.section.media', 'Media (optional)')}
          </span>
        </Divider>
        <WarrantyFileUploader
          variant="light"
          value={files}
          onChange={setFiles}
          allowDocuments
          progress={progress}
          isUploading={createMutation.isPending}
        />

        <Divider />

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">
              {t('admin:warranty.create.notify.title', 'Email the customer the tracking link')}
            </p>
            <p className="text-xs text-slate-500">
              {t('admin:warranty.create.notify.body',
                'Recommended. They will receive a UKC.Care branded email with the tracking link.')}
            </p>
          </div>
          <Form.Item name="notify_customer" valuePropName="checked" className="!mb-0 shrink-0">
            <Switch />
          </Form.Item>
        </div>

        {createMutation.isError && (
          <Alert
            className="!mt-4"
            type="error"
            showIcon
            message={createMutation.error?.response?.data?.error
              || t('admin:warranty.create.errorGeneric', 'Could not create the claim.')}
          />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button onClick={handleClose} disabled={createMutation.isPending}>
            {t('admin:warranty.actions.cancel', 'Cancel')}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMutation.isPending}
          >
            {t('admin:warranty.create.submit', 'Create claim')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
