// src/components/InstructorCard.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/shared/hooks/useAuth";
import EnhancedInstructorDetailModal from './EnhancedInstructorDetailModal';
import { getStatusColor } from '@/shared/utils/formatters';

const InstructorCard = ({ instructor, onDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const hasEditPermission = user && ['owner', 'manager', 'admin'].includes(user.role);

  const handleInstructorUpdate = () => {
    // You could fetch updated instructor data here if needed
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              {instructor.profile_image_url || instructor.avatar ? (
                <img
                  src={instructor.profile_image_url || instructor.avatar}
                  alt={instructor.name}
                  className="h-16 w-16 rounded-full object-cover border border-gray-200"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    e.currentTarget.style.display = 'none';
                    const sibling = e.currentTarget.nextElementSibling;
                    if (sibling) sibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="h-16 w-16 rounded-full bg-gray-200 hidden items-center justify-center"
                aria-hidden={!!(instructor.profile_image_url || instructor.avatar)}
              >
                <span className="text-2xl text-gray-500">
                  {instructor.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {instructor.name}
              </h3>
              <p className="text-sm text-gray-500">{instructor.email}</p>              <div className="mt-2 flex items-center space-x-2">
                {instructor.status && (
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(instructor.status)}`}>
                    {instructor.status.replace('_', ' ').toUpperCase()}
                  </span>
                )}
                {instructor.specializations?.length > 0 && (
                  <span className="text-sm text-gray-500">
                    {instructor.specializations.slice(0, 2).join(', ')}
                    {instructor.specializations.length > 2 && '...'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              View Details
            </button>
            {hasEditPermission && (
              <>
                <button
                  onClick={() => navigate(`/instructors/edit/${instructor.id}`)}
                  className="px-3 py-1 text-sm text-green-600 hover:text-green-800 focus:outline-none"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(instructor.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 focus:outline-none"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <EnhancedInstructorDetailModal
        instructor={instructor}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpdate={handleInstructorUpdate}
      />
    </>
  );
};

export default InstructorCard;