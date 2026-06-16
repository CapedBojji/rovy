import { widget, __scope, __useInstance } from "../runtime";

function isLiveTarget(targetInstance: Instance): boolean {
	const [ok, parent] = pcall(() => (targetInstance as Instance & { Parent?: Instance }).Parent);
	return ok && parent !== undefined;
}

/** @widget */
export const portal = widget((targetInstance: Instance, fn: () => void): void => {
	if (!isLiveTarget(targetInstance)) return;
	__useInstance("portal:instance", () => [undefined, targetInstance] as [Instance | undefined, Instance]);
	__scope("portal:children", fn);
}, "@rovy/ui/portal");
