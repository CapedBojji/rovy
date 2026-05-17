import { RojoResolver } from "@roblox-ts/rojo-resolver";
import ts from "typescript";
import { importNamed } from "./ast";

export interface TransformerConfig {
	readonly [key: string]: unknown;
}

export interface CoreImports {
	readonly named: Map<string, string>;
	readonly namespaces: Set<string>;
}

export interface DecoratedClassInfo {
	readonly node: ts.ClassDeclaration;
	readonly decorators: ReadonlyArray<string>;
}

export class TransformState {
	readonly typeChecker?: ts.TypeChecker;
	readonly currentDirectory: string;
	readonly rootDir: string;
	readonly outDir: string;
	readonly classInfo = new Map<ts.ClassDeclaration, DecoratedClassInfo>();
	readonly implementedInterfaces = new Map<ts.ClassDeclaration, ts.ExpressionWithTypeArguments[]>();

	private readonly coreImportCache = new Map<string, CoreImports>();
	private readonly pendingRovyImports = new Map<string, ts.Identifier>();
	private readonly rojoResolver?: RojoResolver;

	constructor(
		readonly program: Partial<ts.Program>,
		readonly context: ts.TransformationContext,
		readonly config: TransformerConfig,
	) {
		this.typeChecker = program.getTypeChecker?.();
		this.currentDirectory = normalizePath(program.getCurrentDirectory?.() ?? "");
		const options = program.getCompilerOptions?.() ?? {};
		this.rootDir = this.absolute(options.rootDir ?? this.currentDirectory);
		this.outDir = this.absolute(options.outDir ?? this.rootDir);
		this.rojoResolver = this.createRojoResolver();
		this.prepass();
	}

	getCoreImports(file: ts.SourceFile): CoreImports {
		const cached = this.coreImportCache.get(file.fileName);
		if (cached) return cached;

		const named = new Map<string, string>();
		const namespaces = new Set<string>();
		for (const statement of file.statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (statement.moduleSpecifier.text !== "@rovy/core") continue;
			const clause = statement.importClause;
			if (!clause) continue;
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const spec of clause.namedBindings.elements) {
					const exported = spec.propertyName?.text ?? spec.name.text;
					named.set(spec.name.text, exported);
				}
			} else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
				namespaces.add(clause.namedBindings.name.text);
			}
		}

		const imports = { named, namespaces };
		this.coreImportCache.set(file.fileName, imports);
		return imports;
	}

	resolveCoreName(file: ts.SourceFile, expression: ts.Expression): string | undefined {
		const imports = this.getCoreImports(file);
		if (ts.isIdentifier(expression)) return imports.named.get(expression.text);
		if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
			if (imports.namespaces.has(expression.expression.text)) return expression.name.text;
		}
		return undefined;
	}

	isRovyValue(file: ts.SourceFile, expression: ts.Expression): boolean {
		const imports = this.getCoreImports(file);
		if (ts.isIdentifier(expression)) return imports.named.get(expression.text) === "rovy";
		if (
			ts.isPropertyAccessExpression(expression) &&
			expression.name.text === "rovy" &&
			ts.isIdentifier(expression.expression)
		) {
			return imports.namespaces.has(expression.expression.text);
		}
		return false;
	}

	addRovyImport(file: ts.SourceFile): ts.Identifier {
		for (const [local, exported] of this.getCoreImports(file).named) {
			if (exported === "rovy") return ts.factory.createIdentifier(local);
		}

		let identifier = this.pendingRovyImports.get(file.fileName);
		if (!identifier) {
			identifier = ts.factory.createUniqueName("__rovy", ts.GeneratedIdentifierFlags.Optimistic);
			this.pendingRovyImports.set(file.fileName, identifier);
		}
		return identifier;
	}

	withPendingImports(file: ts.SourceFile, statements: ReadonlyArray<ts.Statement>): ts.Statement[] {
		const rovyImport = this.pendingRovyImports.get(file.fileName);
		if (!rovyImport) return [...statements];
		return [importNamed("@rovy/core", "rovy", rovyImport.text), ...statements];
	}

	diagnostic(node: ts.Node, messageText: string): void {
		const file = node.getSourceFile();
		const diagnostic: ts.DiagnosticWithLocation = {
			category: ts.DiagnosticCategory.Error,
			code: 0,
			file,
			start: node.getStart(file),
			length: node.getWidth(file),
			messageText: `[rovy-transformer] ${messageText}`,
		};
		(this.context as unknown as { addDiagnostic?: (diagnostic: ts.Diagnostic) => void }).addDiagnostic?.(diagnostic);
	}

	stableIdForNode(node: ts.Node): string {
		return modulePath(this.currentDirectory, node.getSourceFile().fileName);
	}

	stableIdForTypeNode(node: ts.TypeNode): string {
		const symbol = this.symbolForTypeNode(node);
		const declaration = symbol?.declarations?.[0];
		if (declaration) return this.stableIdForNode(declaration);
		return node.getText().replace(/\s+/g, "");
	}

	decoratorsForTypeNode(node: ts.TypeNode): ReadonlyArray<string> | undefined {
		const symbol = this.symbolForTypeNode(node);
		for (const declaration of symbol?.declarations ?? []) {
			if (!ts.isClassDeclaration(declaration)) continue;
			return this.classInfo.get(declaration)?.decorators;
		}
		return undefined;
	}

	hasDecoratorOnTypeNode(node: ts.TypeNode, decorator: string): boolean {
		return this.decoratorsForTypeNode(node)?.includes(decorator) ?? false;
	}

	lowerLoadPath(node: ts.StringLiteral): ts.Expression {
		const rbxPath = this.resolveRbxPath(node.text);
		if (!rbxPath) {
			this.diagnostic(node, `could not resolve rovy.loadPaths path '${node.text}' through Rojo`);
			return node;
		}

		let expr: ts.Expression = ts.factory.createCallExpression(
			ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("game"), "GetService"),
			undefined,
			[ts.factory.createStringLiteral(rbxPath[0])],
		);

		for (const part of rbxPath.slice(1)) {
			expr = ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(expr, "WaitForChild"), undefined, [
				ts.factory.createStringLiteral(part),
			]);
		}
		return expr;
	}

	private symbolForTypeNode(node: ts.TypeNode): ts.Symbol | undefined {
		if (!this.typeChecker) return undefined;
		const type = this.typeChecker.getTypeFromTypeNode(node);
		const alias = type.aliasSymbol ? skipAlias(this.typeChecker, type.aliasSymbol) : undefined;
		if (alias) return alias;
		return type.symbol ? skipAlias(this.typeChecker, type.symbol) : undefined;
	}

	private prepass(): void {
		const files = this.program.getSourceFiles?.() ?? [];
		for (const file of files) {
			if (file.isDeclarationFile) continue;
			this.visitPrepassFile(file);
		}
	}

	private visitPrepassFile(file: ts.SourceFile): void {
		const visit = (node: ts.Node): void => {
			if (ts.isClassDeclaration(node)) {
				const decorators = (ts.getDecorators(node) ?? [])
					.map((decorator) => decoratorName(this, file, decorator))
					.filter((name): name is string => name !== undefined);
				if (decorators.length > 0) this.classInfo.set(node, { node, decorators });
				const impls = node.heritageClauses
					?.filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
					.flatMap((clause) => [...clause.types]);
				if (impls && impls.length > 0) this.implementedInterfaces.set(node, impls);
			}
			ts.forEachChild(node, visit);
		};
		visit(file);
	}

	private createRojoResolver(): RojoResolver | undefined {
		const configuredPath =
			typeof this.config.rojo === "string"
				? this.absolute(this.config.rojo)
				: RojoResolver.findRojoConfigFilePath(this.currentDirectory).path;
		if (!configuredPath) return undefined;
		try {
			return RojoResolver.fromPath(configuredPath);
		} catch {
			return undefined;
		}
	}

	private resolveRbxPath(sourcePath: string): ReadonlyArray<string> | undefined {
		if (!this.rojoResolver) return undefined;
		const absoluteSource = this.absolute(sourcePath);
		const output = this.outputPathFor(absoluteSource);
		const direct = this.rojoResolver.getRbxPathFromFilePath(output);
		if (direct) return direct;
		for (const partition of this.rojoResolver.getPartitions()) {
			const fsPath = normalizePath(partition.fsPath);
			if (!isDescendant(output, fsPath)) continue;
			const rel = relative(fsPath, output);
			if (rel === "") return partition.rbxPath;
			const parts = rel
				.split("/")
				.filter((part) => part !== "")
				.map((part) => part.replace(/\.lua$/, "").replace(/\.tsx?$/, ""))
				.filter((part) => part !== "init");
			return [...partition.rbxPath, ...parts];
		}
		return undefined;
	}

	private outputPathFor(filePath: string): string {
		const normalized = normalizePath(filePath);
		if (isDescendant(normalized, this.rootDir)) {
			return join(this.outDir, relative(this.rootDir, normalized));
		}
		return normalized;
	}

	private absolute(value: string): string {
		const normalized = normalizePath(value);
		if (isAbsolute(normalized)) return normalized;
		if (this.currentDirectory === "") return normalized;
		return join(this.currentDirectory, normalized);
	}
}

export function decoratorName(state: TransformState, file: ts.SourceFile, decorator: ts.Decorator): string | undefined {
	const expression = decorator.expression;
	const target = ts.isCallExpression(expression) ? expression.expression : expression;
	return state.resolveCoreName(file, target);
}

export function normalizePath(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function isAbsolute(value: string): boolean {
	return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function join(left: string, right: string): string {
	if (left === "") return normalizePath(right);
	if (right === "") return normalizePath(left);
	return normalizePath(`${left}/${right}`);
}

function relative(from: string, to: string): string {
	const cleanFrom = normalizePath(from);
	const cleanTo = normalizePath(to);
	if (cleanTo === cleanFrom) return "";
	if (cleanTo.startsWith(`${cleanFrom}/`)) return cleanTo.slice(cleanFrom.length + 1);
	return cleanTo;
}

function isDescendant(child: string, parent: string): boolean {
	const cleanChild = normalizePath(child);
	const cleanParent = normalizePath(parent);
	return cleanChild === cleanParent || cleanChild.startsWith(`${cleanParent}/`);
}

function modulePath(root: string, fileName: string): string {
	const noExt = normalizePath(fileName)
		.replace(/\.d\.ts$/, "")
		.replace(/\.tsx?$/, "");
	return relative(root, noExt);
}

function skipAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
	if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) return checker.getAliasedSymbol(symbol);
	return symbol;
}
