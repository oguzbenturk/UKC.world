/**
 * Family Management Component
 * 
 * Main component for managing family members
 * Displays list of family members with add/edit/delete functionality
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Tag,
  Typography,
  App,
  Tooltip,
} from 'antd';
import {
  CloudDownloadOutlined,
  PlusOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import familyApi from '../services/familyApi';
import FamilyMemberCard from './FamilyMemberCard';
import FamilyMemberModal from './FamilyMemberModal';
import useNetworkStatus from '@/shared/hooks/useNetworkStatus';

// Lazy load heavy components for better initial load performance
const WaiverModal = lazy(() => import('../../compliance/components/WaiverModal'));
const FamilyMemberActivity = lazy(() => import('./FamilyMemberActivity'));

const buildRelationshipOptions = (members, t) => {
  const unique = new Set(
    members
      .map((member) => member.relationship)
      .filter(Boolean)
  );

  return [
    { value: 'all', label: t('student:family.filters.allRelationships') },
    ...Array.from(unique)
      .sort()
      .map((value) => ({
        value,
        label: t(`student:family.relationships.${value}`, { defaultValue: value }),
      })),
  ];
};

const buildWaiverOptions = (members, t) => {
  const unique = new Set(
    members
      .map((member) => member.waiver_status || 'unknown')
      .filter(Boolean)
  );

  return [
    { value: 'all', label: t('student:family.filters.allWaiverStatuses') },
    ...Array.from(unique)
      .sort()
      .map((value) => ({
        value,
        label: t(`student:family.waiverStatuses.${value}`, { defaultValue: value }),
      })),
  ];
};

const { Title, Text, Paragraph } = Typography;

const FamilyManagement = ({ userId }) => {
  const { t } = useTranslation(['student']);
  const { message, modal } = App.useApp();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [waiverModalOpen, setWaiverModalOpen] = useState(false);
  const [selectedMemberForWaiver, setSelectedMemberForWaiver] = useState(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [activityMember, setActivityMember] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState('all');
  const [waiverFilter, setWaiverFilter] = useState('all');
  const { isOnline } = useNetworkStatus();

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const hasFiltersApplied = normalizedSearch.length > 0 || relationshipFilter !== 'all' || waiverFilter !== 'all';

  const relationshipOptions = useMemo(() => buildRelationshipOptions(members, t), [members, t]);

  const waiverOptions = useMemo(() => buildWaiverOptions(members, t), [members, t]);

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesSearch = normalizedSearch
        ? [
            member.full_name,
            member.relationship,
            member.emergency_contact,
            member.waiver_message,
          ]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedSearch))
        : true;

      const matchesRelationship = relationshipFilter === 'all'
        ? true
        : member.relationship === relationshipFilter;

      const status = member.waiver_status || 'unknown';
      const matchesWaiver = waiverFilter === 'all'
        ? true
        : status === waiverFilter;

      return matchesSearch && matchesRelationship && matchesWaiver;
    });
  }, [members, normalizedSearch, relationshipFilter, waiverFilter]);

  const totalMembers = members.length;
  const visibleMembers = filteredMembers.length;
  const canMutate = isOnline && !loading;

  /**
   * Fetch family members from API
   */
  const fetchMembers = useCallback(async () => {
    if (!userId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await familyApi.getFamilyMembers(userId);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load family members');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  /**
   * Open modal to add new family member
   */
  const handleAddMember = () => {
    setEditingMember(null);
    setModalOpen(true);
  };

  /**
   * Open modal to edit existing family member
   */
  const handleEditMember = (member) => {
    setEditingMember(member);
    setModalOpen(true);
  };

  const handleViewActivity = (member) => {
    setActivityMember(member);
    setActivityDrawerOpen(true);
  };

  /**
   * Handle delete family member with undo capability
   */
  const handleDeleteMember = (member) => {
    modal.confirm({
      title: t('student:family.deleteConfirm.title'),
      content: (
        <div>
          <Paragraph>
            {t('student:family.deleteConfirm.body', { name: member.full_name })}
          </Paragraph>
          <Paragraph type="secondary">
            {t('student:family.deleteConfirm.consequence')}
          </Paragraph>
        </div>
      ),
      okText: t('student:family.deleteConfirm.okText'),
      okType: 'danger',
      cancelText: t('student:family.deleteConfirm.cancelText'),
      onOk: async () => {
        let undoTriggered = false;
        const memberBackup = { ...member };
        
        try {
          // Optimistic UI update - remove from list immediately
          setMembers((prev) => prev.filter((m) => m.id !== member.id));
          
          // Show undo message
          const undoMessage = message.info({
            content: (
              <span>
                {t('student:family.deleteConfirm.undoMessage', { name: member.full_name })}{' '}
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => {
                    undoTriggered = true;
                    undoMessage();
                    setMembers((prev) => [...prev, memberBackup]);
                    message.success(t('student:family.deleteConfirm.restored', { name: member.full_name }));
                  }}
                >
                  {t('student:family.deleteConfirm.undoButton')}
                </Button>
              </span>
            ),
            duration: 5,
            style: {
              marginTop: '20vh',
            },
          });
          
          // Wait for undo window
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // If not undone, commit the delete
          if (!undoTriggered) {
            await familyApi.deleteFamilyMember(userId, member.id);
            // Dispatch event to notify other components (e.g., booking wizard) to refresh
            window.dispatchEvent(new CustomEvent('family:memberDeleted', { detail: { memberId: member.id, userId } }));
          }
          
          // Refresh to ensure consistency
          fetchMembers();
        } catch (err) {
          // Restore member on error
          setMembers((prev) => [...prev, memberBackup]);
          message.error(err.message || t('student:family.deleteConfirm.removeError'));
        }
      },
    });
  };

  const handleSignWaiver = (member) => {
    setSelectedMemberForWaiver(member);
    setWaiverModalOpen(true);
  };

  const handleWaiverSuccess = () => {
    const signedMemberName = selectedMemberForWaiver?.full_name;
    setWaiverModalOpen(false);
    setSelectedMemberForWaiver(null);
    if (signedMemberName) {
      message.success(t('student:family.waiverSigned', { name: signedMemberName }));
    } else {
      message.success(t('student:family.waiverSignedGeneric'));
    }
    fetchMembers();
  };

  const handleWaiverCancel = () => {
    setWaiverModalOpen(false);
    setSelectedMemberForWaiver(null);
  };

  /**
   * Handle form submission (create or update)
   */
  const handleSubmit = async (values) => {
    try {
      setSubmitting(true);

      if (editingMember) {
        // Update existing member
        await familyApi.updateFamilyMember(userId, editingMember.id, values);
        message.success({
          content: (
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              {t('student:family.modal.toasts.updated', { name: values.full_name })}
            </span>
          ),
          duration: 3,
          style: {
            marginTop: '20vh',
          },
        });
      } else {
        // Create new member
        const result = await familyApi.createFamilyMember(userId, values);
        message.success({
          content: (
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              {t('student:family.modal.toasts.added', { name: values.full_name })}
            </span>
          ),
          duration: 3,
          style: {
            marginTop: '20vh',
          },
        });
        if (result && Array.isArray(result.warnings) && result.warnings.length > 0) {
          result.warnings.forEach((w) => message.warning(w));
        }
      }

      setModalOpen(false);
      setEditingMember(null);
      fetchMembers(); // Refresh list
    } catch (err) {
      message.error(err.message || t('student:family.modal.toasts.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handle modal close
   */
  const handleModalClose = () => {
    setModalOpen(false);
    setEditingMember(null);
  };

  const handleActivityClose = () => {
    setActivityDrawerOpen(false);
    setActivityMember(null);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setRelationshipFilter('all');
    setWaiverFilter('all');
  };

  const handleExport = async () => {
    if (!userId) {
      return;
    }

    try {
      setExporting(true);
      const blob = await familyApi.exportFamilyMembers(userId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `family-members-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success(t('student:family.exportSuccess'));
    } catch (err) {
      message.error(err.message || t('student:family.exportError'));
    } finally {
      setExporting(false);
    }
  };

  if (loading && members.length === 0) {
    return (
      <Card>
        <div className="flex justify-center items-center py-12">
          <Spin size="large" tip={t('student:family.loading')} />
        </div>
      </Card>
    );
  }

  return (
    <div className="family-management">
      <FamilyMembersView
        loading={loading}
        error={error}
        isOnline={isOnline}
        totalMembers={totalMembers}
        visibleMembers={visibleMembers}
        hasFiltersApplied={hasFiltersApplied}
        relationshipOptions={relationshipOptions}
        waiverOptions={waiverOptions}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        relationshipFilter={relationshipFilter}
        onRelationshipFilterChange={setRelationshipFilter}
        waiverFilter={waiverFilter}
        onWaiverFilterChange={setWaiverFilter}
        onResetFilters={handleResetFilters}
        canMutate={canMutate}
        onAddMember={handleAddMember}
        onExport={handleExport}
        exporting={exporting}
        members={members}
        filteredMembers={filteredMembers}
        onEditMember={handleEditMember}
        onDeleteMember={handleDeleteMember}
        onSignWaiver={handleSignWaiver}
        onViewActivity={handleViewActivity}
        onClearError={() => setError(null)}
      />
      <FamilyMemberModal
        open={modalOpen}
        member={editingMember}
        onSubmit={handleSubmit}
        onCancel={handleModalClose}
        submitting={submitting}
      />

      {selectedMemberForWaiver && (
        <Suspense fallback={<Spin size="large" tip="Loading waiver..." />}>
          <WaiverModal
            key={selectedMemberForWaiver.id}
            open={waiverModalOpen}
            userId={selectedMemberForWaiver.id}
            userType="family_member"
            onSuccess={handleWaiverSuccess}
            onCancel={handleWaiverCancel}
          />
        </Suspense>
      )}

      <Suspense fallback={<Spin size="small" tip="Loading activity..." />}>
        <FamilyMemberActivity
          open={activityDrawerOpen}
          onClose={handleActivityClose}
          userId={userId}
          member={activityMember}
        />
      </Suspense>
    </div>
  );
};

const FamilyMembersView = (props) => {
  const { t } = useTranslation(['student']);
  const {
    loading,
    error,
    isOnline,
    totalMembers,
    visibleMembers,
    hasFiltersApplied,
    relationshipOptions,
    waiverOptions,
    searchTerm,
    onSearchChange,
    relationshipFilter,
    onRelationshipFilterChange,
    waiverFilter,
    onWaiverFilterChange,
    onResetFilters,
    canMutate,
    onAddMember,
    onExport,
    exporting,
    members,
    filteredMembers,
    onEditMember,
    onDeleteMember,
    onSignWaiver,
    onViewActivity,
    onClearError,
  } = props;

  const showSkeleton = loading && totalMembers > 0;
  const showInitialEmpty = !loading && totalMembers === 0;

  return (
    <Card
      className="dark:bg-slate-800/50 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl overflow-hidden"
      styles={{
        header: {
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'linear-gradient(to right, rgba(14, 165, 233, 0.03), rgba(99, 102, 241, 0.03))',
        },
        body: {
          padding: '24px',
        },
      }}
      title={
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/10 to-indigo-500/10 text-sky-600 dark:text-sky-400">
            <UsergroupAddOutlined className="text-lg" />
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{t('student:family.cardTitle')}</span>
          <Tag 
            color="blue" 
            className="ml-1 rounded-full px-3"
            style={{ fontSize: '12px' }}
          >
            {visibleMembers}
            {totalMembers !== visibleMembers ? ` / ${totalMembers}` : ''}
          </Tag>
        </div>
      }
      extra={
        <Space wrap size="small">
          <Tooltip title={isOnline ? t('student:family.actions.exportTooltipOnline') : t('student:family.actions.exportTooltipOffline')}>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={onExport}
              loading={exporting}
              disabled={!isOnline || totalMembers === 0}
              className="border-slate-200 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500"
            >
              <span className="hidden sm:inline">{t('student:family.actions.export')}</span>
            </Button>
          </Tooltip>
          <Tooltip title={isOnline ? t('student:family.actions.addMemberTooltipOnline') : t('student:family.actions.addMemberTooltipOffline')}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAddMember}
              disabled={!canMutate}
              className="bg-gradient-to-r from-sky-500 to-indigo-600 border-0 hover:from-sky-600 hover:to-indigo-700 shadow-lg shadow-sky-500/25"
            >
              <span className="hidden sm:inline">{t('student:family.actions.addMember')}</span>
            </Button>
          </Tooltip>
        </Space>
      }
    >
      {error && (
        <Alert
          message={t('student:family.loadError')}
          description={error}
          type="error"
          showIcon
          closable
          onClose={onClearError}
          className="mb-4"
        />
      )}

      {!isOnline && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={t('student:family.offline.title')}
          description={t('student:family.offline.description')}
        />
      )}

      {showSkeleton && (
        <FamilyMembersSkeleton members={members} />
      )}

      {showInitialEmpty ? (
        <FamilyMembersEmptyState canMutate={canMutate} onAddMember={onAddMember} />
      ) : (
        <FamilyMembersContent
          totalMembers={totalMembers}
          visibleMembers={visibleMembers}
          hasFiltersApplied={hasFiltersApplied}
          relationshipOptions={relationshipOptions}
          waiverOptions={waiverOptions}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          relationshipFilter={relationshipFilter}
          onRelationshipFilterChange={onRelationshipFilterChange}
          waiverFilter={waiverFilter}
          onWaiverFilterChange={onWaiverFilterChange}
          onResetFilters={onResetFilters}
          filteredMembers={filteredMembers}
          onEditMember={onEditMember}
          onDeleteMember={onDeleteMember}
          onSignWaiver={onSignWaiver}
          onViewActivity={onViewActivity}
        />
      )}
    </Card>
  );
};

const FamilyMembersSkeleton = ({ members }) => (
  <Row gutter={[16, 16]}>
    {Array.from({ length: Math.min(members.length, 6) }).map((_, index) => {
      const member = members[index];
      const key = member?.id ? `skeleton-${member.id}` : `skeleton-${index}`;
      return (
        <Col xs={24} sm={24} md={12} lg={8} xl={6} key={key}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full">
              <div className="flex flex-col items-center">
                <Skeleton.Avatar active size={64} className="mb-3" />
                <Skeleton.Input active size="small" className="mb-2" style={{ width: 120 }} />
                <Skeleton.Button active size="small" className="mb-3" style={{ width: 80 }} />
                <Skeleton.Input active size="small" className="mb-2" style={{ width: 100 }} />
                <Skeleton.Input active size="small" style={{ width: 140 }} />
              </div>
            </Card>
          </motion.div>
        </Col>
      );
    })}
  </Row>
);

FamilyMembersSkeleton.propTypes = {
  members: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
    })
  ).isRequired,
};

const FamilyMembersEmptyState = ({ canMutate, onAddMember }) => {
  const { t } = useTranslation(['student']);
  return (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4 }}
    className="py-12"
  >
    <Empty
      image={
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 dark:from-sky-900/30 dark:to-indigo-900/30 flex items-center justify-center">
              <TeamOutlined className="text-5xl text-sky-500" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <PlusOutlined className="text-white text-sm" />
            </div>
          </div>
        </div>
      }
      imageStyle={{
        height: 'auto',
      }}
      description={
        <div className="text-center mt-6 space-y-3">
          <Title level={4} className="!mb-2 !text-slate-800 dark:!text-white">
            {t('student:family.emptyState.heading')}
          </Title>
          <Text className="text-slate-500 dark:text-slate-400 block max-w-md mx-auto">
            {t('student:family.emptyState.body')}
          </Text>
        </div>
      }
    >
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="mt-6"
      >
        <Button 
          type="primary" 
          size="large"
          icon={<PlusOutlined />} 
          onClick={onAddMember} 
          disabled={!canMutate}
          className="bg-gradient-to-r from-sky-500 to-indigo-600 border-0 hover:from-sky-600 hover:to-indigo-700 shadow-lg shadow-sky-500/25 h-12 px-8 rounded-xl"
        >
          {t('student:family.emptyState.addButton')}
        </Button>
      </motion.div>
    </Empty>
  </motion.div>
  );
};

FamilyMembersEmptyState.propTypes = {
  canMutate: PropTypes.bool.isRequired,
  onAddMember: PropTypes.func.isRequired,
};

const FamilyMembersContent = ({
  totalMembers,
  visibleMembers,
  hasFiltersApplied,
  relationshipOptions,
  waiverOptions,
  searchTerm,
  onSearchChange,
  relationshipFilter,
  onRelationshipFilterChange,
  waiverFilter,
  onWaiverFilterChange,
  onResetFilters,
  filteredMembers,
  onEditMember,
  onDeleteMember,
  onSignWaiver,
  onViewActivity,
}) => {
  const { t } = useTranslation(['student']);
  const showFilteredEmpty = filteredMembers.length === 0;

  return (
    <>
      <Paragraph
        type="secondary"
        className="mb-4 text-slate-600 dark:text-slate-300"
      >
        {t('student:family.management.description')}
      </Paragraph>

      <FamilyMembersFilters
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        relationshipFilter={relationshipFilter}
        onRelationshipFilterChange={onRelationshipFilterChange}
        waiverFilter={waiverFilter}
        onWaiverFilterChange={onWaiverFilterChange}
        relationshipOptions={relationshipOptions}
        waiverOptions={waiverOptions}
        onResetFilters={onResetFilters}
        hasFiltersApplied={hasFiltersApplied}
      />

      <Paragraph className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        {t('student:family.management.showingCount', { count: visibleMembers })}
        {totalMembers !== visibleMembers && t('student:family.management.showingOf', { total: totalMembers })}
        {hasFiltersApplied && visibleMembers === 0 && t('student:family.management.adjustFilters')}
      </Paragraph>

      {showFilteredEmpty ? (
        <FamilyMembersFilteredEmpty onResetFilters={onResetFilters} />
      ) : (
        <FamilyMembersGrid
          members={filteredMembers}
          onEditMember={onEditMember}
          onDeleteMember={onDeleteMember}
          onSignWaiver={onSignWaiver}
          onViewActivity={onViewActivity}
        />
      )}
    </>
  );
};

const FamilyMembersFilters = ({
  searchTerm,
  onSearchChange,
  relationshipFilter,
  onRelationshipFilterChange,
  waiverFilter,
  onWaiverFilterChange,
  relationshipOptions,
  waiverOptions,
  onResetFilters,
  hasFiltersApplied,
}) => {
  const { t } = useTranslation(['student']);
  return (
    <div className="p-4 mb-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-700/50">
      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} md={10} lg={8}>
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            value={searchTerm}
            placeholder={t('student:family.filters.searchPlaceholder')}
            onChange={(event) => onSearchChange(event.target.value)}
            className="rounded-lg"
          />
        </Col>
        <Col xs={12} sm={8} md={5} lg={5}>
          <Select
            className="w-full"
            value={relationshipFilter}
            options={relationshipOptions}
            onChange={onRelationshipFilterChange}
            suffixIcon={<FilterOutlined className="text-slate-400" />}
          />
        </Col>
        <Col xs={12} sm={8} md={5} lg={5}>
          <Select
            className="w-full"
            value={waiverFilter}
            options={waiverOptions}
            onChange={onWaiverFilterChange}
          />
        </Col>
        <Col xs={24} sm={8} md={4} lg={6} className="flex justify-end">
          <Button
            onClick={onResetFilters}
            disabled={!hasFiltersApplied}
            icon={<ClearOutlined />}
            className={hasFiltersApplied ? 'text-sky-600 border-sky-300 hover:border-sky-500' : ''}
          >
            <span className="hidden lg:inline">{t('student:family.filters.clearButton')}</span>
          </Button>
        </Col>
      </Row>
    </div>
  );
};

const FamilyMembersFilteredEmpty = ({ onResetFilters }) => {
  const { t } = useTranslation(['student']);
  return (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
    className="py-8"
  >
    <Empty
      image={
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
            <SearchOutlined className="text-4xl text-amber-500" />
          </div>
        </div>
      }
      imageStyle={{
        height: 'auto',
      }}
      description={
        <div className="text-center mt-4 space-y-2">
          <Title level={5} className="!mb-1 !text-slate-700 dark:!text-slate-200">
            {t('student:family.filteredEmpty.heading')}
          </Title>
          <Text className="text-slate-500 dark:text-slate-400">
            {t('student:family.filteredEmpty.body')}
          </Text>
        </div>
      }
    >
      <Button 
        onClick={onResetFilters} 
        icon={<ClearOutlined />}
        className="mt-4"
      >
        {t('student:family.filteredEmpty.clearButton')}
      </Button>
    </Empty>
  </motion.div>
  );
};

FamilyMembersFilteredEmpty.propTypes = {
  onResetFilters: PropTypes.func.isRequired,
};

const FamilyMembersGrid = ({ members, onEditMember, onDeleteMember, onSignWaiver, onViewActivity }) => (
  <Row gutter={[16, 16]}>
    <AnimatePresence mode="popLayout">
      {members.map((member) => (
        <Col xs={24} sm={24} md={12} lg={8} xl={6} key={member.id}>
          <FamilyMemberCard
            member={member}
            onEdit={onEditMember}
            onDelete={onDeleteMember}
            onSignWaiver={onSignWaiver}
            onViewActivity={onViewActivity}
          />
        </Col>
      ))}
    </AnimatePresence>
  </Row>
);

FamilyMembersGrid.propTypes = {
  members: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
    })
  ).isRequired,
  onEditMember: PropTypes.func.isRequired,
  onDeleteMember: PropTypes.func.isRequired,
  onSignWaiver: PropTypes.func,
  onViewActivity: PropTypes.func,
};

FamilyManagement.propTypes = {
  userId: PropTypes.string.isRequired,
};

export default FamilyManagement;
