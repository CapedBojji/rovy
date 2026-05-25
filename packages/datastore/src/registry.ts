import type {
	AnyDocument,
	DocumentDef,
	DocumentEventCtor,
	DocumentEventKind,
	RuntimeDocumentDef,
	RuntimeDocumentKind,
} from "./types";
import { documentEventId } from "./types";

type AuthorDocumentDef<T = unknown, Owner = unknown> = Omit<RuntimeDocumentDef<T, Owner>, "publicToken">;

const EVENT_KINDS: ReadonlyArray<DocumentEventKind> = ["opened", "openFailed", "changed", "saved", "saveFailed", "closed"];

class RovyDocumentEvent {
	constructor(payload: object) {
		for (const [key, value] of pairs(payload as Record<string, unknown>)) {
			(this as Record<string, unknown>)[key] = value;
		}
	}
}

function createEventCtor(id: string): DocumentEventCtor {
	class GeneratedDocumentEvent extends RovyDocumentEvent {}
	(GeneratedDocumentEvent as unknown as Record<string, unknown>).__rovyDatastoreEventId = id;
	return GeneratedDocumentEvent as unknown as DocumentEventCtor;
}

class RovyDataRegistry {
	private readonly documentList = new Array<RuntimeDocumentDef>();
	private readonly documentById = new Map<string, RuntimeDocumentDef>();
	private readonly eventCtors = new Map<string, DocumentEventCtor>();

	__document<T, Owner, Kind extends RuntimeDocumentKind>(def: AuthorDocumentDef<T, Owner> & { readonly kind: Kind }): DocumentDef<T, Owner, Kind> {
		assert(!this.documentById.has(def.id), `[rovy/datastore] Duplicate document id ${def.id}.`);
		const token = {
			id: def.id,
			name: def.name,
		} as DocumentDef<T, Owner, Kind>;
		const runtimeDef = {
			...def,
			publicToken: token,
		} satisfies RuntimeDocumentDef<T, Owner>;
		this.documentList.push(runtimeDef as RuntimeDocumentDef);
		this.documentById.set(def.id, runtimeDef as RuntimeDocumentDef);
		for (const kind of EVENT_KINDS) this.eventCtor(kind, def.id);
		return token;
	}

	eventCtor(kind: DocumentEventKind, documentId: string): DocumentEventCtor {
		const id = documentEventId(kind, documentId);
		let ctor = this.eventCtors.get(id);
		if (ctor === undefined) {
			ctor = createEventCtor(id);
			this.eventCtors.set(id, ctor);
		}
		return ctor;
	}

	documents(): ReadonlyArray<RuntimeDocumentDef> {
		return this.documentList;
	}

	byId(documentId: string): RuntimeDocumentDef | undefined {
		return this.documentById.get(documentId);
	}

	hasDocuments(): boolean {
		return this.documentList.size() > 0;
	}

	__reset(): void {
		while (this.documentList.size() > 0) this.documentList.pop();
		this.documentById.clear();
		this.eventCtors.clear();
	}
}

export const rovyData = new RovyDataRegistry();

export function isDocumentToken(value: unknown): value is AnyDocument {
	return typeIs(value, "table") && typeIs((value as { id?: unknown }).id, "string");
}
