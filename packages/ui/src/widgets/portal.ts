import { currentFrame, newFrame, newNode, stack, widget } from "../runtime";

/** @widget */
export const portal = widget((targetInstance: Instance, children: () => void): void => {
	const node = newNode(targetInstance);
	node.generation = currentFrame().node.generation;
	stack.push(newFrame(node));
	try {
		children();
	} finally {
		stack.pop();
	}
}, "@rovy/ui/portal");
