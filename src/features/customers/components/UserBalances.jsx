import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '@/shared/hooks/useData';
import { formatCurrency } from '@/shared/utils/formatters';

function UserBalances({ userId, initialTransactions = [], lessonPackages = [], rentals = [] }) {
  const { api } = useData();
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, month, week
  const [transactions, setTransactions] = useState(initialTransactions);
  const [userAccount, setUserAccount] = useState(null);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [fundsForm, setFundsForm] = useState({
    amount: '',
    description: '',
    paymentMethod: 'cash',
    referenceNumber: ''
  });
    useEffect(() => {
    if (userId) {
      loadUserFinancials();
    }
  }, [userId]);
  
  const loadUserFinancials = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Try new unified endpoint first
      let response;
      try {
        response = await api.get(`/finances/accounts/${userId}`);
      } catch (error) {
        // Fallback to legacy endpoint for backward compatibility
        if (error.response?.status === 404) {
          response = await api.get(`/finances/student-accounts/${userId}`);
        } else {
          throw error;
        }
      }
      
      setUserAccount(response.data.account);
      setTransactions(response.data.transactions || []);
    } catch (err) {
      console.error('Error loading user financials:', err);
      
      // If it's a 404, set empty data instead of showing error
      if (err.response?.status === 404) {
        setUserAccount({ 
          balance: 0, 
          total_spent: 0, 
          package_hours: 0, 
          remaining_hours: 0 
        });
        setTransactions([]);
      } else {
        setError('Failed to load financial data');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAddFunds = async (e) => {
    e.preventDefault();
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try new unified endpoint first
      let endpoint = `/finances/accounts/${userId}/add-funds`;
      try {
        await api.post(endpoint, {
          amount: parseFloat(fundsForm.amount),
          description: fundsForm.description || 'Account deposit',
          paymentMethod: fundsForm.paymentMethod,
          referenceNumber: fundsForm.referenceNumber
        });
      } catch (error) {
        // Fallback to legacy endpoint for backward compatibility
        if (error.response?.status === 404) {
          await api.post(`/finances/student-accounts/${userId}/add-funds`, {
            amount: parseFloat(fundsForm.amount),
            description: fundsForm.description || 'Account deposit',
            paymentMethod: fundsForm.paymentMethod,
            referenceNumber: fundsForm.referenceNumber
          });
        } else {
          throw error;
        }
      }
      
      setShowAddFundsModal(false);
      setFundsForm({
        amount: '',
        description: '',
        paymentMethod: 'cash',
        referenceNumber: ''
      });
      
      await loadUserFinancials();
    } catch (err) {
      console.error('Error adding funds:', err);
      setError('Failed to add funds');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total balances and filter transactions based on selected period
  const {
    filteredTransactions,
    totalBalance,
    outstandingBalance,
    packageBalance,
    rentalBalance
  } = useMemo(() => {
    const now = new Date();
    
    // Filter transactions based on selected period
    const filtered = transactions.filter(t => {
      if (selectedPeriod === 'all') return true;
      
      const transactionDate = new Date(t.transaction_date);
      if (selectedPeriod === 'month') {
        return (
          transactionDate.getMonth() === now.getMonth() &&
          transactionDate.getFullYear() === now.getFullYear()
        );
      }
      if (selectedPeriod === 'week') {
        const diffTime = Math.abs(now - transactionDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      return true;
    });

    // Current account balance from the backend
    const accountBalance = studentAccount ? parseFloat(studentAccount.balance) : 0;
    
    // Calculate outstanding balances from lessons and rentals
    const outstanding = lessonPackages.reduce((acc, p) => acc + (p.totalAmount - p.paidAmount), 0) +
                       rentals.reduce((acc, r) => acc + (r.totalAmount - r.paidAmount), 0);
    const packageBal = lessonPackages.reduce((acc, p) => acc + (p.remainingLessons * p.pricePerLesson), 0);
    const rentalBal = rentals.reduce((acc, r) => acc + (r.deposit || 0), 0);

    return {
      filteredTransactions: filtered,
      totalBalance: accountBalance,
      outstandingBalance: outstanding,
      packageBalance: packageBal,
      rentalBalance: rentalBal
    };
  }, [transactions, lessonPackages, rentals, selectedPeriod, studentAccount]);

  const columns = useMemo(() => [    { Header: 'User ID', accessor: 'userId' },
    { Header: 'User Name', accessor: 'userName' },
    { Header: 'Balance', accessor: 'balance', Cell: ({ value }) => formatCurrency(value) }
  ], []);

  const data = useMemo(() => 
    users.map(user => ({
      userId: user.id,
      userName: user.name,
      balance: user.balance
    })), [users]
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Balance</h3>
          <p className={`mt-2 text-xl font-semibold ${totalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalBalance)}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Outstanding Balance</h3>
          <p className="mt-2 text-xl font-semibold text-amber-600">
            {formatCurrency(outstandingBalance)}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Package Balance</h3>
          <p className="mt-2 text-xl font-semibold text-blue-600">
            {formatCurrency(packageBalance)}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Package Hours</h3>
          <p className="mt-2 text-xl font-semibold text-green-600">
            {userAccount?.remaining_hours ? Number(userAccount.remaining_hours).toFixed(1) : '0.0'}h
            {userAccount?.package_hours > 0 && (
              <span className="text-sm text-gray-500 ml-1">
                / {userAccount.package_hours}h
              </span>
            )}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Rental Deposits</h3>
          <p className="mt-2 text-xl font-semibold text-purple-600">
            {formatCurrency(rentalBalance)}
          </p>
        </div>
      </div>

      {/* Time Period Filter */}
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-500">Show:</span>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="all">All Time</option>
          <option value="month">This Month</option>
          <option value="week">This Week</option>
        </select>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Transaction History</h3>
        </div>
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((transaction, index) => {
                  // Calculate running balance
                  const isCredit = transaction.type === 'payment' || transaction.type === 'refund';
                  const hasOriginalCurrency = transaction.original_currency && 
                    transaction.original_currency !== transaction.currency;
                  
                  return (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {transaction.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          isCredit
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {transaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          {formatCurrency(parseFloat(transaction.amount))}
                        </div>
                        {hasOriginalCurrency && (
                          <div className="text-xs text-gray-400">
                            ({transaction.original_amount} {transaction.original_currency})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {/* Individual transaction balance not available from API */}
                        {formatCurrency(studentAccount ? parseFloat(studentAccount.balance) : 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredTransactions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No transactions found for this period
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserBalances;
