import { Card, Row, Col, Button, Typography, Tag, Space } from 'antd';
import { EyeOutlined, SelectOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const PopupTemplates = ({ onSelectTemplate }) => {
  const templates = [
    {
      id: 'welcome-basic',
      name: 'Welcome Message',
      description: 'Simple welcome popup for new users',
      category: 'Onboarding',
      preview: '/images/templates/welcome-basic.png',
      config: {
        general: {
          targetAudience: 'new_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          title: 'Welcome to Our Platform!',
          subtitle: 'We\'re excited to have you on board',
          bodyText: 'Discover all the amazing features we have prepared for you. Let\'s get started on this journey together!',
          primaryButton: {
            text: 'Get Started',
            action: 'redirect',
            url: '/dashboard'
          },
          secondaryButton: {
            text: 'Take Tour',
            action: 'redirect',
            url: '/tour'
          }
        },
        design: {
          theme: 'default',
          width: 600,
          position: 'center',
          animation: 'fade',
          backgroundColor: '#ffffff',
          textColor: '#333333'
        }
      }
    },
    {
      id: 'feature-announcement',
      name: 'Feature Announcement',
      description: 'Announce new features and updates',
      category: 'Marketing',
      preview: '/images/templates/feature-announcement.png',
      config: {
        general: {
          targetAudience: 'all_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          title: '🎉 New Feature Alert!',
          subtitle: 'Enhanced Analytics Dashboard',
          bodyText: 'We\'ve completely redesigned our analytics dashboard with new insights, better visualizations, and real-time data updates.',
          heroImage: '/images/features/analytics-hero.jpg',
          primaryButton: {
            text: 'Explore Now',
            action: 'redirect',
            url: '/analytics'
          },
          secondaryButton: {
            text: 'Learn More',
            action: 'external',
            url: 'https://help.example.com/new-analytics'
          }
        },
        design: {
          theme: 'modern',
          width: 700,
          position: 'center',
          animation: 'zoom',
          backgroundColor: '#f5f5f5'
        }
      }
    },
    {
      id: 'promotional-offer',
      name: 'Promotional Offer',
      description: 'Promote special offers and discounts',
      category: 'Marketing',
      preview: '/images/templates/promotional-offer.png',
      config: {
        general: {
          targetAudience: 'all_users',
          displayFrequency: 'daily',
          allowClose: true,
          autoClose: 15
        },
        content: {
          title: '🔥 Limited Time Offer!',
          subtitle: '50% Off Premium Plans',
          bodyText: 'Upgrade to Premium and unlock all advanced features. This exclusive offer expires in 48 hours!',
          primaryButton: {
            text: 'Upgrade Now',
            action: 'redirect',
            url: '/upgrade'
          },
          secondaryButton: {
            text: 'View Plans',
            action: 'redirect',
            url: '/pricing'
          }
        },
        design: {
          theme: 'business',
          width: 550,
          position: 'center',
          animation: 'bounce',
          backgroundColor: '#ff6b6b',
          textColor: '#ffffff'
        }
      }
    },
    {
      id: 'feedback-request',
      name: 'Feedback Request',
      description: 'Ask users for feedback and reviews',
      category: 'Engagement',
      preview: '/images/templates/feedback-request.png',
      config: {
        general: {
          targetAudience: 'all_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          title: 'Your Opinion Matters! 💝',
          subtitle: 'Help Us Improve',
          bodyText: 'We\'d love to hear about your experience with our platform. Your feedback helps us build better features for everyone.',
          primaryButton: {
            text: 'Give Feedback',
            action: 'external',
            url: 'https://forms.example.com/feedback'
          },
          secondaryButton: {
            text: 'Maybe Later',
            action: 'close'
          }
        },
        design: {
          theme: 'elegant',
          width: 500,
          position: 'center',
          animation: 'slide',
          backgroundColor: '#4ecdc4',
          textColor: '#ffffff'
        }
      }
    },
    {
      id: 'tutorial-intro',
      name: 'Tutorial Introduction',
      description: 'Multi-step tutorial for new users',
      category: 'Onboarding',
      preview: '/images/templates/tutorial-intro.png',
      config: {
        general: {
          targetAudience: 'new_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          steps: [
            {
              stepTitle: 'Welcome',
              title: 'Welcome to Your Dashboard',
              bodyText: 'This is your main control center where you can access all features.',
              heroImage: '/images/tutorial/dashboard.png'
            },
            {
              stepTitle: 'Navigation',
              title: 'Easy Navigation',
              bodyText: 'Use the sidebar to navigate between different sections of the application.',
              heroImage: '/images/tutorial/navigation.png'
            },
            {
              stepTitle: 'Get Started',
              title: 'Ready to Begin?',
              bodyText: 'You\'re all set! Start exploring and don\'t hesitate to contact support if you need help.',
              primaryButton: {
                text: 'Start Exploring',
                action: 'close'
              }
            }
          ]
        },
        design: {
          theme: 'minimal',
          width: 650,
          position: 'center',
          animation: 'fade',
          showProgress: true,
          backgroundColor: '#ffffff',
          textColor: '#333333'
        }
      }
    },
    {
      id: 'newsletter-signup',
      name: 'Newsletter Signup',
      description: 'Collect email subscriptions',
      category: 'Lead Generation',
      preview: '/images/templates/newsletter-signup.png',
      config: {
        general: {
          targetAudience: 'all_users',
          displayFrequency: 'session',
          allowClose: true
        },
        content: {
          title: '📧 Stay Updated!',
          subtitle: 'Never Miss an Update',
          bodyText: 'Subscribe to our newsletter and be the first to know about new features, tips, and exclusive content.',
          primaryButton: {
            text: 'Subscribe',
            action: 'external',
            url: 'https://newsletter.example.com/subscribe'
          },
          secondaryButton: {
            text: 'No Thanks',
            action: 'close'
          },
          socialLinks: [
            { text: 'Twitter', url: 'https://twitter.com/example', icon: '🐦' },
            { text: 'LinkedIn', url: 'https://linkedin.com/company/example', icon: '💼' }
          ]
        },
        design: {
          theme: 'business',
          width: 500,
          position: 'center',
          animation: 'fade',
          backgroundColor: '#667eea',
          textColor: '#ffffff'
        }
      }
    },
    {
      id: 'maintenance-notice',
      name: 'Maintenance Notice',
      description: 'Inform users about scheduled maintenance',
      category: 'System',
      preview: '/images/templates/maintenance-notice.png',
      config: {
        general: {
          targetAudience: 'all_users',
          displayFrequency: 'always',
          allowClose: false,
          priority: 'urgent'
        },
        content: {
          title: '🔧 Scheduled Maintenance',
          subtitle: 'System Update in Progress',
          bodyText: 'We\'re performing scheduled maintenance to improve our services. The system will be unavailable from 2:00 AM to 4:00 AM UTC.',
          primaryButton: {
            text: 'Got It',
            action: 'close'
          }
        },
        design: {
          theme: 'minimal',
          width: 550,
          position: 'top',
          animation: 'slide',
          backgroundColor: '#ffa726',
          textColor: '#ffffff'
        }
      }
    },
    {
      id: 'social-proof',
      name: 'Social Proof',
      description: 'Show testimonials and social proof',
      category: 'Marketing',
      preview: '/images/templates/social-proof.png',
      config: {
        general: {
          targetAudience: 'new_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          title: '⭐ Join 10,000+ Happy Users',
          subtitle: 'Trusted by Industry Leaders',
          bodyText: '"This platform has revolutionized how we manage our business operations. Highly recommended!" - Sarah Johnson, CEO',
          contentBlocks: [
            { title: '10,000+', description: 'Active Users', icon: '👥' },
            { title: '99.9%', description: 'Uptime', icon: '⚡' },
            { title: '4.9/5', description: 'User Rating', icon: '⭐' }
          ],
          primaryButton: {
            text: 'Join Now',
            action: 'redirect',
            url: '/signup'
          },
          secondaryButton: {
            text: 'Learn More',
            action: 'redirect',
            url: '/about'
          }
        },
        design: {
          theme: 'elegant',
          width: 700,
          position: 'center',
          animation: 'zoom',
          backgroundColor: '#38f9d7',
          textColor: '#333333'
        }
      }
    }
  ];

  const categories = [...new Set(templates.map(t => t.category))];

  return (
    <div style={{ padding: '16px' }}>
      <Title level={4}>Choose a Template</Title>
      <Text type="secondary">
        Select a pre-built template to get started quickly. You can customize all aspects after selecting.
      </Text>
      
      {categories.map(category => (
        <div key={category} style={{ marginBottom: '32px', marginTop: '24px' }}>
          <Title level={5}>
            <Tag color="blue">{category}</Tag>
          </Title>
          
          <Row gutter={[16, 16]}>
            {templates
              .filter(template => template.category === category)
              .map(template => (
                <Col xs={24} sm={12} lg={8} key={template.id}>
                  <Card
                    hoverable
                    cover={
                      <div 
                        style={{ 
                          height: '150px', 
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '16px',
                          fontWeight: 'bold'
                        }}
                      >
                        {template.name}
                      </div>
                    }
                    actions={[
                      <EyeOutlined key="preview" />,
                      <Button 
                        key="select" 
                        type="primary" 
                        size="small"
                        icon={<SelectOutlined />}
                        onClick={() => onSelectTemplate(template.config)}
                      >
                        Use Template
                      </Button>
                    ]}
                  >
                    <Card.Meta
                      title={template.name}
                      description={
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Text>{template.description}</Text>
                          <div>
                            <Tag size="small" color="green">
                              {template.config.general.targetAudience.replace('_', ' ')}
                            </Tag>
                            <Tag size="small" color="orange">
                              {template.config.design.theme}
                            </Tag>
                          </div>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              ))}
          </Row>
        </div>
      ))}
    </div>
  );
};

export default PopupTemplates;
