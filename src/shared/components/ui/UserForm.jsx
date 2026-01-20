// src/components/UserForm.jsx
import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Select, Row, Col, Avatar, Upload, InputNumber } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UserOutlined, UploadOutlined, MailOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { parsePhoneNumber } from 'libphonenumber-js';
import ReactCountryFlag from "react-country-flag";
import DataService from '../../services/dataService';
import apiClient from '../../services/apiClient';

const { Option } = Select;

// Countries data with calling codes
const countries = [
  { code: 'AD', name: 'Andorra', callingCode: '+376' },
  { code: 'AE', name: 'United Arab Emirates', callingCode: '+971' },
  { code: 'AF', name: 'Afghanistan', callingCode: '+93' },
  { code: 'AG', name: 'Antigua and Barbuda', callingCode: '+1268' },
  { code: 'AI', name: 'Anguilla', callingCode: '+1264' },
  { code: 'AL', name: 'Albania', callingCode: '+355' },
  { code: 'AM', name: 'Armenia', callingCode: '+374' },
  { code: 'AO', name: 'Angola', callingCode: '+244' },
  { code: 'AQ', name: 'Antarctica', callingCode: '+672' },
  { code: 'AR', name: 'Argentina', callingCode: '+54' },
  { code: 'AS', name: 'American Samoa', callingCode: '+1684' },
  { code: 'AT', name: 'Austria', callingCode: '+43' },
  { code: 'AU', name: 'Australia', callingCode: '+61' },
  { code: 'AW', name: 'Aruba', callingCode: '+297' },
  { code: 'AX', name: 'Åland Islands', callingCode: '+358' },
  { code: 'AZ', name: 'Azerbaijan', callingCode: '+994' },
  { code: 'BA', name: 'Bosnia and Herzegovina', callingCode: '+387' },
  { code: 'BB', name: 'Barbados', callingCode: '+1246' },
  { code: 'BD', name: 'Bangladesh', callingCode: '+880' },
  { code: 'BE', name: 'Belgium', callingCode: '+32' },
  { code: 'BF', name: 'Burkina Faso', callingCode: '+226' },
  { code: 'BG', name: 'Bulgaria', callingCode: '+359' },
  { code: 'BH', name: 'Bahrain', callingCode: '+973' },
  { code: 'BI', name: 'Burundi', callingCode: '+257' },
  { code: 'BJ', name: 'Benin', callingCode: '+229' },
  { code: 'BL', name: 'Saint Barthélemy', callingCode: '+590' },
  { code: 'BM', name: 'Bermuda', callingCode: '+1441' },
  { code: 'BN', name: 'Brunei', callingCode: '+673' },
  { code: 'BO', name: 'Bolivia', callingCode: '+591' },
  { code: 'BQ', name: 'Caribbean Netherlands', callingCode: '+599' },
  { code: 'BR', name: 'Brazil', callingCode: '+55' },
  { code: 'BS', name: 'Bahamas', callingCode: '+1242' },
  { code: 'BT', name: 'Bhutan', callingCode: '+975' },
  { code: 'BV', name: 'Bouvet Island', callingCode: '+47' },
  { code: 'BW', name: 'Botswana', callingCode: '+267' },
  { code: 'BY', name: 'Belarus', callingCode: '+375' },
  { code: 'BZ', name: 'Belize', callingCode: '+501' },
  { code: 'CA', name: 'Canada', callingCode: '+1' },
  { code: 'CC', name: 'Cocos Islands', callingCode: '+61' },
  { code: 'CD', name: 'DR Congo', callingCode: '+243' },
  { code: 'CF', name: 'Central African Republic', callingCode: '+236' },
  { code: 'CG', name: 'Republic of the Congo', callingCode: '+242' },
  { code: 'CH', name: 'Switzerland', callingCode: '+41' },
  { code: 'CI', name: 'Côte d\'Ivoire', callingCode: '+225' },
  { code: 'CK', name: 'Cook Islands', callingCode: '+682' },
  { code: 'CL', name: 'Chile', callingCode: '+56' },
  { code: 'CM', name: 'Cameroon', callingCode: '+237' },
  { code: 'CN', name: 'China', callingCode: '+86' },
  { code: 'CO', name: 'Colombia', callingCode: '+57' },
  { code: 'CR', name: 'Costa Rica', callingCode: '+506' },
  { code: 'CU', name: 'Cuba', callingCode: '+53' },
  { code: 'CV', name: 'Cape Verde', callingCode: '+238' },
  { code: 'CW', name: 'Curaçao', callingCode: '+599' },
  { code: 'CX', name: 'Christmas Island', callingCode: '+61' },
  { code: 'CY', name: 'Cyprus', callingCode: '+357' },
  { code: 'CZ', name: 'Czech Republic', callingCode: '+420' },
  { code: 'DE', name: 'Germany', callingCode: '+49' },
  { code: 'DJ', name: 'Djibouti', callingCode: '+253' },
  { code: 'DK', name: 'Denmark', callingCode: '+45' },
  { code: 'DM', name: 'Dominica', callingCode: '+1767' },
  { code: 'DO', name: 'Dominican Republic', callingCode: '+1809' },
  { code: 'DZ', name: 'Algeria', callingCode: '+213' },
  { code: 'EC', name: 'Ecuador', callingCode: '+593' },
  { code: 'EE', name: 'Estonia', callingCode: '+372' },
  { code: 'EG', name: 'Egypt', callingCode: '+20' },
  { code: 'EH', name: 'Western Sahara', callingCode: '+212' },
  { code: 'ER', name: 'Eritrea', callingCode: '+291' },
  { code: 'ES', name: 'Spain', callingCode: '+34' },
  { code: 'ET', name: 'Ethiopia', callingCode: '+251' },
  { code: 'FI', name: 'Finland', callingCode: '+358' },
  { code: 'FJ', name: 'Fiji', callingCode: '+679' },
  { code: 'FK', name: 'Falkland Islands', callingCode: '+500' },
  { code: 'FM', name: 'Micronesia', callingCode: '+691' },
  { code: 'FO', name: 'Faroe Islands', callingCode: '+298' },
  { code: 'FR', name: 'France', callingCode: '+33' },
  { code: 'GA', name: 'Gabon', callingCode: '+241' },
  { code: 'GB', name: 'United Kingdom', callingCode: '+44' },
  { code: 'GD', name: 'Grenada', callingCode: '+1473' },
  { code: 'GE', name: 'Georgia', callingCode: '+995' },
  { code: 'GF', name: 'French Guiana', callingCode: '+594' },
  { code: 'GG', name: 'Guernsey', callingCode: '+44' },
  { code: 'GH', name: 'Ghana', callingCode: '+233' },
  { code: 'GI', name: 'Gibraltar', callingCode: '+350' },
  { code: 'GL', name: 'Greenland', callingCode: '+299' },
  { code: 'GM', name: 'Gambia', callingCode: '+220' },
  { code: 'GN', name: 'Guinea', callingCode: '+224' },
  { code: 'GP', name: 'Guadeloupe', callingCode: '+590' },
  { code: 'GQ', name: 'Equatorial Guinea', callingCode: '+240' },
  { code: 'GR', name: 'Greece', callingCode: '+30' },
  { code: 'GS', name: 'South Georgia', callingCode: '+500' },
  { code: 'GT', name: 'Guatemala', callingCode: '+502' },
  { code: 'GU', name: 'Guam', callingCode: '+1671' },
  { code: 'GW', name: 'Guinea-Bissau', callingCode: '+245' },
  { code: 'GY', name: 'Guyana', callingCode: '+592' },
  { code: 'HK', name: 'Hong Kong', callingCode: '+852' },
  { code: 'HM', name: 'Heard Island and McDonald Islands', callingCode: '+672' },
  { code: 'HN', name: 'Honduras', callingCode: '+504' },
  { code: 'HR', name: 'Croatia', callingCode: '+385' },
  { code: 'HT', name: 'Haiti', callingCode: '+509' },
  { code: 'HU', name: 'Hungary', callingCode: '+36' },
  { code: 'ID', name: 'Indonesia', callingCode: '+62' },
  { code: 'IE', name: 'Ireland', callingCode: '+353' },
  { code: 'IL', name: 'Israel', callingCode: '+972' },
  { code: 'IM', name: 'Isle of Man', callingCode: '+44' },
  { code: 'IN', name: 'India', callingCode: '+91' },
  { code: 'IO', name: 'British Indian Ocean Territory', callingCode: '+246' },
  { code: 'IQ', name: 'Iraq', callingCode: '+964' },
  { code: 'IR', name: 'Iran', callingCode: '+98' },
  { code: 'IS', name: 'Iceland', callingCode: '+354' },
  { code: 'IT', name: 'Italy', callingCode: '+39' },
  { code: 'JE', name: 'Jersey', callingCode: '+44' },
  { code: 'JM', name: 'Jamaica', callingCode: '+1876' },
  { code: 'JO', name: 'Jordan', callingCode: '+962' },
  { code: 'JP', name: 'Japan', callingCode: '+81' },
  { code: 'KE', name: 'Kenya', callingCode: '+254' },
  { code: 'KG', name: 'Kyrgyzstan', callingCode: '+996' },
  { code: 'KH', name: 'Cambodia', callingCode: '+855' },
  { code: 'KI', name: 'Kiribati', callingCode: '+686' },
  { code: 'KM', name: 'Comoros', callingCode: '+269' },
  { code: 'KN', name: 'Saint Kitts and Nevis', callingCode: '+1869' },
  { code: 'KP', name: 'North Korea', callingCode: '+850' },
  { code: 'KR', name: 'South Korea', callingCode: '+82' },
  { code: 'KW', name: 'Kuwait', callingCode: '+965' },
  { code: 'KY', name: 'Cayman Islands', callingCode: '+1345' },
  { code: 'KZ', name: 'Kazakhstan', callingCode: '+7' },
  { code: 'LA', name: 'Laos', callingCode: '+856' },
  { code: 'LB', name: 'Lebanon', callingCode: '+961' },
  { code: 'LC', name: 'Saint Lucia', callingCode: '+1758' },
  { code: 'LI', name: 'Liechtenstein', callingCode: '+423' },
  { code: 'LK', name: 'Sri Lanka', callingCode: '+94' },
  { code: 'LR', name: 'Liberia', callingCode: '+231' },
  { code: 'LS', name: 'Lesotho', callingCode: '+266' },
  { code: 'LT', name: 'Lithuania', callingCode: '+370' },
  { code: 'LU', name: 'Luxembourg', callingCode: '+352' },
  { code: 'LV', name: 'Latvia', callingCode: '+371' },
  { code: 'LY', name: 'Libya', callingCode: '+218' },
  { code: 'MA', name: 'Morocco', callingCode: '+212' },
  { code: 'MC', name: 'Monaco', callingCode: '+377' },
  { code: 'MD', name: 'Moldova', callingCode: '+373' },
  { code: 'ME', name: 'Montenegro', callingCode: '+382' },
  { code: 'MF', name: 'Saint Martin', callingCode: '+590' },
  { code: 'MG', name: 'Madagascar', callingCode: '+261' },
  { code: 'MH', name: 'Marshall Islands', callingCode: '+692' },
  { code: 'MK', name: 'North Macedonia', callingCode: '+389' },
  { code: 'ML', name: 'Mali', callingCode: '+223' },
  { code: 'MM', name: 'Myanmar', callingCode: '+95' },
  { code: 'MN', name: 'Mongolia', callingCode: '+976' },
  { code: 'MO', name: 'Macao', callingCode: '+853' },
  { code: 'MP', name: 'Northern Mariana Islands', callingCode: '+1670' },
  { code: 'MQ', name: 'Martinique', callingCode: '+596' },
  { code: 'MR', name: 'Mauritania', callingCode: '+222' },
  { code: 'MS', name: 'Montserrat', callingCode: '+1664' },
  { code: 'MT', name: 'Malta', callingCode: '+356' },
  { code: 'MU', name: 'Mauritius', callingCode: '+230' },
  { code: 'MV', name: 'Maldives', callingCode: '+960' },
  { code: 'MW', name: 'Malawi', callingCode: '+265' },
  { code: 'MX', name: 'Mexico', callingCode: '+52' },
  { code: 'MY', name: 'Malaysia', callingCode: '+60' },
  { code: 'MZ', name: 'Mozambique', callingCode: '+258' },
  { code: 'NA', name: 'Namibia', callingCode: '+264' },
  { code: 'NC', name: 'New Caledonia', callingCode: '+687' },
  { code: 'NE', name: 'Niger', callingCode: '+227' },
  { code: 'NF', name: 'Norfolk Island', callingCode: '+672' },
  { code: 'NG', name: 'Nigeria', callingCode: '+234' },
  { code: 'NI', name: 'Nicaragua', callingCode: '+505' },
  { code: 'NL', name: 'Netherlands', callingCode: '+31' },
  { code: 'NO', name: 'Norway', callingCode: '+47' },
  { code: 'NP', name: 'Nepal', callingCode: '+977' },
  { code: 'NR', name: 'Nauru', callingCode: '+674' },
  { code: 'NU', name: 'Niue', callingCode: '+683' },
  { code: 'NZ', name: 'New Zealand', callingCode: '+64' },
  { code: 'OM', name: 'Oman', callingCode: '+968' },
  { code: 'PA', name: 'Panama', callingCode: '+507' },
  { code: 'PE', name: 'Peru', callingCode: '+51' },
  { code: 'PF', name: 'French Polynesia', callingCode: '+689' },
  { code: 'PG', name: 'Papua New Guinea', callingCode: '+675' },
  { code: 'PH', name: 'Philippines', callingCode: '+63' },
  { code: 'PK', name: 'Pakistan', callingCode: '+92' },
  { code: 'PL', name: 'Poland', callingCode: '+48' },
  { code: 'PM', name: 'Saint Pierre and Miquelon', callingCode: '+508' },
  { code: 'PN', name: 'Pitcairn', callingCode: '+870' },
  { code: 'PR', name: 'Puerto Rico', callingCode: '+1' },
  { code: 'PS', name: 'Palestine', callingCode: '+970' },
  { code: 'PT', name: 'Portugal', callingCode: '+351' },
  { code: 'PW', name: 'Palau', callingCode: '+680' },
  { code: 'PY', name: 'Paraguay', callingCode: '+595' },
  { code: 'QA', name: 'Qatar', callingCode: '+974' },
  { code: 'RE', name: 'Réunion', callingCode: '+262' },
  { code: 'RO', name: 'Romania', callingCode: '+40' },
  { code: 'RS', name: 'Serbia', callingCode: '+381' },
  { code: 'RU', name: 'Russia', callingCode: '+7' },
  { code: 'RW', name: 'Rwanda', callingCode: '+250' },
  { code: 'SA', name: 'Saudi Arabia', callingCode: '+966' },
  { code: 'SB', name: 'Solomon Islands', callingCode: '+677' },
  { code: 'SC', name: 'Seychelles', callingCode: '+248' },
  { code: 'SD', name: 'Sudan', callingCode: '+249' },
  { code: 'SE', name: 'Sweden', callingCode: '+46' },
  { code: 'SG', name: 'Singapore', callingCode: '+65' },
  { code: 'SH', name: 'Saint Helena', callingCode: '+290' },
  { code: 'SI', name: 'Slovenia', callingCode: '+386' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen', callingCode: '+47' },
  { code: 'SK', name: 'Slovakia', callingCode: '+421' },
  { code: 'SL', name: 'Sierra Leone', callingCode: '+232' },
  { code: 'SM', name: 'San Marino', callingCode: '+378' },
  { code: 'SN', name: 'Senegal', callingCode: '+221' },
  { code: 'SO', name: 'Somalia', callingCode: '+252' },
  { code: 'SR', name: 'Suriname', callingCode: '+597' },
  { code: 'SS', name: 'South Sudan', callingCode: '+211' },
  { code: 'ST', name: 'São Tomé and Príncipe', callingCode: '+239' },
  { code: 'SV', name: 'El Salvador', callingCode: '+503' },
  { code: 'SX', name: 'Sint Maarten', callingCode: '+1721' },
  { code: 'SY', name: 'Syria', callingCode: '+963' },
  { code: 'SZ', name: 'Eswatini', callingCode: '+268' },
  { code: 'TC', name: 'Turks and Caicos Islands', callingCode: '+1649' },
  { code: 'TD', name: 'Chad', callingCode: '+235' },
  { code: 'TF', name: 'French Southern Territories', callingCode: '+262' },
  { code: 'TG', name: 'Togo', callingCode: '+228' },
  { code: 'TH', name: 'Thailand', callingCode: '+66' },
  { code: 'TJ', name: 'Tajikistan', callingCode: '+992' },
  { code: 'TK', name: 'Tokelau', callingCode: '+690' },
  { code: 'TL', name: 'Timor-Leste', callingCode: '+670' },
  { code: 'TM', name: 'Turkmenistan', callingCode: '+993' },
  { code: 'TN', name: 'Tunisia', callingCode: '+216' },
  { code: 'TO', name: 'Tonga', callingCode: '+676' },
  { code: 'TR', name: 'Turkey', callingCode: '+90' },
  { code: 'TT', name: 'Trinidad and Tobago', callingCode: '+1868' },
  { code: 'TV', name: 'Tuvalu', callingCode: '+688' },
  { code: 'TW', name: 'Taiwan', callingCode: '+886' },
  { code: 'TZ', name: 'Tanzania', callingCode: '+255' },
  { code: 'UA', name: 'Ukraine', callingCode: '+380' },
  { code: 'UG', name: 'Uganda', callingCode: '+256' },
  { code: 'UM', name: 'United States Minor Outlying Islands', callingCode: '+1' },
  { code: 'US', name: 'United States', callingCode: '+1' },
  { code: 'UY', name: 'Uruguay', callingCode: '+598' },
  { code: 'UZ', name: 'Uzbekistan', callingCode: '+998' },
  { code: 'VA', name: 'Vatican City', callingCode: '+39' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', callingCode: '+1784' },
  { code: 'VE', name: 'Venezuela', callingCode: '+58' },
  { code: 'VG', name: 'British Virgin Islands', callingCode: '+1284' },
  { code: 'VI', name: 'U.S. Virgin Islands', callingCode: '+1340' },
  { code: 'VN', name: 'Vietnam', callingCode: '+84' },
  { code: 'VU', name: 'Vanuatu', callingCode: '+678' },
  { code: 'WF', name: 'Wallis and Futuna', callingCode: '+681' },
  { code: 'WS', name: 'Samoa', callingCode: '+685' },
  { code: 'YE', name: 'Yemen', callingCode: '+967' },
  { code: 'YT', name: 'Mayotte', callingCode: '+262' },
  { code: 'ZA', name: 'South Africa', callingCode: '+27' },
  { code: 'ZM', name: 'Zambia', callingCode: '+260' },
  { code: 'ZW', name: 'Zimbabwe', callingCode: '+263' }
];

// Languages data
const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'cs', name: 'Czech' },
  { code: 'sk', name: 'Slovak' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'et', name: 'Estonian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'tl', name: 'Filipino' },
  { code: 'sw', name: 'Swahili' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'Zulu' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'ur', name: 'Urdu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
  { code: 'my', name: 'Burmese' },
  { code: 'km', name: 'Khmer' },
  { code: 'lo', name: 'Lao' },
  { code: 'ka', name: 'Georgian' },
  { code: 'hy', name: 'Armenian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'tj', name: 'Tajik' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'fo', name: 'Faroese' },
  { code: 'mt', name: 'Maltese' },
  { code: 'cy', name: 'Welsh' },
  { code: 'ga', name: 'Irish' },
  { code: 'gd', name: 'Scottish Gaelic' },
  { code: 'eu', name: 'Basque' },
  { code: 'ca', name: 'Catalan' },
  { code: 'gl', name: 'Galician' },
  { code: 'br', name: 'Breton' },
  { code: 'co', name: 'Corsican' },
  { code: 'oc', name: 'Occitan' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'rm', name: 'Romansh' },
  { code: 'fur', name: 'Friulian' },
  { code: 'sc', name: 'Sardinian' },
  { code: 'vec', name: 'Venetian' },
  { code: 'nap', name: 'Neapolitan' },
  { code: 'scn', name: 'Sicilian' },
];

// Function to detect country from phone number
const detectCountryFromPhone = (phone) => {
  if (!phone || phone.length < 2) return null;
  
  try {
    // Try libphonenumber-js first
    const phoneNumber = parsePhoneNumber(phone);
    if (phoneNumber?.country) {
      return phoneNumber.country;
    }
  } catch {
    // Continue to manual parsing if libphonenumber fails
  }
  
  // Manual parsing as fallback
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 2) return null;
  
  // Try to match by calling code (longest match first)
  const sortedCountries = [...countries].sort((a, b) => 
    b.callingCode.replace('+', '').length - a.callingCode.replace('+', '').length
  );
  
  for (const country of sortedCountries) {
    const callingCode = country.callingCode.replace('+', '');
    if (cleanPhone.startsWith(callingCode) && callingCode.length >= 1) {
      return country.code;
    }
  }
  
  return null;
};

const UserForm = ({ user, onSuccess, onCancel, roles, customSubmit, isModal: _isModal }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.profile_image_url || null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  useEffect(() => {
    if (user) {
      const normalizedAge = coerceNumber(user.age ?? user.age_years ?? user.ageYears);
      const normalizedWeight = coerceNumber(user.weight ?? user.weight_kg ?? user.weightKg);

      form.setFieldsValue({
        ...user,
        age: normalizedAge,
        weight: normalizedWeight,
      });
      setAvatarUrl(user.profile_image_url);
      
      // Set initial country based on user's phone number or country field
      let detectedFromPhone = null;
      
      if (user.phone) {
        const detectedCountryCode = detectCountryFromPhone(user.phone);
        if (detectedCountryCode) {
          detectedFromPhone = countries.find(c => c.code === detectedCountryCode);
        }
      }
      
      if (detectedFromPhone) {
        setSelectedCountry(detectedFromPhone);
        if (!user.country) {
          form.setFieldsValue({ country: detectedFromPhone.name });
        }
      } else if (user.country) {
        const country = countries.find(c => 
          c.name === user.country || c.code === user.country
        );
        setSelectedCountry(country);
      }
    } else {
      // Initialize form for new user
      form.resetFields();
      setAvatarUrl(null);
      setSelectedCountry(null);
      
      // Set only essential defaults, no country default to avoid contamination
      // Find student role dynamically from the roles prop
      const studentRole = roles?.find(r => r.name === 'student');
      
      form.setFieldsValue({ 
        role_id: studentRole?.id || undefined, // Use undefined if role not found (will trigger validation)
        preferred_currency: 'EUR',
        language: 'en'
      });
    }
  }, [user, form, roles]);

  // Handle phone number change and auto-detect country
  const handlePhoneChange = (e) => {
    const phone = e.target.value;
    
    // Auto-detect country if phone number is long enough (reduced threshold)
    if (phone.length >= 3) {
      const detectedCountryCode = detectCountryFromPhone(phone);
      if (detectedCountryCode) {
        const country = countries.find(c => c.code === detectedCountryCode);
        if (country) {
          setSelectedCountry(country);
          form.setFieldsValue({ country: country.name });
          // Silent detection - no notification to user
        }
      }
    } else if (phone.length === 0) {
      // Reset country when phone is cleared
      setSelectedCountry(null);
    }
  };

  // Handle country selection
  const handleCountryChange = (countryName) => {
    const country = countries.find(c => c.name === countryName);
    setSelectedCountry(country);
  };

  const coerceNumber = (value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const sanitizeNumericField = (target, field, precision) => {
    if (!target || !(field in target)) {
      return;
    }

    const raw = target[field];
    if (raw === undefined || raw === null || raw === '') {
      delete target[field];
      return;
    }

    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(numeric)) {
      delete target[field];
      return;
    }

    if (typeof precision === 'number') {
      const factor = 10 ** precision;
      target[field] = Math.round(numeric * factor) / factor;
    } else {
      target[field] = numeric;
    }
  };

  const persistUser = async (payload) => {
    if (user && user.id) {
      await DataService.updateUser(user.id, payload);
      message.success('User updated successfully!');
      onSuccess?.();
      return;
    }

    const defaultRoleId = roles?.find(r => r.name === 'student')?.id || 'b8073752-02c0-40d6-8cba-24bb7dc95e23';
    payload.role_id = payload.role_id ?? defaultRoleId;
    await DataService.createUser(payload);
    message.success('User created successfully!');
    form.resetFields();
    setSelectedCountry(null);
    setAvatarUrl(null);
    onSuccess?.();
  };

  const handleFinish = async (values) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        profile_image_url: avatarUrl,
        name: `${values.first_name || ''} ${values.last_name || ''}`.trim(),
      };

      // Remove confirm_password as it's not needed in the API
      delete payload.confirm_password;

      sanitizeNumericField(payload, 'age', 0);
      sanitizeNumericField(payload, 'weight', 2);

      if (typeof customSubmit === 'function') {
        await customSubmit(payload);
        onSuccess?.();
        return;
      }

  await persistUser(payload);
    } catch (error) {
      // Display specific error message if available, otherwise show a generic message
      message.error(error.message || 'An error occurred while saving the user.');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = (info) => {
    if (info.file.status === 'uploading' && info.file.originFileObj) {
      // Show immediate preview
      const url = URL.createObjectURL(info.file.originFileObj);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(url);
      setAvatarUrl(url);
    }
    if (info.file.status === 'done') {
      message.success(`${info.file.name} file uploaded successfully`);
    } else if (info.file.status === 'error') {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        setAvatarPreviewUrl(null);
      }
      message.error(`${info.file.name} file upload failed.`);
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const beforeUpload = (file) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isJpgOrPng) {
      message.error('You can only upload JPG/PNG file!');
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error('Image must smaller than 2MB!');
    }
    return isJpgOrPng && isLt2M;
  };

  // Lightweight helper to update current user avatar in localStorage if matching
  const syncCurrentUserAvatar = (userId, url) => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.id === userId) {
        localStorage.setItem('user', JSON.stringify({ ...parsed, profile_image_url: url }));
      }
    } catch {}
  };

  const postAvatarUpload = useCallback(async (file, progressCb) => {
    const formData = new FormData();
    if (user?.id) {
      formData.append('targetUserId', user.id);
    }
    formData.append('avatar', file);
    return apiClient.post('/users/upload-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: ({ total, loaded }) => {
        if (total && progressCb) {
          progressCb(Math.round((loaded / total) * 100));
        }
      }
    });
  }, [user?.id]);

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        level: 'Beginner',
        country: 'Spain',
        preferred_currency: 'EUR',
      }}
    >
      <Row gutter={24}>        <Col span={24} style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={100} src={avatarPreviewUrl || avatarUrl} icon={<UserOutlined />} />
          <div>
            <Upload
              name="avatar"
              showUploadList={false}
              beforeUpload={beforeUpload}
              onChange={handleAvatarUpload}
              customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                try {
                  const response = await postAvatarUpload(file, (percent) => {
                    onProgress?.({ percent });
                  });
                  const bust = response.data?.cacheBust || Date.now();
                  const newUrl = response.data?.url ? `${response.data.url}?v=${bust}` : null;
                  if (newUrl) {
                    form.setFieldsValue({ profile_image_url: newUrl });
                    setAvatarUrl(newUrl);
                    const syncedTargetId = response.data?.targetUserId || response.data?.user?.id;
                    if (syncedTargetId) {
                      syncCurrentUserAvatar(syncedTargetId, newUrl);
                    }
                  }
                  onSuccess?.(response.data);
                } catch (err) {
                  onError?.(err);
                }
              }}
            >
              <Button icon={<UploadOutlined />} style={{ marginTop: 8 }}>
                Change Avatar
              </Button>
            </Upload>
          </div>
          <Form.Item name="profile_image_url" hidden><Input /></Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="first_name"
            label="First Name"
            rules={[{ required: true, message: 'Please input the first name!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Enter first name" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="last_name"
            label="Last Name"
            rules={[{ required: true, message: 'Please input the last name!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Enter last name" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { type: 'email', message: 'The input is not valid E-mail!' },
              { required: true, message: 'Please input the email!' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="Enter email address" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="phone"
            label="Phone Number"
            rules={[{ required: true, message: 'Please input the phone number!' }]}
          >
            <Input 
              prefix={<PhoneOutlined />} 
              placeholder="Enter phone number with country code" 
              onChange={handlePhoneChange}
              addonBefore={selectedCountry ? (
                <ReactCountryFlag countryCode={selectedCountry.code} svg style={{ width: '16px', height: '12px' }} />
              ) : (
                <span style={{ width: '16px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>
                  🌍
                </span>
              )}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} sm={12}>
          <Form.Item name="age" label="Age">
            <InputNumber min={16} max={100} style={{ width: '100%' }} placeholder="Enter age" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="weight" label="Weight (kg)">
            <InputNumber 
              min={30} 
              max={200} 
              step={0.1}
              style={{ width: '100%' }} 
              placeholder="Enter weight in kg"
              precision={1}
              addonAfter="kg"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} sm={12}>
          <Form.Item name="preferred_currency" label="Preferred Currency">
            <Select placeholder="Select currency">
              <Option value="EUR">EUR - Euro</Option>
              <Option value="USD">USD - US Dollar</Option>
              <Option value="GBP">GBP - British Pound</Option>
              <Option value="TRY">TRY - Turkish Lira</Option>
              <Option value="CHF">CHF - Swiss Franc</Option>
              <Option value="CAD">CAD - Canadian Dollar</Option>
              <Option value="AUD">AUD - Australian Dollar</Option>
              <Option value="JPY">JPY - Japanese Yen</Option>
              <Option value="CNY">CNY - Chinese Yuan</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="language" label="Preferred Language">
            <Select 
              placeholder="Select language"
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {languages.map(lang => (
                <Option key={lang.code} value={lang.code}>
                  {lang.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} sm={12}>
          <Form.Item name="city" label="City">
            <Input prefix={<EnvironmentOutlined />} placeholder="Enter city" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="country" label="Country">
            <Select 
              placeholder="Select country"
              showSearch
              allowClear
              notFoundContent="No countries found"
              filterOption={(input, option) => {
                const country = countries.find(c => c.code === option.key);
                if (!country) return false;
                const searchText = input.toLowerCase();
                return country.name.toLowerCase().includes(searchText) || 
                       country.callingCode.includes(searchText);
              }}
              onChange={handleCountryChange}
            >
              {countries.map(country => (
                <Option key={country.code} value={country.name}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ReactCountryFlag countryCode={country.code} svg style={{ width: '20px', height: '15px' }} />
                    {country.name} ({country.callingCode})
                  </span>
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {roles && roles.length > 0 && (
        <Form.Item
          name="role_id"
          label="Role"
          rules={[{ required: true, message: 'Please select a role' }]}
        >
          <Select placeholder="Select a role">
            {roles.map(role => (
              <Option key={role.id} value={role.id}>{role.name}</Option>
            ))}
          </Select>
        </Form.Item>
      )}

      {!user && (
        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Please input a password!' }]}
              hasFeedback
            >
              <Input.Password placeholder="Enter password" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="confirm_password"
              label="Confirm Password"
              dependencies={['password']}
              hasFeedback
              rules={[
                { required: true, message: 'Please confirm your password!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('The two passwords that you entered do not match!'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Confirm password" />
            </Form.Item>
          </Col>
        </Row>
      )}

      <Form.Item style={{ marginTop: 24, textAlign: 'right' }}>
        <Button onClick={onCancel} style={{ marginRight: 8 }}>
          Cancel
        </Button>        <Button type="primary" htmlType="submit" loading={loading}>
          {user && user.id ? 'Save Changes' : 'Create User'}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default UserForm;