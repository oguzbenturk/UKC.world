/**
 * Form Builder Page
 * Main page for creating and editing form templates
 * Three-panel layout: Toolbox | Canvas | Properties
 */

import { useState, useEffect } from 'react';
import { 
  Layout, 
  Button, 
  Space, 
  Typography, 
  Tooltip, 
  Dropdown, 
  Modal,
  Form,
  Input,
  Select,
  message,
  Spin,
  Breadcrumb
} from 'antd';
import { 
  EyeOutlined, 
  SettingOutlined,
  UndoOutlined,
  RedoOutlined,
  ArrowLeftOutlined,
  MoreOutlined,
  FormOutlined,
  BgColorsOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormBuilder } from '../hooks/useFormBuilder';
import FieldToolbox from '../components/FieldToolbox';
import FormCanvas from '../components/FormCanvas';
import PropertiesPanel from '../components/PropertiesPanel';
import ThemeBrandingPanel from '../components/ThemeBrandingPanel';
import StepConfigModal from '../components/StepConfigModal';
import { FORM_CATEGORIES } from '../constants/fieldTypes';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const FormBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [stepConfigModalVisible, setStepConfigModalVisible] = useState(false);
  const [stepToEdit, setStepToEdit] = useState(null);
  const [settingsForm] = Form.useForm();
  const [rightPanelMode, setRightPanelMode] = useState('properties'); // 'properties' | 'theme'

  // Form builder hook
  const {
    template,
    steps,
    selectedStepId,
    selectedFieldId,
    selectedField,
    loading,
    saving,
    hasChanges,
    lastAutoSave,
    canUndo,
    canRedo,
    undo,
    redo,
    setSelectedStepId,
    setSelectedFieldId,
    updateTemplate,
    addStep,
    updateStep,
    deleteStep,
    addField,
    updateField,
    deleteField,
    duplicateField,
    reorderFields,
  } = useFormBuilder(id);

  // Get all fields for conditional logic
  const allFields = steps.flatMap(s => s.fields || []);

  // Handle field from toolbox
  const handleToolboxFieldClick = (field) => {
    if (selectedStepId) {
      addField(selectedStepId, field.type);
    } else if (steps.length > 0) {
      addField(steps[0].id, field.type);
    } else {
      message.info('Please add a step first');
    }
  };

  // Handle step config modal
  const handleOpenStepConfig = (step) => {
    setStepToEdit(step);
    setStepConfigModalVisible(true);
  };

  const handleSaveStepConfig = async (stepId, values) => {
    await updateStep(stepId, values);
    setStepConfigModalVisible(false);
    setStepToEdit(null);
  };

  // Handle preview
  const handlePreview = () => {
    window.open(`/forms/preview/${id}`, '_blank');
  };

  // Handle settings save
  const handleSettingsSave = async (values) => {
    await updateTemplate(values);
    setSettingsModalVisible(false);
  };

  // Open settings modal
  const openSettings = () => {
    settingsForm.setFieldsValue({
      name: template?.name,
      description: template?.description,
      category: template?.category,
      is_active: template?.is_active,
    });
    setSettingsModalVisible(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Auto-save is already handled
        message.success('Changes saved');
      }
      if (e.key === 'Delete' && selectedFieldId) {
        deleteField(selectedFieldId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedFieldId, deleteField]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center flex-col gap-2">
        <Spin size="large" />
        <span className="text-gray-500">Loading form builder...</span>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Title level={3}>Form not found</Title>
          <Button type="primary" onClick={() => navigate('/forms')}>
            Back to Forms
          </Button>
        </div>
      </div>
    );
  }

  const moreMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Form Settings',
      onClick: openSettings,
    },
    {
      key: 'preview',
      icon: <EyeOutlined />,
      label: 'Preview Form',
      onClick: handlePreview,
    },
    { type: 'divider' },
    {
      key: 'export',
      label: 'Export as JSON',
      onClick: () => {
        const data = JSON.stringify({ template, steps }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.name.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    },
  ];

  return (
    <Layout className="h-screen">
      {/* Header */}
      <Header className="bg-white border-b px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <Tooltip title="Back to forms">
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/forms')}
            />
          </Tooltip>
          
          <Breadcrumb
            items={[
              { 
                href: '/forms', 
                title: (
                  <span className="flex items-center gap-1">
                    <FormOutlined />
                    Forms
                  </span>
                )
              },
              { title: template.name },
            ]}
          />

          {hasChanges && (
            <Text type="secondary" className="text-xs">
              (unsaved changes)
            </Text>
          )}
          {!hasChanges && lastAutoSave && (
            <Text type="secondary" className="text-xs text-green-600">
              ✓ Saved
            </Text>
          )}
          {saving && (
            <Text type="secondary" className="text-xs">
              Saving...
            </Text>
          )}
        </div>

        <Space>
          {/* Undo/Redo */}
          <Tooltip title="Undo (Ctrl+Z)">
            <Button 
              icon={<UndoOutlined />} 
              disabled={!canUndo}
              onClick={undo}
            />
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <Button 
              icon={<RedoOutlined />} 
              disabled={!canRedo}
              onClick={redo}
            />
          </Tooltip>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Preview */}
          <Button icon={<EyeOutlined />} onClick={handlePreview}>
            Preview
          </Button>

          {/* Settings */}
          <Button icon={<SettingOutlined />} onClick={openSettings}>
            Settings
          </Button>

          {/* More */}
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      </Header>

      {/* Main Content */}
      <Layout>
        {/* Left Sidebar - Field Toolbox */}
        <Sider 
          width={260} 
          className="bg-white border-r"
          theme="light"
        >
          <FieldToolbox
            onFieldClick={handleToolboxFieldClick}
            disabled={!selectedStepId && steps.length === 0}
          />
        </Sider>

        {/* Center - Canvas */}
        <Content className="bg-gray-100">
          <FormCanvas
            steps={steps}
            selectedStepId={selectedStepId}
            selectedFieldId={selectedFieldId}
            onSelectStep={(stepId, openSettings) => {
              setSelectedStepId(stepId);
              if (openSettings) {
                const step = steps.find(s => s.id === stepId);
                if (step) handleOpenStepConfig(step);
              }
            }}
            onSelectField={setSelectedFieldId}
            onAddStep={addStep}
            onUpdateStep={updateStep}
            onDeleteStep={deleteStep}
            onAddField={addField}
            onDeleteField={deleteField}
            onDuplicateField={duplicateField}
            onReorderFields={reorderFields}
          />
        </Content>

        {/* Right Sidebar - Properties Panel / Theme Panel */}
        <Sider 
          width={320} 
          className="bg-white border-l"
          theme="light"
        >
          {/* Panel Toggle */}
          <div className="flex border-b">
            <button
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                rightPanelMode === 'properties'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setRightPanelMode('properties')}
            >
              <SettingOutlined className="mr-1" />
              Properties
            </button>
            <button
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                rightPanelMode === 'theme'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setRightPanelMode('theme')}
            >
              <BgColorsOutlined className="mr-1" />
              Theme
            </button>
          </div>
          
          {/* Panel Content */}
          <div className="h-[calc(100%-49px)] overflow-hidden">
            {rightPanelMode === 'properties' ? (
              <PropertiesPanel
                field={selectedField}
                allFields={allFields}
                onUpdate={updateField}
                onDelete={deleteField}
                onDuplicate={duplicateField}
              />
            ) : (
              <ThemeBrandingPanel
                themeConfig={template?.theme_config}
                onUpdate={updateTemplate}
                disabled={saving}
              />
            )}
          </div>
        </Sider>
      </Layout>

      {/* Settings Modal */}
      <Modal
        title="Form Settings"
        open={settingsModalVisible}
        onCancel={() => setSettingsModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={settingsForm}
          layout="vertical"
          onFinish={handleSettingsSave}
        >
          <Form.Item
            name="name"
            label="Form Name"
            rules={[{ required: true, message: 'Please enter a form name' }]}
          >
            <Input placeholder="Enter form name" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={3} placeholder="Brief description..." />
          </Form.Item>

          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Please select a category' }]}
          >
            <Select options={FORM_CATEGORIES} />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Status"
            valuePropName="checked"
          >
            <Select
              options={[
                { value: true, label: 'Active' },
                { value: false, label: 'Inactive' },
              ]}
            />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => setSettingsModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save Settings
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Step Configuration Modal */}
      <StepConfigModal
        visible={stepConfigModalVisible}
        step={stepToEdit}
        allFields={allFields}
        onSave={handleSaveStepConfig}
        onCancel={() => {
          setStepConfigModalVisible(false);
          setStepToEdit(null);
        }}
      />
    </Layout>
  );
};

export default FormBuilderPage;
