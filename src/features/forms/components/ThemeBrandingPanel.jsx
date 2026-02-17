/**
 * Theme Branding Panel
 * UI for customizing form appearance - background, logo, colors, footer
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Form,
  Input,
  Select,
  Switch,
  Slider,
  Button,
  Upload,
  App,
  Collapse,
  ColorPicker,
  Space,
  Card,
  Typography,
  Divider,
  List,
  Modal,
} from 'antd';
import {
  UploadOutlined,
  PlusOutlined,
  DeleteOutlined,
  PictureOutlined,
  BgColorsOutlined,
  GlobalOutlined,
  FacebookOutlined,
  InstagramOutlined,
  TwitterOutlined,
  YoutubeOutlined,
  LinkedinOutlined,
  FormOutlined,
} from '@ant-design/icons';
import PropTypes from 'prop-types';
import apiClient from '@/shared/services/apiClient';
import { logger } from '@/shared/utils/logger';

const { Text, Title } = Typography;

// Default theme structure
const DEFAULT_THEME = {
  background: {
    type: 'color',
    color: '#f0f2f5',
    gradient: null,
    image_url: null,
    image_fit: 'cover', // 'cover' | 'contain'
    overlay_opacity: 0.4,
    overlay_color: 'rgba(0, 0, 0, 0.4)',
    blur: 0,
  },
  branding: {
    logo_url: null,
    company_name: '',
    show_header: true,
    header_bg_color: 'transparent',
    show_footer: true,
    footer_text: 'Powered by UKC.world',
    footer_logos: [],
    social_links: {},
  },
  content: {
    form_title: '',
    form_description: '',
    show_title: true,
  },
  colors: {
    primary: '#1890ff',
    formBackground: 'rgba(255, 255, 255, 0.92)',
    formOpacity: 92,
    formBorderRadius: 16,
    textColor: '#333',
    headerTextColor: '#fff',
    titleColor: '#ffffff',
  },
};

// Preset gradients
const GRADIENT_PRESETS = [
  { label: 'Ocean Blue', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Forest', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { label: 'Night Sky', value: 'linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)' },
  { label: 'Warm', value: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
  { label: 'Cool', value: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
];

// Parse opacity from rgba string (e.g., 'rgba(255, 255, 255, 0.85)' -> 85)
const parseFormOpacity = (rgba) => {
  if (!rgba) return 92;
  const match = rgba.match(/[\d.]+(?=\)$)/);
  if (match) {
    return Math.round(parseFloat(match[0]) * 100);
  }
  return 92;
};

const ThemeBrandingPanel = ({ themeConfig, onUpdate, disabled }) => {
  // Use App context for message
  const { message } = App.useApp();
  
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [footerLogoModalVisible, setFooterLogoModalVisible] = useState(false);
  const [newFooterLogo, setNewFooterLogo] = useState({ url: '', alt: '', href: '' });
  const debounceTimerRef = useRef(null);
  // Local state for uploaded images (for immediate preview)
  const [uploadedBackgroundUrl, setUploadedBackgroundUrl] = useState(null);
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState(null);
  
  // Merge current config with defaults (memoized to prevent re-renders)
  const currentTheme = useMemo(() => ({
    background: { ...DEFAULT_THEME.background, ...themeConfig?.background },
    branding: { ...DEFAULT_THEME.branding, ...themeConfig?.branding },
    content: { ...DEFAULT_THEME.content, ...themeConfig?.content },
    colors: { ...DEFAULT_THEME.colors, ...themeConfig?.colors },
  }), [themeConfig]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debounced update function - waits 800ms after last change before saving
  const debouncedUpdate = useCallback((newTheme) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      onUpdate({ theme_config: newTheme });
    }, 800);
  }, [onUpdate]);

  // Initialize form and local state - sync image URLs
  useEffect(() => {
    if (currentTheme.background.image_url) {
      setUploadedBackgroundUrl(currentTheme.background.image_url);
    }
    if (currentTheme.branding.logo_url) {
      setUploadedLogoUrl(currentTheme.branding.logo_url);
    }
  }, [currentTheme.background.image_url, currentTheme.branding.logo_url]);
  
  // Initialize form field values
  useEffect(() => {
    form.setFieldsValue({
      backgroundType: currentTheme.background.type,
      backgroundColor: currentTheme.background.color,
      backgroundGradient: currentTheme.background.gradient,
      backgroundImage: currentTheme.background.image_url,
      overlayOpacity: currentTheme.background.overlay_opacity * 100,
      overlayColor: currentTheme.background.overlay_color,
      backgroundBlur: currentTheme.background.blur,
      backgroundFit: currentTheme.background.image_fit || 'cover',
      formTitle: currentTheme.content.form_title,
      formSubtitle: currentTheme.content.form_subtitle,
      formDescription: currentTheme.content.form_description,
      showTitle: currentTheme.content.show_title,
      titleColor: currentTheme.colors.titleColor,
      showHeader: currentTheme.branding.show_header,
      logoUrl: currentTheme.branding.logo_url,
      companyName: currentTheme.branding.company_name,
      headerBgColor: currentTheme.branding.header_bg_color,
      showFooter: currentTheme.branding.show_footer,
      footerText: currentTheme.branding.footer_text,
      primaryColor: currentTheme.colors.primary,
      formBackground: currentTheme.colors.formBackground,
      formOpacity: currentTheme.colors.formOpacity ?? parseFormOpacity(currentTheme.colors.formBackground),
      formBorderRadius: currentTheme.colors.formBorderRadius,
      socialFacebook: currentTheme.branding.social_links?.facebook || '',
      socialInstagram: currentTheme.branding.social_links?.instagram || '',
      socialTwitter: currentTheme.branding.social_links?.twitter || '',
      socialYoutube: currentTheme.branding.social_links?.youtube || '',
      socialLinkedin: currentTheme.branding.social_links?.linkedin || '',
      socialWebsite: currentTheme.branding.social_links?.website || '',
    });
  }, [currentTheme, form]);

  // Handle form changes
  const handleValuesChange = (changedValues, allValues) => {
    // Preserve image_url from local state if form value is empty
    const backgroundImageUrl = allValues.backgroundImage || uploadedBackgroundUrl || currentTheme.background.image_url;
    const logoUrl = allValues.logoUrl || uploadedLogoUrl || currentTheme.branding.logo_url;
    
    const newTheme = {
      background: {
        type: allValues.backgroundType || currentTheme.background.type,
        color: allValues.backgroundColor || currentTheme.background.color,
        gradient: allValues.backgroundGradient || currentTheme.background.gradient,
        image_url: backgroundImageUrl,
        image_fit: allValues.backgroundFit || currentTheme.background.image_fit || 'cover',
        overlay_opacity: allValues.overlayOpacity !== undefined ? allValues.overlayOpacity / 100 : currentTheme.background.overlay_opacity,
        overlay_color: allValues.overlayColor || currentTheme.background.overlay_color,
        blur: allValues.backgroundBlur ?? currentTheme.background.blur ?? 0,
      },
      branding: {
        logo_url: logoUrl,
        company_name: allValues.companyName ?? currentTheme.branding.company_name,
        show_header: allValues.showHeader !== undefined ? allValues.showHeader : currentTheme.branding.show_header,
        header_bg_color: allValues.headerBgColor || currentTheme.branding.header_bg_color,
        show_footer: allValues.showFooter !== undefined ? allValues.showFooter : currentTheme.branding.show_footer,
        footer_text: allValues.footerText ?? currentTheme.branding.footer_text,
        footer_logos: currentTheme.branding.footer_logos,
        social_links: {
          facebook: allValues.socialFacebook || '',
          instagram: allValues.socialInstagram || '',
          twitter: allValues.socialTwitter || '',
          youtube: allValues.socialYoutube || '',
          linkedin: allValues.socialLinkedin || '',
          website: allValues.socialWebsite || '',
        },
      },
      content: {
        form_title: allValues.formTitle ?? currentTheme.content.form_title,
        form_subtitle: allValues.formSubtitle ?? currentTheme.content.form_subtitle,
        form_description: allValues.formDescription ?? currentTheme.content.form_description,
        show_title: allValues.showTitle !== undefined ? allValues.showTitle : currentTheme.content.show_title,
      },
      colors: {
        primary: allValues.primaryColor || currentTheme.colors.primary,
        formBackground: allValues.formBackground || currentTheme.colors.formBackground,
        formOpacity: allValues.formOpacity ?? currentTheme.colors.formOpacity,
        formBorderRadius: allValues.formBorderRadius ?? currentTheme.colors.formBorderRadius,
        textColor: currentTheme.colors.textColor,
        headerTextColor: currentTheme.colors.headerTextColor,
        titleColor: allValues.titleColor || currentTheme.colors.titleColor,
      },
    };
    
    // Use debounced update to avoid saving on every keystroke
    debouncedUpdate(newTheme);
  };

  // Handle background image upload
  const handleBackgroundUpload = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      setUploading(true);
      const response = await apiClient.post('/upload/form-background', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const imageUrl = response.data.url;
      
      // Update local state for immediate preview
      setUploadedBackgroundUrl(imageUrl);
      
      // Update form values
      form.setFieldsValue({
        backgroundImage: imageUrl,
        backgroundType: 'image',
      });
      
      // Build theme object and save immediately (no debounce for uploads)
      const allValues = form.getFieldsValue();
      
      const newTheme = {
        background: {
          type: 'image',
          color: allValues.backgroundColor || currentTheme.background.color,
          gradient: allValues.backgroundGradient || currentTheme.background.gradient,
          image_url: imageUrl,
          image_fit: allValues.backgroundFit || currentTheme.background.image_fit || 'cover',
          overlay_opacity: allValues.overlayOpacity !== undefined ? allValues.overlayOpacity / 100 : currentTheme.background.overlay_opacity,
          overlay_color: allValues.overlayColor || currentTheme.background.overlay_color,
          blur: allValues.backgroundBlur ?? currentTheme.background.blur ?? 0,
        },
        branding: {
          logo_url: allValues.logoUrl || uploadedLogoUrl || currentTheme.branding.logo_url,
          company_name: allValues.companyName ?? currentTheme.branding.company_name,
          show_header: allValues.showHeader !== undefined ? allValues.showHeader : currentTheme.branding.show_header,
          header_bg_color: allValues.headerBgColor || currentTheme.branding.header_bg_color,
          show_footer: allValues.showFooter !== undefined ? allValues.showFooter : currentTheme.branding.show_footer,
          footer_text: allValues.footerText ?? currentTheme.branding.footer_text,
          footer_logos: currentTheme.branding.footer_logos,
          social_links: {
            facebook: allValues.socialFacebook || currentTheme.branding.social_links?.facebook || '',
            instagram: allValues.socialInstagram || currentTheme.branding.social_links?.instagram || '',
            twitter: allValues.socialTwitter || currentTheme.branding.social_links?.twitter || '',
            youtube: allValues.socialYoutube || currentTheme.branding.social_links?.youtube || '',
            linkedin: allValues.socialLinkedin || currentTheme.branding.social_links?.linkedin || '',
            website: allValues.socialWebsite || currentTheme.branding.social_links?.website || '',
          },
        },
        content: {
          form_title: allValues.formTitle ?? currentTheme.content.form_title,
          form_description: allValues.formDescription ?? currentTheme.content.form_description,
          show_title: allValues.showTitle !== undefined ? allValues.showTitle : currentTheme.content.show_title,
        },
        colors: {
          primary: allValues.primaryColor || currentTheme.colors.primary,
          formBackground: allValues.formBackground || currentTheme.colors.formBackground,
          formOpacity: allValues.formOpacity ?? currentTheme.colors.formOpacity,
          formBorderRadius: allValues.formBorderRadius ?? currentTheme.colors.formBorderRadius,
          textColor: currentTheme.colors.textColor,
          headerTextColor: currentTheme.colors.headerTextColor,
          titleColor: allValues.titleColor || currentTheme.colors.titleColor,
        },
      };
      
      // Save immediately without debounce
      onUpdate({ theme_config: newTheme });
      message.success('Background uploaded and saved!');
    } catch (error) {
      logger.error('Upload error:', error);
      message.error('Failed to upload background image');
    } finally {
      setUploading(false);
    }
    
    return false; // Prevent default upload behavior
  };

  // Handle logo upload
  const handleLogoUpload = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      setUploading(true);
      const response = await apiClient.post('/upload/form-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const logoUrl = response.data.url;
      
      // Update local state for immediate preview
      setUploadedLogoUrl(logoUrl);
      
      // Update form value
      form.setFieldsValue({ logoUrl });
      
      // Build theme object and save immediately (no debounce for uploads)
      const allValues = form.getFieldsValue();
      const newTheme = {
        background: {
          type: allValues.backgroundType || currentTheme.background.type,
          color: allValues.backgroundColor || currentTheme.background.color,
          gradient: allValues.backgroundGradient || currentTheme.background.gradient,
          image_url: allValues.backgroundImage || currentTheme.background.image_url,
          image_fit: allValues.backgroundFit || currentTheme.background.image_fit || 'cover',
          overlay_opacity: allValues.overlayOpacity !== undefined ? allValues.overlayOpacity / 100 : currentTheme.background.overlay_opacity,
          overlay_color: allValues.overlayColor || currentTheme.background.overlay_color,
          blur: allValues.backgroundBlur ?? currentTheme.background.blur ?? 0,
        },
        branding: {
          logo_url: logoUrl,
          company_name: allValues.companyName ?? currentTheme.branding.company_name,
          show_header: allValues.showHeader !== undefined ? allValues.showHeader : currentTheme.branding.show_header,
          header_bg_color: allValues.headerBgColor || currentTheme.branding.header_bg_color,
          show_footer: allValues.showFooter !== undefined ? allValues.showFooter : currentTheme.branding.show_footer,
          footer_text: allValues.footerText ?? currentTheme.branding.footer_text,
          footer_logos: currentTheme.branding.footer_logos,
          social_links: {
            facebook: allValues.socialFacebook || currentTheme.branding.social_links?.facebook || '',
            instagram: allValues.socialInstagram || currentTheme.branding.social_links?.instagram || '',
            twitter: allValues.socialTwitter || currentTheme.branding.social_links?.twitter || '',
            youtube: allValues.socialYoutube || currentTheme.branding.social_links?.youtube || '',
            linkedin: allValues.socialLinkedin || currentTheme.branding.social_links?.linkedin || '',
            website: allValues.socialWebsite || currentTheme.branding.social_links?.website || '',
          },
        },
        content: {
          form_title: allValues.formTitle ?? currentTheme.content.form_title,
          form_description: allValues.formDescription ?? currentTheme.content.form_description,
          show_title: allValues.showTitle !== undefined ? allValues.showTitle : currentTheme.content.show_title,
        },
        colors: {
          primary: allValues.primaryColor || currentTheme.colors.primary,
          formBackground: allValues.formBackground || currentTheme.colors.formBackground,
          formOpacity: allValues.formOpacity ?? currentTheme.colors.formOpacity,
          formBorderRadius: allValues.formBorderRadius ?? currentTheme.colors.formBorderRadius,
          textColor: currentTheme.colors.textColor,
          headerTextColor: currentTheme.colors.headerTextColor,
          titleColor: allValues.titleColor || currentTheme.colors.titleColor,
        },
      };
      
      // Save immediately without debounce
      onUpdate({ theme_config: newTheme });
      message.success('Logo uploaded and saved!');
    } catch (error) {
      logger.error('Upload error:', error);
      message.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
    
    return false;
  };

  // Add footer logo
  const handleAddFooterLogo = () => {
    if (!newFooterLogo.url) {
      message.warning('Please enter a logo URL');
      return;
    }
    
    const updatedLogos = [
      ...currentTheme.branding.footer_logos,
      { ...newFooterLogo },
    ];
    
    const newTheme = {
      ...currentTheme,
      branding: {
        ...currentTheme.branding,
        footer_logos: updatedLogos,
      },
    };
    
    onUpdate({ theme_config: newTheme });
    setNewFooterLogo({ url: '', alt: '', href: '' });
    setFooterLogoModalVisible(false);
    message.success('Footer logo added');
  };

  // Remove footer logo
  const handleRemoveFooterLogo = (index) => {
    const updatedLogos = currentTheme.branding.footer_logos.filter((_, i) => i !== index);
    const newTheme = {
      ...currentTheme,
      branding: {
        ...currentTheme.branding,
        footer_logos: updatedLogos,
      },
    };
    onUpdate({ theme_config: newTheme });
  };

  // Handle footer logo image upload
  const handleFooterLogoUpload = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      setUploading(true);
      const response = await apiClient.post('/upload/form-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      setNewFooterLogo(prev => ({ ...prev, url: response.data.url }));
      message.success('Logo uploaded successfully');
    } catch (error) {
      logger.error('Upload error:', error);
      message.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
    
    return false;
  };

  const collapseItems = [
    {
      key: 'background',
      label: (
        <Space>
          <PictureOutlined />
          <span>Background</span>
        </Space>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item label="Type" name="backgroundType">
            <Select
              options={[
                { value: 'color', label: 'Solid Color' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'image', label: 'Image' },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.backgroundType !== curr.backgroundType}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('backgroundType');
              
              if (type === 'color') {
                return (
                  <Form.Item label="Color" name="backgroundColor">
                    <ColorPicker
                      showText
                      onChange={(color) => {
                        form.setFieldValue('backgroundColor', color.toHexString());
                        handleValuesChange({}, form.getFieldsValue());
                      }}
                    />
                  </Form.Item>
                );
              }
              
              if (type === 'gradient') {
                return (
                  <Form.Item label="Gradient" name="backgroundGradient">
                    <Select
                      options={GRADIENT_PRESETS}
                      placeholder="Select a gradient"
                      allowClear
                    />
                  </Form.Item>
                );
              }
              
              if (type === 'image') {
                return (
                  <>
                    <Form.Item label="Background Image">
                      <Upload
                        beforeUpload={handleBackgroundUpload}
                        showUploadList={false}
                        accept="image/*"
                      >
                        <Button icon={<UploadOutlined />} loading={uploading}>
                          Upload Background
                        </Button>
                      </Upload>
                      {(uploadedBackgroundUrl || form.getFieldValue('backgroundImage')) && (
                        <div className="mt-2">
                          <img
                            src={uploadedBackgroundUrl || form.getFieldValue('backgroundImage')}
                            alt="Background preview"
                            className="max-h-32 rounded border"
                          />
                        </div>
                      )}
                    </Form.Item>
                    
                    <Form.Item label="Image Fit Mode" name="backgroundFit">
                      <Select>
                        <Select.Option value="cover">
                          Cover (fills screen, may crop edges)
                        </Select.Option>
                        <Select.Option value="contain">
                          Contain (shows full image, may have bars)
                        </Select.Option>
                      </Select>
                    </Form.Item>
                    
                    <Form.Item label="Overlay Opacity" name="overlayOpacity">
                      <Slider min={0} max={100} />
                    </Form.Item>
                    
                    <Form.Item label="Background Blur" name="backgroundBlur">
                      <Slider min={0} max={20} />
                    </Form.Item>
                  </>
                );
              }
              
              return null;
            }}
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'content',
      label: (
        <Space>
          <FormOutlined />
          <span>Form Content</span>
        </Space>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item label="Show Title Section" name="showTitle" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Form Title" name="formTitle">
            <Input placeholder="e.g., Instructor Application" />
          </Form.Item>

          <Form.Item label="Form Subtitle" name="formSubtitle">
            <Input placeholder="e.g., Location - Urla" />
          </Form.Item>

          <Form.Item label="Form Description" name="formDescription">
            <Input.TextArea 
              rows={3} 
              placeholder="e.g., Join our team of professional instructors. Teach, ride, and enjoy an epic season in paradise!"
            />
          </Form.Item>

          <Form.Item label="Title Color" name="titleColor">
            <ColorPicker 
              showText
              onChange={(color) => {
                form.setFieldValue('titleColor', color.toHexString());
                handleValuesChange({}, form.getFieldsValue());
              }}
              presets={[
                { label: 'Recommended', colors: ['#ffffff', '#000000', '#1890ff', '#52c41a'] }
              ]}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'branding',
      label: (
        <Space>
          <GlobalOutlined />
          <span>Header & Logo</span>
        </Space>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item label="Show Header" name="showHeader" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Company Tagline" name="companyName">
            <Input placeholder="e.g., POWERED BY UKC" />
          </Form.Item>

          <Form.Item label="Logo">
            <Upload
              beforeUpload={handleLogoUpload}
              showUploadList={false}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />} loading={uploading}>
                Upload Logo
              </Button>
            </Upload>
            {(uploadedLogoUrl || form.getFieldValue('logoUrl')) && (
              <div className="mt-2">
                <img
                  src={uploadedLogoUrl || form.getFieldValue('logoUrl')}
                  alt="Logo preview"
                  className="max-h-12 rounded"
                />
                <Button
                  type="link"
                  danger
                  size="small"
                  onClick={() => {
                    setUploadedLogoUrl(null);
                    form.setFieldValue('logoUrl', null);
                    handleValuesChange({}, form.getFieldsValue());
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </Form.Item>

          <Form.Item label="Show Footer" name="showFooter" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Footer Text" name="footerText">
            <Input placeholder="Powered by UKC.world" />
          </Form.Item>

          <Divider>Footer Logos</Divider>
          
          <List
            size="small"
            dataSource={currentTheme.branding.footer_logos}
            renderItem={(logo, index) => (
              <List.Item
                actions={[
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveFooterLogo(index)}
                  />,
                ]}
              >
                <div className="flex items-center gap-2">
                  <img src={logo.url} alt={logo.alt} className="h-6 w-auto" />
                  <Text type="secondary" className="text-xs">{logo.alt || `Logo ${index + 1}`}</Text>
                </div>
              </List.Item>
            )}
            locale={{ emptyText: 'No footer logos' }}
          />
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => setFooterLogoModalVisible(true)}
          >
            Add Footer Logo
          </Button>
        </div>
      ),
    },
    {
      key: 'colors',
      label: (
        <Space>
          <BgColorsOutlined />
          <span>Colors & Style</span>
        </Space>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item label="Primary Color" name="primaryColor">
            <ColorPicker
              showText
              presets={[
                {
                  label: 'Brand Colors',
                  colors: ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'],
                },
              ]}
              onChange={(color) => {
                form.setFieldValue('primaryColor', color.toHexString());
                handleValuesChange({}, form.getFieldsValue());
              }}
            />
          </Form.Item>

          <Form.Item label="Form Card Opacity" name="formOpacity">
            <Slider 
              min={10} 
              max={100} 
              tooltip={{ formatter: (value) => `${value}%` }}
              onChange={(value) => {
                const opacity = value / 100;
                const bgColor = `rgba(255, 255, 255, ${opacity})`;
                form.setFieldValue('formBackground', bgColor);
                handleValuesChange({}, form.getFieldsValue());
              }}
            />
          </Form.Item>
          <Text type="secondary" className="text-xs" style={{ marginTop: -12, marginBottom: 16, display: 'block' }}>
            Lower values = more transparent, higher = more solid
          </Text>

          <Form.Item label="Form Border Radius" name="formBorderRadius">
            <Slider min={0} max={32} />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'social',
      label: (
        <Space>
          <FacebookOutlined />
          <span>Social Links</span>
        </Space>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item label={<><FacebookOutlined /> Facebook</>} name="socialFacebook">
            <Input placeholder="https://facebook.com/your-page" />
          </Form.Item>
          <Form.Item label={<><InstagramOutlined /> Instagram</>} name="socialInstagram">
            <Input placeholder="https://instagram.com/your-profile" />
          </Form.Item>
          <Form.Item label={<><TwitterOutlined /> Twitter</>} name="socialTwitter">
            <Input placeholder="https://twitter.com/your-handle" />
          </Form.Item>
          <Form.Item label={<><YoutubeOutlined /> YouTube</>} name="socialYoutube">
            <Input placeholder="https://youtube.com/your-channel" />
          </Form.Item>
          <Form.Item label={<><LinkedinOutlined /> LinkedIn</>} name="socialLinkedin">
            <Input placeholder="https://linkedin.com/company/your-company" />
          </Form.Item>
          <Form.Item label={<><GlobalOutlined /> Website</>} name="socialWebsite">
            <Input placeholder="https://your-website.com" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 h-full overflow-auto">
      <Title level={5} className="mb-4">
        Theme & Branding
      </Title>
      <Text type="secondary" className="block mb-4">
        Customize the look of your public form page
      </Text>

      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        disabled={disabled}
        size="small"
      >
        <Collapse
          items={collapseItems}
          defaultActiveKey={['background', 'content']}
          size="small"
        />
      </Form>

      {/* Preview hint */}
      <Card size="small" className="mt-4">
        <Text type="secondary" className="text-xs">
          💡 Click &quot;Preview&quot; in the header to see your branded form page
        </Text>
      </Card>

      {/* Footer Logo Modal */}
      <Modal
        title="Add Footer Logo"
        open={footerLogoModalVisible}
        onCancel={() => {
          setFooterLogoModalVisible(false);
          setNewFooterLogo({ url: '', alt: '', href: '' });
        }}
        onOk={handleAddFooterLogo}
        okText="Add Logo"
      >
        <div className="space-y-4">
          <div>
            <Text strong>Logo Image</Text>
            <div className="mt-2">
              <Upload
                beforeUpload={handleFooterLogoUpload}
                showUploadList={false}
                accept="image/*"
              >
                <Button icon={<UploadOutlined />} loading={uploading}>
                  Upload Logo
                </Button>
              </Upload>
              {newFooterLogo.url && (
                <div className="mt-2">
                  <img
                    src={newFooterLogo.url}
                    alt="Logo preview"
                    className="max-h-12 rounded border"
                  />
                </div>
              )}
            </div>
          </div>
          
          <div>
            <Text strong>Or enter URL</Text>
            <Input
              className="mt-2"
              placeholder="https://example.com/logo.png"
              value={newFooterLogo.url}
              onChange={(e) => setNewFooterLogo(prev => ({ ...prev, url: e.target.value }))}
            />
          </div>
          
          <div>
            <Text strong>Alt Text</Text>
            <Input
              className="mt-2"
              placeholder="Partner Name"
              value={newFooterLogo.alt}
              onChange={(e) => setNewFooterLogo(prev => ({ ...prev, alt: e.target.value }))}
            />
          </div>
          
          <div>
            <Text strong>Link URL (optional)</Text>
            <Input
              className="mt-2"
              placeholder="https://partner-website.com"
              value={newFooterLogo.href}
              onChange={(e) => setNewFooterLogo(prev => ({ ...prev, href: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

ThemeBrandingPanel.propTypes = {
  themeConfig: PropTypes.object,
  onUpdate: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default ThemeBrandingPanel;
