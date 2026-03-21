import { Modal, Button, Input, Typography } from 'antd';
import { CheckCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { getPublicUrl } from '../utils/formHelpers';

const { Text, Paragraph } = Typography;

const ShareLinkModal = ({
  open,
  onCancel,
  createdLink,
  copyLink,
}) => (
  <Modal
    title={
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircleOutlined />
        <span>Link Created!</span>
      </div>
    }
    open={open}
    onCancel={onCancel}
    footer={
      <Button type="primary" onClick={onCancel}>Done</Button>
    }
    width={550}
  >
    {createdLink && (
      <div className="py-4 space-y-4">
        <Paragraph>
          Your shareable link is ready! Copy it and send to anyone.
        </Paragraph>

        <div className="bg-gray-50 rounded-xl p-4 border">
          <Text type="secondary" className="text-xs uppercase tracking-wide">Your Link</Text>
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={getPublicUrl(createdLink.link_code)}
              readOnly
              className="font-mono"
            />
            <Button
              type="primary"
              icon={<CopyOutlined />}
              onClick={() => copyLink(createdLink.link_code)}
            >
              Copy
            </Button>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <Text className="text-blue-800">
            <strong>Next step:</strong> Send this link via email, WhatsApp, or post it on social media.
            Anyone with the link can fill out your form.
          </Text>
        </div>
      </div>
    )}
  </Modal>
);

export default ShareLinkModal;
