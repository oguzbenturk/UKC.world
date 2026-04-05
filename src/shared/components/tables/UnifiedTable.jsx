// No explicit React import needed for JSX with modern bundlers
import { defaultAuditCell } from './unifiedTableAuditPresets.jsx';

/**
 * UnifiedTable
 *
 * Lightweight presentational wrapper to standardize table look & feel.
 * Works with any table markup (native table, TanStack, Antd Table inside) via children.
 *
 * Props:
 * - title?: string | ReactNode
 * - actions?: ReactNode (right-aligned header actions)
 * - stickyFirstCol?: boolean (applies styling helper classes to first column)
 * - density?: 'comfortable' | 'compact'
 * - className?: string
 * - auditColumn?: Column definition override (title, render, etc.)
 * - defaultAuditRenderer?: function to render audit cell fallback
 */
function UnifiedTable({
  title,
  actions,
  stickyFirstCol = false,
  density = 'comfortable',
  className = '',
  children,
  auditColumn,
  defaultAuditRenderer,
}) {
  const densityRow = density === 'compact' ? 'py-1.5 text-sm' : 'py-2.5';
  const root = `rounded-md border border-gray-200 shadow-sm bg-white ${className}`;
  const scrollWrapperClasses = 'w-full overflow-x-auto sm:overflow-x-auto';

  const auditColumnConfig = auditColumn
    ? {
        title: auditColumn.title || 'Created By',
        key: auditColumn.key || 'createdBy',
        width: auditColumn.width,
        render: auditColumn.render,
        dataIndex: auditColumn.dataIndex,
      }
    : null;

  const auditRenderer = auditColumnConfig
    ? auditColumnConfig.render
    : defaultAuditRenderer || defaultAuditCell;

  return (
    <div className={root}>
      {(title || actions) && (
        <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
          <div className="font-medium text-gray-800 truncate">{title}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div
        className={scrollWrapperClasses}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Consumers render their table here. Optionally apply sticky/spacing via provided class helpers. */}
        {typeof children === 'function'
          ? children({ densityRow, stickyFirstCol, auditColumn: auditColumnConfig, renderAudit: auditRenderer })
          : children}
      </div>
    </div>
  );
}

export default UnifiedTable;
