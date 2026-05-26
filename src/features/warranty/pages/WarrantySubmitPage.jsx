import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  ClockCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import WarrantyBrandShell from '../components/WarrantyBrandShell';
import WarrantyFileUploader from '../components/WarrantyFileUploader';
import { useSubmitWarrantyClaim } from '../hooks/useWarranty';

const { TextArea } = Input;

// Custom input style block — shared by every field so the whole ledger feels
// like one continuous instrument. The :where() selectors target deep Ant
// internals; without these the Ant defaults bleed white-on-white in dark mode.
const FORM_STYLE = `
  .warranty-ledger .ant-input,
  .warranty-ledger .ant-input-affix-wrapper,
  .warranty-ledger .ant-picker {
    background: rgba(255,255,255,0.03) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    color: #ffffff !important;
    height: 52px;
    border-radius: 6px;
    transition: all 0.2s ease;
  }
  .warranty-ledger .ant-input-affix-wrapper > .ant-input { background: transparent !important; height: auto !important; border: none !important; }
  .warranty-ledger textarea.ant-input {
    height: auto !important;
    min-height: 160px;
    padding: 16px 18px;
    font-size: 16px;
    line-height: 1.6;
    resize: vertical;
  }
  .warranty-ledger .ant-input::placeholder,
  .warranty-ledger .ant-picker-input > input::placeholder,
  .warranty-ledger textarea.ant-input::placeholder {
    color: rgba(255,255,255,0.22) !important;
  }
  .warranty-ledger .ant-picker-input > input { color: #ffffff !important; }
  .warranty-ledger .ant-input:hover,
  .warranty-ledger .ant-input-affix-wrapper:hover,
  .warranty-ledger .ant-picker:hover {
    border-color: rgba(0,168,196,0.45) !important;
    background: rgba(255,255,255,0.04) !important;
  }
  .warranty-ledger .ant-input:focus,
  .warranty-ledger .ant-input-affix-wrapper-focused,
  .warranty-ledger .ant-picker-focused {
    border-color: #00a8c4 !important;
    box-shadow: 0 0 0 3px rgba(0,168,196,0.12), 0 0 24px rgba(0,168,196,0.18) !important;
    background: rgba(255,255,255,0.05) !important;
  }
  .warranty-ledger .ant-form-item-explain-error {
    color: #fb7185 !important;
    font-size: 12px;
    padding-top: 6px;
    letter-spacing: 0.02em;
  }
  .warranty-ledger .ant-picker-suffix { color: rgba(255,255,255,0.3) !important; }
  .warranty-ledger .ant-picker-clear { background: #1a2620 !important; color: rgba(255,255,255,0.4) !important; }
`;

function FieldLabel({ children, hint, required }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <span className="text-[10px] font-duotone-bold uppercase tracking-[0.28em] text-white/55">
        {children}
        {required && <span className="text-[#00a8c4] ml-1">●</span>}
      </span>
      {hint && (
        <span className="text-[10px] font-duotone-regular uppercase tracking-[0.18em] text-white/25">
          {hint}
        </span>
      )}
    </div>
  );
}

function LedgerSection({ number, eyebrow, title, caption, children, delay = 0 }) {
  return (
    <section
      className="relative warranty-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Giant ghost numeral — bleeds into the left margin on desktop */}
      <span
        aria-hidden
        className="select-none pointer-events-none absolute -top-6 -left-2 sm:-left-12 md:-left-20 font-duotone-bold-extended leading-none text-white/[0.045] text-[120px] sm:text-[160px] md:text-[200px]"
      >
        {number}
      </span>

      <header className="relative pb-5 mb-8 border-b border-white/[0.08]">
        <p className="text-[10px] font-duotone-bold uppercase tracking-[0.38em] text-[#00a8c4]/80">
          {eyebrow}
        </p>
        <h2 className="mt-3 font-duotone-bold-extended uppercase text-3xl sm:text-4xl text-white tracking-tight leading-[0.95]">
          {title}
        </h2>
        {caption && (
          <p className="mt-3 max-w-lg text-sm font-duotone-regular text-white/45">
            {caption}
          </p>
        )}
      </header>

      <div className="space-y-5">{children}</div>
    </section>
  );
}

function TrustChip({ icon, label, sub }) {
  return (
    <div className="bg-[#0d1511]/80 px-4 py-5 sm:px-5 sm:py-6 text-center">
      <div className="flex justify-center text-[#00a8c4]" style={{ fontSize: 20 }}>
        {icon}
      </div>
      <p className="mt-3 font-duotone-bold text-xs sm:text-sm uppercase tracking-[0.22em] text-white">
        {label}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
        {sub}
      </p>
    </div>
  );
}

export default function WarrantySubmitPage() {
  const { t, i18n } = useTranslation(['public']);
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const submitMutation = useSubmitWarrantyClaim();

  const lang = i18n.language?.startsWith('tr') ? 'tr' : 'en';
  const submitting = submitMutation.isPending;

  const handleSubmit = async (values) => {
    setProgress(0);
    const formData = new FormData();
    formData.append('customer_name', values.customer_name);
    formData.append('customer_email', values.customer_email);
    if (values.customer_phone) formData.append('customer_phone', values.customer_phone);
    formData.append('product_name', values.product_name);
    if (values.product_brand)   formData.append('product_brand', values.product_brand);
    if (values.product_model)   formData.append('product_model', values.product_model);
    if (values.product_serial)  formData.append('product_serial', values.product_serial);
    if (values.purchase_date)   formData.append('purchase_date', dayjs(values.purchase_date).format('YYYY-MM-DD'));
    if (values.purchase_location) formData.append('purchase_location', values.purchase_location);
    formData.append('issue_description', values.issue_description);
    formData.append('preferred_language', lang);
    files.forEach((f) => formData.append('files', f, f.name));

    try {
      const result = await submitMutation.mutateAsync({
        formData,
        onUploadProgress: (e) => {
          if (e.total) setProgress((e.loaded / e.total) * 100);
        }
      });
      message.success(t('public:warranty.submit.successToast', 'Claim submitted'));
      navigate(`/care/track/${result.customer_token}?new=1`);
    } catch (err) {
      const apiError = err?.response?.data?.error;
      message.error(apiError || t('public:warranty.submit.errorGeneric', 'Could not submit your claim. Please try again.'));
    }
  };

  return (
    <WarrantyBrandShell>
      <style>{FORM_STYLE}</style>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="px-6 pt-10 sm:pt-16 pb-12 sm:pb-16 max-w-6xl mx-auto text-center warranty-fade-up">
        <div className="flex items-center gap-4 max-w-md mx-auto mb-8 warranty-meridian">
          <span className="text-[10px] font-duotone-bold tracking-[0.4em] text-[#00a8c4]/80 uppercase whitespace-nowrap">
            {t('public:warranty.submit.eyebrow', 'UKC.Care · Warranty')}
          </span>
        </div>

        <h1 className="font-duotone-bold-extended uppercase leading-[0.88] tracking-[-0.02em] text-white text-[44px] sm:text-[72px] md:text-[88px]">
          {t('public:warranty.submit.heroLine1', 'Warranty')}
          <span className="block text-[#00a8c4]">
            {t('public:warranty.submit.heroLine2', 'Claim')}
          </span>
        </h1>

        <p className="mt-8 mx-auto max-w-xl text-base sm:text-lg leading-relaxed font-duotone-regular text-white/65">
          {t('public:warranty.submit.heroBody',
            'Open a service file for your Duotone gear. Manufacturing defects covered — our team has eyes on every claim within 48 hours.')}
        </p>

        {/* Trust band */}
        <div
          className="mt-12 mx-auto max-w-2xl grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.05] warranty-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          <TrustChip
            icon={<ClockCircleOutlined />}
            label={t('public:warranty.submit.trust.responseLabel', '48 hours')}
            sub={t('public:warranty.submit.trust.responseSub', 'first response')}
          />
          <TrustChip
            icon={<LockOutlined />}
            label={t('public:warranty.submit.trust.privateLabel', 'Private')}
            sub={t('public:warranty.submit.trust.privateSub', 'media purged on close')}
          />
          <TrustChip
            icon={<SafetyCertificateOutlined />}
            label={t('public:warranty.submit.trust.linkLabel', 'No login')}
            sub={t('public:warranty.submit.trust.linkSub', 'tracking link forever')}
          />
        </div>
      </section>

      {/* ── PROMISE STRIP ────────────────────────────────────────────── */}
      <section
        className="px-6 max-w-4xl mx-auto mb-20 warranty-fade-up"
        style={{ animationDelay: '180ms' }}
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-[#0a1311] to-[#0d1511] p-6 sm:p-8">
          <div
            className="absolute -top-20 -right-16 h-56 w-56 blur-3xl opacity-60"
            style={{ background: 'radial-gradient(closest-side, rgba(0,168,196,0.22), transparent 70%)' }}
          />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-3">
            {[
              { n: '01', t: t('public:warranty.submit.process.submitTitle', 'Submit'),  d: t('public:warranty.submit.process.submitBody', 'Tell us what happened. Attach photos & videos as evidence.') },
              { n: '02', t: t('public:warranty.submit.process.reviewTitle', 'Review'),  d: t('public:warranty.submit.process.reviewBody', 'Our team confirms coverage and coordinates with the manufacturer.') },
              { n: '03', t: t('public:warranty.submit.process.resolveTitle', 'Resolve'), d: t('public:warranty.submit.process.resolveBody', 'Repair, replacement, or refund — tracked end-to-end on your private link.') }
            ].map((step, idx) => (
              <div key={step.n} className="flex sm:block items-start gap-4">
                <span className="font-duotone-bold-extended text-3xl sm:text-4xl text-[#00a8c4]/80 leading-none">
                  {step.n}
                </span>
                <div className="sm:mt-4">
                  <p className="font-duotone-bold uppercase tracking-[0.2em] text-white text-sm">
                    {step.t}
                  </p>
                  <p className="mt-2 text-xs sm:text-[13px] font-duotone-regular text-white/45 leading-relaxed">
                    {step.d}
                  </p>
                </div>
                {idx < 2 && (
                  <span className="hidden sm:block absolute" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LEDGER FORM ──────────────────────────────────────────────── */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={submitting}
        requiredMark={false}
        className="warranty-ledger"
        scrollToFirstError
      >
        <div className="max-w-3xl mx-auto px-6 sm:px-8 pb-12 space-y-20">

          {/* 01 — IDENTITY */}
          <LedgerSection
            number="01"
            eyebrow={t('public:warranty.submit.section1Eyebrow', 'Section · One')}
            title={t('public:warranty.submit.section1Title', 'Identity')}
            caption={t('public:warranty.submit.section1Caption',
              'Tell us how to reach you. Updates go to your email; nothing else.')}
            delay={240}
          >
            <Form.Item
              name="customer_name"
              label={<FieldLabel required>{t('public:warranty.submit.fields.name', 'Full name')}</FieldLabel>}
              rules={[{ required: true, min: 2, max: 120 }]}
            >
              <Input placeholder={t('public:warranty.submit.placeholders.name', 'Jamie Rivera')} />
            </Form.Item>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
              <Form.Item
                name="customer_email"
                label={<FieldLabel required>{t('public:warranty.submit.fields.email', 'Email')}</FieldLabel>}
                rules={[{ required: true, type: 'email', max: 200 }]}
              >
                <Input placeholder="name@example.com" />
              </Form.Item>
              <Form.Item
                name="customer_phone"
                label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.phone', 'Phone')}</FieldLabel>}
                rules={[{ max: 50 }]}
              >
                <Input placeholder="+90 ..." />
              </Form.Item>
            </div>
          </LedgerSection>

          {/* 02 — EQUIPMENT */}
          <LedgerSection
            number="02"
            eyebrow={t('public:warranty.submit.section2Eyebrow', 'Section · Two')}
            title={t('public:warranty.submit.section2Title', 'Equipment')}
            caption={t('public:warranty.submit.section2Caption',
              'Identify the gear. Serial numbers are usually on the bladder, board base, or kite plug.')}
            delay={300}
          >
            <Form.Item
              name="product_name"
              label={<FieldLabel required>{t('public:warranty.submit.fields.product', 'Product')}</FieldLabel>}
              rules={[{ required: true, max: 200 }]}
            >
              <Input placeholder={t('public:warranty.submit.placeholders.product', 'e.g. Duotone Juice 11m')} />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
              <Form.Item
                name="product_brand"
                label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.brand', 'Brand')}</FieldLabel>}
                rules={[{ max: 120 }]}
              >
                <Input placeholder="Duotone" />
              </Form.Item>
              <Form.Item
                name="product_model"
                label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.model', 'Model')}</FieldLabel>}
                rules={[{ max: 120 }]}
              >
                <Input placeholder="2024 / SLS" />
              </Form.Item>
            </div>
            <Form.Item
              name="product_serial"
              label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.serial', 'Serial number')}</FieldLabel>}
              rules={[{ max: 120 }]}
            >
              <Input placeholder="DT-2024-XXXXXX" />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
              <Form.Item
                name="purchase_date"
                label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.purchaseDate', 'Purchase date')}</FieldLabel>}
              >
                <DatePicker style={{ width: '100%' }} placeholder="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item
                name="purchase_location"
                label={<FieldLabel hint={t('public:warranty.submit.optional', 'Optional')}>{t('public:warranty.submit.fields.purchaseLocation', 'Bought from')}</FieldLabel>}
                rules={[{ max: 200 }]}
              >
                <Input placeholder={t('public:warranty.submit.placeholders.purchase', 'Shop or order #')} />
              </Form.Item>
            </div>
          </LedgerSection>

          {/* 03 — INCIDENT */}
          <LedgerSection
            number="03"
            eyebrow={t('public:warranty.submit.section3Eyebrow', 'Section · Three')}
            title={t('public:warranty.submit.section3Title', 'Incident')}
            caption={t('public:warranty.submit.section3Caption',
              'The story matters. When, how, what changed — more detail helps us decide faster.')}
            delay={360}
          >
            <Form.Item
              name="issue_description"
              label={<FieldLabel required>{t('public:warranty.submit.fields.issue', 'Describe the problem')}</FieldLabel>}
              rules={[{ required: true, min: 10, max: 5000 }]}
            >
              <TextArea
                placeholder={t('public:warranty.submit.fields.issuePlaceholder',
                  'Tell us what happened, when it happened, and how the product is currently behaving.')}
              />
            </Form.Item>
          </LedgerSection>

          {/* 04 — EVIDENCE */}
          <LedgerSection
            number="04"
            eyebrow={t('public:warranty.submit.section4Eyebrow', 'Section · Four')}
            title={t('public:warranty.submit.section4Title', 'Evidence')}
            caption={t('public:warranty.submit.section4Caption',
              'Photos of the issue, the serial plate, and any video that shows the defect in action.')}
            delay={420}
          >
            <WarrantyFileUploader
              variant="dark"
              value={files}
              onChange={setFiles}
              progress={progress}
              isUploading={submitting}
            />
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <LockOutlined className="text-[#00a8c4]/80 mt-1 shrink-0" />
              <p className="text-xs sm:text-[13px] font-duotone-regular text-white/45 leading-relaxed">
                {t('public:warranty.submit.privacy',
                  'Your photos and videos are stored privately and viewable only via your tracking link. They are permanently deleted from our servers when the claim is closed.')}
              </p>
            </div>
          </LedgerSection>

          {/* SUBMIT */}
          <section
            className="pt-2 warranty-fade-up"
            style={{ animationDelay: '480ms' }}
          >
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <ArrowRightOutlined />}
              iconPosition="end"
              className="!h-[72px] !rounded-md font-duotone-bold uppercase shadow-xl transition-all duration-150 hover:scale-[1.005] active:scale-[0.99]"
              style={{
                background: '#4b4f54',
                color: '#00a8c4',
                border: '1px solid rgba(0,168,196,0.55)',
                boxShadow:
                  '0 0 28px rgba(0,168,196,0.22), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)',
                fontSize: 16,
                letterSpacing: '0.28em'
              }}
            >
              {submitting
                ? t('public:warranty.submit.submitting', 'Initiating…')
                : t('public:warranty.submit.cta', 'Initiate warranty claim')}
            </Button>
            <p className="text-center mt-5 text-xs font-duotone-regular text-white/35 tracking-wide">
              {t('public:warranty.submit.afterSubmit',
                'You will receive a tracking link by email immediately. The link stays active until our team closes the case.')}
            </p>
          </section>
        </div>
      </Form>

      {/* ── PROMISE FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-4xl mx-auto px-6 py-14 text-center">
          <div className="flex items-center gap-4 max-w-md mx-auto warranty-meridian">
            <span className="text-[10px] font-duotone-bold uppercase tracking-[0.4em] text-white/35 whitespace-nowrap">
              Duotone Pro Center · Urla
            </span>
          </div>
          <p className="mt-5 text-white/45 italic max-w-xl mx-auto leading-relaxed text-[15px]">
            {t('public:warranty.submit.promise',
              '“Every product we put in your hands is built to withstand the elements. When something goes wrong, we make it right.”')}
          </p>
        </div>
      </footer>
    </WarrantyBrandShell>
  );
}
