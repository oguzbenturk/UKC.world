// src/features/dashboard/components/CustomizePanel.jsx
import { Row, Col, Switch } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const CustomizePanel = ({ visibleWidgets, onVisibilityChange, initialWidgets }) => (
  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5 mb-6 animate-fade-in">
    <div className="flex items-center gap-2 mb-4">
        <SettingOutlined className="text-sky-600" />
        <h3 className="text-sm font-bold text-sky-900 uppercase tracking-wider m-0">Dashboard Settings</h3>
    </div>
    <Row gutter={[16, 16]}>
      {Object.keys(initialWidgets).map((key) => (
        <Col xs={24} sm={12} md={6} key={key}>
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-sky-100/50">
              <span className="text-sm font-medium text-slate-700 capitalize">
                {key.replace(/([A-Z])/g, ' $1').replace('kpi', 'KPI')}
              </span>
              <Switch
                size="small"
                checked={visibleWidgets[key]}
                onChange={(checked) => onVisibilityChange(key, checked)}
                className="bg-slate-200"
              />
          </div>
        </Col>
      ))}
    </Row>
  </div>
);

export default CustomizePanel;
