export interface EditableImageBufferFill {
	r: number;
	g: number;
	b: number;
	a: number;
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
}
