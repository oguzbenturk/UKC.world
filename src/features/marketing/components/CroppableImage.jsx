import { memo } from 'react';
import { Button, Typography } from 'antd';
import Cropper from 'react-easy-crop';

const { Text } = Typography;

/**
 * CroppableImage - Image with in-preview crop functionality
 * Shows edit button on hover, inline crop tool when active
 */
const CroppableImage = memo(({ 
  src, 
  alt, 
  className, 
  imageKey, 
  style = {}, 
  cropMode, 
  setCropMode, 
  crop, 
  setCrop, 
  zoom, 
  setZoom, 
  onCropComplete, 
  cancelCrop, 
  applyCrop,
  aspect = 16 / 9 
}) => {
  const isCropping = cropMode.active && cropMode.imageKey === imageKey;
  
  if (!src) return null;
  
  return (
    <div className="relative group">
      {isCropping ? (
        <div className="relative" style={{ height: '400px', ...style }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Text strong className="text-xs">Zoom:</Text>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="flex gap-2">
              <Button size="small" onClick={cancelCrop}>Cancel</Button>
              <Button size="small" type="primary" onClick={applyCrop}>Apply Crop</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          <img src={src} alt={alt} className={className} style={style} />
          <button
            onClick={() => setCropMode({ active: true, imageKey })}
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white px-3 py-1.5 rounded-lg text-sm opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
          >
            ✂️ Edit
          </button>
        </div>
      )}
    </div>
  );
});

CroppableImage.displayName = 'CroppableImage';

export default CroppableImage;
