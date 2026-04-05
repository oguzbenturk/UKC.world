// src/components/EquipmentDetail.jsx
import React from 'react';
import { getStatusColor } from '@/shared/utils/formatters';

function EquipmentDetail({ equipment, onEdit, onBack }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{equipment.name}</h2>
          
          <div className="mb-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white bg-${getStatusColor(equipment.status)}`}>
              {equipment.status}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Brand</h3>
              <p className="mt-1 text-sm text-gray-900">{equipment.brand}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Type</h3>
              <p className="mt-1 text-sm text-gray-900">{equipment.type}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Size</h3>
              <p className="mt-1 text-sm text-gray-900">{equipment.size}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Specifications</h3>
              <p className="mt-1 text-sm text-gray-900">
                {equipment.type === 'kite' ? `${equipment.specifications} m²` : equipment.specifications}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Wind Range</h3>
              <p className="mt-1 text-sm text-gray-900">
                {equipment.windRangeLow} - {equipment.windRangeHigh} knots
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Serial Number</h3>
              <p className="mt-1 text-sm text-gray-900">{equipment.serialNumber}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500">Purchase Date</h3>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(equipment.purchaseDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Maintenance History</h3>
          {equipment.maintenanceHistory && equipment.maintenanceHistory.length > 0 ? (
            <div className="space-y-4">
              {equipment.maintenanceHistory.map((record, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="text-sm text-gray-600">
                    {new Date(record.date).toLocaleDateString()}
                  </div>
                  <div className="text-sm font-medium text-gray-900">{record.type}</div>
                  <div className="text-sm text-gray-500">{record.notes}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No maintenance history available</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-4">
        <button
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onBack}
        >
          Back to List
        </button>
        {onEdit && (
          <button
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => onEdit(equipment.id)}
          >
            Edit Equipment
          </button>
        )}
      </div>
    </div>
  );
}

export default EquipmentDetail;