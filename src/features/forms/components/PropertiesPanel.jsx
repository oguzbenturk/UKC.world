/**
 * Properties Panel Component
 * Configuration sidebar for editing selected field properties
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Form, 
  Input, 
  Select, 
  Switch, 
  InputNumber,
  Button,
  Collapse,
  Typography,
  Empty,
  Space,
  Tag,
  Tooltip,
  Modal,
  message
} from 'antd';
import { 
  DeleteOutlined, 
  PlusOutlined, 
  MinusCircleOutlined,
  QuestionCircleOutlined,
  DragOutlined,
  UploadOutlined,
  DownloadOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import { 
  FIELD_TYPES, 
  WIDTH_OPTIONS, 
  CONDITION_OPERATORS,
  FIELD_CATEGORIES 
} from '../constants/fieldTypes';
import RichHTMLEditor from './RichHTMLEditor';

const { Text } = Typography;
const { TextArea } = Input;

// Get field type info
const getFieldTypeInfo = (fieldType) => {
  for (const category of FIELD_CATEGORIES) {
    const field = category.fields.find(f => f.type === fieldType);
    if (field) return field;
  }
  return { label: fieldType, description: '' };
};

// Check if field type has options
const hasOptions = (fieldType) => {
  return [
    FIELD_TYPES.SELECT,
    FIELD_TYPES.MULTISELECT,
    FIELD_TYPES.RADIO,
    FIELD_TYPES.CHECKBOX,
  ].includes(fieldType);
};

// Options Editor Component
const OptionsEditor = ({ value = [], onChange }) => {
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [csvText, setCsvText] = useState('');

  const handleAdd = () => {
    const newOption = { 
      value: `option${value.length + 1}`, 
      label: `Option ${value.length + 1}` 
    };
    onChange([...value, newOption]);
  };

  const handleRemove = (index) => {
    const newOptions = value.filter((_, i) => i !== index);
    onChange(newOptions);
  };

  const handleChange = (index, field, val) => {
    const newOptions = value.map((opt, i) => 
      i === index ? { ...opt, [field]: val } : opt
    );
    onChange(newOptions);
  };

  // Handle CSV import
  const handleImportCSV = () => {
    if (!csvText.trim()) {
      message.warning('Please enter CSV data');
      return;
    }

    try {
      const lines = csvText.trim().split('\n');
      const newOptions = [];

      for (const line of lines) {
        // Support both "label,value" and "value" formats
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length >= 2) {
          // Format: label,value
          newOptions.push({
            label: parts[0],
            value: parts[1]
          });
        } else if (parts.length === 1 && parts[0]) {
          // Format: single value (use as both label and value)
          const cleanValue = parts[0].replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
          newOptions.push({
            label: parts[0],
            value: cleanValue
          });
        }
      }

      if (newOptions.length === 0) {
        message.error('No valid options found in CSV data');
        return;
      }

      onChange(newOptions);
      message.success(`Imported ${newOptions.length} options`);
      setImportModalVisible(false);
      setCsvText('');
    } catch (err) {
      message.error(`Failed to parse CSV data: ${err.message}`);
    }
  };

  // Export current options as CSV
  const handleExportCSV = () => {
    const csv = value.map(opt => `${opt.label},${opt.value}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'options.csv';
    link.click();
    URL.revokeObjectURL(url);
    message.success('Options exported');
  };

  // Count incomplete options
  const incompleteCount = value.filter(opt => !opt.value || !opt.label).length;

  return (
    <div className="space-y-2">
      {incompleteCount > 0 && (
        <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
          ⚠️ {incompleteCount} option{incompleteCount > 1 ? 's' : ''} incomplete - fill in both Label and Value
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <Button
          type="dashed"
          size="small"
          icon={<UploadOutlined />}
          onClick={() => setImportModalVisible(true)}
        >
          Import CSV
        </Button>
        {value.length > 0 && (
          <Button
            type="dashed"
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
        )}
      </div>

      {value.map((option, index) => {
        const isIncomplete = !option.value || !option.label;
        return (
          <div 
            key={`option-${option.value || index}`} 
            className={`flex items-center gap-2 ${isIncomplete ? 'bg-orange-50 p-1 rounded border border-orange-200' : ''}`}
          >
            <DragOutlined className="text-gray-400 cursor-grab" />
            <Input
              size="small"
              placeholder="Label"
              value={option.label}
              onChange={(e) => handleChange(index, 'label', e.target.value)}
              className="flex-1"
              status={!option.label ? 'warning' : undefined}
            />
            <Input
              size="small"
              placeholder="Value"
              value={option.value}
              onChange={(e) => handleChange(index, 'value', e.target.value)}
              style={{ width: 100 }}
              status={!option.value ? 'warning' : undefined}
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<MinusCircleOutlined />}
              onClick={() => handleRemove(index)}
            />
          </div>
        );
      })}
      <Button
        type="dashed"
        size="small"
        block
        icon={<PlusOutlined />}
        onClick={handleAdd}
      >
        Add Option
      </Button>

      {/* CSV Import Modal */}
      <Modal
        title="Import Options from CSV"
        open={importModalVisible}
        onOk={handleImportCSV}
        onCancel={() => {
          setImportModalVisible(false);
          setCsvText('');
        }}
        width={600}
      >
        <div className="space-y-3">
          <div>
            <Text strong>CSV Format:</Text>
            <div className="bg-gray-50 p-3 rounded mt-2 text-sm font-mono">
              Label 1,value1<br />
              Label 2,value2<br />
              Label 3,value3
            </div>
            <Text type="secondary" className="text-xs mt-1">
              Or use single values (one per line) which will be used as both label and value.
            </Text>
          </div>
          <TextArea
            rows={8}
            placeholder="Paste CSV data here..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Text type="secondary" className="text-xs">
            Note: Importing will replace all existing options.
          </Text>
        </div>
      </Modal>
    </div>
  );
};

// Generate unique ID for conditions
let conditionIdCounter = 0;
const generateConditionId = () => `cond-${Date.now()}-${++conditionIdCounter}`;

// Helper: Evaluate a single condition
const evaluateCondition = (condition, values) => {
  const fieldValue = values[condition.field];
  const conditionValue = condition.value;
  const fieldStr = String(fieldValue || '');
  const condStr = String(conditionValue);

  const operatorMap = {
    equals: () => String(fieldValue) === condStr,
    not_equals: () => String(fieldValue) !== condStr,
    contains: () => fieldStr.includes(conditionValue),
    not_contains: () => !fieldStr.includes(conditionValue),
    starts_with: () => fieldStr.startsWith(conditionValue),
    ends_with: () => fieldStr.endsWith(conditionValue),
    greater_than: () => Number(fieldValue) > Number(conditionValue),
    less_than: () => Number(fieldValue) < Number(conditionValue),
    is_empty: () => !fieldValue || fieldStr.trim() === '',
    is_not_empty: () => fieldValue && fieldStr.trim() !== ''
  };

  const evaluator = operatorMap[condition.operator];
  return evaluator ? evaluator() : false;
};

// Helper: Evaluate a group of conditions
const evaluateGroup = (group, values) => {
  const results = group.conditions.map(condition => evaluateCondition(condition, values));
  return group.logic === 'and' ? results.every(r => r) : results.some(r => r);
};

// Helper: Migrate legacy flat structure to grouped
const migrateToGrouped = (value, onChange) => {
  const conditions = value.conditions || [];
  const groups = value.groups || [];
  
  if (conditions.length > 0 && groups.length === 0) {
    const newGroup = {
      id: generateConditionId(),
      logic: value.logic || 'and',
      conditions: conditions
    };
    onChange({
      action: value.action || 'show',
      groups: [newGroup],
      groupLogic: 'and',
      conditions: [] // Clear legacy
    });
    return true;
  }
  return false;
};

// Conditional Logic Editor - Main Component
// eslint-disable-next-line complexity
const ConditionalLogicEditor = ({ value = {}, onChange, availableFields = [] }) => {
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testValues, setTestValues] = useState({});
  const [testResult, setTestResult] = useState(null);

  // Support both flat conditions (legacy) and grouped structure
  const groups = value.groups || [];
  const conditions = value.conditions || [];
  const action = value.action || 'show';
  const groupLogic = value.groupLogic || 'and';

  // Add a new condition group
  const handleAddGroup = () => {
    migrateToGrouped(value, onChange);
    const newGroup = {
      id: generateConditionId(),
      logic: 'and',
      conditions: [{ id: generateConditionId(), field: '', operator: 'equals', value: '' }]
    };
    onChange({
      ...value,
      groups: [...(value.groups || []), newGroup],
      groupLogic: value.groupLogic || 'and'
    });
  };

  // Remove a condition group
  const handleRemoveGroup = (groupId) => {
    const newGroups = (value.groups || []).filter(g => g.id !== groupId);
    onChange({ ...value, groups: newGroups });
  };

  // Update group logic (AND/OR within group)
  const handleGroupLogicChange = (groupId, logic) => {
    const newGroups = (value.groups || []).map(g =>
      g.id === groupId ? { ...g, logic } : g
    );
    onChange({ ...value, groups: newGroups });
  };

  // Legacy: Add condition to flat structure
  const handleAddCondition = () => {
    const newConditions = [
      ...conditions,
      { id: generateConditionId(), field: '', operator: 'equals', value: '' }
    ];
    onChange({ ...value, conditions: newConditions });
  };

  // Add condition to a specific group
  const handleAddConditionToGroup = (groupId) => {
    const newGroups = (value.groups || []).map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: [
            ...g.conditions,
            { id: generateConditionId(), field: '', operator: 'equals', value: '' }
          ]
        };
      }
      return g;
    });
    onChange({ ...value, groups: newGroups });
  };

  // Legacy: Remove condition from flat structure
  const handleRemoveCondition = (conditionId) => {
    const newConditions = conditions.filter((c) => c.id !== conditionId);
    onChange({ ...value, conditions: newConditions });
  };

  // Remove condition from a specific group
  const handleRemoveConditionFromGroup = (groupId, conditionId) => {
    const newGroups = (value.groups || []).map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: g.conditions.filter(c => c.id !== conditionId)
        };
      }
      return g;
    }).filter(g => g.conditions.length > 0); // Remove empty groups
    onChange({ ...value, groups: newGroups });
  };

  // Legacy: Update condition in flat structure
  const handleConditionChange = (conditionId, field, val) => {
    const newConditions = conditions.map((c) =>
      c.id === conditionId ? { ...c, [field]: val } : c
    );
    onChange({ ...value, conditions: newConditions });
  };

  // Update condition in a specific group
  const handleConditionChangeInGroup = (groupId, conditionId, field, val) => {
    const newGroups = (value.groups || []).map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: g.conditions.map(c =>
            c.id === conditionId ? { ...c, [field]: val } : c
          )
        };
      }
      return g;
    });
    onChange({ ...value, groups: newGroups });
  };

  // Test the conditional logic
  const handleTestConditions = () => {
    let finalResult;
    let detailedResults;

    // Handle grouped structure
    if (groups.length > 0) {
      const groupResults = groups.map(group => ({
        group,
        groupResult: evaluateGroup(group, testValues),
        conditionResults: group.conditions.map(condition => ({
          condition,
          result: evaluateCondition(condition, testValues)
        }))
      }));

      finalResult = groupLogic === 'and'
        ? groupResults.every(gr => gr.groupResult)
        : groupResults.some(gr => gr.groupResult);

      detailedResults = {
        type: 'grouped',
        groupLogic,
        groupResults
      };
    } 
    // Handle legacy flat structure
    else {
      const logic = value.logic || 'and';
      const results = conditions.map(condition => ({
        condition,
        result: evaluateCondition(condition, testValues)
      }));

      finalResult = logic === 'and'
        ? results.every(r => r.result)
        : results.some(r => r.result);

      detailedResults = {
        type: 'flat',
        logic,
        conditionResults: results
      };
    }

    setTestResult({
      action,
      finalResult,
      ...detailedResults
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select
          size="small"
          value={action}
          onChange={(val) => onChange({ ...value, action: val })}
          style={{ flex: 1 }}
          options={[
            { value: 'show', label: 'Show this field when...' },
            { value: 'hide', label: 'Hide this field when...' },
            { value: 'require', label: 'Make required when...' },
          ]}
        />
        {(conditions.length > 0 || groups.length > 0) && (
          <Tooltip title="Test with sample values">
            <Button
              type="dashed"
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => {
                setTestModalVisible(true);
                // Initialize test values with field names from all conditions
                const initialValues = {};
                
                // From flat conditions (legacy)
                conditions.forEach(c => {
                  if (c.field && !testValues[c.field]) {
                    initialValues[c.field] = '';
                  }
                });
                
                // From grouped conditions
                groups.forEach(group => {
                  group.conditions.forEach(c => {
                    if (c.field && !testValues[c.field]) {
                      initialValues[c.field] = '';
                    }
                  });
                });
                
                setTestValues(prev => ({ ...prev, ...initialValues }));
              }}
            >
              Test
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Grouped Conditions */}
      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-2">
              {/* Group Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-700">
                  Group {groupIndex + 1}
                </span>
                <div className="flex gap-2">
                  <Select
                    size="small"
                    value={group.logic}
                    onChange={(val) => handleGroupLogicChange(group.id, val)}
                    style={{ width: 80 }}
                    options={[
                      { value: 'and', label: 'AND' },
                      { value: 'or', label: 'OR' },
                    ]}
                  />
                  {groups.length > 1 && (
                    <Tooltip title="Remove group">
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveGroup(group.id)}
                      />
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Conditions in Group */}
              {group.conditions.map((condition) => (
                <div key={condition.id} className="p-2 bg-white rounded border border-blue-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      size="small"
                      placeholder="Select field"
                      value={condition.field}
                      onChange={(val) => handleConditionChangeInGroup(group.id, condition.id, 'field', val)}
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
                      onClick={() => handleRemoveConditionFromGroup(group.id, condition.id)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      size="small"
                      value={condition.operator}
                      onChange={(val) => handleConditionChangeInGroup(group.id, condition.id, 'operator', val)}
                      style={{ width: 140 }}
                      options={CONDITION_OPERATORS}
                    />
                    {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                      <Input
                        size="small"
                        placeholder="Value"
                        value={condition.value}
                        onChange={(e) => handleConditionChangeInGroup(group.id, condition.id, 'value', e.target.value)}
                        style={{ flex: 1 }}
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* Add Condition to Group */}
              <Button
                type="dashed"
                size="small"
                block
                icon={<PlusOutlined />}
                onClick={() => handleAddConditionToGroup(group.id)}
                className="border-blue-300 text-blue-600 hover:border-blue-400 hover:text-blue-700"
              >
                Add Condition to Group
              </Button>
            </div>
          ))}

          {/* Group Logic (AND/OR between groups) */}
          {groups.length > 1 && (
            <div className="flex items-center justify-center">
              <Select
                size="small"
                value={groupLogic}
                onChange={(val) => onChange({ ...value, groupLogic: val })}
                style={{ width: 200 }}
                options={[
                  { value: 'and', label: 'ALL groups must match (AND)' },
                  { value: 'or', label: 'ANY group must match (OR)' },
                ]}
              />
            </div>
          )}

          {/* Add Group */}
          <Button
            type="primary"
            size="small"
            block
            icon={<PlusOutlined />}
            onClick={handleAddGroup}
            ghost
          >
            Add Condition Group
          </Button>
        </div>
      )}

      {/* Legacy Flat Conditions (for backward compatibility) */}
      {conditions.length > 0 && groups.length === 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <Text type="secondary" className="text-xs">
              Legacy mode - Consider upgrading to grouped conditions
            </Text>
            <Button
              type="link"
              size="small"
              onClick={() => {
                migrateToGrouped();
                message.success('Converted to grouped conditions');
              }}
            >
              Upgrade
            </Button>
          </div>

          {conditions.map((condition) => (
            <div key={condition.id || `temp-${condition.field}`} className="p-2 bg-gray-50 rounded border space-y-2">
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
        </div>
      )}

      {/* Initial State - No Conditions */}
      {conditions.length === 0 && groups.length === 0 && (
        <Button
          type="dashed"
          size="small"
          block
          icon={<PlusOutlined />}
          onClick={handleAddGroup}
        >
          Add First Condition Group
        </Button>
      )}

      {/* Test Conditions Modal */}
      <Modal
        title={
          <span>
            <ExperimentOutlined className="mr-2" />
            Test Conditional Logic
          </span>
        }
        open={testModalVisible}
        onOk={handleTestConditions}
        onCancel={() => {
          setTestModalVisible(false);
          setTestResult(null);
        }}
        width={700}
        okText="Run Test"
      >
        <div className="space-y-4">
          <div>
            <Text strong>Enter test values for fields:</Text>
            <div className="space-y-2 mt-2">
              {/* Collect all unique fields from both flat and grouped conditions */}
              {(() => {
                const allConditions = [...conditions];
                groups.forEach(group => {
                  group.conditions.forEach(c => allConditions.push(c));
                });
                
                const uniqueFields = [...new Set(allConditions.map(c => c.field).filter(Boolean))];
                
                return uniqueFields.map((fieldName) => {
                  const field = availableFields.find(f => f.field_name === fieldName);
                  return (
                    <div key={fieldName}>
                      <Text className="text-sm">{field?.field_label || fieldName}:</Text>
                      <Input
                        size="small"
                        placeholder={`Enter value for ${field?.field_label || fieldName}`}
                        value={testValues[fieldName] || ''}
                        onChange={(e) => setTestValues(prev => ({
                          ...prev,
                          [fieldName]: e.target.value
                        }))}
                        className="mt-1"
                      />
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {testResult && (
            <div className={`p-4 rounded ${testResult.finalResult ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <Text strong className={testResult.finalResult ? 'text-green-700' : 'text-red-700'}>
                Result: Field will be {testResult.action}n {testResult.finalResult ? '✓' : '✗'}
              </Text>
              
              {/* Grouped Results */}
              {testResult.type === 'grouped' && (
                <div className="mt-3 space-y-3">
                  <Text className="text-sm font-medium">
                    Group Logic: {testResult.groupLogic.toUpperCase()}
                  </Text>
                  {testResult.groupResults.map((groupResult, index) => (
                    <div 
                      key={groupResult.group.id} 
                      className={`p-3 rounded border-2 ${
                        groupResult.groupResult 
                          ? 'bg-green-50/50 border-green-300' 
                          : 'bg-red-50/50 border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={groupResult.groupResult ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          {groupResult.groupResult ? '✓' : '✗'}
                        </span>
                        <Text strong className="text-sm">
                          Group {index + 1} ({groupResult.group.logic.toUpperCase()})
                        </Text>
                      </div>
                      <div className="space-y-1 ml-6">
                        {groupResult.conditionResults.map((result) => {
                          const field = availableFields.find(f => f.field_name === result.condition.field);
                          return (
                            <div key={`test-${result.condition.id}-${result.condition.field}`} className="text-sm flex items-center gap-2">
                              <span className={result.result ? 'text-green-600' : 'text-red-600'}>
                                {result.result ? '✓' : '✗'}
                              </span>
                              <span className="text-gray-700">
                                {field?.field_label || result.condition.field} {result.condition.operator} "{result.condition.value}"
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Flat Results (Legacy) */}
              {testResult.type === 'flat' && (
                <div className="mt-3 space-y-2">
                  <Text className="text-sm font-medium">Condition Results ({testResult.logic.toUpperCase()}):</Text>
                  {testResult.conditionResults.map((result) => {
                    const field = availableFields.find(f => f.field_name === result.condition.field);
                    return (
                      <div key={`test-${result.condition.id}-${result.condition.field}`} className="text-sm flex items-center gap-2">
                        <span className={result.result ? 'text-green-600' : 'text-red-600'}>
                          {result.result ? '✓' : '✗'}
                        </span>
                        <span>
                          {field?.field_label || result.condition.field} {result.condition.operator} "{result.condition.value}"
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

// Main Properties Panel
const PropertiesPanel = ({ 
  field, 
  allFields = [],
  onUpdate, 
  onDelete,
  onDuplicate: _onDuplicate 
}) => {
  const [form] = Form.useForm();

  // Update form when field changes
  useEffect(() => {
    if (field) {
      form.setFieldsValue({
        field_label: field.field_label,
        field_name: field.field_name,
        placeholder_text: field.placeholder_text,
        help_text: field.help_text,
        default_value: field.default_value,
        is_required: field.is_required,
        is_readonly: field.is_readonly,
        width: field.width || 'full',
        validation_rules: field.validation_rules || {},
        options: field.options || [],
        conditional_logic: field.conditional_logic || {},
      });
    }
  }, [field, form]);

  // Debounce ref for rich text updates
  const updateTimeoutRef = useRef(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Handle form changes - for most fields, defer to blur
  // But for complex editors like RichHTMLEditor, save with debounce
  const handleValuesChange = (changedValues, _allValues) => {
    // If default_value changed (from RichHTMLEditor), save with debounce
    if (changedValues.default_value !== undefined && field && onUpdate) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      const targetId = field.id;
      const values = { default_value: changedValues.default_value };
      
      updateTimeoutRef.current = setTimeout(() => {
        onUpdate(targetId, values);
      }, 1000); // 1s debounce to prevent flooding API from Safari
    }
  };

  // Handle field blur to save all other changes
  const handleFieldBlur = () => {
    if (field && onUpdate) {
      const values = form.getFieldsValue();
      // Don't include default_value as it's saved via onChange for RichHTMLEditor
      const { default_value, ...otherValues } = values;
      if (Object.keys(otherValues).length > 0) {
        onUpdate(field.id, otherValues);
      }
    }
  };

  // Get other fields for conditional logic (exclude current field)
  const otherFields = allFields.filter(f => f.id !== field?.id);

  if (!field) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div className="text-center">
              <Text type="secondary">Select a field to edit its properties</Text>
            </div>
          }
        />
      </div>
    );
  }

  const fieldTypeInfo = getFieldTypeInfo(field.field_type);

  return (
    <div className="properties-panel h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <Tag color="blue">{fieldTypeInfo.label}</Tag>
            <Text strong className="ml-2">{field.field_label}</Text>
          </div>
          <Space>
            <Tooltip title="Delete field">
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => onDelete(field.id)}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3">
        <Form
          form={form}
          layout="vertical"
          size="small"
          onValuesChange={handleValuesChange}
          onBlur={handleFieldBlur}
          className="properties-form"
        >
          <style>
            {`
              .properties-form .ant-form-item-label > label {
                white-space: normal !important;
                word-break: break-word !important;
                display: block !important;
                width: 100% !important;
                min-width: 0 !important;
              }
              .properties-form .ant-form-item {
                margin-bottom: 16px;
              }
              .properties-form .ant-form-item-label {
                padding-bottom: 4px;
              }
            `}
          </style>
          <Collapse 
            defaultActiveKey={['basic', 'appearance']} 
            ghost
            items={[
              // Basic Settings
              {
                key: 'basic',
                label: 'Basic Settings',
                children: (
                  <>
                    <Form.Item
                      label="Label"
                      name="field_label"
                      rules={[{ required: true, message: 'Label is required' }]}
                    >
                      <Input placeholder="Enter field label" />
                    </Form.Item>

                    <Form.Item
                      label={
                        <span>
                          Field Name
                          <Tooltip title="Unique identifier used in submissions">
                            <QuestionCircleOutlined className="ml-1 text-gray-400" />
                          </Tooltip>
                        </span>
                      }
                      name="field_name"
                    >
                      <Input placeholder="auto_generated_name" />
                    </Form.Item>

                    <Form.Item
                      label="Placeholder"
                      name="placeholder_text"
                    >
                      <Input placeholder="Enter placeholder text" />
                    </Form.Item>

                    <Form.Item
                      label="Help Text"
                      name="help_text"
                    >
                      <TextArea rows={2} placeholder="Optional help text shown below field" />
                    </Form.Item>

                    {/* Rich HTML Editor for Paragraph fields */}
                    {field.field_type === FIELD_TYPES.PARAGRAPH || field.field_type === FIELD_TYPES.SECTION_HEADER ? (
                      <Form.Item
                        label="Content (HTML)"
                        name="default_value"
                        tooltip="Use the visual editor to create styled content easily"
                      >
                        <RichHTMLEditor />
                      </Form.Item>
                    ) : (
                      <Form.Item
                        label="Default Value"
                        name="default_value"
                      >
                        <Input placeholder="Pre-filled value" />
                      </Form.Item>
                    )}

                    <div className="flex gap-4">
                      <Form.Item
                        name="is_required"
                        valuePropName="checked"
                        className="mb-0"
                      >
                        <Switch checkedChildren="Required" unCheckedChildren="Optional" />
                      </Form.Item>

                      <Form.Item
                        name="is_readonly"
                        valuePropName="checked"
                        className="mb-0"
                      >
                        <Switch checkedChildren="Read-only" unCheckedChildren="Editable" />
                      </Form.Item>
                    </div>
                  </>
                )
              },
              // Appearance
              {
                key: 'appearance',
                label: 'Appearance',
                children: (
                  <Form.Item
                    label="Field Width"
                    name="width"
                  >
                    <Select
                      options={WIDTH_OPTIONS.map(w => ({
                        value: w.value,
                        label: w.label,
                      }))}
                    />
                  </Form.Item>
                )
              },
              // Options (conditionally included)
              ...(hasOptions(field.field_type) ? [{
                key: 'options',
                label: 'Options',
                children: (
                  <Form.Item name="options">
                    <OptionsEditor />
                  </Form.Item>
                )
              }] : []),
              // Consent Settings (conditionally included)
              ...(field.field_type === FIELD_TYPES.CONSENT ? [{
                key: 'consent',
                label: 'Consent Settings',
                children: (
                  <>
                    <Form.Item
                      label="Consent Text"
                      name={['options', 'consent_text']}
                      tooltip="The text shown next to the checkbox that users must agree to"
                    >
                      <TextArea 
                        rows={3} 
                        placeholder="I confirm that all information provided is accurate and complete..."
                      />
                    </Form.Item>
                    <Form.Item
                      label="Terms Link (optional)"
                      name={['options', 'terms_link']}
                    >
                      <Input placeholder="https://example.com/terms" />
                    </Form.Item>
                    <Form.Item
                      label="Privacy Link (optional)"
                      name={['options', 'privacy_link']}
                    >
                      <Input placeholder="https://example.com/privacy" />
                    </Form.Item>
                  </>
                )
              }] : []),
              // Validation
              {
                key: 'validation',
                label: 'Validation',
                children: (
                  <>
                    {[FIELD_TYPES.TEXT, FIELD_TYPES.TEXTAREA].includes(field.field_type) && (
                      <>
                        <Form.Item
                          label="Minimum Length"
                          name={['validation_rules', 'min_length']}
                        >
                          <InputNumber min={0} className="w-full" />
                        </Form.Item>
                        <Form.Item
                          label="Maximum Length"
                          name={['validation_rules', 'max_length']}
                        >
                          <InputNumber min={0} className="w-full" />
                        </Form.Item>
                      </>
                    )}

                    {field.field_type === FIELD_TYPES.NUMBER && (
                      <>
                        <Form.Item
                          label="Minimum Value"
                          name={['validation_rules', 'min']}
                        >
                          <InputNumber className="w-full" />
                        </Form.Item>
                        <Form.Item
                          label="Maximum Value"
                          name={['validation_rules', 'max']}
                        >
                          <InputNumber className="w-full" />
                        </Form.Item>
                      </>
                    )}

                    <Form.Item
                      label="Custom Error Message"
                      name={['validation_rules', 'error_message']}
                    >
                      <Input placeholder="Shown when validation fails" />
                    </Form.Item>
                  </>
                )
              },
              // Conditional Logic
              {
                key: 'conditional',
                label: 'Conditional Logic',
                children: (
                  <Form.Item name="conditional_logic">
                    <ConditionalLogicEditor availableFields={otherFields} />
                  </Form.Item>
                )
              }
            ]}
          />
        </Form>
      </div>

      <style>{`
        .properties-panel .ant-collapse-header {
          padding: 8px 0 !important;
          font-weight: 500;
        }
        .properties-panel .ant-collapse-content-box {
          padding: 0 0 16px !important;
        }
        .properties-panel .ant-form-item {
          margin-bottom: 12px;
        }
        .properties-panel .ant-form-item-label {
          padding-bottom: 2px;
        }
        .properties-panel .ant-form-item-label > label {
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default PropertiesPanel;
