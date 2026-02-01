/**
 * Form Canvas Component
 * The main workspace for building forms with steps and fields
 * Supports inline editing for field labels, placeholders, and help text
 * Enhanced with smooth drag-and-drop reordering using @dnd-kit
 */

import { useState, useRef, useEffect } from 'react';
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
  Space,
  Row,
  Col
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
  EyeInvisibleOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons';
import * as Icons from '@ant-design/icons';
import { 
  DndContext, 
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FIELD_CATEGORIES, WIDTH_OPTIONS, FIELD_TYPES } from '../constants/fieldTypes';

const { Text, Title } = Typography;

// Get column props for builder - force full width on mobile/tablet for better UX
const getBuilderColProps = (width) => {
  const widthOption = WIDTH_OPTIONS.find(w => w.value === width);
  const span = widthOption?.span || 24;
  return {
    xs: 24, // Stack items on mobile for better touch targets and readability
    sm: 24, 
    md: span
  };
};

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

// Field Item Component with Inline Editing and Sortable DnD
const FieldItem = ({ 
  field, 
  isSelected, 
  onSelect, 
  onDelete, 
  onDuplicate,
  onUpdate
}) => {
  const [editingField, setEditingField] = useState(null); // 'label' | 'placeholder' | 'help_text' | null
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);
  const width = WIDTH_OPTIONS.find(w => w.value === field.width)?.label || 'Full Width';

  // Sortable hook for drag-and-drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: field.id,
    disabled: editingField !== null // Disable dragging while editing
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // Start inline editing
  const startEditing = (fieldName, currentValue, e) => {
    e?.stopPropagation();
    setEditingField(fieldName);
    setEditValue(currentValue || '');
  };

  // Save inline edit
  const saveEdit = () => {
    if (editingField && onUpdate) {
      const trimmedValue = editValue.trim();
      // Only update if value changed
      if (trimmedValue !== field[editingField]) {
        onUpdate(field.id, { [editingField]: trimmedValue || null });
      }
    }
    setEditingField(null);
    setEditValue('');
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Handle key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

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

  // Render field preview based on type
  const renderFieldPreview = () => {
    const fieldType = field.field_type;
    const placeholder = field.placeholder_text || 'Enter placeholder text...';
    
    // Common input style for preview
    const previewInputClass = `
      w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 
      text-gray-400 text-sm cursor-text hover:border-blue-300
      transition-colors
    `;

    // Placeholder click handler
    const handlePlaceholderClick = (e) => {
      e.stopPropagation();
      startEditing('placeholder_text', field.placeholder_text, e);
    };

    if (editingField === 'placeholder_text') {
      return (
        <Input
          ref={inputRef}
          size="small"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          placeholder="Enter placeholder text..."
          className="mt-2"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    switch (fieldType) {
      case FIELD_TYPES.TEXTAREA:
        return (
          <div 
            className={`${previewInputClass} h-16 mt-2`}
            onClick={handlePlaceholderClick}
          >
            {placeholder}
          </div>
        );
      
      case FIELD_TYPES.SELECT:
      case FIELD_TYPES.MULTISELECT:
        return (
          <div 
            className={`${previewInputClass} mt-2 flex items-center justify-between`}
            onClick={handlePlaceholderClick}
          >
            <span>{placeholder}</span>
            <Icons.DownOutlined className="text-gray-400 text-xs" />
          </div>
        );
      
      case FIELD_TYPES.CHECKBOX: {
        const checkboxOptions = (field.options || []).filter(opt => opt.value && opt.label);
        const displayOptions = checkboxOptions.length > 0 
          ? checkboxOptions 
          : [{ label: 'Option 1', value: 'option1' }, { label: 'Option 2', value: 'option2' }];
        return (
          <div className="mt-2 space-y-1">
            {displayOptions.slice(0, 3).map((opt, i) => (
              <div key={opt.value || i} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border border-gray-300 rounded" />
                <span>{opt.label}</span>
              </div>
            ))}
            {checkboxOptions.length > 3 && (
              <div className="text-xs text-gray-400">+{checkboxOptions.length - 3} more</div>
            )}
          </div>
        );
      }
      
      case FIELD_TYPES.RADIO: {
        const radioOptions = (field.options || []).filter(opt => opt.value && opt.label);
        const displayRadioOptions = radioOptions.length > 0 
          ? radioOptions 
          : [{ label: 'Option 1', value: 'option1' }, { label: 'Option 2', value: 'option2' }];
        return (
          <div className="mt-2 space-y-1">
            {displayRadioOptions.slice(0, 3).map((opt, i) => (
              <div key={opt.value || i} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border border-gray-300 rounded-full" />
                <span>{opt.label}</span>
              </div>
            ))}
            {radioOptions.length > 3 && (
              <div className="text-xs text-gray-400">+{radioOptions.length - 3} more</div>
            )}
          </div>
        );
      }

      case FIELD_TYPES.TOGGLE:
        return (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-10 h-5 bg-gray-200 rounded-full relative">
              <div className="w-4 h-4 bg-white rounded-full absolute left-0.5 top-0.5 shadow" />
            </div>
            <span className="text-sm text-gray-500">No</span>
          </div>
        );

      case FIELD_TYPES.DATE:
      case FIELD_TYPES.TIME:
      case FIELD_TYPES.DATETIME:
        return (
          <div 
            className={`${previewInputClass} mt-2 flex items-center justify-between`}
            onClick={handlePlaceholderClick}
          >
            <span>{placeholder}</span>
            <Icons.CalendarOutlined className="text-gray-400" />
          </div>
        );

      case FIELD_TYPES.FILE:
        return (
          <div className="mt-2 border-2 border-dashed border-gray-200 rounded-md p-4 text-center text-gray-400 text-sm">
            <Icons.UploadOutlined className="text-xl mb-1" />
            <div>Click or drag to upload</div>
          </div>
        );

      case FIELD_TYPES.SIGNATURE:
        return (
          <div className="mt-2 border border-gray-200 rounded-md p-4 h-20 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
            <Icons.EditOutlined className="mr-2" />
            Sign here
          </div>
        );

      case FIELD_TYPES.CONSENT: {
        // Get consent text from options
        const consentText = field.options?.consent_text 
          || (Array.isArray(field.options) && field.options[0]?.label)
          || 'I agree to the terms and conditions';
        return (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 mt-0.5 border-2 border-blue-400 rounded bg-white flex-shrink-0" />
              <span className="text-sm text-gray-700 leading-relaxed">{consentText}</span>
            </div>
          </div>
        );
      }

      default:
        // Text, Email, Phone, Number, URL, etc.
        return (
          <div 
            className={`${previewInputClass} mt-2`}
            onClick={handlePlaceholderClick}
          >
            {placeholder}
          </div>
        );
    }
  };

  return (
    <Col {...getBuilderColProps(field.width)} style={{ minWidth: 0 }}>
      <div
        ref={setNodeRef}
        style={style}
        className={`
          field-item group relative p-3 rounded-lg border-2 bg-white
          transition-all
          ${isSelected 
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm' 
            : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
          }
          ${isDragging ? 'z-50 shadow-lg' : ''}
        `}
        onClick={() => onSelect(field.id)}
        {...attributes}
      >
      {/* Drag Handle - Now Interactive for better Touch/Safari support */}
      <div 
        className="absolute left-1 top-3 z-10 p-1 cursor-grab active:cursor-grabbing opacity-30 group-hover:opacity-100 touch-none"
        {...listeners}
        onClick={(e) => e.stopPropagation()} // Prevent selecting field when dragging handle
      >
        <HolderOutlined className="text-gray-400 text-lg" />
      </div>

      {/* Actions Menu */}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <Button 
            size="small" 
            type="text" 
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>

      {/* Field Content - WYSIWYG Style */}
      <div className="pl-4 pr-8">
        {/* Label - Click to edit */}
        <div className="flex items-center gap-2 mb-1">
          {editingField === 'field_label' ? (
            <Input
              ref={inputRef}
              size="small"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              className="flex-1 font-medium"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Text 
              strong 
              className="cursor-text hover:bg-blue-50 px-1 py-0.5 rounded transition-colors"
              onClick={(e) => startEditing('field_label', field.field_label, e)}
            >
              {field.field_label}
            </Text>
          )}
          {field.is_required && <span className="text-red-500">*</span>}
          <Tag color="blue" className="text-xs ml-auto opacity-60">
            {getFieldTypeLabel(field.field_type)}
          </Tag>
        </div>

        {/* Field Preview */}
        {renderFieldPreview()}

        {/* Help Text - Click to edit/add */}
        <div className="mt-2">
          {editingField === 'help_text' ? (
            <Input
              ref={inputRef}
              size="small"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              placeholder="Add help text..."
              className="text-xs"
              onClick={(e) => e.stopPropagation()}
            />
          ) : field.help_text ? (
            <Text 
              type="secondary" 
              className="text-xs cursor-text hover:bg-blue-50 px-1 py-0.5 rounded block transition-colors"
              onClick={(e) => startEditing('help_text', field.help_text, e)}
            >
              {field.help_text}
            </Text>
          ) : (
            <Text 
              type="secondary" 
              className="text-xs cursor-text hover:bg-blue-50 px-1 py-0.5 rounded block transition-colors opacity-50 hover:opacity-100"
              onClick={(e) => startEditing('help_text', '', e)}
            >
              + Add help text
            </Text>
          )}
        </div>
      </div>
    </div>
    </Col>
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
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  onReorderFields,
  collapsed,
  onToggleCollapse
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(step.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(step.description || '');
  const [activeId, setActiveId] = useState(null);

  // Setup sensors for drag and drop - Robust config for Safari & Touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const fields = step.fields.sort((a, b) => a.order_index - b.order_index);
      const oldIndex = fields.findIndex(f => f.id === active.id);
      const newIndex = fields.findIndex(f => f.id === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(fields, oldIndex, newIndex).map(f => f.id);
        onReorderFields(step.id, newOrder);
      }
    }
    
    setActiveId(null);
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== step.title) {
      onUpdateStep(step.id, { title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleSaveDescription = () => {
    if (descriptionValue !== step.description) {
      onUpdateStep(step.id, { description: descriptionValue.trim() || null });
    }
    setEditingDescription(false);
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

  return (
    <Card
      className={`
        step-panel mb-4 
        ${isSelected ? 'ring-2 ring-blue-200' : ''}
      `}
      style={{ width: '100%' }}
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
    >
      {!collapsed && (
        <>
          {/* Description - Click to edit */}
          {editingDescription ? (
            <Input
              size="small"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              onBlur={handleSaveDescription}
              onPressEnter={handleSaveDescription}
              onKeyDown={(e) => e.key === 'Escape' && setEditingDescription(false)}
              placeholder="Add step description..."
              className="mb-3"
              autoFocus
            />
          ) : step.description ? (
            <Text 
              type="secondary" 
              className="block mb-3 text-sm cursor-text hover:bg-blue-50 px-1 py-0.5 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setDescriptionValue(step.description);
                setEditingDescription(true);
              }}
            >
              {step.description}
            </Text>
          ) : (
            <Text 
              type="secondary" 
              className="block mb-3 text-xs cursor-text hover:bg-blue-50 px-1 py-0.5 rounded transition-colors opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setDescriptionValue('');
                setEditingDescription(true);
              }}
            >
              + Add step description
            </Text>
          )}

          {/* Fields */}
          {step.fields?.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={step.fields.map(f => f.id)}
                strategy={rectSortingStrategy}
              >
                <Row gutter={[16, 16]} style={{ width: '100%', margin: 0 }}>
                  {step.fields
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(field => (
                      <FieldItem
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onSelect={onSelectField}
                        onUpdate={onUpdateField}
                        onDelete={onDeleteField}
                        onDuplicate={onDuplicateField}
                      />
                    ))}
                </Row>
              </SortableContext>
              <DragOverlay>
                {activeId ? (
                  <div className="field-item p-3 rounded-lg border-2 border-blue-500 bg-white shadow-lg opacity-90">
                    <HolderOutlined className="text-gray-400 mr-2" />
                    <Text strong>
                      {step.fields.find(f => f.id === activeId)?.field_label || 'Field'}
                    </Text>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
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
  onUpdateField,
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
      style={{ width: '100%', minWidth: 0 }}
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
                onUpdateField={onUpdateField}
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
