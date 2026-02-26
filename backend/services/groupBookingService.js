/**
 * Group Bookings Service
 * Handles all business logic for group lesson bookings
 */

import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logger } from '../middlewares/errorHandler.js';

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
  paymentModel = 'individual' // 'individual' or 'organizer_pays'
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
        notes, status, payment_model, created_at, updated_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20, $21)
      RETURNING *
    `, [
      groupId, organizerId, serviceId, instructorId,
      title, description, maxParticipants, minParticipants,
      pricePerPerson, currency, scheduledDate, startTime, endTime,
      durationHours, registrationDeadline, paymentDeadline,
      notes, 'pending', paymentModel, now, createdBy || organizerId
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
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
      await client.query(`
        INSERT INTO notifications (
          id, user_id, type, title, message, data, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        uuidv4(),
        userId,
        'group_booking_invitation',
        'Group Lesson Invitation',
        `You have been invited to join a group lesson: ${group.title}`,
        JSON.stringify({
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
        }),
        'sent',
        now
      ]);

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
    return { success: true, allAccepted: pendingCount === 0 };
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

      await client.query(`
        INSERT INTO notifications (
          id, user_id, type, title, message, data, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        uuidv4(),
        group.organizer_id,
        'group_booking_declined',
        'Participant Declined',
        `${userName} has declined to join your group lesson: ${group.title}`,
        JSON.stringify({ groupBookingId, declinedUserId: userId, reason }),
        'sent'
      ]);
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
      s.name as service_name,
      COALESCE(i.name, CONCAT(i.first_name, ' ', i.last_name)) as instructor_name,
      COALESCE(org.name, CONCAT(org.first_name, ' ', org.last_name)) as organizer_name,
      org.email as organizer_email
    FROM group_booking_participants p
    JOIN group_bookings gb ON p.group_booking_id = gb.id
    LEFT JOIN services s ON gb.service_id = s.id
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
    if (group.status === 'cancelled') {
      throw new Error('This group booking has been cancelled');
    }
    if (group.status === 'full') {
      throw new Error('This group is already full');
    }

    // Update participant
    await client.query(`
      UPDATE group_booking_participants
      SET user_id = $1, status = 'accepted', accepted_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [userId, invitation.id]);

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
    return { success: true, groupBookingId: invitation.group_booking_id };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error accepting invitation', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
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

    const amountDue = parseFloat(participant.amount_due);

    // Process based on payment method
    if (paymentMethod === 'wallet') {
      // Check wallet balance
      const walletResult = await client.query(
        'SELECT available_balance FROM customer_wallets WHERE user_id = $1',
        [userId]
      );

      if (walletResult.rows.length === 0 || parseFloat(walletResult.rows[0].available_balance) < amountDue) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct from wallet
      await client.query(`
        UPDATE customer_wallets
        SET available_balance = available_balance - $1, updated_at = NOW()
        WHERE user_id = $2
      `, [amountDue, userId]);

      // Create wallet transaction
      await client.query(`
        INSERT INTO wallet_transactions (
          id, wallet_id, type, amount, currency, description,
          reference_type, reference_id, created_at
        )
        SELECT $1, cw.id, 'debit', $2, $3, $4, 'group_booking', $5, NOW()
        FROM customer_wallets cw WHERE cw.user_id = $6
      `, [
        uuidv4(), amountDue, participant.currency,
        `Group lesson payment - ${participant.group_booking_id}`,
        participant.group_booking_id, userId
      ]);
    } else if (paymentMethod === 'package') {
      // Use package hours
      if (!customerPackageId || !packageHoursUsed) {
        throw new Error('Package details required');
      }

      // Check package balance
      const pkgResult = await client.query(
        'SELECT remaining_hours FROM customer_packages WHERE id = $1 AND user_id = $2',
        [customerPackageId, userId]
      );

      if (pkgResult.rows.length === 0 || parseFloat(pkgResult.rows[0].remaining_hours) < packageHoursUsed) {
        throw new Error('Insufficient package hours');
      }

      // Deduct hours
      await client.query(`
        UPDATE customer_packages
        SET remaining_hours = remaining_hours - $1, updated_at = NOW()
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

    // Check if all participants have paid
    const groupResult = await client.query(
      'SELECT group_booking_id FROM group_booking_participants WHERE id = $1',
      [participantId]
    );
    const groupId = groupResult.rows[0].group_booking_id;

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
      // Check wallet balance
      const walletResult = await client.query(
        'SELECT available_balance FROM customer_wallets WHERE user_id = $1',
        [organizerId]
      );

      if (walletResult.rows.length === 0 || parseFloat(walletResult.rows[0].available_balance) < totalAmount) {
        throw new Error(`Insufficient wallet balance. Need €${totalAmount.toFixed(2)} for ${participantCount} participants.`);
      }

      // Deduct from wallet
      await client.query(`
        UPDATE customer_wallets
        SET available_balance = available_balance - $1, updated_at = NOW()
        WHERE user_id = $2
      `, [totalAmount, organizerId]);

      // Create wallet transaction
      await client.query(`
        INSERT INTO wallet_transactions (
          id, wallet_id, type, amount, currency, description,
          reference_type, reference_id, created_at
        )
        SELECT $1, cw.id, 'debit', $2, $3, $4, 'group_booking', $5, NOW()
        FROM customer_wallets cw WHERE cw.user_id = $6
      `, [
        uuidv4(), totalAmount, group.currency,
        `Group lesson payment for ${participantCount} participants`,
        groupBookingId, organizerId
      ]);
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
      COALESCE(i.name, CONCAT(i.first_name, ' ', i.last_name)) as instructor_name,
      COALESCE(org.name, CONCAT(org.first_name, ' ', org.last_name)) as organizer_name,
      org.email as organizer_email
    FROM group_bookings gb
    LEFT JOIN services s ON gb.service_id = s.id
    LEFT JOIN users i ON gb.instructor_id = i.id
    LEFT JOIN users org ON gb.organizer_id = org.id
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
        // Refund to wallet
        await client.query(`
          UPDATE customer_wallets
          SET available_balance = available_balance + $1, updated_at = NOW()
          WHERE user_id = $2
        `, [participant.amount_paid, participant.user_id]);

        // Create refund transaction
        await client.query(`
          INSERT INTO wallet_transactions (
            id, wallet_id, type, amount, currency, description,
            reference_type, reference_id, created_at
          )
          SELECT $1, cw.id, 'credit', $2, $3, $4, 'group_booking_refund', $5, NOW()
          FROM customer_wallets cw WHERE cw.user_id = $6
        `, [
          uuidv4(), participant.amount_paid, participant.currency,
          `Refund - Group lesson cancelled`,
          groupBookingId, participant.user_id
        ]);
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
