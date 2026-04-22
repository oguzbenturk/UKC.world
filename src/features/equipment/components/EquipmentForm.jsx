import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';

function EquipmentForm({ equipment, isNew, onSubmit, onCancel }) {
  const { t } = useTranslation(['manager']);
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
        {isNew ? t('manager:equipmentPage.form.addTitle') : t('manager:equipmentPage.form.editTitle')}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.name')}
            </label>
            <input
              type="text"
              {...register('name', { required: t('manager:equipmentPage.form.validation.nameRequired') })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.brand')}
            </label>
            <input
              type="text"
              {...register('brand', { required: t('manager:equipmentPage.form.validation.brandRequired') })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {errors.brand && (
              <p className="mt-1 text-sm text-red-600">{errors.brand.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.type')}
            </label>
            <select
              {...register('type', { required: t('manager:equipmentPage.form.validation.typeRequired') })}
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
                {t('manager:equipmentPage.form.fields.size')}
              </label>
              <select
                {...register('size', { required: t('manager:equipmentPage.form.validation.sizeRequired') })}
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
                  {t('manager:equipmentPage.form.fields.windRange')}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    {...register('windRangeLow', { required: t('manager:equipmentPage.form.validation.required') })}
                    placeholder={t('manager:equipmentPage.form.fields.windMin')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    {...register('windRangeHigh', { required: t('manager:equipmentPage.form.validation.required') })}
                    placeholder={t('manager:equipmentPage.form.fields.windMax')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.status')}
            </label>
            <select
              {...register('status', { required: t('manager:equipmentPage.form.validation.statusRequired') })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="available">{t('manager:equipmentPage.form.status.available')}</option>
              <option value="in-use">{t('manager:equipmentPage.form.status.inUse')}</option>
              <option value="maintenance">{t('manager:equipmentPage.form.status.maintenance')}</option>
              <option value="retired">{t('manager:equipmentPage.form.status.retired')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.serialNumber')}
            </label>
            <input
              type="text"
              {...register('serialNumber', { required: t('manager:equipmentPage.form.validation.serialRequired') })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.purchaseDate')}
            </label>
            <input
              type="date"
              {...register('purchaseDate', { required: t('manager:equipmentPage.form.validation.purchaseDateRequired') })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('manager:equipmentPage.form.fields.notes')}
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
          {t('manager:equipmentPage.form.cancel')}
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
        >
          {isNew ? t('manager:equipmentPage.form.addButton') : t('manager:equipmentPage.form.saveButton')}
        </button>
      </div>
    </form>
  );
}

export default EquipmentForm;
