import React, { useState } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { Card, Modal, Button, Tag, Row, Col } from 'antd';
import { 
  ThunderboltOutlined, 
  ToolOutlined, 
  SafetyCertificateOutlined,
  ShoppingOutlined,
  DollarOutlined 
} from '@ant-design/icons';
import './GearShowcase.css';

const GearShowcase = ({ onRentEquipment }) => {
  const { convertCurrency, formatCurrency, userCurrency } = useCurrency();
  const [selectedGear, setSelectedGear] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const gearCategories = [
    {
      id: 'fullset',
      name: 'Complete Gear Sets',
      description: 'Everything you need for a perfect session',
      image: '/Images/rental/Dacron.png',
      icon: <ShoppingOutlined />,
      price: '$89/day',
      features: ['Kite + Board + Harness', 'Safety Leash', 'Pump Included', 'Size Options Available'],
      color: 'purple',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      id: 'dlab',
      name: 'DLAB Performance Kites',
      description: 'High-performance kites for advanced riders',
      image: '/Images/rental/kite-rebel-dlab-2925.png',
      icon: <ThunderboltOutlined />,
      price: '$45/day',
      features: ['Professional Grade', 'Competition Ready', 'Multiple Sizes', 'Ultimate Performance'],
      color: 'red',
      gradient: 'from-red-500 to-orange-500'
    },
    {
      id: 'sls',
      name: 'SLS Gear Collection',
      description: 'Super Light Strong equipment for pros',
      image: '/Images/rental/SLS.png',
      icon: <SafetyCertificateOutlined />,
      price: '$55/day',
      features: ['Ultra Lightweight', 'Maximum Durability', 'Pro Specifications', 'Carbon Construction'],
      color: 'blue',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'twintip',
      name: 'Twin Tip Boards',
      description: 'TS Big Air SLS boards for extreme performance',
      image: '/Images/rental/TS BIG AIR SLS.png',
      icon: <ToolOutlined />,
      price: '$35/day',
      features: ['Big Air Optimized', 'SLS Construction', 'Twin Tip Design', 'All Skill Levels'],
      color: 'green',
      gradient: 'from-green-500 to-teal-500'
    }
  ];

  const handleViewDetails = (gear) => {
    setSelectedGear(gear);
    setModalVisible(true);
  };

  const handleRent = (gear) => {
    if (onRentEquipment) {
      onRentEquipment(gear);
    }
    setModalVisible(false);
  };

  return (
    <div className="gear-showcase">
      <Card 
        title={
          <div className="flex items-center gap-2">
            <ThunderboltOutlined className="text-pink-500" />
            <span>Premium Gear Categories</span>
          </div>
        }
        className="shadow-lg mb-6"
      >
        <Row gutter={[16, 16]}>
          {gearCategories.map((gear) => {
            const priceMatch = gear.price.match(/\$(\d+)/);
            const rawPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
            const baseCurrency = 'USD'; 
            const targetCurrency = userCurrency || 'USD';
            const price = convertCurrency ? convertCurrency(rawPrice, baseCurrency, targetCurrency) : rawPrice;
            // formattedPrice includes symbol, e.g. €85
            const formattedPrice = formatCurrency ? formatCurrency(price, targetCurrency) : gear.price; 
            const displayPrice = formattedPrice.includes('/day') ? formattedPrice : formattedPrice + '/day'; 


            return (
            <Col xs={24} sm={12} lg={6} key={gear.id}>
              <Card
                className="gear-card h-full"
                cover={
                  <div className={`gear-image-container bg-gradient-to-br ${gear.gradient}`}>
                    <img
                      alt={gear.name}
                      src={gear.image}
                      className="gear-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="gear-fallback" style={{ display: 'none' }}>
                      {gear.icon}
                      <span className="text-white font-bold">{gear.name}</span>
                    </div>
                  </div>
                }
                actions={[
                  <Button 
                    type="text" 
                    onClick={() => handleViewDetails(gear)}
                    className="text-gray-600 hover:text-pink-500"
                  >
                    View Details
                  </Button>,
                  <Button 
                    type="primary" 
                    onClick={() => handleRent(gear)}
                    style={{ backgroundColor: '#eb2f96', borderColor: '#eb2f96' }}
                  >
                    Rent Now
                  </Button>
                ]}
              >
                <Card.Meta
                  title={
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold">{gear.name}</span>
                      <Tag color={gear.color}>{displayPrice}</Tag>
                    </div>
                  }
                  description={
                    <div>
                      <p className="text-gray-600 mb-2">{gear.description}</p>
                      <div className="flex items-center gap-1 text-pink-500">
                        <DollarOutlined />
                        <span className="font-semibold">{displayPrice}</span>
                      </div>
                    </div>
                  }
                />
              </Card>
            </Col>
          );})}
        </Row>
      </Card>

      {/* Gear Details Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {selectedGear?.icon}
            <span>{selectedGear?.name}</span>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="back" onClick={() => setModalVisible(false)}>
            Close
          </Button>,
          <Button 
            key="rent" 
            type="primary" 
            onClick={() => handleRent(selectedGear)}
            style={{ backgroundColor: '#eb2f96', borderColor: '#eb2f96' }}
          >
            Rent {selectedGear?.name} - {selectedGear?.price}
          </Button>
        ]}
        width={600}
      >
        {selectedGear && (
          <div className="space-y-4">
            <div className={`gear-modal-image bg-gradient-to-br ${selectedGear.gradient} rounded-lg`}>
              <img
                src={selectedGear.image}
                alt={selectedGear.name}
                className="w-full h-48 object-contain"
              />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Description</h3>
              <p className="text-gray-700">{selectedGear.description}</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Features</h3>
              <div className="grid grid-cols-2 gap-2">
                {selectedGear.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">Daily Rate:</span>
                <Tag color={selectedGear.color} className="text-lg px-3 py-1">
                  {selectedGear.price}
                </Tag>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default GearShowcase;
