/**
 * Step Navigator Component
 * Shows list of steps for quick navigation in Live Preview mode
 */

import { Button, Empty, Typography, Tag } from 'antd';
import { 
  PlusOutlined,
  CheckCircleOutlined,
  EditOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;

const StepNavigator = ({ 
  steps = [], 
  selectedStepId, 
  onSelectStep,
  onAddStep 
}) => {
  if (steps.length === 0) {
    return (
      <div className="p-4">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No steps yet"
          className="py-8"
        >
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={onAddStep}
          >
            Add First Step
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <Title level={5} className="m-0">Steps</Title>
          <Button 
            type="text" 
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddStep}
          >
            Add
          </Button>
        </div>
        <Text type="secondary" className="text-xs">
          Click a step to view and edit
        </Text>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {steps.map((step, index) => {
            const isSelected = step.id === selectedStepId;
            const fieldCount = step.fields?.length || 0;

            return (
              <button
                key={step.id}
                onClick={() => onSelectStep(step.id)}
                className={`
                  w-full text-left p-3 rounded-lg border-2 transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50 shadow-sm' 
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                  }
                `}
              >
                {/* Step number and title */}
                <div className="flex items-start gap-2 mb-2">
                  <div 
                    className={`
                      flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                      ${isSelected 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 text-gray-600'
                      }
                    `}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {step.title}
                    </div>
                    {step.description && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-2 ml-8">
                  <Tag 
                    icon={<EditOutlined />} 
                    className="text-xs m-0"
                    color={fieldCount > 0 ? 'blue' : 'default'}
                  >
                    {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                  </Tag>
                  {step.show_progress && (
                    <Tag 
                      icon={<CheckCircleOutlined />}
                      className="text-xs m-0"
                      color="success"
                    >
                      Progress
                    </Tag>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer info */}
      <div className="p-3 border-t bg-gray-50">
        <Text type="secondary" className="text-xs">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'} total
        </Text>
      </div>
    </div>
  );
};

export default StepNavigator;
