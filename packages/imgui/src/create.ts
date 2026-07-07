import { useEventCallback } from "./runtime";

const GUI_BASE_2D = new Set<string>([
	"CanvasGroup",
	"Frame",
	"ImageButton",
	"ImageLabel",
	"ScrollingFrame",
	"TextLabel",
	"TextButton",
	"ViewportFrame",
	"TextBox",
	"VideoFrame",
	"ScreenGui",
	"BillboardGui",
	"SurfaceGui",
]);

function isInstanceLike(value: unknown): value is Instance | (Record<string, unknown> & { Parent?: Instance }) {
	return typeIs(value, "Instance") || (typeIs(value, "table") && typeIs((value as { GetChildren?: unknown }).GetChildren, "function"));
}

export function create<T extends keyof CreatableInstances>(
	className: T,
	props?: Record<string | number, unknown>,
): CreatableInstances[T] {
	const [created, value] = pcall(() => new Instance(className));
	const instance = (created
		? value
		: ({
				ClassName: className,
				Name: className,
				Destroy() {
					(this as Record<string, unknown>).Destroyed = true;
				},
				IsA(name: string) {
					return name === className || name === "Instance" || name === "GuiObject";
				},
				GetChildren() {
					return new Array<Instance>();
				},
			} as unknown)) as CreatableInstances[T] & Record<string, unknown>;
	const input = (props ?? {}) as Record<string | number, unknown>;
	if (input.AutoLocalize === undefined && GUI_BASE_2D.has(className)) {
		input.AutoLocalize = false;
	}
	const eventCallback = useEventCallback();
	for (const [rawKey, value] of pairs(input)) {
		const key = rawKey as unknown;
		if (typeIs(value, "function") && typeIs(key, "string")) {
			if (eventCallback !== undefined) eventCallback(instance, key, value as (...args: ReadonlyArray<unknown>) => void);
			else {
				const signal = (instance as Record<string, RBXScriptSignal | undefined>)[key];
				signal?.Connect(value as Callback);
			}
		} else if (typeIs(key, "number") && isInstanceLike(value)) {
			value.Parent = instance;
		} else if (typeIs(key, "table") && typeIs(value, "string")) {
			(key as Record<string, Instance>)[value] = instance;
			if ((instance as { Name?: string }).Name === undefined) (instance as { Name: string }).Name = value;
		} else if (typeIs(key, "string")) {
			(instance as Record<string, unknown>)[key] = value;
		}
	}
	return instance as CreatableInstances[T];
}
