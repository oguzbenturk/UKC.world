// src/components/ServiceCard.jsx
import React from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { Tag, Button, Dropdown, Badge, Card, Tooltip } from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  MoreOutlined, 
  UserOutlined, 
  ClockCircleOutlined,
  
  ShoppingCartOutlined,
  EyeOutlined,
  CalendarOutlined
} from '@ant-design/icons';

// Function to get the appropriate image based on service name/type
const getServiceImage = (service) => {
  const { name, description } = service;
  const serviceText = `${name} ${description}`.toLowerCase();
  
  // Map service types to rental images
  if (serviceText.includes('dlab') || serviceText.includes('rebel')) {
    return '/Images/rental/kite-rebel-dlab-2925.png';
  }
  
  if (serviceText.includes('sls') && (serviceText.includes('board') || serviceText.includes('twin') || serviceText.includes('tip'))) {
    return '/Images/rental/TS BIG AIR SLS.png';
  }
  
  if (serviceText.includes('sls')) {
    return '/Images/rental/SLS.png';
  }
  
  if (serviceText.includes('fullset') || serviceText.includes('complete') || serviceText.includes('full set')) {
    return '/Images/rental/Dacron.png';
  }
  
  if (serviceText.includes('board') && !serviceText.includes('kite')) {
    return '/Images/rental/TS BIG AIR SLS.png';
  }
  
  // Default to Dacron for general rentals
  return '/Images/rental/Dacron.png';
};

// Function to format duration properly for rentals
const formatRentalDuration = (service) => {
  const { name, duration } = service;
  const nameText = name.toLowerCase();
  
  if (nameText.includes('1 day') || nameText.includes('daily')) {
    return '1 Day';
  }
  if (nameText.includes('1 week') || nameText.includes('weekly')) {
    return '1 Week';
  }
  if (nameText.includes('1 hour') || nameText.includes('hourly')) {
    return '1 Hour';
  }
  if (nameText.includes('half day')) {
    return 'Half Day';
  }
  
  // Fallback to original duration
  return duration ? `${duration} hour${duration !== 1 ? 's' : ''}` : 'Flexible';
};

const ServiceAuditMeta = ({ createdByLabel, createdAtFormatted }) => {
  if (!createdByLabel) {
    return null;
  }

  return (
    <Tooltip
      title={createdAtFormatted ? `Created ${createdAtFormatted}` : 'Created automatically'}
    >
      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2">
        <span className="flex items-center gap-1">
          <UserOutlined className="text-gray-400" />
          <span className="truncate max-w-[140px]">{createdByLabel}</span>
        </span>
        {createdAtFormatted ? (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <ClockCircleOutlined />
            <span>{createdAtFormatted}</span>
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">No timestamp</span>
        )}
      </div>
    </Tooltip>
  );
};

function ActionsMenu({ service, onEdit, onDelete, onView }) {
  return {
    items: [
      {
        key: 'view',
        label: 'View Details',
        icon: <EyeOutlined />,
        onClick: () => onView(service)
      },
      {
        key: 'calendar',
        label: 'View Calendar',
        icon: <CalendarOutlined />,
        onClick: () => onView(service)
      },
      ...(onEdit ? [{ key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(service) }] : []),
      ...(onDelete ? [{ key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(service.id) }] : []),
    ],
  };
}

const ServiceCard = ({ service, onEdit, onDelete, onView, onBook }) => {
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const { 
    name, 
    price, 
    imageUrl, 
    description, 
    category, 
    level, 
    maxParticipants,
    available = true
  } = service;

  // Use service-specific image or fallback to provided imageUrl
  const displayImage = getServiceImage(service) || imageUrl;
  const rentalDuration = formatRentalDuration(service);
  
  // Convert price to user's preferred currency
  const baseCurrency = service.currency || businessCurrency || 'EUR';
  const targetCurrency = userCurrency || baseCurrency;
  const displayPrice = convertCurrency(price, baseCurrency, targetCurrency);
  
  // Show dual currency when base differs from target
  const showDualCurrency = baseCurrency !== targetCurrency;
  const priceDisplay = showDualCurrency 
    ? `${formatCurrency(price, baseCurrency)} / ${formatCurrency(displayPrice, targetCurrency)}`
    : formatCurrency(displayPrice || 0, targetCurrency);

  // const formatServiceType = (type) => {
  //   switch(type) {
  //     case 'private': return 'Private';
  //     case 'semi-private': return 'Semi-Private';
  //     case 'group': return 'Group';
  //     default: return 'Equipment';
  //   }
  // };

  const getCategoryColor = (category) => {
    switch(category) {
      case 'rental': return 'purple';
      case 'kitesurfing': return 'blue';
      case 'windsurfing': return 'green';
      case 'equipment-rental': return 'purple';
      default: return 'default';
    }
  };

  const getLevelColor = (level) => {
    switch(level) {
      case 'beginner': return 'green';
      case 'intermediate': return 'blue';
      case 'advanced': return 'orange';
      case 'all-levels': return 'cyan';
      default: return 'default';
    }
  };

  const actionsMenu = ActionsMenu({ service, onEdit, onDelete, onView });

  const handleBookNow = (e) => {
    e.stopPropagation();
    if (onBook) {
      onBook(service);
    } else {
      onView(service); // Fallback to view if onBook not provided
    }
  };

  return (
    <Card
      hoverable
      className="rental-card overflow-hidden"
      cover={
        <div className="relative h-48 overflow-hidden">
          <img
            alt={name}
            src={displayImage}
            className="w-full h-full object-contain bg-gradient-to-br from-blue-50 to-purple-50 p-4"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div 
            className="hidden w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 items-center justify-center text-white text-lg font-bold"
          >
            {name}
          </div>
          
          {/* Availability Badge */}
          <div className="absolute top-2 left-2">
            <Badge 
              status={available ? "success" : "error"} 
              text={available ? "Available" : "Unavailable"}
              className="bg-white/90 px-2 py-1 rounded"
            />
          </div>

          {/* Actions Menu */}
          <div className="absolute top-2 right-2">
            <Dropdown 
              menu={actionsMenu}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button 
                type="text" 
                icon={<MoreOutlined />} 
                className="bg-white/80 hover:bg-white" 
                size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>

          {/* Duration Badge */}
          <div className="absolute bottom-2 left-2">
            <Tag color="blue" className="font-semibold">
              <ClockCircleOutlined className="mr-1" />
              {rentalDuration}
            </Tag>
          </div>
        </div>
      }
      actions={[
        <Button 
          key="details"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onView(service);
          }}
          className="border-none"
        >
          Details
        </Button>,
        <Button 
          key="calendar"
          icon={<CalendarOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onView(service);
          }}
          className="border-none"
        >
          Calendar
        </Button>,
        <Button 
          key="rent"
          type="primary" 
          icon={<ShoppingCartOutlined />}
          onClick={handleBookNow}
          disabled={!available}
          style={{ backgroundColor: available ? '#eb2f96' : undefined, borderColor: available ? '#eb2f96' : undefined }}
        >
          Rent Now
        </Button>
      ]}
    >
      <Card.Meta
        title={
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-gray-800 truncate">{name}</h3>
            <div className="flex items-center justify-between">
              <Tag color={getCategoryColor(category)} className="text-xs">
                {category === 'rental' ? 'Rental Equipment' : category}
              </Tag>
              {level && (
                <Tag color={getLevelColor(level)} className="text-xs">
                  {level?.charAt(0).toUpperCase() + level?.slice(1).replace(/-/g, ' ')}
                </Tag>
              )}
            </div>
          </div>
        }
        description={
          <div className="space-y-3">
            <p className="text-gray-600 text-sm line-clamp-2">{description}</p>
            
            <div className="flex items-center justify-between">
              <div className="text-xl font-bold text-purple-600">
                {priceDisplay}
                <span className="text-sm font-normal text-gray-500">/{rentalDuration.toLowerCase()}</span>
              </div>
              
              {maxParticipants && (
                <div className="flex items-center text-xs text-gray-500">
                  <UserOutlined className="mr-1" />
                  Max {maxParticipants}
                </div>
              )}
            </div>

            <ServiceAuditMeta
              createdByLabel={service.createdByLabel}
              createdAtFormatted={service.createdAtFormatted}
            />
          </div>
        }
      />
    </Card>
  );
};

export default ServiceCard;
