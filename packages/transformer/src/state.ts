import fs from "node:fs";
import { RojoResolver } from "@roblox-ts/rojo-resolver";
import ts from "typescript";
import { importDefault, importNamed } from "./ast";
import {
	type ResolvedRovyConfig,
	type RovyBlinkConfig,
	type RovyNetConfig,
	loadRovyConfig,
} from "./rovy-config";

export interface TransformerConfig {
	readonly [key: string]: unknown;
}

export interface CoreImports {
	readonly defaultName?: string;
	readonly named: Map<string, string>;
	readonly namespaces: Set<string>;
}

export interface DecoratedClassInfo {
	readonly node: ts.ClassDeclaration;
	readonly decorators: ReadonlyArray<string>;
}

export interface PluginOwnerInfo {
	readonly node: ts.ClassDeclaration;
	readonly className: string;
	readonly moduleId: string;
	readonly rootDir: string;
	readonly subtreeRoot: boolean;
	readonly exported: boolean;
}

export class TransformState {
	readonly typeChecker?: ts.TypeChecker;
	readonly currentDirectory: string;
	readonly rootDir: string;
	readonly outDir: string;
	readonly rovyConfig?: ResolvedRovyConfig;
	readonly classInfo = new Map<ts.ClassDeclaration, DecoratedClassInfo>();
	readonly implementedInterfaces = new Map<ts.ClassDeclaration, ts.ExpressionWithTypeArguments[]>();
	readonly pluginOwners: Array<PluginOwnerInfo> = [];

	private readonly coreImportCache = new Map<string, CoreImports>();
	private readonly networkingImportCache = new Map<string, CoreImports>();
	private readonly datastoreImportCache = new Map<string, CoreImports>();
	private readonly uiImportCache = new Map<string, CoreImports>();
	private readonly pendingRovyImports = new Map<string, ts.Identifier>();
	private readonly pendingRovyNetImports = new Map<string, ts.Identifier>();
	private readonly pendingRovyDataImports = new Map<string, ts.Identifier>();
	private readonly pendingRovyUiImports = new Map<string, ts.Identifier>();
	private readonly pendingTImports = new Map<string, ts.Identifier>();
	private readonly pendingPluginImports = new Map<string, Map<string, ts.Identifier>>();
	private readonly widgetCallsiteCounters = new Map<string, number>();
	private uiWidgetExportNames?: Set<string>;
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
		this.rovyConfig = loadRovyConfig(this.currentDirectory, config, {
			absolute: (value) => this.absolute(value),
			exists: (path) => fs.existsSync(path),
		});
		this.rojoResolver = this.createRojoResolver();
		this.prepass();
	}

	getCoreImports(file: ts.SourceFile): CoreImports {
		return this.getImportsForModule(file, "@rovy/core", this.coreImportCache);
	}

	getNetworkingImports(file: ts.SourceFile): CoreImports {
		return this.getImportsForModule(file, "@rovy/networking", this.networkingImportCache);
	}

	getDatastoreImports(file: ts.SourceFile): CoreImports {
		return this.getImportsForModule(file, "@rovy/datastore", this.datastoreImportCache);
	}

	getUiImports(file: ts.SourceFile): CoreImports {
		return this.getImportsForModule(file, "@rovy/ui", this.uiImportCache);
	}

	private getImportsForModule(file: ts.SourceFile, moduleName: string, cache: Map<string, CoreImports>): CoreImports {
		const cached = cache.get(file.fileName);
		if (cached) return cached;

		const named = new Map<string, string>();
		const namespaces = new Set<string>();
		for (const statement of file.statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (statement.moduleSpecifier.text !== moduleName) continue;
			const clause = statement.importClause;
			if (!clause) continue;
			const defaultName = clause.name?.text;
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const spec of clause.namedBindings.elements) {
					const exported = spec.propertyName?.text ?? spec.name.text;
					named.set(spec.name.text, exported);
				}
			} else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
				namespaces.add(clause.namedBindings.name.text);
			}
			if (defaultName !== undefined) named.set(defaultName, "default");
		}

		const defaultName = [...named.entries()].find(([, exported]) => exported === "default")?.[0];
		const imports = { defaultName, named, namespaces };
		cache.set(file.fileName, imports);
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

	resolveNetworkingName(file: ts.SourceFile, expression: ts.Expression): string | undefined {
		const imports = this.getNetworkingImports(file);
		if (ts.isIdentifier(expression)) return imports.named.get(expression.text);
		if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
			if (imports.namespaces.has(expression.expression.text)) return expression.name.text;
		}
		return undefined;
	}

	resolveDatastoreName(file: ts.SourceFile, expression: ts.Expression): string | undefined {
		const imports = this.getDatastoreImports(file);
		if (ts.isIdentifier(expression)) return imports.named.get(expression.text);
		if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
			if (imports.namespaces.has(expression.expression.text)) return expression.name.text;
		}
		return undefined;
	}

	resolveUiName(file: ts.SourceFile, expression: ts.Expression): string | undefined {
		const imports = this.getUiImports(file);
		if (ts.isIdentifier(expression)) return imports.named.get(expression.text);
		if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
			if (imports.namespaces.has(expression.expression.text)) return expression.name.text;
			if (imports.defaultName === expression.expression.text) return expression.name.text;
		}
		return undefined;
	}

	// True when the `@rovy/ui` export named `uiName` carries a `/** @widget */`
	// JSDoc tag. This is the single source of truth for which built-in widget
	// calls get a stable callsite key inserted (replaces a hardcoded name list).
	uiExportHasWidgetTag(file: ts.SourceFile, uiName: string): boolean {
		return this.collectUiWidgetExportNames(file).has(uiName);
	}

	private collectUiWidgetExportNames(file: ts.SourceFile): Set<string> {
		if (this.uiWidgetExportNames) return this.uiWidgetExportNames;
		const names = new Set<string>();
		this.uiWidgetExportNames = names;
		const checker = this.typeChecker;
		if (!checker) return names;

		let moduleSpecifier: ts.StringLiteral | undefined;
		for (const statement of file.statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (statement.moduleSpecifier.text !== "@rovy/ui") continue;
			moduleSpecifier = statement.moduleSpecifier;
			break;
		}
		if (!moduleSpecifier) return names;

		const moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);
		if (!moduleSymbol) return names;

		for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
			const resolved =
				(exportSymbol.flags & ts.SymbolFlags.Alias) !== 0 ? skipAlias(checker, exportSymbol) : exportSymbol;
			const declarations = resolved.declarations ?? exportSymbol.declarations ?? [];
			for (const declaration of declarations) {
				if (declarationHasWidgetTag(declaration)) {
					names.add(exportSymbol.name);
					break;
				}
			}
		}
		return names;
	}

	fileUsesNetworking(file: ts.SourceFile): boolean {
		const imports = this.getNetworkingImports(file);
		return imports.named.size > 0 || imports.namespaces.size > 0;
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

	addRovyNetImport(file: ts.SourceFile): ts.Identifier {
		for (const [local, exported] of this.getNetworkingImports(file).named) {
			if (exported === "rovyNet") return ts.factory.createIdentifier(local);
		}

		let identifier = this.pendingRovyNetImports.get(file.fileName);
		if (!identifier) {
			identifier = ts.factory.createUniqueName("__rovyNet", ts.GeneratedIdentifierFlags.Optimistic);
			this.pendingRovyNetImports.set(file.fileName, identifier);
		}
		return identifier;
	}

	addRovyDataImport(file: ts.SourceFile): ts.Identifier {
		for (const [local, exported] of this.getDatastoreImports(file).named) {
			if (exported === "rovyData") return ts.factory.createIdentifier(local);
		}

		let identifier = this.pendingRovyDataImports.get(file.fileName);
		if (!identifier) {
			identifier = ts.factory.createUniqueName("__rovyData", ts.GeneratedIdentifierFlags.Optimistic);
			this.pendingRovyDataImports.set(file.fileName, identifier);
		}
		return identifier;
	}

	addRovyUiImport(file: ts.SourceFile): ts.Identifier {
		const existingDefault = this.getUiImports(file).defaultName;
		if (existingDefault !== undefined) return ts.factory.createIdentifier(existingDefault);
		for (const [local, exported] of this.getUiImports(file).named) {
			if (exported === "rovyUi") return ts.factory.createIdentifier(local);
		}

		let identifier = this.pendingRovyUiImports.get(file.fileName);
		if (!identifier) {
			identifier = ts.factory.createUniqueName("__rovyUi", ts.GeneratedIdentifierFlags.Optimistic);
			this.pendingRovyUiImports.set(file.fileName, identifier);
		}
		return identifier;
	}

	addTImport(file: ts.SourceFile): ts.Identifier {
		for (const statement of file.statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (statement.moduleSpecifier.text !== "@rbxts/t") continue;
			const clause = statement.importClause;
			if (clause?.name !== undefined) return ts.factory.createIdentifier(clause.name.text);
			if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
				return ts.factory.createIdentifier(clause.namedBindings.name.text);
			}
			if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const binding of clause.namedBindings.elements) {
					if ((binding.propertyName?.text ?? binding.name.text) === "t") {
						return ts.factory.createIdentifier(binding.name.text);
					}
				}
			}
		}

		let identifier = this.pendingTImports.get(file.fileName);
		if (!identifier) {
			identifier = ts.factory.createUniqueName("__t", ts.GeneratedIdentifierFlags.Optimistic);
			this.pendingTImports.set(file.fileName, identifier);
		}
		return identifier;
	}

	withPendingImports(file: ts.SourceFile, statements: ReadonlyArray<ts.Statement>): ts.Statement[] {
		const rovyImport = this.pendingRovyImports.get(file.fileName);
		const rovyNetImport = this.pendingRovyNetImports.get(file.fileName);
		const rovyDataImport = this.pendingRovyDataImports.get(file.fileName);
		const rovyUiImport = this.pendingRovyUiImports.get(file.fileName);
		const tImport = this.pendingTImports.get(file.fileName);
		const imports: ts.Statement[] = [];
		if (rovyImport) imports.push(importNamed("@rovy/core", "rovy", rovyImport.text));
		if (rovyNetImport) imports.push(importNamed("@rovy/networking", "rovyNet", rovyNetImport.text));
		if (rovyDataImport) imports.push(importNamed("@rovy/datastore", "rovyData", rovyDataImport.text));
		if (rovyUiImport) imports.push(importDefault("@rovy/ui", rovyUiImport.text));
		if (tImport) imports.push(importNamed("@rbxts/t", "t", tImport.text));
		const pluginImports = this.pendingPluginImports.get(file.fileName);
		if (pluginImports) {
			for (const [key, localName] of pluginImports) {
				const [moduleName, exportedName] = key.split("::");
				imports.push(importNamed(moduleName, exportedName, localName.text));
			}
		}
		return [...imports, ...statements];
	}

	netRuntimeConfigStatement(file: ts.SourceFile): ts.Statement | undefined {
		if (!this.fileUsesNetworking(file)) return undefined;
		const rovyNet = this.addRovyNetImport(file);
		return ts.factory.createExpressionStatement(
			ts.factory.createCallExpression(
				ts.factory.createPropertyAccessExpression(rovyNet, "__configureRuntime"),
				undefined,
				[
					ts.factory.createObjectLiteralExpression(
						[
							ts.factory.createPropertyAssignment(
								"transport",
								ts.factory.createStringLiteral(this.netTransport()),
							),
							ts.factory.createPropertyAssignment(
								"strictBoundaryChecks",
								this.strictBoundaryChecks()
									? ts.factory.createTrue()
									: ts.factory.createFalse(),
							),
						],
						true,
					),
				],
			),
		);
	}

	netTransport(): "blink" | "remote" {
		return this.netConfig()?.transport === "remote" ? "remote" : "blink";
	}

	netConfig(): RovyNetConfig | undefined {
		return this.rovyConfig?.environment.net;
	}

	blinkConfig(): RovyBlinkConfig {
		const blink = this.netConfig()?.blink;
		return {
			enabled: blink?.enabled ?? true,
			remoteScope: blink?.remoteScope ?? "ROVY",
			manualReplication: blink?.manualReplication ?? true,
			usePolling: blink?.usePolling ?? true,
		};
	}

	strictBoundaryChecks(): boolean {
		return this.netConfig()?.strictBoundaryChecks ?? true;
	}

	runtimeTypeChecksEnabled(): boolean {
		const direct = booleanConfig(this.config.runtimeTypeChecks);
		if (direct !== undefined) return direct;
		if (isRecord(this.config.editor)) {
			const editor = booleanConfig(this.config.editor.runtimeTypeChecks);
			if (editor !== undefined) return editor;
		}
		const environment = this.rovyConfig?.environment;
		return environment?.editor?.runtimeTypeChecks ?? environment?.debug ?? false;
	}

	inspectResourcesEnabled(): boolean {
		return this.rovyConfig?.environment.debug === true;
	}

	resolveBoundary(file: ts.SourceFile): "server" | "client" | "shared" | "unknown" {
		const configured = this.resolveBoundaryFromConfig(file.fileName);
		if (configured !== "unknown") return configured;
		const path = normalizePath(file.fileName);
		if (isDescendant(path, this.absolute("src/server"))) return "server";
		if (isDescendant(path, this.absolute("src/client"))) return "client";
		if (isDescendant(path, this.absolute("src/shared"))) return "shared";
		return "unknown";
	}

	private resolveBoundaryFromConfig(fileName: string): "server" | "client" | "shared" | "unknown" {
		const boundaries = this.rovyConfig?.environment.boundaries;
		if (!boundaries) return "unknown";
		const absoluteFile = normalizePath(fileName);
		const match = (paths: ReadonlyArray<string> | undefined): boolean =>
			(paths ?? []).some((entry) => {
				const absolute = this.absolute(entry);
				return isDescendant(absoluteFile, absolute);
			});
		if (match(boundaries.server)) return "server";
		if (match(boundaries.client)) return "client";
		if (match(boundaries.shared)) return "shared";
		return "unknown";
	}

	blinkGeneratedSourcePath(): string {
		return join(this.outDir, "shared/net/generated/rovy.generated.blink");
	}

	blinkGeneratedClientPath(): string {
		return join(this.outDir, "shared/net/generated/RovyBlinkClient.luau");
	}

	blinkGeneratedServerPath(): string {
		return join(this.outDir, "shared/net/generated/RovyBlinkServer.luau");
	}

	blinkGeneratedTypesPath(): string {
		return join(this.outDir, "shared/net/generated/RovyBlinkTypes.luau");
	}

	shouldGenerateBlinkArtifacts(): boolean {
		return this.rovyConfig?.path !== undefined && this.netTransport() === "blink" && this.blinkConfig().enabled !== false;
	}

	shouldGenerateNetArtifacts(): boolean {
		return this.classInfoHasDecorator("netEvent");
	}

	classInfoHasDecorator(decorator: string): boolean {
		for (const [, info] of this.classInfo) {
			if (info.decorators.includes(decorator)) return true;
		}
		return false;
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

	stableIdForNodeWithin(node: ts.Node, rootDir: string): string {
		return modulePath(rootDir, node.getSourceFile().fileName);
	}

	resolvePluginOwner(node: ts.ClassDeclaration): PluginOwnerInfo | undefined {
		const fileName = normalizePath(node.getSourceFile().fileName);
		let best: PluginOwnerInfo | undefined;
		for (const owner of this.pluginOwners) {
			if (owner.node === node) continue;
			const ownsFile = owner.subtreeRoot ? isDescendant(fileName, owner.rootDir) : owner.node.getSourceFile().fileName === node.getSourceFile().fileName;
			if (!ownsFile) continue;
			if (best === undefined || owner.rootDir.length > best.rootDir.length) best = owner;
		}
		return best;
	}

	pluginOwnerExpr(file: ts.SourceFile, owner: PluginOwnerInfo, node: ts.Node): ts.Expression | undefined {
		if (owner.node.getSourceFile() === file) return ts.factory.createIdentifier(owner.className);
		if (!owner.exported) {
			this.diagnostic(node, `@plugin '${owner.className}' must be exported to own decorated classes outside its file`);
			return undefined;
		}

		const moduleName = relativeModuleSpecifier(file.fileName, owner.node.getSourceFile().fileName);
		for (const statement of file.statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
			if (statement.moduleSpecifier.text !== moduleName) continue;
			const clause = statement.importClause;
			if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
			for (const spec of clause.namedBindings.elements) {
				const exported = spec.propertyName?.text ?? spec.name.text;
				if (exported === owner.className) return ts.factory.createIdentifier(spec.name.text);
			}
		}

		let fileImports = this.pendingPluginImports.get(file.fileName);
		if (!fileImports) {
			fileImports = new Map();
			this.pendingPluginImports.set(file.fileName, fileImports);
		}
		const key = `${moduleName}::${owner.className}`;
		let local = fileImports.get(key);
		if (!local) {
			local = ts.factory.createUniqueName(owner.className, ts.GeneratedIdentifierFlags.Optimistic);
			fileImports.set(key, local);
		}
		return local;
	}

	/**
	 * Stable per-callsite compile key for a widget invocation. Replaces
	 * EgooE's `debug.info` source-position identity: `<modulePath>:<index>`,
	 * where index increments per widget callsite in source-traversal order.
	 */
	nextWidgetCallsiteKey(node: ts.Node): string {
		const moduleId = this.stableIdForNode(node);
		const used = this.widgetCallsiteCounters.get(moduleId) ?? 0;
		this.widgetCallsiteCounters.set(moduleId, used + 1);
		return `${moduleId}:${used}`;
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
				if (decorators.length > 0) {
					this.classInfo.set(node, { node, decorators });
					if (decorators.includes("plugin") && node.name) {
						const rootDir = dirname(normalizePath(file.fileName));
						const subtreeRoot = isPluginIndexFile(file.fileName);
						if (
							this.pluginOwners.some((owner) =>
								subtreeRoot
									? owner.subtreeRoot && owner.rootDir === rootDir
									: !owner.subtreeRoot && owner.node.getSourceFile().fileName === node.getSourceFile().fileName
							)
						) {
							this.diagnostic(
								node,
								subtreeRoot
									? `multiple @plugin roots share '${modulePath(this.currentDirectory, rootDir)}'; use one index.ts plugin per folder`
									: `multiple @plugin declarations share '${modulePath(this.currentDirectory, file.fileName)}'; use one plugin per non-index module`,
							);
						}
						this.pluginOwners.push({
							node,
							className: node.name.text,
							moduleId: this.stableIdForNode(node),
							rootDir,
							subtreeRoot,
							exported: classIsExported(node),
						});
					}
				}
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
			typeof this.rovyConfig?.environment.rojo === "string"
				? this.absolute(this.rovyConfig.environment.rojo)
				: typeof this.config.rojo === "string"
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
	return state.resolveCoreName(file, target) ?? state.resolveNetworkingName(file, target) ?? state.resolveDatastoreName(file, target) ?? state.resolveUiName(file, target);
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

function dirname(value: string): string {
	return normalizePath(value).replace(/\/[^/]+$/, "");
}

function relative(from: string, to: string): string {
	const cleanFrom = normalizePath(from);
	const cleanTo = normalizePath(to);
	if (cleanTo === cleanFrom) return "";
	if (cleanTo.startsWith(`${cleanFrom}/`)) return cleanTo.slice(cleanFrom.length + 1);
	return cleanTo;
}

function relativeModuleSpecifier(fromFile: string, toFile: string): string {
	const fromDir = dirname(fromFile);
	const toModule = normalizePath(toFile).replace(/\.d\.ts$/, "").replace(/\.tsx?$/, "");
	if (fromDir === toModule) return "./index";
	if (isDescendant(toModule, fromDir)) {
		const rel = relative(fromDir, toModule);
		return rel.startsWith(".") ? rel : `./${rel}`;
	}

	const fromParts = fromDir.split("/").filter((part) => part !== "");
	const toParts = toModule.split("/").filter((part) => part !== "");
	let common = 0;
	while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common += 1;
	const up = fromParts.slice(common).map(() => "..");
	const down = toParts.slice(common);
	const joined = [...up, ...down].join("/");
	return joined === "" ? "." : joined.startsWith(".") ? joined : `./${joined}`;
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

function classIsExported(node: ts.ClassDeclaration): boolean {
	return (node.modifiers ?? []).some(
		(modifier) =>
			modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword,
	);
}

function isPluginIndexFile(fileName: string): boolean {
	const normalized = normalizePath(fileName);
	return normalized.endsWith("/index.ts") || normalized.endsWith("/index.tsx");
}

function skipAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
	if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) return checker.getAliasedSymbol(symbol);
	return symbol;
}

function declarationHasWidgetTag(declaration: ts.Declaration): boolean {
	const nodes: ts.Node[] = [declaration];
	// JSDoc on `export const x = ...` / `declare const x: ...` attaches to the
	// VariableStatement, not the VariableDeclaration the symbol points at.
	if (ts.isVariableDeclaration(declaration)) {
		const statement = declaration.parent?.parent;
		if (statement) nodes.push(statement);
	}
	for (const node of nodes) {
		for (const tag of ts.getJSDocTags(node)) {
			if (tag.tagName.text === "widget") return true;
		}
	}
	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function booleanConfig(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}
