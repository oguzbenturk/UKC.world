import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * SignatureCanvas
 *
 * Lightweight canvas-based signature capture component that supports
 * mouse, touch, and stylus input. Exposes imperative helpers to allow
 * parents to read or reset the signature.
 */
const SignatureCanvas = forwardRef(function SignatureCanvas(
  {
    width = 750,
    height = 200,
    penColor = '#111827',
    backgroundColor = '#ffffff',
    lineWidth = 2.5,
    className = '',
    style,
    instructions = 'Sign inside the box using your mouse, finger, or stylus',
    disabled = false,
    onBegin,
    onEnd,
  },
  ref
) {
  const canvasRef = useRef(null);
  const lastPointRef = useRef(null);
  const baselineImageDataRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const devicePixelRatio = useMemo(() => unsafeWindow()?.devicePixelRatio || 1, []);

  const get2dContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  }, []);

  // Memoize point calculation for performance
  const getRelativePoint = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;

    return { x, y };
  }, [width, height]);

  // Initialize canvas drawing context with optimized settings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = get2dContext();
    if (!ctx) return;

    const ratio = Math.max(devicePixelRatio, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = backgroundColor;
    ctx.strokeStyle = penColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.fillRect(0, 0, width, height);
    baselineImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [backgroundColor, devicePixelRatio, get2dContext, height, lineWidth, penColor, width]);

  // Optimized drawing handlers with useCallback
  const startStroke = useCallback((event) => {
    if (disabled) return;
    const point = getRelativePoint(event);
    if (!point) return;

    const ctx = get2dContext();
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);

    lastPointRef.current = point;
    setIsDrawing(true);
    onBegin?.();
  }, [disabled, get2dContext, getRelativePoint, onBegin]);

  const drawStroke = useCallback((event) => {
    if (!isDrawing || disabled) return;
    const point = getRelativePoint(event);
    const lastPoint = lastPointRef.current;
    if (!point || !lastPoint) return;

    const ctx = get2dContext();
    if (!ctx) return;

    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }, [disabled, get2dContext, getRelativePoint, isDrawing]);

  const endStroke = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    onEnd?.(!isCanvasEmpty());
  }, [isDrawing, onEnd]);

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;

    const ctx = get2dContext();
    if (!ctx) return true;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const baseline = baselineImageDataRef.current;
    if (!baseline) {
      baselineImageDataRef.current = imageData;
      return true;
    }

    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] !== baseline.data[i] ||
        imageData.data[i + 1] !== baseline.data[i + 1] ||
        imageData.data[i + 2] !== baseline.data[i + 2] ||
        imageData.data[i + 3] !== baseline.data[i + 3]
      ) {
        return false;
      }
    }
    return true;
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = get2dContext();
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Re-initialise background & stroke styles
    ctx.fillStyle = backgroundColor;
    ctx.strokeStyle = penColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.fillRect(0, 0, width, height);

    baselineImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      resetCanvas();
      onEnd?.(false);
    },
    isEmpty: () => isCanvasEmpty(),
    toDataURL: (type = 'image/png') => canvasRef.current?.toDataURL(type) || null,
    getCanvas: () => canvasRef.current,
  }));

  return (
    <div className={`signature-canvas-wrapper ${className}`} style={{ width: '100%', ...style }}>
      <div
        aria-hidden
        className={`signature-canvas-border ${disabled ? 'signature-canvas--disabled' : ''}`}
        style={{
          border: '2px dashed #cbd5f5',
          borderRadius: '12px',
          backgroundColor,
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature input area"
          style={{ touchAction: 'none', display: 'block', width: '100%' }}
          onMouseDown={startStroke}
          onMouseMove={drawStroke}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
          onTouchStart={startStroke}
          onTouchMove={drawStroke}
          onTouchEnd={endStroke}
          onContextMenu={(event) => event.preventDefault()}
        />
        {disabled && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,255,255,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
            }}
          >
            <span style={{ color: '#1f2937', fontWeight: 500 }}>Signature disabled</span>
          </div>
        )}
      </div>
      {instructions && (
        <p className="signature-canvas-instructions" style={{ marginTop: 8, fontSize: 12, color: '#4b5563' }}>
          {instructions}
        </p>
      )}
    </div>
  );
});

SignatureCanvas.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
  penColor: PropTypes.string,
  backgroundColor: PropTypes.string,
  lineWidth: PropTypes.number,
  className: PropTypes.string,
  style: PropTypes.object,
  instructions: PropTypes.string,
  disabled: PropTypes.bool,
  onBegin: PropTypes.func,
  onEnd: PropTypes.func,
};

function unsafeWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return undefined;
}

export default SignatureCanvas;
