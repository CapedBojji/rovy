import { useEventCallback } from "./runtime";

export interface ConnectableSignal {
	Connect(handler: (...args: ReadonlyArray<unknown>) => void): RBXScriptConnection;
}

export type ConnectTarget = Instance | object;

export type Connect = (
	instance: ConnectTarget,
	eventName: string,
	handler: (...args: ReadonlyArray<unknown>) => void,
) => RBXScriptConnection | undefined;

export function createConnect(): Connect {
	const eventCallback = useEventCallback();
	return (instance, eventName, handler) => {
		if (eventCallback !== undefined && typeIs(instance, "Instance")) {
			eventCallback(instance, eventName, handler);
			return undefined;
		}
		const signal = (instance as unknown as Record<string, ConnectableSignal | undefined>)[eventName];
		return signal?.Connect(handler);
	};
}
