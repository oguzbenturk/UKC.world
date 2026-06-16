import React, { useMemo, useState } from 'react';
import {
  Modal, Tabs, Skeleton, Descriptions, Tag, Button, Space, Popconfirm, Input,
  Form, Checkbox, Empty, Divider, message, Alert, List, Table
} from 'antd';
import {
  ReloadOutlined, MailOutlined, CloseCircleOutlined,
  DeleteOutlined, UserAddOutlined, LinkOutlined, ApiOutlined,
  DownloadOutlined, EditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import WarrantyStatusBadge from './WarrantyStatusBadge';
import WarrantyTimeline from './WarrantyTimeline';
import WarrantyMediaGallery from './WarrantyMediaGallery';
import WarrantyFileUploader from './WarrantyFileUploader';
import StatusTransitionSelect from './StatusTransitionSelect';
import {
  useAdminWarrantyClaim,
  useWarrantyEmailDeliveries,
  useUpdateStatus,
  useAddNote,
  useSendCustomerUpdate,
  useResendCustomerLink,
  useCloseClaim,
  useDeleteClaim,
  useDeleteMedia,
  useAdminUpload,
  useCreateStaffLink,
  useResendStaffLink,
  useRevokeStaffLink,
  useAdminSetClaimNumber
} from '../hooks/useWarranty';
import { customerMediaUrl, downloadAdminMediaArchive, openAdminMedia } from '../services/warrantyApi';

const { TextArea } = Input;

function staffTrackingUrl(token) {
  if (!token) return '';
  if (typeof window === 'undefined') return `/care/staff/${token}`;
  return `${window.location.origin}/care/staff/${token}`;
}

function customerTrackingUrl(token) {
  if (!token) return '';
  if (typeof window === 'undefined') return `/care/track/${token}`;
  return `${window.location.origin}/care/track/${token}`;
}

export default function AdminWarrantyDetailModal({ claimId, open, onClose }) {
  const { t } = useTranslation(['admin', 'public']);
  const query = useAdminWarrantyClaim(claimId, { enabled: open });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1100}
      destroyOnClose
      title={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">
              {query.data?.claim?.product_name || t('admin:warranty.detail.loading', 'Warranty claim')}
            </span>
            {query.data?.claim && (
              <code className="font-mono text-xs text-slate-500">{query.data.claim.customer_token}</code>
            )}
          </div>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => query.refetch()} />
        </div>
      }
    >
      {query.isLoading || !query.data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <ClaimBody data={query.data} claimId={claimId} onClose={onClose} />
      )}
    </Modal>
  );
}

function ClaimBody({ data, claimId, onClose }) {
  const { t } = useTranslation(['admin', 'public']);
  const { claim, events, media, staffLinks } = data;

  const updateStatus    = useUpdateStatus(claimId);
  const addNote         = useAddNote(claimId);
  const sendUpdate      = useSendCustomerUpdate(claimId);
  const resendLink      = useResendCustomerLink(claimId);
  const closeMutation   = useCloseClaim(claimId);
  const deleteMutation  = useDeleteClaim();
  const deleteMedia     = useDeleteMedia(claimId);
  const adminUpload     = useAdminUpload(claimId);
  const createStaffLink = useCreateStaffLink(claimId);
  const resendStaffLink = useResendStaffLink(claimId);
  const revokeStaffLink = useRevokeStaffLink(claimId);

  const [statusValue, setStatusValue] = useState(undefined);
  const [statusNote, setStatusNote] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [noteForm] = Form.useForm();
  const [updateForm] = Form.useForm();
  const [staffForm] = Form.useForm();

  const handleDownloadArchive = async () => {
    setArchiveBusy(true);
    try {
      await downloadAdminMediaArchive(claimId, claim.customer_token);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to download media archive');
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f, f.name));
    try {
      setUploadProgress(0);
      await adminUpload.mutateAsync({
        formData,
        onUploadProgress: (e) => { if (e.total) setUploadProgress((e.loaded / e.total) * 100); }
      });
      setFiles([]);
      setUploadProgress(0);
      message.success(t('admin:warranty.media.uploaded', 'Files uploaded.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Upload failed');
    }
  };

  const handleOpenDocument = (item) => {
    openAdminMedia(claimId, item.id).catch((err) => {
      message.error(err?.response?.data?.error || 'Failed to open document');
    });
  };

  const activeStaffLinks = useMemo(
    () => staffLinks.filter((l) => !l.revoked_at),
    [staffLinks]
  );

  const handleStatusApply = async () => {
    if (!statusValue) return;
    try {
      await updateStatus.mutateAsync({ status: statusValue, note: statusNote || undefined });
      setStatusValue(undefined);
      setStatusNote('');
      message.success(t('admin:warranty.actions.statusUpdated', 'Status updated. Customer notified.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const handleNoteSubmit = async (values) => {
    try {
      await addNote.mutateAsync({ body: values.body, visibleToCustomer: !!values.visible_to_customer });
      noteForm.resetFields();
      message.success(t('admin:warranty.actions.noteSaved', 'Note saved.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save note');
    }
  };

  const handleCustomerUpdate = async (values) => {
    try {
      await sendUpdate.mutateAsync({ body: values.body });
      updateForm.resetFields();
      message.success(t('admin:warranty.actions.customerUpdated', 'Update sent to customer.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to send update');
    }
  };

  const handleStaffInvite = async (values) => {
    try {
      await createStaffLink.mutateAsync({
        staffName: values.staff_name,
        staffEmail: values.staff_email
      });
      staffForm.resetFields();
      message.success(t('admin:warranty.actions.staffInvited', 'Staff invite sent.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to invite staff');
    }
  };

  const tabItems = [
    {
      key: 'overview',
      label: t('admin:warranty.detail.tabs.overview', 'Overview'),
      children: <OverviewTab claim={claim} claimId={claimId} />
    },
    {
      key: 'timeline',
      label: t('admin:warranty.detail.tabs.timeline', 'Timeline'),
      children: <WarrantyTimeline events={events} mode="admin" />
    },
    {
      key: 'media',
      label: t('admin:warranty.detail.tabs.media', 'Media ({{n}})', { n: media.length }),
      children: (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t('admin:warranty.media.addTitle', 'Add files or Product Bill')}
            </h4>
            <p className="mb-3 text-xs text-slate-500">
              {t('admin:warranty.media.addHint',
                'Attach photos, videos or a PDF — including the manufacturer Product Bill / proof of purchase. Documents are kept internal to the UKC team and are not shown to the customer.')}
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
              progress={uploadProgress}
              isUploading={adminUpload.isPending}
            />
            {files.length > 0 && (
              <Button
                type="primary"
                className="!mt-3"
                loading={adminUpload.isPending}
                onClick={handleUpload}
              >
                {t('admin:warranty.media.uploadCta', 'Upload {{n}} file(s)', { n: files.length })}
              </Button>
            )}
          </section>
          <WarrantyMediaGallery
            media={media}
            mediaUrlFor={(id) => customerMediaUrl(claim.customer_token, id)}
            onOpenDocument={handleOpenDocument}
            grouped
            showUploader
            headerExtra={media.length > 0 ? (
              <Button icon={<DownloadOutlined />} loading={archiveBusy} onClick={handleDownloadArchive}>
                {t('admin:warranty.media.downloadZip', 'Download all (ZIP)')}
              </Button>
            ) : null}
            canDelete
            onDelete={(id) => deleteMedia.mutate(id, {
              onSuccess: () => message.success(t('admin:warranty.actions.mediaDeleted', 'Media deleted.'))
            })}
          />
        </div>
      )
    },
    {
      key: 'staff',
      label: t('admin:warranty.detail.tabs.staff', 'Staff links'),
      children: (
        <StaffLinksTab
          claim={claim}
          staffLinks={staffLinks}
          activeStaffLinks={activeStaffLinks}
          onInvite={handleStaffInvite}
          onResend={(id) => resendStaffLink.mutate(id, {
            onSuccess: () => message.success(t('admin:warranty.actions.staffLinkResent', 'Tracking email resent to staff member.')),
            onError: (err) => message.error(err?.response?.data?.error || 'Failed to resend staff email')
          })}
          resendingLinkId={resendStaffLink.isPending ? resendStaffLink.variables : null}
          onRevoke={(id) => revokeStaffLink.mutate(id, {
            onSuccess: () => message.success(t('admin:warranty.actions.staffRevoked', 'Staff link revoked.'))
          })}
          form={staffForm}
          submitting={createStaffLink.isPending}
        />
      )
    },
    {
      key: 'emails',
      label: t('admin:warranty.detail.tabs.emails', 'Emails'),
      children: <EmailDeliveriesTab claimId={claimId} />
    },
    {
      key: 'notes',
      label: t('admin:warranty.detail.tabs.notes', 'Notes & messages'),
      children: (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              {t('admin:warranty.detail.internalNote', 'Add a note')}
            </h3>
            <Form
              form={noteForm}
              layout="vertical"
              initialValues={{ visible_to_customer: false }}
              onFinish={handleNoteSubmit}
            >
              <Form.Item name="body" rules={[{ required: true, min: 1, max: 3000 }]}>
                <TextArea rows={3} placeholder={t('admin:warranty.detail.notePlaceholder', 'Write a note…')} />
              </Form.Item>
              <Form.Item name="visible_to_customer" valuePropName="checked">
                <Checkbox>
                  {t('admin:warranty.detail.noteVisible', 'Visible to customer')}
                </Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={addNote.isPending}>
                {t('admin:warranty.detail.noteSubmit', 'Add note')}
              </Button>
            </Form>
          </section>

          <Divider />

          <section>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              {t('admin:warranty.detail.customerUpdate', 'Send a message to the customer')}
            </h3>
            <Form form={updateForm} layout="vertical" onFinish={handleCustomerUpdate}>
              <Form.Item name="body" rules={[{ required: true, min: 1, max: 3000 }]}>
                <TextArea rows={3} placeholder={t('admin:warranty.detail.customerUpdatePlaceholder',
                  'Type a message — the customer will see it on their tracking page and get an email.')} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={sendUpdate.isPending}>
                {t('admin:warranty.detail.customerUpdateSend', 'Send to customer')}
              </Button>
            </Form>
          </section>
        </div>
      )
    },
    {
      key: 'danger',
      label: <span className="text-rose-600">{t('admin:warranty.detail.tabs.danger', 'Danger zone')}</span>,
      children: (
        <DangerZone
          claim={claim}
          onCloseClaim={() => closeMutation.mutate(undefined, {
            onSuccess: () => message.success(t('admin:warranty.actions.closed', 'Claim closed.'))
          })}
          onDeleteClaim={() => deleteMutation.mutate(claimId, {
            onSuccess: () => {
              message.success(t('admin:warranty.actions.deleted', 'Claim deleted.'));
              onClose?.();
            }
          })}
          closing={closeMutation.isPending}
          deleting={deleteMutation.isPending}
        />
      )
    }
  ];

  return (
    <>
      <ActionsToolbar
        claim={claim}
        statusValue={statusValue}
        setStatusValue={setStatusValue}
        statusNote={statusNote}
        setStatusNote={setStatusNote}
        onStatusApply={handleStatusApply}
        statusBusy={updateStatus.isPending}
        onResendLink={() => resendLink.mutate(undefined, {
          onSuccess: () => message.success(t('admin:warranty.actions.linkResent', 'Tracking link resent.'))
        })}
        resendBusy={resendLink.isPending}
      />
      <Tabs items={tabItems} defaultActiveKey="overview" />
    </>
  );
}

function AdminClaimNumberField({ claim, claimId }) {
  const { t } = useTranslation(['admin', 'public']);
  const setClaimNumber = useAdminSetClaimNumber(claimId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(claim.external_claim_number || '');

  const current = claim.external_claim_number;
  const owner = claim.external_claim_number_set_by_name;
  const setAt = claim.external_claim_number_set_at;

  const save = async () => {
    const v = value.trim();
    if (!v) return;
    try {
      await setClaimNumber.mutateAsync(v);
      setEditing(false);
      message.success(t('admin:warranty.claimNumber.saved', 'Manufacturer claim # saved.'));
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save claim number');
    }
  };

  if (editing) {
    return (
      <Space.Compact style={{ width: '100%', maxWidth: 360 }}>
        <Input
          value={value}
          autoFocus
          maxLength={120}
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={save}
          placeholder={t('admin:warranty.claimNumber.placeholder', 'e.g. RMA-1234')}
        />
        <Button type="primary" loading={setClaimNumber.isPending} onClick={save}>
          {t('admin:warranty.actions.save', 'Save')}
        </Button>
        <Button onClick={() => { setValue(current || ''); setEditing(false); }}>
          {t('admin:warranty.actions.cancel', 'Cancel')}
        </Button>
      </Space.Compact>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{current || '—'}</span>
      {owner && (
        <span className="text-[11px] text-slate-400">
          {t('admin:warranty.claimNumber.setBy', 'set by {{name}}{{when}}', {
            name: owner,
            when: setAt ? ` · ${dayjs(setAt).format('YYYY-MM-DD')}` : ''
          })}
        </span>
      )}
      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setValue(current || ''); setEditing(true); }}>
        {current
          ? t('admin:warranty.claimNumber.override', 'Override')
          : t('admin:warranty.claimNumber.set', 'Set')}
      </Button>
    </div>
  );
}

function OverviewTab({ claim, claimId }) {
  const { t } = useTranslation(['admin', 'public']);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <WarrantyStatusBadge status={claim.status} mode="admin" />
        <code className="font-mono text-xs text-slate-500">{claim.customer_token}</code>
        <a
          href={customerTrackingUrl(claim.customer_token)}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-sky-600 hover:underline"
        >
          <LinkOutlined /> {t('admin:warranty.detail.openTracking', 'Open tracking page')}
        </a>
      </div>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          { key: 'customer', label: t('admin:warranty.detail.fields.customer', 'Customer'),
            children: `${claim.customer_name} (${claim.customer_email})` },
          { key: 'phone', label: t('admin:warranty.detail.fields.phone', 'Phone'),
            children: claim.customer_phone || '—' },
          { key: 'product', label: t('admin:warranty.detail.fields.product', 'Product'),
            children: `${claim.product_name}${claim.product_brand ? ` · ${claim.product_brand}` : ''}` },
          { key: 'model', label: t('admin:warranty.detail.fields.model', 'Model / Serial'),
            children: `${claim.product_model || '—'} / ${claim.product_serial || '—'}` },
          { key: 'purchase', label: t('admin:warranty.detail.fields.purchase', 'Purchase'),
            children: `${claim.purchase_date ? dayjs(claim.purchase_date).format('YYYY-MM-DD') : '—'}${claim.purchase_location ? ` · ${claim.purchase_location}` : ''}` },
          { key: 'mfr', label: t('admin:warranty.detail.fields.mfrClaim', 'Manufacturer claim #'),
            children: <AdminClaimNumberField claim={claim} claimId={claimId} /> },
          { key: 'submitted', label: t('admin:warranty.detail.fields.submitted', 'Submitted'),
            children: `${dayjs(claim.created_at).format('YYYY-MM-DD HH:mm')} · ${claim.preferred_language?.toUpperCase()}` },
          { key: 'closed', label: t('admin:warranty.detail.fields.closed', 'Closed at'),
            children: claim.closed_at ? dayjs(claim.closed_at).format('YYYY-MM-DD HH:mm') : '—' },
          { key: 'issue', span: 2, label: t('admin:warranty.detail.fields.issue', 'Issue description'),
            children: <span className="whitespace-pre-wrap">{claim.issue_description}</span> }
        ]}
      />
    </>
  );
}

function ActionsToolbar({
  claim,
  statusValue, setStatusValue,
  statusNote, setStatusNote,
  onStatusApply, statusBusy,
  onResendLink, resendBusy
}) {
  const { t } = useTranslation(['admin', 'public']);
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.actions.changeStatus', 'Change status')}
          </label>
          <StatusTransitionSelect
            currentStatus={claim.status}
            value={statusValue}
            onChange={setStatusValue}
          />
        </div>
        <div className="min-w-[260px] flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {t('admin:warranty.actions.statusNote', 'Optional note to customer')}
          </label>
          <Input
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder={t('admin:warranty.actions.statusNotePlaceholder',
              'E.g. "Waiting on the manufacturer to confirm…"')}
          />
        </div>
        <Button
          type="primary"
          onClick={onStatusApply}
          disabled={!statusValue}
          loading={statusBusy}
        >
          {t('admin:warranty.actions.apply', 'Apply')}
        </Button>
        <Button icon={<MailOutlined />} loading={resendBusy} onClick={onResendLink}>
          {t('admin:warranty.actions.resendLink', 'Resend customer link')}
        </Button>
      </div>
    </div>
  );
}

const EMAIL_STATUS_META = {
  delivered:        { color: 'green',    label: 'Delivered' },
  opened:           { color: 'cyan',     label: 'Opened' },
  clicked:          { color: 'geekblue', label: 'Clicked' },
  sent:             { color: 'default',  label: 'Sent' },
  delivery_delayed: { color: 'orange',   label: 'Delayed' },
  bounced:          { color: 'red',      label: 'Bounced' },
  complained:       { color: 'volcano',  label: 'Spam complaint' },
  failed:           { color: 'red',      label: 'Failed' }
};

function EmailStatusTag({ status }) {
  const meta = EMAIL_STATUS_META[status] || { color: 'default', label: status || 'Unknown' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function EmailDeliveriesTab({ claimId }) {
  const { t } = useTranslation(['admin']);
  const query = useWarrantyEmailDeliveries(claimId);
  const rows = query.data || [];

  const columns = [
    {
      title: t('admin:warranty.emails.recipient', 'Recipient'),
      dataIndex: 'recipient',
      key: 'recipient',
      render: (v) => <span className="font-medium break-all">{v}</span>
    },
    {
      title: t('admin:warranty.emails.subject', 'Subject'),
      dataIndex: 'subject',
      key: 'subject',
      render: (v) => <span className="text-slate-600">{v || '—'}</span>
    },
    {
      title: t('admin:warranty.emails.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (v, row) => (
        <span>
          <EmailStatusTag status={v} />
          {row.error ? <div className="text-[11px] text-rose-500">{row.error}</div> : null}
        </span>
      )
    },
    {
      title: t('admin:warranty.emails.when', 'Last update'),
      key: 'when',
      width: 150,
      render: (_v, row) => {
        const ts = row.last_event_at || row.created_at;
        return <span className="text-xs text-slate-500">{ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '—'}</span>;
      }
    }
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500">
          {t('admin:warranty.emails.hint',
            'Every email this case has sent, with live delivery status from the mail provider (Resend). "Delivered" = it reached the recipient\'s mail server; "Bounced" = it was rejected; "Sent" = handed off, awaiting confirmation.')}
        </p>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={query.isFetching}
          onClick={() => query.refetch()}
        >
          {t('admin:warranty.actions.refresh', 'Refresh')}
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : rows.length === 0 ? (
        <Empty description={t('admin:warranty.emails.none', 'No emails sent for this case yet.')} />
      ) : (
        <Table
          size="small"
          rowKey="id"
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: true }}
        />
      )}
    </div>
  );
}

function StaffLinksTab({
  claim, staffLinks, activeStaffLinks, onInvite, onResend, resendingLinkId, onRevoke, form, submitting
}) {
  const { t } = useTranslation(['admin']);
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          {t('admin:warranty.detail.activeStaff', 'Active staff links')}
        </h3>
        {activeStaffLinks.length === 0 ? (
          <Empty description={t('admin:warranty.detail.noStaffLinks', 'No active staff links yet.')} />
        ) : (
          <List
            bordered
            dataSource={activeStaffLinks}
            renderItem={(link) => (
              <List.Item
                actions={[
                  <Button
                    key="copy"
                    type="link"
                    onClick={() => {
                      const url = staffTrackingUrl(link.staff_token);
                      navigator.clipboard?.writeText(url);
                      message.success(t('admin:warranty.actions.copied', 'Link copied.'));
                    }}
                  >
                    {t('admin:warranty.actions.copyLink', 'Copy link')}
                  </Button>,
                  <Button
                    key="resend"
                    type="link"
                    icon={<MailOutlined />}
                    loading={resendingLinkId === link.id}
                    onClick={() => onResend(link.id)}
                  >
                    {t('admin:warranty.actions.resendStaffEmail', 'Resend email')}
                  </Button>,
                  <Popconfirm
                    key="revoke"
                    title={t('admin:warranty.actions.revokeConfirm', 'Revoke this staff link?')}
                    okText={t('admin:warranty.actions.revoke', 'Revoke')}
                    cancelText={t('admin:warranty.actions.cancel', 'Cancel')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => onRevoke(link.id)}
                  >
                    <Button type="link" danger>
                      {t('admin:warranty.actions.revoke', 'Revoke')}
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={<span><Tag color="purple">{link.staff_name}</Tag> {link.staff_email}</span>}
                  description={
                    <span>
                      <code className="font-mono text-xs">{link.staff_token}</code>
                      {' · '}
                      <span>{t('admin:warranty.detail.sentAt', 'Sent {{when}}', {
                        when: dayjs(link.created_at).format('YYYY-MM-DD HH:mm')
                      })}</span>
                      {link.claim_number_external && (
                        <> · <span>RMA #{link.claim_number_external}</span></>
                      )}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </section>

      {staffLinks.length > activeStaffLinks.length && (
        <Alert
          type="info"
          showIcon
          message={t('admin:warranty.detail.revokedHidden',
            'Revoked links are kept in the timeline for the audit trail.')}
        />
      )}

      <Divider />

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          <UserAddOutlined className="mr-1" />
          {t('admin:warranty.detail.inviteStaff', 'Invite a warranty team member')}
        </h3>
        <Form form={form} layout="vertical" onFinish={onInvite}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Form.Item label={t('admin:warranty.detail.staffName', 'Name')}
              name="staff_name" rules={[{ required: true, max: 120 }]}>
              <Input placeholder="Ali Yıldız" />
            </Form.Item>
            <Form.Item label={t('admin:warranty.detail.staffEmail', 'Email')}
              name="staff_email" rules={[{ required: true, type: 'email', max: 200 }]}>
              <Input placeholder="ali@duotone.com" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting} icon={<MailOutlined />}>
            {t('admin:warranty.detail.sendStaffInvite', 'Send invite')}
          </Button>
        </Form>
      </section>
    </div>
  );
}

function DangerZone({ claim, onCloseClaim, onDeleteClaim, closing, deleting }) {
  const { t } = useTranslation(['admin']);
  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Alert
        type="warning"
        showIcon
        message={t('admin:warranty.danger.headsUp', 'These actions are permanent.')}
        description={t('admin:warranty.danger.description',
          'Closing a claim notifies the customer and deletes uploaded photos and videos from disk after we finish the case. Deleting a claim hides it from the dashboard and purges the media now. The audit trail is preserved.')}
      />
      <div className="flex flex-wrap gap-2">
        <Popconfirm
          title={t('admin:warranty.danger.closeConfirm', 'Close this claim and email the customer?')}
          okText={t('admin:warranty.danger.close', 'Close claim')}
          cancelText={t('admin:warranty.actions.cancel', 'Cancel')}
          okButtonProps={{ danger: false, type: 'primary' }}
          onConfirm={onCloseClaim}
          disabled={claim.status === 'closed'}
        >
          <Button icon={<CloseCircleOutlined />} loading={closing} disabled={claim.status === 'closed'}>
            {t('admin:warranty.danger.close', 'Close claim')}
          </Button>
        </Popconfirm>
        <Popconfirm
          title={t('admin:warranty.danger.deleteConfirm',
            'Permanently delete this claim and remove all uploaded media?')}
          okText={t('admin:warranty.danger.delete', 'Delete claim')}
          cancelText={t('admin:warranty.actions.cancel', 'Cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={onDeleteClaim}
        >
          <Button icon={<DeleteOutlined />} danger loading={deleting}>
            {t('admin:warranty.danger.delete', 'Delete claim')}
          </Button>
        </Popconfirm>
        <Button
          icon={<ApiOutlined />}
          onClick={() => {
            navigator.clipboard?.writeText(customerTrackingUrl(claim.customer_token));
            message.success(t('admin:warranty.actions.copied', 'Link copied.'));
          }}
        >
          {t('admin:warranty.danger.copyCustomer', 'Copy customer link')}
        </Button>
      </div>
    </Space>
  );
}
