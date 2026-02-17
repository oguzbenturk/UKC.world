import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/shared/utils/formatters';
import {
  MagnifyingGlassIcon as SearchIcon,
} from '@heroicons/react/24/solid';
import { Tag, Badge } from 'antd'; // Add likely needed components
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';

const DEFAULT_SYSTEM_LABEL = 'System automation';

const toTitleCase = (value) =>
  (value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const safeFormatDate = (value, pattern) => {
  if (!value) {
    return null;
  }

  try {
    const dateInstance = new Date(value);
    if (Number.isNaN(dateInstance.getTime())) {
      return null;
    }
    return format(dateInstance, pattern);
  } catch {
    return null;
  }
};

const deriveTransactionDate = (transaction) =>
  transaction?.date || transaction?.transactionDate || transaction?.createdAt || null;

const getTransactionCategory = (transaction) =>
  (transaction?.category || transaction?.type || 'other').toLowerCase();

const matchesSearchTerm = (transaction, normalizedSearch, resolveCustomerName) => {
  if (!normalizedSearch) {
    return true;
  }

  const fields = [
    transaction?.description,
    transaction?.reference,
    transaction?.referenceNumber,
    transaction?.createdByLabel,
    transaction?.createdBy,
  ];

  if (typeof resolveCustomerName === 'function') {
    const customerName = resolveCustomerName(transaction);
    if (typeof customerName === 'string' && customerName.trim() !== '') {
      fields.push(customerName);
    }
  }

  return fields.some(
    (field) => typeof field === 'string' && field.toLowerCase().includes(normalizedSearch)
  );
};

const matchesTypeSelection = (transaction, selectedTypes) => {
  if (!selectedTypes || selectedTypes.length === 0) {
    return true;
  }

  const category = getTransactionCategory(transaction);
  return selectedTypes.includes(category);
};

const matchesDateRange = (transaction, startDate, endDate) => {
  if (!startDate && !endDate) {
    return true;
  }

  const candidateDate = deriveTransactionDate(transaction);
  if (!candidateDate) {
    return true;
  }

  const parsed = new Date(candidateDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  if (startDate && parsed < startDate) {
    return false;
  }

  if (endDate && parsed > endDate) {
    return false;
  }

  return true;
};

const compareStrings = (a, b, direction) => {
  const first = typeof a === 'string' ? a : (a ?? '').toString();
  const second = typeof b === 'string' ? b : (b ?? '').toString();
  return direction === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
};

const compareNumbers = (a, b, direction) => {
  const first = Number(a) || 0;
  const second = Number(b) || 0;
  return direction === 'asc' ? first - second : second - first;
};

const createTransactionComparator = (field, direction, resolveCustomerName) => {
  if (field === 'date') {
    return (a, b) => {
      const toTime = (candidate) => {
        const dateValue = deriveTransactionDate(candidate);
        return dateValue ? new Date(dateValue).getTime() : 0;
      };
      return compareNumbers(toTime(a), toTime(b), direction);
    };
  }

  if (field === 'amount') {
    return (a, b) => compareNumbers(a.amount, b.amount, direction);
  }

  if (field === 'category') {
    return (a, b) =>
      compareStrings(getTransactionCategory(a), getTransactionCategory(b), direction);
  }

  if (field === 'customer') {
    return (a, b) => compareStrings(resolveCustomerName(a), resolveCustomerName(b), direction);
  }

  return (a, b) => compareStrings(a[field], b[field], direction);
};

const findFirstString = (candidates) =>
  candidates.find((candidate) => typeof candidate === 'string' && candidate.trim() !== '');

const findFirstIdentifier = (candidates) =>
  candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');

function TransactionHistory({ transactions = [], customerDirectory }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const customerLookup = useMemo(() => {
    if (!customerDirectory) {
      return () => undefined;
    }

    if (customerDirectory instanceof Map) {
      return (id) => customerDirectory.get(String(id));
    }

    if (typeof customerDirectory === 'object') {
      const map = new Map();
      Object.entries(customerDirectory).forEach(([key, value]) => {
        if (value) {
          map.set(String(key), value);
        }
      });
      return (id) => map.get(String(id));
    }

    return () => undefined;
  }, [customerDirectory]);

  const resolveCustomerName = useCallback(
    (transaction) => {
      if (!transaction || typeof transaction !== 'object') {
        return '—';
      }

      const directLabel = findFirstString([
        transaction.customerName,
        transaction.customer_name,
        transaction.customer?.name,
        transaction.customer?.fullName,
        transaction.customer?.full_name,
        transaction.userName,
        transaction.user_name,
        transaction.user?.name,
        transaction.user?.fullName,
        transaction.user?.full_name,
        transaction.studentName,
        transaction.student_name,
        transaction.student?.name,
        transaction.student?.fullName,
        transaction.student?.full_name,
      ]);

      if (directLabel) {
        return directLabel.trim();
      }

      const identifier = findFirstIdentifier([
        transaction.customerId,
        transaction.customer_id,
        transaction.studentId,
        transaction.student_id,
        transaction.userId,
        transaction.user_id,
        transaction.contactId,
        transaction.contact_id,
      ]);

      if (identifier !== undefined && identifier !== null) {
        const lookupLabel = customerLookup(identifier);
        if (lookupLabel) {
          return lookupLabel;
        }
        return String(identifier);
      }

      return '—';
    },
    [customerLookup]
  );

  const transactionTypes = useMemo(() => {
    const categorySet = new Set();
    transactions.forEach((transaction) => {
      const candidate = getTransactionCategory(transaction);
      if (!candidate) {
        return;
      }
      categorySet.add(candidate);
    });

    const sorted = Array.from(categorySet).sort();

    if (sorted.includes('other')) {
      const withoutOther = sorted.filter((item) => item !== 'other');
      withoutOther.push('other');
      return withoutOther;
    }

    return sorted;
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return transactions
      .filter((transaction) => {
        if (!matchesSearchTerm(transaction, normalizedSearch, resolveCustomerName)) {
          return false;
        }

        if (!matchesTypeSelection(transaction, selectedTypes)) {
          return false;
        }

        if (!matchesDateRange(transaction, startDate, endDate)) {
          return false;
        }

        return true;
      });
  }, [transactions, searchTerm, selectedTypes, dateRange, resolveCustomerName]);

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const columns = [
    {
      title: 'Date',
      key: 'date',
      sorter: createTransactionComparator('date', 'asc', resolveCustomerName),
      render: (_, record) => <span>{safeFormatDate(deriveTransactionDate(record), 'MMM d, yyyy') || '—'}</span>
    },
    {
      title: 'Type',
      key: 'category',
      sorter: createTransactionComparator('category', 'asc', resolveCustomerName),
      render: (_, record) => {
        const category = getTransactionCategory(record);
        const colorMap = {
           lesson: 'blue', rental: 'green', package: 'purple',
           refund: 'gold', credit: 'cyan', charge: 'magenta',
           payment: 'geekblue', other: 'default'
        };
        const color = colorMap[category] || 'default';
        return <Tag color={color}>{toTitleCase(category)}</Tag>;
      }
    },
    {
       title: 'Description',
       dataIndex: 'description',
       key: 'description',
       sorter: createTransactionComparator('description', 'asc', resolveCustomerName),
       render: (text) => <span className="text-slate-700">{text}</span>
    },
    {
       title: 'Customer',
       key: 'customer',
       sorter: createTransactionComparator('customer', 'asc', resolveCustomerName),
       render: (_, record) => resolveCustomerName(record)
    },
    {
       title: 'Amount',
       key: 'amount',
       sorter: createTransactionComparator('amount', 'asc', resolveCustomerName),
       render: (_, record) => (
         <span className={`font-medium ${record.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(record.amount, record.currency)}
         </span>
       )
    },
    {
        title: 'Created By',
        key: 'createdByLabel',
        sorter: createTransactionComparator('createdByLabel', 'asc', resolveCustomerName),
        render: (_, record) => <span className="text-xs text-slate-500">{record.createdByLabel || DEFAULT_SYSTEM_LABEL}</span>
    },
    {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        sorter: createTransactionComparator('status', 'asc', resolveCustomerName),
        render: (status) => (
            <Badge 
               status={status === 'completed' ? 'success' : status === 'pending' ? 'warning' : 'error'}
               text={toTitleCase(status)}
            />
        )
    }
  ];

  const TransactionMobileCard = ({ record, onClick }) => (
    <div className="p-4 border rounded-lg mb-3 shadow-sm bg-white cursor-pointer hover:border-blue-300 transition-colors" onClick={onClick}>
        <div className="flex justify-between items-start mb-2">
           <div className="flex items-center gap-2">
               <span className="font-semibold text-slate-800">{safeFormatDate(deriveTransactionDate(record), 'MMM d, yyyy')}</span>
               <Tag className="m-0" color="blue">{toTitleCase(getTransactionCategory(record))}</Tag>
           </div>
           <span className={`font-bold ${record.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(record.amount, record.currency)}
           </span>
        </div>
        <div className="text-sm text-slate-600 mb-2 line-clamp-2">{record.description}</div>
        <div className="flex justify-between items-center border-t pt-2 max-w-full">
             <div className="text-xs text-slate-500 truncate max-w-[60%] flex items-center gap-1">
                <span>{resolveCustomerName(record)}</span>
             </div>
             <div className="flex-shrink-0">
               <Badge 
                  status={record.status === 'completed' ? 'success' : record.status === 'pending' ? 'warning' : 'error'} 
                  text={toTitleCase(record.status)}
               />
             </div>
        </div>
    </div>
  );
  
  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filters Section */}
      <div className="p-4 border-b border-gray-200 space-y-4">
        {/* Search and Date Range */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <SearchIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="self-center">to</span>
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
        </div>

        {/* Transaction Type Filters */}
        <div className="flex flex-wrap gap-2">
          {transactionTypes.map(type => (
            <button
              key={type}
              onClick={() => handleTypeToggle(type)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                selectedTypes.includes(type)
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {toTitleCase(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <UnifiedResponsiveTable
        columns={columns}
        dataSource={filteredTransactions}
        rowKey="id"
        pagination={{ pageSize: 15 }}
        onRow={(record) => ({
          onClick: () => setSelectedTransaction(record)
        })}
        mobileCardRenderer={(props) => (
           <TransactionMobileCard {...props} onClick={() => setSelectedTransaction(props.record)} />
        )}
      />

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-medium">Transaction Details</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p className="mt-1">
                    {safeFormatDate(deriveTransactionDate(selectedTransaction), 'MMMM d, yyyy') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Amount</p>
                  <p className="mt-1">
                    {formatCurrency(selectedTransaction.amount, selectedTransaction.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Type</p>
                  <p className="mt-1 capitalize">{toTitleCase(selectedTransaction.category || selectedTransaction.type)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <p className="mt-1 capitalize">{selectedTransaction.status}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created By</p>
                  <p className="mt-1">
                    {selectedTransaction.createdByLabel || DEFAULT_SYSTEM_LABEL}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Customer</p>
                  <p className="mt-1">{resolveCustomerName(selectedTransaction)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created At</p>
                  <p className="mt-1">
                    {safeFormatDate(selectedTransaction.createdAt, 'MMMM d, yyyy h:mm a') || '—'}
                  </p>
                </div>
                {selectedTransaction.original_currency && selectedTransaction.original_currency !== selectedTransaction.currency && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Original Amount</p>
                    <p className="mt-1">
                      {selectedTransaction.original_amount} {selectedTransaction.original_currency}
                      {selectedTransaction.transaction_exchange_rate && (
                        <span className="text-xs text-gray-400 ml-2">
                          (Rate: {selectedTransaction.transaction_exchange_rate})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Description</p>
                <p className="mt-1">{selectedTransaction.description}</p>
              </div>
              {selectedTransaction.reference && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Reference</p>
                  <p className="mt-1">{selectedTransaction.reference}</p>
                </div>
              )}
              {selectedTransaction.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Notes</p>
                  <p className="mt-1">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-6">
              <button
                onClick={() => setSelectedTransaction(null)}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
