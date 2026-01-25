/**
 * Form Canvas Component
 * The main workspace for building forms with steps and fields
 */

import { useState } from 'react';
import { 
  Card, 
  Button, 
  Empty, 
  Typography, 
  Tooltip, 
  Dropdown, 
  Modal,
  Input,
  Tag,
  Space
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  CopyOutlined,
  EditOutlined,
  MoreOutlined,
  HolderOutlined,
  SettingOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import * as Icons from '@ant-design/icons';
import { FIELD_CATEGORIES, WIDTH_OPTIONS } from '../constants/fieldTypes';

const { Text, Title } = Typography;

// Get icon for field type
const getFieldIcon = (fieldType) => {
  for (const category of FIELD_CATEGORIES) {
    const field = category.fields.find(f => f.type === fieldType);
    if (field) {
      const IconComponent = Icons[field.icon];
      return IconComponent ? <IconComponent /> : <Icons.QuestionOutlined />;
    }
  }
  return <Icons.QuestionOutlined />;
};

// Get label for field type
const getFieldTypeLabel = (fieldType) => {
  for (const category of FIELD_CATEGORIES) {
    const field = category.fields.find(f => f.type === fieldType);
    if (field) return field.label;
  }
  return fieldType;
};

// Field Item Component
const FieldItem = ({ 
  field, 
  isSelected, 
  onSelect, 
  onDelete, 
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop
}) => {
  const width = WIDTH_OPTIONS.find(w => w.value === field.width)?.label || 'Full Width';

  const menuItems = [
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: 'Duplicate',
      onClick: () => onDuplicate(field.id),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete',
      danger: true,
      onClick: () => onDelete(field.id),
    },
  ];

  return (
    <div
      className={`
        field-item group relative p-3 mb-2 rounded border-2 bg-white
        transition-all cursor-pointer
        ${isSelected 
          ? 'border-blue-500 ring-2 ring-blue-100' 
          : 'border-gray-200 hover:border-gray-300'
        }
      `}
      onClick={() => onSelect(field.id)}
      draggable
      onDragStart={(e) => onDragStart(e, field)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, field)}
    >
      {/* Drag Handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab">
        <HolderOutlined className="text-gray-400" />
      </div>

      {/* Field Content */}
      <div className="pl-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-blue-500">{getFieldIcon(field.field_type)}</span>
            <Text strong className="text-sm">{field.field_label}</Text>
            {field.is_required && <Tag color="red" className="text-xs">Required</Tag>}
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button 
                size="small" 
                type="text" 
                icon={<MoreOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{getFieldTypeLabel(field.field_type)}</span>
          <span>•</span>
          <span>{width}</span>
          {field.conditional_logic && Object.keys(field.conditional_logic).length > 0 && (
            <>
              <span>•</span>
              <Tooltip title="Has conditional logic">
                <EyeInvisibleOutlined />
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Step Component
const StepPanel = ({
  step,
  stepIndex,
  isSelected,
  selectedFieldId,
  onSelectStep,
  onSelectField,
  onUpdateStep,
  onDeleteStep,
  onAddField,
  onDeleteField,
  onDuplicateField,
  onReorderFields,
  collapsed,
  onToggleCollapse
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(step.title);

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== step.title) {
      onUpdateStep(step.id, { title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const stepMenuItems = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Edit Step Settings',
      onClick: () => onSelectStep(step.id, true),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete Step',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: 'Delete Step',
          content: `Are you sure you want to delete "${step.title}" and all its fields?`,
          okText: 'Delete',
          okType: 'danger',
          onOk: () => onDeleteStep(step.id),
        });
      },
    },
  ];

  // Handle field drag/drop
  const handleFieldDragStart = (e, field) => {
    e.dataTransfer.setData('fieldId', field.id);
    e.dataTransfer.setData('fromStepId', step.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFieldDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleFieldDrop = (e, targetField) => {
    e.preventDefault();
    const fieldId = parseInt(e.dataTransfer.getData('fieldId'));
    const fieldType = e.dataTransfer.getData('fieldType');
    
    if (fieldType) {
      // New field from toolbox
      onAddField(step.id, fieldType, targetField?.order_index);
    } else if (fieldId) {
      // Existing field being reordered
      const fromStepId = parseInt(e.dataTransfer.getData('fromStepId'));
      
      if (fromStepId === step.id) {
        // Reorder within same step
        const currentOrder = step.fields.map(f => f.id);
        const fromIndex = currentOrder.indexOf(fieldId);
        const toIndex = currentOrder.indexOf(targetField.id);
        
        if (fromIndex !== toIndex) {
          currentOrder.splice(fromIndex, 1);
          currentOrder.splice(toIndex, 0, fieldId);
          onReorderFields(step.id, currentOrder);
        }
      }
    }
  };

  // Handle drop on step (empty or end)
  const handleStepDrop = (e) => {
    e.preventDefault();
    const fieldType = e.dataTransfer.getData('fieldType');
    
    if (fieldType) {
      onAddField(step.id, fieldType);
    }
  };

  return (
    <Card
      className={`
        step-panel mb-4 
        ${isSelected ? 'ring-2 ring-blue-200' : ''}
      `}
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-normal">Step {stepIndex + 1}</span>
            {editingTitle ? (
              <Input
                size="small"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onPressEnter={handleSaveTitle}
                autoFocus
                style={{ width: 200 }}
              />
            ) : (
              <Text 
                strong 
                className="cursor-pointer hover:text-blue-500"
                onClick={() => setEditingTitle(true)}
              >
                {step.title}
              </Text>
            )}
          </div>
          
          <Space>
            <Button
              size="small"
              type="text"
              icon={collapsed ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => onToggleCollapse(step.id)}
            />
            <Dropdown menu={{ items: stepMenuItems }} trigger={['click']}>
              <Button size="small" type="text" icon={<SettingOutlined />} />
            </Dropdown>
          </Space>
        </div>
      }
      size="small"
      onClick={() => onSelectStep(step.id)}
      onDragOver={handleFieldDragOver}
      onDrop={handleStepDrop}
    >
      {!collapsed && (
        <>
          {step.description && (
            <Text type="secondary" className="block mb-3 text-sm">
              {step.description}
            </Text>
          )}

          {/* Fields */}
          {step.fields?.length > 0 ? (
            <div className="space-y-2">
              {step.fields
                .sort((a, b) => a.order_index - b.order_index)
                .map(field => (
                  <FieldItem
                    key={field.id}
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={onSelectField}
                    onDelete={onDeleteField}
                    onDuplicate={onDuplicateField}
                    onDragStart={handleFieldDragStart}
                    onDragOver={handleFieldDragOver}
                    onDrop={handleFieldDrop}
                  />
                ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Drop fields here"
              className="py-8 border-2 border-dashed border-gray-200 rounded bg-gray-50"
            />
          )}

          {/* Add Field Button */}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            className="mt-3"
            onClick={(e) => {
              e.stopPropagation();
              // This could open a field picker or just add a text field
            }}
          >
            Add Field
          </Button>
        </>
      )}
    </Card>
  );
};

// Main FormCanvas Component
const FormCanvas = ({
  steps = [],
  selectedStepId,
  selectedFieldId,
  onSelectStep,
  onSelectField,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
  onAddField,
  onDeleteField,
  onDuplicateField,
  onReorderFields,
}) => {
  const [collapsedSteps, setCollapsedSteps] = useState(new Set());

  const toggleCollapse = (stepId) => {
    setCollapsedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Handle drop on canvas (outside steps)
  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const fieldType = e.dataTransfer.getData('fieldType');
    
    if (fieldType && steps.length > 0) {
      // Add to first step if none selected
      const targetStepId = selectedStepId || steps[0].id;
      onAddField(targetStepId, fieldType);
    }
  };

  return (
    <div 
      className="form-canvas h-full overflow-y-auto p-4 bg-gray-100"
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      {steps.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center">
                <Title level={4} type="secondary">No steps yet</Title>
                <Text type="secondary">Add a step to start building your form</Text>
              </div>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddStep}>
              Add First Step
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          {steps
            .sort((a, b) => a.order_index - b.order_index)
            .map((step, index) => (
              <StepPanel
                key={step.id}
                step={step}
                stepIndex={index}
                isSelected={selectedStepId === step.id}
                selectedFieldId={selectedFieldId}
                onSelectStep={onSelectStep}
                onSelectField={onSelectField}
                onUpdateStep={onUpdateStep}
                onDeleteStep={onDeleteStep}
                onAddField={onAddField}
                onDeleteField={onDeleteField}
                onDuplicateField={onDuplicateField}
                onReorderFields={onReorderFields}
                collapsed={collapsedSteps.has(step.id)}
                onToggleCollapse={toggleCollapse}
              />
            ))}

          {/* Add Step Button */}
          <Button
            type="dashed"
            block
            size="large"
            icon={<PlusOutlined />}
            onClick={onAddStep}
            className="mt-2"
          >
            Add Step
          </Button>
        </>
      )}
    </div>
  );
};

export default FormCanvas;
