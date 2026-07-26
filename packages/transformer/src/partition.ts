import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type PluginBoundary = "client" | "server" | "shared";

export interface PartitionedPlugin {
	readonly sourceRoot: string;
	readonly relativeRoot: string;
	readonly sourceFiles: ReadonlyArray<string>;
	readonly declarations: Readonly<Record<string, PluginBoundary>>;
	readonly exports: Readonly<Record<string, PluginBoundary>>;
}

export interface PreparedPartitionProject {
	readonly projectFile: string;
	readonly sourceRoot: string;
	readonly stagingRoot: string;
	readonly outDir: string;
	readonly plugins: ReadonlyArray<PartitionedPlugin>;
	finalize(): void;
}

interface DeclarationUnit {
	readonly key: string;
	readonly file: ts.SourceFile;
	readonly statement: ts.Statement;
	readonly declaration: ts.Declaration;
	readonly name: string;
	readonly exported: boolean;
	readonly typeOnly: boolean;
	readonly explicit?: PluginBoundary;
	readonly dependencies: Set<DeclarationUnit>;
	readonly externalDependencies: Array<{ readonly name: string; readonly boundary: PluginBoundary }>;
}

interface PluginAnalysis {
	readonly root: string;
	readonly relativeRoot: string;
	readonly files: ReadonlyArray<ts.SourceFile>;
	readonly units: ReadonlyArray<DeclarationUnit>;
	readonly boundaryByUnit: ReadonlyMap<DeclarationUnit, PluginBoundary>;
	readonly boundaryBySymbol: ReadonlyMap<ts.Symbol, PluginBoundary>;
	readonly exports: Readonly<Record<string, PluginBoundary>>;
}

const BOUNDARIES: ReadonlyArray<PluginBoundary> = ["shared", "client", "server"];
const BOUNDARY_DECORATORS = new Set<string>(BOUNDARIES);
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
const PLUGIN_MARKER = ".rovy.plugin.json";

/**
 * Build-time whole-program plugin partitioning.
 *
 * The returned project points rbxtsc at a disposable source mirror. Call
 * `finalize()` after rbxtsc succeeds to delete the unsplit Luau modules and
 * install stable runtime facades.
 */
export function preparePartitionedProject(projectDir: string, projectFile = "tsconfig.json"): PreparedPartitionProject | undefined {
	const absoluteProject = resolveProjectFile(projectDir, projectFile);
	const configFile = ts.readConfigFile(absoluteProject, ts.sys.readFile);
	if (configFile.error) throw new Error(formatDiagnostic(configFile.error));
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(absoluteProject), undefined, absoluteProject);
	const program = ts.createProgram(parsed.fileNames, parsed.options);
	const sourceRoot = path.resolve(
		path.dirname(absoluteProject),
		parsed.options.rootDir ?? commonSourceDirectory(parsed.fileNames, path.dirname(absoluteProject)),
	);
	const outDir = path.resolve(path.dirname(absoluteProject), parsed.options.outDir ?? "out");
	const pluginRoots = findPluginRoots(sourceRoot, outDir);
	if (pluginRoots.length === 0) return undefined;

	const checker = program.getTypeChecker();
	const diagnostics: string[] = [];
	const analyses = pluginRoots.map((root) => analyzePlugin(program, checker, root, sourceRoot, diagnostics));
	if (diagnostics.length > 0) {
		throw new Error(`Rovy plugin partition failed:\n${diagnostics.map((message) => `  - ${message}`).join("\n")}`);
	}

	const stateDir = path.join(projectDir, ".rovy-build");
	const stagingRoot = path.join(stateDir, "partitioned-src");
	fs.rmSync(stagingRoot, { recursive: true, force: true });
	copySourceTree(sourceRoot, stagingRoot, outDir, stateDir);
	for (const analysis of analyses) emitPluginSources(analysis, checker, stagingRoot, sourceRoot);

	fs.mkdirSync(stateDir, { recursive: true });
	const stagedNodeModules = path.join(stateDir, "node_modules");
	fs.rmSync(stagedNodeModules, { recursive: true, force: true });
	fs.symlinkSync(path.join(projectDir, "node_modules"), stagedNodeModules, "junction");
	for (const projectName of ["package.json"]) {
		const source = path.join(projectDir, projectName);
		const destination = path.join(stateDir, projectName);
		fs.rmSync(destination, { force: true });
		if (fs.existsSync(source)) fs.symlinkSync(source, destination, "file");
	}
	fs.mkdirSync(outDir, { recursive: true });
	fs.rmSync(path.join(stateDir, "default.project.json"), { force: true });
	fs.writeFileSync(
		path.join(stateDir, "default.project.json"),
		`${JSON.stringify(
			{
				name: "rovy-partitioned",
				tree: { $className: "Folder", out: { $path: outDir } },
			},
			undefined,
			2,
		)}\n`,
	);
	const generatedProject = path.join(stateDir, "partitioned.tsconfig.json");
	const compilerOptions: Record<string, unknown> = {
		rootDir: stagingRoot,
		outDir,
		incremental: true,
		tsBuildInfoFile: path.join(stateDir, "partitioned.tsbuildinfo"),
	};
	compilerOptions.typeRoots = [
		path.join(stagedNodeModules, "@rbxts"),
		path.join(stagedNodeModules, "@rovy"),
		...(parsed.options.typeRoots ?? []).filter(
			(root) => !root.endsWith("/@rbxts") && !root.endsWith("\\@rbxts") && !root.endsWith("/@rovy") && !root.endsWith("\\@rovy"),
		),
	];
	fs.writeFileSync(
		generatedProject,
		`${JSON.stringify(
			{
				extends: absoluteProject,
				compilerOptions,
				include: [path.join(stagingRoot, "**/*")],
				exclude: [],
			},
			undefined,
			2,
		)}\n`,
	);

	const plugins = analyses.map((analysis) => ({
		sourceRoot: analysis.root,
		relativeRoot: analysis.relativeRoot,
		sourceFiles: analysis.files.map((file) => file.fileName),
		declarations: Object.fromEntries(
			analysis.units
				.filter((unit) => !unit.typeOnly)
				.map((unit) => [unit.key, analysis.boundaryByUnit.get(unit) ?? "shared"]),
		),
		exports: analysis.exports,
	}));

	return {
		projectFile: generatedProject,
		sourceRoot,
		stagingRoot,
		outDir,
		plugins,
		finalize: () => finalizePartitionOutput(analyses, outDir),
	};
}

function analyzePlugin(
	program: ts.Program,
	checker: ts.TypeChecker,
	root: string,
	sourceRoot: string,
	diagnostics: string[],
): PluginAnalysis {
	const files = program
		.getSourceFiles()
		.filter((file) => !file.isDeclarationFile && isWithin(file.fileName, root))
		.sort((a, b) => a.fileName.localeCompare(b.fileName));
	if (files.length === 0) {
		diagnostics.push(`${relativeDisplay(sourceRoot, root)} contains ${PLUGIN_MARKER} but no TypeScript sources`);
	}
	for (const file of files) {
		const relative = normalize(path.relative(root, file.fileName));
		if (/^(client|server|shared)(\/|$)/.test(relative)) {
			diagnostics.push(`${relativeDisplay(sourceRoot, file.fileName)} uses removed authored boundary folder '${relative.split("/")[0]}'`);
		}
	}
	const index = files.find((file) => /(^|\/)index\.tsx?$/.test(normalize(path.relative(root, file.fileName))));
	if (!index) diagnostics.push(`${relativeDisplay(sourceRoot, root)} requires index.ts for the generated stable plugin facade`);

	const units: DeclarationUnit[] = [];
	const unitByDeclaration = new Map<ts.Declaration, DeclarationUnit>();
	const unitBySymbol = new Map<ts.Symbol, DeclarationUnit>();
	for (const file of files) {
		for (const statement of file.statements) {
			if (ts.isImportDeclaration(statement) && statement.importClause === undefined) {
				diagnostics.push(
					locationMessage(file, statement, "side-effect-only imports are ambiguous; import them from a boundary-marked declaration"),
				);
			}
			const statementUnits = unitsForStatement(file, statement, checker, root, diagnostics);
			for (const unit of statementUnits) {
				units.push(unit);
				unitByDeclaration.set(unit.declaration, unit);
				const symbol = symbolForDeclaration(checker, unit.declaration);
				if (symbol) unitBySymbol.set(skipAlias(checker, symbol), unit);
			}
			if (
				statementUnits.length === 0 &&
				!ts.isImportDeclaration(statement) &&
				!ts.isImportEqualsDeclaration(statement) &&
				!ts.isExportDeclaration(statement) &&
				!ts.isEmptyStatement(statement)
			) {
				diagnostics.push(
					locationMessage(file, statement, "ambiguous top-level executable statement; move it into a boundary-marked declaration"),
				);
			}
		}
	}

	for (const unit of units) {
		if (unit.typeOnly) continue;
		collectDependencies(unit, checker, unitBySymbol);
	}

	const reach = new Map<DeclarationUnit, Set<PluginBoundary>>();
	const roots: Array<{ unit: DeclarationUnit; boundary: PluginBoundary }> = [];
	for (const unit of units) {
		if (unit.typeOnly || unit.explicit === undefined) continue;
		roots.push({ unit, boundary: unit.explicit });
	}
	propagateReach(roots, reach);

	const publicDefaults: Array<{ unit: DeclarationUnit; boundary: PluginBoundary }> = [];
	for (const unit of units) {
		if (unit.typeOnly || unit.explicit !== undefined || (reach.get(unit)?.size ?? 0) > 0) continue;
		if (unit.exported) publicDefaults.push({ unit, boundary: "shared" });
	}
	propagateReach(publicDefaults, reach);

	const privateDefaults: Array<{ unit: DeclarationUnit; boundary: PluginBoundary }> = [];
	for (const unit of units) {
		if (unit.typeOnly || unit.explicit !== undefined || (reach.get(unit)?.size ?? 0) > 0) continue;
		privateDefaults.push({ unit, boundary: "shared" });
	}
	propagateReach(privateDefaults, reach);

	const boundaryByUnit = new Map<DeclarationUnit, PluginBoundary>();
	for (const unit of units) {
		if (unit.typeOnly) continue;
		if (unit.explicit) {
			boundaryByUnit.set(unit, unit.explicit);
			continue;
		}
		const reached = reach.get(unit) ?? new Set<PluginBoundary>(["shared"]);
		boundaryByUnit.set(
			unit,
			reached.has("shared") || (reached.has("client") && reached.has("server"))
				? "shared"
				: reached.has("client")
					? "client"
					: reached.has("server")
						? "server"
						: "shared",
		);
	}

	const reported = new Set<string>();
	for (const { unit: rootUnit, boundary: rootBoundary } of [...roots, ...publicDefaults, ...privateDefaults]) {
		const visit = (unit: DeclarationUnit, chain: DeclarationUnit[], seen: Set<DeclarationUnit>): void => {
			if (seen.has(unit)) return;
			seen.add(unit);
			for (const dependency of unit.dependencies) {
				const targetBoundary = boundaryByUnit.get(dependency);
				if (targetBoundary !== undefined && !canReference(rootBoundary, targetBoundary)) {
					const names = [...chain, unit, dependency].map((item) => item.name);
					const key = `${rootBoundary}:${names.join("->")}`;
					if (!reported.has(key)) {
						reported.add(key);
						diagnostics.push(
							locationMessage(
								rootUnit.file,
								rootUnit.declaration,
								`${rootBoundary} declaration cannot reference ${targetBoundary}: ${names.join(" -> ")}`,
							),
						);
					}
					continue;
				}
				visit(dependency, [...chain, unit], seen);
			}
		};
		visit(rootUnit, [], new Set());
	}
	for (const unit of units) {
		const from = boundaryByUnit.get(unit);
		if (!from) continue;
		for (const dependency of unit.externalDependencies) {
			if (!canReference(from, dependency.boundary)) {
				diagnostics.push(
					locationMessage(
						unit.file,
						unit.declaration,
						`${from} declaration cannot reference packaged ${dependency.boundary} export: ${unit.name} -> ${dependency.name}`,
					),
				);
			}
		}
	}

	const boundaryBySymbol = new Map<ts.Symbol, PluginBoundary>();
	for (const [symbol, unit] of unitBySymbol) {
		const boundary = boundaryByUnit.get(unit);
		if (boundary) boundaryBySymbol.set(symbol, boundary);
	}
	validateQueryBoundaryReferences(
		units,
		checker,
		boundaryByUnit,
		boundaryBySymbol,
		diagnostics,
	);
	const exports: Record<string, PluginBoundary> = {};
	if (index) {
		const moduleSymbol = checker.getSymbolAtLocation(index);
		for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
			const target = skipAlias(checker, exported);
			const boundary = boundaryBySymbol.get(target);
			if (boundary) exports[exported.name] = boundary;
		}
	}
	return {
		root,
		relativeRoot: normalize(path.relative(sourceRoot, root)),
		files,
		units,
		boundaryByUnit,
		boundaryBySymbol,
		exports,
	};
}

function validateQueryBoundaryReferences(
	units: ReadonlyArray<DeclarationUnit>,
	checker: ts.TypeChecker,
	boundaryByUnit: ReadonlyMap<DeclarationUnit, PluginBoundary>,
	boundaryBySymbol: ReadonlyMap<ts.Symbol, PluginBoundary>,
	diagnostics: string[],
): void {
	const queryFilters = new Set(["With", "Without", "Changed", "Added", "Removed"]);
	const wrappers = new Set(["Optional"]);
	const ignoredTerms = new Set(["Entity", "Trait", "AllTraits", "Pair"]);
	const reported = new Set<string>();
	const typeName = (node: ts.TypeReferenceNode): string => {
		const symbol = checker.getSymbolAtLocation(node.typeName);
		return symbol ? skipAlias(checker, symbol).name : rightmostName(node.typeName);
	};

	const boundaryForType = (node: ts.TypeNode): { name: string; boundary: PluginBoundary } | undefined => {
		if (!ts.isTypeReferenceNode(node)) return undefined;
		const symbol = checker.getSymbolAtLocation(node.typeName);
		if (!symbol) return undefined;
		const target = skipAlias(checker, symbol);
		const boundary = boundaryBySymbol.get(target) ?? externalBoundaryForSymbol(target)?.boundary;
		return boundary ? { name: target.name, boundary } : undefined;
	};

	const queryComponents = (terms: ts.TypeNode | undefined, filters: readonly ts.TypeNode[]): ts.TypeNode[] => {
		const out: ts.TypeNode[] = [];
		if (terms && ts.isTupleTypeNode(terms)) {
			for (const term of terms.elements) {
				if (!ts.isTypeReferenceNode(term)) continue;
				const name = typeName(term);
				if (wrappers.has(name)) {
					const inner = term.typeArguments?.[0];
					if (inner) out.push(inner);
				} else if (!ignoredTerms.has(name)) {
					out.push(term);
				}
			}
		}
		for (const filter of filters) {
			if (!ts.isTypeReferenceNode(filter) || !queryFilters.has(typeName(filter))) continue;
			const inner = filter.typeArguments?.[0];
			if (inner) out.push(inner);
		}
		return out;
	};

	for (const unit of units) {
		if (!ts.isClassDeclaration(unit.declaration)) continue;
		const consumerBoundary = boundaryByUnit.get(unit);
		if (!consumerBoundary) continue;
		const decorators = decoratorNames(unit.declaration, checker);
		if (!decorators.some((name) => name === "system" || name === "observer" || name === "monitor")) continue;

		const inspectQuery = (terms: ts.TypeNode | undefined, filters: readonly ts.TypeNode[], trace: ts.Node): void => {
			for (const component of queryComponents(terms, filters)) {
				const dependency = boundaryForType(component);
				if (!dependency || canReference(consumerBoundary, dependency.boundary)) continue;
				const key = `${unit.key}:${dependency.name}:${trace.pos}`;
				if (reported.has(key)) continue;
				reported.add(key);
				diagnostics.push(
					locationMessage(
						unit.file,
						trace,
						`${consumerBoundary} ${decorators.includes("monitor") ? "monitor" : decorators.includes("observer") ? "observer" : "system"} '${unit.name}' cannot query ${dependency.boundary} component '${dependency.name}'`,
					),
				);
			}
		};

		const visit = (node: ts.Node): void => {
			if (ts.isTypeReferenceNode(node) && typeName(node) === "Query") {
				inspectQuery(node.typeArguments?.[0], [...(node.typeArguments ?? [])].slice(1), node);
			} else if (
				ts.isCallExpression(node) &&
				node.typeArguments !== undefined &&
				(() => {
					const symbol = checker.getSymbolAtLocation(node.expression);
					return symbol
						? skipAlias(checker, symbol).name === "query"
						: ts.isIdentifier(node.expression) && node.expression.text === "query";
				})()
			) {
				inspectQuery(node.typeArguments[0], [...node.typeArguments].slice(1), node);
			}
			ts.forEachChild(node, visit);
		};
		visit(unit.declaration);
	}
}

function rightmostName(name: ts.EntityName): string {
	return ts.isIdentifier(name) ? name.text : name.right.text;
}

function unitsForStatement(
	file: ts.SourceFile,
	statement: ts.Statement,
	checker: ts.TypeChecker,
	root: string,
	diagnostics: string[],
): DeclarationUnit[] {
	if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
		return [makeUnit(file, statement, statement, statement.name.text, true, undefined, true, root)];
	}
	if (
		ts.isClassDeclaration(statement) ||
		ts.isFunctionDeclaration(statement) ||
		ts.isEnumDeclaration(statement) ||
		ts.isModuleDeclaration(statement)
	) {
		if (!statement.name || !ts.isIdentifier(statement.name)) {
			diagnostics.push(locationMessage(file, statement, "anonymous/default runtime declarations are not supported in plugin partitioning"));
			return [];
		}
		const decorators = ts.isClassDeclaration(statement) ? decoratorNames(statement, checker) : [];
		const boundaries = decorators.filter((name): name is PluginBoundary => BOUNDARY_DECORATORS.has(name));
		if (boundaries.length > 1) {
			diagnostics.push(locationMessage(file, statement, "@server, @client, and @shared are mutually exclusive"));
		}
		const requiresBoundary = decorators.some(
			(name) => RUNTIME_DECORATORS.has(name) && !SHARED_BY_DEFAULT_DECORATORS.has(name),
		);
		const defaultBoundary = decorators.some((name) => SHARED_BY_DEFAULT_DECORATORS.has(name))
			? "shared"
			: undefined;
		if (requiresBoundary && boundaries.length !== 1) {
			diagnostics.push(
				locationMessage(file, statement, "runtime declarations require exactly one of @server, @client, or @shared"),
			);
		}
		return [
			makeUnit(
				file,
				statement,
				statement,
				statement.name.text,
				isExported(statement),
				boundaries[0] ?? defaultBoundary,
				false,
				root,
			),
		];
	}
	if (ts.isVariableStatement(statement)) {
		const out: DeclarationUnit[] = [];
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name)) {
				diagnostics.push(locationMessage(file, declaration, "destructured top-level variables are not supported in plugin partitioning"));
				continue;
			}
			out.push(
				makeUnit(
					file,
					statement,
					declaration,
					declaration.name.text,
					isExported(statement),
					undefined,
					false,
					root,
				),
			);
		}
		return out;
	}
	return [];
}

function makeUnit(
	file: ts.SourceFile,
	statement: ts.Statement,
	declaration: ts.Declaration,
	name: string,
	exported: boolean,
	explicit: PluginBoundary | undefined,
	typeOnly: boolean,
	root: string,
): DeclarationUnit {
	return {
		key: `${normalize(path.relative(root, file.fileName)).replace(/\.tsx?$/, "")}#${name}`,
		file,
		statement,
		declaration,
		name,
		exported,
		explicit,
		typeOnly,
		dependencies: new Set(),
		externalDependencies: [],
	};
}

function collectDependencies(
	unit: DeclarationUnit,
	checker: ts.TypeChecker,
	unitBySymbol: ReadonlyMap<ts.Symbol, DeclarationUnit>,
): void {
	const declaration = unit.declaration;
	const visit = (node: ts.Node): void => {
		if (node !== declaration && isTypeOnlyNode(node)) return;
		if (ts.isIdentifier(node) && !isDeclarationName(node)) {
			let symbol = checker.getSymbolAtLocation(node);
			if (symbol) {
				symbol = skipAlias(checker, symbol);
				const target = unitBySymbol.get(symbol);
				if (target && target.declaration !== declaration) unit.dependencies.add(target);
				else {
					const external = externalBoundaryForSymbol(symbol);
					if (
						external &&
						!unit.externalDependencies.some(
							(item) => item.name === external.name && item.boundary === external.boundary,
						)
					) {
						unit.externalDependencies.push(external);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(declaration);
}

function propagateReach(
	roots: ReadonlyArray<{ unit: DeclarationUnit; boundary: PluginBoundary }>,
	reach: Map<DeclarationUnit, Set<PluginBoundary>>,
): void {
	for (const root of roots) {
		const visit = (unit: DeclarationUnit): void => {
			let boundaries = reach.get(unit);
			if (!boundaries) {
				boundaries = new Set();
				reach.set(unit, boundaries);
			}
			if (boundaries.has(root.boundary)) return;
			boundaries.add(root.boundary);
			for (const dependency of unit.dependencies) visit(dependency);
		};
		visit(root.unit);
	}
}

function emitPluginSources(
	analysis: PluginAnalysis,
	checker: ts.TypeChecker,
	stagingRoot: string,
	sourceRoot: string,
): void {
	const unitsByFile = new Map<string, DeclarationUnit[]>();
	for (const unit of analysis.units) {
		const list = unitsByFile.get(unit.file.fileName) ?? [];
		list.push(unit);
		unitsByFile.set(unit.file.fileName, list);
	}
	for (const file of analysis.files) {
		const relativeFile = normalize(path.relative(analysis.root, file.fileName));
		const units = unitsByFile.get(file.fileName) ?? [];
		for (const boundary of BOUNDARIES) {
			const statements: ts.Statement[] = [];
			statements.push(...importsForBoundary(file, units, boundary, analysis, checker));
			statements.push(...sameFileBoundaryImports(file, units, boundary, analysis));
			for (const statement of file.statements) {
				if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) continue;
				if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
					statements.push(statement);
					continue;
				}
				if (ts.isExportDeclaration(statement)) {
					statements.push(...exportsForBoundary(file, statement, boundary, analysis, checker));
					continue;
				}
				const statementUnits = units.filter((unit) => unit.statement === statement);
				const selected = statementUnits.filter(
					(unit) => unit.typeOnly || analysis.boundaryByUnit.get(unit) === boundary,
				);
				if (selected.length === 0) continue;
				const emitted = emitSelectedStatement(statement, selected);
				if (emitted) statements.push(emitted);
			}
			const generated = ts.factory.updateSourceFile(file, statements);
			const destination = path.join(stagingRoot, analysis.relativeRoot, boundary, relativeFile);
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(generated));
		}
	}
}

function importsForBoundary(
	file: ts.SourceFile,
	units: ReadonlyArray<DeclarationUnit>,
	boundary: PluginBoundary,
	analysis: PluginAnalysis,
	checker: ts.TypeChecker,
): ts.ImportDeclaration[] {
	const selected = units.filter((unit) => unit.typeOnly || analysis.boundaryByUnit.get(unit) === boundary);
	const usedAliases = new Set<ts.Symbol>();
	for (const unit of selected) {
		const visit = (node: ts.Node): void => {
			if (ts.isIdentifier(node) && !isDeclarationName(node)) {
				const symbol = checker.getSymbolAtLocation(node);
				if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) usedAliases.add(symbol);
			}
			ts.forEachChild(node, visit);
		};
		visit(unit.declaration);
	}

	const output: ts.ImportDeclaration[] = [];
	for (const statement of file.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
		const clause = statement.importClause;
		if (!clause) {
			if (isInternalSpecifier(statement.moduleSpecifier.text)) continue;
			if (boundary === "shared") output.push(statement);
			continue;
		}
		const groups = new Map<string, { defaultName?: ts.Identifier; specs: ts.ImportSpecifier[]; typeOnly: boolean }>();
		const add = (
			moduleName: string,
			defaultName: ts.Identifier | undefined,
			spec: ts.ImportSpecifier | undefined,
			typeOnly: boolean,
		) => {
			const group = groups.get(moduleName) ?? { specs: [], typeOnly: true };
			if (defaultName) group.defaultName = defaultName;
			if (spec) group.specs.push(spec);
			group.typeOnly = group.typeOnly && typeOnly;
			groups.set(moduleName, group);
		};
		if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
			const symbol = checker.getSymbolAtLocation(clause.namedBindings.name);
			if (symbol && usedAliases.has(symbol)) {
				throw new Error(
					`Rovy plugin partition failed:\n  - ${locationMessage(file, statement, "namespace imports inside a plugin root are not supported; use named imports")}`,
				);
			}
		}
		if (clause.name) {
			const symbol = checker.getSymbolAtLocation(clause.name);
			if (symbol && usedAliases.has(symbol)) {
				add(
					rewrittenImportSpecifier(file, statement.moduleSpecifier.text, symbol, boundary, analysis, checker),
					clause.name,
					undefined,
					clause.isTypeOnly,
				);
			}
		}
		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const spec of clause.namedBindings.elements) {
				const symbol = checker.getSymbolAtLocation(spec.name);
				if (!symbol || !usedAliases.has(symbol)) continue;
				add(
					rewrittenImportSpecifier(file, statement.moduleSpecifier.text, symbol, boundary, analysis, checker),
					undefined,
					spec,
					clause.isTypeOnly || spec.isTypeOnly,
				);
			}
		}
		for (const [moduleName, group] of groups) {
			const namedBindings =
				group.specs.length > 0
					? ts.factory.createNamedImports(
							group.specs.map((spec) =>
								ts.factory.updateImportSpecifier(
									spec,
									group.typeOnly ? false : spec.isTypeOnly,
									spec.propertyName,
									spec.name,
								),
							),
						)
					: undefined;
			output.push(
				ts.factory.createImportDeclaration(
					statement.modifiers,
					ts.factory.createImportClause(group.typeOnly, group.defaultName, namedBindings),
					ts.factory.createStringLiteral(moduleName),
					statement.attributes,
				),
			);
		}
	}
	return output;
}

function sameFileBoundaryImports(
	file: ts.SourceFile,
	units: ReadonlyArray<DeclarationUnit>,
	boundary: PluginBoundary,
	analysis: PluginAnalysis,
): ts.ImportDeclaration[] {
	const groups = new Map<PluginBoundary, Set<string>>();
	for (const unit of units) {
		if (analysis.boundaryByUnit.get(unit) !== boundary) continue;
		for (const dependency of unit.dependencies) {
			if (dependency.file !== file) continue;
			const targetBoundary = analysis.boundaryByUnit.get(dependency);
			if (!targetBoundary || targetBoundary === boundary) continue;
			const names = groups.get(targetBoundary) ?? new Set<string>();
			names.add(dependency.name);
			groups.set(targetBoundary, names);
		}
	}
	const relativeFile = normalize(path.relative(analysis.root, file.fileName)).replace(/\.tsx?$/, "");
	const from = `${boundary}/${relativeFile}`;
	return [...groups.entries()].map(([targetBoundary, names]) => {
		const to = `${targetBoundary}/${relativeFile}`;
		return ts.factory.createImportDeclaration(
			undefined,
			ts.factory.createImportClause(
				false,
				undefined,
				ts.factory.createNamedImports(
					[...names].sort().map((name) => ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(name))),
				),
			),
			ts.factory.createStringLiteral(relativeModule(from, to)),
		);
	});
}

function exportsForBoundary(
	file: ts.SourceFile,
	statement: ts.ExportDeclaration,
	boundary: PluginBoundary,
	analysis: PluginAnalysis,
	checker: ts.TypeChecker,
): ts.ExportDeclaration[] {
	if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
		return statement.isTypeOnly || boundary === "shared" ? [statement] : [];
	}
	if (!statement.exportClause) {
		if (isInternalSpecifier(statement.moduleSpecifier.text)) {
			throw new Error(
				`Rovy plugin partition failed:\n  - ${locationMessage(file, statement, "internal export * is not supported; use named exports so boundaries can be split")}`,
			);
		}
		return boundary === "shared" ? [statement] : [];
	}
	if (!ts.isNamedExports(statement.exportClause)) return boundary === "shared" ? [statement] : [];
	const groups = new Map<string, ts.ExportSpecifier[]>();
	for (const spec of statement.exportClause.elements) {
		const symbol = checker.getSymbolAtLocation(spec.name);
		const target = symbol ? skipAlias(checker, symbol) : undefined;
		const targetBoundary = target ? analysis.boundaryBySymbol.get(target) : undefined;
		if (!statement.isTypeOnly && !spec.isTypeOnly && (targetBoundary ?? "shared") !== boundary) continue;
		const moduleName =
			targetBoundary === undefined
				? statement.moduleSpecifier.text
				: rewrittenTargetSpecifier(file, statement.moduleSpecifier.text, boundary, targetBoundary, analysis);
		const specs = groups.get(moduleName) ?? [];
		specs.push(spec);
		groups.set(moduleName, specs);
	}
	return [...groups.entries()].map(([moduleName, specs]) =>
		ts.factory.updateExportDeclaration(
			statement,
			statement.modifiers,
			statement.isTypeOnly,
			ts.factory.createNamedExports(specs),
			ts.factory.createStringLiteral(moduleName),
			statement.attributes,
		),
	);
}

function emitSelectedStatement(statement: ts.Statement, units: ReadonlyArray<DeclarationUnit>): ts.Statement | undefined {
	if (ts.isVariableStatement(statement)) {
		const selected = new Set(units.map((unit) => unit.declaration));
		const declarations = statement.declarationList.declarations.filter((declaration) => selected.has(declaration));
		if (declarations.length === 0) return undefined;
		return ts.factory.updateVariableStatement(
			statement,
			withExportModifier(statement.modifiers),
			ts.factory.updateVariableDeclarationList(statement.declarationList, declarations),
		);
	}
	if (ts.isClassDeclaration(statement)) {
		return ts.factory.updateClassDeclaration(
			statement,
			withExportModifier(statement.modifiers),
			statement.name,
			statement.typeParameters,
			statement.heritageClauses,
			statement.members,
		);
	}
	if (ts.isFunctionDeclaration(statement)) {
		return ts.factory.updateFunctionDeclaration(
			statement,
			withExportModifier(statement.modifiers),
			statement.asteriskToken,
			statement.name,
			statement.typeParameters,
			statement.parameters,
			statement.type,
			statement.body,
		);
	}
	if (ts.isEnumDeclaration(statement)) {
		return ts.factory.updateEnumDeclaration(statement, withExportModifier(statement.modifiers), statement.name, statement.members);
	}
	if (ts.isModuleDeclaration(statement)) {
		return ts.factory.updateModuleDeclaration(
			statement,
			withExportModifier(statement.modifiers),
			statement.name,
			statement.body,
		);
	}
	return statement;
}

function rewrittenImportSpecifier(
	file: ts.SourceFile,
	original: string,
	alias: ts.Symbol,
	currentBoundary: PluginBoundary,
	analysis: PluginAnalysis,
	checker: ts.TypeChecker,
): string {
	if (!isInternalSpecifier(original)) return original;
	const target = skipAlias(checker, alias);
	const targetBoundary = analysis.boundaryBySymbol.get(target) ?? currentBoundary;
	return rewrittenTargetSpecifier(file, original, currentBoundary, targetBoundary, analysis);
}

function rewrittenTargetSpecifier(
	file: ts.SourceFile,
	original: string,
	currentBoundary: PluginBoundary,
	targetBoundary: PluginBoundary,
	analysis: PluginAnalysis,
): string {
	if (!isInternalSpecifier(original)) return original;
	const targetFile = resolveInternalModule(file.fileName, original, analysis.files);
	if (!targetFile) return original;
	const fromRel = normalize(path.relative(analysis.root, file.fileName)).replace(/\.tsx?$/, "");
	const toRel = normalize(path.relative(analysis.root, targetFile.fileName)).replace(/\.tsx?$/, "");
	return relativeModule(`${currentBoundary}/${fromRel}`, `${targetBoundary}/${toRel}`);
}

function finalizePartitionOutput(analyses: ReadonlyArray<PluginAnalysis>, outDir: string): void {
	for (const analysis of analyses) {
		const pluginOut = path.join(outDir, analysis.relativeRoot);
		for (const file of analysis.files) {
			const relative = normalize(path.relative(analysis.root, file.fileName));
			const luauRelative = relative.replace(/(?:^|\/)index\.tsx?$/, (value) =>
				value.startsWith("/") ? "/init.luau" : "init.luau",
			).replace(/\.tsx?$/, ".luau");
			fs.rmSync(path.join(pluginOut, luauRelative), { force: true });
		}
		fs.mkdirSync(pluginOut, { recursive: true });
		fs.writeFileSync(path.join(pluginOut, "init.luau"), pluginFacadeLuau());
		const declarations = Object.fromEntries(
			analysis.units
				.filter((unit) => !unit.typeOnly)
				.map((unit) => [unit.key, analysis.boundaryByUnit.get(unit) ?? "shared"]),
		);
		fs.writeFileSync(
			path.join(pluginOut, ".rovy-boundaries.json"),
			`${JSON.stringify({ version: 1, exports: analysis.exports, declarations }, undefined, 2)}\n`,
		);
		normalizeEmptyBoundaryModules(pluginOut);
	}
}

function normalizeEmptyBoundaryModules(pluginOut: string): void {
	for (const boundary of BOUNDARIES) {
		const root = path.join(pluginOut, boundary);
		if (!fs.existsSync(root)) continue;
		const visit = (directory: string): void => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const target = path.join(directory, entry.name);
				if (entry.isDirectory()) {
					visit(target);
					continue;
				}
				if (!entry.name.endsWith(".luau")) continue;
				const content = fs.readFileSync(target, "utf8");
				const executable = content
					.split("\n")
					.filter((line) => !line.trimStart().startsWith("--"))
					.join("\n")
					.trim();
				if (executable === "" || executable === "return nil") {
					fs.writeFileSync(target, "-- Generated empty Rovy boundary module.\nreturn {}\n");
				}
			}
		};
		visit(root);
	}
}

function pluginFacadeLuau(): string {
	return `-- Generated by rovy-build. Do not edit.
local exports = {}
local TS = _G[script]

local function merge(value)
\tif type(value) ~= "table" then return end
\tfor key, item in pairs(value) do
\t\texports[key] = item
\tend
end

local function loadTree(root, exportRoot)
\tif root:IsA("ModuleScript") then
\t\tlocal value = TS and TS.import and TS.import(script, root) or require(root)
\t\tif exportRoot then merge(value) end
\tend
\tfor _, child in root:GetChildren() do
\t\tloadTree(child, false)
\tend
end

local shared = script:FindFirstChild("shared")
if shared then loadTree(shared, true) end

local RunService
if game then
\tpcall(function()
\t\tRunService = game:GetService("RunService")
\tend)
end
local side = RunService and (RunService:IsClient() and "client" or (RunService:IsServer() and "server" or nil)) or nil
if side then
\tlocal runtime = script:FindFirstChild(side)
\tif runtime then loadTree(runtime, true) end
end

return exports
`;
}

function copySourceTree(sourceRoot: string, stagingRoot: string, outDir: string, stateDir: string): void {
	fs.mkdirSync(stagingRoot, { recursive: true });
	const visit = (source: string, destination: string): void => {
		for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
			const sourcePath = path.join(source, entry.name);
			if (isWithin(sourcePath, outDir) || isWithin(sourcePath, stateDir) || entry.name === "node_modules" || entry.name === ".git") {
				continue;
			}
			const destinationPath = path.join(destination, entry.name);
			if (entry.isDirectory()) {
				fs.mkdirSync(destinationPath, { recursive: true });
				visit(sourcePath, destinationPath);
			} else if (entry.isFile()) {
				fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
				fs.copyFileSync(sourcePath, destinationPath);
			}
		}
	};
	visit(sourceRoot, stagingRoot);
}

function findPluginRoots(sourceRoot: string, outDir: string): string[] {
	const roots: string[] = [];
	const visit = (directory: string): void => {
		if (isWithin(directory, outDir) || path.basename(directory) === "node_modules" || path.basename(directory) === ".git") return;
		if (fs.existsSync(path.join(directory, PLUGIN_MARKER))) roots.push(directory);
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) visit(path.join(directory, entry.name));
		}
	};
	if (fs.existsSync(sourceRoot)) visit(sourceRoot);
	return roots;
}

function resolveProjectFile(projectDir: string, projectFile: string): string {
	const absolute = path.resolve(projectDir, projectFile);
	if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) return path.join(absolute, "tsconfig.json");
	return absolute;
}

function commonSourceDirectory(files: ReadonlyArray<string>, fallback: string): string {
	const sourceFiles = files.filter((file) => /\.tsx?$/.test(file) && !/\.d\.ts$/.test(file));
	if (sourceFiles.length === 0) return fallback;
	let parts = path.resolve(path.dirname(sourceFiles[0])).split(path.sep);
	for (const file of sourceFiles.slice(1)) {
		const next = path.resolve(path.dirname(file)).split(path.sep);
		let common = 0;
		while (common < parts.length && common < next.length && parts[common] === next[common]) common += 1;
		parts = parts.slice(0, common);
	}
	return parts.join(path.sep) || path.parse(path.resolve(sourceFiles[0])).root;
}

function resolveInternalModule(
	fromFile: string,
	specifier: string,
	files: ReadonlyArray<ts.SourceFile>,
): ts.SourceFile | undefined {
	const base = path.resolve(path.dirname(fromFile), specifier);
	const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].map(normalize);
	return files.find((file) => candidates.includes(normalize(file.fileName)));
}

function decoratorNames(node: ts.ClassDeclaration, checker: ts.TypeChecker): string[] {
	return (ts.getDecorators(node) ?? []).map((decorator) => {
		const expression = ts.isCallExpression(decorator.expression) ? decorator.expression.expression : decorator.expression;
		const symbol = checker.getSymbolAtLocation(
			ts.isPropertyAccessExpression(expression) ? expression.name : expression,
		);
		if (symbol) return skipAlias(checker, symbol).name;
		if (ts.isIdentifier(expression)) return expression.text;
		if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
		return "";
	});
}

function symbolForDeclaration(checker: ts.TypeChecker, declaration: ts.Declaration): ts.Symbol | undefined {
	const named = declaration as ts.Declaration & { name?: ts.DeclarationName };
	return named.name ? checker.getSymbolAtLocation(named.name) : undefined;
}

function skipAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
	return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function isExported(node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
	return (node.modifiers ?? []).some(
		(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword,
	);
}

function withExportModifier(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): ts.NodeArray<ts.ModifierLike> {
	if ((modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return modifiers ?? ts.factory.createNodeArray();
	return ts.factory.createNodeArray([ts.factory.createModifier(ts.SyntaxKind.ExportKeyword), ...(modifiers ?? [])]);
}

function isTypeOnlyNode(node: ts.Node): boolean {
	return ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

function isDeclarationName(node: ts.Identifier): boolean {
	const parent = node.parent;
	const namedParent = parent as ts.Node & { name?: ts.Node };
	return (
		namedParent.name === node ||
		(ts.isPropertyAccessExpression(parent) && parent.name === node) ||
		(ts.isPropertyAssignment(parent) && parent.name === node) ||
		(ts.isMethodDeclaration(parent) && parent.name === node) ||
		(ts.isPropertyDeclaration(parent) && parent.name === node)
	);
}

function canReference(from: PluginBoundary, to: PluginBoundary): boolean {
	if (from === "shared") return to === "shared";
	return to === "shared" || to === from;
}

function isInternalSpecifier(value: string): boolean {
	return value.startsWith(".");
}

function relativeModule(fromModule: string, toModule: string): string {
	const fromDir = path.posix.dirname(fromModule);
	let result = path.posix.relative(fromDir, toModule);
	if (!result.startsWith(".")) result = `./${result}`;
	return result;
}

function isWithin(child: string, parent: string): boolean {
	const relative = path.relative(path.resolve(parent), path.resolve(child));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalize(value: string): string {
	return value.replace(/\\/g, "/");
}

function relativeDisplay(root: string, value: string): string {
	const relative = normalize(path.relative(root, value));
	return relative === "" ? "." : relative;
}

function locationMessage(file: ts.SourceFile, node: ts.Node, message: string): string {
	const position = file.getLineAndCharacterOfPosition(node.getStart(file));
	return `${normalize(file.fileName)}:${position.line + 1}:${position.character + 1}: ${message}`;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
	return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

const externalManifestCache = new Map<string, Readonly<Record<string, PluginBoundary>> | undefined>();

function externalBoundaryForSymbol(
	symbol: ts.Symbol,
): { readonly name: string; readonly boundary: PluginBoundary } | undefined {
	const declaration = symbol.declarations?.[0];
	if (!declaration || !declaration.getSourceFile().isDeclarationFile) return undefined;
	let current = path.dirname(declaration.getSourceFile().fileName);
	for (let depth = 0; depth < 8; depth += 1) {
		const manifestPath = path.join(current, ".rovy-boundaries.json");
		let exports = externalManifestCache.get(manifestPath);
		if (exports === undefined && !externalManifestCache.has(manifestPath)) {
			if (fs.existsSync(manifestPath)) {
				const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
					readonly exports?: Readonly<Record<string, PluginBoundary>>;
				};
				exports = parsed.exports;
			}
			externalManifestCache.set(manifestPath, exports);
		}
		const boundary = exports?.[symbol.name];
		if (boundary) return { name: symbol.name, boundary };
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
}
