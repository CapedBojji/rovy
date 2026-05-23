export interface InstanceExpressionRoot {
	getService(name: string): unknown | undefined;
}

export interface InstanceExpressionResult {
	readonly ok: boolean;
	readonly value?: unknown;
	readonly error?: string;
}

const SERVICE_ALIASES = new Map<string, string>([
	["workspace", "Workspace"],
	["replicatedstorage", "ReplicatedStorage"],
	["serverstorage", "ServerStorage"],
	["serverScriptService".lower(), "ServerScriptService"],
	["startergui", "StarterGui"],
	["players", "Players"],
	["lighting", "Lighting"],
	["soundservice", "SoundService"],
	["collectionservice", "CollectionService"],
]);

function defaultRoot(): InstanceExpressionRoot {
	return {
		getService(name: string): unknown | undefined {
			const [ok, service] = pcall(() => game.GetService(name as keyof Services));
			return ok ? service : undefined;
		},
	};
}

function canonicalServiceName(name: string): string {
	return SERVICE_ALIASES.get(name.lower()) ?? name;
}

function findChild(parent: unknown, name: string): unknown | undefined {
	const maybe = parent as { FindFirstChild?: (self: unknown, childName: string) => unknown | undefined };
	if (typeIs(maybe.FindFirstChild, "function")) {
		return maybe.FindFirstChild(parent, name);
	}
	return undefined;
}

function readProperty(target: unknown, property: string): InstanceExpressionResult {
	const [ok, value] = pcall(() => (target as Record<string, unknown>)[property]);
	if (!ok) return { ok: false, error: `property '${property}' is not readable` };
	return { ok: true, value };
}

export function resolveInstanceExpression(
	expression: string,
	root: InstanceExpressionRoot = defaultRoot(),
): InstanceExpressionResult {
	const trimmed = expression.gsub("^%s*(.-)%s*$", "%1")[0];
	if (trimmed.size() === 0) return { ok: false, error: "empty instance expression" };

	const segments = trimmed.split("/");
	const serviceName = canonicalServiceName(segments[0]);
	let current = root.getService(serviceName);
	if (current === undefined) return { ok: false, error: `service '${serviceName}' was not found` };

	let property: string | undefined;
	let lastSegment = segments[segments.size() - 1];
	const propertyParts = lastSegment.split(".");
	if (propertyParts.size() > 1) {
		property = propertyParts[propertyParts.size() - 1];
		const childName = propertyParts[0];
		for (let i = 1; i < propertyParts.size() - 1; i++) {
			lastSegment = `${lastSegment}.${propertyParts[i]}`;
		}
		segments[segments.size() - 1] = childName;
	}

	for (let i = 1; i < segments.size(); i++) {
		const segment = segments[i];
		if (segment.size() === 0) continue;
		const child = findChild(current, segment);
		if (child === undefined) return { ok: false, error: `child '${segment}' was not found` };
		current = child;
	}

	if (property !== undefined) return readProperty(current, property);
	return { ok: true, value: current };
}

export function canUseRobloxSelection(): boolean {
	const [ok, selection] = pcall(() => game.GetService("Selection" as keyof Services));
	return ok && selection !== undefined;
}

export function getSelectedInstance(): Instance | undefined {
	const [ok, selection] = pcall(
		() => game.GetService("Selection" as keyof Services) as unknown as { Get: () => Instance[] },
	);
	if (!ok || selection === undefined) return undefined;
	const selected = selection.Get();
	return selected[0];
}
