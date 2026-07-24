import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeUnsafe,
	ScribeUnsafeDatatypes,
} from "./services";
import type {
	ScribeBinding,
	NativeScribeBundle,
} from "./binding";
import type {
	ScribeNativeModule,
	ScribeSerializable,
} from "./types";

type UnknownTable = Record<string, unknown>;

class ScribeUnsafeDatatypesRuntime implements ScribeUnsafeDatatypes {
	constructor(private readonly module: ScribeNativeModule) {}

	pack(name: string, value: ScribeSerializable): buffer {
		assert(
			this.module.Datatypes.IsSupported(name),
			`[rovy/scribe] ScribeUnsafe.datatypes does not support '${name}'`,
		);
		return this.module.Datatypes.Pack(
			name,
			value as Parameters<ScribeNativeModule["Datatypes"]["Pack"]>[1],
		);
	}

	unpack(name: string, bytes: buffer): unknown {
		assert(
			this.module.Datatypes.IsSupported(name),
			`[rovy/scribe] ScribeUnsafe.datatypes does not support '${name}'`,
		);
		return this.module.Datatypes.Unpack(name, bytes);
	}
}

export class ScribeUnsafeRuntime implements ScribeUnsafe<AnyScribeData> {
	readonly definition: AnyScribeData;
	readonly module: ScribeNativeModule;
	readonly client: unknown;
	readonly server: unknown;
	readonly profileStore: unknown;
	readonly datatypes: ScribeUnsafeDatatypes;
	readonly rawShape?: never;

	constructor(
		definition: AnyScribeData,
		binding: ScribeBinding,
		bundle: NativeScribeBundle,
		boundary: "client" | "server",
	) {
		const module = binding.module;
		assert(
			module !== undefined,
			"[rovy/scribe] ScribeUnsafe requires a native Scribe module binding",
		);
		const native = bundle as UnknownTable;
		this.definition = definition;
		this.module = module;
		this.client = native.Client;
		this.server = native.Server;
		this.profileStore = boundary === "server" &&
			typeIs(native.Server, "table")
			? (native.Server as UnknownTable).ProfileStore
			: undefined;
		this.datatypes = new ScribeUnsafeDatatypesRuntime(module);
	}
}
