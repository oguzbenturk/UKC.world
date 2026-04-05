import React from 'react';
import { Spin, Card, Skeleton } from 'antd';

/**
 * InstructorProfileSkeleton - Loading state for instructor profile components
 * Provides better UX with skeleton loading instead of just spinners
 */
export const InstructorProfileSkeleton = ({ type = 'overview' }) => {
  switch (type) {
    case 'overview':
      return (
        <Card style={{ marginBottom: 24 }}>
          <Skeleton.Input style={{ width: 200, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[...Array(6)].map((_, index) => (
              <div key={index} style={{ minWidth: 120 }}>
                <Skeleton.Input style={{ width: '100%', height: 60 }} />
              </div>
            ))}
          </div>
        </Card>
      );
      
    case 'commissions':
      return (
        <Card>
          <Skeleton.Input style={{ width: 300, marginBottom: 16 }} />
          <Skeleton.Input style={{ width: '100%', height: 40, marginBottom: 8 }} />
          {[...Array(5)].map((_, index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <Skeleton.Input style={{ width: '100%', height: 48 }} />
            </div>
          ))}
        </Card>
      );
      
    case 'dashboard':
      return (
        <div className="space-y-6">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <Skeleton.Input style={{ width: 200 }} />
              <Skeleton.Input style={{ width: 150 }} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[...Array(4)].map((_, index) => (
                <div key={index} style={{ minWidth: 150 }}>
                  <Skeleton.Input style={{ width: '100%', height: 80 }} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <Skeleton.Input style={{ width: 200, marginBottom: 16 }} />
            <Skeleton.Input style={{ width: '100%', height: 200 }} />
          </Card>
        </div>
      );
      
    case 'payments':
      return (
        <div className="space-y-6">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <Skeleton.Input style={{ width: 250, marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <Skeleton.Input style={{ width: 120, height: 80 }} />
                <Skeleton.Input style={{ width: 120, height: 80 }} />
                <Skeleton.Input style={{ width: 120, height: 80 }} />
              </div>
              <Skeleton.Input style={{ width: '100%', height: 150 }} />
            </Card>
          ))}
        </div>
      );
      
    default:
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large">
            <div className="p-4">Loading instructor data...</div>
          </Spin>
        </div>
      );
  }
};

/**
 * InstructorProfileError - Error state for instructor profile components
 * Provides consistent error display with retry functionality
 */
export const InstructorProfileError = ({ 
  title = "Failed to load data",
  message = "An error occurred while loading the instructor profile data.",
  onRetry,
  showRetry = true
}) => {
  return (
    <Card style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
      </div>
      <h3 style={{ color: '#ff4d4f', marginBottom: 8 }}>{title}</h3>
      <p style={{ color: '#666', marginBottom: 16 }}>{message}</p>
      {showRetry && onRetry && (
        <button 
          onClick={onRetry}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      )}
    </Card>
  );
};

export default InstructorProfileSkeleton;
