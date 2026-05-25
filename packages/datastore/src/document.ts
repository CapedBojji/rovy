import type {
	DocumentOptions,
	KeyedDocument,
	PlayerDocument,
	PlayerDocumentOptions,
	SharedDocument,
	SharedDocumentOptions,
} from "./types";

const GUARD =
	"[rovy/datastore] document declaration reached runtime untransformed - is rovy-transformer in your tsconfig compilerOptions.plugins?";

export function playerDocument<T>(): (options: PlayerDocumentOptions<T>) => PlayerDocument<T> {
	return () => {
		throw GUARD;
	};
}

export function document<T, Owner>(): (options: DocumentOptions<T, Owner>) => KeyedDocument<T, Owner> {
	return () => {
		throw GUARD;
	};
}

export function sharedDocument<T>(): (options: SharedDocumentOptions<T>) => SharedDocument<T> {
	return () => {
		throw GUARD;
	};
}
