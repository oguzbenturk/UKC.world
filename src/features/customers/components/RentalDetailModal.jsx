import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, TimePicker, Button, Spin, Row, Col, Typography } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import DataService from '../../../shared/services/dataService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const RentalDetailModal = ({ visible, onClose, rentalId, onRentalUpdated, onRentalDeleted }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rental, setRental] = useState(null);
  const [equipment, setEquipment] = useState([]);

  useEffect(() => {
    if (visible && rentalId) {
      loadRentalDetails();
      loadEquipment();
    }
  }, [visible, rentalId]);

  const loadRentalDetails = async () => {
    try {
      setLoading(true);
      const rentalData = await DataService.getRental(rentalId);
      setRental(rentalData);
      
      // Populate form with rental data
      form.setFieldsValue({
        rental_date: rentalData.rental_date ? dayjs(rentalData.rental_date) : null,
        start_time: rentalData.start_time ? dayjs(`2000-01-01 ${rentalData.start_time}`, 'YYYY-MM-DD HH:mm:ss') : null,
        end_time: rentalData.end_time ? dayjs(`2000-01-01 ${rentalData.end_time}`, 'YYYY-MM-DD HH:mm:ss') : null,
        equipment_id: rentalData.equipment_id,
        status: rentalData.status,
        payment_status: rentalData.payment_status,
        total_amount: rentalData.total_amount,
        deposit_amount: rentalData.deposit_amount,
        notes: rentalData.notes
      });
    } catch (error) {
      console.error('Error loading rental details:', error);
      message.error('Failed to load rental details');
    } finally {
      setLoading(false);
    }
  };

  const loadEquipment = async () => {
    try {
      const equipmentData = await DataService.getEquipment();
      setEquipment(equipmentData);
    } catch (error) {
      console.error('Error loading equipment:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const updateData = {
        ...values,
        rental_date: values.rental_date ? values.rental_date.format('YYYY-MM-DD') : null,
        start_time: values.start_time ? values.start_time.format('HH:mm:ss') : null,
        end_time: values.end_time ? values.end_time.format('HH:mm:ss') : null,
      };
      
      await DataService.updateRental(rentalId, updateData);
      message.success('Rental updated successfully');
      setEditing(false);
      
      if (onRentalUpdated) {
        onRentalUpdated();
      }
      
      // Reload rental details to show updated data
      await loadRentalDetails();
    } catch (error) {
      console.error('Error updating rental:', error);
      message.error('Failed to update rental');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    Modal.confirm({
      title: 'Delete Rental',
      content: 'Are you sure you want to delete this rental? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteRental(rentalId);
          message.success('Rental deleted successfully');
          
          if (onRentalDeleted) {
            onRentalDeleted();
          }
          
          onClose();
        } catch (error) {
          console.error('Error deleting rental:', error);
          message.error('Failed to delete rental');
        }
      }
    });
  };

  const handleCancel = () => {
    if (editing) {
      // Reset form to original values
      if (rental) {
        form.setFieldsValue({
          rental_date: rental.rental_date ? dayjs(rental.rental_date) : null,
          start_time: rental.start_time ? dayjs(`2000-01-01 ${rental.start_time}`, 'YYYY-MM-DD HH:mm:ss') : null,
          end_time: rental.end_time ? dayjs(`2000-01-01 ${rental.end_time}`, 'YYYY-MM-DD HH:mm:ss') : null,
          equipment_id: rental.equipment_id,
          status: rental.status,
          payment_status: rental.payment_status,
          total_amount: rental.total_amount,
          deposit_amount: rental.deposit_amount,
          notes: rental.notes
        });
      }
      setEditing(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      title={
        <div className="flex justify-between items-center">
          <span>Rental Details</span>
          {!editing && (
            <div>
              <Button 
                type="text" 
                icon={<EditOutlined />} 
                onClick={() => setEditing(true)}
                className="mr-2"
              >
                Edit
              </Button>
              <Button 
                type="text" 
                danger
                icon={<DeleteOutlined />} 
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      footer={editing ? [
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Changes
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
      width={800}
      destroyOnHidden
    >
      {loading ? (
        <div className="text-center py-8">
          <Spin size="large" />
        </div>
      ) : rental ? (
        <Form form={form} layout="vertical" disabled={!editing}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Rental Date"
                name="rental_date"
                rules={[{ required: true, message: 'Please select a date' }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Start Time"
                name="start_time"
                rules={[{ required: true, message: 'Please select start time' }]}
              >
                <TimePicker className="w-full" format="HH:mm" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="End Time"
                name="end_time"
                rules={[{ required: true, message: 'Please select end time' }]}
              >
                <TimePicker className="w-full" format="HH:mm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Equipment"
            name="equipment_id"
            rules={[{ required: true, message: 'Please select equipment' }]}
          >
            <Select placeholder="Select equipment">
              {equipment.map(item => (
                <Option key={item.id} value={item.id}>
                  {item.name} - {item.category}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Total Amount"
                name="total_amount"
                rules={[{ required: true, message: 'Please enter total amount' }]}
              >
                <Input type="number" step="0.01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Deposit Amount"
                name="deposit_amount"
              >
                <Input type="number" step="0.01" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: 'Please select status' }]}
              >
                <Select>
                  <Option value="active">Active</Option>
                  <Option value="returned">Returned</Option>
                  <Option value="cancelled">Cancelled</Option>
                  <Option value="overdue">Overdue</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Payment Status"
                name="payment_status"
                rules={[{ required: true, message: 'Please select payment status' }]}
              >
                <Select>
                  <Option value="pending">Pending</Option>
                  <Option value="paid">Paid</Option>
                  <Option value="refunded">Refunded</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Notes" name="notes">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      ) : (
        <div className="text-center py-8">
          <Text type="secondary">No rental data available</Text>
        </div>
      )}
    </Modal>
  );
};

export default RentalDetailModal;
