import { Modal, Tabs } from 'antd';
import CustomerPackageManager from './CustomerPackageManager';

/**
 * MultiCustomerPackageManager
 * Renders multiple CustomerPackageManager instances in a single Modal using tabs.
 *
 * Props:
 * - visible: boolean
 * - onClose: function
 * - customers: Array<{ id, name, email }>
 * - title?: string
 */
export default function MultiCustomerPackageManager({ visible, onClose, customers = [], title = 'Package Managers' }) {
  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1300}
      title={title}
      style={{ top: 20 }}
      destroyOnHidden
    >
      <Tabs
        defaultActiveKey={customers[0]?.id?.toString?.() || '0'}
        items={customers.map((c) => ({
          key: c.id?.toString?.() || Math.random().toString(36).slice(2),
          label: c.name || `User ${c.id}`,
      children: (
            <CustomerPackageManager
              visible={false}
              embedded
              customer={{ id: c.id, name: c.name, email: c.email }}
              onClose={() => {}}
              onPackageAssigned={() => {}}
        restrictParticipants={customers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
            />
          ),
        }))}
      />
    </Modal>
  );
}
