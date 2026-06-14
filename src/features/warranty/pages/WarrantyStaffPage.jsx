import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Skeleton, Input, Button, Form, Checkbox, Divider,
  Tag, Space, message, Card
} from 'antd';
import dayjs from 'dayjs';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import CareBrandShell from '../components/CareBrandShell';
import WarrantyStatusBadge from '../components/WarrantyStatusBadge';
import WarrantyTimeline from '../components/WarrantyTimeline';
import WarrantyMediaGallery from '../components/WarrantyMediaGallery';
import WarrantyFileUploader from '../components/WarrantyFileUploader';
import StatusTransitionSelect from '../components/StatusTransitionSelect';
import {
  useStaffClaim,
  useStaffNote,
  useStaffStatus,
  useStaffClaimNumber,
  useStaffUpload
} from '../hooks/useWarranty';
import { staffMediaUrl, staffMediaArchiveUrl } from '../services/warrantyApi';

const { TextArea } = Input;

export default function WarrantyStaffPage() {
  const { code } = useParams();
  const { t } = useTranslation(['public']);
  const query = useStaffClaim(code);
  const noteMutation = useStaffNote(code);
  const statusMutation = useStaffStatus(code);
  const claimNumberMutation = useStaffClaimNumber(code);
  const uploadMutation = useStaffUpload(code);

  const [noteForm] = Form.useForm();
  const [statusValue, setStatusValue] = useState(undefined);
  const [statusNote, setStatusNote] = useState('');
  const [claimNumberValue, setClaimNumberValue] = useState('');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);

  if (query.isLoading) {
    return (
      <CareBrandShell title={t('public:warranty.staff.loadingTitle', 'Loading case…')}>
        <Skeleton active />
      </CareBrandShell>
    );
  }

  if (query.isError) {
    return (
      <CareBrandShell
        eyebrow={t('public:warranty.staff.eyebrow', 'UKC.Care · Warranty team')}
        title={t('public:warranty.staff.notFoundTitle', 'Link not active')}
      >
        <Alert
          showIcon type="warning"
          message={t('public:warranty.staff.notFoundTitle', 'Link not active')}
          description={t('public:warranty.staff.notFound',
            'This staff link is either revoked or the case has been deleted. Ask the admin for a fresh link.')}
        />
      </CareBrandShell>
    );
  }

  const { claim, events, media, staffLink, allowedStatuses } = query.data;

  // The manufacturer claim number locks to whoever first entered it. This staff
  // member can only edit it if they set it (or it isn't set yet). An admin
  // override also locks staff out (owner becomes a user, not this link).
  const claimNumberOwnedByMe = claim.external_claim_number_set_by_staff_link_id === staffLink.id;
  const claimNumberLocked = Boolean(claim.external_claim_number) && !claimNumberOwnedByMe;

  const handleNoteSubmit = async (values) => {
    try {
      await noteMutation.mutateAsync({ body: values.body, visibleToCustomer: !!values.visible_to_customer });
      noteForm.resetFields();
      message.success(t('public:warranty.staff.noteAdded', 'Note added.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to add note');
    }
  };

  const handleStatusSubmit = async () => {
    if (!statusValue) return;
    try {
      await statusMutation.mutateAsync({ status: statusValue, note: statusNote || undefined });
      setStatusValue(undefined);
      setStatusNote('');
      message.success(t('public:warranty.staff.statusUpdated', 'Status updated.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const handleClaimNumberSubmit = async () => {
    if (!claimNumberValue.trim()) return;
    try {
      await claimNumberMutation.mutateAsync(claimNumberValue.trim());
      setClaimNumberValue('');
      message.success(t('public:warranty.staff.claimNumberSaved', 'Manufacturer claim # saved.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save claim number');
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f, f.name));
    try {
      setProgress(0);
      await uploadMutation.mutateAsync({
        formData,
        onUploadProgress: (e) => { if (e.total) setProgress((e.loaded / e.total) * 100); }
      });
      setFiles([]);
      setProgress(0);
      message.success(t('public:warranty.staff.uploadDone', 'Files uploaded.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Upload failed');
    }
  };

  return (
    <CareBrandShell
      eyebrow={t('public:warranty.staff.eyebrow', 'UKC.Care · Warranty team')}
      title={claim.product_name}
      subtitle={t('public:warranty.staff.subtitle', 'Case for {{customer}}', { customer: claim.customer_name })}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <WarrantyStatusBadge status={claim.status} size="lg" />
        <Tag color="purple">{staffLink.staff_name}</Tag>
        <span className="text-xs text-slate-500">
          {t('public:warranty.staff.opened', 'Opened {{when}}', {
            when: dayjs(claim.created_at).format('YYYY-MM-DD HH:mm')
          })}
        </span>
      </div>

      <Card size="small" className="!mb-5">
        <Space direction="vertical" size="small" className="w-full">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t('public:warranty.staff.summary', 'Case summary')}
          </div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">
            {claim.issue_description}
          </div>
          {claim.external_claim_number && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold">{t('public:warranty.staff.currentClaimNumber', 'Current claim #:')}</span>{' '}
              {claim.external_claim_number}
            </div>
          )}
        </Space>
      </Card>

      <Divider orientation="left" plain>
        {t('public:warranty.staff.claimNumberSection', 'Manufacturer claim number')}
      </Divider>
      {claimNumberLocked ? (
        <Alert
          type="info"
          showIcon
          message={t('public:warranty.staff.claimNumberLockedTitle', 'Claim # {{value}}', {
            value: claim.external_claim_number
          })}
          description={t('public:warranty.staff.claimNumberLocked',
            'This manufacturer claim number was set by {{name}} and is locked. Ask an admin if it needs to change.', {
              name: claim.external_claim_number_set_by_name || t('public:warranty.staff.anotherMember', 'another team member')
            })}
        />
      ) : (
        <Space.Compact className="w-full">
          <Input
            value={claimNumberValue}
            onChange={(e) => setClaimNumberValue(e.target.value)}
            placeholder={claim.external_claim_number || t('public:warranty.staff.claimNumberPlaceholder', 'e.g. RMA-1234')}
            maxLength={120}
          />
          <Button
            type="primary"
            loading={claimNumberMutation.isPending}
            onClick={handleClaimNumberSubmit}
          >
            {claimNumberOwnedByMe
              ? t('public:warranty.staff.claimNumberUpdate', 'Update')
              : t('public:warranty.staff.claimNumberSave', 'Save')}
          </Button>
        </Space.Compact>
      )}

      <Divider orientation="left" plain>
        {t('public:warranty.staff.statusSection', 'Status update')}
      </Divider>
      <Space direction="vertical" size="small" className="w-full">
        <StatusTransitionSelect
          currentStatus={claim.status}
          isStaff
          value={statusValue}
          onChange={setStatusValue}
        />
        <TextArea
          rows={2}
          placeholder={t('public:warranty.staff.statusNote', 'Optional note to attach with this status change')}
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          maxLength={3000}
        />
        <Button
          type="primary"
          loading={statusMutation.isPending}
          disabled={!statusValue}
          onClick={handleStatusSubmit}
        >
          {t('public:warranty.staff.statusApply', 'Apply status')}
        </Button>
        {allowedStatuses?.length === 0 && (
          <Alert
            type="info" showIcon
            message={t('public:warranty.staff.noTransitions', 'No further status changes are available from this state.')}
          />
        )}
      </Space>

      <Divider orientation="left" plain>
        {t('public:warranty.staff.noteSection', 'Add a note')}
      </Divider>
      <Form
        form={noteForm}
        layout="vertical"
        initialValues={{ visible_to_customer: false }}
        onFinish={handleNoteSubmit}
      >
        <Form.Item name="body" rules={[{ required: true, min: 1, max: 3000 }]}>
          <TextArea rows={3} placeholder={t('public:warranty.staff.notePlaceholder', 'Write a note for the team or the customer…')} />
        </Form.Item>
        <Form.Item name="visible_to_customer" valuePropName="checked">
          <Checkbox>
            {t('public:warranty.staff.noteVisibleToCustomer', 'Make this note visible to the customer')}
          </Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={noteMutation.isPending}>
          {t('public:warranty.staff.noteAddCta', 'Add note')}
        </Button>
      </Form>

      <Divider orientation="left" plain>
        {t('public:warranty.staff.mediaSection', 'Supplementary files & Product Bill')}
      </Divider>
      <p className="-mt-2 mb-3 text-xs text-slate-500">
        {t('public:warranty.staff.mediaHint',
          'Attach photos, videos or a PDF — including the manufacturer Product Bill / proof of purchase. Documents are visible to the UKC team only, not the customer.')}
      </p>
      <WarrantyFileUploader
        value={files}
        onChange={setFiles}
        allowDocuments
        existing={{
          photoCount: claim.photo_count,
          videoCount: claim.video_count,
          documentCount: claim.document_count,
          totalBytes: Number(claim.total_bytes) || 0
        }}
        progress={progress}
        isUploading={uploadMutation.isPending}
      />
      {files.length > 0 && (
        <Button
          type="primary"
          className="!mt-3"
          loading={uploadMutation.isPending}
          onClick={handleUpload}
        >
          {t('public:warranty.staff.uploadCta', 'Upload {{n}} file(s)', { n: files.length })}
        </Button>
      )}

      <Divider orientation="left" plain>
        {t('public:warranty.staff.timelineSection', 'Activity')}
      </Divider>
      <WarrantyTimeline events={events} mode="staff" />

      <Divider orientation="left" plain>
        {t('public:warranty.staff.galleryHeading', 'Existing media')}
      </Divider>
      <WarrantyMediaGallery
        media={media}
        mediaUrlFor={(id) => staffMediaUrl(code, id)}
        grouped
        showUploader
        headerExtra={media.length > 0 ? (
          <Button
            icon={<DownloadOutlined />}
            href={staffMediaArchiveUrl(code)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('public:warranty.staff.downloadZip', 'Download all (ZIP)')}
          </Button>
        ) : null}
      />
    </CareBrandShell>
  );
}
