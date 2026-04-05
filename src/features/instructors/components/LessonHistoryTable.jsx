import { format } from 'date-fns';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

function LessonHistoryTable({ lessons = [] }) {
  const { formatCurrency, businessCurrency } = useCurrency();

  const getStatusColor = (status) => {
    const colors = {
      completed: 'bg-green-100 text-green-800',
      confirmed: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const renderAmount = (amount, currency) => {
    if (amount == null) return 'N/A';
    return formatCurrency(Number(amount) || 0, currency || businessCurrency || 'EUR');
  };

  const getPaymentBadge = (lesson) => {
    const method = lesson.paymentMethod;
    const isPackage =
      method === 'Package Hours' ||
      (method && method !== 'Individual Payment' && method !== 'Paid');
    const color = isPackage
      ? 'bg-blue-100 text-blue-800'
      : method === 'Individual Payment'
      ? 'bg-green-100 text-green-800'
      : 'bg-green-100 text-green-800'; // Pay-and-go: default to green (paid)
    const label = isPackage
      ? method === 'Package Hours'
        ? 'Package Hours'
        : `Package: ${method}`
      : method || 'Paid'; // Pay-and-go: default to Paid
    return { color, label };
  };

  if (!lessons || lessons.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No lesson history available</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date & Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Student
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Service
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Payment
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {lessons.map((lesson) => {
            const { color, label } = getPaymentBadge(lesson);
            return (
              <tr key={lesson.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div>
                    <div className="font-medium">
                      {lesson.date
                        ? format(new Date(lesson.date), 'MMM dd, yyyy')
                        : 'Unknown date'}
                    </div>
                    <div className="text-gray-500">
                      {lesson.start_hour
                        ? `${lesson.start_hour}:00`
                        : lesson.timeSlot || 'Unknown time'}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {lesson.student_name || lesson.studentName || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {lesson.service_name || lesson.serviceName || lesson.lessonType || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {lesson.duration ? `${lesson.duration}h` : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(lesson.status)}`}>
                    {lesson.status || 'unknown'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${color}`}>
                    {label}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {renderAmount(lesson.final_amount ?? lesson.amount, lesson.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default LessonHistoryTable;