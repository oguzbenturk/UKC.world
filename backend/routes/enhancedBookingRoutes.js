// Enhanced booking deletion route
// Add this to your backend/routes/bookings.js

const SoftDeleteService = require('../services/softDeleteService');

/**
 * @route DELETE /api/bookings/:id
 * @desc Soft delete a booking with full backup
 * @access Private (Admin/Manager)
 */
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Get from JWT token
    const { reason = 'Admin deletion' } = req.body;
    
    console.log(`🗑️ Soft deleting booking ${id} by user ${userId}`);
    
    // Use the new soft delete service
    const result = await SoftDeleteService.softDeleteBooking(
      id, 
      userId, 
      reason,
      {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString()
      }
    );
    
    // Emit real-time event for booking deletion
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:deleted', { id });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { 
          type: 'booking', 
          action: 'soft_deleted' 
        });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(200).json({
      message: 'Booking soft deleted successfully',
      ...result,
      note: 'Booking is safely backed up and can be restored if needed'
    });
    
  } catch (error) {
    console.error('Error soft deleting booking:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

/**
 * @route POST /api/bookings/:id/restore
 * @desc Restore a soft-deleted booking
 * @access Private (Admin only)
 */
router.post('/:id/restore', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason = 'Admin restoration' } = req.body;
    
    console.log(`🔄 Restoring booking ${id} by user ${userId}`);
    
    const result = await SoftDeleteService.restoreBooking(id, userId, reason);
    
    // Emit real-time event for booking restoration
    if (req.socketService) {
      req.socketService.emitToChannel('general', 'booking:restored', { id });
      req.socketService.emitToChannel('general', 'dashboard:refresh', { 
        type: 'booking', 
        action: 'restored' 
      });
    }
    
    res.status(200).json({
      message: 'Booking restored successfully',
      ...result
    });
    
  } catch (error) {
    console.error('Error restoring booking:', error);
    res.status(500).json({ 
      message: 'Restore failed',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/admin/deleted-bookings
 * @desc Get list of soft-deleted bookings for admin review
 * @access Private (Admin only)
 */
router.get('/admin/deleted-bookings', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const deletedBookings = await SoftDeleteService.getDeletedBookings(
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.status(200).json({
      deletedBookings,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: deletedBookings.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching deleted bookings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch deleted bookings',
      error: error.message 
    });
  }
});
