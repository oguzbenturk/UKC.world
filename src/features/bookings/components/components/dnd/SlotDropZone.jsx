import { useDroppable } from '@dnd-kit/core';

/**
 * SlotDropZone represents a specific time slot for a specific instructor on a given day.
 * id format: slot:{instructorId}:{timeStart}
 */
export function SlotDropZone({ instructorId, timeStart, className, style, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${instructorId}:${timeStart}`,
    data: { type: 'slot', instructorId, timeStart },
  });

  return (
    <div ref={setNodeRef} className={className} style={style}>
      {isOver && (
        <div className="absolute inset-0 ring-2 ring-blue-400 ring-offset-0 pointer-events-none" />
      )}
      {children}
    </div>
  );
}
