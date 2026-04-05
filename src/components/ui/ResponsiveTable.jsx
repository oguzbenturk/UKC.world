import React, { useState } from 'react';
import { Card, Table, Button, Tooltip } from 'antd';
import { 
  MenuOutlined, 
  TableOutlined,
  AppstoreOutlined,
  EyeOutlined 
} from '@ant-design/icons';

/**
 * ResponsiveTable Component
 * 
 * A table component that automatically switches between:
 * - Desktop: Traditional table layout
 * - Mobile: Card-based layout for better readability
 * 
 * Props:
 * - columns: Array of column definitions (Ant Design format)
 * - dataSource: Array of data objects
 * - mobileCardRenderer: Function to render mobile card layout
 * - breakpoint: Screen width breakpoint for switching (default: 768px)
 * - pagination: Pagination config (passed to Ant Table)
 * - loading: Loading state
 * - onRowClick: Function to handle row/card clicks
 */

const ResponsiveTable = ({
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
  ...tableProps
}) => {
  const [viewMode, setViewMode] = useState('auto'); // 'auto', 'table', 'cards'
  const [isMobile, setIsMobile] = useState(window.innerWidth <= breakpoint);

  // Listen for window resize
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  // Determine if we should show cards
  const shouldShowCards = viewMode === 'cards' || (viewMode === 'auto' && isMobile);

  // Default mobile card renderer if none provided
  const defaultMobileCardRenderer = (record, index) => (
    <Card
      key={record[rowKey] || index}
      className="mb-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onRowClick && onRowClick(record)}
      size="small"
    >
      <div className="space-y-2">
        {columns.slice(0, 4).map((col, idx) => {
          if (col.dataIndex && record[col.dataIndex] !== undefined) {
            return (
              <div key={col.dataIndex || col.key || `col-${idx}`} className="flex justify-between items-center">
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

  const renderMobileCards = () => {
    const cardRenderer = mobileCardRenderer || defaultMobileCardRenderer;
    
    return (
      <div className="space-y-3">
        {dataSource.map((record, index) => cardRenderer(record, index))}
        
        {dataSource.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </div>
    );
  };

  const renderDesktopTable = () => (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey={rowKey}
      pagination={pagination}
      loading={loading}
      scroll={{ x: 'max-content' }}
      onRow={(record) => ({
        onClick: () => onRowClick && onRowClick(record),
        className: onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
      })}
      summary={summary}
      className={className}
      {...tableProps}
    />
  );

  return (
    <div className="responsive-table-container">
      {/* View Mode Toggle (only show when not in auto mode or for user preference) */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-gray-600 text-sm">
          {shouldShowCards ? 'Card View' : 'Table View'}
          {isMobile && viewMode === 'auto' && (
            <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
              Mobile Optimized
            </span>
          )}
        </div>
        
        <div className="flex gap-1">
          <Tooltip title="Auto (responsive)">
            <Button
              type={viewMode === 'auto' ? 'primary' : 'default'}
              size="small"
              icon={<MenuOutlined />}
              onClick={() => setViewMode('auto')}
            />
          </Tooltip>
          <Tooltip title="Table view">
            <Button
              type={viewMode === 'table' ? 'primary' : 'default'}
              size="small"
              icon={<TableOutlined />}
              onClick={() => setViewMode('table')}
            />
          </Tooltip>
          <Tooltip title="Card view">
            <Button
              type={viewMode === 'cards' ? 'primary' : 'default'}
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => setViewMode('cards')}
            />
          </Tooltip>
        </div>
      </div>

      {/* Render content based on view mode */}
      {shouldShowCards ? renderMobileCards() : renderDesktopTable()}
    </div>
  );
};

export default ResponsiveTable;
