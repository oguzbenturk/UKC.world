import { useEffect, useState } from 'react';
import { Drawer, Segmented, Button, Tooltip } from 'antd';
import { UserOutlined, SmileOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import UserForm from '@/shared/components/ui/UserForm';
import CustomerSelfRegisterForm from '@/features/customers/components/CustomerSelfRegisterForm';
import RegistrationQrModal from '@/features/customers/components/RegistrationQrModal';

const NewCustomerDrawer = ({ isOpen, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState([]);
  // 'staff' = full admin form, 'customer' = simplified self-service form to hand to the customer.
  const [mode, setMode] = useState('staff');
  const [qrOpen, setQrOpen] = useState(false);

  // Absolute URL of the public self-registration page the QR code points at.
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join` : '/join';

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    apiClient
      .get('/roles')
      .then((res) => {
        if (!cancelled) setRoles(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const invalidate = (created) => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    onCreated?.(created);
  };

  // Staff form closes the drawer once the customer is created.
  const handleStaffSuccess = (created) => {
    invalidate(created);
    onClose?.();
  };

  // Customer mode keeps the drawer open and shows its own success screen so the same device
  // can be handed to the next customer without staff intervention.
  const handleCustomerSuccess = (created) => {
    invalidate(created);
  };

  const isCustomer = mode === 'customer';

  return (
    <>
      <Drawer
        title={(
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Segmented
                className="flex-1"
                block
                value={mode}
                onChange={setMode}
                options={[
                  { label: 'Staff Form', value: 'staff', icon: <UserOutlined /> },
                  { label: 'Customer Mode', value: 'customer', icon: <SmileOutlined /> },
                ]}
              />
              <Tooltip title="Show QR code — let customers register from their own phone">
                <Button
                  icon={<QrcodeOutlined />}
                  onClick={() => setQrOpen(true)}
                  aria-label="Show registration QR code"
                />
              </Tooltip>
            </div>
            <span className="text-base font-semibold text-slate-800">
              {isCustomer ? 'New Customer Registration' : 'Add New Customer'}
            </span>
          </div>
        )}
        open={isOpen}
        onClose={onClose}
        width={720}
        destroyOnClose
      >
        {isCustomer ? (
          <CustomerSelfRegisterForm
            roles={roles}
            onSuccess={handleCustomerSuccess}
            onCancel={onClose}
          />
        ) : (
          <UserForm
            user={null}
            roles={roles}
            onSuccess={handleStaffSuccess}
            onCancel={onClose}
          />
        )}
      </Drawer>

      <RegistrationQrModal open={qrOpen} onClose={() => setQrOpen(false)} url={joinUrl} />
    </>
  );
};

export default NewCustomerDrawer;
