/**
 * PaymentCallback Component
 * Iyzico callback sonrası kullanıcıya gösterilecek sayfa
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Result, Button, Spin, Card, Descriptions, Alert } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  LoadingOutlined,
  WalletOutlined,
  HomeOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

export function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [error, setError] = useState(null);

  // URL parametrelerinden token al
  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  // Ödeme sonucunu kontrol et
  const verifyPayment = useCallback(async () => {
    if (errorParam) {
      setStatus('error');
      setError(errorParam);
      return;
    }

    if (!token) {
      setStatus('error');
      setError('Ödeme token\'ı bulunamadı');
      return;
    }

    try {
      // Backend'e ödeme doğrulama isteği gönder
      const response = await apiClient.get(`/finances/callback/iyzico?token=${token}`);
      
      if (response.data?.success) {
        setStatus('success');
        setPaymentDetails(response.data);
      } else {
        setStatus('error');
        setError(response.data?.error || 'Ödeme doğrulanamadı');
      }
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || err.message || 'Bir hata oluştu');
    }
  }, [token, errorParam]);

  useEffect(() => {
    verifyPayment();
  }, [verifyPayment]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md text-center">
          <Spin 
            indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} 
            tip="Ödeme sonucu kontrol ediliyor..."
          />
          <p className="mt-4 text-gray-500">Lütfen bekleyin...</p>
        </Card>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <Result
            status="success"
            icon={<CheckCircleOutlined className="text-green-500" style={{ fontSize: 72 }} />}
            title="Ödeme Başarılı!"
            subTitle="Tutarınız cüzdanınıza başarıyla yüklendi."
          />

          {paymentDetails && (
            <Descriptions bordered column={1} size="small" className="mb-6">
              <Descriptions.Item label="Tutar">
                {formatCurrency(paymentDetails.amount, paymentDetails.currency)}
              </Descriptions.Item>
              {paymentDetails.transactionId && (
                <Descriptions.Item label="İşlem No">
                  {paymentDetails.transactionId}
                </Descriptions.Item>
              )}
              {paymentDetails.cardAssociation && (
                <Descriptions.Item label="Kart">
                  {paymentDetails.cardAssociation} •••• {paymentDetails.lastFourDigits}
                </Descriptions.Item>
              )}
            </Descriptions>
          )}

          <div className="flex gap-3 justify-center">
            <Button 
              type="primary" 
              icon={<WalletOutlined />}
              onClick={() => navigate('/student/payments')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Cüzdanıma Git
            </Button>
            <Button 
              icon={<HomeOutlined />}
              onClick={() => navigate('/dashboard')}
            >
              Ana Sayfa
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <Result
          status="error"
          icon={<CloseCircleOutlined className="text-red-500" style={{ fontSize: 72 }} />}
          title="Ödeme Başarısız"
          subTitle="Ödeme işleminiz tamamlanamadı."
        />

        {error && (
          <Alert
            message="Hata Detayı"
            description={error}
            type="error"
            showIcon
            className="mb-6"
          />
        )}

        <div className="text-center text-gray-500 mb-6">
          <p>Olası sebepler:</p>
          <ul className="text-left list-disc list-inside mt-2">
            <li>Yetersiz bakiye</li>
            <li>Kart limiti aşıldı</li>
            <li>3D Secure doğrulaması başarısız</li>
            <li>Banka tarafından reddedildi</li>
          </ul>
        </div>

        <div className="flex gap-3 justify-center">
          <Button 
            type="primary"
            onClick={() => navigate('/student/payments')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Tekrar Dene
          </Button>
          <Button onClick={() => navigate('/dashboard')}>
            Ana Sayfa
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default PaymentCallback;
