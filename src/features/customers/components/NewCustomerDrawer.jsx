import { useEffect, useState } from 'react';
import { Drawer } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import UserForm from '@/shared/components/ui/UserForm';

const NewCustomerDrawer = ({ isOpen, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
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

  const handleSuccess = (created) => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    onCreated?.(created);
    onClose?.();
  };

  return (
    <Drawer
      title="Add New Customer"
      open={isOpen}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      <UserForm
        user={null}
        roles={roles}
        onSuccess={handleSuccess}
        onCancel={onClose}
      />
    </Drawer>
  );
};

export default NewCustomerDrawer;
