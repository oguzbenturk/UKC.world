import { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Upload, App, Alert, Tooltip, Tag } from 'antd';
import { UploadOutlined, BankOutlined, CopyOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';

const { Option } = Select;

const CURRENCY_COLOR = { EUR: 'blue', USD: 'green', GBP: 'purple', TRY: 'orange' };

function maskIban(iban) {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '');
  if (clean.length <= 8) return iban;
  return clean.slice(0, 4) + ' •••• •••• ' + clean.slice(-4);
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors ml-3"
      >
        {copied ? (
          <><CheckOutlined className="text-green-500" /><span className="text-green-500">Copied</span></>
        ) : (
          <><CopyOutlined />Copy</>
        )}
      </button>
    </Tooltip>
  );
}

function BankDetailsCard({ account }) {
  if (!account) return null;

  const fields = [
    { label: 'Bank', value: account.bankName },
    { label: 'Account Holder', value: account.accountHolder },
    { label: 'IBAN', value: account.iban, mono: true, copy: true },
    ...(account.swiftCode ? [{ label: 'SWIFT / BIC', value: account.swiftCode, mono: true, copy: true }] : []),
    ...(account.accountNumber ? [{ label: 'Account No.', value: account.accountNumber, mono: true, copy: true }] : []),
    ...(account.routingNumber ? [{ label: 'Routing No.', value: account.routingNumber, mono: true, copy: true }] : []),
  ];

  return (
    <div className="mb-3 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600/10 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <BankOutlined className="text-blue-600" />
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Transfer To</span>
        </div>
        <Tag color={CURRENCY_COLOR[account.currency] || 'default'} className="font-bold m-0 text-xs">
          {account.currency}
        </Tag>
      </div>
      <div className="px-4 py-0.5 divide-y divide-blue-100">
        {fields.map(({ label, value, mono, copy }) => (
          <div key={label} className="flex items-center justify-between py-2.5 gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
              <p className={`text-sm text-slate-800 leading-snug break-all ${mono ? 'font-mono tracking-wide' : 'font-medium'}`}>
                {value}
              </p>
            </div>
            {copy && <CopyButton value={value} />}
          </div>
        ))}
      </div>
      {account.instructions && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex gap-2">
          <InfoCircleOutlined className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-700 leading-snug">{account.instructions}</p>
        </div>
      )}
    </div>
  );
}

export function BankTransferModal({ visible, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [fileList, setFileList] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    if (visible) {
      fetchBankAccounts();
    } else {
      form.resetFields();
      setFileList([]);
      setSelectedAccount(null);
    }
  }, [visible, form]);

  const fetchBankAccounts = async () => {
    try {
      const response = await apiClient.get('/wallet/bank-accounts');
      setBankAccounts(response.data.results || []);
    } catch (error) {
      console.error('Failed to fetch bank accounts:', error);
      message.error('Failed to load bank accounts');
    }
  };

  const handleBankAccountChange = (id) => {
    const acc = bankAccounts.find((a) => a.id === id) || null;
    setSelectedAccount(acc);
  };

  const handleSubmit = async (values) => {
    if (fileList.length === 0) {
      message.error('Please upload a proof of payment (receipt/dekont)');
      return;
    }

    setLoading(true);
    try {
      // Upload via raw XHR to avoid axios default Content-Type overriding multipart boundary
      const proofUrl = await new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('image', fileList[0]);
        const token = getAccessToken() || localStorage.getItem('token');
        const base = resolveApiBaseUrl();
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText).url);
          } else {
            reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('POST', `${base}/api/upload/wallet-deposit`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      // Then submit the deposit request
      await apiClient.post('/wallet/deposit', {
        amount: Number(values.amount),
        currency: selectedAccount?.currency || 'EUR',
        method: 'bank_transfer',
        bankAccountId: values.bankAccountId,
        proofUrl: proofUrl,
        notes: values.notes
      });

      onSuccess?.();
    } catch (error) {
      console.error('Bank transfer submission failed:', error);
      // express-validator returns { errors: [...] }, route handler returns { error: '...' }
      const data = error.response?.data;
      const errorMsg = data?.error
        || (Array.isArray(data?.errors) ? data.errors.map(e => e.msg).join(', ') : null)
        || error.message
        || 'Failed to submit bank transfer request';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    onRemove: (file) => {
      setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
    },
    beforeUpload: (file) => {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('You can only upload image files (JPG, PNG)!');
        return Upload.LIST_IGNORE;
      }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('File must be smaller than 5MB!');
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false; // Prevent automatic upload
    },
    fileList,
    maxCount: 1,
    accept: "image/*"
  };

  return (
    <Modal
      open={visible}
      title={null}
      footer={null}
      onCancel={onClose}
      width={500}
      forceRender
      centered
      zIndex={1050}
      styles={{ body: { padding: 0 } }}
    >
      {/* Compact header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 rounded-t-lg">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <BankOutlined /> Bank Transfer Deposit
        </h2>
        <p className="text-blue-200 text-xs mt-0.5">
          Transfer funds and upload your receipt
        </p>
      </div>

      <div className="px-5 py-4">
        <Alert
          message="Transfer to one of our accounts below, then upload your receipt. Balance updates after admin approval."
          type="info"
          showIcon
          className="mb-4 rounded-lg !text-xs"
        />

        <Form 
          form={form} 
          layout="vertical" 
          onFinish={handleSubmit}
          requiredMark="optional"
          size="middle"
          className="compact-form"
        >
          <Form.Item
            name="bankAccountId"
            label={<span className="text-xs font-medium text-slate-600">Bank Account</span>}
            rules={[{ required: true, message: 'Select the account you transferred to' }]}
            className="mb-3"
          >
            <Select
              placeholder="Select bank account to transfer to…"
              className="w-full"
              optionLabelProp="label"
              onChange={handleBankAccountChange}
            >
              {bankAccounts.map((acc) => (
                <Option
                  key={acc.id}
                  value={acc.id}
                  label={`${acc.bankName} · ${acc.currency}`}
                >
                  <div className="py-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800 text-sm">{acc.bankName}</span>
                      <Tag color={CURRENCY_COLOR[acc.currency] || 'default'} className="text-xs font-bold ml-2 my-0">
                        {acc.currency}
                      </Tag>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {acc.accountHolder} &nbsp;·&nbsp; {maskIban(acc.iban)}
                    </div>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Bank details card — expands after selection */}
          <BankDetailsCard account={selectedAccount} />

          <Form.Item
            name="amount"
            label={
              <span className="text-xs font-medium text-slate-600">
                Amount
                {selectedAccount && (
                  <span className="ml-1 text-slate-400 font-normal">({selectedAccount.currency})</span>
                )}
              </span>
            }
            rules={[
              { required: true, message: 'Required' },
              { type: 'number', min: 1, max: 50000, message: 'Amount must be between 1 and 50,000' },
            ]}
            className="mb-3"
          >
            <InputNumber
              className="w-full"
              min={1}
              max={50000}
              placeholder="Enter amount"
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label={<span className="text-xs font-medium text-slate-600">Description / Reference</span>}
            rules={[{ required: true, message: 'Required' }]}
            className="mb-3"
          >
            <Input.TextArea
              placeholder="Your name or transfer reference"
              rows={2}
            />
          </Form.Item>

          <Form.Item 
            label={<span className="text-xs font-medium text-slate-600">Receipt (Dekont)</span>} 
            required
            className="mb-3"
          >
            <Upload {...uploadProps} listType="picture">
              <Button icon={<UploadOutlined />} className="w-full">
                Upload Image
              </Button>
            </Upload>
            <span className="text-[11px] text-gray-400 mt-1 block">
              JPG, PNG — Max 5MB
            </span>
          </Form.Item>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading} className="bg-blue-600 px-5">
              Submit
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}