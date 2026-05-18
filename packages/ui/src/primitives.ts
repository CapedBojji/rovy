export function c(r: number, g: number, b: number): Color3 {
	const [ok, value] = pcall(() => Color3.fromRGB(r, g, b));
	if (ok) return value;
	return ({ R: r / 255, G: g / 255, B: b / 255 } as unknown) as Color3;
}

export function v2(x: number, y: number): Vector2 {
	const [ok, value] = pcall(() => new Vector2(x, y));
	if (ok) return value;
	return ({ X: x, Y: y } as unknown) as Vector2;
}

export function udim2(xs: number, xo: number, ys: number, yo: number): UDim2 {
	const [ok, value] = pcall(() => new UDim2(xs, xo, ys, yo));
	if (ok) return value;
	return ({ X: { Scale: xs, Offset: xo }, Y: { Scale: ys, Offset: yo } } as unknown) as UDim2;
}

export function udim(scale: number, offset: number): UDim {
	const [ok, value] = pcall(() => new UDim(scale, offset));
	if (ok) return value;
	return ({ Scale: scale, Offset: offset } as unknown) as UDim;
}
