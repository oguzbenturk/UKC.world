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
  cancelGroupBooking
} from '../services/groupBookingService.js';
import { pool } from '../db.js';

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

    // Validate required fields (pricePerPerson can be 0 for free services)
    if (!serviceId || pricePerPerson === undefined || pricePerPerson === null || !scheduledDate || !startTime) {
      const missing = [];
      if (!serviceId) missing.push('serviceId');
      if (pricePerPerson === undefined || pricePerPerson === null) missing.push('pricePerPerson');
      if (!scheduledDate) missing.push('scheduledDate');
      if (!startTime) missing.push('startTime');
      logger.warn('Group booking missing required fields', { missing, body: req.body });
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Validate payment model
    const validPaymentModels = ['individual', 'organizer_pays'];
    if (paymentModel && !validPaymentModels.includes(paymentModel)) {
      return res.status(400).json({ error: 'Invalid payment model. Use "individual" or "organizer_pays"' });
    }

    // Students/outsiders must invite at least 1 other person — no solo group bookings
    const isStudentOrOutsider = ['student', 'outsider'].includes(req.user.role);
    const hasInvitees = (Array.isArray(invitees) && invitees.length > 0) ||
                        (Array.isArray(participantIds) && participantIds.length > 0);
    if (isStudentOrOutsider && !hasInvitees) {
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
      pricePerPerson,
      currency: currency || 'EUR',
      scheduledDate,
      startTime,
      endTime,
      durationHours,
      registrationDeadline,
      paymentDeadline,
      notes,
      paymentModel: paymentModel || 'individual',
      createdBy: userId
    });

    // Add participants by user IDs (new flow - registered users)
    let participants = [];
    if (Array.isArray(participantIds) && participantIds.length > 0) {
      participants = await addParticipantsByUserIds(groupBooking.id, userId, participantIds);
    }
    // Legacy: If invitees provided (email-based), send invitations
    else if (Array.isArray(invitees) && invitees.length > 0) {
      participants = await inviteParticipants(groupBooking.id, userId, invitees);
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
      invitations: participants // Legacy alias
    });
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
        groupTitle: invitation.title,
        groupDescription: invitation.description,
        scheduledDate: invitation.scheduled_date,
        startTime: invitation.start_time,
        endTime: invitation.end_time,
        durationHours: parseFloat(invitation.duration_hours || 0),
        serviceName: invitation.service_name,
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
      'SELECT id FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (partResult.rows.length === 0) {
      return res.status(404).json({ error: 'You are not a participant in this group booking' });
    }

    const result = await processParticipantPayment({
      participantId: partResult.rows[0].id,
      userId,
      paymentMethod: paymentMethod || 'wallet',
      externalReference,
      customerPackageId,
      packageHoursUsed
    });

    res.json({
      success: true,
      message: 'Payment processed successfully',
      amountPaid: result.amountPaid
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

    const result = await processOrganizerPayment({
      groupBookingId: id,
      organizerId: userId,
      paymentMethod: paymentMethod || 'wallet',
      externalReference
    });

    res.json({
      success: true,
      message: `Payment processed for ${result.participantCount} participants`,
      totalAmount: result.totalAmount,
      participantCount: result.participantCount,
      pricePerPerson: result.pricePerPerson
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

export default router;
