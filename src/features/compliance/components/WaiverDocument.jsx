import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Alert, Typography, Tag } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const WaiverDocument = ({
  title,
  version,
  effectiveDate,
  content,
  language = 'en',
  isMinor = false,
  maxHeight = 320,
  onScrollBottom,
  onScrollProgress,
  isMobile = false,
}) => {
  const containerRef = useRef(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Use larger height on mobile for better readability
  const effectiveMaxHeight = isMobile ? Math.max(maxHeight, Math.min(450, window.innerHeight * 0.45)) : maxHeight;

  const formattedDate = useMemo(() => {
    if (!effectiveDate) return 'Not specified';
    return new Date(effectiveDate).toLocaleDateString();
  }, [effectiveDate]);

  useEffect(() => {
    setScrolledToBottom(false);
    setScrollProgress(0);

    const container = containerRef.current;
    if (!container) return;

    const handleInitialMeasurement = () => {
      if (container.scrollHeight <= container.clientHeight) {
        setScrolledToBottom(true);
        onScrollBottom?.();
        setScrollProgress(100);
      }
    };

    // Measure on next frame to allow DOM to paint
    const raf = requestAnimationFrame(handleInitialMeasurement);
    return () => cancelAnimationFrame(raf);
  }, [content, version, effectiveDate, onScrollBottom]);

  const handleScroll = (event) => {
    const target = event.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const progress = Math.min(100, Math.round(((scrollTop + clientHeight) / scrollHeight) * 100));
    setScrollProgress(progress);
    onScrollProgress?.(progress);

    const atBottom = scrollTop + clientHeight >= scrollHeight - 20;
    if (atBottom && !scrolledToBottom) {
      setScrolledToBottom(true);
      onScrollBottom?.();
    }
  };

  return (
    <div className="waiver-document" style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        className="waiver-document__scrollable"
        style={{
          maxHeight: effectiveMaxHeight,
          overflowY: 'auto',
          scrollBehavior: 'smooth',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: isMobile ? '16px 14px' : '18px',
          backgroundColor: '#f8fafc',
          boxShadow: 'inset 0 1px 3px rgba(15,23,42,0.08)',
          // Mobile touch scrolling improvements
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onScroll={handleScroll}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              {title || 'Liability Waiver & Release Agreement'}
            </Title>
            <Paragraph style={{ marginBottom: 0, color: '#475569' }}>
              <Text strong>Version:</Text> {version || 'Draft'} {' • '}
              <Text strong>Effective:</Text> {formattedDate}
            </Paragraph>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="blue">Language: {language.toUpperCase()}</Tag>
            {isMinor && <Tag color="magenta">Minor Participant</Tag>}
          </div>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            message="Risk & Safety Notice"
            description="Please review each section carefully. Pay particular attention to the assumption of risk, release of liability, and emergency treatment clauses."
            style={{ borderRadius: 10 }}
          />
          {isMinor && (
            <Alert
              type="warning"
              showIcon
              message="Parental/Guardian Consent Required"
              description="Because this participant is a minor, a legal guardian must review the waiver and provide consent before any activities can begin."
              style={{ borderRadius: 10 }}
            />
          )}
        </div>

          <section style={{ marginTop: 16 }}>
          <div
            style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#1e293b' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </section>

        {!scrolledToBottom && (
          <div style={{ marginTop: 16, textAlign: 'center', color: '#2563eb' }}>
            <ExclamationCircleOutlined style={{ marginRight: 8 }} />
            Scroll to the bottom to continue
          </div>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollProgress}
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: -4,
          height: 4,
          borderRadius: 4,
          backgroundColor: '#e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${scrollProgress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #38bdf8, #2563eb)',
            transition: 'width 0.2s ease-out',
          }}
        />
      </div>
    </div>
  );
};

WaiverDocument.propTypes = {
  title: PropTypes.string,
  version: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  effectiveDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  content: PropTypes.string,
  language: PropTypes.string,
  isMinor: PropTypes.bool,
  maxHeight: PropTypes.number,
  onScrollBottom: PropTypes.func,
  onScrollProgress: PropTypes.func,
  isMobile: PropTypes.bool,
};

export default WaiverDocument;
