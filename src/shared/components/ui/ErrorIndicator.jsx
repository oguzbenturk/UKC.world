// src/components/ErrorIndicator.jsx
import React from 'react';
import PropTypes from 'prop-types';

const ErrorIndicator = ({ message, retry }) => {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-red-50 border border-red-200 rounded-md">
      <div className="text-red-600 font-medium mb-2">Error</div>
      <p className="text-red-700 mb-4">{message || 'An unexpected error occurred.'}</p>
      {retry && (
        <button 
          onClick={retry}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
};

ErrorIndicator.propTypes = {
  message: PropTypes.string,
  retry: PropTypes.func
};

export default ErrorIndicator;