import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { 
  manualReconciliation, 
  getReconciliationStats 
} from '../middlewares/financialReconciliation.js';

const router = express.Router();

/**
 * @route GET /api/admin/financial-reconciliation/stats
 * @desc Get financial reconciliation statistics and status
 * @access Admin only
 */
router.get('/stats', authenticateJWT, authorizeRoles(['admin']), getReconciliationStats);

/**
 * @route POST /api/admin/financial-reconciliation/run
 * @desc Manually trigger financial reconciliation
 * @access Admin only
 */
router.post('/run', authenticateJWT, authorizeRoles(['admin']), manualReconciliation);

/**
 * @route GET /api/admin/financial-reconciliation/test
 * @desc Run comprehensive financial reconciliation test
 * @access Admin only
 */
router.get('/test', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    // Import the test script dynamically
    const { FinancialReconciliationTester } = await import('../scripts/test-financial-reconciliation.js');
    
    const tester = new FinancialReconciliationTester();
    await tester.runComprehensiveTest();
    
    res.json({
      success: true,
      message: 'Financial reconciliation test completed',
      results: tester.results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Financial reconciliation test failed',
      error: error.message
    });
  }
});

export default router;