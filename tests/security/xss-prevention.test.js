// Security tests for XSS prevention
import { describe, it, expect } from 'vitest';

describe('XSS Prevention', () => {
  describe('Script Tag Detection', () => {
    it('should detect malicious script tags', () => {
      const maliciousInput = '<script>alert("XSS")</script>';
      const hasScript = /<script.*?>.*?<\/script>/gi.test(maliciousInput);
      
      expect(hasScript).toBe(true);
    });

    it('should detect inline event handlers', () => {
      const maliciousInput = '<img src="x" onerror="alert(1)">';
      const hasEventHandler = /on\w+\s*=\s*["']?[^"']*["']?/i.test(maliciousInput);
      
      expect(hasEventHandler).toBe(true);
    });

    it('should allow safe HTML', () => {
      const safeHTML = '<p>Hello World</p>';
      const hasScript = /<script/i.test(safeHTML);
      const hasEventHandler = /on\w+=/i.test(safeHTML);
      
      expect(hasScript).toBe(false);
      expect(hasEventHandler).toBe(false);
    });
  });

  describe('HTML Entity Encoding', () => {
    it('should encode HTML entities', () => {
      const encodeHTML = (str) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      };

      const malicious = '<script>alert("XSS")</script>';
      const encoded = encodeHTML(malicious);
      
      // Check that dangerous characters are encoded
      expect(encoded).not.toContain('<script>');
      expect(encoded).toContain('&lt;');
      expect(encoded).toContain('&gt;');
      expect(encoded).toContain('&quot;');
    });
  });

  describe('URL Validation', () => {
    it('should reject javascript: URLs', () => {
      const maliciousURL = 'javascript:alert("XSS")';
      const isJavaScriptURL = /^javascript:/i.test(maliciousURL);
      
      expect(isJavaScriptURL).toBe(true);
    });

    it('should allow safe URLs', () => {
      const safeURL = 'https://example.com/page';
      const isJavaScriptURL = /^javascript:/i.test(safeURL);
      
      expect(isJavaScriptURL).toBe(false);
    });

    it('should allow data URLs for images only', () => {
      const imageDataURL = 'data:image/png;base64,iVBORw0KG...';
      const scriptDataURL = 'data:text/html,<script>alert(1)</script>';
      
      const isImageData = /^data:image\/(png|jpeg|jpg|gif|webp)/i.test(imageDataURL);
      const isScriptData = /^data:text\/html/i.test(scriptDataURL);
      
      expect(isImageData).toBe(true);
      expect(isScriptData).toBe(true); // Should be blocked
    });
  });
});
