/**
 * PublicFormLayout
 * Branded wrapper for public form pages
 * Supports background images, logos, custom colors, and footer branding
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Layout, Typography } from 'antd';
import { 
  FacebookOutlined, 
  InstagramOutlined, 
  TwitterOutlined, 
  YoutubeOutlined,
  LinkedinOutlined,
  GlobalOutlined
} from '@ant-design/icons';

const { Header, Content, Footer } = Layout;
const { Text, Title } = Typography;

// Default theme configuration
const DEFAULT_THEME = {
  background: {
    type: 'color', // 'color' | 'gradient' | 'image'
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
    footer_logos: [], // Array of { url: string, alt: string, href?: string }
    social_links: {}, // { facebook: url, instagram: url, etc. }
  },
  content: {
    form_title: '',
    form_description: '',
    show_title: true,
  },
  colors: {
    primary: '#1890ff',
    formBackground: 'rgba(255, 255, 255, 0.85)',
    formOpacity: 85,
    formBorderRadius: 16,
    textColor: '#333',
    headerTextColor: '#fff',
    titleColor: '#ffffff',
  },
};

// Social media icon mapping
const SOCIAL_ICONS = {
  facebook: FacebookOutlined,
  instagram: InstagramOutlined,
  twitter: TwitterOutlined,
  youtube: YoutubeOutlined,
  linkedin: LinkedinOutlined,
  website: GlobalOutlined,
};

/**
 * Merge user theme with defaults
 */
const mergeTheme = (themeConfig) => {
  if (!themeConfig) return DEFAULT_THEME;
  
  return {
    background: { ...DEFAULT_THEME.background, ...themeConfig.background },
    branding: { ...DEFAULT_THEME.branding, ...themeConfig.branding },
    content: { ...DEFAULT_THEME.content, ...themeConfig.content },
    colors: { ...DEFAULT_THEME.colors, ...themeConfig.colors },
  };
};

const PublicFormLayout = ({ 
  themeConfig, 
  formName,
  children,
}) => {
  const theme = useMemo(() => mergeTheme(themeConfig), [themeConfig]);
  
  // Background styles - using fixed positioning for full-screen background
  const backgroundStyle = useMemo(() => {
    return {
      minHeight: '100vh',
      position: 'relative',
      backgroundColor: '#1a1a2e', // Dark fallback for image edges
    };
  }, []);
  
  // Background image as a separate layer for better control
  const backgroundImageStyle = useMemo(() => {
    if (theme.background.type !== 'image' || !theme.background.image_url) {
      return null;
    }
    
    // Return style for the container, actual image will be rendered as img element
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 0,
      overflow: 'hidden',
    };
  }, [theme.background]);
  
  // Gradient/color background style
  const solidBackgroundStyle = useMemo(() => {
    if (theme.background.type === 'image') return null;
    
    if (theme.background.type === 'gradient' && theme.background.gradient) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: theme.background.gradient,
        zIndex: 0,
      };
    }
    
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.background.color || '#f0f2f5',
      zIndex: 0,
    };
  }, [theme.background]);
  
  // Overlay styles for readability
  const overlayStyle = useMemo(() => {
    if (theme.background.type !== 'image' || !theme.background.image_url) {
      return null;
    }
    
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.background.overlay_color || `rgba(0, 0, 0, ${theme.background.overlay_opacity || 0.4})`,
      backdropFilter: theme.background.blur ? `blur(${theme.background.blur}px)` : 'none',
      zIndex: 0,
      pointerEvents: 'none', // Allow clicks to pass through to content
    };
  }, [theme.background]);
  
  // Header component - Logo centered at top
  const renderHeader = () => {
    if (!theme.branding.show_header) return null;
    
    const hasLogo = theme.branding.logo_url;
    const hasCompanyName = theme.branding.company_name;
    
    if (!hasLogo && !hasCompanyName) return null;
    
    return (
      <Header
        style={{
          background: theme.branding.header_bg_color || 'transparent',
          padding: '24px',
          height: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 10,
          lineHeight: 1.4,
        }}
      >
        {theme.branding.logo_url && (
          <img 
            src={theme.branding.logo_url} 
            alt={theme.branding.company_name || formName}
            style={{ 
              height: 180, 
              maxHeight: 220,
              maxWidth: '360px',
              objectFit: 'contain',
              marginBottom: theme.branding.company_name ? 16 : 0,
            }}
          />
        )}
        {theme.branding.company_name && (
          <Text 
            style={{ 
              fontSize: 14, 
              color: theme.colors.headerTextColor || '#fff',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            {theme.branding.company_name}
          </Text>
        )}
      </Header>
    );
  };
  
  // Footer component - Partner logos + social icons
  const renderFooter = () => {
    if (!theme.branding.show_footer) return null;
    
    const hasFooterLogos = theme.branding.footer_logos?.length > 0;
    const hasSocialLinks = theme.branding.social_links && 
      Object.values(theme.branding.social_links).some(v => v);
    
    // Don't render if nothing to show
    if (!hasFooterLogos && !hasSocialLinks && !theme.branding.footer_text) {
      return null;
    }
    
    return (
      <Footer
        style={{
          background: 'transparent',
          padding: '32px 24px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Footer logos - grayscale for subtle look */}
        {hasFooterLogos && (
          <div className="flex items-center justify-center gap-6 mb-4 flex-wrap">
            {theme.branding.footer_logos.map((logo, index) => (
              logo.href ? (
                <a 
                  key={logo.url || index}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img 
                    src={logo.url} 
                    alt={logo.alt || 'Partner logo'}
                    style={{ 
                      height: 60, 
                      objectFit: 'contain',
                      filter: 'grayscale(100%) brightness(2)',
                      opacity: 0.8,
                      transition: 'all 0.3s ease',
                    }}
                    className="hover:opacity-100 hover:filter-none"
                  />
                </a>
              ) : (
                <img 
                  key={logo.url || index}
                  src={logo.url} 
                  alt={logo.alt || 'Partner logo'}
                  style={{ 
                    height: 60, 
                    objectFit: 'contain',
                    filter: 'grayscale(100%) brightness(2)',
                    opacity: 0.8,
                  }}
                />
              )
            ))}
          </div>
        )}
        
        {/* Social links in footer */}
        {hasSocialLinks && (
          <div className="flex items-center justify-center gap-5 mb-3">
            {Object.entries(theme.branding.social_links).map(([platform, url]) => {
              if (!url) return null;
              const IconComponent = SOCIAL_ICONS[platform];
              if (!IconComponent) return null;
              
              return (
                <a 
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    fontSize: 22,
                    transition: 'color 0.3s ease',
                  }}
                  className="hover:text-white"
                >
                  <IconComponent />
                </a>
              );
            })}
          </div>
        )}
        
        {/* Footer text */}
        {theme.branding.footer_text && (
          <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
            {theme.branding.footer_text}
          </Text>
        )}
      </Footer>
    );
  };
  
  return (
    <Layout style={backgroundStyle}>
      {/* Background image layer - using img element for proper aspect ratio */}
      {backgroundImageStyle && (
        <div style={backgroundImageStyle}>
          <img 
            src={theme.background.image_url}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: theme.background.image_fit || 'cover',
              objectPosition: 'center',
            }}
          />
        </div>
      )}
      
      {/* Solid/gradient background layer */}
      {solidBackgroundStyle && <div style={solidBackgroundStyle} />}
      
      {/* Background overlay for readability */}
      {overlayStyle && <div style={overlayStyle} />}
      
      {renderHeader()}
      
      <Content
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '24px 12px', // Reduced padding for mobile
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center', // Center vertically
          flex: 1,
        }}
        className="sm:py-10 sm:px-4" // Larger padding on desktop
      >
        <div
          style={{
            width: '100%',
            maxWidth: 720,
          }}
        >
          {/* Form Title & Description - Above the form card */}
          {theme.content.show_title && (theme.content.form_title || theme.content.form_description) && (
            <div 
              style={{ 
                marginBottom: 24,
                textAlign: 'left',
                padding: '0 4px', // Small padding for mobile
              }}
            >
                  {theme.content.form_title && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Title 
                    level={1}
                    style={{ 
                      color: theme.colors.titleColor || '#fff',
                      marginBottom: 6,
                      fontWeight: 700,
                      textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      textAlign: 'center'
                    }}
                    className="text-xl sm:text-2xl md:text-4xl"
                  >
                    {theme.content.form_title}
                  </Title>
                  {theme.content.form_subtitle && (
                    <div style={{
                      color: theme.colors.titleColor || '#fff',
                      marginBottom: 8,
                      fontWeight: 700,
                      textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      textAlign: 'center'
                    }} className="text-xl sm:text-2xl md:text-4xl">
                      {theme.content.form_subtitle}
                    </div>
                  )}
                </div>
              )}

              {theme.content.form_description && (
                <Text 
                  style={{ 
                    color: theme.colors.titleColor || '#fff',
                    opacity: 0.9,
                    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    display: 'block',
                    lineHeight: 1.6,
                    textAlign: 'center'
                  }}
                  className="text-sm sm:text-base md:text-lg" // Responsive font size
                >
                  {theme.content.form_description}
                </Text>
              )}
            </div>
          )}
          
          {/* Form content with frosted glass card */}
          <div
            style={{
              background: theme.colors.formOpacity 
                ? `rgba(255, 255, 255, ${theme.colors.formOpacity / 100})`
                : theme.colors.formBackground,
              borderRadius: theme.colors.formBorderRadius,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', // Safari support
              border: '1px solid rgba(255, 255, 255, 0.25)',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {children}
          </div>
        </div>
      </Content>
      
      {renderFooter()}
    </Layout>
  );
};

PublicFormLayout.propTypes = {
  themeConfig: PropTypes.shape({
    background: PropTypes.shape({
      type: PropTypes.oneOf(['color', 'gradient', 'image']),
      color: PropTypes.string,
      gradient: PropTypes.string,
      image_url: PropTypes.string,
      overlay_opacity: PropTypes.number,
      overlay_color: PropTypes.string,
      blur: PropTypes.number,
    }),
    branding: PropTypes.shape({
      logo_url: PropTypes.string,
      company_name: PropTypes.string,
      show_header: PropTypes.bool,
      header_bg_color: PropTypes.string,
      show_footer: PropTypes.bool,
      footer_text: PropTypes.string,
      footer_logos: PropTypes.arrayOf(PropTypes.shape({
        url: PropTypes.string.isRequired,
        alt: PropTypes.string,
        href: PropTypes.string,
      })),
      social_links: PropTypes.object,
    }),
    content: PropTypes.shape({
      form_title: PropTypes.string,
      form_description: PropTypes.string,
      show_title: PropTypes.bool,
    }),
    colors: PropTypes.shape({
      primary: PropTypes.string,
      formBackground: PropTypes.string,
      formOpacity: PropTypes.number,
      formBorderRadius: PropTypes.number,
      textColor: PropTypes.string,
      headerTextColor: PropTypes.string,
      titleColor: PropTypes.string,
    }),
  }),
  formName: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default PublicFormLayout;
