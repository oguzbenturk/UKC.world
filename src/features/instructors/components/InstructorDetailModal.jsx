// src/components/InstructorDetailModal.jsx


const InstructorDetailModal = ({ instructor, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity" 
          aria-hidden="true"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-gray-500 opacity-75" />
        </div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* Header */}
            <div className="flex justify-between items-start">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Instructor Details
              </h3>
              <button
                onClick={onClose}
                className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="mt-6 space-y-6">
              {/* Profile Image */}
              <div className="flex justify-center">
                {instructor.profile_image ? (
                  <img
                    src={instructor.profile_image}
                    alt={instructor.name}
                    className="h-32 w-32 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-4xl text-gray-500">
                      {instructor.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div>
                <h4 className="font-semibold text-xl text-center text-gray-900">
                  {instructor.name}
                </h4>
                <p className="text-center text-gray-500">{instructor.email}</p>
              </div>              {/* Status */}
              {instructor.status && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Status</h4>
                  <p className="mt-1 text-gray-900">
                    {instructor.status.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
              )}

              {/* Specializations */}
              {instructor.specializations?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Specializations</h4>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {instructor.specializations.map((spec, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bio */}
              {instructor.bio && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Bio</h4>
                  <p className="mt-1 text-gray-900">{instructor.bio}</p>
                </div>
              )}

              {/* Experience */}
              {instructor.experience && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Experience</h4>
                  <p className="mt-1 text-gray-900">{instructor.experience}</p>
                </div>
              )}

              {/* Certificates */}
              {instructor.certificates?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Certificates</h4>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {instructor.certificates.map((cert, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Information */}
              {instructor.contact_info && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Contact Information</h4>
                  <p className="mt-1 text-gray-900">{instructor.contact_info}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstructorDetailModal;