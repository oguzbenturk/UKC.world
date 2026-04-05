/**
 * LazyImage Component
 * 
 * Lazy loads images using Intersection Observer API
 * Shows placeholder while loading and handles errors gracefully
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const LazyImage = ({ 
  src, 
  alt, 
  placeholder, 
  className = '', 
  style = {},
  onLoad,
  onError,
  threshold = 0.1,
  rootMargin = '50px',
  ...rest 
}) => {
  const [imageSrc, setImageSrc] = useState(placeholder || null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src || !imgRef.current) return;

    // If IntersectionObserver is not supported, load immediately
    if (!('IntersectionObserver' in window)) {
      setImageSrc(src);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageSrc(src);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, threshold, rootMargin]);

  const handleLoad = (event) => {
    setIsLoaded(true);
    onLoad?.(event);
  };

  const handleError = (event) => {
    setImageSrc(placeholder || null);
    onError?.(event);
  };

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={`${className} ${isLoaded ? 'lazy-image-loaded' : 'lazy-image-loading'}`}
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease-in-out',
      }}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
};

LazyImage.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  threshold: PropTypes.number,
  rootMargin: PropTypes.string,
};

export default LazyImage;
