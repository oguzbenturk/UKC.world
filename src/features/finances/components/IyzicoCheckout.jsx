/**
 * IyzicoCheckout Component
 * Opens Iyzico's hosted payment page in a new window for professional UX
 */

import { useState, useCallback } from 'react';
import { Modal, Button, Alert } from 'antd';
import { CreditCardOutlined, SafetyOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';

export function IyzicoCheckout({ 
  visible, 
  checkoutFormContent: _checkoutFormContent, // Not used - we use hosted page
  paymentPageUrl, 
  onClose,
  onSuccess,
  onError 
}) {
  const [windowOpened, setWindowOpened] = useState(false);

  // Open payment in new tab
  const handleOpenPayment = useCallback(() => {
    if (paymentPageUrl) {
      window.open(paymentPageUrl, '_blank');
      setWindowOpened(true);
    } else {
      onError?.('Payment URL not available');
    }
  }, [paymentPageUrl, onError]);

  // Handle close
  const handleClose = useCallback(() => {
    setWindowOpened(false);
    onClose?.();
  }, [onClose]);

  // Handle payment completed (user says they finished)
  const handlePaymentCompleted = useCallback(() => {
    setWindowOpened(false);
    onSuccess?.();
  }, [onSuccess]);

  if (!visible) return null;

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      title={
        <span className="flex items-center">
          <CreditCardOutlined className="mr-2" />
          Secure Payment
        </span>
      }
      width={480}
      centered
      maskClosable={false}
    >
      <div className="py-6 text-center">
        {!windowOpened ? (
          <>
            {/* Security Icon */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100">
                <SafetyOutlined className="text-4xl text-blue-600" />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Complete Your Payment
            </h3>
            
            {/* Description */}
            <p className="text-gray-600 mb-6 px-4">
              A secure payment window will open. Complete your payment there and return here when finished.
            </p>

            {/* Open Payment Button */}
            <Button
              type="primary"
              size="large"
              onClick={handleOpenPayment}
              className="bg-blue-600 hover:bg-blue-700 h-12 px-8 text-base"
              icon={<ExportOutlined />}
            >
              Open Payment Window
            </Button>
          </>
        ) : (
          <>
            {/* Payment in progress */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
                <SafetyOutlined className="text-4xl text-green-600" />
              </div>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Payment Window Open
            </h3>

            <Alert
              message="Complete your payment in the new window"
              description="After completing the payment, click the button below to continue."
              type="info"
              showIcon
              className="mb-6 text-left"
            />

            <div className="space-y-3">
              <Button
                type="primary"
                size="large"
                onClick={handlePaymentCompleted}
                className="bg-green-600 hover:bg-green-700 h-12 px-8 text-base"
              >
                I've Completed Payment
              </Button>
              
              <div>
                <Button 
                  type="link" 
                  icon={<ReloadOutlined />}
                  onClick={handleOpenPayment}
                >
                  Reopen Payment Window
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Security badges */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span>🔒 256-bit SSL</span>
            <span>•</span>
            <span>Powered by iyzico</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default IyzicoCheckout;
