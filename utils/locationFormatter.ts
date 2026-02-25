import { BottleLocation, Rack } from '../types';

export const formatBottleLocation = (
  location: BottleLocation | string,
  racks: Rack[]
): string => {
  if (typeof location === 'string') return location;

  const rack = racks.find(r => r.id === location.rackId);
  const rackName = rack?.name || 'Rack Inconnu';
  const y = typeof location.y === 'number' && !isNaN(location.y) ? location.y : 0;
  const x = typeof location.x === 'number' && !isNaN(location.x) ? location.x : 0;
  return `${rackName} [${String.fromCharCode(65 + y)}${x + 1}]`;
};
