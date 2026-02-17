// src/components/LoadingIndicator.jsx
import React from 'react';

function LoadingIndicator({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      <p className="mt-2 text-gray-600">{message}</p>
    </div>
  );
}

export default LoadingIndicator;