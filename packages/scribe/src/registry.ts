import type { Ctor } from "@rovy/core";
import type {
	AnyScribeData,
	ScribeDataDefinition,
} from "./definitions";
import type { ScribeModuleResolver } from "./plugin";

export interface RuntimeScribeDataDefinition {
	readonly id: string;
	readonly name: string;
	readonly profileStoreIndex: string;
	readonly profileKeyPrefix: string;
	readonly template: object;
	readonly options?: Readonly<Record<string, unknown>>;
	readonly publicToken: AnyScribeData;
}

export interface RuntimeScribeCommandDefinition {
	readonly id: string;
	readonly name: string;
	readonly dataId: string;
	readonly ctor: Ctor;
	readonly fields: ReadonlyArray<string>;
	readonly result: Ctor;
	readonly resultFields: ReadonlyArray<string>;
}

export interface RuntimeScribeEventDefinition {
	readonly id: string;
	readonly ctor: Ctor;
	readonly dataId?: string;
	readonly commandId?: string;
	readonly kind: string;
	readonly path?: string;
}

type AuthorScribeDataDefinition = Omit<RuntimeScribeDataDefinition, "publicToken">;
type AuthorScribeCommandDefinition = Omit<RuntimeScribeCommandDefinition, "ctor">;
type AuthorScribeEventDefinition = Omit<RuntimeScribeEventDefinition, "ctor">;

class RovyScribeRegistry {
	private readonly dataList = new Array<RuntimeScribeDataDefinition>();
	private readonly dataById = new Map<string, RuntimeScribeDataDefinition>();
	private readonly commandList = new Array<RuntimeScribeCommandDefinition>();
	private readonly commandById = new Map<string, RuntimeScribeCommandDefinition>();
	private readonly eventList = new Array<RuntimeScribeEventDefinition>();
	private configuredResolver?: ScribeModuleResolver;

	__data<Schema extends object>(
		definition: AuthorScribeDataDefinition,
	): ScribeDataDefinition<Schema> {
		assert(
			!this.dataById.has(definition.id),
			`[rovy/scribe] duplicate data definition id '${definition.id}'`,
		);
		const token = {
			id: definition.id,
			name: definition.name,
		} as ScribeDataDefinition<Schema>;
		const runtime = {
			...definition,
			publicToken: token,
		} satisfies RuntimeScribeDataDefinition;
		this.dataList.push(runtime);
		this.dataById.set(runtime.id, runtime);
		return token;
	}

	__command(ctor: Ctor, definition: AuthorScribeCommandDefinition): void {
		assert(
			!this.commandById.has(definition.id),
			`[rovy/scribe] duplicate command id '${definition.id}'`,
		);
		const runtime = { ctor, ...definition } satisfies RuntimeScribeCommandDefinition;
		this.commandList.push(runtime);
		this.commandById.set(runtime.id, runtime);
	}

	__event(ctor: Ctor, definition: AuthorScribeEventDefinition): void {
		assert(
			!this.eventList.some((event) => event.id === definition.id),
			`[rovy/scribe] duplicate event id '${definition.id}'`,
		);
		this.eventList.push({ ctor, ...definition });
	}

	dataDefinitions(): ReadonlyArray<RuntimeScribeDataDefinition> {
		return this.dataList;
	}

	data(dataId: string): RuntimeScribeDataDefinition | undefined {
		return this.dataById.get(dataId);
	}

	commands(): ReadonlyArray<RuntimeScribeCommandDefinition> {
		return this.commandList;
	}

	command(commandId: string): RuntimeScribeCommandDefinition | undefined {
		return this.commandById.get(commandId);
	}

	events(): ReadonlyArray<RuntimeScribeEventDefinition> {
		return this.eventList;
	}

	hasDeclarations(): boolean {
		return this.dataList.size() > 0 ||
			this.commandList.size() > 0 ||
			this.eventList.size() > 0;
	}

	__setModuleResolver(resolver?: ScribeModuleResolver): void {
		this.configuredResolver = resolver;
	}

	moduleResolver(): ScribeModuleResolver | undefined {
		return this.configuredResolver;
	}

	__reset(): void {
		while (this.dataList.size() > 0) this.dataList.pop();
		while (this.commandList.size() > 0) this.commandList.pop();
		while (this.eventList.size() > 0) this.eventList.pop();
		this.dataById.clear();
		this.commandById.clear();
		this.configuredResolver = undefined;
	}
}

export const rovyScribe = new RovyScribeRegistry();
