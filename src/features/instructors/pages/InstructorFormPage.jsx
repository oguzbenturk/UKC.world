import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Spin, 
  DatePicker, 
  Upload, 
  Row, 
  Col, 
  Select 
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useData } from '@/shared/hooks/useData';
import { ROLE_IDS } from '@/shared/constants/roles';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

const InstructorFormPage = () => {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const { addInstructor, updateInstructor, fetchInstructorById, loading: dataLoading } = useData();
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null); // server URL for saving
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null); // local preview URL for display
  const [isEditing, setIsEditing] = useState(false);

  const postAvatarUpload = useCallback(async (file, progressCb) => {
    const formData = new FormData();
    if (id) {
      formData.append('targetUserId', id);
    }
    formData.append('avatar', file);
    return apiClient.post('/users/upload-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: ({ total, loaded }) => {
        if (total && progressCb) {
          progressCb(Math.round((loaded / total) * 100));
        }
      }
    });
  }, [id]);

  const syncStoredAvatar = useCallback((targetId, url) => {
    if (!targetId || !url) return;
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.id === targetId) {
        localStorage.setItem('user', JSON.stringify({ ...parsed, profile_image_url: url }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (id) {
      setIsEditing(true);
      setLoading(true);
      fetchInstructorById(id)
        .then(data => {
          if (data) {
            form.setFieldsValue({
              ...data,
              date_of_birth: data.date_of_birth ? moment(data.date_of_birth) : null,
            });
            if (data.profile_image_url) {
              setAvatarUrl(data.profile_image_url);
            }
          }
        })
  .catch((_err) => {
          message.error('Failed to fetch instructor details');
        })
        .finally(() => setLoading(false));
    }
  }, [id, form, fetchInstructorById]);

  const handleAvatarUpload = (info) => {
    if (info.file.status === 'uploading' && info.file.originFileObj) {
      // Show immediate local preview during upload
      const url = URL.createObjectURL(info.file.originFileObj);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(url);
    }
    if (info.file.status === 'done') {
      message.success(`${info.file.name} file uploaded successfully`);
      if (avatarPreviewUrl) {
        // Keep preview visible; it'll be replaced on next edit/load
      }
    } else if (info.file.status === 'error') {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        setAvatarPreviewUrl(null);
      }
      message.error(`${info.file.name} file upload failed.`);
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handleFinish = async (values) => {
    setLoading(true);
    try {
      // Validate required fields
      if (!values.first_name || !values.last_name) {
        throw new Error('First name and last name are required');
      }

      if (!values.email) {
        throw new Error('Email is required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(values.email)) {
        throw new Error('Invalid email format');
      }

      if (!isEditing) {
        if (!values.password) {
          throw new Error('Password is required for new instructors');
        }
        if (values.password !== values.confirm_password) {
          throw new Error('Passwords do not match');
        }
      }
      // Prepare the base payload
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        profile_image_url: avatarUrl,
        name: `${values.first_name} ${values.last_name}`.trim(),
        role_id: ROLE_IDS.instructor,
      };
      
      // Remove status field as it doesn't exist in the backend 'users' table
      delete payload.status;

      // Remove confirm_password as it's not needed in the API
      delete payload.confirm_password;

      if (isEditing) {
        await updateInstructor(id, payload);
        message.success('Instructor updated successfully!');
      } else {
        await addInstructor(payload);
        message.success('Instructor created successfully!');
      }
      navigate('/instructors');
    } catch (error) {
      setLoading(false);
      message.error(`Failed to save instructor: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className="p-4">
      <Card title={isEditing ? 'Edit Instructor' : 'Create New Instructor'}>
        <Spin spinning={loading || dataLoading}>
          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>                <Form.Item name="profile_image_url" label="Profile Image">
                  <div>
                    <Upload
                      name="avatar"
                      listType="picture-card"
                      className="avatar-uploader"
                      showUploadList={false}
                      onChange={handleAvatarUpload}
                      customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                        try {
                          const response = await postAvatarUpload(file, (percent) => {
                            onProgress?.({ percent });
                          });
                          const bust = response.data?.cacheBust || Date.now();
                          const newUrl = response.data?.url ? `${response.data.url}?v=${bust}` : null;
                          if (newUrl) {
                            setAvatarUrl(newUrl);
                            form.setFieldsValue({ profile_image_url: newUrl });
                            const syncedTargetId = response.data?.targetUserId || response.data?.user?.id;
                            syncStoredAvatar(syncedTargetId, newUrl);
                          }
                          onSuccess?.(response.data);
                        } catch (err) {
                          onError?.(err);
                        }
                      }}
                    >
                      {avatarPreviewUrl || avatarUrl ? (
                        <img src={avatarPreviewUrl || avatarUrl} alt="avatar" style={{ width: '100%' }} />
                      ) : (
                        <UploadOutlined />
                      )}
                    </Upload>
                  </div>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="phone" label="Phone">
                  <Input />
                </Form.Item>
              </Col>
              {!isEditing && (
                <>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="password" label="Password" rules={[{ required: !isEditing }]}>
                      <Input.Password />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item name="confirm_password" label="Confirm Password" dependencies={['password']} rules={[
                      { required: !isEditing },
                      ({
                        getFieldValue
                      }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('The two passwords that you entered do not match!'));
                        },
                      }),
                    ]}>
                      <Input.Password />
                    </Form.Item>
                  </Col>
                </>
              )}
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="date_of_birth" label="Date of Birth">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="level" label="Level">
                  <Select placeholder="Select level">
                    <Option value="Beginner">Beginner</Option>
                    <Option value="Intermediate">Intermediate</Option>
                    <Option value="Advanced">Advanced</Option>
                    <Option value="Expert">Expert</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="address" label="Address">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="city" label="City">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="postal_code" label="Postal Code">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="country" label="Country">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="status" label="Status" initialValue="active">
                  <Select>
                    <Option value="active">Active</Option>
                    <Option value="inactive">Inactive</Option>
                    <Option value="on_leave">On Leave</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="preferred_currency" label="Preferred Currency" initialValue="USD">
                  <Select>
                    <Option value="USD">USD</Option>
                    <Option value="EUR">EUR</Option>
                    <Option value="GBP">GBP</Option>
                    {/* Add more currencies as needed */}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                {isEditing ? 'Update Instructor' : 'Create Instructor'}
              </Button>
              <Button style={{ marginLeft: 8 }} onClick={() => navigate('/instructors')}>
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default InstructorFormPage;
