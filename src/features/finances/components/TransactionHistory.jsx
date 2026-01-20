import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/shared/utils/formatters';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon as SearchIcon,
} from '@heroicons/react/24/solid';

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
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
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

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    const comparator = createTransactionComparator(sortField, sortDirection, resolveCustomerName);

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
      })
      .sort(comparator);
  }, [transactions, sortField, sortDirection, searchTerm, selectedTypes, dateRange, resolveCustomerName]);

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                { field: 'date', label: 'Date' },
                { field: 'category', label: 'Type' },
                { field: 'description', label: 'Description' },
                { field: 'customer', label: 'Customer' },
                { field: 'amount', label: 'Amount' },
                { field: 'createdByLabel', label: 'Created By' },
                { field: 'status', label: 'Status' }
              ].map(({ field, label }) => (
                <th
                  key={field}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort(field)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{label}</span>
                    <div className="flex flex-col">
                      <ChevronUpIcon className={`h-3 w-3 ${
                        sortField === field && sortDirection === 'asc'
                          ? 'text-blue-500'
                          : 'text-gray-400'
                      }`} />
                      <ChevronDownIcon className={`h-3 w-3 ${
                        sortField === field && sortDirection === 'desc'
                          ? 'text-blue-500'
                          : 'text-gray-400'
                      }`} />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedTransactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedTransaction(transaction)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  {safeFormatDate(deriveTransactionDate(transaction), 'MMM d, yyyy') || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {(() => {
                    const category = getTransactionCategory(transaction);
                    const colorMap = {
                      lesson: 'bg-blue-100 text-blue-800',
                      rental: 'bg-green-100 text-green-800',
                      package: 'bg-purple-100 text-purple-800',
                      refund: 'bg-yellow-100 text-yellow-800',
                      credit: 'bg-cyan-100 text-cyan-800',
                      charge: 'bg-rose-100 text-rose-800',
                      payment: 'bg-indigo-100 text-indigo-800',
                      other: 'bg-gray-100 text-gray-800'
                    };
                    const badgeColor = colorMap[category] || colorMap.other;
                    return (
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColor}`}>
                        {toTitleCase(category)}
                      </span>
                    );
                  })()}
                  {transaction.type && transaction.type.toLowerCase() !== getTransactionCategory(transaction) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {toTitleCase(transaction.type)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {transaction.description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {resolveCustomerName(transaction)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {transaction.createdByLabel || DEFAULT_SYSTEM_LABEL}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    {
                      completed: 'bg-green-100 text-green-800',
                      pending: 'bg-yellow-100 text-yellow-800',
                      failed: 'bg-red-100 text-red-800'
                    }[transaction.status]
                  }`}>
                    {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
