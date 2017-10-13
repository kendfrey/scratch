# Scratch

Scratch is a custom stroke renderer for HTML5 canvas. It is designed to make up for limitations of the built-in 2D canvas renderer.

All strokes in Scratch are parametric curves over spatial coordinates (x, y), color (r, g, b, a), and stroke width (w).

### Get Started

#### TypeScript

Copy [scratch.ts](src/scratch.ts) to your project and use the following import:

```ts
import { Context, Stroke, hsl } from "scratch";

// Your code here.
```

#### JavaScript

Copy [scratch.js](../../blob/dist/dist/scratch.js) and [require.js](../../blob/dist/dist/require.js) to your project and use the following import:

```js
require(["scratch"], ({ Context, Stroke, hsl }) =>
{
// Your code here.
});
```

Include the scripts in your HTML like this:

```html
<script src="require.js"></script>
<script src="myScript.js"></script>
```

### Documentation

See [demo.html](https://cdn.rawgit.com/kendfrey/scratch/dist/demo.html) for a list of examples.

There is currently no API documentation page. The [source code](src/scratch.ts) has JSDoc comments to document every function.

### Development

To set up the project after cloning the repository, simply run `npm install` to install dependencies.

To build the project, run `npm run build`.
