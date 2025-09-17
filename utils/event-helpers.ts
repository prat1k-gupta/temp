import type { Coordinates } from "@/types"

/**
 * Extract client coordinates from various event types (mouse, touch, React events)
 */
export const getClientCoordinates = (event: MouseEvent | TouchEvent | React.MouseEvent): Coordinates => {
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY }
  }
  if ('touches' in event && event.touches[0]) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }
  return { x: 0, y: 0 }
}

/**
 * Check if an event has the required client coordinate properties
 */
export const hasClientCoordinates = (event: any): boolean => {
  return ('clientX' in event && 'clientY' in event) || 
         ('touches' in event && event.touches && event.touches[0])
}

/**
 * Detect if two clicks constitute a double-click based on time and distance
 */
export const isDoubleClick = (
  currentTime: number,
  lastClickTime: number,
  currentPosition: Coordinates,
  lastClickPosition: Coordinates,
  timeThreshold: number = 300,
  distanceThreshold: number = 5
): boolean => {
  const timeDiff = currentTime - lastClickTime
  const positionDiff = Math.abs(currentPosition.x - lastClickPosition.x) + 
                      Math.abs(currentPosition.y - lastClickPosition.y)
  
  return timeDiff < timeThreshold && positionDiff < distanceThreshold
}
