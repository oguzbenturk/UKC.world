import { Tooltip } from 'antd';

export const defaultAuditCell = ({ createdByLabel, createdAtFormatted }) => {
  const label = createdByLabel || 'System automation';
  const timestamp = createdAtFormatted;

  return (
    <Tooltip title={timestamp ? `Created ${timestamp}` : 'Created automatically'}>
      <div className="flex flex-col min-w-[180px]">
        <span className="font-medium text-gray-800" title={label}>
          {label}
        </span>
        <span className="text-xs text-gray-500">
          {timestamp || 'No timestamp'}
        </span>
      </div>
    </Tooltip>
  );
};

export const createCreatedByAuditColumn = (overrides = {}) => ({
  title: 'Created By',
  key: 'createdBy',
  dataIndex: 'createdByLabel',
  width: 220,
  render: overrides.render
    ? overrides.render
    : (_, record) => defaultAuditCell(record),
  ...overrides,
});
