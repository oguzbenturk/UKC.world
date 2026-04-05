/**
 * Family Member Card Component
 * 
 * Displays individual family member information
 * with edit and delete actions
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import {
  Avatar,
  Button,
  Card,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FormOutlined,
  HistoryOutlined,
  HeartOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import familyApi from '../services/familyApi';
import LazyImage from '@/shared/components/ui/LazyImage';

const { Text } = Typography;

const relationshipColors = {
  son: 'blue',
  daughter: 'magenta',
  child: 'purple',
  spouse: 'red',
  sibling: 'cyan',
  parent: 'gold',
  other: 'default',
};

const relationshipGradients = {
  son: 'from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30',
  daughter: 'from-pink-100 to-pink-200 dark:from-pink-900/30 dark:to-pink-800/30',
  child: 'from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30',
  spouse: 'from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30',
  sibling: 'from-cyan-100 to-cyan-200 dark:from-cyan-900/30 dark:to-cyan-800/30',
  parent: 'from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30',
  other: 'from-slate-100 to-slate-200 dark:from-slate-800/30 dark:to-slate-700/30',
};

const relationshipIcons = {
  son: '👦',
  daughter: '👧',
  child: '🧒',
  spouse: '💑',
  sibling: '👫',
  parent: '👨‍👩‍👧',
  other: '👤',
};

const familyMemberPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  full_name: PropTypes.string.isRequired,
  date_of_birth: PropTypes.string.isRequired,
  relationship: PropTypes.oneOf(['son', 'daughter', 'child', 'spouse', 'sibling', 'parent', 'other']).isRequired,
  gender: PropTypes.oneOf(['male', 'female', 'other', 'prefer_not_to_say']),
  medical_notes: PropTypes.string,
  emergency_contact: PropTypes.string,
  photo_url: PropTypes.string,
  waiver_status: PropTypes.oneOf(['pending', 'signed', 'unknown']),
  waiver_requires_action: PropTypes.bool,
  waiver_is_expired: PropTypes.bool,
  waiver_needs_new_version: PropTypes.bool,
  waiver_last_signed: PropTypes.string,
  waiver_message: PropTypes.string,
});

const resolveWaiverDisplay = (member) => {
  if (!member) {
    return {
      requiresAction: false,
      statusTag: null,
      showSignButton: false,
    };
  }

  const requiresAction = member.waiver_requires_action ?? member.waiver_status === 'pending';
  const isSignedAndCurrent = member.waiver_status === 'signed' && requiresAction === false;
  const isUnknown = member.waiver_status === 'unknown' && requiresAction === false;

  let statusTag = null;
  if (isSignedAndCurrent) {
    statusTag = (
      <Tag icon={<SafetyCertificateOutlined />} color="success">
        Waiver Up to Date
      </Tag>
    );
  } else if (requiresAction) {
    const message = member.waiver_is_expired
      ? 'Waiver Expired'
      : member.waiver_needs_new_version
        ? 'New Version Required'
        : 'Waiver Pending';

    statusTag = (
      <Tag icon={<WarningOutlined />} color={member.waiver_is_expired ? 'red' : 'warning'}>
        {message}
      </Tag>
    );
  } else if (isUnknown) {
    statusTag = <Tag color="default">Waiver Status Unknown</Tag>;
  }

  return {
    requiresAction,
    statusTag,
    showSignButton: typeof member.waiver_requires_action === 'boolean'
      ? member.waiver_requires_action
      : member.waiver_status !== 'signed',
  };
};

const WaiverSection = ({ member, onSignWaiver }) => {
  const waiverDisplay = resolveWaiverDisplay(member);
  const canSign = typeof onSignWaiver === 'function' && waiverDisplay.showSignButton;

  return (
    <div className="mt-4 pt-3 w-full flex flex-col items-center gap-2 border-t border-slate-100 dark:border-slate-700/50">
      {waiverDisplay.statusTag}

      {canSign && (
        <Button
          type="primary"
          block
          icon={<FormOutlined />}
          onClick={() => onSignWaiver(member)}
          className="mt-1 rounded-lg"
        >
          Sign Waiver
        </Button>
      )}

      {!waiverDisplay.requiresAction && member?.waiver_last_signed && (
        <Text className="text-xs text-slate-400 dark:text-slate-500">
          Last signed on {familyApi.formatDate(member.waiver_last_signed)}
        </Text>
      )}

      {member?.waiver_message && (
        <Text className="text-xs text-center text-slate-400 dark:text-slate-500">
          {member.waiver_message}
        </Text>
      )}
    </div>
  );
};

WaiverSection.propTypes = {
  member: familyMemberPropType,
  onSignWaiver: PropTypes.func,
};

WaiverSection.defaultProps = {
  member: undefined,
  onSignWaiver: undefined,
};

const buildCardActions = (member, onEdit, onDelete, onSignWaiver, onViewActivity) => {
  const waiverDisplay = resolveWaiverDisplay(member);
  const includeSign = typeof onSignWaiver === 'function' && waiverDisplay.showSignButton;

  const actions = [];

  if (typeof onViewActivity === 'function') {
    actions.push(
      <Tooltip title="View activity" key="activity">
        <Button
          type="text"
          icon={<HistoryOutlined />}
          onClick={() => onViewActivity(member)}
          aria-label={`View activity for ${member.full_name}`}
          className="text-slate-600 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400"
        />
      </Tooltip>
    );
  }

  if (includeSign) {
    actions.push(
      <Tooltip title="Sign waiver" key="sign">
        <Button
          type="text"
          icon={<FormOutlined />}
          onClick={() => onSignWaiver(member)}
          aria-label={`Sign waiver for ${member.full_name}`}
          className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        />
      </Tooltip>
    );
  }

  actions.push(
    <Tooltip title="Edit" key="edit">
      <Button
        type="text"
        icon={<EditOutlined />}
        onClick={() => onEdit(member)}
        aria-label={`Edit ${member.full_name}`}
        className="text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
      />
    </Tooltip>
  );

  actions.push(
    <Tooltip title="Remove" key="delete">
      <Button
        type="text"
        danger
        icon={<DeleteOutlined />}
        onClick={() => onDelete(member)}
        aria-label={`Remove ${member.full_name}`}
      />
    </Tooltip>
  );

  return actions;
};

const FamilyMemberCard = memo(({ member, onEdit, onDelete, onSignWaiver, onViewActivity }) => {
  const age = familyApi.calculateAge(member.date_of_birth);
  const formattedBirthday = familyApi.formatDate(member.date_of_birth);

  const relationshipColor = relationshipColors[member.relationship] || 'default';
  const relationshipIcon = relationshipIcons[member.relationship] || '👤';
  const relationshipGradient = relationshipGradients[member.relationship] || relationshipGradients.other;

  const cardActions = buildCardActions(member, onEdit, onDelete, onSignWaiver, onViewActivity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
      className="h-full"
    >
      <Card
        className="family-member-card h-full dark:bg-slate-800/50 dark:border-slate-700/50 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
        hoverable
        role="region"
        aria-label={`Family member ${member.full_name}`}
        actions={cardActions}
      >
        {/* Gradient header strip */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${relationshipGradient}`} />
        
        <div className="flex flex-col items-center text-center pt-2">
          {/* Avatar with Lazy Loading */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className={`p-1 rounded-full bg-gradient-to-br ${relationshipGradient}`}
          >
            {member.photo_url ? (
              <Avatar
                size={72}
                src={
                  <LazyImage
                    src={member.photo_url}
                    alt={`${member.full_name} avatar`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                }
                className="border-2 border-white dark:border-slate-700"
                alt={`${member.full_name} avatar`}
              />
            ) : (
              <Avatar
                size={72}
                icon={<UserOutlined />}
                className="border-2 border-white dark:border-slate-700"
                style={{ backgroundColor: '#0284c7' }}
                alt={`${member.full_name} avatar`}
              >
                {member.full_name?.charAt(0).toUpperCase()}
              </Avatar>
            )}
          </motion.div>

          {/* Name */}
          <Text strong className="text-lg mt-3 mb-1.5 dark:text-slate-100">
            {member.full_name}
          </Text>

          {/* Relationship Badge */}
          <Tag
            color={relationshipColor}
            className="mb-2 px-3 py-0.5 rounded-full font-medium"
          >
            {relationshipIcon} {member.relationship?.charAt(0).toUpperCase() + member.relationship?.slice(1)}
          </Tag>

          {/* Age and Gender */}
          <Space size="small" className="mb-2">
            <Text className="text-slate-500 dark:text-slate-400">
              {age} {age === 1 ? 'year' : 'years'} old
            </Text>
            {member.gender && member.gender !== 'prefer_not_to_say' && (
              <>
                <Text className="text-slate-400">•</Text>
                <Text className="text-slate-500 dark:text-slate-400 capitalize">{member.gender}</Text>
              </>
            )}
          </Space>

          {/* Birthday */}
          <Text className="text-xs text-slate-400 dark:text-slate-500">
            🎂 {formattedBirthday}
          </Text>

          {/* Medical Notes Alert */}
          {member.medical_notes && (
            <Tooltip title={member.medical_notes} placement="top">
              <Tag
                icon={<HeartOutlined />}
                color="red"
                className="mt-3 cursor-help rounded-full"
                style={{ maxWidth: '100%' }}
              >
                <span className="truncate">Has medical notes</span>
              </Tag>
            </Tooltip>
          )}

          {/* Emergency Contact */}
          {member.emergency_contact && (
            <Space size="small" className="mt-2">
              <PhoneOutlined className="text-emerald-500" />
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {member.emergency_contact}
              </Text>
            </Space>
          )}

          {/* Waiver Status */}
          <WaiverSection member={member} onSignWaiver={onSignWaiver} />
        </div>
      </Card>
    </motion.div>
  );
});

FamilyMemberCard.displayName = 'FamilyMemberCard';

FamilyMemberCard.propTypes = {
  member: familyMemberPropType.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onSignWaiver: PropTypes.func,
  onViewActivity: PropTypes.func,
};

FamilyMemberCard.defaultProps = {
  onSignWaiver: undefined,
  onViewActivity: undefined,
};

export default FamilyMemberCard;
