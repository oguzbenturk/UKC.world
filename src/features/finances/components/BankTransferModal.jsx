import { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Upload, App } from 'antd';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';

const { Option } = Select;

const CURRENCY_BADGE = {
  EUR: 'bg-sky-50 text-sky-700 border-sky-200',
  USD: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GBP: 'bg-violet-50 text-violet-700 border-violet-200',
  TRY: 'bg-amber-50 text-amber-700 border-amber-200',
};

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
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors ml-3"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
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

  const badgeCls = CURRENCY_BADGE[account.currency] || 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="mb-4 rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transfer To</span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>
          {account.currency}
        </span>
      </div>
      <div className="px-4 divide-y divide-slate-100">
        {fields.map(({ label, value, mono, copy }) => (
          <div key={label} className="flex items-center justify-between py-2.5 gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
              <p className={`text-sm text-slate-800 leading-snug break-all ${mono ? 'font-mono tracking-wide' : 'font-medium'}`}>
                {value}
              </p>
            </div>
            {copy && <CopyButton value={value} />}
          </div>
        ))}
      </div>
      {account.instructions && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200">
          <p className="text-xs text-amber-700 leading-snug">{account.instructions}</p>
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

      await apiClient.post('/wallet/deposit', {
        amount: Number(values.amount),
        currency: selectedAccount?.currency || 'EUR',
        method: 'bank_transfer',
        bankAccountId: values.bankAccountId,
        proofUrl: proofUrl,
        notes: values.notes,
      });

      onSuccess?.();
      message.success('Bank transfer deposit submitted successfully');
    } catch (error) {
      console.error('Bank transfer submission failed:', error);
      const data = error.response?.data;
      const errorMsg =
        data?.error ||
        (Array.isArray(data?.errors) ? data.errors.map((e) => e.msg).join(', ') : null) ||
        error.message ||
        'Failed to submit bank transfer request';
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
      const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!isAllowed) {
        message.error('Only image (JPG, PNG) or PDF files are accepted.');
        return Upload.LIST_IGNORE;
      }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('File must be smaller than 5MB!');
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false;
    },
    fileList,
    maxCount: 1,
    accept: 'image/*,.pdf',
  };

  return (
    <Modal
      open={visible}
      title={null}
      footer={null}
      onCancel={onClose}
      width={460}
      forceRender
      centered
      closable={false}
      zIndex={1050}
      styles={{
        body: { padding: 0 },
        content: { padding: 0, borderRadius: 16, overflow: 'hidden' },
      }}
    >
      <div className="bg-white">
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Bank Transfer</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors text-sm"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Transfer funds and upload your receipt</p>
        </div>

        {/* ── Info ── */}
        <div className="px-6 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            Transfer to one of our accounts below, then upload your receipt. Balance updates after admin approval.
          </p>
        </div>

        {/* ── Form ── */}
        <div className="px-6 py-4">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
            size="middle"
          >
            <Form.Item
              name="bankAccountId"
              label={<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank Account</span>}
              rules={[{ required: true, message: 'Select the account you transferred to' }]}
              className="mb-3"
            >
              <Select
                placeholder="Select bank account to transfer to..."
                className="w-full"
                optionLabelProp="label"
                onChange={handleBankAccountChange}
              >
                {bankAccounts.map((acc) => {
                  const badgeCls = CURRENCY_BADGE[acc.currency] || 'bg-slate-100 text-slate-600 border-slate-200';
                  return (
                    <Option key={acc.id} value={acc.id} label={`${acc.bankName} · ${acc.currency}`}>
                      <div className="py-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800 text-sm">{acc.bankName}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
                            {acc.currency}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {acc.accountHolder} · {maskIban(acc.iban)}
                        </div>
                      </div>
                    </Option>
                  );
                })}
              </Select>
            </Form.Item>

            <BankDetailsCard account={selectedAccount} />

            <Form.Item
              name="amount"
              label={
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount
                  {selectedAccount && (
                    <span className="ml-1 font-normal normal-case text-slate-400">({selectedAccount.currency})</span>
                  )}
                </span>
              }
              rules={[
                { required: true, message: 'Required' },
                { type: 'number', min: 1, max: 50000, message: 'Amount must be between 1 and 50,000' },
              ]}
              className="mb-3"
            >
              <InputNumber className="w-full" min={1} max={50000} placeholder="Enter amount" />
            </Form.Item>

            <Form.Item
              name="notes"
              label={<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description / Reference</span>}
              rules={[{ required: true, message: 'Required' }]}
              className="mb-3"
            >
              <Input.TextArea placeholder="Your name or transfer reference" rows={2} />
            </Form.Item>

            <Form.Item
              label={<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt (Dekont)</span>}
              required
              className="mb-3"
            >
              <Upload {...uploadProps} listType="picture">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  Upload Image
                </button>
              </Upload>
              <span className="text-xs text-slate-400 mt-1 block">JPG, PNG, PDF — Max 5MB</span>
            </Form.Item>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || fileList.length === 0}
                className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium shadow-sm hover:bg-sky-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </Modal>
  );
}
