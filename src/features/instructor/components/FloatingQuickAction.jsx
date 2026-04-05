const FloatingQuickAction = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-xl shadow-sky-600/30 transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 md:hidden"
  >
    <span className="sr-only">{label}</span>
    <svg
      className="h-6 w-6"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  </button>
);

export default FloatingQuickAction;
