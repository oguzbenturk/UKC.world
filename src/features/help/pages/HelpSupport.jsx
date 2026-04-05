import { useEffect, useState } from 'react';
import { Card, Collapse, Input, List, Button, Typography, Anchor, Space } from 'antd';
import { SearchOutlined, PhoneOutlined, MailOutlined, ToolOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const quickLinks = [
  { key: 'quicklink-getting-started', href: '#getting-started', title: 'Getting Started' },
  { key: 'quicklink-bookings', href: '#bookings', title: 'Bookings' },
  { key: 'quicklink-customers', href: '#customers', title: 'Customers' },
  { key: 'quicklink-services', href: '#services', title: 'Services & Products' },
  { key: 'quicklink-finances', href: '#finances', title: 'Finance & Reports' },
  { key: 'quicklink-popups', href: '#popups', title: 'Pop-ups & Onboarding' },
  { key: 'quicklink-settings', href: '#settings', title: 'Settings' },
  { key: 'quicklink-faq', href: '#faq', title: 'FAQ' },
  { key: 'quicklink-contact', href: '#contact', title: 'Contact' },
];

const bookingCollapseItems = [
  {
    key: 'b1',
    label: 'Create a booking',
    children: <Paragraph>Go to Bookings → New. Choose service, instructor, and duration. Save to confirm.</Paragraph>,
  },
  {
    key: 'b2',
    label: 'Calendar tips',
    children: <Paragraph>Use the calendar to drag and adjust times. Switch views as needed.</Paragraph>,
  },
];

const faqItems = [
  {
    key: 'f1',
    label: 'What’s the difference between cash and accrual?',
    children: <Paragraph>Cash recognizes payments when received; accrual recognizes revenue when earned.</Paragraph>,
  },
  {
    key: 'f2',
    label: 'How do I change default durations?',
    children: <Paragraph>Go to Settings → Booking Defaults and choose durations and options.</Paragraph>,
  },
  {
    key: 'f3',
    label: 'Can I target popups to new users only?',
    children: <Paragraph>Yes. In Popups settings, choose Target Audience = New Users Only.</Paragraph>,
  },
];

const HelpSupport = () => {
  const [search, setSearch] = useState('');
  // Reserved for future: load help articles dynamically

  useEffect(() => {
    // Placeholder: could load help articles from backend later
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-4 lg:space-y-6">
            <Card className="shadow" styles={{ body: { padding: 16 } }}>
              <Title level={3} className="!mb-2">Help & Support</Title>
              <Paragraph className="!mb-0 text-gray-600">
                Search guides, learn common workflows, and get assistance. Use the AI assistant to generate steps or troubleshoot issues.
              </Paragraph>
              <div className="mt-3">
                <Input
                  size="large"
                  placeholder="Search articles and how-tos"
                  prefix={<SearchOutlined className="text-gray-400" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <Anchor affix={false} items={quickLinks} />
              </div>
            </Card>

            <Card id="getting-started" title="Getting Started" className="shadow">
              <Paragraph>
                Plannivo helps you manage bookings, services, instructors, customers, and finances in one place. Start by:
              </Paragraph>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Creating services and categories under Services</li>
                <li>Setting booking defaults in Settings → Booking Defaults</li>
                <li>Adding instructors and equipment as needed</li>
                <li>Configuring Finance Settings (cash/accrual, fees)</li>
                <li>Customizing onboarding popups for first-time users</li>
              </ol>
            </Card>

            <Card id="bookings" title="Bookings" className="shadow">
              <Paragraph>
                Learn to create, drag-and-drop, and manage bookings on the calendar. Use filters and durations configured in your settings.
              </Paragraph>
              <Collapse bordered={false} items={bookingCollapseItems} />
            </Card>

            <Card id="customers" title="Customers" className="shadow">
              <Paragraph>Manage customer profiles, contact details, and history. Import lists via CSV.</Paragraph>
            </Card>

            <Card id="services" title="Services & Products" className="shadow">
              <Paragraph>Create services, packages, and categorize them for easy booking and tracking.</Paragraph>
            </Card>

            <Card id="finances" title="Finance & Reports" className="shadow">
              <Paragraph>Understand cash vs accrual settings, payment fees, and exportable reports.</Paragraph>
            </Card>

            <Card id="popups" title="Pop-ups & Onboarding" className="shadow">
              <Paragraph>Design first-login popups, set targeting, and preview designs before activation.</Paragraph>
            </Card>

            <Card id="settings" title="Settings" className="shadow">
              <Paragraph>Update booking defaults, profile details, and notifications. Changes are immediate.</Paragraph>
            </Card>

            <Card id="faq" title="Frequently Asked Questions" className="shadow">
              <Collapse items={faqItems} />
            </Card>

            <Card id="contact" title="Contact Support" className="shadow">
              <Space direction="vertical" size="middle">
                <div className="flex items-center gap-2 text-gray-700">
                  <PhoneOutlined /> <Text strong>Phone:</Text> <Text>+1 (555) 123-4567</Text>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <MailOutlined /> <Text strong>Email:</Text> <Text>support@plannivo.com</Text>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <ToolOutlined /> <Text strong>Status:</Text> <a href="https://status.plannivo.com" target="_blank" rel="noreferrer">status.plannivo.com</a>
                </div>
              </Space>
            </Card>
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 space-y-4">
            <Card title="Release Notes" size="small" className="shadow">
              <List
                size="small"
                dataSource={[
                  'Improved mobile settings layout',
                  'Popup Manager error handling',
                  'Finance settings validation tweaks',
                ]}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
            <Card title="Quick Actions" size="small" className="shadow">
              <Space wrap>
                <Button href="/settings" type="default" size="small">Open Settings</Button>
                <Button href="/bookings" type="default" size="small">Open Bookings</Button>
                <Button href="/finance/settings" type="default" size="small">Finance Settings</Button>
                <Button href="/services" type="default" size="small">Services</Button>
              </Space>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
