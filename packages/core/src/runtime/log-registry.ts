import type { RovyRegistry } from "../contract";

function shortId(id: string): string {
	const [start] = id.find("[^:]*$");
	return start !== undefined ? id.sub(start) : id;
}

function ctorLabel(ctor: object): string {
	const [n] = debug.info(ctor as () => void, "n");
	return n !== undefined && n !== "" ? n : tostring(ctor);
}

export function resolvePluginName(plugin: object): string {
	const mt = getmetatable(plugin) as { new?: object } | undefined;
	if (mt !== undefined && typeIs(mt.new, "function")) {
		const [n] = debug.info(mt.new as () => void, "n");
		if (n !== undefined && n !== "" && n !== "new") return n;
	}
	return tostring(plugin);
}

export function logRegistry(
	reg: RovyRegistry,
	pluginNames: ReadonlyArray<string>,
	params: ReadonlyMap<string, unknown>,
): void {
	const out: Array<string> = ["[rovy] registry at start"];

	const section = (label: string, names: Array<string>): void => {
		out.push(`  ${label} (${names.size()})`);
		for (const n of names) out.push(`    ${n}`);
	};

	section("plugins",    pluginNames as Array<string>);
	section("plugin regs", reg.plugins.map((p) => shortId(p.id)));
	section("schedules",  reg.schedules.map((s) => ctorLabel(s.ctor)));
	section("components", reg.components.map((c) => shortId(c.id)));
	section("resources",  reg.resources.map((r) => shortId(r.id)));
	section("collectors", reg.collectors.map((c) => shortId(c.id)));
	section("events",     reg.events.map((e) => (e.label !== undefined ? e.label : ctorLabel(e.ctor))));
	section("systems",    reg.systems.map((s) => shortId(s.id)));
	section("observers",  reg.observers.map((o) => ctorLabel(o.ctor)));
	section("monitors",   reg.monitors.map((m) => ctorLabel(m.ctor)));
	section("relations",  reg.relations.map((r) => ctorLabel(r.ctor)));
	section("prefabs",    reg.prefabs.map((p) => shortId(p.id)));

	const paramKeys: Array<string> = [];
	for (const [k] of params) paramKeys.push(k);
	section("params", paramKeys);

	print(out.join("\n"));
}
