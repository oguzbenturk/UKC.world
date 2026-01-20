import React from 'react';
import { useForm } from 'react-hook-form';

function EquipmentForm({ equipment, isNew, onSubmit, onCancel }) {
  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: isNew ? {
      status: 'available',
      type: 'kite'
    } : {
      name: equipment?.name,
      brand: equipment?.brand,
      type: equipment?.type,
      size: equipment?.size,
      specifications: equipment?.specifications,
      windRangeLow: equipment?.windRangeLow,
      windRangeHigh: equipment?.windRangeHigh,
      serialNumber: equipment?.serialNumber,
      status: equipment?.status,
      purchaseDate: equipment?.purchaseDate?.split('T')[0],
      notes: equipment?.notes
    }
  });

  const equipmentType = watch('type');

  const kitesurfEquipmentTypes = [
    'kite',
    'board',
    'harness',
    'control bar',
    'wetsuit',
    'safety gear'
  ];

  const getSizeOptions = (type) => {
    switch (type) {
      case 'kite':
        return ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'];
      case 'board':
        return ['132x39', '135x40', '138x41', '141x42', '144x43'];
      case 'harness':
      case 'wetsuit':
        return ['XS', 'S', 'M', 'L', 'XL'];
      default:
        return [];
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">
        {isNew ? 'Add New Equipment' : 'Edit Equipment'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Equipment Name *
            </label>
            <input
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Brand *
            </label>
            <input
              type="text"
              {...register('brand', { required: 'Brand is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {errors.brand && (
              <p className="mt-1 text-sm text-red-600">{errors.brand.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Equipment Type *
            </label>
            <select
              {...register('type', { required: 'Type is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {kitesurfEquipmentTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {getSizeOptions(equipmentType).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Size *
              </label>
              <select
                {...register('size', { required: 'Size is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {getSizeOptions(equipmentType).map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {equipmentType === 'kite' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Wind Range (Knots) *
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    {...register('windRangeLow', { required: 'Required' })}
                    placeholder="Min"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    {...register('windRangeHigh', { required: 'Required' })}
                    placeholder="Max"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status *
            </label>
            <select
              {...register('status', { required: 'Status is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="available">Available</option>
              <option value="in-use">In Use</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Serial Number *
            </label>
            <input
              type="text"
              {...register('serialNumber', { required: 'Serial number is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Purchase Date *
            </label>
            <input
              type="date"
              {...register('purchaseDate', { required: 'Purchase date is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
        >
          {isNew ? 'Add Equipment' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

export default EquipmentForm;
