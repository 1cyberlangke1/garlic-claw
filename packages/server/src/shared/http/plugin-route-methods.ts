import type { PluginRouteMethod } from '@garlic-claw/shared';

export const PLUGIN_ROUTE_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const satisfies PluginRouteMethod[];
