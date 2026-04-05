/**
 * Round academy-emerald brand dot for the UKC wordmark (replaces typographic • / period).
 * Width/height use `em` — parent must set `font-size` to match the adjacent "UKC" text.
 */
export function UkcBrandDot({ className = '', style = {} }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-emerald-400 ${className}`}
      style={{
        width: '0.26em',
        height: '0.26em',
        position: 'relative',
        top: '0.14em',
        fontSize: 'inherit',
        ...style,
      }}
    />
  );
}

/** Navbar / shop default: Gotham UKC + emerald dot (1.5rem) */
export function UkcBrandWordmark({
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
      <span className={ukcClassName} style={{ letterSpacing: '0.1em' }}>
        UKC
      </span>
      <UkcBrandDot
        className={['ml-[0.03em]', dotClassName].filter(Boolean).join(' ')}
        style={{ top: '-0.02em', ...dotStyle }}
      />
    </span>
  );
}
