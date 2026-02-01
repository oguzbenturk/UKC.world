/**
 * Form Preview Component
 * Renders a preview of the form as users will see it
 */

/* eslint-disable complexity */

import { useState, useRef, useEffect } from 'react';
import { 
  Form, 
  Input, 
  Select, 
  Checkbox, 
  Radio, 
  DatePicker, 
  TimePicker,
  InputNumber,
  Rate,
  Upload,
  Button,
  Steps,
  Card,
  Typography,
  Space,
  Divider,
  Row,
  Col,
  Switch,
  Slider,
  Image
} from 'antd';
import { UploadOutlined, InboxOutlined, PlusOutlined, GlobalOutlined } from '@ant-design/icons';
import { FIELD_TYPES, WIDTH_OPTIONS } from '../constants/fieldTypes';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

// Comprehensive list of ALL countries with flags and phone codes
const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', phone: '+93' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱', phone: '+355' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', phone: '+213' },
  { code: 'AD', name: 'Andorra', flag: '🇦🇩', phone: '+376' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴', phone: '+244' },
  { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬', phone: '+1-268' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', phone: '+54' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲', phone: '+374' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', phone: '+61' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', phone: '+43' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', phone: '+994' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸', phone: '+1-242' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', phone: '+973' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', phone: '+880' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧', phone: '+1-246' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾', phone: '+375' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', phone: '+32' },
  { code: 'BZ', name: 'Belize', flag: '🇧🇿', phone: '+501' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', phone: '+229' },
  { code: 'BT', name: 'Bhutan', flag: '🇧🇹', phone: '+975' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', phone: '+591' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', phone: '+387' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼', phone: '+267' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', phone: '+55' },
  { code: 'BN', name: 'Brunei', flag: '🇧🇳', phone: '+673' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', phone: '+359' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', phone: '+226' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮', phone: '+257' },
  { code: 'CV', name: 'Cabo Verde', flag: '🇨🇻', phone: '+238' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭', phone: '+855' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', phone: '+237' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', phone: '+1' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', phone: '+236' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩', phone: '+235' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', phone: '+56' },
  { code: 'CN', name: 'China', flag: '🇨🇳', phone: '+86' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', phone: '+57' },
  { code: 'KM', name: 'Comoros', flag: '🇰🇲', phone: '+269' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', phone: '+242' },
  { code: 'CD', name: 'Congo (DRC)', flag: '🇨🇩', phone: '+243' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', phone: '+506' },
  { code: 'CI', name: 'Côte d\'Ivoire', flag: '🇨🇮', phone: '+225' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷', phone: '+385' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', phone: '+53' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾', phone: '+357' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', phone: '+420' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', phone: '+45' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', phone: '+253' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲', phone: '+1-767' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', phone: '+1-809' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', phone: '+593' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', phone: '+20' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻', phone: '+503' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', phone: '+240' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷', phone: '+291' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', phone: '+372' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', phone: '+268' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', phone: '+251' },
  { code: 'FJ', name: 'Fiji', flag: '🇫🇯', phone: '+679' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', phone: '+358' },
  { code: 'FR', name: 'France', flag: '🇫🇷', phone: '+33' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', phone: '+241' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲', phone: '+220' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪', phone: '+995' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', phone: '+49' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', phone: '+233' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', phone: '+30' },
  { code: 'GD', name: 'Grenada', flag: '🇬🇩', phone: '+1-473' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', phone: '+502' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', phone: '+224' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', phone: '+245' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾', phone: '+592' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹', phone: '+509' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳', phone: '+504' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺', phone: '+36' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸', phone: '+354' },
  { code: 'IN', name: 'India', flag: '🇮🇳', phone: '+91' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', phone: '+62' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷', phone: '+98' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶', phone: '+964' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', phone: '+353' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', phone: '+972' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', phone: '+39' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', phone: '+1-876' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', phone: '+81' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴', phone: '+962' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', phone: '+7' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', phone: '+254' },
  { code: 'KI', name: 'Kiribati', flag: '🇰🇮', phone: '+686' },
  { code: 'KP', name: 'North Korea', flag: '🇰🇵', phone: '+850' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', phone: '+82' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', phone: '+965' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', phone: '+996' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦', phone: '+856' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻', phone: '+371' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧', phone: '+961' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸', phone: '+266' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷', phone: '+231' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾', phone: '+218' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', phone: '+423' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹', phone: '+370' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', phone: '+352' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬', phone: '+261' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼', phone: '+265' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', phone: '+60' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻', phone: '+960' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', phone: '+223' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', phone: '+356' },
  { code: 'MH', name: 'Marshall Islands', flag: '🇲🇭', phone: '+692' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷', phone: '+222' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺', phone: '+230' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', phone: '+52' },
  { code: 'FM', name: 'Micronesia', flag: '🇫🇲', phone: '+691' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩', phone: '+373' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', phone: '+377' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳', phone: '+976' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪', phone: '+382' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', phone: '+212' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', phone: '+258' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲', phone: '+95' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦', phone: '+264' },
  { code: 'NR', name: 'Nauru', flag: '🇳🇷', phone: '+674' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', phone: '+977' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', phone: '+31' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', phone: '+64' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', phone: '+505' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', phone: '+227' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', phone: '+234' },
  { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', phone: '+389' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', phone: '+47' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', phone: '+968' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', phone: '+92' },
  { code: 'PW', name: 'Palau', flag: '🇵🇼', phone: '+680' },
  { code: 'PS', name: 'Palestine', flag: '🇵🇸', phone: '+970' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦', phone: '+507' },
  { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', phone: '+675' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', phone: '+595' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', phone: '+51' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', phone: '+63' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', phone: '+48' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', phone: '+351' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', phone: '+974' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', phone: '+40' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', phone: '+7' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', phone: '+250' },
  { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳', phone: '+1-869' },
  { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', phone: '+1-758' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', phone: '+1-784' },
  { code: 'WS', name: 'Samoa', flag: '🇼🇸', phone: '+685' },
  { code: 'SM', name: 'San Marino', flag: '🇸🇲', phone: '+378' },
  { code: 'ST', name: 'São Tomé and Príncipe', flag: '🇸🇹', phone: '+239' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', phone: '+966' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', phone: '+221' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', phone: '+381' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨', phone: '+248' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', phone: '+232' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', phone: '+65' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰', phone: '+421' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', phone: '+386' },
  { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', phone: '+677' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴', phone: '+252' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', phone: '+27' },
  { code: 'SS', name: 'South Sudan', flag: '🇸🇸', phone: '+211' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', phone: '+34' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', phone: '+94' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩', phone: '+249' },
  { code: 'SR', name: 'Suriname', flag: '🇸🇷', phone: '+597' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', phone: '+46' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', phone: '+41' },
  { code: 'SY', name: 'Syria', flag: '🇸🇾', phone: '+963' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', phone: '+886' },
  { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', phone: '+992' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', phone: '+255' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', phone: '+66' },
  { code: 'TL', name: 'Timor-Leste', flag: '🇹🇱', phone: '+670' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', phone: '+228' },
  { code: 'TO', name: 'Tonga', flag: '🇹🇴', phone: '+676' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', phone: '+1-868' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', phone: '+216' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', phone: '+90' },
  { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', phone: '+993' },
  { code: 'TV', name: 'Tuvalu', flag: '🇹🇻', phone: '+688' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', phone: '+256' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', phone: '+380' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', phone: '+971' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', phone: '+44' },
  { code: 'US', name: 'United States', flag: '🇺🇸', phone: '+1' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', phone: '+598' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', phone: '+998' },
  { code: 'VU', name: 'Vanuatu', flag: '🇻🇺', phone: '+678' },
  { code: 'VA', name: 'Vatican City', flag: '🇻🇦', phone: '+39' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪', phone: '+58' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', phone: '+84' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪', phone: '+967' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', phone: '+260' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', phone: '+263' },
];

// Get column span from width value
const getColSpan = (width) => {
  const widthOption = WIDTH_OPTIONS.find(w => w.value === width);
  return widthOption?.span || 24;
};

// Render text-based input fields
const renderTextInput = (field, commonProps, type = 'text') => (
  <Input type={type} {...commonProps} />
);

// Render select/dropdown fields
const renderSelectField = (field, commonProps, isMulti = false) => {
  // Check if this is a nationality field - use comprehensive COUNTRIES list
  const isNationality = field.field_name?.toLowerCase().includes('nationality') || 
                        field.field_label?.toLowerCase().includes('nationality');
  
  let validOptions;
  
  if (isNationality) {
    // Use comprehensive COUNTRIES list for nationality fields
    validOptions = COUNTRIES.map(country => ({
      value: country.name,
      label: `${country.flag} ${country.name}`,
    }));
  } else {
    // Filter out options with empty value or label for other SELECT fields
    validOptions = (field.options || [])
      .filter(opt => opt.value && opt.label)
      .map(opt => ({
        value: opt.value,
        label: opt.label,
      }));
  }

  return (
    <Select
      {...commonProps}
      mode={isMulti ? 'multiple' : undefined}
      options={validOptions}
      className="w-full"
      showSearch
      optionFilterProp="label"
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      suffixIcon={isNationality ? <GlobalOutlined /> : undefined}
    />
  );
};

// Render radio/checkbox choice fields
const renderChoiceField = (field, isCheckbox = false) => {
  const GroupComponent = isCheckbox ? Checkbox.Group : Radio.Group;
  const ItemComponent = isCheckbox ? Checkbox : Radio;
  
  // Filter out options with empty value or label
  const validOptions = (field.options || []).filter(opt => opt.value && opt.label);
  
  return (
    <GroupComponent disabled={field.is_readonly} className={isCheckbox ? "checkbox-field-group" : undefined}>
      <Space direction="vertical" className={isCheckbox ? "w-full" : undefined}>
        {validOptions.map(opt => (
          <ItemComponent key={opt.value} value={opt.value} className={isCheckbox ? "checkbox-field-item" : undefined}>
            {opt.label}
          </ItemComponent>
        ))}
      </Space>
    </GroupComponent>
  );
};

// Render date/time picker fields
const renderDateTimeField = (field, commonProps, variant) => {
  if (variant === 'time') {
    return <TimePicker {...commonProps} className="w-full" />;
  }
  if (variant === 'datetime') {
    return <DatePicker showTime {...commonProps} className="w-full" />;
  }
  if (variant === 'range') {
    return <RangePicker {...commonProps} className="w-full" format="YYYY-MM-DD" />;
  }
  return <DatePicker {...commonProps} className="w-full" />;
};

// Render address field
const renderAddressField = () => (
  <div className="space-y-2">
    <Input placeholder="Street Address" />
    <Row gutter={8}>
      <Col span={12}><Input placeholder="City" /></Col>
      <Col span={6}><Input placeholder="State" /></Col>
      <Col span={6}><Input placeholder="ZIP" /></Col>
    </Row>
    <Input placeholder="Country" />
  </div>
);

// Render individual field
const renderField = (field) => {
  const commonProps = {
    placeholder: field.placeholder_text,
    disabled: field.is_readonly,
  };

  const fieldType = field.field_type;

  // Text-based inputs
  if (fieldType === FIELD_TYPES.TEXT) return renderTextInput(field, commonProps);
  if (fieldType === FIELD_TYPES.EMAIL) return renderTextInput(field, commonProps, 'email');
  if (fieldType === FIELD_TYPES.PHONE) return renderTextInput(field, commonProps, 'tel');
  if (fieldType === FIELD_TYPES.URL) return renderTextInput(field, commonProps, 'url');
  if (fieldType === FIELD_TYPES.NUMBER) return <InputNumber {...commonProps} className="w-full" />;
  if (fieldType === FIELD_TYPES.TEXTAREA) return <TextArea rows={4} {...commonProps} />;

  // Select fields
  if (fieldType === FIELD_TYPES.SELECT) return renderSelectField(field, commonProps);
  if (fieldType === FIELD_TYPES.MULTISELECT) return renderSelectField(field, commonProps, true);
  if (fieldType === FIELD_TYPES.COUNTRY) {
    // Country field - use full COUNTRIES list
    return (
      <Select
        {...commonProps}
        showSearch
        optionFilterProp="children"
        filterOption={(input, option) =>
          (option?.children?.toString() || '').toLowerCase().includes(input.toLowerCase())
        }
        className="w-full"
      >
        {COUNTRIES.map((country) => (
          <Select.Option key={country.code} value={country.name}>
            {country.flag} {country.name}
          </Select.Option>
        ))}
      </Select>
    );
  }

  // Choice fields
  if (fieldType === FIELD_TYPES.RADIO) return renderChoiceField(field);
  if (fieldType === FIELD_TYPES.CHECKBOX) return renderChoiceField(field, true);

  // Date/time fields
  if (fieldType === FIELD_TYPES.DATE) return renderDateTimeField(field, commonProps, 'date');
  if (fieldType === FIELD_TYPES.TIME) return renderDateTimeField(field, commonProps, 'time');
  if (fieldType === FIELD_TYPES.DATETIME) return renderDateTimeField(field, commonProps, 'datetime');
  if (fieldType === FIELD_TYPES.DATE_RANGE) return renderDateTimeField(field, commonProps, 'range');

  // Special fields
  if (fieldType === FIELD_TYPES.FILE_UPLOAD || fieldType === FIELD_TYPES.FILE) {
    const maxFiles = field.options?.max_files || 1;
    const accept = field.options?.accept || '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    const maxSize = field.options?.max_size || 5; // MB
    const uploadType = field.options?.upload_type || 'button'; // 'button' or 'dragger'
    
    if (uploadType === 'dragger') {
      return (
        <Upload.Dragger
          name="file"
          multiple={maxFiles > 1}
          maxCount={maxFiles}
          accept={accept}
          disabled={field.is_readonly}
          beforeUpload={() => false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#0077b6' }} />
          </p>
          <p className="ant-upload-text">{field.placeholder_text || 'Click or drag to upload your photo'}</p>
          <p className="ant-upload-hint" style={{ fontSize: '12px', color: '#718096' }}>
            {field.help_text || `Max ${maxSize}MB. Accepted: ${accept}`}
          </p>
        </Upload.Dragger>
      );
    }
    
    return (
      <Upload
        name="file"
        multiple={maxFiles > 1}
        maxCount={maxFiles}
        accept={accept}
        disabled={field.is_readonly}
        beforeUpload={() => false}
      >
        <Button icon={<UploadOutlined />} disabled={field.is_readonly}>
          {field.placeholder_text || 'Click to Upload'}
        </Button>
        {field.help_text && (
          <div style={{ marginTop: 8, fontSize: '12px', color: '#718096' }}>
            {field.help_text}
          </div>
        )}
      </Upload>
    );
  }
  
  if (fieldType === FIELD_TYPES.CONSENT) {
    const consentText = field.options?.consent_text 
      || (Array.isArray(field.options) && field.options[0]?.label)
      || field.field_label
      || 'I agree to the Terms and Conditions';
    const termsLink = field.options?.terms_link || '';
    const privacyLink = field.options?.privacy_link || '';
    
    return (
      <Checkbox disabled={field.is_readonly} className="consent-checkbox">
        <span className="consent-text">
          {consentText}
          {(termsLink || privacyLink) && (
            <span className="consent-links ml-1">
              {termsLink && (
                <a 
                  href={termsLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms
                </a>
              )}
              {termsLink && privacyLink && ' & '}
              {privacyLink && (
                <a 
                  href={privacyLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
              )}
            </span>
          )}
        </span>
      </Checkbox>
    );
  }
  
  if (fieldType === FIELD_TYPES.RATING) {
    return <Rate allowHalf={field.options?.allow_half} count={field.options?.max || 5} disabled={field.is_readonly} />;
  }
  if (fieldType === FIELD_TYPES.ADDRESS) return renderAddressField();
  if (fieldType === FIELD_TYPES.HIDDEN) return null;
  if (fieldType === FIELD_TYPES.SECTION_HEADER) {
    const htmlContent = field.default_value || field.help_text;
    return (
      <div className="form-section-header">
        <Title level={4} className="mt-4 mb-2">{field.field_label}</Title>
        {htmlContent && (
          <div 
            className="section-header-content"
            style={{ marginTop: -4, color: 'rgba(0, 0, 0, 0.45)' }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>
    );
  }
  if (fieldType === FIELD_TYPES.PARAGRAPH) {
    const htmlContent = field.default_value || field.help_text || 'Paragraph text';
    return <div className="paragraph-field-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  }

  // Toggle field (Yes/No switch)
  if (fieldType === FIELD_TYPES.TOGGLE) {
    return (
      <Space>
        <Switch 
          disabled={field.is_readonly}
          checkedChildren={field.options?.true_label || 'Yes'}
          unCheckedChildren={field.options?.false_label || 'No'}
        />
      </Space>
    );
  }

  // Image upload field
  if (fieldType === FIELD_TYPES.IMAGE) {
    return (
      <Upload
        listType="picture-card"
        disabled={field.is_readonly}
        beforeUpload={() => false}
        maxCount={field.options?.max_files || 1}
        accept="image/*"
        className="professional-image-upload"
      >
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#718096'
        }}>
          <PlusOutlined style={{ fontSize: 24, color: '#0077b6' }} />
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {field.placeholder_text || 'Click to upload'}
          </div>
        </div>
      </Upload>
    );
  }

  // Country selector
  if (fieldType === FIELD_TYPES.COUNTRY) {
    return (
      <Select
        {...commonProps}
        showSearch
        className="w-full"
        placeholder={field.placeholder_text || 'Select country'}
        optionFilterProp="label"
        options={[
          { value: 'TR', label: 'Turkey' },
          { value: 'DE', label: 'Germany' },
          { value: 'GB', label: 'United Kingdom' },
          { value: 'US', label: 'United States' },
          { value: 'FR', label: 'France' },
          { value: 'ES', label: 'Spain' },
          { value: 'IT', label: 'Italy' },
          { value: 'NL', label: 'Netherlands' },
          // ... more countries available in production
        ]}
      />
    );
  }

  // Slider field
  if (fieldType === FIELD_TYPES.SLIDER) {
    return (
      <Slider
        disabled={field.is_readonly}
        min={field.options?.min || 0}
        max={field.options?.max || 100}
        step={field.options?.step || 1}
      />
    );
  }

  // Default fallback
  return renderTextInput(field, commonProps);
};

// Form Preview Component
const FormPreview = ({ 
  template, 
  steps = [], 
  showStepNavigation = true,
  embedded = false 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const containerRef = useRef(null);

  // Temporary visual highlight for debugging invalid fields
  const highlightElement = (el) => {
    if (!el || !el.style) return;
    const prev = {
      boxShadow: el.style.boxShadow,
      outline: el.style.outline,
      transition: el.style.transition
    };
    try {
      el.style.boxShadow = '0 0 0 6px rgba(255,0,0,0.12)';
      el.style.outline = '2px solid rgba(255,0,0,0.7)';
      el.style.transition = 'box-shadow 200ms ease, outline 200ms ease';
    } catch (e) {}

    setTimeout(() => {
      try {
        el.style.boxShadow = prev.boxShadow || '';
        el.style.outline = prev.outline || '';
        el.style.transition = prev.transition || '';
      } catch (e) {}
    }, 1800);
  };

  const activeStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Scroll to top whenever step changes
  useEffect(() => {
    try {
      if (containerRef.current && containerRef.current.scrollIntoView) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }, [currentStep]);

  // Handle step navigation
  const scrollToTop = () => {
    try {
      if (containerRef.current && containerRef.current.scrollIntoView) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    } catch (e) {
      window.scrollTo(0, 0);
    }
  };

  const nextStep = async () => {
    if (currentStep >= steps.length - 1) return;

    // Collect field names for the active step to validate only relevant fields
    const fieldNames = (activeStep?.fields || [])
      .map(f => f.field_name)
      .filter(Boolean);

    try {
      // Validate current step fields; this will throw with errorFields if invalid
      await form.validateFields(fieldNames);
      setCurrentStep((s) => s + 1);
      // Auto-scroll to top when moving to the next step
      scrollToTop();
    } catch (validationError) {
      // Scroll to top first so user can see the error
      scrollToTop();
      
      // validationError.errorFields is an array of { name: [fieldName], errors: [...] }
      const firstErr = validationError?.errorFields?.[0];
      const fieldName = firstErr?.name?.[0];

      // User feedback
      message.error('Please fix the errors in this step before continuing');

      // Delay field scrolling to allow container/window scroll to finish
      setTimeout(() => {
        try {
          if (fieldName) {
            form.scrollToField(fieldName, { behavior: 'smooth', block: 'center' });

            const el = document.querySelector(`[name=\"${fieldName}\"]`);
            if (el) {
              try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
              if (typeof el.focus === 'function') el.focus();
              highlightElement(el);
            }
          }
        } catch (e) {
          // Scroll error - ignore
        }
      }, 350);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      // Auto-scroll to top when moving backward as well
      scrollToTop();
    }
  };

  // Render form fields for current step
  const renderFields = () => {
    if (!activeStep?.fields?.length) {
      return <Text type="secondary">No fields in this step</Text>;
    }

    return (
      <Row gutter={[16, 16]}>
        {activeStep.fields
          .sort((a, b) => a.order_index - b.order_index)
          .map(field => {
            // Layout fields render differently
            if ([FIELD_TYPES.SECTION_HEADER, FIELD_TYPES.PARAGRAPH].includes(field.field_type)) {
              return (
                <Col span={getColSpan(field.width)} key={field.id}>
                  <div className="my-4">
                    {renderField(field)}
                  </div>
                </Col>
              );
            }

            // Hidden fields don't render
            if (field.field_type === FIELD_TYPES.HIDDEN) {
              return null;
            }

            // CONSENT fields render without label wrapper (checkbox contains label)
            if (field.field_type === FIELD_TYPES.CONSENT) {
              return (
                <Col span={getColSpan(field.width)} key={field.id}>
                  <Form.Item
                    name={field.field_name}
                    valuePropName="checked"
                    rules={field.is_required ? [{ 
                      validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('This field is required'))
                    }] : []}
                    initialValue={field.default_value}
                  >
                    {renderField(field)}
                  </Form.Item>
                </Col>
              );
            }

            // FILE and IMAGE fields need valuePropName="fileList"
            if ([FIELD_TYPES.FILE, FIELD_TYPES.FILE_UPLOAD, FIELD_TYPES.IMAGE].includes(field.field_type)) {
              return (
                <Col span={getColSpan(field.width)} key={field.id}>
                  <Form.Item
                    label={field.field_label}
                    name={field.field_name}
                    valuePropName="fileList"
                    getValueFromEvent={(e) => Array.isArray(e) ? e : e?.fileList}
                    rules={field.is_required ? [{ required: true, message: `${field.field_label} is required` }] : []}
                    extra={field.help_text}
                  >
                    {renderField(field)}
                  </Form.Item>
                </Col>
              );
            }

            return (
              <Col span={getColSpan(field.width)} key={field.id}>
                <Form.Item
                  label={field.field_label}
                  name={field.field_name}
                  rules={field.is_required ? [{ required: true, message: `${field.field_label} is required` }] : []}
                  extra={field.help_text}
                  initialValue={field.default_value}
                >
                  {renderField(field)}
                </Form.Item>
              </Col>
            );
          })}
      </Row>
    );
  };

  if (!steps.length) {
    return (
      <div className={embedded ? 'p-8 text-center' : ''}>
        <Card className="text-center py-8">
          <Text type="secondary">No steps to preview</Text>
        </Card>
      </div>
    );
  }

  // Embedded mode - used inside PublicFormLayout, no outer Card wrapper
  if (embedded) {
    return (
      <div className="form-preview" ref={containerRef}>
        {/* Header */}
        {template && (
          <div className="text-center p-6 border-b">
            <Title level={2} className="mb-2">{template.name}</Title>
            {template.description && (
              <Text type="secondary">{template.description}</Text>
            )}
            
            {/* Progress Steps */}
            {showStepNavigation && steps.length > 1 && (
              <div className="mt-4">
                <Steps
                  current={currentStep}
                  size="small"
                  items={steps
                    .filter(s => s.show_progress !== false)
                    .map(s => ({ title: s.title }))}
                />
              </div>
            )}
          </div>
        )}

        {/* Form Content */}
        <div className="p-6">
          {/* Step Header */}
          {steps.length > 1 && (
            <div className="mb-4">
              <Title level={4} className="mb-1">{activeStep?.title}</Title>
              {activeStep?.description && (
                <Text type="secondary">{activeStep.description}</Text>
              )}
            </div>
          )}

          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
          >
            {renderFields()}
          </Form>

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button
              onClick={prevStep}
              disabled={isFirstStep}
            >
              Previous
            </Button>
            
            {isLastStep ? (
              <Button type="primary">
                Submit
              </Button>
            ) : (
              <Button type="primary" onClick={nextStep}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard mode - with Card wrapper
  return (
    <div className="form-preview max-w-2xl mx-auto p-4" ref={containerRef}>
      {/* Header */}
      {template && (
        <div className="text-center mb-6">
          <Title level={2}>{template.name}</Title>
          {template.description && (
            <Text type="secondary">{template.description}</Text>
          )}
        </div>
      )}

      {/* Progress Steps */}
      {showStepNavigation && steps.length > 1 && (
        <Steps
          current={currentStep}
          className="mb-6"
          size="small"
          items={steps
            .filter(s => s.show_progress !== false)
            .map(s => ({ title: s.title }))}
        />
      )}

      {/* Form */}
      <Card className="mb-4">
        {/* Step Header */}
        <div className="mb-4">
          <Title level={4} className="mb-1">{activeStep?.title}</Title>
          {activeStep?.description && (
            <Text type="secondary">{activeStep.description}</Text>
          )}
        </div>

        <Divider className="my-4" />

        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
        >
          {renderFields()}
        </Form>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          onClick={prevStep}
          disabled={isFirstStep}
        >
          Previous
        </Button>
        
        {isLastStep ? (
          <Button type="primary">
            Submit
          </Button>
        ) : (
          <Button type="primary" onClick={nextStep}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
};

export default FormPreview;
