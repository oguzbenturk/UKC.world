import { useDroppable } from '@dnd-kit/core';

export function DayDropZone({ dateStr, children, className }) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${dateStr}`, data: { type: 'day', dateStr } });
  return (
    <div ref={setNodeRef} className={className}>
      {isOver && <div className="absolute inset-0 ring-2 ring-blue-400 rounded-md pointer-events-none" />}
      {children}
    </div>
  );
}
