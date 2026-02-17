// src/shared/components/error/ErrorBoundary.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { logger } from '../../utils/logger';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(_error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log to our logging service
    logger.error('React Error Boundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    });

    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }

    this.setState({
      error,
      errorInfo
    });
  }

  componentDidUpdate(prevProps) {
    const { resetKeys } = this.props;
    if (!this.state.hasError || !Array.isArray(resetKeys)) {
      return;
    }

    if (this.hasResetKeysChanged(prevProps.resetKeys, resetKeys)) {
      this.resetErrorBoundary();
    }
  }

  hasResetKeysChanged(prevResetKeys = [], nextResetKeys = []) {
    if (!Array.isArray(prevResetKeys) || !Array.isArray(nextResetKeys)) {
      return false;
    }

    if (prevResetKeys.length !== nextResetKeys.length) {
      return true;
    }

    return nextResetKeys.some((item, index) => !Object.is(item, prevResetKeys[index]));
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleRetry = () => {
    this.resetErrorBoundary();
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback, showDetails = false } = this.props;
      
      // Custom fallback component
      if (Fallback) {
        return <Fallback error={this.state.error} onRetry={this.handleRetry} />;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-800">
                  Something went wrong
                </h3>
                <div className="mt-2 text-sm text-gray-500">
                  We encountered an unexpected error. Please try refreshing the page.
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex space-x-3">
              <button
                onClick={this.handleRetry}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded text-sm"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded text-sm"
              >
                Refresh Page
              </button>
            </div>

            {showDetails && this.state.error && (
              <details className="mt-4">
                <summary className="text-sm text-gray-600 cursor-pointer">Error Details</summary>
                <div className="mt-2 text-xs font-mono text-gray-500 bg-gray-100 p-2 rounded">
                  <div><strong>Error:</strong> {this.state.error.message}</div>
                  {this.state.error.stack && (
                    <div className="mt-2">
                      <strong>Stack Trace:</strong>
                      <pre className="whitespace-pre-wrap text-xs">{this.state.error.stack}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.elementType,
  showDetails: PropTypes.bool,
  resetKeys: PropTypes.arrayOf(PropTypes.any),
  onReset: PropTypes.func,
  onError: PropTypes.func
};

ErrorBoundary.defaultProps = {
  fallback: null,
  showDetails: false,
  resetKeys: undefined,
  onReset: undefined,
  onError: undefined
};

// Higher-order component for wrapping components with error boundary
// eslint-disable-next-line react-refresh/only-export-components
export const withErrorBoundary = (Component, fallback = null) => {
  return function WithErrorBoundaryComponent(props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
};

// Hook for error handling in functional components
// eslint-disable-next-line react-refresh/only-export-components
export const useErrorHandler = () => {
  const handleError = React.useCallback((error, errorInfo = {}) => {
    logger.error('React Hook Error', {
      error: error.message,
      stack: error.stack,
      ...errorInfo,
      timestamp: new Date().toISOString(),
      url: window.location.href
    });
  }, []);

  return handleError;
};

export default ErrorBoundary;
