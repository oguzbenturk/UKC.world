import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { LeftOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';

const StickyNavBar = ({
  items, // array of { id, label, shortLabel?, children?: Array<{ value, label }> }
  activeItem,
  onItemClick,
  onSubItemClick, // (parentId, childValue, childItem) => void
  activeSubItem, // currently selected subcategory value
  className = '',
  bgColor = 'bg-[#1e2b33]'
}) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const openTimeoutRef = useRef(null);
  const dropdownRef = useRef(null);
  const navWrapperRef = useRef(null);
  const scrollRef = useRef(null);
  const btnRefs = useRef({});
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 });
  const isTouchRef = useRef(false);
  const instanceId = useId();

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
    const navScroll = scrollRef.current;
    const activeBtn = btnRefs.current[activeItem];

    if (navScroll && activeBtn) {
      const scrollLeft = activeBtn.offsetLeft - navScroll.offsetLeft - (navScroll.clientWidth / 2) + (activeBtn.clientWidth / 2);
      navScroll.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [activeItem, items]);

  // Position dropdown relative to the nav wrapper
  const positionDropdown = useCallback((itemId) => {
    const btn = btnRefs.current[itemId];
    const wrapper = navWrapperRef.current;
    if (!btn || !wrapper) return;

    const btnRect = btn.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    let left = btnRect.left - wrapperRect.left + btnRect.width / 2;
    const top = btnRect.bottom - wrapperRect.top;

    const halfWidth = 100;
    const maxLeft = wrapperRect.width - halfWidth - 8;
    const minLeft = halfWidth + 8;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    setDropdownPos({ left, top });
  }, []);

  const openDropdownForItem = useCallback((itemId) => {
    setOpenDropdown(itemId);
    positionDropdown(itemId);
  }, [positionDropdown]);

  // Hover handlers (desktop)
  const handleButtonMouseEnter = useCallback((item) => {
    if (isTouchRef.current) return;
    if (!item.children?.length) {
      clearTimeout(openTimeoutRef.current);
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 100);
      return;
    }
    clearTimeout(hoverTimeoutRef.current);
    openTimeoutRef.current = setTimeout(() => openDropdownForItem(item.id), 100);
  }, [openDropdownForItem]);

  const handleButtonMouseLeave = useCallback(() => {
    if (isTouchRef.current) return;
    clearTimeout(openTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 200);
  }, []);

  const handleDropdownMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleDropdownMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 200);
  }, []);

  // Click handler — on touch devices, first tap opens dropdown
  const handleButtonClick = useCallback((item) => {
    if (isTouchRef.current && item.children?.length) {
      if (openDropdown === item.id) {
        setOpenDropdown(null);
        onItemClick(item.id, item);
      } else {
        openDropdownForItem(item.id);
      }
      return;
    }
    setOpenDropdown(null);
    onItemClick(item.id, item);
  }, [openDropdown, onItemClick, openDropdownForItem]);

  // Track touch vs mouse
  useEffect(() => {
    const handleTouch = () => { isTouchRef.current = true; };
    const handleMouse = (e) => { if (e.pointerType === 'mouse') isTouchRef.current = false; };
    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('pointerdown', handleMouse, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('pointerdown', handleMouse);
    };
  }, []);

  // Click outside, Escape, and scroll to close
  useEffect(() => {
    if (!openDropdown) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        const btn = btnRefs.current[openDropdown];
        if (btn && btn.contains(e.target)) return;
        setOpenDropdown(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    const handleScroll = () => setOpenDropdown(null);
    const navScroll = scrollRef.current;
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    if (navScroll) navScroll.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      if (navScroll) navScroll.removeEventListener('scroll', handleScroll);
    };
  }, [openDropdown]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimeoutRef.current);
      clearTimeout(openTimeoutRef.current);
    };
  }, []);

  const openItem = openDropdown ? items.find(i => i.id === openDropdown) : null;
  const showDropdown = openItem?.children?.length > 0;

  return (
    <div ref={navWrapperRef} className={`sticky top-0 z-50 border-b border-white/5 ${bgColor} backdrop-blur-md ${className}`}>
      <div className="max-w-7xl mx-auto relative flex items-center h-14 md:h-16 font-duotone-light-condensed">
        <button
          onClick={() => navigateSection(-1)}
          className={`absolute left-0 top-0 bottom-0 pl-3 pr-6 sm:pl-5 sm:pr-8 z-20 flex flex-col justify-center bg-gradient-to-r from-[${bgColor.replace('bg-[', '').replace(']', '')}] via-[${bgColor.replace('bg-[', '').replace(']', '')}]/90 to-transparent text-white/90 hover:text-[#1E3A8A] transition-colors drop-shadow-lg`}
          aria-label="Previous Section"
        >
          <div className="flex items-center h-full pt-1">
            <LeftOutlined style={{ fontSize: '22px' }} />
          </div>
        </button>

        <div
          ref={scrollRef}
          className="flex-1 flex justify-start md:justify-center items-center overflow-x-auto scrollbar-hide no-scrollbar scroll-smooth px-12 sm:px-16 h-full gap-6 md:gap-8 lg:gap-10"
          style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
          {items.map((item) => {
            const isActive = activeItem === item.id;
            const hasChildren = item.children?.length > 0;
            const isDropdownOpen = openDropdown === item.id;
            return (
              <button
                key={item.id}
                ref={el => { btnRefs.current[item.id] = el; }}
                onClick={() => handleButtonClick(item)}
                onMouseEnter={() => handleButtonMouseEnter(item)}
                onMouseLeave={handleButtonMouseLeave}
                className={`flex-shrink-0 flex items-center h-full px-1 text-lg md:text-xl transition-all duration-200 drop-shadow-md tracking-wide whitespace-nowrap border-b-[3px] ${
                  isActive
                    ? 'text-[#1E3A8A] border-[#1E3A8A]'
                    : 'text-white/50 hover:text-white border-transparent'
                }`}
              >
                <span className="mt-1 flex items-center gap-1">
                  {item.shortLabel ? (
                    <>
                      <span className="hidden sm:inline">{item.label}</span>
                      <span className="sm:hidden">{item.shortLabel}</span>
                    </>
                  ) : (
                    item.label
                  )}
                  {hasChildren && (
                    <DownOutlined
                      className={`text-[10px] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => navigateSection(1)}
          className={`absolute right-0 top-0 bottom-0 pr-3 pl-6 sm:pr-5 sm:pl-8 z-20 flex flex-col justify-center bg-gradient-l from-[${bgColor.replace('bg-[', '').replace(']', '')}] via-[${bgColor.replace('bg-[', '').replace(']', '')}]/90 to-transparent text-white/90 hover:text-[#1E3A8A] transition-colors drop-shadow-lg`}
          aria-label="Next Section"
        >
          <div className="flex items-center h-full pt-1">
            <RightOutlined style={{ fontSize: '22px' }} />
          </div>
        </button>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className={`absolute min-w-[180px] bg-[#1e2b33] border border-white/10 rounded-lg shadow-xl py-2 z-[60] snav-fadein-${instanceId.replace(/:/g, '')}`}
          style={{
            left: dropdownPos.left,
            top: dropdownPos.top,
            transform: 'translateX(-50%)',
          }}
          onMouseEnter={handleDropdownMouseEnter}
          onMouseLeave={handleDropdownMouseLeave}
        >
          <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1e2b33] border-l border-t border-white/10 rotate-45" />

          {openItem.children.map(child => {
            const isChildActive = activeSubItem === child.value && activeItem === openDropdown;
            return (
              <button
                key={child.value}
                onClick={() => {
                  onSubItemClick?.(openItem.id, child.value, child);
                  setOpenDropdown(null);
                }}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors whitespace-nowrap ${
                  isChildActive
                    ? 'text-[#1E3A8A] bg-white/5'
                    : 'text-white/70 hover:text-[#1E3A8A] hover:bg-white/5'
                }`}
              >
                {child.label}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        .snav-fadein-${instanceId.replace(/:/g, '')} {
          animation: snavFadeIn 150ms ease-out forwards;
        }
        @keyframes snavFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default StickyNavBar;
