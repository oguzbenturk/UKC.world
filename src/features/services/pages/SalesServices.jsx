// src/features/services/pages/SalesServices.jsx
// This page now redirects to the proper Products management page
// The old version was using "services" for products which was confusing

import React from 'react';
import Products from '../../products/pages/Products';

const SalesServices = () => {
  // Simply render the new Products component
  return <Products />;
};

export default SalesServices;
