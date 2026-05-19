import { useEventCallback } from "./runtime";

export type Connect = (
	instance: Instance,
	eventName: string,
	handler: (...args: ReadonlyArray<unknown>) => void,
) => RBXScriptConnection | undefined;

export function createConnect(): Connect {
	const eventCallback = useEventCallback();
	return (instance, eventName, handler) => {
		if (eventCallback !== undefined) {
			eventCallback(instance, eventName, handler);
			return undefined;
		}
		const signal = (instance as unknown as Record<string, RBXScriptSignal | undefined>)[eventName];
		return signal?.Connect(handler as Callback);
	};
}
