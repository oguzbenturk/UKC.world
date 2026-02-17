/**
 * Field Toolbox Component
 * Displays available field types that can be dragged onto the canvas
 */

import { useState } from 'react';
import { Collapse, Input, Tooltip, Typography, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as Icons from '@ant-design/icons';
import { FIELD_CATEGORIES } from '../constants/fieldTypes';

const { Text } = Typography;

const FieldToolbox = ({ onFieldDragStart, onFieldClick, disabled = false }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Get icon component by name
  const getIcon = (iconName) => {
    const IconComponent = Icons[iconName];
    return IconComponent ? <IconComponent /> : <Icons.QuestionOutlined />;
  };

  // Filter fields based on search
  const filteredCategories = FIELD_CATEGORIES.map(category => ({
    ...category,
    fields: category.fields.filter(field =>
      field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      field.description.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(category => category.fields.length > 0);

  // Handle drag start
  const handleDragStart = (e, field) => {
    if (disabled) return;
    
    e.dataTransfer.setData('fieldType', field.type);
    e.dataTransfer.setData('fieldLabel', field.label);
    e.dataTransfer.effectAllowed = 'copy';
    
    if (onFieldDragStart) {
      onFieldDragStart(field);
    }
  };

  // Handle click (for accessibility)
  const handleClick = (field) => {
    if (disabled) return;
    
    if (onFieldClick) {
      onFieldClick(field);
    }
  };

  return (
    <div className="field-toolbox h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b">
        <Input
          placeholder="Search fields..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      {/* Field Categories */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No matching fields"
            className="py-8"
          />
        ) : (
          <Collapse 
            defaultActiveKey={['basic', 'choice']}
            ghost
            className="field-toolbox-collapse"
            items={filteredCategories.map(category => ({
              key: category.id,
              label: (
                <span className="flex items-center gap-2 font-medium">
                  {getIcon(category.icon)}
                  {category.name}
                </span>
              ),
              children: (
                <div className="grid gap-2">
                  {category.fields.map(field => (
                    <Tooltip
                      key={field.type}
                      title={field.description}
                      placement="right"
                    >
                      <div
                        className={`
                          field-item flex items-center gap-2 p-2 rounded border 
                          bg-white hover:bg-blue-50 hover:border-blue-300
                          transition-all cursor-grab
                          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        draggable={!disabled}
                        onDragStart={(e) => handleDragStart(e, field)}
                        onClick={() => handleClick(field)}
                      >
                        <span className="text-blue-500">
                          {getIcon(field.icon)}
                        </span>
                        <Text className="flex-1 text-sm">{field.label}</Text>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              ),
            }))}
          />
        )}
      </div>

      {/* Instructions */}
      <div className="p-3 border-t bg-gray-50">
        <Text type="secondary" className="text-xs">
          Drag fields to the canvas or click to add to selected step
        </Text>
      </div>

      <style>{`
        .field-toolbox-collapse .ant-collapse-header {
          padding: 8px 12px !important;
        }
        .field-toolbox-collapse .ant-collapse-content-box {
          padding: 0 12px 12px !important;
        }
        .field-item:active {
          cursor: grabbing;
        }
      `}</style>
    </div>
  );
};

export default FieldToolbox;
