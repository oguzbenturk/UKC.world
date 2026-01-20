import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Modal, Tabs, Button, Descriptions, Tag, Spin, 
  Avatar, Typography, Divider, Card 
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  UserOutlined, MailOutlined, PhoneOutlined, 
  CalendarOutlined, TrophyOutlined, EnvironmentOutlined,
  DollarOutlined, TeamOutlined, IdcardOutlined, BarChartOutlined
} from '@ant-design/icons';
import InstructorServiceCommission from './InstructorServiceCommission';
import InstructorPayments from './InstructorPayments';
import PayrollDashboard from './PayrollDashboard';
import { useData } from '@/shared/hooks/useData';
import globalRequestThrottle from '@/shared/utils/requestThrottle';
import { logger } from '@/shared/utils/logger';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;

// eslint-disable-next-line complexity
const EnhancedInstructorDetailModal = ({ 
  instructor, 
  isOpen, 
  onClose,
  onUpdate = () => {}
}) => {
  const { businessCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [instructorServices, setInstructorServices] = useState([]);
  const [recentLessons, setRecentLessons] = useState([]);
  const { apiClient } = useData();
  
  // Refs for child components to trigger their refresh methods
  const instructorPaymentsRef = useRef(null);
  const payrollDashboardRef = useRef(null);
  const serviceCommissionRef = useRef(null);

  const fetchInstructorData = useCallback(async () => {
    if (!instructor?.id) return;
    setLoading(true);
    try {
      // Get instructor's assigned services with throttling
      logger.info(`Fetching services for instructor ${instructor.id}`);
      try {
        const servicesRes = await globalRequestThrottle.execute(() => 
          apiClient.get(`/instructors/${instructor.id}/services`)
        );
        setInstructorServices(servicesRes.data || []);
        logger.debug(`Found ${servicesRes.data?.length || 0} services for instructor`);
      } catch (servicesError) {
        logger.warn('Error fetching instructor services', { error: String(servicesError) });
        // Non-critical
      }

      // Get instructor's recent lessons with throttling
      try {
        const lessonsRes = await globalRequestThrottle.execute(() => 
          apiClient.get(`/instructors/${instructor.id}/lessons?limit=5`)
        );
        setRecentLessons(lessonsRes.data || []);
        logger.debug(`Found ${lessonsRes.data?.length || 0} lessons for instructor`);
      } catch (lessonsError) {
        logger.warn('Error fetching instructor lessons', { error: String(lessonsError) });
        // PayrollDashboard will handle this
      }
    } catch (error) {
      logger.error('Error fetching instructor data', { error: String(error) });
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructor?.id]);

  useEffect(() => {
    if (isOpen && instructor?.id) {
      fetchInstructorData();
    }
  }, [isOpen, instructor?.id, fetchInstructorData]);

  // Add page visibility refresh handler
  // Centralized refresh function for all instructor data (defined before usage in effects)
  const refreshAllInstructorData = useCallback(async () => {
    logger.info('Refreshing all instructor data...');
    try {
      // Refresh basic instructor data
      await fetchInstructorData();
      
      // Refresh all child component data
      if (instructorPaymentsRef.current?.refreshData) {
        await instructorPaymentsRef.current.refreshData();
      }
      
      if (payrollDashboardRef.current?.refreshData) {
        await payrollDashboardRef.current.refreshData();
      }
      
      if (serviceCommissionRef.current?.refreshData) {
        await serviceCommissionRef.current.refreshData();
      }
      
      // Notify parent component of updates
      onUpdate();
      logger.info('All instructor data refreshed successfully');
    } catch (error) {
      logger.error('Error refreshing instructor data', { error: String(error) });
      message.error('Failed to refresh instructor data');
    }
  }, [fetchInstructorData, onUpdate]);

  // Add page visibility refresh handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isOpen && instructor?.id) {
        logger.info('Page became visible, refreshing instructor data...');
        refreshAllInstructorData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, instructor?.id, refreshAllInstructorData]);

  if (!isOpen || !instructor) return null;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar 
            size={40} 
            src={instructor.profile_image_url} 
            icon={!instructor.profile_image_url && <UserOutlined />}
            style={{ marginRight: 12 }}
          />
          <span>Instructor Profile: {instructor.name}</span>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
    >
      <Spin spinning={loading}>
        
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'info',
              label: (
                <span>
                  <UserOutlined />
                  Basic Info
                </span>
              ),
              children: (
                <Card variant="outlined">
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="Full Name" span={2}>
                      {instructor.name}
                    </Descriptions.Item>
                    
                    <Descriptions.Item label={<><MailOutlined /> Email</>} span={1}>
                      {instructor.email}
                    </Descriptions.Item>
                    
                    <Descriptions.Item label={<><PhoneOutlined /> Phone</>} span={1}>
                      {instructor.phone || 'N/A'}
                    </Descriptions.Item>
                    
                    {instructor.date_of_birth && (
                      <Descriptions.Item label={<><CalendarOutlined /> Date of Birth</>} span={2}>
                        {instructor.date_of_birth}
                      </Descriptions.Item>
                    )}
                    
                    {instructor.address && (
                      <Descriptions.Item label={<><EnvironmentOutlined /> Address</>} span={2}>
                        {`${instructor.address || ''} ${instructor.city || ''} ${instructor.country || ''}`}
                      </Descriptions.Item>
                    )}
                    
                    {instructor.level && (
                      <Descriptions.Item label="Skill Level" span={2}>
                        <Tag color="blue">{instructor.level}</Tag>
                      </Descriptions.Item>
                    )}
                    
                    {instructor.specializations?.length > 0 && (
                      <Descriptions.Item label={<><TrophyOutlined /> Specializations</>} span={2}>
                        {instructor.specializations.map((spec) => (
                          <Tag color="green" key={spec} style={{ margin: '2px' }}>
                            {spec}
                          </Tag>
                        ))}
                      </Descriptions.Item>
                    )}
                    
                    {instructor.certificates?.length > 0 && (
                      <Descriptions.Item label={<><IdcardOutlined /> Certificates</>} span={2}>
                        {instructor.certificates.map((cert) => (
                          <Tag color="purple" key={cert} style={{ margin: '2px' }}>
                            {cert}
                          </Tag>
                        ))}
                      </Descriptions.Item>
                    )}
                    
                    <Descriptions.Item label="Account Status" span={1}>
                      <Tag color={instructor.status === 'active' ? 'green' : 'red'}>
                        {instructor.status?.toUpperCase() || 'ACTIVE'}
                      </Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="Joining Date" span={1}>
                      {instructor.created_at ? new Date(instructor.created_at).toLocaleDateString() : 'N/A'}
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="Total Services" span={1}>
                      {instructorServices.length} assigned
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="Recent Lessons" span={1}>
                      {recentLessons.length} completed
                    </Descriptions.Item>
                    
                    {instructor.hourly_rate && (
                      <Descriptions.Item label={<><DollarOutlined /> Hourly Rate</>} span={2}>
                        {formatCurrency(Number(instructor.hourly_rate) || 0, businessCurrency || 'EUR')}/hour
                      </Descriptions.Item>
                    )}
                    
                    {instructor.languages?.length > 0 && (
                      <Descriptions.Item label="Languages" span={2}>
                        {instructor.languages.map((lang) => (
                          <Tag color="cyan" key={lang} style={{ margin: '2px' }}>
                            {lang}
                          </Tag>
                        ))}
                      </Descriptions.Item>
                    )}
                  </Descriptions>

                  {instructor.bio && (
                    <>
                      <Divider orientation="left">Biography</Divider>
                      <Text>{instructor.bio}</Text>
                    </>
                  )}

                  {instructor.notes && (
                    <>
                      <Divider orientation="left">Additional Notes</Divider>
                      <Text>{instructor.notes}</Text>
                    </>
                  )}
                </Card>
              )
            },
            {
              key: 'commissions',
              label: (
                <span>
                  <DollarOutlined />
                  Service Commissions
                </span>
              ),
              children: (
                <InstructorServiceCommission
                  ref={serviceCommissionRef}
                  instructorId={instructor.id}
                  onSave={() => {
                    message.success('Commission settings saved');
                    refreshAllInstructorData();
                  }}
                  onCancel={() => setActiveTab('info')}
                />
              )
            },
            {
              key: 'dashboard',
              label: (
                <span>
                  <BarChartOutlined />
                  Earnings Dashboard
                </span>
              ),
              children: (
                <PayrollDashboard
                  ref={payrollDashboardRef}
                  instructor={instructor}
                />
              )
            },
            {
              key: 'payments',
              label: (
                <span>
                  <TeamOutlined />
                  Payroll & Payments
                </span>
              ),
              children: (
                <InstructorPayments
                  ref={instructorPaymentsRef}
                  instructor={instructor}
                  onPaymentSuccess={refreshAllInstructorData}
                />
              )
            }
          ]}
        />
      </Spin>
    </Modal>
  );
};

export default EnhancedInstructorDetailModal;
