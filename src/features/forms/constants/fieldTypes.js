/**
 * Field Types and Categories for Form Builder
 */

export const FIELD_TYPES = {
  // Basic Fields
  TEXT: 'text',
  EMAIL: 'email',
  PHONE: 'phone',
  NUMBER: 'number',
  URL: 'url',
  
  // Choice Fields
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  
  // Date/Time Fields
  DATE: 'date',
  TIME: 'time',
  DATETIME: 'datetime',
  DATE_RANGE: 'date_range',
  
  // Long Text
  TEXTAREA: 'textarea',
  
  // Media
  FILE: 'file',
  IMAGE: 'image',
  SIGNATURE: 'signature',
  
  // Special Choice
  TOGGLE: 'toggle',
  COUNTRY: 'country',
  
  // Advanced
  RATING: 'rating',
  SLIDER: 'slider',
  ADDRESS: 'address',
  CALCULATED: 'calculated',
  HIDDEN: 'hidden',
  CONSENT: 'consent',
  
  // Layout
  SECTION_HEADER: 'section_header',
  PARAGRAPH: 'paragraph',
};

export const FIELD_CATEGORIES = [
  {
    id: 'basic',
    name: 'Basic Fields',
    icon: 'FontSizeOutlined',
    fields: [
      { type: FIELD_TYPES.TEXT, label: 'Text', icon: 'FontSizeOutlined', description: 'Single line text input' },
      { type: FIELD_TYPES.EMAIL, label: 'Email', icon: 'MailOutlined', description: 'Email address with validation' },
      { type: FIELD_TYPES.PHONE, label: 'Phone', icon: 'PhoneOutlined', description: 'Phone number input' },
      { type: FIELD_TYPES.NUMBER, label: 'Number', icon: 'NumberOutlined', description: 'Numeric input with validation' },
      { type: FIELD_TYPES.URL, label: 'URL', icon: 'LinkOutlined', description: 'Website URL input' },
    ]
  },
  {
    id: 'choice',
    name: 'Choice Fields',
    icon: 'CheckSquareOutlined',
    fields: [
      { type: FIELD_TYPES.SELECT, label: 'Dropdown', icon: 'DownOutlined', description: 'Single selection dropdown' },
      { type: FIELD_TYPES.MULTISELECT, label: 'Multi-Select', icon: 'AppstoreOutlined', description: 'Multiple selection dropdown' },
      { type: FIELD_TYPES.RADIO, label: 'Radio Buttons', icon: 'CheckCircleOutlined', description: 'Single choice from visible options' },
      { type: FIELD_TYPES.CHECKBOX, label: 'Checkboxes', icon: 'CheckSquareOutlined', description: 'Multiple choices from visible options' },
      { type: FIELD_TYPES.TOGGLE, label: 'Yes/No Toggle', icon: 'SwitcherOutlined', description: 'Simple yes/no switch' },
    ]
  },
  {
    id: 'datetime',
    name: 'Date & Time',
    icon: 'CalendarOutlined',
    fields: [
      { type: FIELD_TYPES.DATE, label: 'Date', icon: 'CalendarOutlined', description: 'Date picker' },
      { type: FIELD_TYPES.TIME, label: 'Time', icon: 'ClockCircleOutlined', description: 'Time picker' },
      { type: FIELD_TYPES.DATETIME, label: 'Date & Time', icon: 'FieldTimeOutlined', description: 'Combined date and time picker' },
      { type: FIELD_TYPES.DATE_RANGE, label: 'Date Range', icon: 'CalendarOutlined', description: 'Start and end date picker' },
    ]
  },
  {
    id: 'text',
    name: 'Long Text',
    icon: 'FileTextOutlined',
    fields: [
      { type: FIELD_TYPES.TEXTAREA, label: 'Text Area', icon: 'FileTextOutlined', description: 'Multi-line text input' },
    ]
  },
  {
    id: 'media',
    name: 'Media',
    icon: 'UploadOutlined',
    fields: [
      { type: FIELD_TYPES.FILE, label: 'File Upload', icon: 'UploadOutlined', description: 'File attachment' },
      { type: FIELD_TYPES.IMAGE, label: 'Image Upload', icon: 'PictureOutlined', description: 'Image upload with preview' },
      { type: FIELD_TYPES.SIGNATURE, label: 'Signature', icon: 'EditOutlined', description: 'Signature pad for signing' },
    ]
  },
  {
    id: 'advanced',
    name: 'Advanced',
    icon: 'ToolOutlined',
    fields: [
      { type: FIELD_TYPES.RATING, label: 'Rating', icon: 'StarOutlined', description: 'Star rating selector' },
      { type: FIELD_TYPES.SLIDER, label: 'Slider', icon: 'SlidersOutlined', description: 'Numeric range slider' },
      { type: FIELD_TYPES.ADDRESS, label: 'Address', icon: 'EnvironmentOutlined', description: 'Full address with components' },
      { type: FIELD_TYPES.COUNTRY, label: 'Country', icon: 'GlobalOutlined', description: 'Country selector with flags' },
      { type: FIELD_TYPES.CALCULATED, label: 'Calculated', icon: 'CalculatorOutlined', description: 'Auto-calculated field' },
      { type: FIELD_TYPES.HIDDEN, label: 'Hidden Field', icon: 'EyeInvisibleOutlined', description: 'Hidden field for data' },
      { type: FIELD_TYPES.CONSENT, label: 'Consent', icon: 'SafetyCertificateOutlined', description: 'GDPR consent checkbox' },
    ]
  },
  {
    id: 'layout',
    name: 'Layout',
    icon: 'LayoutOutlined',
    fields: [
      { type: FIELD_TYPES.SECTION_HEADER, label: 'Section Header', icon: 'FontColorsOutlined', description: 'Visual section divider with heading' },
      { type: FIELD_TYPES.PARAGRAPH, label: 'Paragraph', icon: 'AlignLeftOutlined', description: 'Static text/instructions' },
    ]
  },
];

// Field configuration defaults
export const FIELD_DEFAULTS = {
  [FIELD_TYPES.TEXT]: {
    validation_rules: { min_length: null, max_length: 255 },
    width: 'full',
  },
  [FIELD_TYPES.EMAIL]: {
    validation_rules: { pattern: 'email' },
    placeholder_text: 'email@example.com',
    width: 'half',
  },
  [FIELD_TYPES.PHONE]: {
    validation_rules: { pattern: 'phone' },
    placeholder_text: '+1 (555) 000-0000',
    width: 'half',
  },
  [FIELD_TYPES.NUMBER]: {
    validation_rules: { min: null, max: null },
    width: 'third',
  },
  [FIELD_TYPES.URL]: {
    validation_rules: { pattern: 'url' },
    placeholder_text: 'https://',
    width: 'full',
  },
  [FIELD_TYPES.SELECT]: {
    options: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ],
    width: 'half',
  },
  [FIELD_TYPES.MULTISELECT]: {
    options: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ],
    width: 'full',
  },
  [FIELD_TYPES.RADIO]: {
    options: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ],
    width: 'full',
  },
  [FIELD_TYPES.CHECKBOX]: {
    options: [
      { value: 'option1', label: 'Option 1' },
    ],
    width: 'full',
  },
  [FIELD_TYPES.DATE]: {
    width: 'third',
  },
  [FIELD_TYPES.TIME]: {
    width: 'third',
  },
  [FIELD_TYPES.DATETIME]: {
    width: 'half',
  },
  [FIELD_TYPES.DATE_RANGE]: {
    width: 'full',
  },
  [FIELD_TYPES.TEXTAREA]: {
    validation_rules: { min_length: null, max_length: 2000 },
    width: 'full',
  },
  [FIELD_TYPES.FILE]: {
    validation_rules: { 
      max_size: 5242880, // 5MB
      allowed_types: ['image/*', 'application/pdf'] 
    },
    width: 'full',
  },
  [FIELD_TYPES.IMAGE]: {
    validation_rules: { 
      max_size: 10485760, // 10MB
      allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] 
    },
    width: 'half',
  },
  [FIELD_TYPES.TOGGLE]: {
    options: { 
      true_label: 'Yes', 
      false_label: 'No' 
    },
    width: 'third',
  },
  [FIELD_TYPES.COUNTRY]: {
    options: { show_flags: true },
    width: 'half',
  },
  [FIELD_TYPES.RATING]: {
    options: { max: 5, allow_half: false },
    width: 'half',
  },
  [FIELD_TYPES.SLIDER]: {
    options: { 
      min: 0, 
      max: 100, 
      step: 1,
      show_value: true,
      show_marks: false,
      unit: ''
    },
    width: 'full',
  },
  [FIELD_TYPES.ADDRESS]: {
    options: {
      show_street: true,
      show_city: true,
      show_state: true,
      show_zip: true,
      show_country: true,
    },
    width: 'full',
  },
  [FIELD_TYPES.CALCULATED]: {
    options: { formula: '' },
    width: 'third',
  },
  [FIELD_TYPES.HIDDEN]: {
    width: 'full',
  },
  [FIELD_TYPES.CONSENT]: {
    options: {
      consent_text: 'I agree to the Terms and Conditions',
      privacy_link: '',
      terms_link: '',
      required_message: 'You must accept to continue'
    },
    is_required: true,
    width: 'full',
  },
  [FIELD_TYPES.SECTION_HEADER]: {
    width: 'full',
  },
  [FIELD_TYPES.PARAGRAPH]: {
    width: 'full',
    default_value: 'Enter your text here...',
  },
};

// Width options for fields
export const WIDTH_OPTIONS = [
  { value: 'full', label: 'Full Width', span: 24 },
  { value: 'half', label: 'Half Width', span: 12 },
  { value: 'third', label: 'One Third', span: 8 },
  { value: 'quarter', label: 'One Quarter', span: 6 },
];

// Validation operators for conditional logic
export const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
];

// Form categories
export const FORM_CATEGORIES = [
  { value: 'service', label: 'Service Registration' },
  { value: 'registration', label: 'General Registration' },
  { value: 'survey', label: 'Survey / Feedback' },
  { value: 'contact', label: 'Contact Form' },
];
