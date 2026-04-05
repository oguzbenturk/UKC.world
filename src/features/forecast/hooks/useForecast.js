import { useContext } from 'react';
import { ForecastContext } from '../contexts/context';

export const useForecast = () => {
  const context = useContext(ForecastContext);
  if (!context) {
    throw new Error('useForecast must be used within a ForecastProvider');
  }
  return context;
};