import { widget, __scope, __useInstance } from "../runtime";

/** @widget */
export const portal = widget((targetInstance: Instance, fn: () => void): void => {
	__useInstance("portal:instance", () => [undefined, targetInstance] as [Instance | undefined, Instance]);
	__scope("portal:children", fn);
}, "@rovy/ui/portal");
