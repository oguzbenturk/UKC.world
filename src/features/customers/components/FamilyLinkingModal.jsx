// Manage a customer's family group (peer-linked adult accounts).
// Staff (admin/manager/receptionist) can create a group, add/remove members,
// transfer the Organizer role, or disband the group.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Modal, Input, Tag, Button, Empty, Spin, Avatar, Popconfirm, App
} from 'antd';
import {
  UserOutlined, SearchOutlined, CloseOutlined, TeamOutlined,
  CrownOutlined, DeleteOutlined, PlusOutlined
} from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import apiClient from '@/shared/services/apiClient.js';

const BRAND_TEAL = '#00a8c4';

const fullName = (u) => {
  if (!u) return '';
  const first = u.first_name || u.firstName || '';
  const last = u.last_name || u.lastName || '';
  return [first, last].filter(Boolean).join(' ') || u.name || u.email || (u.id ? u.id.slice(0, 8) : '');
};

const FamilyLinkingModal = ({
  open,
  onCancel,
  primaryCustomer,
  onChanged,
}) => {
  const { message } = App.useApp();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create-mode state (used when no group exists yet)
  const [organizerId, setOrganizerId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const primaryId = primaryCustomer?.id;

  const loadGroup = useCallback(async () => {
    if (!primaryId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/family-groups/by-user/${primaryId}`);
      setGroup(res?.data?.data ?? null);
    } catch (err) {
      console.error('Failed to load family group', err);
      message.error('Could not load family group');
    } finally {
      setLoading(false);
    }
  }, [primaryId, message]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setSelected([]);
    setOrganizerId(primaryId || null);
    loadGroup();
  }, [open, primaryId, loadGroup]);

  // Customer search (used both for create-mode and add-member)
  const fetchResults = useCallback(async (q) => {
    setSearching(true);
    try {
      const res = await DataService.getCustomersList({ q, limit: 25 });
      const items = res?.items || res?.data || [];
      setResults(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Customer search failed', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed.length === 0) fetchResults('');
      else if (trimmed.length >= 2) fetchResults(trimmed);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open, fetchResults]);

  const existingMemberIds = useMemo(
    () => new Set((group?.members || []).map((m) => m.id)),
    [group]
  );

  const visibleResults = useMemo(() => {
    const excludeIds = new Set([
      ...existingMemberIds,
      ...(group ? [] : [primaryId]),
      ...selected.map((s) => s.id),
    ].filter(Boolean));
    return results.filter((r) => !excludeIds.has(r.id));
  }, [results, selected, primaryId, group, existingMemberIds]);

  // Create-mode actions
  const addToSelection = (c) => {
    if (!c?.id) return;
    setSelected((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
  };
  const removeFromSelection = (id) => {
    setSelected((prev) => prev.filter((p) => p.id !== id));
    if (organizerId === id) setOrganizerId(primaryId);
  };

  const handleCreate = async () => {
    if (!primaryId) return;
    if (selected.length === 0) {
      message.info('Add at least one other person to form a family.');
      return;
    }
    const organizer = organizerId || primaryId;
    const memberUserIds = Array.from(
      new Set([primaryId, ...selected.map((s) => s.id)])
    ).filter((id) => id !== organizer);
    setBusy(true);
    try {
      const res = await apiClient.post('/family-groups', {
        organizerUserId: organizer,
        memberUserIds,
      });
      setGroup(res?.data?.data);
      message.success('Family group created');
      onChanged?.();
    } catch (err) {
      console.error('Create family failed', err);
      message.error(err?.response?.data?.error || 'Could not create family group');
    } finally {
      setBusy(false);
    }
  };

  // Existing-group actions
  const handleAddMember = async (userId) => {
    if (!group) return;
    setBusy(true);
    try {
      const res = await apiClient.post(`/family-groups/${group.id}/members`, { userId });
      setGroup(res?.data?.data);
      message.success('Member added');
      onChanged?.();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not add member');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!group) return;
    setBusy(true);
    try {
      const res = await apiClient.delete(`/family-groups/${group.id}/members/${userId}`);
      const payload = res?.data?.data;
      if (payload?.disbanded) {
        setGroup(null);
        message.success('Family group disbanded (no members left)');
      } else {
        setGroup(payload);
        message.success('Member removed');
      }
      onChanged?.();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not remove member');
    } finally {
      setBusy(false);
    }
  };

  const handleMakeOrganizer = async (userId) => {
    if (!group) return;
    setBusy(true);
    try {
      const res = await apiClient.patch(`/family-groups/${group.id}/organizer`, { userId });
      setGroup(res?.data?.data);
      message.success('Organizer updated');
      onChanged?.();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not change organizer');
    } finally {
      setBusy(false);
    }
  };

  const handleDisband = async () => {
    if (!group) return;
    setBusy(true);
    try {
      await apiClient.delete(`/family-groups/${group.id}`);
      setGroup(null);
      message.success('Family group disbanded');
      onChanged?.();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not disband group');
    } finally {
      setBusy(false);
    }
  };

  const renderMemberRow = (m) => {
    const isOrganizer = m.is_organizer;
    return (
      <li
        key={m.id}
        className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0"
      >
        <Avatar size="small" src={m.profile_image_url || undefined} icon={<UserOutlined />} style={{ background: isOrganizer ? BRAND_TEAL : undefined }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-800 truncate">{fullName(m)}</div>
          <div className="text-[11px] text-slate-500 truncate">{m.email || m.phone || ''}</div>
        </div>
        {isOrganizer ? (
          <Tag color="gold" icon={<CrownOutlined />} className="m-0">Organizer</Tag>
        ) : (
          <>
            <Button
              size="small"
              type="link"
              icon={<CrownOutlined />}
              onClick={() => handleMakeOrganizer(m.id)}
              disabled={busy}
            >
              Make organizer
            </Button>
            <Popconfirm
              title="Remove from family?"
              onConfirm={() => handleRemoveMember(m.id)}
              okText="Remove"
              cancelText="Cancel"
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={busy} />
            </Popconfirm>
          </>
        )}
      </li>
    );
  };

  const renderCreateMode = () => (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Family will include</div>
        <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
          <Tag
            color="gold"
            icon={<CrownOutlined />}
            className="!py-1 !px-2 !text-xs"
          >
            {fullName(primaryCustomer)} {organizerId === primaryId ? '(Organizer)' : ''}
          </Tag>
          {selected.map((c) => (
            <Tag
              key={c.id}
              closable
              onClose={() => removeFromSelection(c.id)}
              closeIcon={<CloseOutlined />}
              color={organizerId === c.id ? 'gold' : undefined}
              icon={organizerId === c.id ? <CrownOutlined /> : null}
              className="!py-1 !px-2 !text-xs cursor-pointer"
              onClick={() => setOrganizerId(c.id)}
            >
              {fullName(c)} {organizerId === c.id ? '(Organizer)' : ''}
            </Tag>
          ))}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">Click a tag to make that person the Organizer.</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Add a family member</div>
        <Input
          placeholder="Search by name, email or phone…"
          prefix={<SearchOutlined className="text-slate-400" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <div className="mt-2 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
          {searching ? (
            <div className="py-8 text-center"><Spin /></div>
          ) : visibleResults.length === 0 ? (
            <div className="py-6">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? 'No matches' : 'Type to search'} />
            </div>
          ) : (
            <ul className="m-0 p-0">
              {visibleResults.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-sky-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                  onClick={() => addToSelection(c)}
                >
                  <Avatar size="small" icon={<UserOutlined />} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate">{c.name || fullName(c) || '—'}</div>
                    <div className="text-[11px] text-slate-500 truncate">{c.email || c.phone || c.id.slice(0, 8)}</div>
                  </div>
                  <span className="text-xs font-medium" style={{ color: BRAND_TEAL }}>+ Add</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const renderManageMode = () => (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Family members ({group.members.length})
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <ul className="m-0 p-0">
            {group.members.map(renderMemberRow)}
          </ul>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Add a family member</div>
        <Input
          placeholder="Search by name, email or phone…"
          prefix={<SearchOutlined className="text-slate-400" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <div className="mt-2 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
          {searching ? (
            <div className="py-8 text-center"><Spin /></div>
          ) : visibleResults.length === 0 ? (
            <div className="py-6">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? 'No matches' : 'Type to search'} />
            </div>
          ) : (
            <ul className="m-0 p-0">
              {visibleResults.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-sky-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                  onClick={() => handleAddMember(c.id)}
                >
                  <Avatar size="small" icon={<UserOutlined />} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate">{c.name || fullName(c) || '—'}</div>
                    <div className="text-[11px] text-slate-500 truncate">{c.email || c.phone || c.id.slice(0, 8)}</div>
                  </div>
                  <PlusOutlined style={{ color: BRAND_TEAL }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={
        <div className="flex items-center gap-2">
          <TeamOutlined style={{ color: BRAND_TEAL }} />
          <span>{group ? 'Manage family group' : 'Create family group'}</span>
        </div>
      }
      footer={
        loading
          ? null
          : group
            ? [
                <Popconfirm
                  key="disband"
                  title="Disband this family group?"
                  description="All members will lose their family link. This cannot be undone."
                  onConfirm={handleDisband}
                  okText="Disband"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Button danger disabled={busy}>Disband group</Button>
                </Popconfirm>,
                <Button key="close" type="primary" onClick={onCancel} style={{ background: BRAND_TEAL, borderColor: BRAND_TEAL }}>Done</Button>,
              ]
            : [
                <Button key="cancel" onClick={onCancel}>Cancel</Button>,
                <Button
                  key="create"
                  type="primary"
                  loading={busy}
                  disabled={selected.length === 0}
                  onClick={handleCreate}
                  style={{ background: BRAND_TEAL, borderColor: BRAND_TEAL }}
                >
                  Create family ({selected.length + 1} {selected.length === 0 ? 'person' : 'people'})
                </Button>,
              ]
      }
      width={640}
      destroyOnHidden
    >
      {loading ? (
        <div className="py-12 text-center"><Spin /></div>
      ) : group ? renderManageMode() : renderCreateMode()}
    </Modal>
  );
};

export default FamilyLinkingModal;
