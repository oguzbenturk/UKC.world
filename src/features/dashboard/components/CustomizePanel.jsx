// src/features/dashboard/components/CustomizePanel.jsx
import { Card, Row, Col, Switch } from 'antd';

const CustomizePanel = ({ visibleWidgets, onVisibilityChange, initialWidgets }) => (
  <Card title="Customize Dashboard" size="small" className="shadow-sm border-blue-200">
    <Row gutter={[16, 8]}>
      {Object.keys(initialWidgets).map((key) => (
        <Col xs={12} sm={8} md={6} key={key}>
          <Switch
            checked={visibleWidgets[key]}
            onChange={(checked) => onVisibilityChange(key, checked)}
          />
          <span className="ml-2 text-sm text-gray-700">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
        </Col>
      ))}
    </Row>
  </Card>
);

export default CustomizePanel;
