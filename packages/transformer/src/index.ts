import ts from "typescript";
import {
	arr,
	arrow,
	bool,
	call,
	constDecl,
	entityNameToExpression,
	field,
	id,
	lastTypeName,
	num,
	obj,
	prop,
	propertyNameText,
	propertyValue,
	stmt,
	str,
	stripUndefinedProperties,
} from "./ast";
import { decoratorName, type PluginOwnerInfo, TransformState, TransformerConfig } from "./state";

export { preparePartitionedProject } from "./partition";
export type { PluginBoundary, PartitionedPlugin, PreparedPartitionProject } from "./partition";

export interface TransformerExtras {
	readonly ts: typeof ts;
}

const DECORATORS = new Set([
	"component",
	"collect",
	"resource",
	"inspect",
	"prefab",
	"event",
	"netEvent",
	"netFunction",
	"scribeEvent",
	"scribeCommand",
	"system",
	"observer",
	"monitor",
	"relation",
	"schedule",
	"set",
	"plugin",
	"server",
	"client",
	"shared",
	"view",
	"ui",
]);

const RUNTIME_DECORATORS = new Set([
	"component",
	"collect",
	"resource",
	"prefab",
	"event",
	"netEvent",
	"netFunction",
	"scribeEvent",
	"scribeCommand",
	"system",
	"observer",
	"monitor",
	"relation",
	"schedule",
	"set",
	"plugin",
	"view",
	"ui",
]);
const SHARED_BY_DEFAULT_DECORATORS = new Set([
	"netEvent",
	"netFunction",
	"scribeEvent",
	"scribeCommand",
]);

type MonitorMethod = "onEnter" | "onExit" | "onChange";

const UI_KEYED_HELPERS = new Map([
	["useState", "__useState"],
	["useEffect", "__useEffect"],
	["useInstance", "__useInstance"],
]);

const RETAINED_UI_FACTORIES = new Set([
	"native",
	"fragment",
	"frame",
	"screenGui",
	"billboardGui",
	"surfaceGui",
	"textLabel",
	"textButton",
	"imageLabel",
	"imageButton",
	"scrollingFrame",
	"canvasGroup",
	"textBox",
	"viewportFrame",
	"uiListLayout",
	"uiGridLayout",
	"uiPadding",
	"uiCorner",
	"uiStroke",
	"uiScale",
	"uiAspectRatioConstraint",
	"uiSizeConstraint",
]);

interface DecoratorInfo {
	readonly name: string;
	readonly node: ts.Decorator;
	readonly args: readonly ts.Expression[];
}

interface QueryBuild {
	readonly id: string;
	readonly descriptor: ts.ObjectLiteralExpression;
	readonly termTypes: readonly ts.TypeNode[];
}

interface ParamBuild {
	readonly descriptor: ts.ArrayLiteralExpression;
	readonly queryStatements: readonly ts.Statement[];
}

interface PluginBinding {
	readonly owner: PluginOwnerInfo;
	readonly expr: ts.Expression;
}

interface WidgetCallerInfo {
	readonly implementation: ts.FunctionDeclaration;
	readonly hasStyleParam: boolean;
}

export default function rovyTransformer(
	program: ts.Program,
	config: TransformerConfig = {},
	_extras?: TransformerExtras,
): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		const state = new TransformState(program, context, config);
		return (sourceFile) => transformSourceFile(state, sourceFile);
	};
}

function transformSourceFile(state: TransformState, sourceFile: ts.SourceFile): ts.SourceFile {
	const widgetCallers = collectWidgetCallers(state, sourceFile);
	const freeQueryStatements: ts.Statement[] = [];
	const visitor = createVisitor(state, sourceFile, widgetCallers, freeQueryStatements);
	const statements: ts.Statement[] = [];
	const runtimeConfig = state.netRuntimeConfigStatement(sourceFile);
	if (runtimeConfig) statements.push(runtimeConfig);

	for (const statement of sourceFile.statements) {
		if (ts.isClassDeclaration(statement)) {
			const transformed = transformClass(state, sourceFile, statement, visitor);
			statements.push(...transformed);
		} else if (ts.isVariableStatement(statement)) {
			const transformed = transformVariableStatement(state, sourceFile, statement, visitor);
			statements.push(transformed);
		} else if (ts.isFunctionDeclaration(statement)) {
			const widget = statement.name ? widgetCallers.get(statement.name.text) : undefined;
			if (widget && widget.implementation === statement && statement.name) {
				const visited = transformWidgetFunction(state, sourceFile, statement, visitor);
				const widgetId = classScopedId(state.stableIdForNode(statement), statement.name.text);
				const metaConstName = `__rovyWidgetMeta_${statement.name.text}`;
				statements.push(constDecl(metaConstName, buildWidgetMeta(widgetId, statement.name.text)));
				statements.push(
					buildWidgetVarStatement(
						state,
						sourceFile,
						visited,
						id(metaConstName),
					),
				);
			} else {
				const visited = ts.visitNode(statement, visitor, ts.isStatement);
				if (visited) statements.push(visited);
			}
		} else {
			const visited = ts.visitNode(statement, visitor, ts.isStatement);
			if (visited) statements.push(visited);
		}
	}

	return ts.factory.updateSourceFile(sourceFile, state.withPendingImports(sourceFile, [...statements, ...freeQueryStatements]));
}

function transformVariableStatement(
	state: TransformState,
	sourceFile: ts.SourceFile,
	statement: ts.VariableStatement,
	visitor: ts.Visitor,
): ts.VariableStatement {
	const declarations = statement.declarationList.declarations.map((declaration) => {
		if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
			return ts.visitEachChild(declaration, visitor, state.context);
		}
		const document = buildDocumentDeclaration(state, sourceFile, declaration.name, declaration.initializer);
		const scribeData = buildScribeDataDeclaration(
			state,
			sourceFile,
			declaration.name,
			declaration.initializer,
		);
		const lowered = document ?? scribeData;
		if (lowered === undefined) return ts.visitEachChild(declaration, visitor, state.context);
		return ts.factory.updateVariableDeclaration(
			declaration,
			declaration.name,
			declaration.exclamationToken,
			declaration.type,
			lowered,
		);
	});
	return ts.factory.updateVariableStatement(
		statement,
		statement.modifiers,
		ts.factory.updateVariableDeclarationList(statement.declarationList, declarations),
	);
}

type DocumentDeclarationKind = "player" | "keyed" | "shared";

const SCRIBE_DATA_OPTION_KEYS = new Map<string, string>([
	["saveInterval", "SaveInterval"],
	["mode", "Mode"],
	["targetUserId", "TargetUserId"],
	["useMock", "UseMock"],
	["viewedUserId", "ViewedUserId"],
	["overriddenUserId", "OverriddenUserId"],
	["dontSave", "DontSave"],
	["resetData", "ResetData"],
	["loadFailurePolicy", "LoadFailurePolicy"],
	["versionAheadPolicy", "VersionAheadPolicy"],
	["kickOnSessionEnd", "KickOnSessionEnd"],
	["loadFailureMessage", "LoadFailureMessage"],
	["sessionEndMessage", "SessionEndMessage"],
	["commandRateLimit", "CommandRateLimit"],
	["requestTimeout", "RequestTimeout"],
	["maxInboundBytes", "MaxInboundBytes"],
	["boundsPolicy", "BoundsPolicy"],
	["wipeGuardPolicy", "WipeGuardPolicy"],
	["wipeGuardShrinkRatio", "WipeGuardShrinkRatio"],
	["logLevel", "LogLevel"],
	["statusThresholds", "StatusThresholds"],
	["banner", "Banner"],
	["transportChannel", "TransportChannel"],
	["purchaseLog", "PurchaseLog"],
	["leaderboards", "Leaderboards"],
	["products", "Products"],
	["passes", "Passes"],
	["perks", "Perks"],
	["ownReceipts", "OwnReceipts"],
	["economy", "Economy"],
]);

const SCRIBE_GIFTING_OPTION_KEYS = new Map<string, string>([
	["cooldown", "GiftCooldown"],
	["maxPending", "GiftMaxPending"],
	["intentTtl", "GiftIntentTTL"],
	["allowDuplicate", "AllowDuplicateGifts"],
	["noIntentPolicy", "NoGiftIntentPolicy"],
]);

const SCRIBE_PURCHASE_LOG_KEYS = [
	"robuxCap",
	"inGameCap",
	"replicateRobux",
	"replicateInGame",
	"categories",
] as const;

const SCRIBE_STATUS_THRESHOLD_KEYS = [
	"failWindow",
	"failCount",
	"recoverStreak",
] as const;

const SCRIBE_LEADERBOARD_KEYS = [
	"stat",
	"limit",
	"scale",
	"replicate",
	"storeName",
] as const;

const SCRIBE_PRODUCT_KEYS = ["id", "category", "grants"] as const;
const SCRIBE_PASS_KEYS = ["id", "category"] as const;
const SCRIBE_ECONOMY_KEYS = ["prefix", "currencies"] as const;
const SCRIBE_ECONOMY_CURRENCY_KEYS = ["label", "fields"] as const;
const SCRIBE_ECONOMY_FIELD_KEYS = ["name", "prefix"] as const;

const SCRIBE_PASCAL_NESTED_KEYS = new Map<string, string>([
	["robuxCap", "RobuxCap"],
	["inGameCap", "InGameCap"],
	["replicateRobux", "ReplicateRobux"],
	["replicateInGame", "ReplicateInGame"],
	["categories", "Categories"],
	["failWindow", "FailWindow"],
	["failCount", "FailCount"],
	["recoverStreak", "RecoverStreak"],
	["stat", "Stat"],
	["limit", "Limit"],
	["scale", "Scale"],
	["replicate", "Replicate"],
	["storeName", "StoreName"],
	["id", "Id"],
	["category", "Category"],
	["grants", "Grants"],
	["prefix", "Prefix"],
	["currencies", "Currencies"],
	["label", "Label"],
	["fields", "Fields"],
	["name", "Name"],
]);

const SCRIBE_ROOT_RESERVED_NAMES = new Set([
	"WaitForData",
	"GetState",
	"Get",
	"Batch",
	"Transaction",
	"Flush",
	"GetSaveInfo",
	"GetOffline",
	"UpdateOffline",
	"ListVersions",
	"GetVersion",
	"RestoreVersion",
	"Erase",
	"Export",
	"ProfileStore",
	"Raw",
	"Command",
	"IsReady",
	"Request",
	"GetLeaderboard",
	"GetMyRank",
	"OnLeaderboard",
	"GetServiceStatus",
	"OnServiceStatus",
	"GetShared",
	"OnSharedChanged",
	"Owns",
	"OwnsAsync",
	"ObserveOwned",
	"OnOwnershipChanged",
	"GetGiftCredits",
	"GetPurchases",
	"Mock",
	"MockCommand",
]);

const SCRIBE_ACCESSOR_RESERVED_NAMES = new Set([
	"Get",
	"Clone",
	"Default",
	"Set",
	"Update",
	"Observe",
	"Changed",
	"Increment",
	"Decrement",
	"Min",
	"Max",
	"Toggle",
	"Insert",
	"Remove",
	"RemoveValue",
	"Find",
	"Has",
	"Count",
	"Clear",
	"OnInsert",
	"OnRemove",
	"OnKeyAdded",
	"OnKeyRemoved",
	"SetTimed",
	"ExtendTimed",
	"Active",
	"get",
	"clone",
	"default",
	"set",
	"update",
	"increment",
	"decrement",
	"min",
	"max",
	"toggle",
	"at",
	"insert",
	"remove",
	"removeValue",
	"find",
	"has",
	"count",
	"clear",
	"setTimed",
	"extendTimed",
	"active",
]);

function buildScribeDataDeclaration(
	state: TransformState,
	sourceFile: ts.SourceFile,
	name: ts.Identifier,
	initializer: ts.Expression,
): ts.Expression | undefined {
	if (!ts.isCallExpression(initializer)) return undefined;
	if (state.resolveScribeName(sourceFile, initializer.expression) !== "scribeData") return undefined;
	const declaration = initializer.arguments[0];
	if (!declaration || !ts.isObjectLiteralExpression(declaration)) {
		state.diagnostic(initializer, "[rovy/scribe] scribeData requires one declaration object");
		return initializer;
	}

	const dataName = requiredScribeOption(state, declaration, "name", initializer);
	const profileStoreIndex = requiredScribeOption(
		state,
		declaration,
		"profileStoreIndex",
		initializer,
	);
	const profileKeyPrefix = requiredScribeOption(
		state,
		declaration,
		"profileKeyPrefix",
		initializer,
	);
	const template = requiredScribeOption(state, declaration, "template", initializer);
	validateRequiredNonEmptyString(state, dataName, "name");
	validateRequiredNonEmptyString(state, profileStoreIndex, "profileStoreIndex");
	validateRequiredNonEmptyString(state, profileKeyPrefix, "profileKeyPrefix");
	if (ts.isStringLiteral(dataName) && dataName.text.length > 0) {
		state.registerScribeDataName(dataName.text, name);
	}
	if (ts.isObjectLiteralExpression(template)) {
		validateScribeTemplate(state, sourceFile, template);
	} else if (template.kind !== ts.SyntaxKind.UndefinedKeyword) {
		state.diagnostic(template, "[rovy/scribe] template must be an inline object literal");
	}
	const options = propertyValue(declaration, "options");
	if (options !== undefined && !ts.isObjectLiteralExpression(options)) {
		state.diagnostic(options, "[rovy/scribe] options must be an inline object literal");
	}
	validateScribeDataDeclarationKeys(state, declaration);

	return call(field(state.addRovyScribeImport(sourceFile), "__data"), [
		obj(
			[
				prop("id", str(scribeDataIdForDeclaration(state, name))),
				prop("name", dataName),
				prop("profileStoreIndex", profileStoreIndex),
				prop("profileKeyPrefix", profileKeyPrefix),
				prop("template", template),
				prop(
					"options",
					options !== undefined && ts.isObjectLiteralExpression(options)
						? compileScribeDataOptions(state, options, template)
						: obj([], false),
				),
			],
			true,
		),
	]);
}

function validateRequiredNonEmptyString(
	state: TransformState,
	value: ts.Expression,
	key: string,
): void {
	if (!ts.isStringLiteral(value) || value.text.length === 0) {
		state.diagnostic(
			value,
			`[rovy/scribe] scribeData '${key}' must be a non-empty string literal`,
		);
	}
}

function requiredScribeOption(
	state: TransformState,
	options: ts.ObjectLiteralExpression,
	key: string,
	node: ts.Node,
): ts.Expression {
	const value = propertyValue(options, key);
	if (value !== undefined) return value;
	state.diagnostic(node, `[rovy/scribe] scribeData option '${key}' is required`);
	return id("undefined");
}

function validateScribeDataDeclarationKeys(
	state: TransformState,
	declaration: ts.ObjectLiteralExpression,
): void {
	const known = new Set(["name", "profileStoreIndex", "profileKeyPrefix", "template", "options"]);
	for (const property of declaration.properties) {
		if (ts.isSpreadAssignment(property)) {
			state.diagnostic(property, "[rovy/scribe] scribeData declarations cannot use spread properties");
			continue;
		}
		const key = propertyNameText(property.name);
		if (key === undefined) {
			state.diagnostic(property, "[rovy/scribe] scribeData declaration keys must be static");
		} else if (!known.has(key)) {
			state.diagnostic(property, `[rovy/scribe] unknown scribeData key '${key}'`);
		}
	}
}

function compileScribeDataOptions(
	state: TransformState,
	options: ts.ObjectLiteralExpression,
	template: ts.Expression,
): ts.ObjectLiteralExpression {
	const compiled: ts.ObjectLiteralElementLike[] = [];
	for (const property of options.properties) {
		if (ts.isSpreadAssignment(property)) {
			state.diagnostic(property, "[rovy/scribe] options cannot use spread properties");
			continue;
		}
		const key = propertyNameText(property.name);
		if (key === undefined) {
			state.diagnostic(property, "[rovy/scribe] option keys must be static");
			continue;
		}
		const value = propertyInitializer(property);
		if (value === undefined) {
			state.diagnostic(property, `[rovy/scribe] option '${key}' requires a value`);
			continue;
		}
		if (key === "gifting") {
			if (!ts.isObjectLiteralExpression(value)) {
				state.diagnostic(value, "[rovy/scribe] gifting must be an inline object literal");
				continue;
			}
			validateScribeGiftingValues(state, value);
			for (const giftProperty of value.properties) {
				if (ts.isSpreadAssignment(giftProperty)) {
					state.diagnostic(giftProperty, "[rovy/scribe] gifting cannot use spread properties");
					continue;
				}
				const giftKey = propertyNameText(giftProperty.name);
				const nativeKey = giftKey === undefined
					? undefined
					: SCRIBE_GIFTING_OPTION_KEYS.get(giftKey);
				const giftValue = propertyInitializer(giftProperty);
				if (nativeKey === undefined) {
					state.diagnostic(giftProperty, `[rovy/scribe] unknown gifting option '${giftKey ?? "<computed>"}'`);
				} else if (giftValue !== undefined) {
					compiled.push(
						prop(nativeKey, compileScribeOptionValueForKey(giftKey!, giftValue)),
					);
				}
			}
			continue;
		}
		const nativeKey = SCRIBE_DATA_OPTION_KEYS.get(key);
		if (nativeKey === undefined) {
			state.diagnostic(property, `[rovy/scribe] unknown Scribe option '${key}'`);
			continue;
		}
		validateScribeDataOptionValue(state, key, value, template);
		compiled.push(prop(nativeKey, compileScribeOptionValueForKey(key, value)));
	}
	return obj(compiled, true);
}

function validateScribeDataOptionValue(
	state: TransformState,
	key: string,
	value: ts.Expression,
	template: ts.Expression,
): void {
	switch (key) {
		case "mode":
			validateStringOption(
				state,
				value,
				["Live", "Mock", "NoSave"],
				"[rovy/scribe] mode",
			);
			return;
		case "loadFailurePolicy":
			validateStringOption(
				state,
				value,
				["kick", "wait"],
				"[rovy/scribe] loadFailurePolicy",
			);
			return;
		case "versionAheadPolicy":
			validateStringOption(
				state,
				value,
				["kick", "allow"],
				"[rovy/scribe] versionAheadPolicy",
			);
			return;
		case "boundsPolicy":
			validateStringOption(
				state,
				value,
				["clamp", "reject"],
				"[rovy/scribe] boundsPolicy",
			);
			return;
		case "wipeGuardPolicy":
			validateStringOption(
				state,
				value,
				["warn", "block"],
				"[rovy/scribe] wipeGuardPolicy",
			);
			return;
		case "logLevel":
			validateStringOption(
				state,
				value,
				["Debug", "Info", "Warn", "Error", "Fatal"],
				"[rovy/scribe] logLevel",
			);
			return;
		case "purchaseLog":
			validateInlineScribeObject(
				state,
				value,
				SCRIBE_PURCHASE_LOG_KEYS,
				"purchaseLog",
			);
			return;
		case "statusThresholds":
			validateInlineScribeObject(
				state,
				value,
				SCRIBE_STATUS_THRESHOLD_KEYS,
				"statusThresholds",
			);
			return;
		case "leaderboards":
			validateScribeNamedConfigs(
				state,
				value,
				"leaderboards",
				SCRIBE_LEADERBOARD_KEYS,
				(name, config) => {
					const stat = propertyValue(config, "stat");
					if (stat === undefined || !ts.isStringLiteral(stat)) {
						state.diagnostic(
							stat ?? config,
							`[rovy/scribe] leaderboard '${name}' requires a string literal stat`,
						);
					} else if (
						!scribeTemplatePathIsNumeric(state, template, stat.text)
					) {
						state.diagnostic(
							stat,
							`[rovy/scribe] leaderboard '${name}' stat '${stat.text}' must reference a numeric schema leaf`,
						);
					}
				},
			);
			return;
		case "products":
			validateScribeNamedConfigs(
				state,
				value,
				"products",
				SCRIBE_PRODUCT_KEYS,
				(name, config) => {
					if (propertyValue(config, "id") === undefined) {
						state.diagnostic(
							config,
							`[rovy/scribe] product '${name}' requires id`,
						);
					}
				},
			);
			return;
		case "passes":
			validateScribeNamedConfigs(
				state,
				value,
				"passes",
				SCRIBE_PASS_KEYS,
				(name, config) => {
					if (propertyValue(config, "id") === undefined) {
						state.diagnostic(
							config,
							`[rovy/scribe] pass '${name}' requires id`,
						);
					}
				},
			);
			return;
		case "economy":
			validateScribeEconomyOption(state, value);
			return;
		case "perks":
			if (
				!ts.isArrayLiteralExpression(value) ||
				value.elements.some(
					(element) =>
						ts.isSpreadElement(element) ||
						!ts.isStringLiteralLike(element),
				)
			) {
				state.diagnostic(
					value,
					"[rovy/scribe] perks must be an inline array of string literals",
				);
			}
			return;
	}
}

function validateScribeGiftingValues(
	state: TransformState,
	value: ts.ObjectLiteralExpression,
): void {
	const policy = propertyValue(value, "noIntentPolicy");
	if (policy !== undefined) {
		validateStringOption(
			state,
			policy,
			["grantOrCredit", "hold"],
			"[rovy/scribe] gifting.noIntentPolicy",
		);
	}
}

function validateInlineScribeObject(
	state: TransformState,
	value: ts.Expression,
	allowed: ReadonlyArray<string>,
	label: string,
): ts.ObjectLiteralExpression | undefined {
	if (!ts.isObjectLiteralExpression(value)) {
		state.diagnostic(
			value,
			`[rovy/scribe] ${label} must be an inline object literal`,
		);
		return undefined;
	}
	validateOnlyKnownObjectKeys(
		state,
		value,
		allowed,
		`[rovy/scribe] ${label}`,
	);
	return value;
}

function validateScribeNamedConfigs(
	state: TransformState,
	value: ts.Expression,
	label: string,
	allowed: ReadonlyArray<string>,
	validate: (name: string, config: ts.ObjectLiteralExpression) => void,
): void {
	if (!ts.isObjectLiteralExpression(value)) {
		state.diagnostic(
			value,
			`[rovy/scribe] ${label} must be an inline object literal`,
		);
		return;
	}
	for (const property of value.properties) {
		if (ts.isSpreadAssignment(property)) {
			state.diagnostic(
				property,
				`[rovy/scribe] ${label} cannot use spread properties`,
			);
			continue;
		}
		const name = propertyNameText(property.name);
		const config = propertyInitializer(property);
		if (
			name === undefined ||
			config === undefined ||
			!ts.isObjectLiteralExpression(config)
		) {
			state.diagnostic(
				property,
				`[rovy/scribe] ${label} entries must be named inline object literals`,
			);
			continue;
		}
		validateOnlyKnownObjectKeys(
			state,
			config,
			allowed,
			`[rovy/scribe] ${label}.${name}`,
		);
		validate(name, config);
	}
}

function validateScribeEconomyOption(
	state: TransformState,
	value: ts.Expression,
): void {
	const economy = validateInlineScribeObject(
		state,
		value,
		SCRIBE_ECONOMY_KEYS,
		"economy",
	);
	if (economy === undefined) return;
	const currencies = propertyValue(economy, "currencies");
	if (currencies === undefined) return;
	validateScribeNamedConfigs(
		state,
		currencies,
		"economy.currencies",
		SCRIBE_ECONOMY_CURRENCY_KEYS,
		(_name, currency) => {
			const fields = propertyValue(currency, "fields");
			if (fields === undefined) return;
			if (!ts.isArrayLiteralExpression(fields)) {
				state.diagnostic(
					fields,
					"[rovy/scribe] economy currency fields must be an inline array",
				);
				return;
			}
			for (const field of fields.elements) {
				if (ts.isStringLiteralLike(field)) continue;
				if (!ts.isObjectLiteralExpression(field)) {
					state.diagnostic(
						field,
						"[rovy/scribe] economy fields must be strings or inline declarations",
					);
					continue;
				}
				validateOnlyKnownObjectKeys(
					state,
					field,
					SCRIBE_ECONOMY_FIELD_KEYS,
					"[rovy/scribe] economy field",
				);
				const name = propertyValue(field, "name");
				if (name === undefined || !ts.isStringLiteralLike(name)) {
					state.diagnostic(
						name ?? field,
						"[rovy/scribe] economy field requires a string literal name",
					);
				}
			}
		},
	);
}

function scribeTemplatePathIsNumeric(
	state: TransformState,
	template: ts.Expression,
	path: string,
): boolean {
	let current = template;
	for (const segment of path.split(".")) {
		current = unwrapScribeSchemaExpression(
			state,
			current.getSourceFile(),
			current,
		).expression;
		if (!ts.isObjectLiteralExpression(current)) return false;
		const child = propertyValue(current, segment);
		if (child === undefined) return false;
		current = child;
	}
	current = unwrapScribeSchemaExpression(
		state,
		current.getSourceFile(),
		current,
	).expression;
	const helper = scribeSchemaHelperCall(
		state,
		current.getSourceFile(),
		current,
	);
	if (helper === "int" || helper === "number") return true;
	if (ts.isNumericLiteral(current)) return true;
	if (
		helper === "dynamic" &&
		ts.isCallExpression(current) &&
		current.arguments[0] !== undefined
	) {
		const factoryType = state.typeChecker?.getTypeAtLocation(
			current.arguments[0],
		);
		const returnType = factoryType
			?.getCallSignatures()[0]
			?.getReturnType();
		return returnType !== undefined &&
			(returnType.flags & ts.TypeFlags.NumberLike) !== 0;
	}
	return false;
}

function unwrapScribeSchemaExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	expression: ts.Expression,
): { readonly expression: ts.Expression } {
	let current = expression;
	while (true) {
		const helper = scribeSchemaHelperCall(state, sourceFile, current);
		if (
			helper !== "serverOnly" &&
			helper !== "shared" &&
			helper !== "session" &&
			helper !== "optional"
		) {
			break;
		}
		const inner = (current as ts.CallExpression).arguments[0];
		if (inner === undefined) break;
		current = inner;
	}
	return { expression: current };
}

function compileScribeOptionValueForKey(
	key: string,
	value: ts.Expression,
): ts.Expression {
	if (key === "purchaseLog" && ts.isObjectLiteralExpression(value)) {
		return obj(
			value.properties.map((property) => {
				if (ts.isSpreadAssignment(property)) return property;
				const propertyKey = propertyNameText(property.name);
				const initial = propertyInitializer(property) ?? id("undefined");
				return prop(
					propertyKey === "categories"
						? "PurchaseLogCategories"
						: SCRIBE_PASCAL_NESTED_KEYS.get(propertyKey ?? "") ??
							propertyKey ??
							"Unknown",
					compileScribeOptionValue(initial),
				);
			}),
			true,
		);
	}
	if (ts.isStringLiteral(value)) {
		const translated = new Map<string, Readonly<Record<string, string>>>([
			["loadFailurePolicy", { kick: "Kick", wait: "Wait" }],
			["versionAheadPolicy", { kick: "Kick", allow: "Allow" }],
			["boundsPolicy", { clamp: "Clamp", reject: "Reject" }],
			["wipeGuardPolicy", { warn: "Warn", block: "Block" }],
			["noIntentPolicy", { grantOrCredit: "GrantOrCredit", hold: "Hold" }],
		]).get(key)?.[value.text];
		if (translated !== undefined) return str(translated);
	}
	return compileScribeOptionValue(value);
}

function compileScribeOptionValue(value: ts.Expression): ts.Expression {
	if (ts.isObjectLiteralExpression(value)) {
		const properties: ts.ObjectLiteralElementLike[] = [];
		for (const property of value.properties) {
			if (ts.isSpreadAssignment(property)) {
				properties.push(property);
				continue;
			}
			const key = propertyNameText(property.name);
			const initial = propertyInitializer(property);
			if (key !== undefined && initial !== undefined) {
				properties.push(
					prop(
						SCRIBE_PASCAL_NESTED_KEYS.get(key) ?? key,
						compileScribeOptionValue(initial),
					),
				);
			}
		}
		return obj(properties, value.properties.length > 1);
	}
	if (ts.isArrayLiteralExpression(value)) {
		return arr(
			value.elements.map((element) =>
				ts.isSpreadElement(element)
					? element
					: compileScribeOptionValue(element)),
			value.elements.length > 2,
		);
	}
	return value;
}

function propertyInitializer(
	property: ts.ObjectLiteralElementLike,
): ts.Expression | undefined {
	if (ts.isPropertyAssignment(property)) return property.initializer;
	if (ts.isShorthandPropertyAssignment(property)) return property.name;
	return undefined;
}

function scribeDataIdForDeclaration(state: TransformState, node: ts.Node): string {
	const name = ts.isIdentifier(node) ? node.text : node.getText();
	return `${state.stableIdForNode(node)}/${name}`;
}

interface ScribeSchemaValidationContext {
	readonly path: ReadonlyArray<string>;
	readonly depth: number;
	readonly rootField: boolean;
	readonly inTypedElement: boolean;
	readonly inSession: boolean;
	readonly inOpaqueContainer: boolean;
}

function validateScribeTemplate(
	state: TransformState,
	sourceFile: ts.SourceFile,
	template: ts.ObjectLiteralExpression,
): void {
	for (const property of template.properties) {
		if (ts.isSpreadAssignment(property)) {
			state.diagnostic(property, "[rovy/scribe] template objects cannot use spread properties");
			continue;
		}
		const key = propertyNameText(property.name);
		const value = propertyInitializer(property);
		if (key === undefined || value === undefined) {
			state.diagnostic(property, "[rovy/scribe] template fields require static names and values");
			continue;
		}
		if (SCRIBE_ROOT_RESERVED_NAMES.has(key)) {
			state.diagnostic(property.name, `[rovy/scribe] root field '${key}' collides with the native Scribe API`);
		}
		validateScribeSchemaExpression(state, sourceFile, value, {
			path: [key],
			depth: 1,
			rootField: true,
			inTypedElement: false,
			inSession: false,
			inOpaqueContainer: false,
		});
	}
}

function validateScribeSchemaExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	expression: ts.Expression,
	context: ScribeSchemaValidationContext,
): void {
	if (context.depth > 25) {
		state.diagnostic(
			expression,
			`[rovy/scribe] schema path '${context.path.join(".")}' exceeds Scribe's maximum depth of 25`,
		);
		return;
	}

	const helper = scribeSchemaHelperCall(state, sourceFile, expression);
	if (helper !== undefined) {
		validateScribeSchemaHelper(state, sourceFile, expression as ts.CallExpression, helper, context);
		return;
	}

	if (ts.isObjectLiteralExpression(expression)) {
		for (const property of expression.properties) {
			if (ts.isSpreadAssignment(property)) {
				state.diagnostic(property, "[rovy/scribe] schema objects cannot use spread properties");
				continue;
			}
			const key = propertyNameText(property.name);
			const value = propertyInitializer(property);
			if (key === undefined || value === undefined) {
				state.diagnostic(property, "[rovy/scribe] schema fields require static names and values");
				continue;
			}
			if (SCRIBE_ACCESSOR_RESERVED_NAMES.has(key)) {
				state.diagnostic(
					property.name,
					`[rovy/scribe] field '${[...context.path, key].join(".")}' collides with a Scribe accessor method`,
				);
			}
			validateScribeSchemaExpression(state, sourceFile, value, {
				...context,
				path: [...context.path, key],
				depth: context.depth + 1,
				rootField: false,
			});
		}
		return;
	}

	if (ts.isArrayLiteralExpression(expression)) {
		for (const element of expression.elements) {
			if (ts.isSpreadElement(element)) {
				state.diagnostic(element, "[rovy/scribe] persisted array defaults cannot use spread elements");
				continue;
			}
			if (containsScribeSchemaHelper(state, sourceFile, element)) {
				state.diagnostic(
					element,
					"[rovy/scribe] declarators inside plain arrays are ambiguous; use s.arrayOf(...)",
				);
			}
			validateSerializableScribeDefault(state, element, context.path);
		}
		return;
	}

	validateSerializableScribeDefault(state, expression, context.path);
}

function validateScribeSchemaHelper(
	state: TransformState,
	sourceFile: ts.SourceFile,
	callExpression: ts.CallExpression,
	helper: string,
	context: ScribeSchemaValidationContext,
): void {
	const args = callExpression.arguments;
	const first = args[0];
	const option = args[1];
	const at = context.path.join(".");
	const forbiddenInElement = helper === "timed" ||
		helper === "dynamic" ||
		helper === "shared" ||
		helper === "session";
	if (context.inTypedElement && forbiddenInElement) {
		state.diagnostic(
			callExpression,
			`[rovy/scribe] s.${helper} is not supported inside typed container elements at '${at}'`,
		);
	}
	if (context.inOpaqueContainer) {
		state.diagnostic(
			callExpression,
			`[rovy/scribe] s.${helper} cannot appear inside a plain persisted container at '${at}'`,
		);
	}

	switch (helper) {
		case "int":
		case "number": {
			if (first === undefined) {
				state.diagnostic(callExpression, `[rovy/scribe] s.${helper} requires a numeric default`);
			} else {
				validateFiniteNumericLiteral(state, first, `s.${helper} default`);
				if (helper === "int") {
					const value = numericLiteralValue(first);
					if (value !== undefined && !Number.isInteger(value)) {
						state.diagnostic(first, "[rovy/scribe] s.int default must be an integer");
					}
				}
			}
			validateScribeNumberOptions(state, option, helper);
			return;
		}
		case "string":
			if (first === undefined || !ts.isStringLiteralLike(first)) {
				state.diagnostic(first ?? callExpression, "[rovy/scribe] s.string requires a string literal default");
			}
			validatePositiveIntegerOption(state, option, ["maxLength"], "s.string");
			return;
		case "enum":
			validateScribeEnum(state, callExpression);
			return;
		case "timed":
			if (first === undefined) {
				state.diagnostic(callExpression, "[rovy/scribe] s.timed requires a default");
			} else {
				validateScribeSchemaExpression(state, sourceFile, first, {
					...context,
					rootField: false,
					depth: context.depth + 1,
				});
			}
			return;
		case "dynamic":
			if (
				first === undefined ||
				(!ts.isArrowFunction(first) && !ts.isFunctionExpression(first) && !ts.isIdentifier(first))
			) {
				state.diagnostic(
					first ?? callExpression,
					"[rovy/scribe] s.dynamic requires a non-yielding factory function",
				);
			}
			if (context.inSession) {
				state.diagnostic(callExpression, "[rovy/scribe] s.dynamic cannot appear inside s.session");
			}
			return;
		case "optional": {
			if (first === undefined) {
				state.diagnostic(callExpression, "[rovy/scribe] s.optional requires an inner leaf declarator");
				return;
			}
			const inner = scribeSchemaHelperCall(state, sourceFile, first);
			if (
				inner === "timed" ||
				inner === "dynamic" ||
				inner === "arrayOf" ||
				inner === "dictOf" ||
				ts.isObjectLiteralExpression(first) ||
				ts.isArrayLiteralExpression(first)
			) {
				state.diagnostic(
					first,
					"[rovy/scribe] s.optional can wrap only a non-timed, non-dynamic leaf",
				);
			}
			validateScribeSchemaExpression(state, sourceFile, first, {
				...context,
				rootField: false,
				depth: context.depth + 1,
			});
			return;
		}
		case "arrayOf":
		case "dictOf": {
			if (first === undefined) {
				state.diagnostic(callExpression, `[rovy/scribe] s.${helper} requires an element shape`);
			} else {
				validateScribeSchemaExpression(state, sourceFile, first, {
					...context,
					path: [...context.path, helper === "arrayOf" ? "[index]" : "[key]"],
					depth: context.depth + 1,
					rootField: false,
					inTypedElement: true,
				});
			}
			validateScribeContainerOptions(state, option, helper);
			return;
		}
		case "serverOnly":
		case "shared":
		case "session":
			if ((helper === "shared" || helper === "session") && !context.rootField) {
				state.diagnostic(
					callExpression,
					`[rovy/scribe] s.${helper} is only supported on root fields`,
				);
			}
			if (first === undefined) {
				state.diagnostic(callExpression, `[rovy/scribe] s.${helper} requires an inner value`);
			} else {
				validateScribeSchemaExpression(state, sourceFile, first, {
					...context,
					rootField: false,
					depth: context.depth + 1,
					inSession: context.inSession || helper === "session",
				});
			}
			return;
		case "vector3":
		case "vector2":
		case "vector3int16":
		case "vector2int16":
		case "cframe":
		case "color3":
		case "brickColor":
		case "udim":
		case "udim2":
		case "rect":
		case "numberRange":
		case "numberSequence":
		case "colorSequence":
		case "dateTime":
		case "enumItem":
		case "font":
		case "physicalProperties":
			if (first === undefined) {
				state.diagnostic(callExpression, `[rovy/scribe] s.${helper} requires a default value`);
			}
			return;
		default:
			state.diagnostic(callExpression, `[rovy/scribe] unknown schema helper s.${helper}`);
	}
}

function scribeSchemaHelperCall(
	state: TransformState,
	sourceFile: ts.SourceFile,
	expression: ts.Expression,
): string | undefined {
	if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
		return undefined;
	}
	if (state.resolveScribeName(sourceFile, expression.expression.expression) !== "s") return undefined;
	return expression.expression.name.text;
}

function containsScribeSchemaHelper(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.Node,
): boolean {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (found) return;
		if (ts.isExpression(current) && scribeSchemaHelperCall(state, sourceFile, current) !== undefined) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
}

function validateScribeNumberOptions(
	state: TransformState,
	options: ts.Expression | undefined,
	label: string,
): void {
	if (options === undefined) return;
	if (!ts.isObjectLiteralExpression(options)) {
		state.diagnostic(options, `[rovy/scribe] s.${label} options must be an inline object literal`);
		return;
	}
	let min: number | undefined;
	let max: number | undefined;
	for (const property of options.properties) {
		const key = ts.isSpreadAssignment(property) ? undefined : propertyNameText(property.name);
		const value = ts.isSpreadAssignment(property) ? undefined : propertyInitializer(property);
		if (key !== "min" && key !== "max") {
			state.diagnostic(property, `[rovy/scribe] unknown s.${label} option '${key ?? "<computed>"}'`);
			continue;
		}
		if (value !== undefined) {
			validateFiniteNumericLiteral(state, value, `s.${label}.${key}`);
			const numeric = numericLiteralValue(value);
			if (key === "min") min = numeric;
			else max = numeric;
		}
	}
	if (min !== undefined && max !== undefined && min > max) {
		state.diagnostic(options, `[rovy/scribe] s.${label} min cannot exceed max`);
	}
}

function validatePositiveIntegerOption(
	state: TransformState,
	options: ts.Expression | undefined,
	allowed: ReadonlyArray<string>,
	label: string,
): void {
	if (options === undefined) return;
	if (!ts.isObjectLiteralExpression(options)) {
		state.diagnostic(options, `[rovy/scribe] ${label} options must be an inline object literal`);
		return;
	}
	for (const property of options.properties) {
		const key = ts.isSpreadAssignment(property) ? undefined : propertyNameText(property.name);
		const value = ts.isSpreadAssignment(property) ? undefined : propertyInitializer(property);
		if (key === undefined || !allowed.includes(key)) {
			state.diagnostic(property, `[rovy/scribe] unknown ${label} option '${key ?? "<computed>"}'`);
			continue;
		}
		const numeric = value === undefined ? undefined : numericLiteralValue(value);
		if (numeric === undefined || !Number.isInteger(numeric) || numeric < 1) {
			state.diagnostic(value ?? property, `[rovy/scribe] ${label}.${key} must be a positive integer literal`);
		}
	}
}

function validateScribeContainerOptions(
	state: TransformState,
	options: ts.Expression | undefined,
	helper: string,
): void {
	validatePositiveIntegerOption(
		state,
		options,
		helper === "arrayOf" ? ["maxItems"] : ["maxKeys", "maxKeyLength"],
		`s.${helper}`,
	);
}

function validateScribeEnum(
	state: TransformState,
	callExpression: ts.CallExpression,
): void {
	const defaultValue = callExpression.arguments[0];
	const members = callExpression.arguments[1];
	if (defaultValue === undefined || !ts.isStringLiteralLike(defaultValue)) {
		state.diagnostic(defaultValue ?? callExpression, "[rovy/scribe] s.enum default must be a string literal");
	}
	if (members === undefined || !ts.isArrayLiteralExpression(members)) {
		state.diagnostic(members ?? callExpression, "[rovy/scribe] s.enum members must be an inline string array");
		return;
	}
	const values = new Set<string>();
	for (const member of members.elements) {
		if (!ts.isStringLiteralLike(member)) {
			state.diagnostic(member, "[rovy/scribe] s.enum members must be string literals");
			continue;
		}
		if (values.has(member.text)) {
			state.diagnostic(member, `[rovy/scribe] duplicate s.enum member '${member.text}'`);
		}
		values.add(member.text);
	}
	if (ts.isStringLiteralLike(defaultValue) && !values.has(defaultValue.text)) {
		state.diagnostic(defaultValue, "[rovy/scribe] s.enum default must appear in members");
	}
}

function validateFiniteNumericLiteral(
	state: TransformState,
	expression: ts.Expression,
	label: string,
): void {
	const value = numericLiteralValue(expression);
	if (value === undefined || !Number.isFinite(value)) {
		state.diagnostic(expression, `[rovy/scribe] ${label} must be a finite numeric literal`);
	}
}

function numericLiteralValue(expression: ts.Expression): number | undefined {
	if (ts.isNumericLiteral(expression)) return Number(expression.text);
	if (
		ts.isPrefixUnaryExpression(expression) &&
		(expression.operator === ts.SyntaxKind.MinusToken ||
			expression.operator === ts.SyntaxKind.PlusToken) &&
		ts.isNumericLiteral(expression.operand)
	) {
		const value = Number(expression.operand.text);
		return expression.operator === ts.SyntaxKind.MinusToken ? -value : value;
	}
	return undefined;
}

function validateSerializableScribeDefault(
	state: TransformState,
	expression: ts.Expression,
	path: ReadonlyArray<string>,
): void {
	if (
		ts.isArrowFunction(expression) ||
		ts.isFunctionExpression(expression) ||
		ts.isClassExpression(expression) ||
		ts.isBigIntLiteral(expression)
	) {
		state.diagnostic(
			expression,
			`[rovy/scribe] nonserializable default at '${path.join(".")}'`,
		);
	}
}

function buildDocumentDeclaration(
	state: TransformState,
	sourceFile: ts.SourceFile,
	name: ts.Identifier,
	initializer: ts.Expression,
): ts.Expression | undefined {
	if (!ts.isCallExpression(initializer) || !ts.isCallExpression(initializer.expression)) return undefined;
	const builder = initializer.expression;
	const exported = state.resolveDatastoreName(sourceFile, builder.expression);
	const kind =
		exported === "playerDocument"
			? "player"
			: exported === "document"
				? "keyed"
				: exported === "sharedDocument"
					? "shared"
					: undefined;
	if (kind === undefined) return undefined;
	const options = initializer.arguments[0];
	if (!options || !ts.isObjectLiteralExpression(options)) {
		state.diagnostic(initializer, `[rovy/datastore] ${exported} requires an options object`);
		return initializer;
	}
	const dataType = builder.typeArguments?.[0];
	if (dataType === undefined) {
		state.diagnostic(builder, `[rovy/datastore] ${exported} requires an explicit data type: ${exported}<Data>()({...})`);
	}
	if (exported === "document" && builder.typeArguments?.[1] === undefined) {
		state.diagnostic(builder, "[rovy/datastore] document<T, Owner>() requires an explicit owner type");
	}

	const docId = documentIdForDeclaration(state, name);
	const check = dataType !== undefined ? datastoreValidatorForType(state, sourceFile, dataType, dataType.getText(sourceFile)) : alwaysTrueValidator();
	return call(field(state.addRovyDataImport(sourceFile), "__document"), [
		obj(
			[
				prop("id", str(docId)),
				prop("kind", str(kind)),
				requiredOption(state, options, "name", initializer),
				requiredOption(state, options, "store", initializer),
				prop("key", documentKeyExpression(kind, options)),
				prop("default", requiredOptionExpression(state, options, "default", initializer)),
				prop("check", check),
				prop("migrations", propertyValue(options, "migrations") ?? arr([])),
				prop("session", documentSessionOptions(kind, options)),
				prop("lifecycle", documentLifecycleOptions(kind, options)),
				prop("debug", documentDebugOptions(options)),
			],
			true,
		),
	]);
}

function requiredOption(
	state: TransformState,
	options: ts.ObjectLiteralExpression,
	key: string,
	node: ts.Node,
): ts.PropertyAssignment {
	return prop(key, requiredOptionExpression(state, options, key, node));
}

function requiredOptionExpression(
	state: TransformState,
	options: ts.ObjectLiteralExpression,
	key: string,
	node: ts.Node,
): ts.Expression {
	const value = propertyValue(options, key);
	if (value !== undefined) return value;
	state.diagnostic(node, `[rovy/datastore] document option '${key}' is required`);
	return id("undefined");
}

function documentKeyExpression(kind: DocumentDeclarationKind, options: ts.ObjectLiteralExpression): ts.Expression {
	const key = propertyValue(options, "key");
	if (key !== undefined) return key;
	if (kind === "player") {
		const player = id("player");
		return ts.factory.createArrowFunction(
			undefined,
			undefined,
			[ts.factory.createParameterDeclaration(undefined, undefined, player)],
			undefined,
			ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			call(id("tostring"), [field(player, "UserId")]),
		);
	}
	if (kind === "shared") return arrow(str("global"));
	return id("undefined");
}

function nestedOption(options: ts.ObjectLiteralExpression, parent: string, key: string): ts.Expression | undefined {
	const parentValue = propertyValue(options, parent);
	return parentValue && ts.isObjectLiteralExpression(parentValue) ? propertyValue(parentValue, key) : undefined;
}

function documentSessionOptions(kind: DocumentDeclarationKind, options: ts.ObjectLiteralExpression): ts.ObjectLiteralExpression {
	return obj(
		[
			prop("lock", nestedOption(options, "session", "lock") ?? bool(kind !== "shared")),
			prop("stealOnSessionLocked", nestedOption(options, "session", "stealOnSessionLocked") ?? bool(kind === "player")),
		],
		true,
	);
}

function documentLifecycleOptions(kind: DocumentDeclarationKind, options: ts.ObjectLiteralExpression): ts.ObjectLiteralExpression {
	return obj(
		[
			prop("autoOpen", nestedOption(options, "lifecycle", "autoOpen") ?? bool(kind === "player")),
			prop("autoClose", nestedOption(options, "lifecycle", "autoClose") ?? bool(kind === "player")),
			prop("kickOnOpenFailure", nestedOption(options, "lifecycle", "kickOnOpenFailure") ?? bool(kind === "player")),
		],
		true,
	);
}

function documentDebugOptions(options: ts.ObjectLiteralExpression): ts.ObjectLiteralExpression {
	return obj(
		[
			prop("printLifecycle", nestedOption(options, "debug", "printLifecycle") ?? bool(false)),
			prop("printWrites", nestedOption(options, "debug", "printWrites") ?? bool(false)),
		],
		true,
	);
}

function documentIdForDeclaration(state: TransformState, node: ts.Node): string {
	const name = ts.isIdentifier(node) ? node.text : node.getText();
	return `${state.stableIdForNode(node)}/${name}`;
}

function dirname(value: string): string {
	return value.replace(/\/[^/]+$/, "");
}

function createVisitor(
	state: TransformState,
	sourceFile: ts.SourceFile,
	widgetCallers: ReadonlyMap<string, WidgetCallerInfo>,
	freeQueryStatements: ts.Statement[],
): ts.Visitor {
	const visitor: ts.Visitor = (node) => {
		if (ts.isCallExpression(node)) {
			const rewritten = transformCall(state, sourceFile, node, visitor, widgetCallers, freeQueryStatements);
			if (rewritten) return rewritten;
		}
		if (ts.isJsxElement(node)) {
			return transformJsxElement(state, sourceFile, node, visitor);
		}
		if (ts.isJsxSelfClosingElement(node)) {
			return transformJsxSelfClosingElement(state, sourceFile, node, visitor);
		}
		if (ts.isJsxFragment(node)) {
			return transformJsxFragment(state, sourceFile, node, visitor);
		}
		return ts.visitEachChild(node, visitor, state.context);
	};
	return visitor;
}

function transformCall(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	visitor: ts.Visitor,
	widgetCallers: ReadonlyMap<string, WidgetCallerInfo>,
	freeQueryStatements: ts.Statement[],
): ts.Expression | undefined {
	const coreName = state.resolveCoreName(sourceFile, node.expression);
	if (coreName === "trait") {
		const typeArg = node.typeArguments?.[0];
		if (!typeArg) {
			state.diagnostic(node, "trait<T>() requires one type argument");
			return node;
		}
		return call(field(state.addRovyImport(sourceFile), "traitToken"), [str(state.stableIdForTypeNode(typeArg))]);
	}

	if (coreName === "query") {
		const query = buildQueryFromMacro(state, node, state.nextQueryCallsiteKey(node));
		freeQueryStatements.push(regQuery(state.addRovyImport(sourceFile), query.descriptor));
		return str(query.id);
	}

	if (coreName === "$collectRef") {
		state.diagnostic(node, "$collectRef<T>() is only supported as a @resource field initializer");
		return node;
	}

	if (isNetFunctionCallExpression(state, sourceFile, node)) {
		return ts.factory.updateCallExpression(
			node,
			node.expression,
			node.typeArguments,
			[
				...node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg),
				str(state.nextNetCallsiteKey(node)),
			],
		);
	}
	if (isScribeCommandCallExpression(state, sourceFile, node)) {
		return ts.factory.updateCallExpression(
			node,
			node.expression,
			node.typeArguments,
			[
				...node.arguments.map((arg) =>
					ts.visitNode(arg, visitor, ts.isExpression) ?? arg),
				str(state.nextNetCallsiteKey(node)),
			],
		);
	}

	const retainedUiName = state.resolveRetainedUiName(sourceFile, node.expression);
	if (retainedUiName === "child") {
		validateChildComponent(state, sourceFile, node);
		return appendOptionsCallsite(state, node, visitor, 2);
	}
	if (retainedUiName === "fragment") {
		return appendOptionsCallsite(state, node, visitor, 1);
	}
	if (retainedUiName === "portal") {
		return appendOptionsCallsite(state, node, visitor, 2);
	}
	if (retainedUiName === "native") {
		return appendOptionsCallsite(state, node, visitor, 3);
	}
	if (retainedUiName && RETAINED_UI_FACTORIES.has(retainedUiName)) {
		return addPropsCallsite(state, node, visitor);
	}

	if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "loadPaths") {
		if (state.isRovyValue(sourceFile, node.expression.expression)) {
			const rovyExpr = node.expression.expression;
			return ts.factory.updateCallExpression(
				node,
				node.expression,
				node.typeArguments,
				node.arguments.map((arg) => {
					if (ts.isStringLiteral(arg)) {
						const lowered = state.lowerLoadPath(arg);
						if (state.isRovyPluginSourceRoot(arg.text)) {
							return call(field(rovyExpr, "pluginRoot"), [lowered]);
						}
						return lowered;
					}
					return ts.visitNode(arg, visitor, ts.isExpression) ?? arg;
				}),
			);
		}
	}

	const uiName = state.resolveUiName(sourceFile, node.expression);
	if (uiName === "StyleScope" || uiName === "withStyleScope") {
		return call(field(state.addRovyUiImport(sourceFile), "__withStyleScope"), [
			str(state.nextWidgetCallsiteKey(node)),
			...node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg),
		]);
	}

	if (uiName === "scope") {
		return call(field(state.addRovyUiImport(sourceFile), "__scope"), [
			str(state.nextWidgetCallsiteKey(node)),
			...node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg),
		]);
	}

	const keyedHelper = uiName ? UI_KEYED_HELPERS.get(uiName) : undefined;
	if (keyedHelper) {
		return call(field(state.addRovyUiImport(sourceFile), keyedHelper), [
			str(state.nextWidgetCallsiteKey(node)),
			...node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg),
		]);
	}

	if (uiName && state.uiExportHasWidgetTag(sourceFile, uiName)) {
		const visitedExpr = ts.visitNode(node.expression, visitor, ts.isExpression) ?? node.expression;
		const visitedArgs = node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg);
		return call(field(state.addRovyUiImport(sourceFile), "__scope"), [
			str(state.nextWidgetCallsiteKey(node)),
			arrow(call(visitedExpr, visitedArgs)),
		]);
	}

	if (ts.isIdentifier(node.expression)) {
		const widget = widgetCallers.get(node.expression.text);
		if (widget) {
			const visitedArgs = node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg);
			return call(field(state.addRovyUiImport(sourceFile), "__scope"), [
				str(state.nextWidgetCallsiteKey(node)),
				arrow(call(node.expression, visitedArgs)),
			]);
		}
	}

	return undefined;
}

function appendOptionsCallsite(
	state: TransformState,
	node: ts.CallExpression,
	visitor: ts.Visitor,
	optionsIndex: number,
): ts.Expression {
	const args = node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg);
	while (args.length < optionsIndex) args.push(id("undefined"));
	args[optionsIndex] = optionsWithCallsite(state, node, args[optionsIndex]);
	return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args);
}

function addPropsCallsite(state: TransformState, node: ts.CallExpression, visitor: ts.Visitor): ts.Expression {
	const args = node.arguments.map((arg) => ts.visitNode(arg, visitor, ts.isExpression) ?? arg);
	args[0] = propsWithCallsite(state, node, args[0]);
	return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args);
}

function propsWithCallsite(state: TransformState, node: ts.Node, propsExpr?: ts.Expression): ts.Expression {
	const callsite = prop("__callsite", str(state.nextUiCallsiteKey(node)));
	if (propsExpr === undefined) return obj([callsite], false);
	if (ts.isObjectLiteralExpression(propsExpr)) {
		return obj([...propsExpr.properties, callsite], false);
	}
	if (propsExpr.kind === ts.SyntaxKind.UndefinedKeyword) return obj([callsite], false);
	return obj([ts.factory.createSpreadAssignment(propsExpr), callsite], false);
}

function optionsWithCallsite(state: TransformState, node: ts.Node, optionsExpr?: ts.Expression): ts.Expression {
	const callsite = prop("__callsite", str(state.nextUiCallsiteKey(node)));
	if (optionsExpr === undefined) return obj([callsite], false);
	if (ts.isObjectLiteralExpression(optionsExpr)) {
		return obj([...optionsExpr.properties, callsite], false);
	}
	if (optionsExpr.kind === ts.SyntaxKind.UndefinedKeyword) return obj([callsite], false);
	return obj([ts.factory.createSpreadAssignment(optionsExpr), callsite], false);
}

function transformJsxSelfClosingElement(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.JsxSelfClosingElement,
	visitor: ts.Visitor,
): ts.Expression {
	return transformJsxTag(state, sourceFile, node, visitor, node.tagName, node.attributes, []);
}

function transformJsxElement(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.JsxElement,
	visitor: ts.Visitor,
): ts.Expression {
	return transformJsxTag(
		state,
		sourceFile,
		node,
		visitor,
		node.openingElement.tagName,
		node.openingElement.attributes,
		jsxChildren(state, sourceFile, node.children, visitor),
	);
}

function transformJsxFragment(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.JsxFragment,
	visitor: ts.Visitor,
): ts.Expression {
	const rovyUi = state.addRovyRetainedUiImport(sourceFile);
	return call(field(rovyUi, "fragment"), [
		arr(jsxChildren(state, sourceFile, node.children, visitor), true),
		obj([prop("__callsite", str(state.nextUiCallsiteKey(node)))], false),
	]);
}

function transformJsxTag(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	visitor: ts.Visitor,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: readonly ts.Expression[],
): ts.Expression {
	const rovyUi = state.addRovyRetainedUiImport(sourceFile);
	const propsExpr = jsxProps(state, attributes, visitor, children);
	const options = obj([prop("__callsite", str(state.nextUiCallsiteKey(node))), ...jsxKeyOption(attributes)], false);
	if (ts.isIdentifier(tagName) && isComponentJsxTag(tagName)) {
		validateComponentExpression(state, sourceFile, tagName);
		return call(field(rovyUi, "child"), [tagName, propsExpr, options]);
	}
	return call(field(rovyUi, "native"), [
		str(jsxNativeClassName(tagName.getText(sourceFile))),
		propsExpr,
		arr(children, true),
		options,
	]);
}

function jsxProps(
	state: TransformState,
	attributes: ts.JsxAttributes,
	visitor: ts.Visitor,
	children: readonly ts.Expression[],
): ts.Expression {
	const props: Array<ts.ObjectLiteralElementLike> = [];
	for (const attr of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attr)) {
			props.push(ts.factory.createSpreadAssignment(ts.visitNode(attr.expression, visitor, ts.isExpression) ?? attr.expression));
			continue;
		}
		const name = jsxAttributeName(state, attr.name);
		if (name === "key") continue;
		if (attr.initializer === undefined) {
			props.push(prop(name, bool(true)));
		} else if (ts.isStringLiteral(attr.initializer)) {
			props.push(prop(name, str(attr.initializer.text)));
		} else if (ts.isJsxExpression(attr.initializer)) {
			const expr = attr.initializer.expression;
			props.push(prop(name, expr ? ts.visitNode(expr, visitor, ts.isExpression) ?? expr : id("undefined")));
		}
	}
	if (children.length > 0) props.push(prop("children", arr(children, true)));
	return obj(props, props.length > 3);
}

function jsxChildren(
	state: TransformState,
	sourceFile: ts.SourceFile,
	children: ts.NodeArray<ts.JsxChild>,
	visitor: ts.Visitor,
): ts.Expression[] {
	const out: ts.Expression[] = [];
	for (const childNode of children) {
		if (ts.isJsxText(childNode)) {
			if (childNode.getText(sourceFile).replace(/\s+/g, "").length > 0) {
				state.diagnostic(childNode, "text JSX children are not supported by @rovy/ui; use textLabel(...)");
			}
			continue;
		}
		if (ts.isJsxExpression(childNode)) {
			if (childNode.expression !== undefined) {
				out.push(ts.visitNode(childNode.expression, visitor, ts.isExpression) ?? childNode.expression);
			}
			continue;
		}
		if (ts.isJsxElement(childNode)) out.push(transformJsxElement(state, sourceFile, childNode, visitor));
		else if (ts.isJsxSelfClosingElement(childNode)) out.push(transformJsxSelfClosingElement(state, sourceFile, childNode, visitor));
		else if (ts.isJsxFragment(childNode)) out.push(transformJsxFragment(state, sourceFile, childNode, visitor));
	}
	return out;
}

function jsxKeyOption(attributes: ts.JsxAttributes): ts.PropertyAssignment[] {
	for (const attr of attributes.properties) {
		if (!ts.isJsxAttribute(attr) || jsxAttributeName(undefined, attr.name) !== "key" || attr.initializer === undefined) continue;
		if (ts.isStringLiteral(attr.initializer)) return [prop("key", str(attr.initializer.text))];
		if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression !== undefined) {
			return [prop("key", attr.initializer.expression)];
		}
	}
	return [];
}

function isComponentJsxTag(tagName: ts.Identifier): boolean {
	const first = tagName.text.charAt(0);
	return first.toUpperCase() === first && first.toLowerCase() !== first;
}

function jsxAttributeName(state: TransformState | undefined, name: ts.JsxAttributeName): string {
	if (ts.isIdentifier(name)) return name.text;
	state?.diagnostic(name, "JSX namespaced attributes are not supported by @rovy/ui");
	return name.getText();
}

function jsxNativeClassName(name: string): string {
	const aliases = new Map<string, string>([
		["frame", "Frame"],
		["screenGui", "ScreenGui"],
		["billboardGui", "BillboardGui"],
		["surfaceGui", "SurfaceGui"],
		["textLabel", "TextLabel"],
		["textButton", "TextButton"],
		["imageLabel", "ImageLabel"],
		["imageButton", "ImageButton"],
		["scrollingFrame", "ScrollingFrame"],
		["canvasGroup", "CanvasGroup"],
		["textBox", "TextBox"],
		["viewportFrame", "ViewportFrame"],
		["uiListLayout", "UIListLayout"],
		["uiGridLayout", "UIGridLayout"],
		["uiPadding", "UIPadding"],
		["uiCorner", "UICorner"],
		["uiStroke", "UIStroke"],
		["uiScale", "UIScale"],
		["uiAspectRatioConstraint", "UIAspectRatioConstraint"],
		["uiSizeConstraint", "UISizeConstraint"],
	]);
	return aliases.get(name) ?? name;
}

function validateChildComponent(state: TransformState, sourceFile: ts.SourceFile, node: ts.CallExpression): void {
	const first = node.arguments[0];
	if (first !== undefined) validateComponentExpression(state, sourceFile, first);
}

function validateComponentExpression(state: TransformState, sourceFile: ts.SourceFile, expression: ts.Expression): void {
	if (!ts.isIdentifier(expression)) return;
	const symbol = state.typeChecker?.getSymbolAtLocation(expression);
	const declarations = symbol?.declarations ?? [];
	for (const declaration of declarations) {
		if (ts.isClassDeclaration(declaration) && state.classInfo.get(declaration)?.decorators.includes("ui")) return;
	}
	if (declarations.length > 0) {
		state.diagnostic(expression, `custom UI component '${expression.text}' must be an @ui class`);
	}
}

function transformClass(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
	visitor: ts.Visitor,
): ts.Statement[] {
	const decorators = getRovyDecorators(state, sourceFile, node);
	if (decorators.length === 0) {
		return [ts.visitEachChild(node, visitor, state.context)];
	}

	const queryStatements: ts.Statement[] = [];
	const afterStatements: ts.Statement[] = [];
	const rovy = state.addRovyImport(sourceFile);
	const className = node.name;
	if (!className) {
		state.diagnostic(node, "decorated classes must have a name");
		return [ts.visitEachChild(node, visitor, state.context)];
	}

	validateClass(state, node, decorators);

	const stripped = removeRovyDecorators(state, sourceFile, node);
	const uiReadyClass = decorators.some((d) => d.name === "ui") ? stripUiStaticRerender(stripped) : stripped;
	const isResource = decorators.some((d) => d.name === "resource");
	const resourceCollectRefs = isResource ? collectRefBindings(state, sourceFile, uiReadyClass) : [];
	const resourceReadyClass = isResource ? stripCollectRefInitializers(state, sourceFile, uiReadyClass) : uiReadyClass;
	const transformedClass = ts.visitEachChild(resourceReadyClass, visitor, state.context);
	const moduleId = state.stableIdForNode(node);
	const pluginBinding = resolvePluginBinding(state, sourceFile, node);
	const localModuleId =
		pluginBinding === undefined
			? moduleId
			: pluginBinding.owner.subtreeRoot
				? state.stableIdForNodeWithin(node, pluginBinding.owner.rootDir)
				: moduleId;
	const classId = classScopedId(localModuleId, className.text);

	for (const decorator of decorators) {
		switch (decorator.name) {
			case "component":
				afterStatements.push(
					regCall(rovy, "__component", [className, str(classId), buildComponentMeta(state, sourceFile, node, pluginBinding)]),
				);
				afterStatements.push(...traitImplCalls(state, rovy, node, className));
				break;
			case "collect":
				afterStatements.push(
					regCall(rovy, "__collect", [className, str(classId), buildPluginOwnerMeta(pluginBinding)].filter(isExpression)),
				);
				break;
			case "resource":
				{
					const args: ts.Expression[] = [className, str(classId)];
					const inspect = state.inspectResourcesEnabled()
						? buildResourceInspectMeta(state, sourceFile, node)
						: undefined;
					const meta = buildResourceMeta(pluginBinding, resourceCollectRefs, inspect);
					if (meta !== undefined) args.push(meta);
					afterStatements.push(
						regCall(
							rovy,
							"__resource",
							args,
						),
					);
				}
				break;
			case "inspect":
				// Soft-deprecated no-op on @resource: debug inspect metadata is now emitted
				// for every @resource via __resource. Non-resource use is rejected in validateClass.
				break;
			case "event":
				afterStatements.push(regCall(rovy, "__event", [className, buildEventMeta(decorator.args[0], pluginBinding)].filter(isExpression)));
				break;
			case "netEvent": {
				validateNetEvent(state, node, decorator);
				afterStatements.push(regCall(rovy, "__event", [className, buildEventMeta(undefined, pluginBinding)].filter(isExpression)));
				afterStatements.push(
					regCall(state.addRovyNetImport(sourceFile), "__netEvent", [
						className,
						buildNetEventMeta(state, node, decorator, classId),
					]),
				);
				break;
			}
			case "netFunction": {
				validateNetFunction(state, node, decorator);
				afterStatements.push(
					regCall(state.addRovyNetImport(sourceFile), "__netFunction", [
						className,
						buildNetFunctionMeta(state, node, decorator, classId),
					]),
				);
				break;
			}
			case "scribeCommand": {
				validateScribeCommand(state, node, decorator);
				afterStatements.push(
					regCall(state.addRovyScribeImport(sourceFile), "__command", [
						className,
						buildScribeCommandMeta(state, node, decorator, classId),
					]),
				);
				break;
			}
			case "scribeEvent": {
				validateScribeEvent(state, sourceFile, node, decorator);
				afterStatements.push(
					regCall(
						rovy,
						"__event",
						[className, buildEventMeta(undefined, pluginBinding)].filter(isExpression),
					),
				);
				afterStatements.push(
					regCall(state.addRovyScribeImport(sourceFile), "__event", [
						className,
						buildScribeEventMeta(state, node, decorator, classId),
					]),
				);
				break;
			}
			case "system": {
				const method = methodNamed(node, "run");
				const params = method ? lowerParams(state, sourceFile, method.parameters, { kind: "system", classId }) : emptyParams();
				queryStatements.push(...params.queryStatements);
				afterStatements.push(
					regCall(rovy, "__system", [className, buildSystemMeta(state, decorator, classId, params, pluginBinding)]),
				);
				break;
			}
			case "observer": {
				const eventExpr = decoratorObjectValue(decorator, "event");
				if (!eventExpr) state.diagnostic(decorator.node, "@observer requires an event option");
				const method = methodNamed(node, "run");
				const params = method
					? lowerParams(state, sourceFile, method.parameters, { kind: "observer", classId, eventExpr })
					: emptyParams();
				queryStatements.push(...params.queryStatements);
				afterStatements.push(
					regCall(rovy, "__observer", [className, buildObserverMeta(state, decorator, params, pluginBinding)]),
				);
				break;
			}
			case "monitor": {
				const match = buildMonitorMatch(state, sourceFile, decorator, classId);
				if (match) queryStatements.push(regCall(rovy, "__query", [match.descriptor]));
				const methods = monitorMethods(node);
				const params = lowerMonitorParams(state, sourceFile, node, methods, match, classId);
				queryStatements.push(...params.queryStatements);
				afterStatements.push(
					regCall(
						rovy,
						"__monitor",
						[className, buildMonitorMeta(match?.id ?? `${classId}:match`, methods, params, pluginBinding)],
					),
				);
				break;
			}
			case "view": {
				const method = methodNamed(node, "render");
				const params = method ? lowerViewParams(state, sourceFile, method.parameters, classId) : emptyParams();
				queryStatements.push(...params.queryStatements);
				afterStatements.push(
					regCall(state.addRovyVideImport(sourceFile), "__view", [
						className,
						buildViewMeta(state, decorator, classId, params),
					]),
				);
				break;
			}
			case "ui": {
				const method = methodNamed(node, "render");
				const params = method ? lowerUiParams(state, sourceFile, method.parameters, classId) : emptyParams();
				const triggers = lowerUiTriggers(state, sourceFile, node, classId);
				queryStatements.push(...params.queryStatements, ...triggers.queryStatements);
				afterStatements.push(
					regCall(state.addRovyRetainedUiImport(sourceFile), "__ui", [
						className,
						buildUiMeta(classId, params, triggers.descriptor),
					]),
				);
				break;
			}
			case "prefab": {
				const method = methodNamed(node, "build");
				const params = method
					? lowerPrefabParams(state, sourceFile, method.parameters, classId)
					: emptyParams();
				afterStatements.push(regCall(rovy, "__prefab", [className, buildPrefabMeta(classId, params, pluginBinding)]));
				break;
			}
			case "relation":
				afterStatements.push(regCall(rovy, "__relation", [className, buildRelationMeta(decorator, pluginBinding)]));
				break;
			case "schedule":
				afterStatements.push(regCall(rovy, "__schedule", [className, buildScheduleMeta(decorator, pluginBinding)]));
				break;
			case "set":
				break;
			case "plugin":
				afterStatements.push(regCall(rovy, "__plugin", [className, buildPluginMeta(state, node)]));
				break;
		}
	}

	const boundary = systemBoundary(decorators);
	if (boundary) {
		if (boundary === "shared") {
			return [
				...queryStatements,
				transformedClass,
				regCall(rovy, "__boundary", [className, str(boundary)]),
				...afterStatements,
			];
		}
		return [
			transformedClass,
			regCall(rovy, "__boundary", [className, str(boundary)]),
			boundaryGuardStatement(boundary, [...queryStatements, ...afterStatements]),
		];
	}
	return [...queryStatements, transformedClass, ...afterStatements];
}

function getRovyDecorators(state: TransformState, sourceFile: ts.SourceFile, node: ts.ClassDeclaration): DecoratorInfo[] {
	const out: DecoratorInfo[] = [];
	for (const decorator of ts.getDecorators(node) ?? []) {
		const name = decoratorName(state, sourceFile, decorator);
		if (!name || !DECORATORS.has(name)) continue;
		const expression = decorator.expression;
		out.push({
			name,
			node: decorator,
			args: ts.isCallExpression(expression) ? [...expression.arguments] : [],
		});
	}
	return out;
}

function resolvePluginBinding(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
): PluginBinding | undefined {
	const owner = state.resolvePluginOwner(node);
	if (owner === undefined) return undefined;
	const expr = state.pluginOwnerExpr(sourceFile, owner, node);
	if (expr === undefined) return undefined;
	return { owner, expr };
}

function collectWidgetCallers(state: TransformState, sourceFile: ts.SourceFile): Map<string, WidgetCallerInfo> {
	const implementations = new Map<string, ts.FunctionDeclaration>();
	for (const statement of sourceFile.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
			implementations.set(statement.name.text, statement);
		}
	}

	const out = new Map<string, WidgetCallerInfo>();
	for (const statement of sourceFile.statements) {
		if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
		if (!hasWidgetTag(statement)) continue;

		const implementation = statement.body ? statement : implementations.get(statement.name.text);
		if (implementation === undefined) {
			state.diagnostic(statement, `@widget caller '${statement.name.text}' requires a same-file implementation`);
			continue;
		}
		out.set(statement.name.text, {
			implementation,
			hasStyleParam: hasLeadingStyleParam(state, sourceFile, implementation),
		});
	}
	return out;
}

function hasWidgetTag(node: ts.FunctionDeclaration): boolean {
	for (const tag of ts.getJSDocTags(node)) {
		if (tag.tagName.text === "widget") return true;
	}
	return false;
}

function transformWidgetFunction(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.FunctionDeclaration,
	visitor: ts.Visitor,
): ts.FunctionDeclaration {
	if (!node.body) return node;
	const hasStyleParam = hasLeadingStyleParam(state, sourceFile, node);
	const params = hasStyleParam ? node.parameters.slice(1) : node.parameters;
	const body = hasStyleParam
		? ts.factory.updateBlock(node.body, [activeStyleStatement(state, sourceFile), ...node.body.statements])
		: node.body;
	const updated = ts.factory.updateFunctionDeclaration(
		node,
		node.modifiers,
		node.asteriskToken,
		node.name,
		node.typeParameters,
		params,
		node.type,
		body,
	);
	return ts.visitEachChild(updated, visitor, state.context);
}

function activeStyleStatement(state: TransformState, sourceFile: ts.SourceFile): ts.VariableStatement {
	return ts.factory.createVariableStatement(
		undefined,
		ts.factory.createVariableDeclarationList(
			[
				ts.factory.createVariableDeclaration(
					id("style"),
					undefined,
					undefined,
					call(field(state.addRovyUiImport(sourceFile), "getActiveStyle")),
				),
			],
			ts.NodeFlags.Const,
		),
	);
}

function removeRovyDecorators(state: TransformState, sourceFile: ts.SourceFile, node: ts.ClassDeclaration): ts.ClassDeclaration {
	const modifiers = node.modifiers?.filter((modifier) => {
		if (!ts.isDecorator(modifier)) return true;
		const name = decoratorName(state, sourceFile, modifier);
		return name === undefined || !DECORATORS.has(name);
	});
	return ts.factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
}

function validateClass(state: TransformState, node: ts.ClassDeclaration, decorators: readonly DecoratorInfo[]): void {
	const boundaries = decorators.filter((d) => d.name === "server" || d.name === "client" || d.name === "shared");
	if (boundaries.length > 1) {
		state.diagnostic(node, "@server, @client, and @shared are mutually exclusive");
	}
	const requiresBoundary = decorators.some(
		(d) => RUNTIME_DECORATORS.has(d.name) && !SHARED_BY_DEFAULT_DECORATORS.has(d.name),
	);
	if (requiresBoundary && state.isInRovyPluginSourceRoot(node.getSourceFile()) && boundaries.length !== 1) {
		state.diagnostic(node, "runtime declarations inside a .rovy.plugin.json root require exactly one of @server, @client, or @shared");
	}

	if (node.typeParameters && decorators.some((d) => d.name === "system" || d.name === "observer" || d.name === "monitor")) {
		state.diagnostic(node, "@system/@observer/@monitor classes cannot be generic in v1");
	}

	const zeroArgDecorated = decorators.find(
		(d) => d.name === "resource" || d.name === "collect" || d.name === "prefab" || d.name === "inspect",
	);
	if (zeroArgDecorated) {
		const ctor = node.members.find(ts.isConstructorDeclaration);
		for (const param of ctor?.parameters ?? []) {
			if (!param.questionToken && !param.initializer) {
				state.diagnostic(param, `@${zeroArgDecorated.name} constructor params must be optional or defaulted`);
			}
		}
	}

	if (decorators.some((d) => d.name === "system" || d.name === "observer") && !methodNamed(node, "run")) {
		state.diagnostic(node, "@system/@observer classes require run(...)");
	}

	if (decorators.some((d) => d.name === "prefab") && !methodNamed(node, "build")) {
		state.diagnostic(node, "@prefab classes require a build(...) method");
	}

	if (decorators.some((d) => d.name === "view") && !methodNamed(node, "render")) {
		state.diagnostic(node, "@view classes require render(...)");
	}

	if (decorators.some((d) => d.name === "ui") && !methodNamed(node, "render")) {
		state.diagnostic(node, "@ui classes require render(...)");
	}

	if (decorators.some((d) => d.name === "netEvent") && decorators.some((d) => d.name === "event")) {
		state.diagnostic(node, "@netEvent implies @event; remove the extra @event decorator");
	}
	if (decorators.some((d) => d.name === "scribeEvent") && decorators.some((d) => d.name === "event")) {
		state.diagnostic(node, "@scribeEvent implies @event; remove the extra @event decorator");
	}

	if (decorators.some((d) => d.name === "inspect") && !decorators.some((d) => d.name === "resource")) {
		state.diagnostic(node, "@inspect can only be used on @resource classes");
	}
}

function systemBoundary(decorators: readonly DecoratorInfo[]): "server" | "client" | "shared" | undefined {
	if (decorators.some((d) => d.name === "server")) return "server";
	if (decorators.some((d) => d.name === "client")) return "client";
	if (decorators.some((d) => d.name === "shared")) return "shared";
	return undefined;
}

function boundaryGuardStatement(boundary: "server" | "client", statements: readonly ts.Statement[]): ts.IfStatement {
	return ts.factory.createIfStatement(
		call(
			field(call(field(id("game"), "GetService"), [str("RunService")]), boundary === "server" ? "IsServer" : "IsClient"),
		),
		ts.factory.createBlock([...statements], true),
	);
}

function collectRefBindings(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
): ts.ObjectLiteralExpression[] {
	const refs: ts.ObjectLiteralExpression[] = [];
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member) || member.initializer === undefined) continue;
		if (!ts.isCallExpression(member.initializer)) continue;
		if (state.resolveCoreName(sourceFile, member.initializer.expression) !== "$collectRef") continue;

		const key = member.name ? propertyNameText(member.name) : undefined;
		if (key === undefined) {
			state.diagnostic(member, "$collectRef<T>() fields must use an identifier, string, or number property name");
			continue;
		}

		const typeArg = member.initializer.typeArguments?.[0];
		if (!typeArg || member.initializer.typeArguments?.length !== 1) {
			state.diagnostic(member.initializer, "$collectRef<T>() requires exactly one type argument");
			continue;
		}
		if (!ts.isTypeReferenceNode(typeArg)) {
			state.diagnostic(member.initializer, "$collectRef<T>() type argument must name an @collect class");
			continue;
		}
		if (!state.hasDecoratorOnTypeNode(typeArg, "collect")) {
			state.diagnostic(member.initializer, "$collectRef<T>() requires T to be an @collect class");
			continue;
		}

		refs.push(obj([prop("key", str(key)), prop("ctor", entityNameToExpression(typeArg.typeName))], false));
	}
	return refs;
}

function stripCollectRefInitializers(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
): ts.ClassDeclaration {
	const members = node.members.map((member) => {
		if (!ts.isPropertyDeclaration(member) || member.initializer === undefined) return member;
		if (!ts.isCallExpression(member.initializer)) return member;
		if (state.resolveCoreName(sourceFile, member.initializer.expression) !== "$collectRef") return member;
		const placeholderType =
			member.type ??
			member.initializer.typeArguments?.[0] ??
			ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
		const placeholder = ts.factory.createAsExpression(
			ts.factory.createAsExpression(id("undefined"), ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)),
			placeholderType,
		);
		return ts.factory.updatePropertyDeclaration(
			member,
			member.modifiers,
			member.name,
			member.questionToken,
			member.type,
			placeholder,
		);
	});
	return ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, members);
}

function stripUiStaticRerender(node: ts.ClassDeclaration): ts.ClassDeclaration {
	const members = node.members.filter((member) => {
		if (!ts.isPropertyDeclaration(member) || member.name === undefined) return true;
		if (propertyNameText(member.name) !== "rerender") return true;
		return !(member.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
	});
	return ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, members);
}

function buildSystemMeta(
	state: TransformState,
	decorator: DecoratorInfo,
	classId: string,
	params: ParamBuild,
	plugin?: PluginBinding,
): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	const schedule = propertyValue(options, "schedule");
	if (!schedule) state.diagnostic(decorator.node, "@system requires a schedule option");
	return obj(
		stripUndefinedProperties([
			prop("id", str(classId)),
			maybeProp("plugin", plugin?.expr),
			prop("schedule", schedule ?? id("undefined")),
			maybeProp("set", propertyValue(options, "set")),
			prop("after", propertyValue(options, "after") ?? arr([])),
			prop("before", propertyValue(options, "before") ?? arr([])),
			maybeProp("runIf", propertyValue(options, "runIf")),
			prop("params", params.descriptor),
		]),
		true,
	);
}

function buildObserverMeta(
	state: TransformState,
	decorator: DecoratorInfo,
	params: ParamBuild,
	plugin?: PluginBinding,
): ts.ObjectLiteralExpression {
	const eventExpr = decoratorObjectValue(decorator, "event");
	if (!eventExpr) state.diagnostic(decorator.node, "@observer requires an event option");
	return obj(
		stripUndefinedProperties([
			maybeProp("plugin", plugin?.expr),
			prop("event", eventExpr ?? id("undefined")),
			prop("priority", decoratorObjectValue(decorator, "priority") ?? num(0)),
			prop("params", params.descriptor),
		]),
		true,
	);
}

function buildMonitorMeta(
	matchId: string,
	methods: readonly MonitorMethod[],
	params: ParamBuild,
	plugin?: PluginBinding,
): ts.ObjectLiteralExpression {
	return obj(
		stripUndefinedProperties([
			maybeProp("plugin", plugin?.expr),
			prop("match", str(matchId)),
			prop("methods", arr(methods.map(str))),
			prop("params", params.descriptor),
		]),
		true,
	);
}

function buildViewMeta(
	state: TransformState,
	decorator: DecoratorInfo,
	classId: string,
	params: ParamBuild,
): ts.ObjectLiteralExpression {
	if (decoratorObjectValue(decorator, "match") !== undefined) {
		state.diagnostic(decorator.node, "@view match is not supported; declare Query<...> or ViewMonitor<...> render params instead");
	}
	if (decoratorObjectValue(decorator, "events") !== undefined) {
		state.diagnostic(decorator.node, "@view events are not supported; declare EventReader<...> render params instead");
	}
	return obj(
		stripUndefinedProperties([
			prop("id", str(classId)),
			prop("methods", arr([str("render")])),
			prop("params", params.descriptor),
		]),
		true,
	);
}

function buildUiMeta(
	classId: string,
	params: ParamBuild,
	triggers: ts.ArrayLiteralExpression,
): ts.ObjectLiteralExpression {
	return obj(
		[
			prop("id", str(classId)),
			prop("methods", arr([str("render")])),
			prop("params", params.descriptor),
			prop("triggers", triggers),
		],
		true,
	);
}

interface UiTriggerBuild {
	readonly descriptor: ts.ArrayLiteralExpression;
	readonly queryStatements: readonly ts.Statement[];
}

function lowerUiTriggers(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
	classId: string,
): UiTriggerBuild {
	const property = staticPropertyNamed(node, "rerender");
	if (property === undefined) return { descriptor: arr([], false), queryStatements: [] };
	if (property.initializer === undefined) {
		state.diagnostic(property, "@ui static rerender must be initialized to a trigger array");
		return { descriptor: arr([], false), queryStatements: [] };
	}
	if (!ts.isArrayLiteralExpression(property.initializer)) {
		state.diagnostic(property.initializer, "@ui static rerender must be a trigger array");
		return { descriptor: arr([], false), queryStatements: [] };
	}
	const triggers: ts.ObjectLiteralExpression[] = [];
	const queryStatements: ts.Statement[] = [];
	property.initializer.elements.forEach((element, index) => {
		if (!ts.isCallExpression(element)) {
			state.diagnostic(element, "@ui rerender entries must be trigger helper calls");
			return;
		}
		const lowered = lowerUiTrigger(state, sourceFile, node, element, `${classId}:rerender:${index}`);
		triggers.push(lowered.descriptor);
		queryStatements.push(...lowered.queryStatements);
	});
	return { descriptor: arr(triggers, true), queryStatements };
}

function lowerUiTrigger(
	state: TransformState,
	sourceFile: ts.SourceFile,
	classNode: ts.ClassDeclaration,
	callExpr: ts.CallExpression,
	triggerId: string,
): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[] } {
	const name = state.resolveRetainedUiName(sourceFile, callExpr.expression);
	if (name === "$queryTrigger") {
		const query = buildQuery(state, callExpr.typeArguments?.[0], [...(callExpr.typeArguments ?? [])].slice(1), triggerId, callExpr);
		const options = objectArgFromExpression(callExpr.arguments[0]);
		const entities = propertyValue(options, "entities");
		validateUiEntityBinding(state, sourceFile, classNode, entities, "$queryTrigger entities");
		return {
			descriptor: obj(
				stripUndefinedProperties([
					prop("kind", str("query")),
					prop("handle", str(query.id)),
					maybeProp("entities", lowerUiBinding(state, sourceFile, entities)),
					prop("on", triggerOnArray(options)),
				]),
				false,
			),
			queryStatements: [regQuery(state.addRovyImport(sourceFile), query.descriptor)],
		};
	}
	if (name === "$componentTrigger") {
		const ctor = callExpr.arguments[0] ?? id("undefined");
		const options = objectArgFromExpression(callExpr.arguments[1]);
		return {
			descriptor: obj(
				stripUndefinedProperties([
					prop("kind", str("component")),
					prop("ctor", ctor),
					maybeProp("entity", lowerUiBinding(state, sourceFile, propertyValue(options, "entity"))),
					prop("on", triggerOnArray(options)),
				]),
				false,
			),
			queryStatements: [],
		};
	}
	if (name === "$resourceTrigger") {
		return {
			descriptor: obj([prop("kind", str("resource")), prop("ctor", callExpr.arguments[0] ?? id("undefined"))], false),
			queryStatements: [],
		};
	}
	if (name === "$eventTrigger") {
		return {
			descriptor: obj([prop("kind", str("event")), prop("ctor", callExpr.arguments[0] ?? id("undefined"))], false),
			queryStatements: [],
		};
	}
	if (name === "$relationTrigger") {
		const ctor = callExpr.arguments[0] ?? id("undefined");
		const options = objectArgFromExpression(callExpr.arguments[1]);
		return {
			descriptor: obj(
				stripUndefinedProperties([
					prop("kind", str("relation")),
					prop("ctor", ctor),
					maybeProp("source", lowerUiBinding(state, sourceFile, propertyValue(options, "source"))),
					maybeProp("target", lowerUiBinding(state, sourceFile, propertyValue(options, "target"))),
					prop("on", triggerOnArray(options)),
				]),
				false,
			),
			queryStatements: [],
		};
	}
	if (name === "$lifecycleTrigger") {
		const options = objectArgFromExpression(callExpr.arguments[1]);
		return {
			descriptor: obj(
				stripUndefinedProperties([
					prop("kind", str("lifecycle")),
					prop("lifecycleKind", callExpr.arguments[0] ?? id("undefined")),
					maybeProp("ctor", propertyValue(options, "ctor")),
				]),
				false,
			),
			queryStatements: [],
		};
	}
	if (name === "$propsTrigger") {
		return { descriptor: obj([prop("kind", str("props"))], false), queryStatements: [] };
	}
	state.diagnostic(callExpr, "@ui rerender entries must use @rovy/ui $ trigger helpers");
	return { descriptor: obj([prop("kind", str("props"))], false), queryStatements: [] };
}

function lowerUiBinding(
	state: TransformState,
	sourceFile: ts.SourceFile,
	expression: ts.Expression | undefined,
): ts.ObjectLiteralExpression | undefined {
	if (expression === undefined) return undefined;
	const name = ts.isCallExpression(expression) ? state.resolveRetainedUiName(sourceFile, expression.expression) : undefined;
	if (ts.isCallExpression(expression) && name === "$prop") {
		const key = expression.arguments[0];
		if (key !== undefined && ts.isStringLiteral(key)) {
			return obj([prop("kind", str("prop")), prop("key", str(key.text))], false);
		}
		state.diagnostic(expression, "$prop(...) trigger bindings require a string key");
	}
	return obj([prop("kind", str("value")), prop("value", expression)], false);
}

function validateUiEntityBinding(
	state: TransformState,
	sourceFile: ts.SourceFile,
	classNode: ts.ClassDeclaration | undefined,
	expression: ts.Expression | undefined,
	label: string,
): void {
	if (expression === undefined || state.typeChecker === undefined) return;
	const name = ts.isCallExpression(expression) ? state.resolveRetainedUiName(sourceFile, expression.expression) : undefined;
	if (ts.isCallExpression(expression) && name === "$prop") {
		const key = expression.arguments[0];
		if (key === undefined || !ts.isStringLiteral(key)) return;
		const explicitType = expression.typeArguments?.[0];
		if (explicitType !== undefined && !isEntityOrEntityListType(state, state.typeChecker.getTypeFromTypeNode(explicitType))) {
			state.diagnostic(expression, `${label} $prop('${key.text}') must be typed as Entity or readonly Entity[]`);
			return;
		}
		if (classNode !== undefined) {
			const propType = uiPropsPropertyType(state, classNode, key.text, expression);
			if (propType === undefined) {
				state.diagnostic(expression, `${label} references unknown prop '${key.text}'`);
			} else if (!isEntityOrEntityListType(state, propType)) {
				state.diagnostic(expression, `${label} prop '${key.text}' must be Entity or readonly Entity[]`);
			}
		}
		return;
	}
	const type = state.typeChecker.getTypeAtLocation(expression);
	if (!isEntityOrEntityListType(state, type)) {
		state.diagnostic(expression, `${label} must be an Entity or readonly Entity[] binding`);
	}
}

function isEntityOrEntityListType(state: TransformState, type: ts.Type): boolean {
	if (state.typeChecker === undefined) return true;
	if (type.isUnion()) {
		const parts = type.types.filter((part) => (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void | ts.TypeFlags.Never)) === 0);
		return parts.length > 0 && parts.every((part) => isEntityOrEntityListType(state, part));
	}
	return isEntityTsType(state, type) || isEntityListType(state, type);
}

function isEntityTsType(state: TransformState, type: ts.Type): boolean {
	if (state.typeChecker === undefined) return true;
	const checker = state.typeChecker;
	if (type.getProperty("__nominal_Entity") !== undefined) return true;
	const text = checker.typeToString(type);
	if (text === "Entity" || text.startsWith("Entity<")) return true;
	return false;
}

function isEntityListType(state: TransformState, type: ts.Type): boolean {
	if (state.typeChecker === undefined) return true;
	const checker = state.typeChecker;
	const typedChecker = checker as ts.TypeChecker & {
		isArrayType?: (target: ts.Type) => boolean;
		isTupleType?: (target: ts.Type) => boolean;
		getElementTypeOfArrayType?: (target: ts.Type) => ts.Type | undefined;
	};
	if (typedChecker.isArrayType?.(type) === true || typedChecker.isTupleType?.(type) === true) {
		const element = typedChecker.getElementTypeOfArrayType?.(type) ?? checker.getIndexTypeOfType(type, ts.IndexKind.Number);
		return element !== undefined && isEntityTsType(state, element);
	}
	const text = checker.typeToString(type);
	if (/\b(?:ReadonlyArray|Array)<Entity(?:<[^>]+>)?>/.test(text) || /\breadonly Entity(?:<[^>]+>)?\[\]/.test(text) || /\bEntity(?:<[^>]+>)?\[\]/.test(text)) {
		return true;
	}
	return false;
}

function uiPropsPropertyType(
	state: TransformState,
	classNode: ts.ClassDeclaration,
	key: string,
	location: ts.Node,
): ts.Type | undefined {
	const checker = state.typeChecker;
	if (checker === undefined) return undefined;
	for (const member of classNode.members) {
		if (ts.isConstructorDeclaration(member)) {
			for (const param of member.parameters) {
				if (!ts.isIdentifier(param.name) || param.name.text !== "props") continue;
				const prop = checker.getTypeAtLocation(param).getProperty(key);
				if (prop !== undefined) return checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? location);
			}
		}
		if (ts.isPropertyDeclaration(member) && propertyNameText(member.name) === "props") {
			const prop = checker.getTypeAtLocation(member).getProperty(key);
			if (prop !== undefined) return checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? location);
		}
	}
	return undefined;
}

function triggerOnArray(options: ts.ObjectLiteralExpression | undefined): ts.Expression {
	const on = propertyValue(options, "on");
	return on ?? arr([str("added"), str("changed"), str("removed")]);
}

function objectArgFromExpression(expression: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
	return expression !== undefined && ts.isObjectLiteralExpression(expression) ? expression : undefined;
}

function buildRelationMeta(decorator: DecoratorInfo, plugin?: PluginBinding): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	return obj(
		stripUndefinedProperties([
			maybeProp("plugin", plugin?.expr),
			prop("exclusive", propertyValue(options, "exclusive") ?? bool(false)),
			prop("onTargetDelete", propertyValue(options, "onTargetDelete") ?? str("none")),
			prop("onDelete", propertyValue(options, "onDelete") ?? str("none")),
		]),
		true,
	);
}

function buildResourceMeta(
	plugin: PluginBinding | undefined,
	collectorRefs: readonly ts.ObjectLiteralExpression[],
	inspect?: ts.ObjectLiteralExpression,
): ts.ObjectLiteralExpression | undefined {
	const properties = stripUndefinedProperties([
		maybeProp("plugin", plugin?.expr),
		collectorRefs.length > 0 ? prop("collectorRefs", arr(collectorRefs, true)) : undefined,
		maybeProp("inspect", inspect),
	]);
	return properties.length > 0 ? obj(properties, true) : undefined;
}

function buildResourceInspectMeta(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
): ts.ObjectLiteralExpression {
	const fields: ts.ObjectLiteralExpression[] = [];
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member)) continue;
		if (isPrivateProtectedOrStatic(member)) continue;
		if (isFunctionLikeResourceField(member)) continue;
		const key = member.name ? propertyNameText(member.name) : undefined;
		if (key === undefined) {
			state.diagnostic(member, "@inspect resource fields must use an identifier, string, or number property name");
			continue;
		}
		const typeLabel = resourceFieldTypeLabel(state, sourceFile, member);
		fields.push(
			obj(
				[
					prop("key", str(key)),
					prop("typeLabel", str(typeLabel)),
					prop("validator", validatorForType(state, sourceFile, member.type, member.questionToken !== undefined)),
				],
				true,
			),
		);
	}
	return obj([prop("fields", arr(fields, true))], true);
}

function isPrivateProtectedOrStatic(member: ts.PropertyDeclaration): boolean {
	return (member.modifiers ?? []).some((modifier) =>
		modifier.kind === ts.SyntaxKind.PrivateKeyword ||
		modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
		modifier.kind === ts.SyntaxKind.StaticKeyword
	);
}

function isFunctionLikeResourceField(member: ts.PropertyDeclaration): boolean {
	if (member.type !== undefined) {
		if (ts.isFunctionTypeNode(member.type)) return true;
		if (ts.isTypeReferenceNode(member.type) && lastTypeName(member.type.typeName) === "Function") return true;
	}
	const initializer = member.initializer;
	return initializer !== undefined && (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer));
}

function resourceFieldTypeLabel(
	state: TransformState,
	sourceFile: ts.SourceFile,
	member: ts.PropertyDeclaration,
): string {
	if (member.type !== undefined) return member.type.getText(sourceFile);
	if (member.initializer !== undefined) {
		const inferred = typeLabelForInitializer(member.initializer);
		if (inferred !== undefined) return inferred;
		const checker = state.typeChecker;
		const type = checker?.getTypeAtLocation(member);
		const label = type !== undefined ? checker?.typeToString(type) : undefined;
		if (label !== undefined && label !== "{}") return label;
	}
	return "unknown";
}

function typeLabelForInitializer(initializer: ts.Expression): string | undefined {
	if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) return "string";
	if (ts.isNumericLiteral(initializer)) return "number";
	if (initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
	if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) return initializer.expression.text;
	if (ts.isCallExpression(initializer) && ts.isPropertyAccessExpression(initializer.expression)) {
		const left = initializer.expression.expression;
		if (ts.isIdentifier(left)) return left.text;
	}
	return undefined;
}

function buildComponentMeta(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
	plugin?: PluginBinding,
): ts.ObjectLiteralExpression {
	return obj(
		stripUndefinedProperties([
			maybeProp("plugin", plugin?.expr),
			prop("editor", buildComponentEditorMeta(state, sourceFile, node)),
		]),
		true,
	);
}

function buildComponentEditorMeta(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
): ts.ObjectLiteralExpression {
	const ctor = node.members.find(ts.isConstructorDeclaration);
	const params = [...(ctor?.parameters ?? [])];
	const fields: ts.ObjectLiteralExpression[] = [];
	for (const param of params) {
		if (!ts.isIdentifier(param.name)) {
			state.diagnostic(param, "@component editor metadata requires constructor parameter names");
			continue;
		}
		const typeLabel = param.type?.getText(sourceFile) ?? "unknown";
		fields.push(
			obj(
				[
					prop("key", str(param.name.text)),
					prop("typeLabel", str(typeLabel)),
					prop("validator", validatorForType(state, sourceFile, param.type, param.questionToken !== undefined)),
				],
				true,
			),
		);
	}
	return obj(
		[
			prop("fields", arr(fields, true)),
			prop("constructorValidator", constructorValidatorForParams(state, sourceFile, params)),
		],
		true,
	);
}

function constructorValidatorForParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: readonly ts.ParameterDeclaration[],
): ts.Expression {
	if (!state.runtimeTypeChecksEnabled() || params.length === 0) return alwaysTrueValidator();
	const validators = params.map((param) => validatorForType(state, sourceFile, param.type, param.questionToken !== undefined));
	return call(field(state.addTImport(sourceFile), "strictArray"), validators);
}

function validatorForType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeNode | undefined,
	optional: boolean,
): ts.Expression {
	if (!state.runtimeTypeChecksEnabled() || type === undefined) return alwaysTrueValidator();
	const validator = validatorForRequiredType(state, sourceFile, type);
	if (!optional) return validator;
	return call(field(state.addTImport(sourceFile), "optional"), [validator]);
}

function validatorForRequiredType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeNode,
): ts.Expression {
	const t = state.addTImport(sourceFile);
	switch (type.kind) {
		case ts.SyntaxKind.StringKeyword:
			return field(t, "string");
		case ts.SyntaxKind.NumberKeyword:
			return field(t, "number");
		case ts.SyntaxKind.BooleanKeyword:
			return field(t, "boolean");
		case ts.SyntaxKind.ArrayType: {
			const arrayType = type as ts.ArrayTypeNode;
			return call(field(t, "array"), [validatorForType(state, sourceFile, arrayType.elementType, false)]);
		}
		case ts.SyntaxKind.TupleType: {
			const tupleType = type as ts.TupleTypeNode;
			return call(
				field(t, "strictArray"),
				tupleType.elements.map((element) => validatorForType(state, sourceFile, element, false)),
			);
		}
		case ts.SyntaxKind.UnionType: {
			const unionType = type as ts.UnionTypeNode;
			return call(
				field(t, "union"),
				unionType.types.map((item) => validatorForType(state, sourceFile, item, false)),
			);
		}
	}
	if (ts.isTypeReferenceNode(type)) {
		const name = lastTypeName(type.typeName);
		if (name === "Array" || name === "ReadonlyArray") {
			const inner = type.typeArguments?.[0];
			return call(field(t, "array"), [validatorForType(state, sourceFile, inner, false)]);
		}
		if (ROBLOX_INSTANCE_TYPES.has(name)) {
			return call(field(t, "instanceIsA"), [str(name)]);
		}
	}
	return alwaysTrueValidator();
}

const DATASTORE_UNSUPPORTED_TYPES = new Set([
	"Instance",
	"Vector3",
	"Vector2",
	"CFrame",
	"Color3",
	"UDim",
	"UDim2",
	"DateTime",
	"Map",
	"Set",
]);

function datastoreValidatorForType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeNode,
	path: string,
	seen = new Set<string>(),
): ts.Expression {
	const t = state.addTImport(sourceFile);
	switch (type.kind) {
		case ts.SyntaxKind.StringKeyword:
			return field(t, "string");
		case ts.SyntaxKind.NumberKeyword:
			return field(t, "number");
		case ts.SyntaxKind.BooleanKeyword:
			return field(t, "boolean");
		case ts.SyntaxKind.UndefinedKeyword:
			return call(field(t, "literal"), [id("undefined")]);
		case ts.SyntaxKind.AnyKeyword:
		case ts.SyntaxKind.UnknownKeyword:
		case ts.SyntaxKind.NeverKeyword:
			return unsupportedDatastoreType(state, type, path, type.getText(sourceFile));
		case ts.SyntaxKind.ArrayType: {
			const arrayType = type as ts.ArrayTypeNode;
			return call(field(t, "array"), [datastoreValidatorForType(state, sourceFile, arrayType.elementType, `${path}[]`, seen)]);
		}
		case ts.SyntaxKind.TypeLiteral:
			return datastoreObjectValidator(state, sourceFile, type as ts.TypeLiteralNode, path, seen);
		case ts.SyntaxKind.UnionType: {
			const unionType = type as ts.UnionTypeNode;
			return call(
				field(t, "union"),
				unionType.types.map((item) => datastoreValidatorForType(state, sourceFile, item, path, seen)),
			);
		}
		case ts.SyntaxKind.LiteralType:
			return datastoreLiteralValidator(state, sourceFile, type as ts.LiteralTypeNode, path);
		case ts.SyntaxKind.FunctionType:
			return unsupportedDatastoreType(state, type, path, "function");
	}
	if (ts.isTypeReferenceNode(type)) {
		const name = lastTypeName(type.typeName);
		if (DATASTORE_UNSUPPORTED_TYPES.has(name)) return unsupportedDatastoreType(state, type, path, name);
		if (name === "Array" || name === "ReadonlyArray") {
			const inner = type.typeArguments?.[0];
			if (inner === undefined) return unsupportedDatastoreType(state, type, path, `${name} without element type`);
			return call(field(t, "array"), [datastoreValidatorForType(state, sourceFile, inner, `${path}[]`, seen)]);
		}
		if (name === "Record") {
			const key = type.typeArguments?.[0];
			const value = type.typeArguments?.[1];
			if (key === undefined || value === undefined) return unsupportedDatastoreType(state, type, path, "Record without key/value types");
			const keyValidator = datastoreRecordKeyValidator(state, sourceFile, key, path);
			return call(field(t, "map"), [keyValidator, datastoreValidatorForType(state, sourceFile, value, `${path}[id]`, seen)]);
		}
		if ((type.typeArguments?.length ?? 0) > 0) return unsupportedDatastoreType(state, type, path, "generic unresolved type");
		const key = type.getText(sourceFile);
		if (seen.has(key)) return unsupportedDatastoreType(state, type, path, "recursive type");
		const declaration = typeDeclarationForTypeReference(state, type);
		if (declaration === undefined) return unsupportedDatastoreType(state, type, path, name);
		seen.add(key);
		if (ts.isTypeAliasDeclaration(declaration)) {
			const validator = datastoreValidatorForType(state, sourceFile, declaration.type, path, seen);
			seen.delete(key);
			return validator;
		}
		if (ts.isInterfaceDeclaration(declaration)) {
			if (declaration.typeParameters !== undefined && declaration.typeParameters.length > 0) {
				return unsupportedDatastoreType(state, type, path, "generic unresolved type");
			}
			const validator = datastoreInterfaceValidator(state, sourceFile, declaration, path, seen);
			seen.delete(key);
			return validator;
		}
	}
	return unsupportedDatastoreType(state, type, path, type.getText(sourceFile));
}

function datastoreRecordKeyValidator(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeNode,
	path: string,
): ts.Expression {
	const t = state.addTImport(sourceFile);
	if (type.kind === ts.SyntaxKind.StringKeyword) return field(t, "string");
	if (type.kind === ts.SyntaxKind.NumberKeyword) return field(t, "number");
	return unsupportedDatastoreType(state, type, `${path}[id]`, type.getText(sourceFile));
}

function datastoreObjectValidator(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.TypeLiteralNode,
	path: string,
	seen: Set<string>,
): ts.Expression {
	const t = state.addTImport(sourceFile);
	const properties: ts.PropertyAssignment[] = [];
	for (const member of node.members) {
		if (ts.isPropertySignature(member)) {
			const name = propertyNameText(member.name);
			if (name === undefined || member.type === undefined) {
				return unsupportedDatastoreType(state, member, path, "unsupported object property");
			}
			let validator = datastoreValidatorForType(state, sourceFile, member.type, `${path}.${name}`, seen);
			if (member.questionToken !== undefined) validator = call(field(t, "optional"), [validator]);
			properties.push(prop(name, validator));
		} else if (ts.isIndexSignatureDeclaration(member)) {
			const keyType = member.parameters[0]?.type;
			const valueType = member.type;
			if (keyType === undefined || valueType === undefined) {
				return unsupportedDatastoreType(state, member, path, "unsupported index signature");
			}
			return call(field(t, "map"), [
				datastoreRecordKeyValidator(state, sourceFile, keyType, path),
				datastoreValidatorForType(state, sourceFile, valueType, `${path}[id]`, seen),
			]);
		} else {
			return unsupportedDatastoreType(state, member, path, "unsupported object member");
		}
	}
	return call(field(t, "interface"), [obj(properties, true)]);
}

function datastoreInterfaceValidator(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.InterfaceDeclaration,
	path: string,
	seen: Set<string>,
): ts.Expression {
	return datastoreObjectValidator(
		state,
		sourceFile,
		ts.factory.createTypeLiteralNode(node.members),
		path,
		seen,
	);
}

function datastoreLiteralValidator(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.LiteralTypeNode,
	path: string,
): ts.Expression {
	const literal = node.literal;
	if (ts.isStringLiteral(literal)) return call(field(state.addTImport(sourceFile), "literal"), [str(literal.text)]);
	if (ts.isNumericLiteral(literal)) return call(field(state.addTImport(sourceFile), "literal"), [num(Number(literal.text))]);
	if (literal.kind === ts.SyntaxKind.TrueKeyword) return call(field(state.addTImport(sourceFile), "literal"), [bool(true)]);
	if (literal.kind === ts.SyntaxKind.FalseKeyword) return call(field(state.addTImport(sourceFile), "literal"), [bool(false)]);
	return unsupportedDatastoreType(state, node, path, literal.getText(sourceFile));
}

function typeDeclarationForTypeReference(
	state: TransformState,
	node: ts.TypeReferenceNode,
): ts.Declaration | undefined {
	const checker = state.typeChecker;
	if (checker === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(node.typeName);
	const resolved = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
	return resolved?.declarations?.[0];
}

function unsupportedDatastoreType(
	state: TransformState,
	node: ts.Node,
	path: string,
	label: string,
): ts.Expression {
	state.diagnostic(
		node,
		`[rovy/datastore] Cannot generate validator for ${path}: unsupported type '${label}'. Use a datastore-safe type or add a codec in a future version.`,
	);
	return alwaysTrueValidator();
}

function alwaysTrueValidator(): ts.Expression {
	const value = id("value");
	return ts.factory.createArrowFunction(
		undefined,
		undefined,
		[ts.factory.createParameterDeclaration(undefined, undefined, value, undefined, ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword))],
		ts.factory.createTypePredicateNode(undefined, value, ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)),
		ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		bool(true),
	);
}

const ROBLOX_INSTANCE_TYPES = new Set([
	"Instance",
	"Workspace",
	"Model",
	"BasePart",
	"Part",
	"MeshPart",
	"UnionOperation",
	"Folder",
	"Player",
	"Humanoid",
	"Attachment",
	"Tool",
	"RemoteEvent",
	"RemoteFunction",
	"BindableEvent",
	"BindableFunction",
	"ScreenGui",
	"Frame",
	"GuiObject",
	"TextLabel",
	"TextButton",
	"ImageLabel",
	"ImageButton",
]);

function buildScheduleMeta(decorator: DecoratorInfo, plugin?: PluginBinding): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	return obj(
		stripUndefinedProperties([
			maybeProp("plugin", plugin?.expr),
			prop("runOnStart", propertyValue(options, "runOnStart") ?? bool(false)),
		]),
		true,
	);
}

function buildNetEventMeta(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
	classId: string,
): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	const direction = propertyValue(options, "direction");
	const channel = propertyValue(options, "channel") ?? str("reliable");
	const receive = propertyValue(options, "receive") ?? str("send");
	const ctor = node.members.find(ts.isConstructorDeclaration);
	const fieldNames = (ctor?.parameters ?? [])
		.map((param) => (ts.isIdentifier(param.name) ? param.name.text : undefined))
		.filter((name): name is string => name !== undefined);
	return obj(
		[
			prop("id", str(classId)),
			prop("name", str(node.name?.text ?? "AnonymousNetEvent")),
			prop("direction", direction ?? str("clientToServer")),
			prop("channel", channel),
			prop("receive", receive),
			prop("fields", arr(fieldNames.map(str))),
			prop("blink", str(buildBlinkEvent(state, node, decorator))),
		],
		true,
	);
}

function buildNetFunctionMeta(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
	classId: string,
): ts.ObjectLiteralExpression {
	const result = netFunctionResultExpression(state, decorator);
	const resultClass = result !== undefined ? classDeclarationForExpression(state, result) : undefined;
	const requestName = `${node.name?.text ?? "AnonymousNetFunction"}Request`;
	const resultWireName = `${node.name?.text ?? "AnonymousNetFunction"}Result`;
	return obj(
		[
			prop("id", str(classId)),
			prop("name", str(node.name?.text ?? "AnonymousNetFunction")),
			prop("direction", str("clientToServer")),
			prop("fields", arr(constructorFieldNames(node).map(str), false)),
			prop("result", result ?? id("undefined")),
			prop("resultName", str(resultClass?.name?.text ?? "AnonymousNetFunctionResult")),
			prop("resultFields", arr((resultClass !== undefined ? constructorFieldNames(resultClass) : []).map(str), false)),
			prop("requestName", str(requestName)),
			prop("resultWireName", str(resultWireName)),
			prop("requestBlink", str(buildBlinkFunctionRequest(state, node, requestName))),
			prop("resultBlink", str(buildBlinkFunctionResult(state, resultClass, resultWireName))),
		],
		true,
	);
}

function buildScribeCommandMeta(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
	classId: string,
): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	const data = propertyValue(options, "data");
	const result = propertyValue(options, "result");
	const resultClass = result !== undefined
		? classDeclarationForExpression(state, result)
		: undefined;
	return obj(
		[
			prop("id", str(classId)),
			prop("name", str(node.name?.text ?? "AnonymousScribeCommand")),
			prop(
				"dataId",
				str(data !== undefined
					? scribeDataIdFromExpression(state, data, "@scribeCommand data")
					: "unknown"),
			),
			prop("fields", arr(constructorFieldNames(node).map(str), false)),
			prop("result", result ?? id("undefined")),
			prop(
				"resultFields",
				arr(
					(resultClass !== undefined
						? constructorFieldNames(resultClass)
						: []).map(str),
					false,
				),
			),
		],
		true,
	);
}

function buildScribeEventMeta(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
	classId: string,
): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	const data = propertyValue(options, "data");
	const command = propertyValue(options, "command");
	const kind = propertyValue(options, "kind") ?? str("unknown");
	const path = propertyValue(options, "path");
	return obj(
		stripUndefinedProperties([
			prop("id", str(classId)),
			data !== undefined
				? prop("dataId", str(scribeDataIdFromExpression(state, data, "@scribeEvent data")))
				: undefined,
			command !== undefined
				? prop(
						"commandId",
						str(scribeCommandIdFromExpression(state, command, "@scribeEvent command")),
					)
				: undefined,
			prop("kind", kind),
			path !== undefined ? prop("path", path) : undefined,
		]),
		true,
	);
}

function constructorFieldNames(node: ts.ClassDeclaration): string[] {
	const ctor = node.members.find(ts.isConstructorDeclaration);
	const fields: string[] = [];
	for (const param of ctor?.parameters ?? []) {
		if (ts.isIdentifier(param.name)) fields.push(param.name.text);
	}
	return fields;
}

function buildWidgetMeta(classId: string, name: string): ts.ObjectLiteralExpression {
	return obj([prop("id", str(classId)), prop("name", str(name))], true);
}

function buildEventMeta(options: ts.Expression | undefined, plugin: PluginBinding | undefined): ts.Expression | undefined {
	if (plugin === undefined) return options;
	if (options !== undefined && ts.isObjectLiteralExpression(options)) {
		return obj([...options.properties, prop("plugin", plugin.expr)], true);
	}
	return obj([prop("plugin", plugin.expr)], true);
}

function buildPluginMeta(state: TransformState, node: ts.ClassDeclaration): ts.ObjectLiteralExpression {
	const moduleId = state.stableIdForNode(node);
	const root = moduleId.endsWith("/index") ? moduleDirId(state, node) : moduleId;
	return obj([prop("id", str(moduleId)), prop("root", str(root))], true);
}

function buildPrefabMeta(classId: string, params: ParamBuild, plugin?: PluginBinding): ts.ObjectLiteralExpression {
	return obj(
		stripUndefinedProperties([
			prop("id", str(classId)),
			maybeProp("plugin", plugin?.expr),
			prop("params", params.descriptor),
		]),
		true,
	);
}

function buildPluginOwnerMeta(plugin?: PluginBinding): ts.Expression | undefined {
	if (plugin === undefined) return undefined;
	return obj([prop("plugin", plugin.expr)], true);
}

function moduleDirId(state: TransformState, node: ts.Node): string {
	const moduleId = state.stableIdForNode(node);
	return dirname(moduleId);
}

function validateNetEvent(state: TransformState, node: ts.ClassDeclaration, decorator: DecoratorInfo): void {
	const options = objectArg(decorator);
	if (!options) {
		state.diagnostic(decorator.node, "@netEvent requires options");
		return;
	}
	const direction = propertyValue(options, "direction");
	if (!direction) state.diagnostic(decorator.node, "@netEvent requires direction");
	validateStringOption(state, direction, ["clientToServer", "serverToClient"], "@netEvent direction");
	validateStringOption(state, propertyValue(options, "channel"), ["reliable", "unreliable"], "@netEvent channel");
	validateStringOption(state, propertyValue(options, "receive"), ["send", "trigger"], "@netEvent receive");

	const ctor = node.members.find(ts.isConstructorDeclaration);
	for (const param of ctor?.parameters ?? []) {
		if (!param.type) {
			state.diagnostic(param, "@netEvent constructor fields require explicit serializable types");
			continue;
		}
		blinkTypeShapeFor(state, param.type, param.questionToken !== undefined);
	}
}

function validateNetFunction(state: TransformState, node: ts.ClassDeclaration, decorator: DecoratorInfo): void {
	const options = objectArg(decorator);
	if (!options) {
		state.diagnostic(decorator.node, "@netFunction requires options");
		return;
	}
	const direction = propertyValue(options, "direction");
	if (!direction) state.diagnostic(decorator.node, "@netFunction requires direction");
	validateStringOption(state, direction, ["clientToServer"], "@netFunction direction");
	const result = propertyValue(options, "result");
	if (result === undefined) {
		state.diagnostic(decorator.node, "@netFunction requires result");
	}
	validateNetSerializableConstructor(state, node, "@netFunction constructor fields");
	const resultClass = result !== undefined ? classDeclarationForExpression(state, result) : undefined;
	if (result !== undefined && resultClass === undefined) {
		state.diagnostic(result, "@netFunction result must reference a result class");
		return;
	}
	if (resultClass !== undefined) validateNetSerializableConstructor(state, resultClass, "@netFunction result fields");
}

function validateScribeCommand(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
): void {
	const options = objectArg(decorator);
	if (options === undefined) {
		state.diagnostic(decorator.node, "@scribeCommand requires options");
		return;
	}
	const data = propertyValue(options, "data");
	const result = propertyValue(options, "result");
	if (data === undefined) {
		state.diagnostic(decorator.node, "@scribeCommand requires data");
	} else {
		scribeDataIdFromExpression(state, data, "@scribeCommand data");
	}
	if (result === undefined) {
		state.diagnostic(decorator.node, "@scribeCommand requires result");
	}
	validateScribeSerializableConstructor(state, node, "@scribeCommand request");
	const resultClass = result !== undefined
		? classDeclarationForExpression(state, result)
		: undefined;
	if (result !== undefined && resultClass === undefined) {
		state.diagnostic(result, "@scribeCommand result must reference a result class");
	} else if (resultClass !== undefined) {
		validateScribeSerializableConstructor(state, resultClass, "@scribeCommand result");
	}
	validateOnlyKnownObjectKeys(state, options, ["data", "result"], "@scribeCommand");
}

const SCRIBE_EVENT_KINDS = [
	"ready",
	"unavailable",
	"sessionEnded",
	"save",
	"anomaly",
	"giftReceived",
	"giftCredit",
	"ownershipChanged",
	"message",
	"leaderboard",
	"serviceStatus",
	"sharedChanged",
	"issue",
	"jobCompleted",
	"changed",
	"inserted",
	"removed",
	"keyAdded",
	"keyRemoved",
	"commandCompleted",
] as const;

function validateScribeEvent(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
): void {
	const options = objectArg(decorator);
	if (options === undefined) {
		state.diagnostic(decorator.node, "@scribeEvent requires options");
		return;
	}
	const data = propertyValue(options, "data");
	const command = propertyValue(options, "command");
	const kindExpression = propertyValue(options, "kind");
	const path = propertyValue(options, "path");
	validateStringOption(
		state,
		kindExpression,
		SCRIBE_EVENT_KINDS,
		"@scribeEvent kind",
	);
	if (kindExpression === undefined) {
		state.diagnostic(decorator.node, "@scribeEvent requires kind");
		return;
	}
	const kind = stringOptionValue(kindExpression);
	if (kind === "commandCompleted") {
		if (command === undefined) {
			state.diagnostic(decorator.node, "@scribeEvent commandCompleted requires command");
		} else {
			scribeCommandIdFromExpression(state, command, "@scribeEvent command");
		}
		if (data !== undefined) {
			state.diagnostic(data, "@scribeEvent commandCompleted cannot also specify data");
		}
		if (path !== undefined) {
			state.diagnostic(path, "@scribeEvent commandCompleted cannot specify path");
		}
		validateOnlyKnownObjectKeys(state, options, ["command", "kind"], "@scribeEvent");
		return;
	}
	if (data === undefined) {
		state.diagnostic(decorator.node, "@scribeEvent requires data");
		validateOnlyKnownObjectKeys(state, options, ["data", "kind", "path"], "@scribeEvent");
		return;
	}
	const declaration = scribeDataDeclarationFromExpression(state, data);
	if (declaration === undefined) {
		state.diagnostic(data, "@scribeEvent data must reference a scribeData declaration");
	}

	const pathKind =
		kind === "changed"
			? "value"
			: kind === "inserted" || kind === "removed"
				? "array"
				: kind === "keyAdded" || kind === "keyRemoved"
					? "dictionary"
					: undefined;
	if (pathKind === undefined) {
		if (path !== undefined) {
			state.diagnostic(path, `@scribeEvent kind '${kind ?? "unknown"}' does not accept path`);
		}
	} else if (path === undefined || !ts.isStringLiteral(path)) {
		state.diagnostic(path ?? decorator.node, `@scribeEvent kind '${kind}' requires a string literal path`);
	} else if (declaration !== undefined) {
		const resolved = resolveScribeTemplatePath(state, sourceFile, declaration, path.text);
		if (resolved === undefined) {
			state.diagnostic(path, `@scribeEvent path '${path.text}' does not exist in the Scribe schema`);
		} else {
			if (pathKind === "array" && resolved.kind !== "array") {
				state.diagnostic(path, `@scribeEvent kind '${kind}' requires an s.arrayOf path`);
			}
			if (pathKind === "dictionary" && resolved.kind !== "dictionary") {
				state.diagnostic(path, `@scribeEvent kind '${kind}' requires an s.dictOf path`);
			}
			const explicitBoundary = classBoundaryFromInfo(state, node);
			const boundary = explicitBoundary ?? state.resolveBoundary(sourceFile);
			if (resolved.serverOnly && boundary !== "server") {
				state.diagnostic(
					path,
					`@scribeEvent client-visible path '${path.text}' cannot reference s.serverOnly data`,
				);
			}
		}
	}
	validateOnlyKnownObjectKeys(state, options, ["data", "kind", "path"], "@scribeEvent");
}

function validateOnlyKnownObjectKeys(
	state: TransformState,
	options: ts.ObjectLiteralExpression,
	allowed: ReadonlyArray<string>,
	label: string,
): void {
	for (const property of options.properties) {
		if (ts.isSpreadAssignment(property)) {
			state.diagnostic(property, `${label} options cannot use spread properties`);
			continue;
		}
		const key = propertyNameText(property.name);
		if (key === undefined || !allowed.includes(key)) {
			state.diagnostic(property, `${label} has unknown option '${key ?? "<computed>"}'`);
		}
	}
}

function validateScribeSerializableConstructor(
	state: TransformState,
	node: ts.ClassDeclaration,
	label: string,
): void {
	const ctor = node.members.find(ts.isConstructorDeclaration);
	for (const param of ctor?.parameters ?? []) {
		if (param.type === undefined) {
			state.diagnostic(param, `${label} fields require explicit serializable types`);
			continue;
		}
		validateScribeSerializableType(state, param.type, `${label} field '${param.name.getText()}'`, new Set());
	}
}

function validateScribeSerializableType(
	state: TransformState,
	node: ts.TypeNode,
	label: string,
	seen: Set<ts.Node>,
): void {
	if (seen.has(node)) return;
	seen.add(node);
	if (
		node.kind === ts.SyntaxKind.StringKeyword ||
		node.kind === ts.SyntaxKind.NumberKeyword ||
		node.kind === ts.SyntaxKind.BooleanKeyword ||
		node.kind === ts.SyntaxKind.UndefinedKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword ||
		ts.isLiteralTypeNode(node)
	) {
		return;
	}
	if (ts.isUnionTypeNode(node)) {
		for (const part of node.types) validateScribeSerializableType(state, part, label, seen);
		return;
	}
	if (ts.isArrayTypeNode(node)) {
		validateScribeSerializableType(state, node.elementType, label, seen);
		return;
	}
	if (ts.isTupleTypeNode(node)) {
		for (const element of node.elements) {
			const inner = ts.isNamedTupleMember(element) ? element.type : element;
			validateScribeSerializableType(state, inner, label, seen);
		}
		return;
	}
	if (ts.isTypeLiteralNode(node)) {
		for (const member of node.members) {
			if (!ts.isPropertySignature(member) || member.type === undefined) {
				state.diagnostic(member, `${label} contains a nonserializable member`);
				continue;
			}
			validateScribeSerializableType(state, member.type, label, seen);
		}
		return;
	}
	if (ts.isTypeReferenceNode(node)) {
		const name = lastTypeName(node.typeName);
		if (
			name === "buffer" ||
			name === "Vector3" ||
			name === "Vector2" ||
			name === "Vector3int16" ||
			name === "Vector2int16" ||
			name === "CFrame" ||
			name === "Color3" ||
			name === "BrickColor" ||
			name === "UDim" ||
			name === "UDim2" ||
			name === "Rect" ||
			name === "NumberRange" ||
			name === "NumberSequence" ||
			name === "ColorSequence" ||
			name === "DateTime" ||
			name === "EnumItem" ||
			name === "Font" ||
			name === "PhysicalProperties"
		) {
			return;
		}
		if (name === "Array" || name === "ReadonlyArray") {
			const element = node.typeArguments?.[0];
			if (element !== undefined) validateScribeSerializableType(state, element, label, seen);
			return;
		}
		if (name === "Record" || name === "Readonly") {
			for (const typeArg of node.typeArguments ?? []) {
				validateScribeSerializableType(state, typeArg, label, seen);
			}
			return;
		}
		const declaration = typeDeclarationForTypeReference(state, node);
		if (declaration !== undefined) {
			if (ts.isClassDeclaration(declaration)) {
				validateScribeSerializableConstructor(state, declaration, label);
				return;
			}
			if (ts.isInterfaceDeclaration(declaration)) {
				for (const member of declaration.members) {
					if (!ts.isPropertySignature(member) || member.type === undefined) {
						state.diagnostic(member, `${label} contains a nonserializable member`);
					} else {
						validateScribeSerializableType(state, member.type, label, seen);
					}
				}
				return;
			}
			if (ts.isTypeAliasDeclaration(declaration)) {
				validateScribeSerializableType(state, declaration.type, label, seen);
				return;
			}
		}
	}
	state.diagnostic(node, `${label} uses nonserializable type '${node.getText()}'`);
}

function validateNetSerializableConstructor(state: TransformState, node: ts.ClassDeclaration, label: string): void {
	const ctor = node.members.find(ts.isConstructorDeclaration);
	for (const param of ctor?.parameters ?? []) {
		if (!param.type) {
			state.diagnostic(param, `${label} require explicit serializable types`);
			continue;
		}
		blinkTypeShapeFor(state, param.type, param.questionToken !== undefined);
	}
}

function validateStringOption(
	state: TransformState,
	expression: ts.Expression | undefined,
	allowed: readonly string[],
	label: string,
): void {
	if (!expression) return;
	if (!ts.isStringLiteral(expression)) {
		state.diagnostic(expression, `${label} must be a string literal`);
		return;
	}
	if (!allowed.includes(expression.text)) {
		state.diagnostic(expression, `${label} must be one of: ${allowed.map((v) => `"${v}"`).join(", ")}`);
	}
}

function buildBlinkEvent(state: TransformState, node: ts.ClassDeclaration, decorator: DecoratorInfo): string {
	const options = objectArg(decorator);
	const direction = stringOptionValue(propertyValue(options, "direction")) ?? "clientToServer";
	const channel = stringOptionValue(propertyValue(options, "channel")) ?? "reliable";
	const from = direction === "clientToServer" ? "Client" : "Server";
	const type = channel === "unreliable" ? "Unreliable" : "Reliable";
	const ctor = node.members.find(ts.isConstructorDeclaration);
	const fields: string[] = [];
	const params = [...(ctor?.parameters ?? [])];
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		const name = ts.isIdentifier(param.name) ? param.name.text : undefined;
		if (!name || !param.type) continue;
		const comma = i < params.length - 1 ? "," : "";
		fields.push(...renderBlinkField(state, name, param.type, param.questionToken !== undefined, 2, comma));
	}
	return [
		`event ${node.name?.text ?? "AnonymousNetEvent"} {`,
		`\tFrom: ${from},`,
		`\tType: ${type},`,
		"\tCall: Polling,",
		"\tData: struct {",
		...fields,
		"\t}",
		"}",
	].join("\n");
}

function buildBlinkFunctionRequest(state: TransformState, node: ts.ClassDeclaration, name: string): string {
	const fields = renderBlinkPayloadFields(state, node, 3);
	return [
		`event ${name} {`,
		"\tFrom: Client,",
		"\tType: Reliable,",
		"\tCall: Polling,",
		"\tData: struct {",
		"\t\tcallSiteId: string,",
		"\t\tsequence: f64,",
		"\t\tpayload: struct {",
		...fields,
		"\t\t}",
		"\t}",
		"}",
	].join("\n");
}

function buildBlinkFunctionResult(
	state: TransformState,
	resultClass: ts.ClassDeclaration | undefined,
	name: string,
): string {
	const fields = resultClass !== undefined ? renderBlinkPayloadFields(state, resultClass, 3) : [];
	return [
		`event ${name} {`,
		"\tFrom: Server,",
		"\tType: Reliable,",
		"\tCall: Polling,",
		"\tData: struct {",
		"\t\tcallSiteId: string,",
		"\t\tsequence: f64,",
		"\t\tok: boolean,",
		"\t\terror: string?,",
		"\t\tpayload: struct {",
		...fields,
		"\t\t}?",
		"\t}",
		"}",
	].join("\n");
}

function renderBlinkPayloadFields(state: TransformState, node: ts.ClassDeclaration, indent: number): string[] {
	const ctor = node.members.find(ts.isConstructorDeclaration);
	const params = [...(ctor?.parameters ?? [])].filter((param) => ts.isIdentifier(param.name) && param.type !== undefined);
	const fields: string[] = [];
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		const comma = i < params.length - 1 ? "," : "";
		fields.push(...renderBlinkField(state, (param.name as ts.Identifier).text, param.type!, param.questionToken !== undefined, indent, comma));
	}
	return fields;
}

function stringOptionValue(expression: ts.Expression | undefined): string | undefined {
	return expression && ts.isStringLiteral(expression) ? expression.text : undefined;
}

type BlinkTypeShape =
	| { kind: "primitive"; text: string }
	| { kind: "struct"; fields: Array<{ name: string; type: ts.TypeNode; optional: boolean }>; suffix: string }
	| { kind: "array"; element: BlinkTypeShape; suffix: string };

function blinkTypeShapeFor(state: TransformState, node: ts.TypeNode, optional: boolean): BlinkTypeShape {
	let suffix = optional ? "?" : "";
	if (ts.isUnionTypeNode(node)) {
		const nonUndefined = node.types.filter((part) => part.kind !== ts.SyntaxKind.UndefinedKeyword);
		if (nonUndefined.length !== node.types.length) suffix = "?";
		if (nonUndefined.every(ts.isLiteralTypeNode)) {
			return { kind: "primitive", text: `string${suffix}` };
		}
		if (nonUndefined.length === 1) return blinkTypeShapeFor(state, nonUndefined[0], suffix === "?");
	}
	if (ts.isArrayTypeNode(node)) return { kind: "array", element: blinkTypeShapeFor(state, node.elementType, false), suffix };
	if (ts.isTypeReferenceNode(node)) {
		const name = lastTypeName(node.typeName);
		if (name === "NetId") return { kind: "primitive", text: `u32${suffix}` };
		if (name === "Array" || name === "ReadonlyArray") {
			const arg = node.typeArguments?.[0];
			if (arg) return { kind: "array", element: blinkTypeShapeFor(state, arg, false), suffix };
		}
		const symbol = state.typeChecker?.getSymbolAtLocation(node.typeName);
		for (const declaration of symbol?.declarations ?? []) {
			if (ts.isInterfaceDeclaration(declaration)) {
				return {
					kind: "struct",
					fields: blinkStructFieldsFor(state, declaration.members),
					suffix,
				};
			}
			if (ts.isTypeAliasDeclaration(declaration)) {
				const inner = blinkTypeShapeFor(state, declaration.type, suffix === "?");
				return applyBlinkSuffix(inner, suffix);
			}
		}
	}
	if (node.kind === ts.SyntaxKind.NumberKeyword) return { kind: "primitive", text: `f64${suffix}` };
	if (node.kind === ts.SyntaxKind.StringKeyword) return { kind: "primitive", text: `string${suffix}` };
	if (node.kind === ts.SyntaxKind.BooleanKeyword) return { kind: "primitive", text: `boolean${suffix}` };
	if (ts.isParenthesizedTypeNode(node)) return blinkTypeShapeFor(state, node.type, suffix === "?");
	if (ts.isTypeLiteralNode(node)) {
		return {
			kind: "struct",
			fields: blinkStructFieldsFor(state, node.members),
			suffix,
		};
	}
	state.diagnostic(node, `unsupported @netEvent field type '${node.getText()}'`);
	return { kind: "primitive", text: `unknown${suffix}` };
}

function blinkStructFieldsFor(
	state: TransformState,
	members: ts.NodeArray<ts.TypeElement> | readonly ts.TypeElement[],
): Array<{ name: string; type: ts.TypeNode; optional: boolean }> {
	const fields: Array<{ name: string; type: ts.TypeNode; optional: boolean }> = [];
	for (const member of members) {
		if (!ts.isPropertySignature(member) || !member.type) {
			state.diagnostic(member, "unsupported @netEvent struct member");
			continue;
		}
		const name = propertyNameText(member.name);
		if (!name) {
			state.diagnostic(member.name, "unsupported @netEvent struct member name");
			continue;
		}
		fields.push({ name, type: member.type, optional: member.questionToken !== undefined });
	}
	return fields;
}

function applyBlinkSuffix(shape: BlinkTypeShape, suffix: string): BlinkTypeShape {
	if (suffix === "") return shape;
	switch (shape.kind) {
		case "primitive":
			return { kind: "primitive", text: `${shape.text}${suffix}` };
		case "struct":
			return { ...shape, suffix: `${shape.suffix}${suffix}` };
		case "array":
			return { ...shape, suffix: `${shape.suffix}${suffix}` };
	}
}

function renderBlinkField(
	state: TransformState,
	name: string,
	node: ts.TypeNode,
	optional: boolean,
	indent: number,
	comma: string,
): string[] {
	return renderBlinkFieldShape(state, name, blinkTypeShapeFor(state, node, optional), indent, comma);
}

function renderBlinkFieldShape(
	state: TransformState,
	name: string,
	shape: BlinkTypeShape,
	indent: number,
	comma: string,
): string[] {
	const tabs = "\t".repeat(indent);
	if (shape.kind === "primitive") return [`${tabs}${name}: ${shape.text}${comma}`];
	if (shape.kind === "array" && shape.element.kind === "primitive") {
		return [`${tabs}${name}: ${shape.element.text}[]${shape.suffix}${comma}`];
	}
	const struct = shape.kind === "struct" ? shape : (shape.element as Extract<BlinkTypeShape, { kind: "struct" }>);
	const suffix = shape.kind === "array" ? `[]${shape.suffix}` : shape.suffix;
	const fields: string[] = [`${tabs}${name}: struct {`];
	for (let i = 0; i < struct.fields.length; i++) {
		const field = struct.fields[i];
		const innerComma = i < struct.fields.length - 1 ? "," : "";
		fields.push(
			...renderBlinkFieldShape(state, field.name, blinkTypeShapeFor(state, field.type, field.optional), indent + 1, innerComma),
		);
	}
	fields.push(`${tabs}}${suffix}${comma}`);
	return fields;
}

function lowerParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	ctx: { kind: "system" | "observer"; classId: string; eventExpr?: ts.Expression },
): ParamBuild {
	const descriptors: ts.ObjectLiteralExpression[] = [];
	const queryStatements: ts.Statement[] = [];
	let localIndex = 0;
	for (let i = 0; i < params.length; i++) {
		const lowered = lowerParam(state, sourceFile, params[i], {
			...ctx,
			paramIndex: i,
			localIndex,
		});
		if (lowered.localUsed) localIndex++;
		descriptors.push(lowered.descriptor);
		queryStatements.push(...lowered.queryStatements);
	}
	return { descriptor: arr(descriptors, true), queryStatements };
}

function lowerMonitorParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.ClassDeclaration,
	methods: readonly MonitorMethod[],
	match: QueryBuild | undefined,
	classId: string,
): ParamBuild {
	let baseline: ParamBuild | undefined;
	for (const methodName of methods) {
		const method = methodNamed(node, methodName);
		if (!method) continue;
		const current = lowerMonitorMethodParams(state, sourceFile, method.parameters, match, classId);
		if (!baseline) baseline = current;
		else if (printExpression(baseline.descriptor, sourceFile) !== printExpression(current.descriptor, sourceFile)) {
			state.diagnostic(method, "@monitor lifecycle methods must use the same param descriptor list");
		}
	}
	return baseline ?? emptyParams();
}

function lowerMonitorMethodParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	match: QueryBuild | undefined,
	classId: string,
): ParamBuild {
	const descriptors: ts.ObjectLiteralExpression[] = [];
	const queryStatements: ts.Statement[] = [];
	let termCursor = 0;
	let localIndex = 0;
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		const type = param.type;
		if (type && isEntityType(type)) {
			descriptors.push(obj([prop("kind", str("entity"))], false));
			continue;
		}

		const termIndex = match ? nextMatchingTermIndex(match.termTypes, type, termCursor) : -1;
		if (termIndex >= 0) {
			termCursor = termIndex + 1;
			descriptors.push(obj([prop("kind", str("term")), prop("index", num(termIndex))], false));
			continue;
		}

		const lowered = lowerParam(state, sourceFile, param, {
			kind: "system",
			classId,
			paramIndex: i,
			localIndex,
		});
		if (lowered.localUsed) localIndex++;
		descriptors.push(lowered.descriptor);
		queryStatements.push(...lowered.queryStatements);
	}
	return { descriptor: arr(descriptors, true), queryStatements };
}

function lowerUiParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	classId: string,
): ParamBuild {
	const descriptors: ts.ObjectLiteralExpression[] = [];
	const queryStatements: ts.Statement[] = [];
	let localIndex = 0;
	for (let i = 0; i < params.length; i++) {
		const lowered = lowerParam(state, sourceFile, params[i], {
			kind: "system",
			classId,
			paramIndex: i,
			localIndex,
		});
		if (lowered.localUsed) localIndex++;
		descriptors.push(lowered.descriptor);
		queryStatements.push(...lowered.queryStatements);
	}
	return { descriptor: arr(descriptors, true), queryStatements };
}

function lowerViewParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	classId: string,
): ParamBuild {
	const descriptors: ts.ObjectLiteralExpression[] = [];
	const queryStatements: ts.Statement[] = [];
	let localIndex = 0;
	for (let i = 0; i < params.length; i++) {
		const lowered = lowerViewParam(state, sourceFile, params[i], {
			classId,
			paramIndex: i,
			localIndex,
		});
		if (lowered.localUsed) localIndex++;
		descriptors.push(lowered.descriptor);
		queryStatements.push(...lowered.queryStatements);
	}
	return { descriptor: arr(descriptors, true), queryStatements };
}

function lowerViewParam(
	state: TransformState,
	sourceFile: ts.SourceFile,
	param: ts.ParameterDeclaration,
	ctx: { classId: string; paramIndex: number; localIndex: number },
): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[]; localUsed?: boolean } {
	const type = param.type;
	if (!type) {
		state.diagnostic(param, "injected params require an explicit type annotation");
		return { descriptor: obj([prop("kind", str("context"))], false), queryStatements: [] };
	}

	if (ts.isTypeReferenceNode(type)) {
		const name = lastTypeName(type.typeName);
		if (isVideType(state, sourceFile, type, "ViewContext")) {
			return { descriptor: obj([prop("kind", str("context"))], false), queryStatements: [] };
		}
		if (isVideType(state, sourceFile, type, "ViewMonitor") || name === "ViewMonitor") {
			const query = buildQueryFromType(state, type, `${ctx.classId}:${ctx.paramIndex}:monitor`);
			return {
				descriptor: obj([prop("kind", str("viewMonitor")), prop("handle", str(query.id))], false),
				queryStatements: [regQuery(state.addRovyImport(sourceFile), query.descriptor)],
			};
		}
	}

	return lowerParam(state, sourceFile, param, {
		kind: "system",
		classId: ctx.classId,
		paramIndex: ctx.paramIndex,
		localIndex: ctx.localIndex,
	});
}

function lowerParam(
	state: TransformState,
	sourceFile: ts.SourceFile,
	param: ts.ParameterDeclaration,
	ctx: { kind: "system" | "observer"; classId: string; paramIndex: number; localIndex: number; eventExpr?: ts.Expression },
): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[]; localUsed?: boolean } {
	const type = param.type;
	if (!type) {
		state.diagnostic(param, "injected params require an explicit type annotation");
		return { descriptor: obj([prop("kind", str("world"))], false), queryStatements: [] };
	}

	if (ctx.kind === "observer" && ctx.eventExpr && sameTypeAsExpression(type, ctx.eventExpr)) {
		return { descriptor: obj([prop("kind", str("event"))], false), queryStatements: [] };
	}

	if (ts.isTypeReferenceNode(type)) {
		const name = lastTypeName(type.typeName);
		if (name === "Commands") return simpleParam("commands");
		if (name === "World") return simpleParam("world");
		if (isNetworkingType(state, sourceFile, type, "NetClient")) {
			validateNetworkingBoundary(state, sourceFile, type, "client", "NetClient");
			return externalParam("@rovy/networking/NetClient");
		}
		if (isNetworkingType(state, sourceFile, type, "NetServer")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "NetServer");
			return externalParam("@rovy/networking/NetServer");
		}
		if (isNetworkingType(state, sourceFile, type, "NetEventContext")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "NetEventContext");
			return externalParam("@rovy/networking/NetEventContext");
		}
		if (isNetworkingType(state, sourceFile, type, "NetFunctionResponder")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "NetFunctionResponder");
			return externalParam("@rovy/networking/NetFunctionResponder");
		}
		if (isNetworkingType(state, sourceFile, type, "NetFunc")) {
			validateNetworkingBoundary(state, sourceFile, type, "client", "NetFunc");
			return externalParam(`@rovy/networking/NetFunc:${netFunctionIdFromTypeArg(state, type)}`);
		}
		if (isNetworkingType(state, sourceFile, type, "NetFunctionReader")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "NetFunctionReader");
			return externalParam(`@rovy/networking/NetFunctionReader:${netFunctionIdFromTypeArg(state, type)}`);
		}
		const scribeDataParam = scribeDataParamInfo(state, sourceFile, type);
		if (scribeDataParam !== undefined) {
			if (scribeDataParam.boundary !== "both") {
				validateNetworkingBoundary(
					state,
					sourceFile,
					type,
					scribeDataParam.boundary,
					scribeDataParam.name,
				);
			}
			return externalParam(
				`${scribeDataParam.prefix}${scribeDataIdFromInjectedType(state, type)}`,
			);
		}
		if (isScribeType(state, sourceFile, type, "ScribeCommand")) {
			validateNetworkingBoundary(state, sourceFile, type, "client", "ScribeCommand");
			return externalParam(
				`@rovy/scribe/command-client:${scribeCommandIdFromTypeArg(state, type)}`,
			);
		}
		if (isScribeType(state, sourceFile, type, "ScribeCommandReader")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "ScribeCommandReader");
			return externalParam(
				`@rovy/scribe/command-reader:${scribeCommandIdFromTypeArg(state, type)}`,
			);
		}
		if (isScribeType(state, sourceFile, type, "ScribeCommandResponder")) {
			validateNetworkingBoundary(state, sourceFile, type, "server", "ScribeCommandResponder");
			return externalParam("@rovy/scribe/command-responder");
		}
		if (isScribeType(state, sourceFile, type, "ScribeDiagnostics")) {
			return externalParam("@rovy/scribe/diagnostics");
		}
			if (isDatastoreType(state, sourceFile, type, "DocumentReader")) {
				const documentId = documentIdFromInjectedDocumentType(state, type);
				return externalParam(`@rovy/datastore/reader:${documentId}`);
			}
			if (isDatastoreType(state, sourceFile, type, "DocumentWriter")) {
				const documentId = documentIdFromInjectedDocumentType(state, type);
				return externalParam(`@rovy/datastore/writer:${documentId}`);
			}
			if (isDatastoreType(state, sourceFile, type, "DocumentOpener")) {
				const documentId = documentIdFromInjectedDocumentType(state, type);
				return externalParam(`@rovy/datastore/opener:${documentId}`);
			}
			if (name === "Query") {
			const query = buildQueryFromType(state, type, `${ctx.classId}:${ctx.paramIndex}`);
			return {
				descriptor: obj([prop("kind", str("query")), prop("handle", str(query.id))], false),
				queryStatements: [regQuery(state.addRovyImport(sourceFile), query.descriptor)],
			};
		}
		if (name === "Res" || name === "ResMut" || name === "OptRes") {
			const ctor = ctorArg(state, type);
			const kind = name === "Res" ? "res" : name === "ResMut" ? "resMut" : "optRes";
			return { descriptor: obj([prop("kind", str(kind)), prop("ctor", ctor)], false), queryStatements: [] };
		}
			if (name === "EventReader" || name === "EventWriter") {
				if (name === "EventReader") {
					const datastoreEvent = datastoreEventCtorArg(state, sourceFile, type);
					if (datastoreEvent !== undefined) {
						return {
							descriptor: obj([prop("kind", str("eventReader")), prop("ctor", datastoreEvent)], false),
							queryStatements: [],
						};
					}
				}
				const ctor = ctorArg(state, type);
				return {
				descriptor: obj([prop("kind", str(name === "EventReader" ? "eventReader" : "eventWriter")), prop("ctor", ctor)], false),
				queryStatements: [],
			};
		}
		if (name === "Local") {
			return {
				descriptor: obj([prop("kind", str("local")), prop("index", num(ctx.localIndex))], false),
				queryStatements: [],
				localUsed: true,
			};
		}

		if (state.hasDecoratorOnTypeNode(type, "collect")) {
			return {
				descriptor: obj([prop("kind", str("collect")), prop("ctor", entityNameToExpression(type.typeName))], false),
				queryStatements: [],
			};
		}
	}

	state.diagnostic(param, `unsupported injected param type '${type.getText()}'`);
	return { descriptor: obj([prop("kind", str("world"))], false), queryStatements: [] };
}

function validateNetworkingBoundary(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	expected: "client" | "server",
	label: string,
): void {
	const boundary = state.resolveBoundary(sourceFile);
	if (boundary === "unknown") {
		if (state.strictBoundaryChecks()) {
			state.diagnostic(
				node,
				`${label} could not be placed in a known boundary from rovy-build config, .rovy.json, or conventional paths`,
			);
		}
		return;
	}
	if (boundary !== expected && boundary !== "shared") {
		state.diagnostic(node, `${label} can only be injected from the ${expected} boundary`);
	}
}

function simpleParam(kind: string): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[] } {
	return { descriptor: obj([prop("kind", str(kind))], false), queryStatements: [] };
}

function externalParam(idValue: string): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[] } {
	return { descriptor: obj([prop("kind", str("external")), prop("id", str(idValue))], false), queryStatements: [] };
}

function buildMonitorMatch(
	state: TransformState,
	sourceFile: ts.SourceFile,
	decorator: DecoratorInfo,
	classId: string,
): QueryBuild | undefined {
	const match = decoratorObjectValue(decorator, "match");
	if (!match || !ts.isCallExpression(match)) {
		state.diagnostic(decorator.node, "@monitor requires match: query<...>()");
		return undefined;
	}
	const coreName = state.resolveCoreName(sourceFile, match.expression);
	if (coreName !== "query") {
		state.diagnostic(match, "@monitor match must be query<...>() from @rovy/core");
		return undefined;
	}
	return buildQueryFromMacro(state, match, `${classId}:match`);
}

function buildQueryFromMacro(state: TransformState, node: ts.CallExpression, queryId: string): QueryBuild {
	const typeArgs = node.typeArguments ?? ts.factory.createNodeArray();
	return buildQuery(state, typeArgs[0], [...typeArgs].slice(1), queryId, node);
}

function buildQueryFromType(state: TransformState, node: ts.TypeReferenceNode, queryId: string): QueryBuild {
	const typeArgs = node.typeArguments ?? ts.factory.createNodeArray();
	return buildQuery(state, typeArgs[0], [...typeArgs].slice(1), queryId, node);
}

function buildQuery(
	state: TransformState,
	termsNode: ts.TypeNode | undefined,
	filterNodes: readonly ts.TypeNode[],
	queryId: string,
	trace: ts.Node,
): QueryBuild {
	if (!termsNode || !ts.isTupleTypeNode(termsNode)) {
		state.diagnostic(trace, "Query/query first type argument must be a tuple");
		return {
			id: queryId,
			descriptor: obj([prop("id", str(queryId)), prop("terms", arr([])), prop("filters", obj([]))], true),
			termTypes: [],
		};
	}

	const termDescriptors = termsNode.elements.map((term) => lowerQueryTerm(state, term));
	const filters = lowerFilters(state, filterNodes);
	const descriptor = obj([prop("id", str(queryId)), prop("terms", arr(termDescriptors, true)), prop("filters", filters)], true);
	return { id: queryId, descriptor, termTypes: [...termsNode.elements] };
}

function lowerQueryTerm(state: TransformState, node: ts.TypeNode): ts.ObjectLiteralExpression {
	if (isEntityType(node)) return obj([prop("t", str("entity"))], false);
	if (ts.isTypeReferenceNode(node)) {
		const name = lastTypeName(node.typeName);
		if (name === "Optional") return obj([prop("t", str("optional")), prop("ctor", ctorArg(state, node))], false);
		if (name === "Trait") return obj([prop("t", str("trait")), prop("traitId", str(traitIdArg(state, node)))], false);
		if (name === "AllTraits") return obj([prop("t", str("allTraits")), prop("traitId", str(traitIdArg(state, node)))], false);
		if (name === "Pair") return obj([prop("t", str("pair")), prop("relation", ctorArg(state, node))], false);
		return obj([prop("t", str("component")), prop("ctor", entityNameToExpression(node.typeName))], false);
	}
	state.diagnostic(node, `unsupported query term '${node.getText()}'`);
	return obj([prop("t", str("entity"))], false);
}

function lowerFilters(state: TransformState, filterNodes: readonly ts.TypeNode[]): ts.ObjectLiteralExpression {
	const groups = new Map<string, ts.Expression[]>();
	for (const filter of filterNodes) {
		if (!ts.isTypeReferenceNode(filter)) {
			state.diagnostic(filter, `unsupported query filter '${filter.getText()}'`);
			continue;
		}
		const name = lastTypeName(filter.typeName);
		const outName = filterPropertyName(name);
		if (!outName) {
			state.diagnostic(filter, `unsupported query filter '${name}'`);
			continue;
		}
		const values = groups.get(outName) ?? [];
		groups.set(outName, values);
		if (name === "HasTrait") values.push(str(traitIdArg(state, filter)));
		else values.push(ctorArg(state, filter));
	}

	return obj(
		[...groups.entries()].map(([name, values]) => prop(name, arr(values))),
		true,
	);
}

function filterPropertyName(name: string): string | undefined {
	if (name === "With") return "with";
	if (name === "Without") return "without";
	if (name === "HasTrait") return "hasTrait";
	if (name === "HasPair") return "hasPair";
	if (name === "Changed") return "changed";
	if (name === "Added") return "added";
	if (name === "Removed") return "removed";
	return undefined;
}

function traitImplCalls(
	state: TransformState,
	rovy: ts.Expression,
	node: ts.ClassDeclaration,
	className: ts.Identifier,
): ts.Statement[] {
	const out: ts.Statement[] = [];
	for (const clause of node.heritageClauses ?? []) {
		if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
		for (const type of clause.types) {
			out.push(regCall(rovy, "__traitImpl", [str(state.stableIdForTypeNode(type)), className]));
		}
	}
	return out;
}

function nextMatchingTermIndex(terms: readonly ts.TypeNode[], param: ts.TypeNode | undefined, start: number): number {
	if (!param) return -1;
	for (let i = start; i < terms.length; i++) {
		const term = terms[i];
		if (isEntityType(term)) continue;
		if (queryTermMatchesParam(term, param)) return i;
	}
	return -1;
}

function queryTermMatchesParam(term: ts.TypeNode, param: ts.TypeNode): boolean {
	if (ts.isTypeReferenceNode(term)) {
		const name = lastTypeName(term.typeName);
		if (name === "Optional" || name === "Trait" || name === "AllTraits" || name === "Pair") {
			return term.typeArguments?.[0]?.getText() === param.getText() || term.getText() === param.getText();
		}
	}
	return term.getText() === param.getText();
}

function isEntityType(type: ts.TypeNode): boolean {
	return ts.isTypeReferenceNode(type) && lastTypeName(type.typeName) === "Entity";
}

function sameTypeAsExpression(type: ts.TypeNode, expression: ts.Expression): boolean {
	return type.getText() === expression.getText();
}

function isNetworkingType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
	exportName: string,
): boolean {
	const imports = state.getNetworkingImports(sourceFile);
	const name = type.typeName;
	if (ts.isIdentifier(name)) return imports.named.get(name.text) === exportName;
	return ts.isIdentifier(name.left) && imports.namespaces.has(name.left.text) && name.right.text === exportName;
}

function isNetFunctionCallExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
): boolean {
	if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "call") return false;
	const checker = state.typeChecker;
	if (checker === undefined) return false;
	const receiver = node.expression.expression;
	if (ts.isIdentifier(receiver)) {
		const symbol = checker.getSymbolAtLocation(receiver);
		for (const declaration of symbol?.declarations ?? []) {
			if (ts.isParameter(declaration) && declaration.type !== undefined && ts.isTypeReferenceNode(declaration.type)) {
				if (isNetworkingType(state, sourceFile, declaration.type, "NetClient")) return true;
				if (isNetworkingType(state, sourceFile, declaration.type, "NetFunc")) return true;
			}
		}
	}
	const type = checker.getTypeAtLocation(node.expression.expression);
	const symbol = type.symbol ?? type.aliasSymbol;
	if (symbol === undefined) return false;
	const declarations = symbol.declarations ?? [];
	return declarations.some((declaration) => {
		if (!ts.isClassDeclaration(declaration)) return false;
		if (declaration.name?.text !== "NetClient" && declaration.name?.text !== "NetFunc") return false;
		const file = declaration.getSourceFile();
		if (!file.fileName.includes("@rovy/networking") && !file.fileName.includes("packages/networking")) return false;
		const imports = state.getNetworkingImports(sourceFile);
		return imports.named.size > 0 || imports.namespaces.size > 0;
	});
}

function isScribeCommandCallExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
): boolean {
	if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "call") {
		return false;
	}
	const checker = state.typeChecker;
	if (checker === undefined) return false;
	const receiver = node.expression.expression;
	if (ts.isIdentifier(receiver)) {
		const symbol = checker.getSymbolAtLocation(receiver);
		for (const declaration of symbol?.declarations ?? []) {
			if (
				ts.isParameter(declaration) &&
				declaration.type !== undefined &&
				ts.isTypeReferenceNode(declaration.type) &&
				isScribeType(state, sourceFile, declaration.type, "ScribeCommand")
			) {
				return true;
			}
		}
	}
	const type = checker.getTypeAtLocation(receiver);
	const symbol = type.aliasSymbol ?? type.symbol;
	if (symbol === undefined) return false;
	return (symbol.declarations ?? []).some((declaration) => {
		if (
			!ts.isInterfaceDeclaration(declaration) &&
			!ts.isClassDeclaration(declaration)
		) {
			return false;
		}
		if (declaration.name?.text !== "ScribeCommand") return false;
		const fileName = declaration.getSourceFile().fileName;
		return fileName.includes("@rovy/scribe") ||
			fileName.includes("packages/scribe");
	});
}

function isDatastoreType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
	exportName: string,
): boolean {
	const imports = state.getDatastoreImports(sourceFile);
	const name = type.typeName;
	if (ts.isIdentifier(name)) return imports.named.get(name.text) === exportName;
	return ts.isIdentifier(name.left) && imports.namespaces.has(name.left.text) && name.right.text === exportName;
}

function isScribeType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
	exportName: string,
): boolean {
	const imports = state.getScribeImports(sourceFile);
	const name = type.typeName;
	if (ts.isIdentifier(name)) return imports.named.get(name.text) === exportName;
	return ts.isIdentifier(name.left) &&
		imports.namespaces.has(name.left.text) &&
		name.right.text === exportName;
}

interface ScribeDataParamInfo {
	readonly name: string;
	readonly prefix: string;
	readonly boundary: "client" | "server" | "both";
}

const SCRIBE_DATA_PARAM_INFOS: ReadonlyArray<ScribeDataParamInfo> = [
	{ name: "ScribeClientReader", prefix: "@rovy/scribe/client-reader:", boundary: "client" },
	{ name: "ScribeClientState", prefix: "@rovy/scribe/client-state:", boundary: "client" },
	{ name: "ScribeLocalWriter", prefix: "@rovy/scribe/local-writer:", boundary: "client" },
	{ name: "ScribeSharedReader", prefix: "@rovy/scribe/shared-reader:", boundary: "client" },
	{ name: "ScribeServerReader", prefix: "@rovy/scribe/server-reader:", boundary: "server" },
	{ name: "ScribeServerWriter", prefix: "@rovy/scribe/server-writer:", boundary: "server" },
	{ name: "ScribePersistence", prefix: "@rovy/scribe/persistence:", boundary: "server" },
	{ name: "ScribeLeaderboards", prefix: "@rovy/scribe/leaderboards:", boundary: "both" },
	{ name: "ScribeMonetization", prefix: "@rovy/scribe/monetization:", boundary: "server" },
	{ name: "ScribeOwnership", prefix: "@rovy/scribe/ownership:", boundary: "both" },
	{ name: "ScribeReceipts", prefix: "@rovy/scribe/receipts:", boundary: "server" },
	{ name: "ScribeCooldowns", prefix: "@rovy/scribe/cooldowns:", boundary: "server" },
	{ name: "ScribeMessaging", prefix: "@rovy/scribe/messaging:", boundary: "server" },
	{ name: "ScribeTestRuntime", prefix: "@rovy/scribe/testing:", boundary: "both" },
	{ name: "ScribeUnsafe", prefix: "@rovy/scribe/unsafe:", boundary: "both" },
];

function scribeDataParamInfo(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
): ScribeDataParamInfo | undefined {
	for (const info of SCRIBE_DATA_PARAM_INFOS) {
		if (isScribeType(state, sourceFile, type, info.name)) return info;
	}
	return undefined;
}

function isVideType(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
	exportName: string,
): boolean {
	const imports = state.getVideImports(sourceFile);
	const name = type.typeName;
	if (ts.isIdentifier(name)) return imports.named.get(name.text) === exportName;
	return ts.isIdentifier(name.left) && imports.namespaces.has(name.left.text) && name.right.text === exportName;
}

function netFunctionResultExpression(state: TransformState, decorator: DecoratorInfo): ts.Expression | undefined {
	const options = objectArg(decorator);
	return options ? propertyValue(options, "result") : undefined;
}

function classDeclarationForExpression(state: TransformState, expression: ts.Expression): ts.ClassDeclaration | undefined {
	const checker = state.typeChecker;
	if (checker === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(expression);
	const resolved = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
	for (const declaration of resolved?.declarations ?? []) {
		if (ts.isClassDeclaration(declaration)) return declaration;
	}
	return undefined;
}

function netFunctionIdFromTypeArg(state: TransformState, node: ts.TypeReferenceNode): string {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg || !ts.isTypeReferenceNode(typeArg)) {
		state.diagnostic(node, `${lastTypeName(node.typeName)} requires @netFunction request type argument`);
		return "unknown";
	}
	const declaration = typeDeclarationForTypeReference(state, typeArg);
	if (declaration !== undefined && ts.isClassDeclaration(declaration) && declaration.name !== undefined) {
		return classScopedId(state.stableIdForNode(declaration), declaration.name.text);
	}
	state.diagnostic(typeArg, `${lastTypeName(node.typeName)} requires an @netFunction request class`);
	return "unknown";
}

function scribeDataIdFromInjectedType(
	state: TransformState,
	node: ts.TypeReferenceNode,
): string {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg || !ts.isTypeQueryNode(typeArg)) {
		state.diagnostic(
			typeArg ?? node,
			`[rovy/scribe] ${lastTypeName(node.typeName)} requires typeof DataDefinition`,
		);
		return "unknown";
	}
	const declaration = declarationForEntityName(state, typeArg.exprName);
	if (declaration !== undefined) {
		return scribeDataIdForDeclaration(state, declaration.name);
	}
	state.diagnostic(
		typeArg,
		`[rovy/scribe] ${lastTypeName(node.typeName)} requires a scribeData declaration`,
	);
	return "unknown";
}

function scribeCommandIdFromTypeArg(
	state: TransformState,
	node: ts.TypeReferenceNode,
): string {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg || !ts.isTypeReferenceNode(typeArg)) {
		state.diagnostic(
			typeArg ?? node,
			`[rovy/scribe] ${lastTypeName(node.typeName)} requires an @scribeCommand class`,
		);
		return "unknown";
	}
	const declaration = typeDeclarationForTypeReference(state, typeArg);
	if (
		declaration !== undefined &&
		ts.isClassDeclaration(declaration) &&
		declaration.name !== undefined &&
		state.classInfo.get(declaration)?.decorators.includes("scribeCommand")
	) {
		return classScopedId(
			state.stableIdForNode(declaration),
			declaration.name.text,
		);
	}
	state.diagnostic(
		typeArg,
		`[rovy/scribe] ${lastTypeName(node.typeName)} requires an @scribeCommand class`,
	);
	return "unknown";
}

function datastoreEventCtorArg(
	state: TransformState,
	sourceFile: ts.SourceFile,
	node: ts.TypeReferenceNode,
): ts.Expression | undefined {
	const eventType = node.typeArguments?.[0];
	if (!eventType || !ts.isTypeReferenceNode(eventType)) return undefined;
	const eventKind = datastoreEventKind(state, sourceFile, eventType);
	if (eventKind === undefined) return undefined;
	const documentId = documentIdFromInjectedDocumentType(state, eventType);
	return call(field(state.addRovyDataImport(sourceFile), "eventCtor"), [str(eventKind), str(documentId)]);
}

function datastoreEventKind(
	state: TransformState,
	sourceFile: ts.SourceFile,
	type: ts.TypeReferenceNode,
): "opened" | "openFailed" | "changed" | "saved" | "saveFailed" | "closed" | undefined {
	if (isDatastoreType(state, sourceFile, type, "DocumentOpened")) return "opened";
	if (isDatastoreType(state, sourceFile, type, "DocumentOpenFailed")) return "openFailed";
	if (isDatastoreType(state, sourceFile, type, "DocumentChanged")) return "changed";
	if (isDatastoreType(state, sourceFile, type, "DocumentSaved")) return "saved";
	if (isDatastoreType(state, sourceFile, type, "DocumentSaveFailed")) return "saveFailed";
	if (isDatastoreType(state, sourceFile, type, "DocumentClosed")) return "closed";
	return undefined;
}

function documentIdFromInjectedDocumentType(state: TransformState, node: ts.TypeReferenceNode): string {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg) {
		state.diagnostic(node, `[rovy/datastore] ${lastTypeName(node.typeName)} requires typeof Document`);
		return "unknown";
	}
	if (!ts.isTypeQueryNode(typeArg)) {
		state.diagnostic(typeArg, `[rovy/datastore] ${lastTypeName(node.typeName)} requires typeof Document`);
		return "unknown";
	}
	const declaration = declarationForEntityName(state, typeArg.exprName);
	if (declaration !== undefined) return documentIdForDeclaration(state, declaration.name ?? declaration);
	return `${typeArg.exprName.getText().replace(/\s+/g, "")}`;
}

function declarationForEntityName(state: TransformState, name: ts.EntityName): ts.VariableDeclaration | undefined {
	const checker = state.typeChecker;
	if (checker === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(name);
	const resolved = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
	for (const declaration of resolved?.declarations ?? []) {
		if (ts.isVariableDeclaration(declaration)) return declaration;
	}
	return undefined;
}

function scribeDataDeclarationFromExpression(
	state: TransformState,
	expression: ts.Expression,
): ts.VariableDeclaration | undefined {
	const checker = state.typeChecker;
	if (checker === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(expression);
	const resolved = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
		? checker.getAliasedSymbol(symbol)
		: symbol;
	for (const declaration of resolved?.declarations ?? []) {
		if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) continue;
		const initializer = declaration.initializer;
		if (
			ts.isCallExpression(initializer) &&
			state.resolveScribeName(initializer.getSourceFile(), initializer.expression) === "scribeData"
		) {
			return declaration;
		}
	}
	return undefined;
}

function scribeDataIdFromExpression(
	state: TransformState,
	expression: ts.Expression,
	label: string,
): string {
	const declaration = scribeDataDeclarationFromExpression(state, expression);
	if (declaration !== undefined) {
		return scribeDataIdForDeclaration(state, declaration.name);
	}
	state.diagnostic(expression, `${label} must reference a scribeData declaration`);
	return "unknown";
}

function scribeCommandIdFromExpression(
	state: TransformState,
	expression: ts.Expression,
	label: string,
): string {
	const declaration = classDeclarationForExpression(state, expression);
	if (
		declaration !== undefined &&
		declaration.name !== undefined &&
		state.classInfo.get(declaration)?.decorators.includes("scribeCommand")
	) {
		return classScopedId(
			state.stableIdForNode(declaration),
			declaration.name.text,
		);
	}
	state.diagnostic(expression, `${label} must reference an @scribeCommand class`);
	return "unknown";
}

function classBoundaryFromInfo(
	state: TransformState,
	node: ts.ClassDeclaration,
): "client" | "server" | "shared" | undefined {
	const decorators = state.classInfo.get(node)?.decorators ?? [];
	if (decorators.includes("client")) return "client";
	if (decorators.includes("server")) return "server";
	if (decorators.includes("shared")) return "shared";
	return undefined;
}

function resolveScribeTemplatePath(
	state: TransformState,
	_sourceFile: ts.SourceFile,
	declaration: ts.VariableDeclaration,
	path: string,
): { readonly kind: "value" | "array" | "dictionary"; readonly serverOnly: boolean } | undefined {
	const initializer = declaration.initializer;
	if (!initializer || !ts.isCallExpression(initializer)) return undefined;
	const authored = initializer.arguments[0];
	if (!authored || !ts.isObjectLiteralExpression(authored)) return undefined;
	const schemaSourceFile = declaration.getSourceFile();
	let current = propertyValue(authored, "template");
	if (!current || !ts.isObjectLiteralExpression(current)) return undefined;
	let serverOnly = false;
	for (const segment of path.split(".")) {
		const unwrapped = unwrapScribeVisibilityExpression(
			state,
			schemaSourceFile,
			current,
			serverOnly,
		);
		current = unwrapped.expression;
		serverOnly = unwrapped.serverOnly;
		if (!ts.isObjectLiteralExpression(current)) return undefined;
		current = propertyValue(current, segment);
		if (current === undefined) return undefined;
	}
	const unwrapped = unwrapScribeVisibilityExpression(
		state,
		schemaSourceFile,
		current,
		serverOnly,
	);
	current = unwrapped.expression;
	serverOnly = unwrapped.serverOnly;
	const helper = scribeSchemaHelperCall(state, schemaSourceFile, current);
	return {
		kind: helper === "arrayOf"
			? "array"
			: helper === "dictOf"
				? "dictionary"
				: "value",
		serverOnly,
	};
}

function unwrapScribeVisibilityExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	expression: ts.Expression,
	initialServerOnly: boolean,
): { readonly expression: ts.Expression; readonly serverOnly: boolean } {
	let current = expression;
	let serverOnly = initialServerOnly;
	while (true) {
		const helper = scribeSchemaHelperCall(state, sourceFile, current);
		if (helper !== "serverOnly" && helper !== "shared" && helper !== "session") {
			break;
		}
		if (helper === "serverOnly") serverOnly = true;
		const next = (current as ts.CallExpression).arguments[0];
		if (next === undefined) break;
		current = next;
	}
	return { expression: current, serverOnly };
}

function ctorArg(state: TransformState, node: ts.TypeReferenceNode): ts.Expression {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg) {
		state.diagnostic(node, `${lastTypeName(node.typeName)} requires one type argument`);
		return id("undefined");
	}
	if (ts.isTypeReferenceNode(typeArg)) return entityNameToExpression(typeArg.typeName);
	if (ts.isTypeQueryNode(typeArg)) return entityNameToExpression(typeArg.exprName);
	state.diagnostic(typeArg, `unsupported constructor type '${typeArg.getText()}'`);
	return id("undefined");
}

function traitIdArg(state: TransformState, node: ts.TypeReferenceNode): string {
	const typeArg = node.typeArguments?.[0];
	if (!typeArg) {
		state.diagnostic(node, `${lastTypeName(node.typeName)} requires one type argument`);
		return "unknown";
	}
	return state.stableIdForTypeNode(typeArg);
}

function methodNamed(node: ts.ClassDeclaration, name: string): ts.MethodDeclaration | undefined {
	return node.members.find((member): member is ts.MethodDeclaration => {
		return ts.isMethodDeclaration(member) && member.name !== undefined && member.name.getText() === name;
	});
}

function staticPropertyNamed(node: ts.ClassDeclaration, name: string): ts.PropertyDeclaration | undefined {
	return node.members.find((member): member is ts.PropertyDeclaration => {
		return ts.isPropertyDeclaration(member) &&
			member.name !== undefined &&
			propertyNameText(member.name) === name &&
			(member.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
	});
}

function monitorMethods(node: ts.ClassDeclaration): MonitorMethod[] {
	return (["onEnter", "onExit", "onChange"] as const).filter((name) => methodNamed(node, name) !== undefined);
}

function objectArg(decorator: DecoratorInfo): ts.ObjectLiteralExpression | undefined {
	const first = decorator.args[0];
	return first && ts.isObjectLiteralExpression(first) ? first : undefined;
}

function decoratorObjectValue(decorator: DecoratorInfo, key: string): ts.Expression | undefined {
	return propertyValue(objectArg(decorator), key);
}

function maybeProp(name: string, value: ts.Expression | undefined): ts.PropertyAssignment | undefined {
	return value ? prop(name, value) : undefined;
}

function regCall(rovy: ts.Expression, name: string, args: readonly ts.Expression[]): ts.Statement {
	return stmt(call(field(rovy, name), args));
}

function buildWidgetVarStatement(
	state: TransformState,
	sourceFile: ts.SourceFile,
	fnDecl: ts.FunctionDeclaration,
	meta: ts.Expression,
): ts.Statement {
	const name = fnDecl.name;
	if (!name || !fnDecl.body) {
		state.diagnostic(fnDecl, "@widget requires named function with body");
		return ts.factory.createEmptyStatement();
	}
	const fnExpr = ts.factory.createFunctionExpression(
		undefined,
		fnDecl.asteriskToken,
		undefined,
		fnDecl.typeParameters,
		fnDecl.parameters,
		fnDecl.type,
		fnDecl.body,
	);
	const widgetCall = call(field(state.addRovyUiImport(sourceFile), "__widget"), [fnExpr, meta]);
	const exportMod = fnDecl.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
	const modifiers = exportMod ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined;
	return ts.factory.createVariableStatement(
		modifiers,
		ts.factory.createVariableDeclarationList(
			[ts.factory.createVariableDeclaration(name, undefined, undefined, widgetCall)],
			ts.NodeFlags.Const,
		),
	);
}

function regQuery(rovy: ts.Expression, descriptor: ts.ObjectLiteralExpression): ts.Statement {
	return regCall(rovy, "__query", [descriptor]);
}

function isExpression(value: ts.Expression | undefined): value is ts.Expression {
	return value !== undefined;
}

function emptyParams(): ParamBuild {
	return { descriptor: arr([], true), queryStatements: [] };
}

function printExpression(expression: ts.Expression, sourceFile: ts.SourceFile): string {
	return ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Expression, expression, sourceFile);
}

function lowerPrefabParams(
	state: TransformState,
	sourceFile: ts.SourceFile,
	params: ts.NodeArray<ts.ParameterDeclaration>,
	classId: string,
): ParamBuild {
	const EXCLUDED = new Set(["Query", "EventReader", "Local"]);
	const descriptors: ts.ObjectLiteralExpression[] = [];
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		const type = param.type;
		if (type && ts.isTypeReferenceNode(type)) {
			const name = lastTypeName(type.typeName);
			if (EXCLUDED.has(name)) {
				state.diagnostic(param, `@prefab build() cannot inject ${name} — excluded in v1`);
				descriptors.push(obj([prop("kind", str("world"))], false));
				continue;
			}
		}
		const lowered = lowerParam(state, sourceFile, param, {
			kind: "system",
			classId,
			paramIndex: i,
			localIndex: 0,
		});
		descriptors.push(lowered.descriptor);
	}
	return { descriptor: arr(descriptors, true), queryStatements: [] };
}

function hasLeadingStyleParam(state: TransformState, sourceFile: ts.SourceFile, node: ts.FunctionDeclaration): boolean {
	const first = node.parameters[0];
	return first?.type !== undefined && isUiType(state, sourceFile, first.type, "Style");
}

function isUiType(state: TransformState, sourceFile: ts.SourceFile, type: ts.TypeNode, exportName: string): boolean {
	if (!ts.isTypeReferenceNode(type)) return false;
	const imports = state.getUiImports(sourceFile);
	const name = type.typeName;
	if (ts.isIdentifier(name)) return imports.named.get(name.text) === exportName || name.text === exportName;
	return ts.isIdentifier(name.left) && imports.namespaces.has(name.left.text) && name.right.text === exportName;
}

function classScopedId(moduleId: string, className: string): string {
	return `${moduleId}@${className}`;
}

export { TransformerConfig };
