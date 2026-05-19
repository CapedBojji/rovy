import ts from "typescript";

export function id(name: string): ts.Identifier {
	return ts.factory.createIdentifier(name);
}

export function str(value: string): ts.StringLiteral {
	return ts.factory.createStringLiteral(value);
}

export function bool(value: boolean): ts.Expression {
	return value ? ts.factory.createTrue() : ts.factory.createFalse();
}

export function num(value: number): ts.Expression {
	return ts.factory.createNumericLiteral(value);
}

export function arr(values: ReadonlyArray<ts.Expression>, multiLine = false): ts.ArrayLiteralExpression {
	return ts.factory.createArrayLiteralExpression([...values], multiLine);
}

export function prop(name: string, value: ts.Expression): ts.PropertyAssignment {
	return ts.factory.createPropertyAssignment(name, value);
}

export function obj(properties: ReadonlyArray<ts.ObjectLiteralElementLike>, multiLine = true): ts.ObjectLiteralExpression {
	return ts.factory.createObjectLiteralExpression([...properties], multiLine);
}

export function field(base: ts.Expression, name: string): ts.PropertyAccessExpression {
	return ts.factory.createPropertyAccessExpression(base, name);
}

export function call(expr: ts.Expression, args: ReadonlyArray<ts.Expression> = []): ts.CallExpression {
	return ts.factory.createCallExpression(expr, undefined, [...args]);
}

export function arrow(body: ts.ConciseBody): ts.ArrowFunction {
	return ts.factory.createArrowFunction(
		undefined,
		undefined,
		[],
		undefined,
		ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		body,
	);
}

export function stmt(expr: ts.Expression): ts.ExpressionStatement {
	return ts.factory.createExpressionStatement(expr);
}

export function importNamed(moduleName: string, exportedName: string, localName: string): ts.ImportDeclaration {
	return ts.factory.createImportDeclaration(
		undefined,
		ts.factory.createImportClause(
			false,
			undefined,
			ts.factory.createNamedImports([
				ts.factory.createImportSpecifier(
					false,
					exportedName === localName ? undefined : id(exportedName),
					id(localName),
				),
			]),
		),
		str(moduleName),
		undefined,
	);
}

export function importDefault(moduleName: string, localName: string): ts.ImportDeclaration {
	return ts.factory.createImportDeclaration(
		undefined,
		ts.factory.createImportClause(false, id(localName), undefined),
		str(moduleName),
		undefined,
	);
}

export function propertyValue(object: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined {
	if (!object) return undefined;
	for (const property of object.properties) {
		if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) {
			return property.initializer;
		}
		if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
			return property.name;
		}
	}
	return undefined;
}

export function propertyNameText(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	return undefined;
}

export function lastTypeName(name: ts.EntityName): string {
	if (ts.isIdentifier(name)) return name.text;
	return name.right.text;
}

export function entityNameToExpression(name: ts.EntityName): ts.Expression {
	if (ts.isIdentifier(name)) return id(name.text);
	return field(entityNameToExpression(name.left), name.right.text);
}

export function stripUndefinedProperties(properties: ReadonlyArray<ts.ObjectLiteralElementLike | undefined>): ts.ObjectLiteralElementLike[] {
	return properties.filter((value): value is ts.ObjectLiteralElementLike => value !== undefined);
}
