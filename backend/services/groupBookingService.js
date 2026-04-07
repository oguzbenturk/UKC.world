/**
 * Group Bookings Service
 * Handles all business logic for group lesson bookings
 */

import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logger } from '../middlewares/errorHandler.js';
import { recordTransaction } from './walletService.js';
import { dispatchNotification } from './notificationDispatcherUnified.js';
import CurrencyService from './currencyService.js';
import { checkAndUpgradeAfterBooking } from './roleUpgradeService.js';

/**
 * Generate a secure invitation token
 */
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create a new group booking
 */
export const createGroupBooking = async ({
  organizerId,
  serviceId,
  instructorId,
  title,
  description,
  maxParticipants = 6,
  minParticipants = 2,
  pricePerPerson,
  currency = 'EUR',
  scheduledDate,
  startTime,
  endTime,
  durationHours,
  registrationDeadline,
  paymentDeadline,
  notes,
  createdBy,
  paymentModel = 'individual',
  packageId = null
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupId = uuidv4();
    const now = new Date();

    // Create the group booking
    const result = await client.query(`
      INSERT INTO group_bookings (
        id, organizer_id, service_id, instructor_id,
        title, description, max_participants, min_participants,
        price_per_person, currency, scheduled_date, start_time, end_time,
        duration_hours, registration_deadline, payment_deadline,
        notes, status, payment_model, package_id, created_at, updated_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $21, $22)
      RETURNING *
    `, [
      groupId, organizerId, serviceId, instructorId,
      title, description, maxParticipants, minParticipants,
      pricePerPerson, currency, scheduledDate, startTime, endTime,
      durationHours, registrationDeadline, paymentDeadline,
      notes, 'pending', paymentModel, packageId, now, createdBy || organizerId
    ]);

    const groupBooking = result.rows[0];

    // Add organizer as first participant (automatically accepted)
    const organizerUser = await client.query(
      'SELECT email, first_name, last_name, phone FROM users WHERE id = $1',
      [organizerId]
    );

    if (organizerUser.rows.length > 0) {
      const org = organizerUser.rows[0];
      const fullName = [org.first_name, org.last_name].filter(Boolean).join(' ') || null;
      // For organizer_pays model, organizer's individual payment status is N/A (they pay for all)
      const organizerPaymentStatus = paymentModel === 'organizer_pays' ? 'not_applicable' : 'pending';
      const organizerAmountDue = paymentModel === 'organizer_pays' ? 0 : pricePerPerson;
      
      await client.query(`
        INSERT INTO group_booking_participants (
          id, group_booking_id, user_id, email, full_name, phone,
          status, payment_status, is_organizer, amount_due, currency,
          accepted_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      `, [
        uuidv4(), groupId, organizerId, org.email, fullName, org.phone,
        'accepted', organizerPaymentStatus, true, organizerAmountDue, currency,
        now, now
      ]);
    }

    await client.query('COMMIT');

    logger.info('Group booking created', { groupId, organizerId });
    
    // Automatically upgrade to student if the organizer is an outsider
    try {
      await checkAndUpgradeAfterBooking(organizerId); // no client needed if we do it after COMMIT
    } catch (upgradeErr) {
      logger.error('Failed to upgrade organizer role after creating group booking', { error: upgradeErr.message });
    }

    return groupBooking;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating group booking', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Invite participants to a group booking
 */
export const inviteParticipants = async (groupBookingId, invitedBy, participants) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get group booking details
    const groupResult = await client.query(
      'SELECT * FROM group_bookings WHERE id = $1',
      [groupBookingId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group booking not found');
    }

    const group = groupResult.rows[0];

    // Check current participant count
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM group_booking_participants WHERE group_booking_id = $1 AND status NOT IN ($2, $3)',
      [groupBookingId, 'declined', 'cancelled']
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount + participants.length > group.max_participants) {
      throw new Error(`Cannot invite ${participants.length} participants. Only ${group.max_participants - currentCount} spots available.`);
    }

    const invitations = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day

    for (const participant of participants) {
      const { email, fullName, phone } = participant;

      // Check if already invited
      const existingResult = await client.query(
        'SELECT id FROM group_booking_participants WHERE group_booking_id = $1 AND email = $2',
        [groupBookingId, email.toLowerCase()]
      );

      if (existingResult.rows.length > 0) {
        continue; // Skip already invited
      }

      // Check if user exists
      const userResult = await client.query(
        'SELECT id, COALESCE(name, CONCAT(first_name, \' \', last_name)) as full_name, phone FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
      const resolvedName = fullName || (userResult.rows.length > 0 ? userResult.rows[0].full_name : null);
      const resolvedPhone = phone || (userResult.rows.length > 0 ? userResult.rows[0].phone : null);

      const token = generateInvitationToken();
      const participantId = uuidv4();

      await client.query(`
        INSERT INTO group_booking_participants (
          id, group_booking_id, user_id, email, full_name, phone,
          invitation_token, invitation_sent_at, invitation_expires_at, invited_by,
          status, payment_status, amount_due, currency,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
      `, [
        participantId, groupBookingId, userId, email.toLowerCase(), resolvedName, resolvedPhone,
        token, now, expiresAt, invitedBy,
        'invited', 'pending', group.price_per_person, group.currency,
        now
      ]);

      invitations.push({
        id: participantId,
        email: email.toLowerCase(),
        fullName: resolvedName,
        token,
        isRegistered: userId !== null
      });
    }

    // Update group status if needed
    if (currentCount + invitations.length >= group.min_participants) {
      await client.query(
        'UPDATE group_bookings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['open', groupBookingId]
      );
    }

    await client.query('COMMIT');

    logger.info('Participants invited', { groupBookingId, count: invitations.length });
    return invitations;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error inviting participants', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Add registered users as participants (new flow)
 * Creates participants with 'pending_acceptance' status and sends notifications
 */
export const addParticipantsByUserIds = async (groupBookingId, organizerId, participantUserIds) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get group booking details
    const groupResult = await client.query(
      'SELECT * FROM group_bookings WHERE id = $1',
      [groupBookingId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group booking not found');
    }

    const group = groupResult.rows[0];

    // Check current participant count
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM group_booking_participants WHERE group_booking_id = $1 AND status NOT IN ($2, $3)',
      [groupBookingId, 'declined', 'cancelled']
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount + participantUserIds.length > group.max_participants) {
      throw new Error(`Cannot add ${participantUserIds.length} participants. Only ${group.max_participants - currentCount} spots available.`);
    }

    const participants = [];
    const now = new Date();

    for (const userId of participantUserIds) {
      // Skip organizer if they're in the list
      if (userId === organizerId) {
        continue;
      }

      // Check if already added
      const existingResult = await client.query(
        'SELECT id FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2',
        [groupBookingId, userId]
      );

      if (existingResult.rows.length > 0) {
        continue; // Skip already added
      }

      // Get user details
      const userResult = await client.query(
        `SELECT id, email, COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name, phone 
         FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        logger.warn('User not found for group participant', { userId });
        continue;
      }

      const user = userResult.rows[0];
      const participantId = uuidv4();

      await client.query(`
        INSERT INTO group_booking_participants (
          id, group_booking_id, user_id, email, full_name, phone,
          status, payment_status, amount_due, currency, invited_by,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      `, [
        participantId, groupBookingId, userId, user.email, user.full_name, user.phone,
        'pending_acceptance', 'pending', group.price_per_person, group.currency, organizerId,
        now
      ]);

      // Create notification for the participant with action buttons
      await dispatchNotification({
        userId,
        type: 'booking',
        title: 'Group Lesson Invitation',
        message: `You have been invited to join a group lesson: ${group.title}`,
        data: {
          groupBookingId,
          participantId,
          serviceId: group.service_id,
          scheduledDate: group.scheduled_date,
          startTime: group.start_time,
          status: 'pending',
          actions: [
            { key: 'accept', label: 'Accept', type: 'primary' },
            { key: 'decline', label: 'Decline', type: 'danger' }
          ],
          cta: {
            label: 'View Details',
            href: `/student/group-bookings/${groupBookingId}`
          }
        },
        idempotencyKey: `group-invite:${groupBookingId}:participant:${userId}`,
        client
      });

      participants.push({
        id: participantId,
        userId,
        email: user.email,
        fullName: user.full_name,
        status: 'pending_acceptance'
      });
    }

    await client.query('COMMIT');

    logger.info('Participants added by user IDs', { groupBookingId, count: participants.length });
    return participants;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding participants by user IDs', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Accept a group booking invitation (for registered users)
 */
export const acceptGroupBookingInvitation = async (userId, groupBookingId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get participant record
    const participantResult = await client.query(
      'SELECT * FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2',
      [groupBookingId, userId]
    );

    if (participantResult.rows.length === 0) {
      throw new Error('You are not invited to this group booking');
    }

    const participant = participantResult.rows[0];

    if (participant.status === 'accepted') {
      return { success: true, message: 'Already accepted' };
    }

    if (participant.status === 'declined') {
      throw new Error('You have already declined this invitation');
    }

    // Update participant status
    await client.query(`
      UPDATE group_booking_participants
      SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [participant.id]);

    // Update notification status to 'processed' to hide action buttons
    await client.query(`
      UPDATE notifications
      SET data = jsonb_set(
        COALESCE(data, '{}'::jsonb),
        '{status}',
        '"processed"'::jsonb
      ),
      updated_at = NOW()
      WHERE user_id = $1
      AND type = 'group_booking_invitation'
      AND (data->>'groupBookingId')::text = $2::text
    `, [userId, groupBookingId]);

    // Check if all participants have accepted
    const pendingResult = await client.query(
      `SELECT COUNT(*) as count FROM group_booking_participants 
       WHERE group_booking_id = $1 AND status = 'pending_acceptance'`,
      [groupBookingId]
    );
    const pendingCount = parseInt(pendingResult.rows[0].count, 10);

    // If all have accepted, update group status to 'ready_for_approval'
    if (pendingCount === 0) {
      await client.query(
        `UPDATE group_bookings SET status = 'ready_for_approval', updated_at = NOW() WHERE id = $1`,
        [groupBookingId]
      );
      logger.info('All participants accepted - group ready for approval', { groupBookingId });
    }

    await client.query('COMMIT');

    logger.info('Group booking invitation accepted', { userId, groupBookingId });

    // Automatically upgrade to student if the user is an outsider
    let roleUpgrade = null;
    try {
      roleUpgrade = await checkAndUpgradeAfterBooking(userId);
    } catch (upgradeErr) {
      logger.error('Failed to upgrade user role after accepting group booking invitation', { error: upgradeErr.message });
    }

    return { success: true, allAccepted: pendingCount === 0, roleUpgrade };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error accepting group booking invitation', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Decline a group booking invitation (for registered users)
 */
export const declineGroupBookingInvitation = async (userId, groupBookingId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get participant record
    const participantResult = await client.query(
      'SELECT * FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2',
      [groupBookingId, userId]
    );

    if (participantResult.rows.length === 0) {
      throw new Error('You are not invited to this group booking');
    }

    const participant = participantResult.rows[0];

    if (participant.status === 'declined') {
      return { success: true, message: 'Already declined' };
    }

    // Update participant status
    await client.query(`
      UPDATE group_booking_participants
      SET status = 'declined', declined_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [participant.id]);

    // Update notification status to 'processed' to hide action buttons
    await client.query(`
      UPDATE notifications
      SET data = jsonb_set(
        COALESCE(data, '{}'::jsonb),
        '{status}',
        '"processed"'::jsonb
      ),
      updated_at = NOW()
      WHERE user_id = $1
      AND type = 'group_booking_invitation'
      AND (data->>'groupBookingId')::text = $2::text
    `, [userId, groupBookingId]);

    // Notify organizer
    const groupResult = await client.query(
      'SELECT organizer_id, title FROM group_bookings WHERE id = $1',
      [groupBookingId]
    );
    
    if (groupResult.rows.length > 0) {
      const group = groupResult.rows[0];
      const userResult = await client.query(
        `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name FROM users WHERE id = $1`,
        [userId]
      );
      const userName = userResult.rows[0]?.full_name || 'A participant';

      await dispatchNotification({
        userId: group.organizer_id,
        type: 'booking',
        title: 'Participant Declined',
        message: `${userName} has declined to join your group lesson: ${group.title}`,
        data: { groupBookingId, declinedUserId: userId, reason },
        idempotencyKey: `group-declined:${groupBookingId}:user:${userId}`,
        client
      });
    }

    await client.query('COMMIT');

    logger.info('Group booking invitation declined', { userId, groupBookingId });
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error declining group booking invitation', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get invitation details by token
 */
export const getInvitationByToken = async (token) => {
  const result = await pool.query(`
    SELECT 
      p.*,
      gb.id as group_id,
      gb.title,
      gb.description,
      gb.scheduled_date,
      gb.start_time,
      gb.end_time,
      gb.duration_hours,
      gb.price_per_person,
      gb.currency,
      gb.max_participants,
      gb.status as group_status,
      gb.service_id,
      gb.package_id,
      s.name as service_name,
      s.price as service_price,
      sp.name as package_name,
      sp.price as package_price,
      sp.total_hours as package_total_hours,
      COALESCE(i.name, CONCAT(i.first_name, ' ', i.last_name)) as instructor_name,
      COALESCE(org.name, CONCAT(org.first_name, ' ', org.last_name)) as organizer_name,
      org.email as organizer_email,
      org.preferred_currency as organizer_currency
    FROM group_booking_participants p
    JOIN group_bookings gb ON p.group_booking_id = gb.id
    LEFT JOIN services s ON gb.service_id = s.id
    LEFT JOIN service_packages sp ON gb.package_id = sp.id
    LEFT JOIN users i ON gb.instructor_id = i.id
    LEFT JOIN users org ON gb.organizer_id = org.id
    WHERE p.invitation_token = $1
  `, [token]);

  if (result.rows.length === 0) {
    return null;
  }

  const invitation = result.rows[0];

  // Check if expired
  if (invitation.invitation_expires_at && new Date(invitation.invitation_expires_at) < new Date()) {
    return { ...invitation, expired: true };
  }

  // Get current participant count
  const countResult = await pool.query(
    'SELECT COUNT(*) as count FROM group_booking_participants WHERE group_booking_id = $1 AND status IN ($2, $3)',
    [invitation.group_booking_id, 'accepted', 'paid']
  );

  return {
    ...invitation,
    currentParticipants: parseInt(countResult.rows[0].count, 10),
    expired: false
  };
};

/**
 * Accept an invitation
 */
export const acceptInvitation = async (token, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get invitation
    const invResult = await client.query(
      'SELECT * FROM group_booking_participants WHERE invitation_token = $1',
      [token]
    );

    if (invResult.rows.length === 0) {
      throw new Error('Invitation not found');
    }

    const invitation = invResult.rows[0];

    // Check status
    if (invitation.status !== 'invited') {
      throw new Error(`Invitation already ${invitation.status}`);
    }

    // Check expiry
    if (invitation.invitation_expires_at && new Date(invitation.invitation_expires_at) < new Date()) {
      throw new Error('Invitation has expired');
    }

    // Check group status
    const groupResult = await client.query(
      'SELECT * FROM group_bookings WHERE id = $1',
      [invitation.group_booking_id]
    );

    const group = groupResult.rows[0];

    // Prevent organizer from accepting their own invitation
    if (group.organizer_id === userId) {
      throw new Error('You cannot accept your own group invitation');
    }

    if (group.status === 'cancelled') {
      throw new Error('This group booking has been cancelled');
    }
    if (group.status === 'full') {
      throw new Error('This group is already full');
    }

    // For generic invite links, resolve the email and populate amount_due from the group
    const updateFields = invitation.is_generic_link
      ? `SET user_id = $1, status = 'accepted', accepted_at = NOW(), updated_at = NOW(),
             email = (SELECT email FROM users WHERE id = $1),
             full_name = (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = $1),
             is_generic_link = FALSE,
             amount_due = COALESCE(amount_due, $3),
             currency = COALESCE(currency, $4),
             payment_status = COALESCE(payment_status, 'pending')`
      : `SET user_id = $1, status = 'accepted', accepted_at = NOW(), updated_at = NOW()`;

    const updateParams = invitation.is_generic_link
      ? [userId, invitation.id, group.price_per_person, group.currency || 'EUR']
      : [userId, invitation.id];

    await client.query(`
      UPDATE group_booking_participants
      ${updateFields}
      WHERE id = $2
    `, updateParams);

    // Check if group is now full
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM group_booking_participants WHERE group_booking_id = $1 AND status IN ($2, $3)',
      [invitation.group_booking_id, 'accepted', 'paid']
    );
    const acceptedCount = parseInt(countResult.rows[0].count, 10);

    if (acceptedCount >= group.max_participants) {
      await client.query(
        'UPDATE group_bookings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['full', invitation.group_booking_id]
      );
    }

    await client.query('COMMIT');

    logger.info('Invitation accepted', { participantId: invitation.id, userId });

    // Automatically upgrade to student if the user is an outsider
    let roleUpgrade = null;
    try {
      roleUpgrade = await checkAndUpgradeAfterBooking(userId);
    } catch (upgradeErr) {
      logger.error('Failed to upgrade user role after accepting invitation', { error: upgradeErr.message });
    }

    return { success: true, groupBookingId: invitation.group_booking_id, roleUpgrade };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error accepting invitation', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Generate a generic (shareable) invite link for a group booking.
 * Creates a participant placeholder with is_generic_link = true.
 */
export const generateGenericInviteLink = async (groupBookingId, invitedBy) => {
  // Verify group exists and has open spots
  const groupResult = await pool.query(
    'SELECT * FROM group_bookings WHERE id = $1',
    [groupBookingId]
  );

  if (groupResult.rows.length === 0) {
    throw new Error('Group booking not found');
  }

  const group = groupResult.rows[0];
  if (group.status === 'cancelled') {
    throw new Error('This group booking has been cancelled');
  }

  // Check available spots
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM group_booking_participants 
     WHERE group_booking_id = $1 AND status IN ('invited', 'accepted', 'paid')`,
    [groupBookingId]
  );
  const currentCount = parseInt(countResult.rows[0].count, 10);
  if (currentCount >= group.max_participants) {
    throw new Error('No available spots in this group');
  }

  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

  await pool.query(`
    INSERT INTO group_booking_participants (
      id, group_booking_id, email, invitation_token, invitation_expires_at,
      invited_by, status, payment_status, is_generic_link, amount_due, currency, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'invited', 'pending', TRUE, $7, $8, NOW(), NOW())
  `, [
    uuidv4(),
    groupBookingId,
    'pending@invite.link',
    token,
    expiresAt,
    invitedBy,
    group.price_per_person,
    group.currency || 'EUR'
  ]);

  logger.info('Generic invite link generated', { groupBookingId, invitedBy });

  return {
    token,
    inviteUrl: `/group-invitation/${token}`,
    expiresAt
  };
};

/**
 * Decline an invitation
 */
export const declineInvitation = async (token, reason) => {
  const result = await pool.query(`
    UPDATE group_booking_participants
    SET status = 'declined', declined_at = NOW(), updated_at = NOW()
    WHERE invitation_token = $1 AND status = 'invited'
    RETURNING *
  `, [token]);

  if (result.rows.length === 0) {
    throw new Error('Invitation not found or already processed');
  }

  logger.info('Invitation declined', { participantId: result.rows[0].id });
  return result.rows[0];
};

/**
 * Process payment for a group booking participant
 */
export const processParticipantPayment = async ({
  participantId,
  userId,
  paymentMethod, // 'wallet', 'external', 'package'
  externalReference,
  customerPackageId,
  packageHoursUsed
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get participant
    const partResult = await client.query(
      'SELECT * FROM group_booking_participants WHERE id = $1 AND user_id = $2',
      [participantId, userId]
    );

    if (partResult.rows.length === 0) {
      throw new Error('Participant not found');
    }

    const participant = partResult.rows[0];

    if (participant.payment_status === 'paid') {
      throw new Error('Already paid');
    }

    let amountDue = parseFloat(participant.amount_due);

    // If amount_due was not set (legacy generic-link participants), resolve from group
    if (isNaN(amountDue) || amountDue === null) {
      const groupForPrice = await client.query(
        'SELECT price_per_person, currency FROM group_bookings WHERE id = $1',
        [participant.group_booking_id]
      );
      if (groupForPrice.rows.length > 0) {
        amountDue = parseFloat(groupForPrice.rows[0].price_per_person) || 0;
        // Backfill the participant record
        await client.query(
          'UPDATE group_booking_participants SET amount_due = $1, currency = COALESCE(currency, $2) WHERE id = $3',
          [amountDue, groupForPrice.rows[0].currency || 'EUR', participantId]
        );
      } else {
        amountDue = 0;
      }
    }

    // Process based on payment method
    if (paymentMethod === 'wallet') {
      const paymentCurrency = participant.currency || 'EUR';

      // Determine the user's wallet currency
      const userRow = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [userId]
      );
      const userWalletCurrency = userRow.rows[0]?.preferred_currency || 'EUR';

      // Check if user has sufficient balance in the payment currency
      const balanceCheck = await client.query(
        'SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2',
        [userId, paymentCurrency]
      );
      const availableInPaymentCurrency = parseFloat(balanceCheck.rows[0]?.available_amount || 0);

      let debitCurrency = paymentCurrency;
      let debitAmount = amountDue;
      let originalAmount = null;
      let originalCurrency = null;
      let transactionExchangeRate = null;

      if (availableInPaymentCurrency < amountDue && userWalletCurrency !== paymentCurrency) {
        // Insufficient balance in payment currency — convert to user's wallet currency
        const converted = await CurrencyService.convertCurrency(amountDue, paymentCurrency, userWalletCurrency);
        debitAmount = converted;
        debitCurrency = userWalletCurrency;
        originalAmount = amountDue;
        originalCurrency = paymentCurrency;
        transactionExchangeRate = amountDue > 0 ? Math.round((converted / amountDue) * 1e6) / 1e6 : null;
      }

      // Deduct from wallet via walletService (handles balance check, ledger, etc.)
      await recordTransaction({
        userId,
        amount: -debitAmount,
        transactionType: 'payment',
        currency: debitCurrency,
        direction: 'debit',
        availableDelta: -debitAmount,
        description: `Group lesson payment - ${participant.group_booking_id}`,
        relatedEntityType: 'group_booking',
        relatedEntityId: participant.group_booking_id,
        originalAmount,
        originalCurrency,
        transactionExchangeRate,
        client
      });
    } else if (paymentMethod === 'package') {
      // Use package hours
      if (!customerPackageId || !packageHoursUsed) {
        throw new Error('Package details required');
      }

      // Check package balance
      const pkgResult = await client.query(
        'SELECT remaining_hours FROM customer_packages WHERE id = $1 AND customer_id = $2',
        [customerPackageId, userId]
      );

      if (pkgResult.rows.length === 0 || parseFloat(pkgResult.rows[0].remaining_hours) < packageHoursUsed) {
        throw new Error('Insufficient package hours');
      }

      // Deduct hours
      await client.query(`
        UPDATE customer_packages
        SET remaining_hours = remaining_hours - $1,
            used_hours = COALESCE(used_hours, 0) + $1,
            updated_at = NOW()
        WHERE id = $2
      `, [packageHoursUsed, customerPackageId]);
    }

    // Update participant payment status
    await client.query(`
      UPDATE group_booking_participants
      SET payment_status = 'paid', payment_method = $1, amount_paid = $2,
          paid_at = NOW(), payment_reference = $3, customer_package_id = $4,
          package_hours_used = $5, status = 'paid', updated_at = NOW()
      WHERE id = $6
    `, [
      paymentMethod, amountDue, externalReference,
      customerPackageId, packageHoursUsed, participantId
    ]);

    // === ASSIGN PACKAGE TO PARTICIPANT ===
    // When paying with wallet or external, create a customer_packages record
    // (package method means they already have a package and are using its hours)
    // Track the customer_package_id that should be linked to the booking_participant
    let resolvedCustomerPackageId = customerPackageId || null;
    const groupId = participant.group_booking_id;

    if (paymentMethod !== 'package') {
      const gbRow = await client.query(
        'SELECT package_id, service_id, currency, booking_id FROM group_bookings WHERE id = $1',
        [groupId]
      );
      const gb = gbRow.rows[0];

      if (gb && gb.package_id) {
        const spRow = await client.query(
          `SELECT name, lesson_service_name, total_hours, package_type,
                  includes_lessons, includes_rental, includes_accommodation,
                  rental_days, accommodation_nights,
                  rental_service_id, rental_service_name,
                  accommodation_unit_id, accommodation_unit_name
           FROM service_packages WHERE id = $1`,
          [gb.package_id]
        );
        const sp = spRow.rows[0];

        if (sp) {
          const cpId = uuidv4();
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          const totalHours = parseFloat(sp.total_hours) || 0;

          // Get the booking duration so we can deduct the lesson hours immediately
          let bookingDuration = 0;
          if (gb.booking_id) {
            const bkRow = await client.query(
              'SELECT duration FROM bookings WHERE id = $1 AND deleted_at IS NULL',
              [gb.booking_id]
            );
            if (bkRow.rows.length > 0) {
              bookingDuration = parseFloat(bkRow.rows[0].duration) || 0;
            }
          }

          // Create the package with lesson hours already deducted
          const initialRemaining = Math.max(0, totalHours - bookingDuration);
          const initialUsed = Math.min(totalHours, bookingDuration);

          await client.query(`
            INSERT INTO customer_packages (
              id, customer_id, service_package_id, package_name, lesson_service_name,
              total_hours, remaining_hours, used_hours, purchase_price, currency, expiry_date, status,
              purchase_date, notes, last_used_date,
              rental_days_total, rental_days_remaining, rental_days_used,
              accommodation_nights_total, accommodation_nights_remaining, accommodation_nights_used,
              package_type, includes_lessons, includes_rental, includes_accommodation,
              rental_service_id, rental_service_name, accommodation_unit_id, accommodation_unit_name
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10, $11, 'active',
              NOW(), $12, $13,
              $14, $14, 0,
              $15, $15, 0,
              $16, $17, $18, $19,
              $20, $21, $22, $23
            )
          `, [
            cpId, userId, gb.package_id, sp.name, sp.lesson_service_name || sp.name,
            totalHours, initialRemaining, initialUsed,
            amountDue, gb.currency || 'EUR', expiryDate,
            `Group booking payment - ${groupId}`,
            bookingDuration > 0 ? new Date() : null,
            parseInt(sp.rental_days) || 0,
            parseInt(sp.accommodation_nights) || 0,
            sp.package_type || 'lesson',
            sp.includes_lessons !== false,
            sp.includes_rental === true,
            sp.includes_accommodation === true,
            sp.rental_service_id || null, sp.rental_service_name || null,
            sp.accommodation_unit_id || null, sp.accommodation_unit_name || null
          ]);

          resolvedCustomerPackageId = cpId;

          logger.info('Customer package created for group participant (hours pre-deducted)', {
            cpId, userId, packageId: gb.package_id,
            totalHours, bookingDuration, initialRemaining
          });
        }
      }
    }

    // === SYNC BOOKING_PARTICIPANTS ===
    // Link the customer_package to the booking_participants record so that
    // booking deletion can correctly restore hours to the package
    if (resolvedCustomerPackageId) {
      const gbBookingRow = await client.query(
        'SELECT booking_id FROM group_bookings WHERE id = $1',
        [groupId]
      );
      const bookingId = gbBookingRow.rows[0]?.booking_id;

      if (bookingId) {
        // Get the booking duration for the package_hours_used
        const bkDurRow = await client.query(
          'SELECT duration FROM bookings WHERE id = $1 AND deleted_at IS NULL',
          [bookingId]
        );
        const lessonDuration = parseFloat(bkDurRow.rows[0]?.duration) || 0;

        await client.query(`
          UPDATE booking_participants
          SET customer_package_id = $1,
              package_hours_used = $2,
              payment_status = 'package',
              updated_at = NOW()
          WHERE booking_id = $3 AND user_id = $4
        `, [resolvedCustomerPackageId, lessonDuration, bookingId, userId]);

        logger.info('Synced booking_participants with package info', {
          bookingId, userId,
          customerPackageId: resolvedCustomerPackageId,
          packageHoursUsed: lessonDuration
        });
      }
    }

    // Check if all participants have paid
    const groupResult = await client.query(
      'SELECT group_booking_id FROM group_booking_participants WHERE id = $1',
      [participantId]
    );

    const unpaidResult = await client.query(`
      SELECT COUNT(*) as count FROM group_booking_participants
      WHERE group_booking_id = $1 AND status IN ('accepted', 'invited') AND payment_status != 'paid'
    `, [groupId]);

    const unpaidCount = parseInt(unpaidResult.rows[0].count, 10);

    // Get min participants
    const groupDetails = await client.query(
      'SELECT min_participants FROM group_bookings WHERE id = $1',
      [groupId]
    );

    const paidResult = await client.query(
      'SELECT COUNT(*) as count FROM group_booking_participants WHERE group_booking_id = $1 AND payment_status = $2',
      [groupId, 'paid']
    );
    const paidCount = parseInt(paidResult.rows[0].count, 10);

    // Update group status if min participants paid
    if (paidCount >= groupDetails.rows[0].min_participants) {
      await client.query(
        'UPDATE group_bookings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['confirmed', groupId]
      );
    }

    await client.query('COMMIT');

    logger.info('Participant payment processed', { participantId, paymentMethod });
    return { success: true, amountPaid: amountDue };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing payment', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Process organizer payment for all participants (organizer_pays model)
 */
export const processOrganizerPayment = async ({
  groupBookingId,
  organizerId,
  paymentMethod, // 'wallet', 'external'
  externalReference
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get group booking
    const groupResult = await client.query(
      'SELECT * FROM group_bookings WHERE id = $1 AND organizer_id = $2',
      [groupBookingId, organizerId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group booking not found or you are not the organizer');
    }

    const group = groupResult.rows[0];

    if (group.payment_model !== 'organizer_pays') {
      throw new Error('This group uses individual payment model');
    }

    if (group.organizer_paid) {
      throw new Error('Already paid');
    }

    // Count accepted participants (including organizer)
    const participantResult = await client.query(`
      SELECT COUNT(*) as count FROM group_booking_participants
      WHERE group_booking_id = $1 AND status IN ('accepted', 'paid')
    `, [groupBookingId]);
    const participantCount = parseInt(participantResult.rows[0].count, 10);

    const totalAmount = parseFloat(group.price_per_person) * participantCount;

    // Process based on payment method
    if (paymentMethod === 'wallet') {
      // Deduct from wallet via walletService (handles balance check, ledger, etc.)
      await recordTransaction({
        userId: organizerId,
        amount: -totalAmount,
        transactionType: 'payment',
        currency: group.currency || 'EUR',
        direction: 'debit',
        availableDelta: -totalAmount,
        description: `Group lesson payment for ${participantCount} participants`,
        relatedEntityType: 'group_booking',
        relatedEntityId: groupBookingId,
        client
      });
    }

    // Update group booking as paid
    await client.query(`
      UPDATE group_bookings
      SET organizer_paid = TRUE, organizer_paid_at = NOW(),
          total_amount = $1, status = 'confirmed', updated_at = NOW()
      WHERE id = $2
    `, [totalAmount, groupBookingId]);

    // Update all accepted participants as paid
    await client.query(`
      UPDATE group_booking_participants
      SET payment_status = 'covered_by_organizer', status = 'paid',
          amount_paid = amount_due, paid_at = NOW(), updated_at = NOW()
      WHERE group_booking_id = $1 AND status IN ('accepted', 'paid')
    `, [groupBookingId]);

    await client.query('COMMIT');

    logger.info('Organizer payment processed', { groupBookingId, totalAmount, participantCount });
    return { 
      success: true, 
      totalAmount, 
      participantCount,
      pricePerPerson: parseFloat(group.price_per_person)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing organizer payment', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get group booking details with participants
 */
export const getGroupBookingDetails = async (groupBookingId, userId = null) => {
  const groupResult = await pool.query(`
    SELECT 
      gb.*,
      s.name as service_name,
      s.category as service_category,
      s.price as service_price,
      COALESCE(i.name, CONCAT(i.first_name, ' ', i.last_name)) as instructor_name,
      COALESCE(org.name, CONCAT(org.first_name, ' ', org.last_name)) as organizer_name,
      org.email as organizer_email,
      bk.status as booking_status,
      sp.name as package_name,
      sp.price as package_price,
      sp.total_hours as package_total_hours
    FROM group_bookings gb
    LEFT JOIN services s ON gb.service_id = s.id
    LEFT JOIN users i ON gb.instructor_id = i.id
    LEFT JOIN users org ON gb.organizer_id = org.id
    LEFT JOIN bookings bk ON bk.id = gb.booking_id AND bk.deleted_at IS NULL
    LEFT JOIN service_packages sp ON gb.package_id = sp.id
    WHERE gb.id = $1
  `, [groupBookingId]);

  if (groupResult.rows.length === 0) {
    return null;
  }

  const group = groupResult.rows[0];

  // Get participants
  const participantsResult = await pool.query(`
    SELECT 
      p.*,
      COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name)) as user_full_name,
      u.email as user_email,
      u.phone as user_phone
    FROM group_booking_participants p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.group_booking_id = $1
    ORDER BY p.is_organizer DESC, p.created_at ASC
  `, [groupBookingId]);

  // Check if user is organizer or participant
  const isOrganizer = group.organizer_id === userId;
  const isParticipant = participantsResult.rows.some(p => p.user_id === userId);

  return {
    ...group,
    participants: participantsResult.rows.map(p => ({
      id: p.id,
      userId: p.user_id,
      email: p.email,
      fullName: p.full_name || p.user_full_name,
      phone: p.phone || p.user_phone,
      status: p.status,
      paymentStatus: p.payment_status,
      amountDue: parseFloat(p.amount_due || 0),
      amountPaid: parseFloat(p.amount_paid || 0),
      isOrganizer: p.is_organizer,
      acceptedAt: p.accepted_at,
      paidAt: p.paid_at,
      // Only expose invitation token to the organizer for shareable links
      ...(isOrganizer && p.invitation_token ? { invitationToken: p.invitation_token } : {})
    })),
    isOrganizer,
    isParticipant,
    participantCount: participantsResult.rows.filter(p => ['accepted', 'paid'].includes(p.status)).length,
    paidCount: participantsResult.rows.filter(p => p.payment_status === 'paid' || p.payment_status === 'covered_by_organizer').length
  };
};

/**
 * Get user's group bookings (as organizer or participant)
 */
export const getUserGroupBookings = async (userId) => {
  const result = await pool.query(`
    SELECT DISTINCT
      gb.*,
      s.name as service_name,
      COALESCE(i.name, CONCAT(i.first_name, ' ', i.last_name)) as instructor_name,
      COALESCE(org.name, CONCAT(org.first_name, ' ', org.last_name)) as organizer_name,
      p.status as my_status,
      p.payment_status as my_payment_status,
      p.is_organizer as i_am_organizer,
      (SELECT COUNT(*) FROM group_booking_participants WHERE group_booking_id = gb.id AND status IN ('accepted', 'paid')) as participant_count,
      (SELECT COUNT(*) FROM group_booking_participants WHERE group_booking_id = gb.id AND payment_status = 'paid') as paid_count
    FROM group_bookings gb
    JOIN group_booking_participants p ON p.group_booking_id = gb.id
    LEFT JOIN services s ON gb.service_id = s.id
    LEFT JOIN users i ON gb.instructor_id = i.id
    LEFT JOIN users org ON gb.organizer_id = org.id
    WHERE p.user_id = $1 AND gb.status != 'cancelled'
    ORDER BY gb.scheduled_date DESC, gb.start_time DESC
  `, [userId]);

  return result.rows;
};

/**
 * Cancel a group booking (organizer only)
 */
export const cancelGroupBooking = async (groupBookingId, userId, reason) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify organizer
    const groupResult = await client.query(
      'SELECT * FROM group_bookings WHERE id = $1 AND organizer_id = $2',
      [groupBookingId, userId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group booking not found or you are not the organizer');
    }

    const group = groupResult.rows[0];

    if (['cancelled', 'completed'].includes(group.status)) {
      throw new Error(`Cannot cancel a ${group.status} booking`);
    }

    // Process refunds for paid participants
    const paidParticipants = await client.query(`
      SELECT * FROM group_booking_participants
      WHERE group_booking_id = $1 AND payment_status = 'paid'
    `, [groupBookingId]);

    for (const participant of paidParticipants.rows) {
      if (participant.payment_method === 'wallet' && participant.user_id) {
        // Refund to wallet via walletService
        await recordTransaction({
          userId: participant.user_id,
          amount: parseFloat(participant.amount_paid),
          transactionType: 'refund',
          currency: participant.currency || 'EUR',
          direction: 'credit',
          availableDelta: parseFloat(participant.amount_paid),
          description: `Refund - Group lesson cancelled`,
          relatedEntityType: 'group_booking',
          relatedEntityId: groupBookingId,
          client
        });
      }

      // Update participant status
      await client.query(`
        UPDATE group_booking_participants
        SET payment_status = 'refunded', status = 'cancelled', updated_at = NOW()
        WHERE id = $1
      `, [participant.id]);
    }

    // Update non-paid participants
    await client.query(`
      UPDATE group_booking_participants
      SET status = 'cancelled', updated_at = NOW()
      WHERE group_booking_id = $1 AND payment_status != 'paid'
    `, [groupBookingId]);

    // Cancel the group booking
    await client.query(`
      UPDATE group_bookings
      SET status = 'cancelled', notes = COALESCE(notes, '') || $1, updated_at = NOW()
      WHERE id = $2
    `, [`\n[Cancelled: ${reason || 'No reason provided'}]`, groupBookingId]);

    await client.query('COMMIT');

    logger.info('Group booking cancelled', { groupBookingId, userId });
    return { success: true, refundedCount: paidParticipants.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error cancelling group booking', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

export default {
  createGroupBooking,
  inviteParticipants,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
  processParticipantPayment,
  getGroupBookingDetails,
  getUserGroupBookings,
  cancelGroupBooking
};
