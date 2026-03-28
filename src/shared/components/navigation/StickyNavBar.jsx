import { useEffect } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

const StickyNavBar = ({ 
  items, // array of { id, label, shortLabel? }
  activeItem, 
  onItemClick,
  className = '',
  bgColor = 'bg-[#1e2b33]'
}) => {
  // Handle Prev/Next arrows
  const navigateSection = (direction) => {
    if (!items || items.length === 0) return;
    const currentIndex = items.findIndex(item => item.id === activeItem);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + items.length) % items.length;
    onItemClick(items[nextIndex].id, items[nextIndex]);
  };

  // Auto-scroll active item into view
  useEffect(() => {
    if (!activeItem) return;
    const navScroll = document.getElementById('global-sticky-nav-scroll');
    const activeBtn = document.getElementById(`sticky-nav-btn-${activeItem}`);
    
    if (navScroll && activeBtn) {
      // Calculate scroll position to center the active button perfectly
      const scrollLeft = activeBtn.offsetLeft - navScroll.offsetLeft - (navScroll.clientWidth / 2) + (activeBtn.clientWidth / 2);
      navScroll.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [activeItem, items]);

  return (
    <div className={`sticky top-0 z-50 border-b border-white/5 ${bgColor} backdrop-blur-md ${className}`}>
      <div className="max-w-7xl mx-auto relative flex items-center h-14 md:h-16 font-duotone-light-condensed">
        {/* Prev Button - Fixed on left */}
        <button 
          onClick={() => navigateSection(-1)}
          className={`absolute left-0 top-0 bottom-0 pl-3 pr-6 sm:pl-5 sm:pr-8 z-20 flex flex-col justify-center bg-gradient-to-r from-[${bgColor.replace('bg-[', '').replace(']', '')}] via-[${bgColor.replace('bg-[', '').replace(']', '')}]/90 to-transparent text-white/90 hover:text-[#00a8c4] transition-colors drop-shadow-lg`}
          aria-label="Previous Section"
        >
          <div className="flex items-center h-full pt-1">
            <LeftOutlined style={{ fontSize: '22px' }} />
          </div>
        </button>

        {/* Scrollable middle section */}
        <div 
          id="global-sticky-nav-scroll"
          className="flex-1 flex justify-start md:justify-center items-center overflow-x-auto scrollbar-hide no-scrollbar scroll-smooth px-12 sm:px-16 h-full gap-6 md:gap-8 lg:gap-10"
          style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
          {items.map((item) => {
            const isActive = activeItem === item.id;
            return (
              <button
                key={item.id}
                id={`sticky-nav-btn-${item.id}`}
                onClick={() => onItemClick(item.id, item)}
                className={`flex-shrink-0 flex items-center h-full px-1 text-lg md:text-xl transition-all duration-200 drop-shadow-md tracking-wide whitespace-nowrap border-b-[3px] ${
                  isActive
                    ? 'text-[#00a8c4] border-[#00a8c4]'
                    : 'text-white/50 hover:text-white border-transparent'
                }`}
              >
                <span className="mt-1">
                  {item.shortLabel ? (
                    <>
                      <span className="hidden sm:inline">{item.label}</span>
                      <span className="sm:hidden">{item.shortLabel}</span>
                    </>
                  ) : (
                    item.label
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Next Button - Fixed on right */}
        <button 
          onClick={() => navigateSection(1)}
          className={`absolute right-0 top-0 bottom-0 pr-3 pl-6 sm:pr-5 sm:pl-8 z-20 flex flex-col justify-center bg-gradient-l from-[${bgColor.replace('bg-[', '').replace(']', '')}] via-[${bgColor.replace('bg-[', '').replace(']', '')}]/90 to-transparent text-white/90 hover:text-[#00a8c4] transition-colors drop-shadow-lg`}
          aria-label="Next Section"
        >
          <div className="flex items-center h-full pt-1">
            <RightOutlined style={{ fontSize: '22px' }} />
          </div>
        </button>
      </div>

      <style>{`
        #global-sticky-nav-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default StickyNavBar;
