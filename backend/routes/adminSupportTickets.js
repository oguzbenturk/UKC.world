import express from 'express';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import {
  getAllSupportTickets,
  updateSupportTicketStatus,
  addTicketNote,
  getTicketStatistics
} from '../services/supportTicketService.js';

const router = express.Router();

/**
 * @route   GET /api/admin/support-tickets
 * @desc    Get all support tickets with optional filters
 * @access  Admin, Manager
 */
router.get(
  '/',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res, next) => {
    try {
      const { status, priority, studentId } = req.query;
      
      const tickets = await getAllSupportTickets({
        status,
        priority,
        studentId
      });

      res.json({
        success: true,
        data: tickets,
        count: tickets.length
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/admin/support-tickets/statistics
 * @desc    Get ticket statistics
 * @access  Admin, Manager
 */
router.get(
  '/statistics',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res, next) => {
    try {
      const stats = await getTicketStatistics();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PATCH /api/admin/support-tickets/:ticketId/status
 * @desc    Update ticket status
 * @access  Admin, Manager
 */
router.patch(
  '/:ticketId/status',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const updatedTicket = await updateSupportTicketStatus(ticketId, status);

      res.json({
        success: true,
        data: updatedTicket,
        message: `Ticket status updated to ${status}`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/admin/support-tickets/:ticketId/notes
 * @desc    Add internal note to ticket
 * @access  Admin, Manager
 */
router.post(
  '/:ticketId/notes',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const { note } = req.body;

      if (!note) {
        return res.status(400).json({
          success: false,
          message: 'Note is required'
        });
      }

      const updatedTicket = await addTicketNote(ticketId, note, req.user.id);

      res.json({
        success: true,
        data: updatedTicket,
        message: 'Note added successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
