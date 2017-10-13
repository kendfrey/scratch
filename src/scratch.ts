/** A context for drawing strokes. */
export class Context
{
	/** The list of strokes in the context. */
	private _strokes: Stroke[] = [];

	/** Gets or sets the number of segments to render each stroke with. Higher numbers mean better quality and worse performance. */
	segmentation = 256;

	/** Gets or sets the default properties for all strokes. */
	default = { x: 0, y: 0, r: 0, g: 0, b: 0, a: 1, w: 1 };

	/**
	 * Adds strokes to the context.
	 * @param strokes The strokes to add.
	 */
	add(...strokes: Stroke[])
	{
		this._strokes.push(...strokes);
	}

	/**
	 * Clears all strokes from the context.
	 */
	clear()
	{
		this._strokes = [];
	}

	/**
	 * Draws all strokes in the context to a canvas.
	 * @param ctx The canvas context to draw to.
	 */
	draw(ctx: CanvasRenderingContext2D)
	{
		/** The width of the canvas. */
		const w = ctx.canvas.width;
		/** The height of the canvas */
		const h = ctx.canvas.height;
		/** The image to render to. */
		const data = ctx.createImageData(w, h);

		// Draw all the strokes.
		for (const stroke of this._strokes)
		{
			/** The start of the line segment being drawn. */
			let lineStart = Object.assign({}, this.default, stroke.evaluate(0));
			// Draw the start cap, since it won't be drawn automatically.
			drawLine(data, Object.assign({}, lineStart), Object.assign({}, lineStart));

			for (let t = 1; t <= this.segmentation; t++)
			{
				/** The end of the line segment being drawn. */
				const lineEnd = Object.assign({}, this.default, stroke.evaluate(t / this.segmentation));
				drawLine(data, lineStart, Object.assign({}, lineEnd));
				lineStart = lineEnd;
			}
		}

		/** The offscreen canvas to copy the rendered strokes to. */
		const canvas2 = document.createElement("canvas");
		canvas2.width = w;
		canvas2.height = h;
		/** The offscreen canvas context. */
		const ctx2 = canvas2.getContext("2d")!;
		ctx2.putImageData(data, 0, 0);
		// Blend the result onto the target canvas.
		ctx.drawImage(canvas2, 0, 0);
	}
}

/** A parametric stroke. */
export class Stroke
{
	/** The parametric function to calculate the stroke. */
	private _evaluator: (t: number) => LinePointPartial;

	/**
	 * Creates a new empty stroke.
	 */
	constructor()
	{
		this._evaluator = t => ({});
	}

	/**
	 * Creates a new stroke with the given function.
	 * @param evaluator The parametric function to calculate the stroke properties.
	 */
	private static _create(evaluator: (t: number) => LinePointPartial): Stroke
	{
		const stroke = new Stroke();
		stroke._evaluator = evaluator;
		return stroke;
	}

	/**
	 * Combines multiple strokes into a single continuous stroke.
	 * @param strokes The strokes to combine.
	 */
	static sequence(strokes: Stroke[]): Stroke
	{
		return Stroke._create(t =>
		{
			t *= strokes.length;
			const index = clamp(Math.floor(t), 0, strokes.length - 1);
			return strokes[index]._evaluator(t - index)
		});
	}

	/**
	 * Calculates the properties of the stroke at the given position.
	 * @param t The input to the parametric function.
	 */
	evaluate(t: number): LinePointPartial
	{
		return this._evaluator(t);
	}

	/**
	 * Adds a parametric function for some or all of the stroke properties.
	 * @param f The parametric function to calculate the stroke.
	 */
	parametric(f: (t: number) => LinePointPartial): Stroke
	{
		return Stroke._create(t => Object.assign({}, this._evaluator(t), f(t)))
	}

	/**
	 * Transforms the output of the stroke.
	 * @param f The function to transform the output by.
	 */
	transform(f: (point: LinePointPartial) => LinePointPartial): Stroke
	{
		return Stroke._create(t =>
		{
			/** The input of the transformation function. */
			const point = this._evaluator(t);
			// Merge the output, passing a copy to prevent mutation.
			return Object.assign(point, f(Object.assign({}, point)));
		});
	}

	/**
	 * Transforms the input parameter of the stroke.
	 * @param f The function to transform the input parameter by.
	 */
	slide(f: (t: number) => number): Stroke
	{
		return Stroke._create(t => this._evaluator(f(t)));
	}

	/**
	 * Cuts the input parameter of the stroke to within the given bounds.
	 * @param t0 The beginning of the interval to include.
	 * @param t1 The end of the interval to include.
	 */
	cut(t0: number, t1: number): Stroke
	{
		return this.slide(t => t * (t1 - t0) + t0);
	}

	/**
	 * Sets some or all of the stroke properties to constant values.
	 * @param point The values to set.
	 */
	fix(point: LinePointPartial): Stroke
	{
		return Stroke._create(t => Object.assign({}, this._evaluator(t), point))
	}

	/**
	 * Creates a bezier curve through any set of properties.
	 * @param start The starting point.
	 * @param points The bezier control points and end point.
	 */
	bezier(start: LinePointPartial, ...points: LinePointPartial[]): Stroke;
	/**
	 * Creates a bezier curve through any set of properties.
	 * @param points The bezier control points.
	 */
	bezier(...points: LinePointPartial[]): Stroke
	{
		/** The list of each object's properties. */
		const propsList = points.map(p => new Set(Object.keys(p)));
		/** The intersection of all objects, which is used for bezier interpolation. */
		const props = [...propsList[0].values()].filter(p => propsList.every(s => s.has(p)));

		return Stroke._create(t =>
		{
			/** The interpolated point. */
			const result = {};
			for (const prop of props)
			{
				(<any>result)[prop] = bezier(t, points.map(p => (<any>p)[prop]))
			}
			return Object.assign({}, this._evaluator(t), result);
		});
	}

	/**
	 * Creates a straight line between two points with any set of properties.
	 * @param start The starting point.
	 * @param end The ending point.
	 */
	line(start: LinePointPartial, end: LinePointPartial): Stroke
	{
		return this.bezier(start, end);
	}

	/**
	 * Creates an elliptical stroke.
	 * @param x The X coordinate of the center.
	 * @param y The Y coordinate of the center.
	 * @param rx The radius in the X direction.
	 * @param ry The radius in the Y direction.
	 * @param start The angle the stroke starts from, in radians.
	 * @param ccw True to reverse the direction of rotation to counter-clockwise.
	 * @param form The method used to measure angles in the ellipse. "parametric": The standard parametric angle. "polar": The angle with the X axis. "tangent": The tangent angle of the curve.
	 */
	ellipse(x: number, y: number, rx: number, ry: number, start: number = 0, ccw: boolean = false, form: "parametric" | "polar" | "tangent" = "parametric"): Stroke
	{
		/** The resulting stroke. */
		let result = this.parametric(t =>
		({
			x: x + rx * Math.cos((ccw ? -t : t) * 2 * Math.PI),
			y: y + ry * Math.sin((ccw ? -t : t) * 2 * Math.PI)
		}));

		switch (form)
		{
			case "parametric":
				break;
			case "polar":
				result = result.slide(slideEllipse(rx / ry));
				break;
			case "tangent":
				result = result.slide(slideEllipse(ry / rx));
				break;
		}

		return result.slide(t => t + start / (2 * Math.PI));
	}

	/**
	 * Creates a circular stroke.
	 * @param x The X coordinate of the center.
	 * @param y The Y coordinate of the center.
	 * @param r The radius of the circle.
	 * @param start The angle the stroke starts from, in radians.
	 * @param ccw True to reverse the direction of rotation to counter-clockwise.
	 */
	circle(x: number, y: number, r: number, start: number = 0, ccw: boolean = false): Stroke
	{
		return this.ellipse(x, y, r, r, start, ccw);
	}

	/**
	 * Translates the stroke geometry.
	 * @param x The distance to translate along the X axis.
	 * @param y The distance to translate along the Y axis.
	 */
	translate(x: number, y: number): Stroke
	{
		return this.matrix(1, 0, 0, 1, x, y);
	}

	/**
	 * Scales the stroke geometry around the origin.
	 * @param sx The X coordinate scale factor.
	 * @param sy The Y coordinate scale factor.
	 */
	scale(sx: number, sy: number): Stroke;
	/**
	 * Scales the stroke geometry around a point.
	 * @param sx The X coordinate scale factor.
	 * @param sy The Y coordinate scale factor.
	 * @param x The X coordinate of the center of scaling.
	 * @param y The Y coordinate of the center of scaling.
	 */
	scale(sx: number, sy: number, x: number, y: number): Stroke;
	/**
	 * Scales the stroke geometry around a point.
	 * @param sx The X coordinate scale factor.
	 * @param sy The Y coordinate scale factor.
	 * @param x The X coordinate of the center of scaling.
	 * @param y The Y coordinate of the center of scaling.
	 */
	scale(sx: number, sy: number, x: number = 0, y: number = 0): Stroke
	{
		return this.matrix(sx, 0, 0, sy, x - sx * x, y - sy * y);
	}

	/**
	 * Rotates the stroke geometry about the origin.
	 * @param angle The angle to rotate, in radians.
	 */
	rotate(angle: number): Stroke;
	/**
	 * Rotates the stroke geometry about a point.
	 * @param angle The angle to rotate, in radians.
	 * @param x The X coordinate of the center of rotation.
	 * @param y The Y coordinate of the center of rotation.
	 */
	rotate(angle: number, x: number, y: number): Stroke;
	/**
	 * Rotates the stroke geometry about a point.
	 * @param angle The angle to rotate, in radians.
	 * @param x The X coordinate of the center of rotation.
	 * @param y The Y coordinate of the center of rotation.
	 */
	rotate(angle: number, x: number = 0, y: number = 0): Stroke
	{
		return this.matrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle),
			-Math.cos(angle) * x + Math.sin(angle) * y + x, -Math.sin(angle) * x + -Math.cos(angle) * y + y);
	}

	/**
	 * Transforms the stroke geometry by multiplying it by a matrix.
	 * @param a X coordinate scale factor.
	 * @param b X coordinate skew factor.
	 * @param c Y coordinate skew factor.
	 * @param d Y coordinate scale factor.
	 * @param e X coordinate translation factor.
	 * @param f Y coordinate translation factor.
	 */
	matrix(a: number, b: number, c: number, d: number, e: number, f: number): Stroke
	{
		return Stroke._create(t =>
		{
			/** The point to transform. */
			const point = this._evaluator(t);

			if (point.x === undefined || point.y === undefined)
			{
				// Don't try to transform unknown points.
				return point;
			}
			
			return Object.assign(point, { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f });
		});
	}
}

/**
 * A stroke point with optional values.
 */
type LinePointPartial =
{
	/** The X coordinate of the point. */
	x?: number,
	/** The Y coordinate of the point. */
	y?: number,
	/** The red value of the point. */
	r?: number,
	/** The green value of the point. */
	g?: number,
	/** The blue value of the point. */
	b?: number,
	/** The alpha value of the point. */
	a?: number,
	/** The stroke width of the point. */
	w?: number
};

/**
 * A line endpoint.
 */
type LinePoint =
{
	/** The X coordinate of the point. */
	x: number,
	/** The Y coordinate of the point. */
	y: number,
	/** The red value of the point. */
	r: number,
	/** The green value of the point. */
	g: number,
	/** The blue value of the point. */
	b: number,
	/** The alpha value of the point. */
	a: number,
	/** The stroke width of the point. */
	w: number
};

/**
 * Renders a line.
 * @param data The image to render to.
 * @param start The start of the line.
 * @param end The end of the line.
 */
function drawLine(data: ImageData, start: LinePoint, end: LinePoint)
{
	/** True if the line is taller than it is wide. */
	const steep = Math.abs(start.y - end.y) > Math.abs(start.x - end.x);
	if (steep)
	{
		// Swap the X and Y axes.
		let tmp;

		tmp = start.x;
		start.x = start.y;
		start.y = tmp;

		tmp = end.x;
		end.x = end.y;
		end.y = tmp;
	}

	/** True if the line runs right to left. */
	const reverse = start.x > end.x;
	if (reverse)
	{
		// Invert the X axis.
		start.x = -start.x;
		end.x = -end.x;
	}

	/** The slope of the line (if undefined, becomes 0). */
	const slope = end.x === start.x ? 0 : (end.y - start.y) / (end.x - start.x);

	/** The right edge of the line. */
	const minX = Math.floor(start.x - start.w * 0.5);
	/** The left edge of the line. */
	const maxX = Math.floor(end.x + end.w * 0.5);

	// Render the line from left to right.
	for (let x = minX; x <= maxX; x++)
	{
		/** The Y coordinate of the middle of the stroke. */
		const lineY = clamp(start.y + slope * (x - start.x), start.y, end.y);
		// Start from the middle of the line and render downward until we leave the stroke.
		for (let y = Math.ceil(lineY); true; y++)
		{
			if (!drawLinePixel(data, x, y, start, end, steep, reverse))
			{
				break;
			}
		}

		// Start from the middle of the line and render upward until we leave the stroke.
		for (let y = Math.floor(lineY); true; y--)
		{
			if (!drawLinePixel(data, x, y, start, end, steep, reverse))
			{
				break;
			}
		}
	}
}

/**
 * Renders a pixel on a line and returns true if the pixel is within the stroke.
 * @param data The image to render to.
 * @param x The X coordinate of the pixel.
 * @param y The Y coordinate of the pixel.
 * @param start The start of the line.
 * @param end The end of the line.
 * @param steep True if the original line is taller than it is wide.
 * @param reverse True if the original line runs right to left.
 */
function drawLinePixel(data: ImageData, x: number, y: number, start: LinePoint, end: LinePoint, steep: boolean, reverse: boolean): boolean
{
	/** The X distance between the start and the end of the line. */
	const dx = end.x - start.x;
	/** The Y distance between the start and the end of the line. */
	const dy = end.y - start.y;
	/** The X distance between the start of the line and the pixel. */
	const dxPx = x - start.x;
	/** The Y distance between the start of the line and the pixel. */
	const dyPx = y - start.y;
	/** The closest point on the line to the pixel, from 0 to 1. */
	let t = (dx * dxPx + dy * dyPx) / (dx ** 2 + dy ** 2);
	if (dx === 0)
	{
		// If the start and end point are the same, override t to 0.
		t = 0;
	}
	/** True if the pixel is part of the cap on the start of the line. */
	const isStartCap = t < 0;
	t = clamp(t);
	/** The X coordinate of the nearest point on the line. */
	const tx = lerp(t, start.x, end.x);
	/** The Y coordinate of the nearest point on the line. */
	const ty = lerp(t, start.y, end.y);
	/** The interpolated alpha value. */
	const ta = lerp(t, start.a, end.a);
	/** The interpolated and blended red value. */
	const tr = lerp(t, start.r * start.a, end.r * end.a) / ta;
	/** The interpolated and blended green value. */
	const tg = lerp(t, start.g * start.a, end.g * end.a) / ta;
	/** The interpolated and blended blue value. */
	const tb = lerp(t, start.b * start.a, end.b * end.a) / ta;
	/** The interpolated stroke width. */
	const tw = Math.max(lerp(t, start.w, end.w), 0);
	/** The distance to the line. */
	const d = Math.sqrt((x - tx) ** 2 + (y - ty) ** 2);
	/** The strength of the pixel, used for antialiasing. */
	const blend = clamp((Math.max(tw, 1) * 0.5 + 0.5 - d) * Math.min(tw, 1));
	if (blend === 0)
	{
		// We've gone past the end of the stroke, we can stop now.
		return false;
	}

	if (isStartCap)
	{
		// Do not render the start cap, to avoid overwriting previous line segments.
		return true;
	}

	if (reverse)
	{
		// Invert the X axis.
		x = -x;
	}
	if (steep)
	{
		// Swap the X and Y axes.
		const tmp = x;
		x = y;
		y = tmp;
	}
	drawPixel(data, x, y, tr, tg, tb, ta, blend);
	
	// Return true to indicate we haven't reached the edge of the stroke yet.
	return true;
}

/**
 * Renders a pixel.
 * @param data The image to render to.
 * @param x The X coordinate of the pixel.
 * @param y The Y coordinate of the pixel.
 * @param r The red value of the pixel.
 * @param g The green value of the pixel.
 * @param b The blue value of the pixel.
 * @param a The alpha value of the pixel.
 * @param blend Used to blend the pixel with any existing color.
 */
function drawPixel(data: ImageData, x: number, y: number, r: number, g: number, b: number, a: number, blend: number)
{
	// If outside of the image bounds, do nothing.
	if (x < 0 || x >= data.width || y < 0 || y >= data.height)
	{
		return;
	}

	r = Math.floor(clamp(r) * 255);
	g = Math.floor(clamp(g) * 255);
	b = Math.floor(clamp(b) * 255);
	a = clamp(a);

	/** The pixel index into the data array. */
	const i = (y * data.width + x) * 4;
	/** The alpha value of the old pixel. */
	const oldA = data.data[i + 3] / 255;
	if (blend >= oldA)
	{
		// If the new pixel is more opaque than the old pixel, overwrite the old pixel.
		a = Math.floor(a * blend * 255);
		data.data[i + 0] = r;
		data.data[i + 1] = g;
		data.data[i + 2] = b;
		data.data[i + 3] = a;
	}
	else if (oldA === 1)
	{
		// If the old pixel is fully opaque, blend with it, to prevent aliasing when crossing lines.
		a = lerp(blend, oldA, a);
		data.data[i + 0] = lerp(blend, data.data[i + 0], r * a) / a;
		data.data[i + 1] = lerp(blend, data.data[i + 1], g * a) / a;
		data.data[i + 2] = lerp(blend, data.data[i + 2], b * a) / a;
		a = Math.floor(a * 255);
		data.data[i + 3] = a;
	}
	// If the old pixel is more opaque than the new pixel, but not fully opaque, do nothing, to prevent artifacts where two line endpoints meet.
}

/**
 * Performs a bezier interpolation.
 * @param t The distance parameter to interpolate at.
 * @param values The control points to interpolate between.
 */
function bezier(t: number, values: number[]): number
{
	if (values.length === 1)
	{
		return values[0];
	}
	else
	{
		return lerp(t, bezier(t, values.slice(0, -1)), bezier(t, values.slice(1)));
	}
}

/**
 * Performs a linear interpolation.
 * @param t The distance along the interval to interpolate at.
 * @param a The start of the interval.
 * @param b The end of the interval.
 */
function lerp(t: number, a: number, b: number): number
{
	return (1 - t) * a + t * b;
}

/**
 * Clamps a number between 0 and 1.
 * @param t The number to clamp.
 */
function clamp(t: number): number;
/**
 * Clamps a number within bounds.
 * @param t The number to clamp.
 * @param a The lower bound.
 * @param b The upper bound.
 */
function clamp(t: number, a: number, b: number): number;
/**
 * Clamps a number within bounds.
 * @param t The number to clamp.
 * @param a The lower bound.
 * @param b The upper bound.
 */
function clamp(t: number, a: number = 0, b: number = 1): number
{
	// If the bounds are swapped, correct them.
	if (a > b)
	{
		const tmp = a;
		a = b;
		b = tmp;
	}

	return Math.max(Math.min(t, b), a);
}

/**
 * Converts angles between forms of an ellipse.
 * @param ratio The ratio to transform by.
 */
function slideEllipse(ratio: number): (t: number) => number
{
	return t =>
	{
		t = (t % 1 + 1.5) % 1 - 0.5;
		/** Handles angles in the left quadrants. */
		const offset = Math.abs(t) > 0.25 ? 0.5 * Math.sign(t) : 0;
		return Math.atan(Math.tan(t * 2 * Math.PI) * ratio) / (2 * Math.PI) + offset;
	};
}

/**
 * Creates a RGB color from HSL values.
 * @param h The hue value of the color, from 0 to 1.
 * @param s The saturation value of the color, from 0 to 1.
 * @param l The lightness value of the color, from 0 to 1.
 * @param a The alpha value of the color.
 */
export function hsl(h: number, s: number, l: number, a?: number) : LinePointPartial
{
	/** The hue value of the color, from 0 to 6. */
	const h$ = h % 1 * 6;
	s = clamp(s);
	l = clamp(l);
	/** The chroma value of the color. */
	const c = (1 - Math.abs(2 * l - 1)) * s;

	/** The resulting color. */
	const result: LinePointPartial = { r: 0, g: 0, b: 0 };
	if (a !== undefined)
	{
		result.a = a;
	}

	if (h$ < 1)
	{
		result.r = c;
		result.g = c * h$;
	}
	else if (h$ < 2)
	{
		result.r = c * (2 - h$);
		result.g = c;
	}
	else if (h$ < 3)
	{
		result.g = c;
		result.b = c * (h$ - 2);
	}
	else if (h$ < 4)
	{
		result.g = c * (4 - h$);
		result.b = c;
	}
	else if (h$ < 5)
	{
		result.r = c * (h$ - 4);
		result.b = c;
	}
	else
	{
		result.r = c;
		result.b = c * (6 - h$);
	}

	/** The amount of lightness to add after calculating hue and chroma. */
	const white = l - c * 0.5;
	result.r! += white;
	result.g! += white;
	result.b! += white;

	return result;
}
