import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

/**
 * Virtual List Component for High-Performance Rendering
 * Optimizes rendering of large datasets by only rendering visible items
 */
const VirtualList = ({ 
    items = [], 
    itemHeight = 80, 
    height = 400, 
    width = '100%',
    renderItem,
    className = '',
    overscan = 5 // Number of items to render outside visible area
}) => {
    // Memoize the Row component to prevent unnecessary re-renders
    const Row = useMemo(() => ({ index, style }) => (
        <div style={style}>
            {renderItem(items[index], index)}
        </div>
    ), [items, renderItem]);

    return (
        <div className={className} style={{ height, width }}>
            <List
                height={height}
                itemCount={items.length}
                itemSize={itemHeight}
                width={width}
                overscanCount={overscan}
            >
                {Row}
            </List>
        </div>
    );
};

/**
 * Variable Height Virtual List for items with different heights
 */
export const VariableVirtualList = ({ 
    items = [], 
    getItemHeight,
    height = 400, 
    width = '100%',
    renderItem,
    className = '',
    overscan = 5
}) => {
    const itemHeights = useMemo(() => 
        items.map((item, index) => getItemHeight(item, index)),
        [items, getItemHeight]
    );

    const getItemSize = (index) => itemHeights[index] || 80;

    const Row = useMemo(() => ({ index, style }) => (
        <div style={style}>
            {renderItem(items[index], index)}
        </div>
    ), [items, renderItem]);

    return (
        <div className={className} style={{ height, width }}>
            <List
                height={height}
                itemCount={items.length}
                itemSize={getItemSize}
                width={width}
                overscanCount={overscan}
            >
                {Row}
            </List>
        </div>
    );
};

/**
 * Grid Virtual List for grid layouts
 */
export const VirtualGrid = ({
    items = [],
    columnCount = 3,
    rowHeight = 200,
    columnWidth = 200,
    height = 400,
    width = '100%',
    renderItem,
    className = '',
    overscan = 2
}) => {
    const rowCount = Math.ceil(items.length / columnCount);

    const Cell = useMemo(() => ({ columnIndex, rowIndex, style }) => {
        const index = rowIndex * columnCount + columnIndex;
        const item = items[index];
        
        if (!item) return null;

        return (
            <div style={style}>
                {renderItem(item, index)}
            </div>
        );
    }, [items, columnCount, renderItem]);

    return (
        <div className={className} style={{ height, width }}>
            <List
                columnCount={columnCount}
                columnWidth={columnWidth}
                height={height}
                rowCount={rowCount}
                rowHeight={rowHeight}
                width={width}
                overscanRowCount={overscan}
                overscanColumnCount={overscan}
            >
                {Cell}
            </List>
        </div>
    );
};

export default VirtualList;
