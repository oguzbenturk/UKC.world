import React, { useState } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { Card, Row, Col, Button, Tag, Tooltip, Modal } from 'antd';
import { 
  ThunderboltOutlined, 
  ToolOutlined, 
  SafetyCertificateOutlined,
  StarOutlined,
  EyeOutlined,
  ShoppingCartOutlined
} from '@ant-design/icons';
import duotoneImages from '../../../shared/constants/duotoneImages';
import './DuotoneEquipmentShowcase.css';

const DuotoneEquipmentShowcase = ({ onRentEquipment }) => {
  const { convertCurrency, formatCurrency, userCurrency } = useCurrency();
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const duotoneEquipment = [
    {
      id: 'neo-kite',
      name: 'NEO SLS',
      category: 'Kites',
      type: 'Freeride',
      image: duotoneImages.neo,
      sizes: ['7m', '9m', '11m', '13m', '15m'],
      price: 89,
      priceUnit: 'per day',
      description: 'The ultimate freeride kite for all conditions. Perfect balance of performance and ease of use.',
      features: ['SLS Construction', 'Triple Ripstop Canopy', '5-Line Safety System', 'All Conditions'],
      skill: 'Beginner to Advanced',
      conditions: 'All wind conditions',
      color: '#FF3366'
    },
    {
      id: 'rebel-kite',
      name: 'REBEL SLS',
      category: 'Kites',
      type: 'Big Air / Wave',
      image: duotoneImages.rebel,
      sizes: ['6m', '8m', '10m', '12m', '14m'],
      price: 95,
      priceUnit: 'per day',
      description: 'High-performance kite designed for big air and wave riding. Explosive power delivery.',
      features: ['SLS Construction', 'Direct Feel', 'Explosive Power', 'Wave Performance'],
      skill: 'Intermediate to Expert',
      conditions: 'Strong winds preferred',
      color: '#2563EB'
    },
    {
      id: 'dice-board',
      name: 'DICE',
      category: 'Boards',
      type: 'Freeride TwinTip',
      image: duotoneImages.dice,
      sizes: ['134cm', '136cm', '138cm', '140cm', '142cm'],
      price: 49,
      priceUnit: 'per day',
      description: 'Versatile freeride board with exceptional comfort and control.',
      features: ['Biax Carbon', 'Grab Rails', 'Progressive Rocker', 'Comfortable Ride'],
      skill: 'Beginner to Intermediate',
      conditions: 'All conditions',
      color: '#10B981'
    },
    {
      id: 'jaime-board',
      name: 'JAIME TEXTREME',
      category: 'Boards',
      type: 'Surfboard',
      image: duotoneImages.jaime,
      sizes: ['5\'6"', '5\'8"', '5\'10"', '6\'0"', '6\'2"'],
      price: 65,
      priceUnit: 'per day',
      description: 'Premium surfboard designed by Jaime Herraiz for ultimate wave performance.',
      features: ['Textreme Construction', 'Wave Optimized', 'Pro Design', 'Ultra Light'],
      skill: 'Advanced to Expert',
      conditions: 'Wave riding',
      color: '#F59700'
    },
    {
      id: 'duotone-harness',
      name: 'TRUST BAR',
      category: 'Accessories',
      type: 'Control System',
      image: duotoneImages.harness,
      sizes: ['42cm', '45cm', '48cm'],
      price: 25,
      priceUnit: 'per day',
      description: 'Premium control bar with Trust Quick Release system.',
      features: ['Trust QR System', '5-Line Setup', 'Ergonomic Grip', 'Safety First'],
      skill: 'All Levels',
      conditions: 'Universal',
      color: '#374151'
    }
  ];

  const handleViewDetails = (equipment) => {
    setSelectedEquipment(equipment);
    setModalVisible(true);
  };

  const handleRent = (equipment) => {
    if (onRentEquipment) {
      onRentEquipment(equipment);
    }
    setModalVisible(false);
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Kites': return <ThunderboltOutlined />;
      case 'Boards': return <ToolOutlined />;
      case 'Accessories': return <SafetyCertificateOutlined />;
      default: return <StarOutlined />;
    }
  };

  const getSkillColor = (skill) => {
    if (skill.includes('Beginner')) return 'green';
    if (skill.includes('Intermediate')) return 'blue';
    if (skill.includes('Advanced')) return 'orange';
    if (skill.includes('Expert')) return 'red';
    return 'default';
  };

  return (
    <div className="duotone-showcase">
      {/* Duotone Header */}
      <Card className="mb-6 bg-gradient-to-r from-pink-50 to-blue-50 border-pink-200">
        <div className="text-center">
          <img 
            src={duotoneImages.logo} 
            alt="Duotone" 
            className="h-16 mx-auto mb-4"
          />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Premium Duotone Equipment
          </h2>
          <p className="text-gray-600">
            Experience the world's leading kitesurfing brand. Rent authentic Duotone gear for your session.
          </p>
          <div className="flex justify-center gap-4 mt-4">
            <Tag color="pink" icon={<StarOutlined />}>Premium Quality</Tag>
            <Tag color="blue" icon={<SafetyCertificateOutlined />}>Safety Tested</Tag>
            <Tag color="green" icon={<ThunderboltOutlined />}>Performance Proven</Tag>
          </div>
        </div>
      </Card>

      {/* Equipment Grid */}
      <Row gutter={[24, 24]}>
        {duotoneEquipment.map((equipment) => {
          const rawPrice = equipment.price;
          const baseCurrency = 'USD'; // Assumed based on original symbol
          const targetCurrency = userCurrency || 'USD';
          const price = convertCurrency ? convertCurrency(rawPrice, baseCurrency, targetCurrency) : rawPrice;
          const formattedPrice = formatCurrency ? formatCurrency(price, targetCurrency) : `$${rawPrice}`;

          return (
          <Col xs={24} sm={12} lg={8} key={equipment.id}>
            <Card
              className={`duotone-equipment-card h-full border-gray-200 hover:border-pink-400 hover:shadow-lg transition-all duration-300 ${
                equipment.category === 'Kites' ? 'equipment-kites' : 
                equipment.category === 'Boards' ? 'equipment-boards' : 'equipment-accessories'
              }`}
              cover={
                <div className="relative overflow-hidden">
                  <img
                    alt={equipment.name}
                    src={equipment.image}
                    className="h-48 w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <div className="absolute top-2 right-2">
                    <Tag color={equipment.category === 'Kites' ? 'pink' : equipment.category === 'Boards' ? 'blue' : 'green'}>
                      {equipment.category}
                    </Tag>
                  </div>
                  <div className="absolute bottom-2 left-2">
                    <Tag color="white" style={{ color: equipment.color, borderColor: equipment.color }}>
                      <strong>{formattedPrice}</strong> {equipment.priceUnit}
                    </Tag>
                  </div>
                </div>
              }
              actions={[
                <Tooltip title="View Details">
                  <Button 
                    type="text" 
                    icon={<EyeOutlined />}
                    onClick={() => handleViewDetails(equipment)}
                  />
                </Tooltip>,
                <Tooltip title="Rent Now">
                  <Button 
                    type="text" 
                    icon={<ShoppingCartOutlined />}
                    style={{ color: equipment.color }}
                    onClick={() => handleRent(equipment)}
                  />
                </Tooltip>
              ]}
            >
              <Card.Meta
                title={
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold" style={{ color: equipment.color }}>
                      {equipment.name}
                    </span>
                    {getCategoryIcon(equipment.category)}
                  </div>
                }
                description={
                  <div className="space-y-2">
                    <p className="text-gray-600 text-sm" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {equipment.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Tag color={getSkillColor(equipment.skill)} size="small">
                        {equipment.skill}
                      </Tag>
                      <Tag color="default" size="small">
                        {equipment.type}
                      </Tag>
                    </div>
                    <div className="text-xs text-gray-500">
                      Sizes: {equipment.sizes.slice(0, 3).join(', ')}
                      {equipment.sizes.length > 3 && ` +${equipment.sizes.length - 3} more`}
                    </div>
                  </div>
                }
              />
            </Card>
          </Col>
        );})}
      </Row>

      {/* Equipment Detail Modal */}
      <Modal
        className="duotone-modal"
        title={
          <div className="flex items-center gap-2">
            <img src={duotoneImages.logo} alt="Duotone" className="h-8" />
            <span style={{ color: selectedEquipment?.color }}>
              {selectedEquipment?.name}
            </span>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Close
          </Button>,
          <Button 
            key="rent" 
            type="primary" 
            icon={<ShoppingCartOutlined />}
            style={{ 
              backgroundColor: selectedEquipment?.color, 
              borderColor: selectedEquipment?.color 
            }}
            onClick={() => handleRent(selectedEquipment)}
          >
            Rent ${selectedEquipment?.price}/day
          </Button>
        ]}
        width={600}
      >
        {selectedEquipment && (
          <div className="space-y-4">
            <img
              src={selectedEquipment.image}
              alt={selectedEquipment.name}
              className="w-full h-64 object-cover rounded-lg"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Specifications</h4>
                <div className="space-y-1 text-sm">
                  <div><strong>Category:</strong> {selectedEquipment.category}</div>
                  <div><strong>Type:</strong> {selectedEquipment.type}</div>
                  <div><strong>Skill Level:</strong> {selectedEquipment.skill}</div>
                  <div><strong>Conditions:</strong> {selectedEquipment.conditions}</div>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Available Sizes</h4>
                <div className="flex flex-wrap gap-1">
                  {selectedEquipment.sizes.map(size => (
                    <Tag key={size} color="blue">{size}</Tag>
                  ))}
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Features</h4>
              <div className="flex flex-wrap gap-1">
                {selectedEquipment.features.map(feature => (
                  <Tag key={feature} color="green">{feature}</Tag>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Description</h4>
              <p className="text-gray-600">{selectedEquipment.description}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DuotoneEquipmentShowcase;
