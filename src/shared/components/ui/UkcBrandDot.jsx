export function BrandWordmark({
  className = '',
  ukcClassName = 'text-white',
  rootStyle = {},
  dotClassName = '',
  dotStyle = {},
}) {
  return (
    <span
      className={`inline-flex items-baseline font-gotham-bold antialiased ${className}`}
      style={{
        fontSize: '1.5rem',
        textRendering: 'geometricPrecision',
        ...rootStyle,
      }}
    >
      <span className={ukcClassName} style={{ letterSpacing: '0.05em' }}>
        Plannivo
      </span>
    </span>
  );
}

export function BrandDot({ className = '', style = {} }) {
  return null;
}

// Backward-compat aliases
export const UkcBrandWordmark = BrandWordmark;
export const UkcBrandDot = BrandDot;
