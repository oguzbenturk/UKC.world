import { DndContext, useSensor, useSensors, MouseSensor, TouchSensor, KeyboardSensor, DragOverlay } from '@dnd-kit/core';

/**
 * CalendarDndProvider centralizes dnd-kit sensors and context.
 * Long-press activation on touch to avoid scroll conflicts.
 */
export default function CalendarDndProvider({ children, onDragStart, onDragOver, onDragEnd, overlay }) {
  const mouseSensor = useSensor(MouseSensor, {
    // Trigger faster: minimal movement, but avoid accidental clicks
    activationConstraint: { distance: 3 },
  });
  const touchSensor = useSensor(TouchSensor, {
    // Reduce long-press delay and tolerance for quicker drags
    activationConstraint: { delay: 80, tolerance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      {children}
      {overlay && <DragOverlay>{overlay}</DragOverlay>}
    </DndContext>
  );
}
