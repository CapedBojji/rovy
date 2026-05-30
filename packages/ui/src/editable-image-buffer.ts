export interface EditableImageBufferFill {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface EditableImageStrokeOptions {
	alpha?: number;
	thickness?: number;
}

export interface EditableImageShapeOptions extends EditableImageStrokeOptions {
	fill?: boolean;
}

function byte(value: number): number {
	return math.clamp(math.round(value), 0, 255);
}

function colorByte(value: number): number {
	return byte(value * 255);
}

function assertImageSize(size: Vector2): void {
	const width = size.X;
	const height = size.Y;
	assert(
		width === math.floor(width) && height === math.floor(height) && width >= 1 && height >= 1,
		"[rovy-ui] EditableImageBuffer size must be positive integer pixels",
	);
	assert(width <= 1024 && height <= 1024, "[rovy-ui] EditableImageBuffer size cannot exceed 1024x1024");
}

export class EditableImageBuffer {
	public readonly size: Vector2;
	private readonly pixels: buffer;
	private readonly width: number;
	private readonly height: number;

	public constructor(size: Vector2, fill?: EditableImageBufferFill) {
		assertImageSize(size);
		this.size = size;
		this.width = size.X;
		this.height = size.Y;
		this.pixels = buffer.create(this.width * this.height * 4);
		if (fill !== undefined) this.clear(fill.r, fill.g, fill.b, fill.a);
	}

	public setPixel(position: Vector2, color: Color3, alpha = 255): void {
		const x = math.floor(position.X);
		const y = math.floor(position.Y);
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		this.writePixel(x, y, colorByte(color.R), colorByte(color.G), colorByte(color.B), byte(alpha));
	}

	public fillRect(position: Vector2, size: Vector2, color: Color3, alpha = 255): void {
		const x0 = math.max(0, math.floor(position.X));
		const y0 = math.max(0, math.floor(position.Y));
		const x1 = math.min(this.width, math.floor(position.X + size.X));
		const y1 = math.min(this.height, math.floor(position.Y + size.Y));
		if (x1 <= x0 || y1 <= y0) return;

		const r = colorByte(color.R);
		const g = colorByte(color.G);
		const b = colorByte(color.B);
		const a = byte(alpha);
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				this.writePixel(x, y, r, g, b, a);
			}
		}
	}

	public drawLine(from: Vector2, to: Vector2, color: Color3, options: EditableImageStrokeOptions = {}): void {
		const r = colorByte(color.R);
		const g = colorByte(color.G);
		const b = colorByte(color.B);
		const a = byte(options.alpha ?? 255);
		const thickness = math.max(1, math.floor(options.thickness ?? 1));

		let x0 = math.floor(from.X);
		let y0 = math.floor(from.Y);
		const x1 = math.floor(to.X);
		const y1 = math.floor(to.Y);
		const dx = math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = -math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = dx + dy;

		while (true) {
			this.writeBrush(x0, y0, thickness, r, g, b, a);
			if (x0 === x1 && y0 === y1) break;
			const e2 = 2 * err;
			if (e2 >= dy) {
				err += dy;
				x0 += sx;
			}
			if (e2 <= dx) {
				err += dx;
				y0 += sy;
			}
		}
	}

	public drawCircle(center: Vector2, radius: number, color: Color3, options: EditableImageShapeOptions = {}): void {
		if (radius < 0) return;
		const r = colorByte(color.R);
		const g = colorByte(color.G);
		const b = colorByte(color.B);
		const a = byte(options.alpha ?? 255);
		const fill = options.fill ?? true;
		const thickness = math.max(1, math.floor(options.thickness ?? 1));
		const outerSq = radius * radius;
		const innerRadius = fill ? 0 : math.max(0, radius - thickness);
		const innerSq = innerRadius * innerRadius;
		const minX = math.max(0, math.floor(center.X - radius));
		const maxX = math.min(this.width - 1, math.ceil(center.X + radius));
		const minY = math.max(0, math.floor(center.Y - radius));
		const maxY = math.min(this.height - 1, math.ceil(center.Y + radius));

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const dx = x - center.X;
				const dy = y - center.Y;
				const dSq = dx * dx + dy * dy;
				if (dSq <= outerSq && dSq >= innerSq) this.writePixel(x, y, r, g, b, a);
			}
		}
	}

	public drawPolygon(points: ReadonlyArray<Vector2>, color: Color3, options: EditableImageShapeOptions = {}): void {
		if (points.size() < 2) return;
		const r = colorByte(color.R);
		const g = colorByte(color.G);
		const b = colorByte(color.B);
		const a = byte(options.alpha ?? 255);
		const fill = options.fill ?? true;

		if (fill && points.size() >= 3) {
			this.fillPolygon(points, r, g, b, a);
		} else {
			const thickness = math.max(1, math.floor(options.thickness ?? 1));
			for (let i = 0; i < points.size(); i++) {
				const nextIndex = (i + 1) % points.size();
				this.drawLine(points[i], points[nextIndex], color, { alpha: a, thickness });
			}
		}
	}

	public clear(r = 0, g = 0, b = 0, a = 0): void {
		const rr = byte(r);
		const gg = byte(g);
		const bb = byte(b);
		const aa = byte(a);
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.writePixel(x, y, rr, gg, bb, aa);
			}
		}
	}

	public getBuffer(): buffer {
		return this.pixels;
	}

	private writePixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
		const offset = (y * this.width + x) * 4;
		buffer.writeu8(this.pixels, offset, r);
		buffer.writeu8(this.pixels, offset + 1, g);
		buffer.writeu8(this.pixels, offset + 2, b);
		buffer.writeu8(this.pixels, offset + 3, a);
	}

	private writeBrush(x: number, y: number, thickness: number, r: number, g: number, b: number, a: number): void {
		if (thickness <= 1) {
			if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.writePixel(x, y, r, g, b, a);
			return;
		}

		const radius = thickness / 2;
		const radiusSq = radius * radius;
		const minX = math.floor(x - radius);
		const maxX = math.ceil(x + radius);
		const minY = math.floor(y - radius);
		const maxY = math.ceil(y + radius);
		for (let yy = minY; yy <= maxY; yy++) {
			if (yy < 0 || yy >= this.height) continue;
			for (let xx = minX; xx <= maxX; xx++) {
				if (xx < 0 || xx >= this.width) continue;
				const dx = xx - x;
				const dy = yy - y;
				if (dx * dx + dy * dy <= radiusSq) this.writePixel(xx, yy, r, g, b, a);
			}
		}
	}

	private fillPolygon(points: ReadonlyArray<Vector2>, r: number, g: number, b: number, a: number): void {
		let minY = points[0].Y;
		let maxY = points[0].Y;
		for (let i = 1; i < points.size(); i++) {
			minY = math.min(minY, points[i].Y);
			maxY = math.max(maxY, points[i].Y);
		}

		const y0 = math.max(0, math.floor(minY));
		const y1 = math.min(this.height - 1, math.ceil(maxY));
		for (let y = y0; y <= y1; y++) {
			const scanY = y + 0.5;
			const intersections = new Array<number>();
			for (let i = 0; i < points.size(); i++) {
				const aPoint = points[i];
				const bPoint = points[(i + 1) % points.size()];
				const crosses =
					(aPoint.Y <= scanY && bPoint.Y > scanY) || (bPoint.Y <= scanY && aPoint.Y > scanY);
				if (!crosses) continue;
				const t = (scanY - aPoint.Y) / (bPoint.Y - aPoint.Y);
				intersections.push(aPoint.X + t * (bPoint.X - aPoint.X));
			}

			intersections.sort((left, right) => left < right);
			for (let i = 0; i + 1 < intersections.size(); i += 2) {
				const x0 = math.max(0, math.ceil(intersections[i] - 0.5));
				const x1 = math.min(this.width - 1, math.floor(intersections[i + 1] - 0.5));
				for (let x = x0; x <= x1; x++) {
					this.writePixel(x, y, r, g, b, a);
				}
			}
		}
	}
}
