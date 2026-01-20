import { useEffect } from 'react';
import { Button, Typography, Row, Col, Card } from 'antd';
import { useAuth } from '@/shared/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { usePageSEO } from '@/shared/utils/seo';

const { Title, Paragraph } = Typography;

export default function PublicHome() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  usePageSEO({
    title: 'Plannivo | Lesson, Rentals, and Operations Platform',
    description: 'Plannivo helps schools and rental shops manage lessons, rentals, customers, payments, and operations in one fast, modern app.',
    path: 'https://plannivo.com/'
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <main className="min-h-dvh bg-white">
      <section className="bg-slate-900 text-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <Title level={1} style={{ color: 'white', marginBottom: 8 }}>Plannivo</Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18, maxWidth: 720 }}>
            Manage lessons, rentals, customers, payments, and daily operations in one modern platform.
          </Paragraph>
          <div className="mt-6 flex gap-3">
            <Button type="primary" size="large" onClick={() => navigate('/login')}>Sign In</Button>
          </div>
        </div>
      </section>
      <section className="py-14">
        <div className="max-w-6xl mx-auto px-4">
          <Row gutter={[16,16]}>
            <Col xs={24} md={8}>
              <Card variant="outlined" className="h-full">
                <Title level={4}>Lesson Management</Title>
                <Paragraph>Schedule, track, and manage lesson bookings with package hours support and instructor workflows.</Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="outlined" className="h-full">
                <Title level={4}>Rentals</Title>
                <Paragraph>Streamlined rental checkouts, returns, and inventory tracking with clear customer history.</Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="outlined" className="h-full">
                <Title level={4}>Finance</Title>
                <Paragraph>Integrated balances, payments, refunds, and booking-linked transactions for clean accounting.</Paragraph>
              </Card>
            </Col>
          </Row>
        </div>
      </section>
    </main>
  );
}
