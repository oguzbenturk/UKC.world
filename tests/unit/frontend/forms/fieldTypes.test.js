import { describe, it, expect } from 'vitest';
import {
  FIELD_TYPES,
  FIELD_CATEGORIES,
  FIELD_DEFAULTS,
  WIDTH_OPTIONS,
  CONDITION_OPERATORS,
  FORM_CATEGORIES,
} from '@/features/forms/constants/fieldTypes';

describe('FIELD_TYPES', () => {
  it('defines all basic field types', () => {
    expect(FIELD_TYPES.TEXT).toBe('text');
    expect(FIELD_TYPES.EMAIL).toBe('email');
    expect(FIELD_TYPES.PHONE).toBe('phone');
    expect(FIELD_TYPES.NUMBER).toBe('number');
    expect(FIELD_TYPES.URL).toBe('url');
  });

  it('defines all choice field types', () => {
    expect(FIELD_TYPES.SELECT).toBe('select');
    expect(FIELD_TYPES.MULTISELECT).toBe('multiselect');
    expect(FIELD_TYPES.RADIO).toBe('radio');
    expect(FIELD_TYPES.CHECKBOX).toBe('checkbox');
    expect(FIELD_TYPES.TOGGLE).toBe('toggle');
  });

  it('defines all date/time field types', () => {
    expect(FIELD_TYPES.DATE).toBe('date');
    expect(FIELD_TYPES.TIME).toBe('time');
    expect(FIELD_TYPES.DATETIME).toBe('datetime');
    expect(FIELD_TYPES.DATE_RANGE).toBe('date_range');
  });

  it('defines all media field types', () => {
    expect(FIELD_TYPES.FILE).toBe('file');
    expect(FIELD_TYPES.IMAGE).toBe('image');
    expect(FIELD_TYPES.SIGNATURE).toBe('signature');
  });

  it('defines all advanced field types', () => {
    expect(FIELD_TYPES.RATING).toBe('rating');
    expect(FIELD_TYPES.SLIDER).toBe('slider');
    expect(FIELD_TYPES.ADDRESS).toBe('address');
    expect(FIELD_TYPES.COUNTRY).toBe('country');
    expect(FIELD_TYPES.CALCULATED).toBe('calculated');
    expect(FIELD_TYPES.HIDDEN).toBe('hidden');
    expect(FIELD_TYPES.CONSENT).toBe('consent');
  });

  it('defines layout field types', () => {
    expect(FIELD_TYPES.SECTION_HEADER).toBe('section_header');
    expect(FIELD_TYPES.PARAGRAPH).toBe('paragraph');
  });

  it('defines textarea field type', () => {
    expect(FIELD_TYPES.TEXTAREA).toBe('textarea');
  });
});

describe('FIELD_CATEGORIES', () => {
  it('has 7 categories', () => {
    expect(FIELD_CATEGORIES).toHaveLength(7);
  });

  it('includes basic fields category', () => {
    const basicCategory = FIELD_CATEGORIES.find((c) => c.id === 'basic');
    expect(basicCategory).toBeDefined();
    expect(basicCategory.name).toBe('Basic Fields');
    expect(basicCategory.fields.length).toBeGreaterThan(0);
  });

  it('includes choice fields category', () => {
    const choiceCategory = FIELD_CATEGORIES.find((c) => c.id === 'choice');
    expect(choiceCategory).toBeDefined();
    expect(choiceCategory.name).toBe('Choice Fields');
  });

  it('includes date/time category', () => {
    const dateTimeCategory = FIELD_CATEGORIES.find((c) => c.id === 'datetime');
    expect(dateTimeCategory).toBeDefined();
    expect(dateTimeCategory.name).toBe('Date & Time');
  });

  it('includes media category', () => {
    const mediaCategory = FIELD_CATEGORIES.find((c) => c.id === 'media');
    expect(mediaCategory).toBeDefined();
    expect(mediaCategory.name).toBe('Media');
  });

  it('each field has required properties', () => {
    FIELD_CATEGORIES.forEach((category) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('fields');
      expect(Array.isArray(category.fields)).toBe(true);

      category.fields.forEach((field) => {
        expect(field).toHaveProperty('type');
        expect(field).toHaveProperty('label');
        expect(field).toHaveProperty('icon');
        expect(field).toHaveProperty('description');
      });
    });
  });
});

describe('FIELD_DEFAULTS', () => {
  it('provides defaults for text field', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.TEXT];
    expect(defaults).toBeDefined();
    expect(defaults.validation_rules).toBeDefined();
    expect(defaults.width).toBe('full');
  });

  it('provides defaults for email field', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.EMAIL];
    expect(defaults).toBeDefined();
    expect(defaults.validation_rules.pattern).toBe('email');
    expect(defaults.placeholder_text).toBe('email@example.com');
    expect(defaults.width).toBe('half');
  });

  it('provides defaults for phone field', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.PHONE];
    expect(defaults).toBeDefined();
    expect(defaults.validation_rules.pattern).toBe('phone');
    expect(defaults.placeholder_text).toBe('+1 (555) 000-0000');
  });

  it('provides defaults for select field with options', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.SELECT];
    expect(defaults).toBeDefined();
    expect(Array.isArray(defaults.options)).toBe(true);
    expect(defaults.options.length).toBeGreaterThan(0);
    expect(defaults.options[0]).toHaveProperty('value');
    expect(defaults.options[0]).toHaveProperty('label');
  });

  it('provides defaults for file upload with size limit', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.FILE];
    expect(defaults).toBeDefined();
    expect(defaults.validation_rules.max_size).toBe(5242880); // 5MB
  });

  it('provides defaults for image upload with larger size limit', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.IMAGE];
    expect(defaults).toBeDefined();
    expect(defaults.validation_rules.max_size).toBe(10485760); // 10MB
  });

  it('provides defaults for rating field', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.RATING];
    expect(defaults).toBeDefined();
    expect(defaults.options.max).toBe(5);
    expect(defaults.options.allow_half).toBe(false);
  });

  it('provides defaults for slider field', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.SLIDER];
    expect(defaults).toBeDefined();
    expect(defaults.options.min).toBe(0);
    expect(defaults.options.max).toBe(100);
    expect(defaults.options.step).toBe(1);
  });

  it('provides defaults for consent field with required flag', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.CONSENT];
    expect(defaults).toBeDefined();
    expect(defaults.is_required).toBe(true);
    expect(defaults.options.consent_text).toBeDefined();
  });

  it('provides defaults for address field with all components', () => {
    const defaults = FIELD_DEFAULTS[FIELD_TYPES.ADDRESS];
    expect(defaults).toBeDefined();
    expect(defaults.options.show_street).toBe(true);
    expect(defaults.options.show_city).toBe(true);
    expect(defaults.options.show_zip).toBe(true);
  });

  it('has width property for all field types with defaults', () => {
    Object.entries(FIELD_DEFAULTS).forEach(([fieldType, defaults]) => {
      expect(defaults).toHaveProperty('width');
      expect(['full', 'half', 'third', 'quarter']).toContain(defaults.width);
    });
  });
});

describe('WIDTH_OPTIONS', () => {
  it('has 4 width options', () => {
    expect(WIDTH_OPTIONS).toHaveLength(4);
  });

  it('includes full width option', () => {
    const fullWidth = WIDTH_OPTIONS.find((w) => w.value === 'full');
    expect(fullWidth).toBeDefined();
    expect(fullWidth.label).toBe('Full Width');
    expect(fullWidth.span).toBe(24);
  });

  it('includes half width option', () => {
    const halfWidth = WIDTH_OPTIONS.find((w) => w.value === 'half');
    expect(halfWidth).toBeDefined();
    expect(halfWidth.label).toBe('Half Width');
    expect(halfWidth.span).toBe(12);
  });

  it('includes third width option', () => {
    const thirdWidth = WIDTH_OPTIONS.find((w) => w.value === 'third');
    expect(thirdWidth).toBeDefined();
    expect(thirdWidth.span).toBe(8);
  });

  it('includes quarter width option', () => {
    const quarterWidth = WIDTH_OPTIONS.find((w) => w.value === 'quarter');
    expect(quarterWidth).toBeDefined();
    expect(quarterWidth.span).toBe(6);
  });

  it('each width option has value, label, and span', () => {
    WIDTH_OPTIONS.forEach((option) => {
      expect(option).toHaveProperty('value');
      expect(option).toHaveProperty('label');
      expect(option).toHaveProperty('span');
      expect(typeof option.span).toBe('number');
    });
  });
});

describe('CONDITION_OPERATORS', () => {
  it('provides comparison operators', () => {
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'equals')
    ).toBe(true);
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'not_equals')
    ).toBe(true);
  });

  it('provides string operators', () => {
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'contains')
    ).toBe(true);
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'not_contains')
    ).toBe(true);
  });

  it('provides numeric operators', () => {
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'greater_than')
    ).toBe(true);
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'less_than')
    ).toBe(true);
  });

  it('provides empty/not empty operators', () => {
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'is_empty')
    ).toBe(true);
    expect(
      CONDITION_OPERATORS.some((op) => op.value === 'is_not_empty')
    ).toBe(true);
  });

  it('each operator has value and label', () => {
    CONDITION_OPERATORS.forEach((operator) => {
      expect(operator).toHaveProperty('value');
      expect(operator).toHaveProperty('label');
      expect(typeof operator.value).toBe('string');
      expect(typeof operator.label).toBe('string');
    });
  });
});

describe('FORM_CATEGORIES', () => {
  it('has multiple form categories', () => {
    expect(FORM_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('includes service registration category', () => {
    const service = FORM_CATEGORIES.find((c) => c.value === 'service');
    expect(service).toBeDefined();
    expect(service.label).toBe('Service Registration');
  });

  it('includes general registration category', () => {
    const registration = FORM_CATEGORIES.find(
      (c) => c.value === 'registration'
    );
    expect(registration).toBeDefined();
    expect(registration.label).toBe('General Registration');
  });

  it('includes survey category', () => {
    const survey = FORM_CATEGORIES.find((c) => c.value === 'survey');
    expect(survey).toBeDefined();
    expect(survey.label).toBe('Survey / Feedback');
  });

  it('includes contact category', () => {
    const contact = FORM_CATEGORIES.find((c) => c.value === 'contact');
    expect(contact).toBeDefined();
    expect(contact.label).toBe('Contact Form');
  });

  it('each category has value and label', () => {
    FORM_CATEGORIES.forEach((category) => {
      expect(category).toHaveProperty('value');
      expect(category).toHaveProperty('label');
    });
  });
});
