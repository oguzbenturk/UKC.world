
import { FaArrowLeft } from 'react-icons/fa';

/**
 * PageHeader component for displaying page titles with optional back button
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - The main title of the page
 * @param {string} [props.description] - Optional description text
 * @param {Function} [props.backButtonAction] - Callback function for back button click, if provided, shows the back button
 */
const PageHeader = ({ title, description, backButtonAction }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
      <div>
        <div className="flex items-center">
          {backButtonAction && (
            <button 
              onClick={backButtonAction}
              className="mr-3 p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-50 transition-colors"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
        </div>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
  );
};

export default PageHeader;