import { useDraggable, useDroppable } from '@dnd-kit/core';

export function DraggableBooking({ booking, children, style, className }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `booking:${booking.id}`, data: { type: 'booking', booking } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `booking:${booking.id}`, data: { type: 'booking', booking } });

  const setRef = (node) => {
    setDragRef(node);
    setDropRef(node);
  };
  return (
  <div ref={setRef} {...listeners} {...attributes} className={className} style={{ opacity: isDragging ? 0.6 : 1, ...style }}>
      {isOver && (
        <div className="absolute inset-0 ring-2 ring-blue-400 ring-offset-0 pointer-events-none rounded-md" />
      )}
      {children}
    </div>
  );
}
