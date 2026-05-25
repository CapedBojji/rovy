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

export interface TransformerExtras {
	readonly ts: typeof ts;
}

const DECORATORS = new Set([
	"component",
	"collect",
	"resource",
	"prefab",
	"event",
	"netEvent",
	"system",
	"observer",
	"monitor",
	"relation",
	"schedule",
	"set",
	"plugin",
]);

type MonitorMethod = "onEnter" | "onExit" | "onChange";

const UI_KEYED_HELPERS = new Map([
	["useState", "__useState"],
	["useEffect", "__useEffect"],
	["useInstance", "__useInstance"],
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
	const visitor = createVisitor(state, sourceFile, widgetCallers);
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

	return ts.factory.updateSourceFile(sourceFile, state.withPendingImports(sourceFile, statements));
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
		if (document === undefined) return ts.visitEachChild(declaration, visitor, state.context);
		return ts.factory.updateVariableDeclaration(
			declaration,
			declaration.name,
			declaration.exclamationToken,
			declaration.type,
			document,
		);
	});
	return ts.factory.updateVariableStatement(
		statement,
		statement.modifiers,
		ts.factory.updateVariableDeclarationList(statement.declarationList, declarations),
	);
}

type DocumentDeclarationKind = "player" | "keyed" | "shared";

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
): ts.Visitor {
	const visitor: ts.Visitor = (node) => {
		if (ts.isCallExpression(node)) {
			const rewritten = transformCall(state, sourceFile, node, visitor, widgetCallers);
			if (rewritten) return rewritten;
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
		state.diagnostic(node, "query<...>() is only supported inside @monitor({ match })");
		return node;
	}

	if (coreName === "$collectRef") {
		state.diagnostic(node, "$collectRef<T>() is only supported as a @resource field initializer");
		return node;
	}

	if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "loadPaths") {
		if (state.isRovyValue(sourceFile, node.expression.expression)) {
			return ts.factory.updateCallExpression(
				node,
				node.expression,
				node.typeArguments,
				node.arguments.map((arg) => {
					if (ts.isStringLiteral(arg)) return state.lowerLoadPath(arg);
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
	const isResource = decorators.some((d) => d.name === "resource");
	const resourceCollectRefs = isResource ? collectRefBindings(state, sourceFile, stripped) : [];
	const resourceReadyClass = isResource ? stripCollectRefInitializers(state, sourceFile, stripped) : stripped;
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
					const meta = buildResourceMeta(pluginBinding, resourceCollectRefs);
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
	if (node.typeParameters && decorators.some((d) => d.name === "system" || d.name === "observer" || d.name === "monitor")) {
		state.diagnostic(node, "@system/@observer/@monitor classes cannot be generic in v1");
	}

	const zeroArgDecorated = decorators.find((d) => d.name === "resource" || d.name === "collect" || d.name === "prefab");
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

	if (decorators.some((d) => d.name === "netEvent") && decorators.some((d) => d.name === "event")) {
		state.diagnostic(node, "@netEvent implies @event; remove the extra @event decorator");
	}
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
): ts.ObjectLiteralExpression | undefined {
	const properties = stripUndefinedProperties([
		maybeProp("plugin", plugin?.expr),
		collectorRefs.length > 0 ? prop("collectorRefs", arr(collectorRefs, true)) : undefined,
	]);
	return properties.length > 0 ? obj(properties, true) : undefined;
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
	return call(field(state.addTImport(sourceFile), "tuple"), validators);
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
				field(t, "tuple"),
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

function alwaysTrueValidator(): ts.ArrowFunction {
	return arrow(bool(true));
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
				return externalParam("@rovy/networking/NetEventContext");
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
