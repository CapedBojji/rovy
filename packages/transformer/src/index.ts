import ts from "typescript";
import {
	arr,
	bool,
	call,
	entityNameToExpression,
	field,
	id,
	lastTypeName,
	num,
	obj,
	prop,
	propertyValue,
	stmt,
	str,
	stripUndefinedProperties,
} from "./ast";
import { decoratorName, TransformState, TransformerConfig } from "./state";

export interface TransformerExtras {
	readonly ts: typeof ts;
}

const DECORATORS = new Set([
	"component",
	"resource",
	"event",
	"system",
	"observer",
	"monitor",
	"relation",
	"schedule",
	"set",
	"plugin",
]);

type MonitorMethod = "onEnter" | "onExit" | "onChange";

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
	const visitor = createVisitor(state, sourceFile);
	const statements: ts.Statement[] = [];

	for (const statement of sourceFile.statements) {
		if (ts.isClassDeclaration(statement)) {
			const transformed = transformClass(state, sourceFile, statement, visitor);
			statements.push(...transformed);
		} else {
			const visited = ts.visitNode(statement, visitor, ts.isStatement);
			if (visited) statements.push(visited);
		}
	}

	return ts.factory.updateSourceFile(sourceFile, state.withPendingImports(sourceFile, statements));
}

function createVisitor(state: TransformState, sourceFile: ts.SourceFile): ts.Visitor {
	const visitor: ts.Visitor = (node) => {
		if (ts.isCallExpression(node)) {
			const rewritten = transformCall(state, sourceFile, node, visitor);
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
	const transformedClass = ts.visitEachChild(stripped, visitor, state.context);
	const classId = state.stableIdForNode(node);

	for (const decorator of decorators) {
		switch (decorator.name) {
			case "component":
				afterStatements.push(regCall(rovy, "__component", [className, str(classId)]));
				afterStatements.push(...traitImplCalls(state, rovy, node, className));
				break;
			case "resource":
				afterStatements.push(regCall(rovy, "__resource", [className, str(classId)]));
				break;
			case "event":
				afterStatements.push(regCall(rovy, "__event", [className, decorator.args[0]].filter(isExpression)));
				break;
			case "system": {
				const method = methodNamed(node, "run");
				const params = method ? lowerParams(state, sourceFile, method.parameters, { kind: "system", classId }) : emptyParams();
				queryStatements.push(...params.queryStatements);
				afterStatements.push(regCall(rovy, "__system", [className, buildSystemMeta(state, decorator, classId, params)]));
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
				afterStatements.push(regCall(rovy, "__observer", [className, buildObserverMeta(state, decorator, params)]));
				break;
			}
			case "monitor": {
				const match = buildMonitorMatch(state, sourceFile, decorator, classId);
				if (match) queryStatements.push(regCall(rovy, "__query", [match.descriptor]));
				const methods = monitorMethods(node);
				const params = lowerMonitorParams(state, sourceFile, node, methods, match, classId);
				queryStatements.push(...params.queryStatements);
				afterStatements.push(regCall(rovy, "__monitor", [className, buildMonitorMeta(match?.id ?? `${classId}:match`, methods, params)]));
				break;
			}
			case "relation":
				afterStatements.push(regCall(rovy, "__relation", [className, buildRelationMeta(decorator)]));
				break;
			case "schedule":
				afterStatements.push(regCall(rovy, "__schedule", [className, buildScheduleMeta(decorator)]));
				break;
			case "set":
			case "plugin":
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

	if (decorators.some((d) => d.name === "resource")) {
		const ctor = node.members.find(ts.isConstructorDeclaration);
		for (const param of ctor?.parameters ?? []) {
			if (!param.questionToken && !param.initializer) {
				state.diagnostic(param, "@resource constructor params must be optional or defaulted");
			}
		}
	}

	if (decorators.some((d) => d.name === "system" || d.name === "observer") && !methodNamed(node, "run")) {
		state.diagnostic(node, "@system/@observer classes require run(...)");
	}
}

function buildSystemMeta(
	state: TransformState,
	decorator: DecoratorInfo,
	classId: string,
	params: ParamBuild,
): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	const schedule = propertyValue(options, "schedule");
	if (!schedule) state.diagnostic(decorator.node, "@system requires a schedule option");
	return obj(
		stripUndefinedProperties([
			prop("id", str(classId)),
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

function buildObserverMeta(state: TransformState, decorator: DecoratorInfo, params: ParamBuild): ts.ObjectLiteralExpression {
	const eventExpr = decoratorObjectValue(decorator, "event");
	if (!eventExpr) state.diagnostic(decorator.node, "@observer requires an event option");
	return obj(
		[
			prop("event", eventExpr ?? id("undefined")),
			prop("priority", decoratorObjectValue(decorator, "priority") ?? num(0)),
			prop("params", params.descriptor),
		],
		true,
	);
}

function buildMonitorMeta(matchId: string, methods: readonly MonitorMethod[], params: ParamBuild): ts.ObjectLiteralExpression {
	return obj([prop("match", str(matchId)), prop("methods", arr(methods.map(str))), prop("params", params.descriptor)], true);
}

function buildRelationMeta(decorator: DecoratorInfo): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	return obj(
		[
			prop("exclusive", propertyValue(options, "exclusive") ?? bool(false)),
			prop("onTargetDelete", propertyValue(options, "onTargetDelete") ?? str("none")),
			prop("onDelete", propertyValue(options, "onDelete") ?? str("none")),
		],
		true,
	);
}

function buildScheduleMeta(decorator: DecoratorInfo): ts.ObjectLiteralExpression {
	const options = objectArg(decorator);
	return obj([prop("runOnStart", propertyValue(options, "runOnStart") ?? bool(false))], true);
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
	}

	state.diagnostic(param, `unsupported injected param type '${type.getText()}'`);
	return { descriptor: obj([prop("kind", str("world"))], false), queryStatements: [] };
}

function simpleParam(kind: string): { descriptor: ts.ObjectLiteralExpression; queryStatements: readonly ts.Statement[] } {
	return { descriptor: obj([prop("kind", str(kind))], false), queryStatements: [] };
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

export { TransformerConfig };
