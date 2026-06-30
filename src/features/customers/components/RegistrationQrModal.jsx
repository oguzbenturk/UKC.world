import { useEffect, useState } from 'react';
import { Modal, Button, Spin } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import QRCode from 'qrcode';

/**
 * Shows a big QR code that points at the public customer self-registration page (/join).
 * A customer scans it with their phone camera to open the form and fill it in themselves.
 */
const RegistrationQrModal = ({ open, onClose, url }) => {
  const [dataUrl, setDataUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !url) return undefined;
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: 'M' })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      message.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Could not copy link');
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={460} title={null} destroyOnHidden>
      <div className="flex flex-col items-center text-center px-2 py-2">
        <h3 className="text-lg font-semibold text-slate-800 m-0">Scan to register</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Point your phone camera at the code to open the registration form and fill it in yourself.
        </p>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
          {dataUrl ? (
            <img src={dataUrl} alt="Registration QR code" width={300} height={300} className="block" />
          ) : (
            <div className="flex h-[300px] w-[300px] items-center justify-center"><Spin /></div>
          )}
        </div>

        <div className="mt-4 w-full">
          <div className="flex justify-center">
            <span className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 break-all">
              {url}
            </span>
          </div>
          <Button
            className="mt-3"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
            block
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RegistrationQrModal;
