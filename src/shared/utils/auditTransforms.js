// Utility helpers to normalize audit metadata across API responses
// Converts snake_case audit fields from the backend into camelCase equivalents
// while preserving the original data for backwards compatibility.

export const extractAuditFields = (record = {}) => ({
  createdBy: record.createdBy ?? record.created_by ?? null,
  createdByName: record.createdByName ?? record.created_by_name ?? null,
  updatedBy: record.updatedBy ?? record.updated_by ?? null,
  updatedByName: record.updatedByName ?? record.updated_by_name ?? null,
  createdAt: record.createdAt ?? record.created_at ?? null,
  updatedAt: record.updatedAt ?? record.updated_at ?? null,
});

export const withAuditFields = (record) => {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const audit = extractAuditFields(record);
  return {
    ...record,
    ...audit,
  };
};

export const mapWithAuditFields = (collection) => {
  if (!Array.isArray(collection)) {
    return [];
  }

  return collection.map(withAuditFields);
};

export const normalizeAuditPayload = (payload) => {
  if (Array.isArray(payload)) {
    return mapWithAuditFields(payload);
  }

  if (payload && typeof payload === 'object') {
    return withAuditFields(payload);
  }

  return payload;
};
