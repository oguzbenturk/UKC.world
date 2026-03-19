import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  Upload,
  App,
  Grid,
  Divider,
  TimePicker,
  DatePicker,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  LoadingOutlined,
  HomeOutlined,
  DollarOutlined,
  PictureOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  StarOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

// ============================================================================
// CONSTANTS
// ============================================================================

const AMENITIES_OPTIONS = [
  { value: 'wifi', label: 'WiFi', icon: '📶' },
  { value: 'air_conditioning', label: 'Air Conditioning', icon: '❄️' },
  { value: 'tv', label: 'TV', icon: '📺' },
  { value: 'kitchen', label: 'Kitchen', icon: '🍳' },
  { value: 'minibar', label: 'Minibar', icon: '🍷' },
  { value: 'safe', label: 'Safe', icon: '🔐' },
  { value: 'balcony', label: 'Balcony', icon: '🌅' },
  { value: 'sea_view', label: 'Sea View', icon: '🌊' },
  { value: 'pool_access', label: 'Pool Access', icon: '🏊' },
  { value: 'parking', label: 'Parking', icon: '🅿️' },
  { value: 'breakfast', label: 'Breakfast Included', icon: '🥐' },
  { value: 'pet_friendly', label: 'Pet Friendly', icon: '🐕' },
  { value: 'washer', label: 'Washer', icon: '🧺' },
  { value: 'dryer', label: 'Dryer', icon: '🌀' },
  { value: 'iron', label: 'Iron', icon: '👔' },
  { value: 'hairdryer', label: 'Hair Dryer', icon: '💇' },
  { value: 'workspace', label: 'Workspace', icon: '💻' },
  { value: 'gym', label: 'Gym Access', icon: '🏋️' },
  { value: 'bbq', label: 'BBQ Grill', icon: '🍖' },
  { value: 'garden', label: 'Garden', icon: '🌿' },
  { value: 'fireplace', label: 'Fireplace', icon: '🔥' },
  { value: 'hot_tub', label: 'Hot Tub', icon: '🛁' },
];

const STATUS_OPTIONS = [
  { value: 'Available', label: 'Available', color: 'green' },
  { value: 'Occupied', label: 'Occupied', color: 'blue' },
  { value: 'Maintenance', label: 'Maintenance', color: 'orange' },
  { value: 'Unavailable', label: 'Unavailable', color: 'red' },
];

const SECTIONS = [
  { key: 'property', label: 'Property Details', icon: <HomeOutlined /> },
  { key: 'photos', label: 'Photos', icon: <PictureOutlined /> },
  { key: 'amenities', label: 'Amenities', icon: <StarOutlined /> },
  { key: 'description', label: 'Description', icon: <FileTextOutlined /> },
  { key: 'pricing', label: 'Pricing', icon: <DollarOutlined /> },
  { key: 'availability', label: 'Availability & Rules', icon: <ClockCircleOutlined /> },
  { key: 'status', label: 'Status', icon: <SettingOutlined /> },
];

const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return imageUrl;
};

// ============================================================================
// SECTION SUMMARIES
// ============================================================================

function PropertySummary({ formData }) {
  return (
    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
      {formData.name && <div className="font-medium text-slate-700 truncate">{formData.name}</div>}
      {formData.type && <div>{formData.type} · {formData.capacity || '—'} guests</div>}
    </div>
  );
}

function PhotosSummary({ formData }) {
  const photoCount = (formData.images?.length || 0) + (formData.image_url ? 1 : 0);
  return (
    <div className="text-xs text-slate-500 mt-1">
      {photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? 's' : ''}` : 'No photos yet'}
    </div>
  );
}

function AmenitiesSummary({ formData }) {
  const amenityCount = formData.amenities?.length || 0;
  const selectedAmenities = AMENITIES_OPTIONS.filter(a => formData.amenities?.includes(a.value));
  return (
    <div className="text-xs text-slate-500 mt-1">
      {amenityCount > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedAmenities.slice(0, 4).map(a => (
            <span key={a.value}>{a.icon}</span>
          ))}
          {amenityCount > 4 && <span className="text-slate-400">+{amenityCount - 4}</span>}
        </div>
      ) : 'None selected'}
    </div>
  );
}

function DescriptionSummary({ formData }) {
  return (
    <div className="text-xs text-slate-500 mt-1 truncate max-w-[200px]">
      {formData.description || 'No description yet'}
    </div>
  );
}

function PricingSummary({ formData }) {
  const discountCount = (formData.custom_discounts || []).length;
  const holidayCount = (formData.holiday_pricing || []).length;
  return (
    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
      {formData.price_per_night ? (
        <>
          <div className="font-medium text-slate-700">€{parseFloat(formData.price_per_night).toFixed(0)}/night</div>
          {formData.weekend_price && (
            <div>€{parseFloat(formData.weekend_price).toFixed(0)} weekend</div>
          )}
          {discountCount > 0 && (
            <div>{discountCount} discount{discountCount !== 1 ? 's' : ''}</div>
          )}
          {holidayCount > 0 && (
            <div>{holidayCount} holiday rate{holidayCount !== 1 ? 's' : ''}</div>
          )}
        </>
      ) : 'Set your pricing'}
    </div>
  );
}

function AvailabilitySummary({ formData }) {
  return (
    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
      {formData.min_nights && <div>Min {formData.min_nights} night{formData.min_nights !== 1 ? 's' : ''}</div>}
      {formData.max_guests && <div>Max {formData.max_guests} guests</div>}
      {formData.check_in_time && <div>Check-in {formData.check_in_time}</div>}
    </div>
  );
}

function StatusSummary({ formData }) {
  return (
    <div className="text-xs mt-1">
      {formData.status ? (
        <Tag color={STATUS_OPTIONS.find(s => s.value === formData.status)?.color || 'default'} className="text-xs">
          {formData.status}
        </Tag>
      ) : 'Not set'}
    </div>
  );
}

const SUMMARY_MAP = {
  property: PropertySummary,
  photos: PhotosSummary,
  amenities: AmenitiesSummary,
  description: DescriptionSummary,
  pricing: PricingSummary,
  availability: AvailabilitySummary,
  status: StatusSummary,
};

// ============================================================================
// LEFT PANEL - SECTION NAVIGATION + SUMMARY
// ============================================================================

function SectionNav({ activeSection, onSectionChange, formData, isMobile }) {
  const renderSummary = (sectionKey) => {
    const SummaryComponent = SUMMARY_MAP[sectionKey];
    return SummaryComponent ? <SummaryComponent formData={formData} /> : null;
  };

  // Check if section has content
  const isSectionFilled = (sectionKey) => {
    switch (sectionKey) {
      case 'property': return !!(formData.name && formData.type);
      case 'photos': return !!(formData.image_url || formData.images?.length > 0);
      case 'amenities': return formData.amenities?.length > 0;
      case 'description': return !!formData.description;
      case 'pricing': return !!formData.price_per_night;
      case 'availability': return !!(formData.check_in_time || formData.min_nights);
      case 'status': return !!formData.status;
      default: return false;
    }
  };

  if (isMobile) {
    // Mobile: Horizontal scrollable pill nav
    return (
      <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            onClick={() => onSectionChange(section.key)}
            className={`
              flex-shrink-0 px-3 py-2 rounded-full text-xs font-medium
              transition-all duration-200 border whitespace-nowrap
              ${activeSection === section.key
                ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm'
                : isSectionFilled(section.key)
                  ? 'bg-white text-slate-700 border-slate-200'
                  : 'bg-white text-slate-400 border-slate-100'
              }
            `}
          >
            <span className="mr-1.5">{section.icon}</span>
            {section.label}
            {isSectionFilled(section.key) && activeSection !== section.key && (
              <CheckCircleOutlined className="ml-1 text-green-500" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {SECTIONS.map((section) => (
        <button
          key={section.key}
          onClick={() => onSectionChange(section.key)}
          className={`
            w-full text-left px-4 py-3 rounded-xl transition-all duration-200
            ${activeSection === section.key
              ? 'bg-orange-50 border border-orange-200 shadow-sm'
              : 'hover:bg-slate-50 border border-transparent'
            }
          `}
        >
          <div className="flex items-center gap-3">
            <span className={`text-base ${activeSection === section.key ? 'text-orange-600' : 'text-slate-400'}`}>
              {section.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${activeSection === section.key ? 'text-orange-700' : 'text-slate-700'}`}>
                  {section.label}
                </span>
                {isSectionFilled(section.key) && activeSection !== section.key && (
                  <CheckCircleOutlined className="text-green-500 text-xs" />
                )}
              </div>
              {renderSummary(section.key)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}


// ============================================================================
// RIGHT PANEL SECTIONS
// ============================================================================

function PropertySection({ formData, onChange, unitTypes }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Property Details</h3>
        <p className="text-sm text-slate-500">Basic information about your accommodation unit.</p>
      </div>

      <div className="space-y-5">
        {/* Unit Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Unit Name *</label>
          <Input
            size="large"
            placeholder="e.g. Ocean View Suite 101"
            value={formData.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            className="rounded-lg"
          />
          <p className="text-xs text-slate-400 mt-1">Give your unit a descriptive name guests will remember.</p>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Property Type *</label>
          <Select
            size="large"
            placeholder="Select property type"
            value={formData.type || undefined}
            onChange={(val) => onChange('type', val)}
            className="w-full"
            showSearch
            allowClear
          >
            {unitTypes.map(type => (
              <Option key={type} value={type}>{type}</Option>
            ))}
          </Select>
        </div>

        {/* Ownership Category */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Ownership</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange('category', 'own')}
              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                (formData.category || 'own') === 'own'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
              }`}
            >
              Our Property
            </button>
            <button
              type="button"
              onClick={() => onChange('category', 'hotel')}
              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                formData.category === 'hotel'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
              }`}
            >
              Hotel (External)
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Hotel bookings appear in the Hotel Requests tab.</p>
        </div>

        {/* Capacity */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Maximum Guests *</label>
          <InputNumber
            size="large"
            min={1}
            max={50}
            value={formData.capacity || undefined}
            onChange={(val) => onChange('capacity', val)}
            className="w-full"
            placeholder="How many guests can stay?"
          />
          <p className="text-xs text-slate-400 mt-1">The maximum number of guests allowed.</p>
        </div>
      </div>
    </div>
  );
}

function PhotosSection({ formData, onChange, imageLoading, setImageLoading }) {
  const { message } = App.useApp();

  const handleMainImageUpload = async ({ file }) => {
    try {
      setImageLoading(true);
      const fd = new FormData();
      fd.append('image', file);
      const response = await apiClient.post('/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = response.data?.url || response.data?.imageUrl || response.data;
      if (url) {
        onChange('image_url', typeof url === 'string' ? url : url.toString());
      }
    } catch {
      message.error('Failed to upload image');
    } finally {
      setImageLoading(false);
    }
  };

  const handleGalleryUpload = async (fileList) => {
    const currentImages = formData.images || [];
    if (currentImages.length + fileList.length > 10) {
      message.error('Maximum 10 gallery images allowed');
      return;
    }
    setImageLoading(true);
    try {
      const fd = new FormData();
      fileList.forEach((file) => fd.append('images', file));
      const response = await apiClient.post('/upload/images', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Backend returns { images: [{ url, filename, ... }], count }
      const data = response.data;
      let urls;
      if (Array.isArray(data?.images)) {
        urls = data.images.map((img) => (typeof img === 'string' ? img : img.url));
      } else if (Array.isArray(data?.urls)) {
        urls = data.urls;
      } else if (Array.isArray(data?.imageUrls)) {
        urls = data.imageUrls;
      } else if (Array.isArray(data)) {
        urls = data.map((img) => (typeof img === 'string' ? img : img.url));
      }
      if (Array.isArray(urls) && urls.length > 0) {
        onChange('images', [...currentImages, ...urls]);
      }
    } catch {
      message.error('Failed to upload images');
    } finally {
      setImageLoading(false);
    }
  };

  const removeGalleryImage = (index) => {
    const updated = [...(formData.images || [])];
    updated.splice(index, 1);
    onChange('images', updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Photos</h3>
        <p className="text-sm text-slate-500">Add photos to showcase your accommodation. High-quality images attract more bookings.</p>
      </div>

      {/* Main Photo */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Cover Photo</label>
        <Upload
          name="image"
          listType="picture-card"
          showUploadList={false}
          customRequest={handleMainImageUpload}
          accept="image/*"
          className="main-photo-upload"
        >
          {formData.image_url ? (
            <div className="relative w-full h-full group">
              <img
                src={getImageUrl(formData.image_url)}
                alt="Cover"
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                <span className="text-white text-sm font-medium">Change Photo</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-slate-400">
              {imageLoading ? <LoadingOutlined className="text-xl" /> : <PictureOutlined className="text-2xl" />}
              <div className="mt-2 text-sm">Upload Cover Photo</div>
            </div>
          )}
        </Upload>
        <p className="text-xs text-slate-400 mt-1">This will be the main image guests see first.</p>
      </div>

      {/* Gallery */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Gallery ({formData.images?.length || 0}/10)
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {(formData.images || []).map((img, index) => (
            <div key={`gallery-${index}`} className="relative aspect-square rounded-xl overflow-hidden group border border-slate-200">
              <img
                src={getImageUrl(img)}
                alt={`Gallery ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeGalleryImage(index)}
                className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <DeleteOutlined className="text-xs" />
              </button>
            </div>
          ))}
          {(formData.images?.length || 0) < 10 && (
            <Upload
              name="images"
              showUploadList={false}
              beforeUpload={(file, fileList) => {
                // beforeUpload fires per-file; only trigger upload on the first file
                if (file === fileList[0]) {
                  handleGalleryUpload(fileList);
                }
                return false;
              }}
              accept="image/*"
              multiple
              disabled={imageLoading}
            >
              <div className="aspect-square rounded-xl border-2 border-dashed border-slate-200 hover:border-orange-300 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-orange-50">
                {imageLoading ? (
                  <LoadingOutlined className="text-xl text-slate-400" />
                ) : (
                  <>
                    <PlusOutlined className="text-xl text-slate-400" />
                    <span className="text-xs text-slate-400 mt-1">Add Photos</span>
                  </>
                )}
              </div>
            </Upload>
          )}
        </div>
      </div>
    </div>
  );
}

function AmenitiesSection({ formData, onChange }) {
  const selectedAmenities = formData.amenities || [];

  const toggleAmenity = (value) => {
    const updated = selectedAmenities.includes(value)
      ? selectedAmenities.filter(a => a !== value)
      : [...selectedAmenities, value];
    onChange('amenities', updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Amenities</h3>
        <p className="text-sm text-slate-500">Select the amenities and facilities available in this unit.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AMENITIES_OPTIONS.map((amenity) => {
          const isSelected = selectedAmenities.includes(amenity.value);
          return (
            <button
              key={amenity.value}
              onClick={() => toggleAmenity(amenity.value)}
              className={`
                flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left
                ${isSelected
                  ? 'border-orange-400 bg-orange-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                }
              `}
            >
              <span className="text-xl flex-shrink-0">{amenity.icon}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-orange-700' : 'text-slate-600'}`}>
                {amenity.label}
              </span>
              {isSelected && (
                <CheckCircleOutlined className="ml-auto text-orange-500" />
              )}
            </button>
          );
        })}
      </div>

      {selectedAmenities.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Selected ({selectedAmenities.length})</div>
          <div className="flex flex-wrap gap-2">
            {AMENITIES_OPTIONS.filter(a => selectedAmenities.includes(a.value)).map(a => (
              <Tag
                key={a.value}
                closable
                onClose={() => toggleAmenity(a.value)}
                className="rounded-full px-3 py-1 border-none bg-white shadow-sm"
              >
                {a.icon} {a.label}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DescriptionSection({ formData, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Description</h3>
        <p className="text-sm text-slate-500">Tell guests what makes your place special.</p>
      </div>

      <div>
        <TextArea
          rows={8}
          placeholder="Describe your accommodation unit... What will guests love about staying here? Mention the location, atmosphere, nearby attractions, or any special features."
          value={formData.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          maxLength={2000}
          showCount
          className="rounded-lg"
        />
        <p className="text-xs text-slate-400 mt-2">A great description helps guests decide to book. Be detailed and highlight what makes this place unique.</p>
      </div>
    </div>
  );
}

function DiscountRow({ discount, index, pricePerNight, onUpdate, onRemove }) {
  const totalNights = discount.min_nights || 0;
  const amount = discount.discount_value || 0;
  const discountedNightly = discount.discount_type === 'percentage'
    ? pricePerNight * (1 - amount / 100)
    : pricePerNight - amount;
  const showPreview = pricePerNight > 0 && amount > 0 && totalNights > 0;

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
              <Input
                size="small"
                value={discount.label || ''}
                onChange={(e) => onUpdate(index, 'label', e.target.value)}
                placeholder="e.g. Weekly, Bi-weekly, Monthly"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-slate-600 mb-1">Min. Nights</label>
              <InputNumber
                size="small"
                min={1}
                max={365}
                value={discount.min_nights || undefined}
                onChange={(val) => onUpdate(index, 'min_nights', val)}
                className="w-full"
                placeholder="7"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="w-32">
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <Select
                size="small"
                value={discount.discount_type || 'percentage'}
                onChange={(val) => onUpdate(index, 'discount_type', val)}
                className="w-full"
              >
                <Option value="percentage">Percentage (%)</Option>
                <Option value="fixed">Fixed (€)</Option>
              </Select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
              <InputNumber
                size="small"
                min={0}
                max={discount.discount_type === 'percentage' ? 80 : 9999}
                value={discount.discount_value || undefined}
                onChange={(val) => onUpdate(index, 'discount_value', val)}
                className="w-full"
                placeholder="0"
              />
            </div>
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="ml-2 mt-1 text-slate-400 hover:text-red-500 transition-colors"
        >
          <DeleteOutlined className="text-sm" />
        </button>
      </div>
      {showPreview && (
        <div className="bg-green-50 text-green-700 rounded-lg px-3 py-2 text-xs">
          {totalNights}+ nights: avg €{Math.max(0, discountedNightly).toFixed(0)}/night
          = €{(Math.max(0, discountedNightly) * totalNights).toFixed(0)} total
        </div>
      )}
    </div>
  );
}

function HolidayRow({ holiday, index, onUpdate, onRemove }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Holiday Name</label>
              <Input
                size="small"
                value={holiday.label || ''}
                onChange={(e) => onUpdate(index, 'label', e.target.value)}
                placeholder="e.g. Christmas, New Year's Eve"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-slate-600 mb-1">Price/Night</label>
              <InputNumber
                size="small"
                min={0}
                step={1}
                value={holiday.price_per_night || undefined}
                onChange={(val) => onUpdate(index, 'price_per_night', val)}
                className="w-full"
                placeholder="€"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
              <DatePicker
                size="small"
                className="w-full"
                value={holiday.start_date ? dayjs(holiday.start_date) : null}
                onChange={(date) => onUpdate(index, 'start_date', date ? date.format('YYYY-MM-DD') : null)}
                placeholder="Start"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <DatePicker
                size="small"
                className="w-full"
                value={holiday.end_date ? dayjs(holiday.end_date) : null}
                onChange={(date) => onUpdate(index, 'end_date', date ? date.format('YYYY-MM-DD') : null)}
                disabledDate={(d) => holiday.start_date ? d.isBefore(dayjs(holiday.start_date), 'day') : false}
                placeholder="End"
              />
            </div>
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="ml-2 mt-1 text-slate-400 hover:text-red-500 transition-colors"
        >
          <DeleteOutlined className="text-sm" />
        </button>
      </div>
      {holiday.start_date && holiday.end_date && holiday.price_per_night > 0 && (
        <div className="mt-3 bg-amber-50 text-amber-700 rounded-lg px-3 py-2 text-xs">
          {dayjs(holiday.start_date).format('MMM D')} – {dayjs(holiday.end_date).format('MMM D, YYYY')} • €{holiday.price_per_night}/night
        </div>
      )}
    </div>
  );
}

function PricingSection({ formData, onChange }) {
  const customDiscounts = formData.custom_discounts || [];
  const holidayPricing = formData.holiday_pricing || [];

  const updateDiscount = (index, field, value) => {
    const updated = [...customDiscounts];
    updated[index] = { ...updated[index], [field]: value };
    onChange('custom_discounts', updated);
  };

  const addDiscount = () => {
    onChange('custom_discounts', [
      ...customDiscounts,
      { label: '', min_nights: null, discount_type: 'percentage', discount_value: null },
    ]);
  };

  const removeDiscount = (index) => {
    onChange('custom_discounts', customDiscounts.filter((_, i) => i !== index));
  };

  const updateHoliday = (index, field, value) => {
    const updated = [...holidayPricing];
    updated[index] = { ...updated[index], [field]: value };
    onChange('holiday_pricing', updated);
  };

  const addHoliday = () => {
    onChange('holiday_pricing', [
      ...holidayPricing,
      { label: '', start_date: null, end_date: null, price_per_night: null },
    ]);
  };

  const removeHoliday = (index) => {
    onChange('holiday_pricing', holidayPricing.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Pricing</h3>
        <p className="text-sm text-slate-500">Set your nightly rates, length-of-stay discounts, and holiday pricing.</p>
      </div>

      {/* Nightly Price */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nightly Price *</label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-400">€</span>
            <InputNumber
              size="large"
              min={0}
              step={1}
              value={formData.price_per_night || undefined}
              onChange={(val) => onChange('price_per_night', val)}
              className="flex-1"
              placeholder="0"
            />
            <span className="text-sm text-slate-500">per night</span>
          </div>
        </div>

        <Divider className="my-0" />

        {/* Weekend Price */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700">Custom Weekend Price</label>
            <Switch
              size="small"
              checked={!!formData.weekend_price}
              onChange={(checked) => onChange('weekend_price', checked ? formData.price_per_night : null)}
            />
          </div>
          {formData.weekend_price !== null && formData.weekend_price !== undefined && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-lg font-semibold text-slate-400">€</span>
              <InputNumber
                size="large"
                min={0}
                step={1}
                value={formData.weekend_price || undefined}
                onChange={(val) => onChange('weekend_price', val)}
                className="flex-1"
                placeholder="0"
              />
              <span className="text-sm text-slate-500">Fri–Sun</span>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">Set a different rate for Friday, Saturday, and Sunday nights.</p>
        </div>
      </div>

      {/* Discounts */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Length-of-Stay Discounts</h4>
            <p className="text-xs text-slate-400 mt-0.5">Reward guests who book longer stays with discounted rates.</p>
          </div>
        </div>

        {customDiscounts.length > 0 && (
          <div className="space-y-3">
            {customDiscounts.map((disc, idx) => (
              <DiscountRow
                key={`disc-${idx}`}
                discount={disc}
                index={idx}
                pricePerNight={formData.price_per_night || 0}
                onUpdate={updateDiscount}
                onRemove={removeDiscount}
              />
            ))}
          </div>
        )}

        <Button
          type="dashed"
          onClick={addDiscount}
          icon={<PlusOutlined />}
          block
          className="!border-slate-300 !text-slate-500 hover:!border-orange-300 hover:!text-orange-500"
        >
          Add Discount Rule
        </Button>

        {customDiscounts.length === 0 && (
          <p className="text-xs text-slate-400 text-center">
            Example: 10% off for 7+ nights, 20% off for 28+ nights
          </p>
        )}
      </div>

      {/* Holiday / Special Pricing */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <CalendarOutlined className="text-amber-500" /> Holiday & Special Pricing
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Override the nightly rate for specific date ranges — holidays, peak season, events, etc.</p>
          </div>
        </div>

        {holidayPricing.length > 0 && (
          <div className="space-y-3">
            {holidayPricing.map((holiday, idx) => (
              <HolidayRow
                key={`holiday-${idx}`}
                holiday={holiday}
                index={idx}
                onUpdate={updateHoliday}
                onRemove={removeHoliday}
              />
            ))}
          </div>
        )}

        <Button
          type="dashed"
          onClick={addHoliday}
          icon={<PlusOutlined />}
          block
          className="!border-amber-300 !text-amber-600 hover:!border-amber-400 hover:!text-amber-700"
        >
          Add Holiday / Special Rate
        </Button>

        {holidayPricing.length === 0 && (
          <p className="text-xs text-slate-400 text-center">
            Example: Christmas (Dec 23 – Jan 2) at €200/night
          </p>
        )}
      </div>
    </div>
  );
}

function CheckInOutCard({ formData, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <h4 className="text-sm font-semibold text-slate-800">Check-in & Check-out</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Check-in Time</label>
          <TimePicker
            format="HH:mm"
            size="large"
            className="w-full"
            placeholder="14:00"
            minuteStep={30}
            value={formData.check_in_time ? dayjs(formData.check_in_time, 'HH:mm') : undefined}
            onChange={(time) => onChange('check_in_time', time ? time.format('HH:mm') : null)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Check-out Time</label>
          <TimePicker
            format="HH:mm"
            size="large"
            className="w-full"
            placeholder="11:00"
            minuteStep={30}
            value={formData.check_out_time ? dayjs(formData.check_out_time, 'HH:mm') : undefined}
            onChange={(time) => onChange('check_out_time', time ? time.format('HH:mm') : null)}
          />
        </div>
      </div>
    </div>
  );
}

function StayRequirementsCard({ formData, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <h4 className="text-sm font-semibold text-slate-800">Stay Requirements</h4>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Minimum Nights</div>
          <p className="text-xs text-slate-400">Shortest stay allowed</p>
        </div>
        <InputNumber size="small" min={1} max={365} value={formData.min_nights || 1} onChange={(val) => onChange('min_nights', val)} className="w-20" />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Maximum Nights</div>
          <p className="text-xs text-slate-400">Longest stay allowed</p>
        </div>
        <InputNumber size="small" min={1} max={730} value={formData.max_nights || 365} onChange={(val) => onChange('max_nights', val)} className="w-20" />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Advance Notice</div>
          <p className="text-xs text-slate-400">Days before check-in</p>
        </div>
        <InputNumber size="small" min={0} max={365} value={formData.advance_notice_days || 1} onChange={(val) => onChange('advance_notice_days', val)} className="w-20" addonAfter="days" />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Maximum Guests</div>
          <p className="text-xs text-slate-400">Guests per booking</p>
        </div>
        <InputNumber size="small" min={1} max={50} value={formData.max_guests || formData.capacity || 2} onChange={(val) => onChange('max_guests', val)} className="w-20" />
      </div>
    </div>
  );
}

function HouseRulesCard({ formData, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h4 className="text-sm font-semibold text-slate-800">House Rules</h4>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚬</span>
          <span className="text-sm font-medium text-slate-700">Smoking Allowed</span>
        </div>
        <Switch checked={formData.smoking_allowed || false} onChange={(val) => onChange('smoking_allowed', val)} />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🐕</span>
          <span className="text-sm font-medium text-slate-700">Pets Allowed</span>
        </div>
        <Switch checked={formData.pets_allowed || false} onChange={(val) => onChange('pets_allowed', val)} />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎉</span>
          <span className="text-sm font-medium text-slate-700">Events/Parties Allowed</span>
        </div>
        <Switch checked={formData.events_allowed || false} onChange={(val) => onChange('events_allowed', val)} />
      </div>

      <Divider className="my-0" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔇</span>
          <span className="text-sm font-medium text-slate-700">Quiet Hours</span>
        </div>
        <Switch checked={formData.quiet_hours || false} onChange={(val) => onChange('quiet_hours', val)} />
      </div>
      {formData.quiet_hours && (
        <div className="grid grid-cols-2 gap-3 ml-8">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <TimePicker
              format="HH:mm"
              size="small"
              className="w-full"
              placeholder="22:00"
              minuteStep={30}
              value={formData.quiet_hours_start ? dayjs(formData.quiet_hours_start, 'HH:mm') : undefined}
              onChange={(time) => onChange('quiet_hours_start', time ? time.format('HH:mm') : null)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <TimePicker
              format="HH:mm"
              size="small"
              className="w-full"
              placeholder="08:00"
              minuteStep={30}
              value={formData.quiet_hours_end ? dayjs(formData.quiet_hours_end, 'HH:mm') : undefined}
              onChange={(time) => onChange('quiet_hours_end', time ? time.format('HH:mm') : null)}
            />
          </div>
        </div>
      )}

      <Divider className="my-0" />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Rules</label>
        <TextArea
          rows={3}
          placeholder="Any additional rules or instructions for guests..."
          value={formData.additional_rules || ''}
          onChange={(e) => onChange('additional_rules', e.target.value)}
          maxLength={500}
          showCount
        />
      </div>
    </div>
  );
}

function AvailabilitySection({ formData, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Availability & Rules</h3>
        <p className="text-sm text-slate-500">Set check-in/out times, stay requirements, and house rules.</p>
      </div>
      <CheckInOutCard formData={formData} onChange={onChange} />
      <StayRequirementsCard formData={formData} onChange={onChange} />
      <HouseRulesCard formData={formData} onChange={onChange} />
    </div>
  );
}

function StatusSection({ formData, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Status</h3>
        <p className="text-sm text-slate-500">Control the availability of this accommodation unit.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STATUS_OPTIONS.map((status) => {
          const isSelected = formData.status === status.value;
          const bgColors = {
            Available: 'border-green-400 bg-green-50',
            Occupied: 'border-blue-400 bg-blue-50',
            Maintenance: 'border-orange-400 bg-orange-50',
            Unavailable: 'border-red-400 bg-red-50',
          };
          const descriptions = {
            Available: 'Ready for bookings. Guests can reserve this unit.',
            Occupied: 'Currently occupied by a guest.',
            Maintenance: 'Under maintenance. Not available for bookings.',
            Unavailable: 'Not available. Hidden from guests.',
          };
          return (
            <button
              key={status.value}
              onClick={() => onChange('status', status.value)}
              className={`
                p-4 rounded-xl border-2 text-left transition-all duration-200
                ${isSelected ? bgColors[status.value] + ' shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                <Tag color={status.color} className="text-xs border-none">{status.label}</Tag>
                {isSelected && <CheckCircleOutlined className="text-green-500" />}
              </div>
              <p className="text-xs text-slate-500">{descriptions[status.value]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ============================================================================
// HELPERS
// ============================================================================

const DEFAULT_FORM_DATA = {
  name: '',
  type: undefined,
  category: 'own',
  capacity: undefined,
  price_per_night: undefined,
  description: '',
  amenities: [],
  status: 'Available',
  image_url: null,
  images: [],
  weekend_price: null,
  custom_discounts: [],
  holiday_pricing: [],
  check_in_time: '14:00',
  check_out_time: '11:00',
  min_nights: 1,
  max_nights: 365,
  advance_notice_days: 1,
  max_guests: undefined,
  smoking_allowed: false,
  pets_allowed: false,
  events_allowed: false,
  quiet_hours: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  additional_rules: '',
};

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

const META_DEFAULTS = {
  weekend_price: null,
  custom_discounts: [],
  holiday_pricing: [],
  check_in_time: '14:00',
  check_out_time: '11:00',
  min_nights: 1,
  max_nights: 365,
  advance_notice_days: 1,
  max_guests: undefined,
  smoking_allowed: false,
  pets_allowed: false,
  events_allowed: false,
  quiet_hours: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  additional_rules: '',
};

function buildFormDataFromUnit(unit) {
  const amenitiesList = parseJsonArray(unit.amenities);
  const imagesList = parseJsonArray(unit.images);
  const meta = { ...META_DEFAULTS, ...(unit.meta || {}) };
  if (!meta.max_guests) meta.max_guests = unit.capacity;

  return {
    name: unit.name || '',
    type: unit.type || undefined,
    category: unit.category || 'own',
    capacity: unit.capacity || undefined,
    price_per_night: unit.price_per_night ? parseFloat(unit.price_per_night) : undefined,
    description: unit.description || '',
    amenities: amenitiesList,
    status: unit.status || 'Available',
    image_url: unit.image_url || null,
    images: imagesList,
    ...meta,
  };
}

function buildSavePayload(formData) {
  const meta = {
    weekend_price: formData.weekend_price,
    custom_discounts: formData.custom_discounts || [],
    holiday_pricing: formData.holiday_pricing || [],
    check_in_time: formData.check_in_time,
    check_out_time: formData.check_out_time,
    min_nights: formData.min_nights,
    max_nights: formData.max_nights,
    advance_notice_days: formData.advance_notice_days,
    max_guests: formData.max_guests || formData.capacity,
    smoking_allowed: formData.smoking_allowed,
    pets_allowed: formData.pets_allowed,
    events_allowed: formData.events_allowed,
    quiet_hours: formData.quiet_hours,
    quiet_hours_start: formData.quiet_hours_start,
    quiet_hours_end: formData.quiet_hours_end,
    additional_rules: formData.additional_rules,
  };

  return {
    name: formData.name.trim(),
    type: formData.type,
    category: formData.category || 'own',
    capacity: formData.capacity,
    price_per_night: formData.price_per_night,
    description: formData.description || '',
    amenities: [...(formData.amenities || []), `__meta__${JSON.stringify(meta)}`],
    status: formData.status,
    image_url: formData.image_url,
    images: formData.images || [],
  };
}

function getValidationErrorSection(formData) {
  if (!formData.name?.trim() || !formData.type || !formData.capacity) return 'property';
  if (!formData.price_per_night) return 'pricing';
  if (!formData.status) return 'status';
  return null;
}

// ============================================================================
// EXTRACTED UI PIECES
// ============================================================================

function EditorHeader({ editingUnit, completionSections, isMobile, saving, onClose, onSave }) {
  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14 md:h-16">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeftOutlined />
            <span className="hidden sm:inline text-sm">Back</span>
          </button>
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          <h2 className="text-sm md:text-base font-semibold text-slate-800">
            {editingUnit ? 'Edit Unit' : 'New Accommodation Unit'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-xs text-slate-400">
            {completionSections.filled}/{completionSections.total} sections
          </div>
          <div className="hidden sm:flex gap-1">
            {SECTIONS.map((s, i) => (
              <div
                key={s.key}
                className={`w-2 h-2 rounded-full transition-colors ${i < completionSections.filled ? 'bg-orange-500' : 'bg-slate-200'}`}
              />
            ))}
          </div>
          <Button onClick={onClose} size={isMobile ? 'small' : 'middle'}>Cancel</Button>
          <Button
            type="primary"
            onClick={onSave}
            loading={saving}
            size={isMobile ? 'small' : 'middle'}
            style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
          >
            {editingUnit ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ formData }) {
  if (!formData.name && !formData.image_url) return null;
  return (
    <div className="mt-6 mx-2">
      <Divider className="my-3" />
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
        Preview
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {formData.image_url && (
          <div className="aspect-[4/3] overflow-hidden">
            <img src={getImageUrl(formData.image_url)} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-3">
          <div className="font-semibold text-sm text-slate-800 truncate">{formData.name || 'Unit Name'}</div>
          <div className="text-xs text-slate-500 mt-0.5">{formData.type || 'Type'} · {formData.capacity || '—'} guests</div>
          {formData.price_per_night > 0 && (
            <div className="text-sm font-bold text-slate-800 mt-1">
              €{parseFloat(formData.price_per_night).toFixed(0)}
              <span className="font-normal text-slate-400 text-xs"> /night</span>
            </div>
          )}
          {formData.amenities?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {AMENITIES_OPTIONS.filter(a => formData.amenities.includes(a.value)).slice(0, 5).map(a => (
                <span key={a.value} className="text-xs" title={a.label}>{a.icon}</span>
              ))}
              {formData.amenities.length > 5 && (
                <span className="text-xs text-slate-400">+{formData.amenities.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================

export default function AccommodationUnitEditor({ 
  visible, 
  onClose, 
  onSave, 
  editingUnit = null, 
  unitTypes = [] 
}) {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  
  const [activeSection, setActiveSection] = useState('property');
  const rightPanelRef = useRef(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

  // Initialize form data from editing unit
  useEffect(() => {
    if (editingUnit) {
      setFormData(buildFormDataFromUnit(editingUnit));
    } else {
      setFormData({ ...DEFAULT_FORM_DATA });
      setActiveSection('property');
    }
  }, [editingUnit, visible]);

  const handleFieldChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Validation
  const validate = () => {
    const errors = [];
    if (!formData.name?.trim()) errors.push('Unit name is required');
    if (!formData.type) errors.push('Property type is required');
    if (!formData.capacity || formData.capacity < 1) errors.push('Capacity is required');
    if (!formData.price_per_night || formData.price_per_night <= 0) errors.push('Price per night is required');
    if (!formData.status) errors.push('Status is required');
    return errors;
  };

  const handleSave = async () => {
    const errors = validate();
    if (errors.length > 0) {
      message.error(errors[0]);
      const errorSection = getValidationErrorSection(formData);
      if (errorSection) setActiveSection(errorSection);
      return;
    }

    setSaving(true);
    try {
      const payload = buildSavePayload(formData);
      await onSave(payload, editingUnit?.id);
      message.success(editingUnit ? 'Unit updated successfully!' : 'Unit created successfully!');
      onClose();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save accommodation unit');
    } finally {
      setSaving(false);
    }
  };

  // Section component map
  const sectionProps = { formData, onChange: handleFieldChange };
  const SECTION_COMPONENTS = {
    property: <PropertySection {...sectionProps} unitTypes={unitTypes} />,
    photos: <PhotosSection {...sectionProps} imageLoading={imageLoading} setImageLoading={setImageLoading} />,
    amenities: <AmenitiesSection {...sectionProps} />,
    description: <DescriptionSection {...sectionProps} />,
    pricing: <PricingSection {...sectionProps} />,
    availability: <AvailabilitySection {...sectionProps} />,
    status: <StatusSection {...sectionProps} />,
  };

  // Completion progress
  const completionSections = useMemo(() => {
    let filled = 0;
    if (formData.name && formData.type && formData.capacity) filled++;
    if (formData.image_url || formData.images?.length > 0) filled++;
    if (formData.amenities?.length > 0) filled++;
    if (formData.description) filled++;
    if (formData.price_per_night > 0) filled++;
    if (formData.check_in_time || formData.min_nights) filled++;
    if (formData.status) filled++;
    return { filled, total: SECTIONS.length };
  }, [formData]);

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSection]);

  if (!visible) return null;

  const sectionIdx = SECTIONS.findIndex(s => s.key === activeSection);
  const isFirstSection = sectionIdx === 0;
  const isLastSection = sectionIdx === SECTIONS.length - 1;
  const goPrev = () => { if (sectionIdx > 0) setActiveSection(SECTIONS[sectionIdx - 1].key); };
  const goNext = () => { if (sectionIdx < SECTIONS.length - 1) setActiveSection(SECTIONS[sectionIdx + 1].key); };

  return (
    <div className="fixed inset-0 z-[1000] bg-white flex flex-col">
      <EditorHeader
        editingUnit={editingUnit}
        completionSections={completionSections}
        isMobile={isMobile}
        saving={saving}
        onClose={onClose}
        onSave={handleSave}
      />

      {/* Mobile Section Nav */}
      {isMobile && (
        <div className="flex-shrink-0 bg-white border-b border-slate-100 px-4 py-3">
          <SectionNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            formData={formData}
            isMobile={true}
          />
        </div>
      )}

      {/* Main Content - Two Panel */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex">
          {/* Left Panel - Desktop only */}
          {!isMobile && (
            <div className="w-72 xl:w-80 flex-shrink-0 border-r border-slate-100 overflow-y-auto py-6 px-4">
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4">
                  Sections
                </h3>
              </div>
              <SectionNav
                activeSection={activeSection}
                onSectionChange={setActiveSection}
                formData={formData}
                isMobile={false}
              />

              {/* Quick Preview Card */}
              <PreviewCard formData={formData} />
            </div>
          )}

          {/* Right Panel - Editor */}
          <div ref={rightPanelRef} className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-6 md:py-8 px-4 md:px-8">
              {SECTION_COMPONENTS[activeSection] || null}
              
              {/* Navigation Buttons */}
              <div className="flex justify-between items-center mt-8 pt-6 border-t border-slate-100">
                <Button disabled={isFirstSection} onClick={goPrev}>
                  ← Previous
                </Button>
                {isLastSection ? (
                  <Button
                    type="primary"
                    onClick={handleSave}
                    loading={saving}
                    style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
                    size="large"
                  >
                    {editingUnit ? 'Update Unit' : 'Create Unit'}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    onClick={goNext}
                    style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
                  >
                    Next →
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
