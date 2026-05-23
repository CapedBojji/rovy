interface QueryableComponent {
	readonly id?: string;
	readonly name?: string;
	readonly componentId?: string;
	readonly componentName?: string;
}

export interface ParsedWorldInspectorQuery {
	readonly include: string[];
	readonly exclude: string[];
}

export function parseWorldInspectorQuery(query: string): ParsedWorldInspectorQuery {
	const include = new Array<string>();
	const exclude = new Array<string>();
	for (const raw of query.split(" ")) {
		const term = raw.lower();
		if (term.size() === 0) continue;
		if (term.sub(1, 1) === "!") {
			const stripped = term.sub(2);
			if (stripped.size() > 0) exclude.push(stripped);
		} else {
			include.push(term);
		}
	}
	return { include, exclude };
}

function componentMatchesTerm(component: QueryableComponent, term: string): boolean {
	const name = component.name ?? component.componentName ?? "";
	const id = component.id ?? component.componentId ?? "";
	return name.lower().find(term, 1, true)[0] !== undefined || id.lower().find(term, 1, true)[0] !== undefined;
}

export function matchesWorldInspectorQuery(
	components: ReadonlyArray<QueryableComponent>,
	query: string,
	entityId?: number,
): boolean {
	const parsed = parseWorldInspectorQuery(query);
	for (const term of parsed.include) {
		const asNumber = tonumber(term);
		if (asNumber !== undefined) {
			if (entityId !== asNumber) return false;
			continue;
		}
		let found = false;
		for (const component of components) {
			if (componentMatchesTerm(component, term)) {
				found = true;
				break;
			}
		}
		if (!found) return false;
	}
	for (const term of parsed.exclude) {
		const asNumber = tonumber(term);
		if (asNumber !== undefined) {
			if (entityId === asNumber) return false;
			continue;
		}
		for (const component of components) {
			if (componentMatchesTerm(component, term)) return false;
		}
	}
	return true;
}
