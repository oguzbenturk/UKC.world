import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

function LessonHistoryTable({ lessons = [] }) {
  const { t } = useTranslation(['instructor']);
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
        ? t('instructor:lessonHistory.packageHours')
        : t('instructor:lessonHistory.packagePrefix', { name: method })
      : method || t('instructor:lessonHistory.paid'); // Pay-and-go: default to Paid
    return { color, label };
  };

  if (!lessons || lessons.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">{t('instructor:lessonHistory.noHistory')}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.dateTime')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.student')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.service')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.duration')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.status')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.payment')}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('instructor:lessonHistory.columns.amount')}
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
                        : t('instructor:lessonHistory.unknownDate')}
                    </div>
                    <div className="text-gray-500">
                      {lesson.start_hour
                        ? `${lesson.start_hour}:00`
                        : lesson.timeSlot || t('instructor:lessonHistory.unknownTime')}
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