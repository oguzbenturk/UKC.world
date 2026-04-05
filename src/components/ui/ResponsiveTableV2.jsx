import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Button, Select } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import './ResponsiveTable.css';

/**
 * Default Mobile Card Renderer
 */
const DefaultMobileCard = ({ record, index, columns, rowKey, onRowClick }) => {
  const startX = useRef(0);
  const startY = useRef(0);
  const moved = useRef(false);
  const threshold = 10; // px

  const onStart = (x, y) => {
    startX.current = x;
    startY.current = y;
    moved.current = false;
  };
  const onMove = (x, y) => {
    if (Math.abs(x - startX.current) > threshold || Math.abs(y - startY.current) > threshold) {
      moved.current = true;
    }
  };
  const onActivate = () => {
    if (!moved.current && onRowClick) onRowClick(record);
  };

  return (
    <Card
      key={record[rowKey] || index}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onMouseDown={(e) => onStart(e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        const t = e.touches?.[0];
        if (t) onStart(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches?.[0];
        if (t) onMove(t.clientX, t.clientY);
      }}
      onClick={onActivate}
      size="small"
    >
      <div className="space-y-2">
        {columns.slice(0, 4).map((col) => {
          if (col.dataIndex && record[col.dataIndex] !== undefined) {
            return (
              <div key={col.dataIndex || col.key || col.title} className="flex justify-between items-center">
                <span className="text-gray-600 text-sm font-medium">
                  {col.title}:
                </span>
                <span className="text-gray-900 text-sm">
                  {col.render ? col.render(record[col.dataIndex], record, index) : record[col.dataIndex]}
                </span>
              </div>
            );
          }
          return null;
        })}
        
        {/* Show actions if available */}
        {columns.find(col => col.key === 'actions') && (
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onRowClick && onRowClick(record);
              }}
            >
              View Details
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

/**
 * View Mode Toggle Component
 */
const ViewModeToggle = ({ viewMode, setViewMode }) => (
  <div className="flex items-center gap-2">
    <span className="text-gray-600 text-sm font-medium">View:</span>
    <Select
      size="small"
      value={viewMode}
      style={{ minWidth: 120 }}
      onChange={(v) => setViewMode(v)}
      options={[
        { label: 'Auto', value: 'auto' },
        { label: 'Table', value: 'table' },
        { label: 'Cards', value: 'cards' },
      ]}
    />
  </div>
);

/**
 * ResponsiveTable Component
 * 
 * A table component that automatically switches between:
 * - Desktop: Traditional table layout
 * - Mobile: Card-based layout for better readability
 */
const ResponsiveTable = (props) => {
  const {
    columns = [],
    dataSource = [],
    mobileCardRenderer,
    breakpoint = 768,
    pagination = { pageSize: 10 },
    loading = false,
    onRowClick,
    rowKey = 'id',
    summary,
    className = '',
    // Optional key to persist the selected view mode between sessions
    storageKey = 'responsiveTable.viewMode',
    // New prop to hide the view toggle (when used with UnifiedTable)
    hideViewToggle = false,
    // Callback to provide view toggle component to parent
    onViewToggleReady = null,
    ...tableProps
  } = props;

  // Initialize view mode from localStorage (auto/table/cards)
  const [viewMode, setViewModeState] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (saved && ['auto', 'table', 'cards'].includes(saved)) return saved;
    } catch { /* ignore storage errors */ }
    return 'auto';
  });
  const setViewMode = useCallback((v) => {
    setViewModeState(v);
    try {
      if (typeof window !== 'undefined') localStorage.setItem(storageKey, v);
    } catch { /* ignore storage errors */ }
  }, [storageKey]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= breakpoint);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  // Provide view toggle to parent if callback is provided
  useEffect(() => {
    if (onViewToggleReady) {
      const viewToggle = (
        <ViewModeToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      );
      onViewToggleReady(viewToggle);
    }
  }, [viewMode, setViewMode, onViewToggleReady]);

  const shouldShowCards = viewMode === 'cards' || (viewMode === 'auto' && isMobile);

  const renderMobileCards = useCallback(() => {
    const CardComponent = mobileCardRenderer || DefaultMobileCard;
    
    return (
      <div className="space-y-3">
        {dataSource.map((record, index) => (
          <CardComponent
            key={record[rowKey] || index}
            record={record}
            index={index}
            columns={columns}
            rowKey={rowKey}
            onRowClick={onRowClick}
          />
        ))}
        
        {dataSource.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </div>
    );
  }, [dataSource, mobileCardRenderer, columns, rowKey, onRowClick, loading]);

  const renderDesktopTable = useCallback(() => (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey={rowKey}
      pagination={pagination}
      loading={loading}
      scroll={{ x: 'max-content' }}
      // Do NOT attach a row click by default; rely on explicit action buttons for opening details on desktop
      onRow={() => ({})}
      summary={summary}
      className={className}
      {...tableProps}
    />
  ), [columns, dataSource, rowKey, pagination, loading, summary, className, tableProps]);

  return (
    <div className="responsive-table-container">
      {!hideViewToggle && (
        <ViewModeToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}

      {shouldShowCards ? renderMobileCards() : renderDesktopTable()}
    </div>
  );
};

/**
 * UnifiedResponsiveTable - A wrapper that combines UnifiedTable with ResponsiveTable
 * and moves the view selector to the UnifiedTable header
 */
const UnifiedResponsiveTable = ({ title, density, className, ...props }) => {
  const [viewToggle, setViewToggle] = useState(null);

  return (
    <UnifiedTable
      title={title}
      density={density}
      className={className}
      actions={viewToggle}
    >
      <ResponsiveTable
        {...props}
        hideViewToggle={true}
        onViewToggleReady={setViewToggle}
      />
    </UnifiedTable>
  );
};

export { ViewModeToggle, UnifiedResponsiveTable };
export default ResponsiveTable;
