const resourceCloneByReference = new Set<object>();

export function markResourceCloneByReference<T extends object>(value: T): T {
	resourceCloneByReference.add(value);
	return value;
}

export function isResourceCloneByReference(value: unknown): boolean {
	return typeIs(value, "table") && resourceCloneByReference.has(value as object);
}
