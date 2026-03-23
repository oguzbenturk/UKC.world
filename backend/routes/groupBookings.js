/**
 * Group Bookings API Routes
 * Handles all endpoints for group lesson bookings
 */

import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  createGroupBooking,
  inviteParticipants,
  addParticipantsByUserIds,
  acceptGroupBookingInvitation,
  declineGroupBookingInvitation,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
  processParticipantPayment,
  processOrganizerPayment,
  getGroupBookingDetails,
  getUserGroupBookings,
  cancelGroupBooking,
  generateGenericInviteLink
} from '../services/groupBookingService.js';
import { pool } from '../db.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import { insertNotification } from '../services/notificationWriter.js';
import { checkAndUpgradeAfterBooking } from '../services/roleUpgradeService.js';

const router = express.Router();

/**
 * Create a new group booking
 * POST /api/group-bookings
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager', 'student', 'outsider']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      serviceId,
      instructorId,
      title,
      description,
      maxParticipants,
      minParticipants,
      pricePerPerson,
      currency,
      scheduledDate,
      startTime,
      endTime,
      durationHours,
      registrationDeadline,
      paymentDeadline,
      notes,
      paymentModel, // 'individual' or 'organizer_pays'
      invitees, // Legacy: array of { email, fullName, phone }
      participantIds, // New: array of user IDs (registered users)
      packageId // Optional: organizer's package to use
    } = req.body;

    // Log incoming request for debugging
    logger.info('Group booking create request', { 
      userId: req.user?.id,
      serviceId, 
      pricePerPerson, 
      scheduledDate, 
      startTime,
      paymentModel,
      participantIdsCount: participantIds?.length
    });

    // When generating a shareable link, schedule/price can be set later
    const wantsGenericLink = req.body.generateLink === true;

    // Validate required fields (relaxed for link generation)
    const missing = [];
    if (!serviceId) missing.push('serviceId');
    if (!wantsGenericLink) {
      if (pricePerPerson === undefined || pricePerPerson === null) missing.push('pricePerPerson');
      if (!scheduledDate) missing.push('scheduledDate');
      if (!startTime) missing.push('startTime');
    }
    if (missing.length > 0) {
      logger.warn('Group booking missing required fields', { missing, body: req.body });
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Validate payment model
    const validPaymentModels = ['individual', 'organizer_pays'];
    if (paymentModel && !validPaymentModels.includes(paymentModel)) {
      return res.status(400).json({ error: 'Invalid payment model. Use "individual" or "organizer_pays"' });
    }

    // Students/outsiders must invite at least 1 other person — unless generating a shareable link
    const isStudentOrOutsider = ['student', 'outsider'].includes(req.user.role);
    const hasInvitees = (Array.isArray(invitees) && invitees.length > 0) ||
                        (Array.isArray(participantIds) && participantIds.length > 0);
    if (isStudentOrOutsider && !hasInvitees && !wantsGenericLink) {
      return res.status(400).json({
        error: 'Group lessons require at least 2 people. Please invite at least one friend, or submit a group lesson request so we can match you with another student.'
      });
    }

    // Create the group booking
    const groupBooking = await createGroupBooking({
      organizerId: userId,
      serviceId,
      instructorId,
      title: title || 'Group Lesson',
      description,
      maxParticipants: Math.max(maxParticipants || 6, (participantIds?.length || 0) + 1),
      minParticipants: minParticipants || 2,
      pricePerPerson: pricePerPerson ?? 0,
      currency: currency || 'EUR',
      scheduledDate: scheduledDate || null,
      startTime: startTime || null,
      endTime: endTime || null,
      durationHours: durationHours || null,
      registrationDeadline,
      paymentDeadline,
      notes,
      paymentModel: paymentModel || 'individual',
      createdBy: userId,
      packageId: req.body.packageId || null
    });

    // Add participants by user IDs (new flow - registered users)
    let participants = [];
    let generatedLink = null;
    if (Array.isArray(participantIds) && participantIds.length > 0) {
      participants = await addParticipantsByUserIds(groupBooking.id, userId, participantIds);
    }
    // Legacy: If invitees provided (email-based), send invitations
    else if (Array.isArray(invitees) && invitees.length > 0) {
      participants = await inviteParticipants(groupBooking.id, userId, invitees);
    }
    // Generate a shareable invite link (no email required)
    if (wantsGenericLink) {
      generatedLink = await generateGenericInviteLink(groupBooking.id, userId);
    }

    res.status(201).json({
      success: true,
      groupBooking: {
        id: groupBooking.id,
        title: groupBooking.title,
        status: groupBooking.status,
        scheduledDate: groupBooking.scheduled_date,
        startTime: groupBooking.start_time,
        pricePerPerson: parseFloat(groupBooking.price_per_person),
        maxParticipants: groupBooking.max_participants,
        paymentModel: groupBooking.payment_model
      },
      participants,
      invitations: participants, // Legacy alias
      ...(generatedLink ? { inviteLink: generatedLink } : {})
    });

    // Notify admins/managers about new group booking (fire-and-forget)
    try {
      const staffQuery = await pool.query(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name IN ('admin', 'manager', 'owner')
           AND u.deleted_at IS NULL
           AND u.id != $1`,
        [userId]
      );
      if (staffQuery.rows.length > 0) {
        const creatorResult = await pool.query(
          `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name FROM users WHERE id = $1`,
          [userId]
        );
        const creatorName = creatorResult.rows[0]?.full_name || 'A student';
        const svcResult = await pool.query('SELECT name FROM services WHERE id = $1', [serviceId]);
        const serviceName = svcResult.rows[0]?.name || title || 'Group Lesson';

        await Promise.all(
          staffQuery.rows.map(staff =>
            insertNotification({
              userId: staff.id,
              title: 'New group booking request',
              message: `${creatorName} created a group booking for ${serviceName}${scheduledDate ? ` on ${new Date(scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`,
              type: 'new_booking_alert',
              data: {
                groupBookingId: groupBooking.id,
                type: 'group_booking_created',
                serviceName,
                studentNames: creatorName,
                cta: { label: 'View group requests', href: `/calendars/lessons?tab=group-requests&groupBookingId=${groupBooking.id}` }
              },
              idempotencyKey: `group-created:${groupBooking.id}:staff:${staff.id}`
            })
          )
        );
        // Emit socket notification
        if (req.socketService) {
          for (const staff of staffQuery.rows) {
            req.socketService.emitToChannel(`user:${staff.id}`, 'notification:new', {});
          }
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to send admin notification for group booking', { error: notifErr.message });
    }
  } catch (error) {
    logger.error('Error creating group booking', { error: error.message });
    next(error);
  }
});

/**
 * Get user's group bookings
 * GET /api/group-bookings
 */
router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const bookings = await getUserGroupBookings(userId);

    res.json({
      success: true,
      groupBookings: bookings.map(b => ({
        id: b.id,
        title: b.title,
        status: b.status,
        scheduledDate: b.scheduled_date,
        startTime: b.start_time,
        endTime: b.end_time,
        serviceName: b.service_name,
        instructorName: b.instructor_name,
        organizerName: b.organizer_name,
        pricePerPerson: parseFloat(b.price_per_person),
        maxParticipants: b.max_participants,
        participantCount: parseInt(b.participant_count, 10),
        paidCount: parseInt(b.paid_count, 10),
        myStatus: b.my_status,
        myPaymentStatus: b.my_payment_status,
        iAmOrganizer: b.i_am_organizer
      }))
    });
  } catch (error) {
    logger.error('Error fetching group bookings', { error: error.message });
    next(error);
  }
});

/**
 * Get group booking details
 * GET /api/group-bookings/:id
 */
router.get('/:id', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const details = await getGroupBookingDetails(id, userId);

    if (!details) {
      return res.status(404).json({ error: 'Group booking not found' });
    }

    // Check if user has access
    if (!details.isOrganizer && !details.isParticipant && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      groupBooking: {
        id: details.id,
        title: details.title,
        description: details.description,
        status: details.status,
        scheduledDate: details.scheduled_date,
        startTime: details.start_time,
        endTime: details.end_time,
        durationHours: parseFloat(details.duration_hours || 0),
        serviceName: details.service_name,
        serviceCategory: details.service_category,
        instructorName: details.instructor_name,
        instructorId: details.instructor_id,
        organizerName: details.organizer_name,
        organizerEmail: details.organizer_email,
        pricePerPerson: parseFloat(details.price_per_person),
        currency: details.currency,
        maxParticipants: details.max_participants,
        minParticipants: details.min_participants,
        participantCount: details.participantCount,
        paidCount: details.paidCount,
        participants: details.participants,
        isOrganizer: details.isOrganizer,
        isParticipant: details.isParticipant,
        paymentModel: details.payment_model || 'individual',
        organizerPaid: details.organizer_paid || false,
        registrationDeadline: details.registration_deadline,
        paymentDeadline: details.payment_deadline,
        notes: details.notes,
        bookingId: details.booking_id,
        serviceId: details.service_id,
        createdAt: details.created_at
      }
    });
  } catch (error) {
    logger.error('Error fetching group booking details', { error: error.message });
    next(error);
  }
});

/**
 * Invite participants to a group booking
 * POST /api/group-bookings/:id/invite
 */
router.post('/:id/invite', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { participants } = req.body;

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'participants array is required' });
    }

    // Verify user is organizer
    const groupResult = await pool.query(
      'SELECT organizer_id FROM group_bookings WHERE id = $1',
      [id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group booking not found' });
    }

    if (groupResult.rows[0].organizer_id !== userId && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the organizer can invite participants' });
    }

    const invitations = await inviteParticipants(id, userId, participants);

    res.json({
      success: true,
      invitations,
      message: `${invitations.length} invitation(s) sent`
    });
  } catch (error) {
    logger.error('Error inviting participants', { error: error.message });
    next(error);
  }
});

/**
 * Generate a shareable invite link for a group booking
 * POST /api/group-bookings/:id/generate-link
 */
router.post('/:id/generate-link', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const groupResult = await pool.query(
      'SELECT organizer_id FROM group_bookings WHERE id = $1',
      [id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group booking not found' });
    }

    if (groupResult.rows[0].organizer_id !== userId && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the organizer can generate invite links' });
    }

    const link = await generateGenericInviteLink(id, userId);

    res.json({
      success: true,
      token: link.token,
      inviteUrl: link.inviteUrl
    });
  } catch (error) {
    logger.error('Error generating invite link', { error: error.message });
    next(error);
  }
});

/**
 * Get invitation details by token (public endpoint)
 * GET /api/group-bookings/invitation/:token
 */
router.get('/invitation/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.expired) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    if (invitation.status !== 'invited') {
      return res.status(400).json({ error: `Invitation already ${invitation.status}` });
    }

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        fullName: invitation.full_name,
        isGenericLink: invitation.is_generic_link || false,
        groupTitle: invitation.title,
        groupDescription: invitation.description,
        scheduledDate: invitation.scheduled_date,
        startTime: invitation.start_time,
        endTime: invitation.end_time,
        durationHours: parseFloat(invitation.duration_hours || 0),
        serviceName: invitation.service_name,
        serviceId: invitation.service_id,
        packageId: invitation.package_id,
        instructorName: invitation.instructor_name,
        organizerName: invitation.organizer_name,
        pricePerPerson: parseFloat(invitation.price_per_person),
        currency: invitation.currency,
        maxParticipants: invitation.max_participants,
        currentParticipants: invitation.currentParticipants,
        spotsRemaining: invitation.max_participants - invitation.currentParticipants,
        requiresRegistration: !invitation.user_id
      }
    });
  } catch (error) {
    logger.error('Error fetching invitation', { error: error.message });
    next(error);
  }
});

/**
 * Accept an invitation
 * POST /api/group-bookings/invitation/:token/accept
 */
router.post('/invitation/:token/accept', authenticateJWT, async (req, res, next) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const result = await acceptInvitation(token, userId);

    // Notify the organizer that someone accepted their invitation
    try {
      const gbResult = await pool.query(
        `SELECT gb.organizer_id, gb.title, u.first_name, u.last_name, u.email
         FROM group_bookings gb
         JOIN users u ON u.id = $2
         WHERE gb.id = $1`,
        [result.groupBookingId, userId]
      );
      const gb = gbResult.rows[0];
      if (gb && gb.organizer_id && gb.organizer_id !== userId) {
        const participantName = [gb.first_name, gb.last_name].filter(Boolean).join(' ') || gb.email;
        const notificationMessage = `${participantName} has accepted your invitation to "${gb.title || 'Group Lesson'}".`;

        await insertNotification({
          userId: gb.organizer_id,
          title: 'Invitation Accepted',
          message: notificationMessage,
          type: 'group_booking_accepted',
          data: {
            groupBookingId: result.groupBookingId,
            participantUserId: userId,
            link: `/student/group-bookings/${result.groupBookingId}`
          },
        });

        if (req.socketService) {
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'group_booking:participant_accepted', {
            groupBookingId: result.groupBookingId,
            participantName,
          });
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'notification:new', {
            notification: {
              user_id: gb.organizer_id,
              title: 'Invitation Accepted',
              message: notificationMessage,
              type: 'group_booking_accepted',
              data: {
                groupBookingId: result.groupBookingId,
                participantUserId: userId,
                link: `/student/group-bookings/${result.groupBookingId}`
              },
              created_at: new Date().toISOString()
            }
          });
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to send acceptance notification to organizer', { error: notifErr.message });
    }

    res.json({
      success: true,
      message: 'Invitation accepted',
      groupBookingId: result.groupBookingId
    });
  } catch (error) {
    logger.error('Error accepting invitation', { error: error.message });
    if (error.message.includes('expired') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Decline an invitation (can be done without auth if using token)
 * POST /api/group-bookings/invitation/:token/decline
 */
router.post('/invitation/:token/decline', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { reason } = req.body;

    await declineInvitation(token, reason);

    res.json({
      success: true,
      message: 'Invitation declined'
    });
  } catch (error) {
    logger.error('Error declining invitation', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Accept a group booking invitation (for registered users - new flow)
 * POST /api/group-bookings/:id/accept
 */
router.post('/:id/accept', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await acceptGroupBookingInvitation(userId, id);

    // Notify the organizer that a participant accepted
    try {
      const gbResult = await pool.query(
        `SELECT gb.organizer_id, gb.title, u.first_name, u.last_name, u.email
         FROM group_bookings gb
         JOIN users u ON u.id = $2
         WHERE gb.id = $1`,
        [id, userId]
      );
      const gb = gbResult.rows[0];
      if (gb && gb.organizer_id && gb.organizer_id !== userId) {
        const participantName = [gb.first_name, gb.last_name].filter(Boolean).join(' ') || gb.email;
        const notificationMessage = `${participantName} has accepted your invitation to "${gb.title || 'Group Lesson'}".`;

        await insertNotification({
          userId: gb.organizer_id,
          title: 'Invitation Accepted',
          message: notificationMessage,
          type: 'group_booking_accepted',
          data: {
            groupBookingId: id,
            participantUserId: userId,
            link: `/student/group-bookings/${id}`
          },
        });

        if (req.socketService) {
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'group_booking:participant_accepted', {
            groupBookingId: id,
            participantName,
          });
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'notification:new', {
            notification: {
              user_id: gb.organizer_id,
              title: 'Invitation Accepted',
              message: notificationMessage,
              type: 'group_booking_accepted',
              data: {
                groupBookingId: id,
                participantUserId: userId,
                link: `/student/group-bookings/${id}`
              },
              created_at: new Date().toISOString()
            }
          });
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to send acceptance notification to organizer', { error: notifErr.message });
    }

    res.json({
      success: true,
      message: result.allAccepted ? 'Invitation accepted - all participants confirmed!' : 'Invitation accepted',
      allAccepted: result.allAccepted
    });
  } catch (error) {
    logger.error('Error accepting group booking invitation', { error: error.message });
    if (error.message.includes('not invited') || error.message.includes('already')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Decline a group booking invitation (for registered users - new flow)
 * POST /api/group-bookings/:id/decline
 */
router.post('/:id/decline', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    await declineGroupBookingInvitation(userId, id, reason);

    res.json({
      success: true,
      message: 'Invitation declined'
    });
  } catch (error) {
    logger.error('Error declining group booking invitation', { error: error.message });
    if (error.message.includes('not invited') || error.message.includes('already')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Pay for group booking participation
 * POST /api/group-bookings/:id/pay
 */
router.post('/:id/pay', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { paymentMethod, externalReference, customerPackageId, packageHoursUsed } = req.body;

    // Get participant record
    const partResult = await pool.query(
      'SELECT id, amount_due, currency FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (partResult.rows.length === 0) {
      return res.status(404).json({ error: 'You are not a participant in this group booking' });
    }

    const participant = partResult.rows[0];

    // Credit card: initiate Iyzico checkout and return payment URL
    if (paymentMethod === 'credit_card') {
      const amount = parseFloat(participant.amount_due);
      const currency = participant.currency || 'EUR';

      const gatewayResult = await initiateDeposit({
        amount,
        currency,
        userId,
        referenceCode: `GBKP-${participant.id}`,
        items: [{ id: String(id), name: `Group Booking #${id}`, price: amount.toFixed(2) }]
      });

      return res.json({
        success: true,
        paymentPageUrl: gatewayResult.paymentPageUrl
      });
    }

    const result = await processParticipantPayment({
      participantId: participant.id,
      userId,
      paymentMethod: paymentMethod || 'wallet',
      externalReference,
      customerPackageId,
      packageHoursUsed
    });

    // Notify organizer via socket + DB notification
    try {
      const gbResult = await pool.query(
        `SELECT gb.organizer_id, gb.title, u.first_name, u.last_name, u.email
         FROM group_bookings gb
         JOIN users u ON u.id = $2
         WHERE gb.id = $1`,
        [id, userId]
      );
      const gb = gbResult.rows[0];
      if (gb && gb.organizer_id && gb.organizer_id !== userId) {
        const participantName = [gb.first_name, gb.last_name].filter(Boolean).join(' ') || gb.email;
        const paidAmount = parseFloat(result.amountPaid) || parseFloat(participant.amount_due) || 0;
        const paidCurrency = participant.currency || 'EUR';
        const currencySymbol = { EUR: '€', USD: '$', TRY: '₺', GBP: '£', CHF: 'CHF' }[paidCurrency] || paidCurrency;
        const notificationMessage = `${participantName} has paid ${currencySymbol}${paidAmount.toFixed(2)} for "${gb.title || 'Group Lesson'}".`;

        // Persistent DB notification
        await insertNotification({
          userId: gb.organizer_id,
          title: 'Participant Payment Received',
          message: notificationMessage,
          type: 'group_booking_payment',
          data: { groupBookingId: id, participantUserId: userId, link: `/student/group-bookings/${id}` },
        });

        // Socket event to refresh organizer's page + notification bell
        if (req.socketService) {
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'group_booking:participant_paid', {
            groupBookingId: id,
            participantName,
            amountPaid: result.amountPaid,
          });
          req.socketService.emitToChannel(`user:${gb.organizer_id}`, 'notification:new', {
            notification: {
              user_id: gb.organizer_id,
              title: 'Participant Payment Received',
              message: notificationMessage,
              type: 'group_booking_payment',
              data: { groupBookingId: id, participantUserId: userId, link: `/student/group-bookings/${id}` },
              created_at: new Date().toISOString()
            }
          });
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to send payment notification to organizer', { error: notifErr.message });
    }

    // Check if user should be upgraded from outsider to student after payment
    let roleUpgradeInfo = null;
    try {
      const upgradeResult = await checkAndUpgradeAfterBooking(userId);
      if (upgradeResult.upgraded) {
        logger.info('User upgraded to student after group booking payment', {
          userId,
          groupBookingId: id,
          newRole: upgradeResult.newRole
        });
        roleUpgradeInfo = {
          upgraded: true,
          newRole: upgradeResult.newRole,
          message: 'Congratulations! You have been upgraded to a student account.'
        };
      }
    } catch (upgradeError) {
      logger.warn('Failed to check/upgrade user role after group payment', {
        userId,
        error: upgradeError?.message
      });
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      amountPaid: result.amountPaid,
      roleUpgrade: roleUpgradeInfo
    });
  } catch (error) {
    logger.error('Error processing payment', { error: error.message });
    if (error.message.includes('Insufficient') || error.message.includes('Already paid')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Organizer pays for all participants (organizer_pays model)
 * POST /api/group-bookings/:id/pay-all
 */
router.post('/:id/pay-all', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { paymentMethod, externalReference } = req.body;

    // Credit card: initiate Iyzico checkout with total amount
    if (paymentMethod === 'credit_card') {
      // Calculate total amount for all unpaid participants
      const unpaidResult = await pool.query(
        `SELECT SUM(amount_due) as total, COUNT(*) as count, MIN(currency) as currency
         FROM group_booking_participants
         WHERE group_booking_id = $1 AND payment_status != 'paid'`,
        [id]
      );
      const total = parseFloat(unpaidResult.rows[0]?.total) || 0;
      const currency = unpaidResult.rows[0]?.currency || 'EUR';

      if (total <= 0) {
        return res.status(400).json({ error: 'All participants are already paid' });
      }

      const gatewayResult = await initiateDeposit({
        amount: total,
        currency,
        userId,
        referenceCode: `GBKO_${id}_${userId}`,
        items: [{ id: String(id), name: `Group Booking #${id} (All Participants)`, price: total.toFixed(2) }]
      });

      return res.json({
        success: true,
        paymentPageUrl: gatewayResult.paymentPageUrl
      });
    }

    const result = await processOrganizerPayment({
      groupBookingId: id,
      organizerId: userId,
      paymentMethod: paymentMethod || 'wallet',
      externalReference
    });

    // Upgrade organizer role if needed
    let roleUpgrade = null;
    try {
      roleUpgrade = await checkAndUpgradeAfterBooking(userId);
    } catch (roleErr) {
      logger.warn('Role upgrade check failed after organizer payment', { userId, error: roleErr.message });
    }

    res.json({
      success: true,
      message: `Payment processed for ${result.participantCount} participants`,
      totalAmount: result.totalAmount,
      participantCount: result.participantCount,
      pricePerPerson: result.pricePerPerson,
      roleUpgrade
    });
  } catch (error) {
    logger.error('Error processing organizer payment', { error: error.message });
    if (error.message.includes('Insufficient') || error.message.includes('Already paid') || error.message.includes('not the organizer') || error.message.includes('individual payment')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Cancel a group booking (organizer only)
 * DELETE /api/group-bookings/:id
 */
router.delete('/:id', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    // Check if admin/manager
    const isAdmin = ['admin', 'manager'].includes(req.user.role);

    // For admins, get the organizer ID
    let organizerId = userId;
    if (isAdmin) {
      const groupResult = await pool.query('SELECT organizer_id FROM group_bookings WHERE id = $1', [id]);
      if (groupResult.rows.length > 0) {
        organizerId = groupResult.rows[0].organizer_id;
      }
    }

    const result = await cancelGroupBooking(id, isAdmin ? organizerId : userId, reason);

    res.json({
      success: true,
      message: 'Group booking cancelled',
      refundedCount: result.refundedCount
    });
  } catch (error) {
    logger.error('Error cancelling group booking', { error: error.message });
    if (error.message.includes('not found') || error.message.includes('Cannot cancel')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Remove a participant (organizer only)
 * DELETE /api/group-bookings/:id/participants/:participantId
 */
router.delete('/:id/participants/:participantId', authenticateJWT, async (req, res, next) => {
  try {
    const { id, participantId } = req.params;
    const userId = req.user.id;

    // Verify organizer
    const groupResult = await pool.query(
      'SELECT organizer_id FROM group_bookings WHERE id = $1',
      [id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group booking not found' });
    }

    if (groupResult.rows[0].organizer_id !== userId && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the organizer can remove participants' });
    }

    // Get participant
    const partResult = await pool.query(
      'SELECT * FROM group_booking_participants WHERE id = $1 AND group_booking_id = $2',
      [participantId, id]
    );

    if (partResult.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const participant = partResult.rows[0];

    if (participant.is_organizer) {
      return res.status(400).json({ error: 'Cannot remove the organizer' });
    }

    // If paid, process refund
    if (participant.payment_status === 'paid' && participant.payment_method === 'wallet' && participant.user_id) {
      await pool.query(`
        UPDATE customer_wallets
        SET available_balance = available_balance + $1, updated_at = NOW()
        WHERE user_id = $2
      `, [participant.amount_paid, participant.user_id]);
    }

    // Remove participant
    await pool.query(
      'UPDATE group_booking_participants SET status = $1, payment_status = CASE WHEN payment_status = $2 THEN $3 ELSE payment_status END, updated_at = NOW() WHERE id = $4',
      ['cancelled', 'paid', 'refunded', participantId]
    );

    res.json({
      success: true,
      message: 'Participant removed'
    });
  } catch (error) {
    logger.error('Error removing participant', { error: error.message });
    next(error);
  }
});

/**
 * Update a group booking (admin/manager only)
 * PATCH /api/group-bookings/:id
 */
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      instructorId,
      scheduledDate,
      startTime,
      endTime,
      durationHours,
      pricePerPerson,
      status,
      notes,
      title
    } = req.body;

    // Check group booking exists
    const existing = await pool.query('SELECT id, status FROM group_bookings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group booking not found' });
    }

    // Build dynamic update
    const setClauses = [];
    const params = [];
    let idx = 1;

    if (instructorId !== undefined) {
      // Validate instructor exists
      if (instructorId) {
        const instrCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [instructorId]);
        if (instrCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Instructor not found' });
        }
      }
      setClauses.push(`instructor_id = $${idx++}`);
      params.push(instructorId || null);
    }
    if (scheduledDate !== undefined) { setClauses.push(`scheduled_date = $${idx++}`); params.push(scheduledDate); }
    if (startTime !== undefined) { setClauses.push(`start_time = $${idx++}`); params.push(startTime); }
    if (endTime !== undefined) { setClauses.push(`end_time = $${idx++}`); params.push(endTime || null); }
    if (durationHours !== undefined) { setClauses.push(`duration_hours = $${idx++}`); params.push(durationHours); }
    if (pricePerPerson !== undefined) { setClauses.push(`price_per_person = $${idx++}`); params.push(pricePerPerson); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); params.push(notes); }
    if (title !== undefined) { setClauses.push(`title = $${idx++}`); params.push(title); }
    if (status !== undefined) {
      const validStatuses = ['pending', 'open', 'full', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
      }
      setClauses.push(`status = $${idx++}`);
      params.push(status);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE group_bookings SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Also update participant amount_due if price changed
    if (pricePerPerson !== undefined) {
      await pool.query(
        `UPDATE group_booking_participants SET amount_due = $1, updated_at = NOW() WHERE group_booking_id = $2 AND payment_status != 'paid'`,
        [pricePerPerson, id]
      );
    }

    res.json({ success: true, groupBooking: result.rows[0] });
  } catch (error) {
    logger.error('Error updating group booking', { error: error.message });
    next(error);
  }
});

/**
 * Confirm a group booking & create calendar event (admin/manager only)
 * POST /api/group-bookings/:id/confirm
 */
router.post('/:id/confirm', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { instructorId } = req.body;

    await client.query('BEGIN');

    // Fetch group booking
    const gbResult = await client.query(`
      SELECT gb.*,
        s.name as service_name, s.category as service_category
      FROM group_bookings gb
      LEFT JOIN services s ON gb.service_id = s.id
      WHERE gb.id = $1
    `, [id]);

    if (gbResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group booking not found' });
    }

    const gb = gbResult.rows[0];

    if (gb.status === 'confirmed' || gb.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Group booking is already ${gb.status}` });
    }

    // Allow setting instructor at confirm time
    const finalInstructorId = instructorId || gb.instructor_id;
    if (!finalInstructorId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'An instructor must be assigned before confirming. Pass instructorId in the request body.' });
    }

    // Update instructor if provided
    if (instructorId && instructorId !== gb.instructor_id) {
      await client.query('UPDATE group_bookings SET instructor_id = $1, updated_at = NOW() WHERE id = $2', [instructorId, id]);
    }

    // Get accepted/paid participants
    const partResult = await client.query(`
      SELECT p.*, u.name as user_name, 
        COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name)) as full_name,
        u.email as user_email
      FROM group_booking_participants p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.group_booking_id = $1 AND p.status IN ('accepted', 'paid')
      ORDER BY p.is_organizer DESC, p.created_at ASC
    `, [id]);

    if (partResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No accepted participants to create a booking for' });
    }

    const participants = partResult.rows;
    const primaryParticipant = participants.find(p => p.is_organizer) || participants[0];

    // Parse start_time to decimal start_hour
    let startHour = 9.0;
    if (gb.start_time) {
      const timeParts = String(gb.start_time).split(':');
      startHour = parseInt(timeParts[0], 10) + (parseInt(timeParts[1] || 0, 10) / 60);
    }

    const duration = parseFloat(gb.duration_hours) || 2;
    const amount = parseFloat(gb.price_per_person) * participants.length;

    // Create main booking record
    const bookingResult = await client.query(`
      INSERT INTO bookings (
        date, start_hour, duration,
        student_user_id, instructor_user_id, customer_user_id,
        status, payment_status, amount, final_amount,
        notes, service_id, group_size, max_participants,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $4, 'confirmed', 'paid', $6, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      gb.scheduled_date,
      startHour,
      duration,
      primaryParticipant.user_id,
      finalInstructorId,
      amount,
      gb.notes || '',
      gb.service_id,
      participants.length,
      gb.max_participants,
      req.user.id
    ]);

    const booking = bookingResult.rows[0];

    // Create booking_participants
    for (const p of participants) {
      await client.query(`
        INSERT INTO booking_participants (
          booking_id, user_id, is_primary, payment_status, payment_amount, notes
        ) VALUES ($1, $2, $3, $4, $5, '')
      `, [
        booking.id,
        p.user_id,
        p.is_organizer || false,
        p.payment_status === 'paid' ? 'paid' : 'unpaid',
        parseFloat(p.amount_paid || 0)
      ]);
    }

    // Update group booking status & link to calendar booking
    await client.query(
      `UPDATE group_bookings SET status = 'confirmed', booking_id = $1, updated_at = NOW() WHERE id = $2`,
      [booking.id, id]
    );

    // Get instructor name for notifications
    const instrResult = await client.query(
      `SELECT COALESCE(name, CONCAT(first_name, ' ', last_name)) as instructor_name FROM users WHERE id = $1`,
      [finalInstructorId]
    );
    const instructorName = instrResult.rows[0]?.instructor_name || 'Instructor';
    const dateLabel = new Date(gb.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeLabel = gb.start_time ? String(gb.start_time).substring(0, 5) : '';
    const isoDate = new Date(gb.scheduled_date).toISOString().split('T')[0];

    // Notify all participants
    for (const p of participants) {
      if (!p.user_id) continue;
      await insertNotification({
        client,
        userId: p.user_id,
        title: `Group lesson confirmed: ${gb.service_name || gb.title}`,
        message: `Your group lesson on ${dateLabel} at ${timeLabel} with ${instructorName} has been confirmed!`,
        type: 'booking_confirmed',
        data: {
          bookingId: booking.id,
          groupBookingId: id,
          date: isoDate,
          startTime: timeLabel,
          serviceName: gb.service_name,
          instructorName,
          cta: { label: 'View lesson', href: `/student/schedule?date=${isoDate}` }
        },
        idempotencyKey: `group-confirmed:${id}:participant:${p.user_id}`
      });
    }

    // Notify instructor
    const studentNames = participants.map(p => p.full_name || p.user_name || 'Student').join(', ');
    await insertNotification({
      client,
      userId: finalInstructorId,
      title: `New group lesson: ${gb.service_name || gb.title}`,
      message: `Group lesson with ${studentNames} on ${dateLabel} at ${timeLabel}`,
      type: 'booking_instructor',
      data: {
        bookingId: booking.id,
        groupBookingId: id,
        date: isoDate,
        startTime: timeLabel,
        serviceName: gb.service_name,
        students: participants.map(p => ({ id: p.user_id, name: p.full_name || p.user_name })),
        cta: { label: 'View in daily program', href: `/bookings/calendar?view=daily&date=${isoDate}&bookingId=${booking.id}` }
      },
      idempotencyKey: `group-confirmed:${id}:instructor:${finalInstructorId}`
    });

    await client.query('COMMIT');

    // Emit socket events for real-time calendar refresh
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', { id: booking.id, date: gb.scheduled_date });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
        // Notify participants
        for (const p of participants) {
          if (p.user_id) {
            req.socketService.emitToChannel(`user:${p.user_id}`, 'notification:new', {});
          }
        }
        req.socketService.emitToChannel(`user:${finalInstructorId}`, 'notification:new', {});
      } catch (socketErr) {
        logger.warn('Failed to emit socket events for group confirm', { error: socketErr.message });
      }
    }

    res.json({
      success: true,
      message: 'Group booking confirmed and calendar event created',
      bookingId: booking.id,
      groupBookingId: id,
      participantCount: participants.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error confirming group booking', { error: error.message });
    next(error);
  } finally {
    client.release();
  }
});

/**
 * Add a participant to a group booking (admin/manager only)
 * POST /api/group-bookings/:id/add-participant
 */
router.post('/:id/add-participant', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }

    // Check group booking exists and get details
    const gbResult = await pool.query(
      'SELECT id, max_participants, price_per_person, currency FROM group_bookings WHERE id = $1',
      [id]
    );
    if (gbResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group booking not found' });
    }
    const gb = gbResult.rows[0];

    // Check max participants
    const countResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM group_booking_participants WHERE group_booking_id = $1 AND status NOT IN ('cancelled', 'declined')`,
      [id]
    );
    if (parseInt(countResult.rows[0].cnt, 10) >= gb.max_participants) {
      return res.status(400).json({ error: 'Maximum participants reached' });
    }

    // Find user  
    let targetUser;
    if (userId) {
      const userResult = await pool.query(
        `SELECT id, email, COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name, phone FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      targetUser = userResult.rows[0];
    } else {
      const userResult = await pool.query(
        `SELECT id, email, COALESCE(name, CONCAT(first_name, ' ', last_name)) as full_name, phone FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email.toLowerCase().trim()]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'No user found with that email' });
      }
      targetUser = userResult.rows[0];
    }

    // Check not already a participant
    const existingPart = await pool.query(
      `SELECT id FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2 AND status NOT IN ('cancelled', 'declined')`,
      [id, targetUser.id]
    );
    if (existingPart.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a participant' });
    }

    // Add participant
    const partResult = await pool.query(`
      INSERT INTO group_booking_participants (
        group_booking_id, user_id, email, full_name, phone,
        status, payment_status, amount_due, currency, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'accepted', 'pending', $6, $7, NOW(), NOW())
      RETURNING *
    `, [id, targetUser.id, targetUser.email, targetUser.full_name, targetUser.phone, gb.price_per_person, gb.currency]);

    res.status(201).json({
      success: true,
      participant: partResult.rows[0]
    });
  } catch (error) {
    logger.error('Error adding participant', { error: error.message });
    next(error);
  }
});

/**
 * Get group partner info for a customer package
 * Used when a student with an active group package books a session —
 * returns their partner's details so they can be pre-selected.
 *
 * GET /api/group-bookings/partner-for-package/:customerPackageId
 */
router.get('/partner-for-package/:customerPackageId', authenticateJWT, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { customerPackageId } = req.params;

    // 1. Validate the caller owns this package and get the service_package_id
    const cpResult = await pool.query(
      `SELECT id, customer_id, service_package_id FROM customer_packages
       WHERE id = $1 AND customer_id = $2 AND status = 'active'`,
      [customerPackageId, userId]
    );
    if (cpResult.rows.length === 0) {
      return res.status(404).json({ error: 'Package not found or not owned by you' });
    }
    const { service_package_id } = cpResult.rows[0];

    // 2. Find group_bookings that use this service_package and where the caller is a participant
    const partnerResult = await pool.query(`
      SELECT
        p.user_id       AS partner_id,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS partner_name,
        u.email          AS partner_email,
        cp.id            AS partner_customer_package_id,
        COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) AS partner_remaining_hours
      FROM group_booking_participants p
      JOIN group_bookings gb ON gb.id = p.group_booking_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN customer_packages cp
        ON cp.customer_id = p.user_id
        AND cp.service_package_id = $1
        AND cp.status = 'active'
      WHERE gb.package_id = $1
        AND p.user_id != $2
        AND p.status IN ('accepted', 'paid')
        AND EXISTS (
          SELECT 1 FROM group_booking_participants me
          WHERE me.group_booking_id = gb.id AND me.user_id = $2
        )
      ORDER BY cp.remaining_hours DESC NULLS LAST
      LIMIT 1
    `, [service_package_id, userId]);

    if (partnerResult.rows.length === 0) {
      return res.json({ partner: null });
    }

    const row = partnerResult.rows[0];
    return res.json({
      partner: {
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        partnerEmail: row.partner_email,
        partnerCustomerPackageId: row.partner_customer_package_id,
        partnerRemainingHours: parseFloat(row.partner_remaining_hours) || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching partner for package', { error: error.message, customerPackageId: req.params.customerPackageId });
    next(error);
  }
});

export default router;
