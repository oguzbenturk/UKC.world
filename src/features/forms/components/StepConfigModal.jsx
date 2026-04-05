/**
 * Step Configuration Modal
 * Modal for editing step settings including skip logic
 */

import { useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Switch, 
  Select,
  Button,
  Collapse,
  Typography
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { CONDITION_OPERATORS } from '../constants/fieldTypes';

const { TextArea } = Input;
const { Panel } = Collapse;
const { Text } = Typography;

// Generate unique ID for conditions
let conditionIdCounter = 0;
const generateConditionId = () => `skip-${Date.now()}-${++conditionIdCounter}`;

// Skip Logic Editor Component
const SkipLogicEditor = ({ value = {}, onChange, availableFields = [] }) => {
  const conditions = value.conditions || [];
  const enabled = value.enabled || false;

  const handleAddCondition = () => {
    const newConditions = [
      ...conditions,
      { id: generateConditionId(), field: '', operator: 'equals', value: '' }
    ];
    onChange({ ...value, conditions: newConditions, enabled: true });
  };

  const handleRemoveCondition = (conditionId) => {
    const newConditions = conditions.filter((c) => c.id !== conditionId);
    onChange({ 
      ...value, 
      conditions: newConditions, 
      enabled: newConditions.length > 0 
    });
  };

  const handleConditionChange = (conditionId, field, val) => {
    const newConditions = conditions.map((c) =>
      c.id === conditionId ? { ...c, [field]: val } : c
    );
    onChange({ ...value, conditions: newConditions });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text type="secondary">Skip this step when conditions are met</Text>
        <Switch 
          checked={enabled}
          onChange={(checked) => {
            if (checked && conditions.length === 0) {
              handleAddCondition();
            } else {
              onChange({ ...value, enabled: checked });
            }
          }}
        />
      </div>

      {enabled && (
        <>
          {conditions.map((condition) => (
            <div key={condition.id} className="p-2 bg-gray-50 rounded border space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  size="small"
                  placeholder="Select field"
                  value={condition.field}
                  onChange={(val) => handleConditionChange(condition.id, 'field', val)}
                  style={{ flex: 1 }}
                  options={availableFields.map(f => ({
                    value: f.field_name,
                    label: f.field_label,
                  }))}
                />
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<MinusCircleOutlined />}
                  onClick={() => handleRemoveCondition(condition.id)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Select
                  size="small"
                  value={condition.operator}
                  onChange={(val) => handleConditionChange(condition.id, 'operator', val)}
                  style={{ width: 140 }}
                  options={CONDITION_OPERATORS}
                />
                {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                  <Input
                    size="small"
                    placeholder="Value"
                    value={condition.value}
                    onChange={(e) => handleConditionChange(condition.id, 'value', e.target.value)}
                    style={{ flex: 1 }}
                  />
                )}
              </div>
            </div>
          ))}

          <Button
            type="dashed"
            size="small"
            block
            icon={<PlusOutlined />}
            onClick={handleAddCondition}
          >
            Add Condition
          </Button>

          {conditions.length > 1 && (
            <Select
              size="small"
              value={value.logic || 'and'}
              onChange={(val) => onChange({ ...value, logic: val })}
              style={{ width: '100%' }}
              options={[
                { value: 'and', label: 'ALL conditions must match (AND)' },
                { value: 'or', label: 'ANY condition must match (OR)' },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};

const StepConfigModal = ({ 
  visible, 
  step, 
  allFields = [],
  onSave, 
  onCancel 
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (step && visible) {
      form.setFieldsValue({
        title: step.title,
        description: step.description,
        show_progress: step.show_progress ?? true,
        completion_message: step.completion_message,
        skip_logic: step.skip_logic || { enabled: false, conditions: [], logic: 'and' },
      });
    }
  }, [step, visible, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSave(step.id, values);
    } catch {
      // Validation failed - form will show errors
    }
  };

  // Get fields from previous steps for skip logic
  const previousFields = allFields.filter(_f => {
    // Fields should be from steps before the current step
    // For now, include all fields for simplicity
    return true;
  });

  return (
    <Modal
      title="Step Settings"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Save"
      width={550}
    >
      <Form
        form={form}
        layout="vertical"
        className="mt-4"
      >
        <Form.Item
          name="title"
          label="Step Title"
          rules={[{ required: true, message: 'Please enter a step title' }]}
        >
          <Input placeholder="e.g., Personal Information" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          extra="Shown to users below the step title"
        >
          <TextArea 
            rows={2} 
            placeholder="Optional description for this step..."
          />
        </Form.Item>

        <Form.Item
          name="show_progress"
          label="Show in Progress Bar"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="completion_message"
          label="Completion Message"
          extra="Shown when user completes this step (optional)"
        >
          <TextArea 
            rows={2} 
            placeholder="e.g., Great! Now let's continue to payment..."
          />
        </Form.Item>

        <Collapse ghost className="mt-4">
          <Panel header="Skip Logic (Advanced)" key="skip-logic">
            <Form.Item name="skip_logic" noStyle>
              <SkipLogicEditor availableFields={previousFields} />
            </Form.Item>
          </Panel>
        </Collapse>
      </Form>
    </Modal>
  );
};

export default StepConfigModal;
