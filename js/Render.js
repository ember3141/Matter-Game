/**
* The `Matter.Render` module is a simple canvas based Renderer for visualising instances of `Matter.Engine`.
* It is intended for development and debugging purposes, but may also be suitable for simple games.
* It includes a number of drawing options including wireframe, vector with support for sprites and viewports.
*
* @class gRender
*/

var Render = {};

//module.exports = Render;

var Common = __webpack_require__(0);
var Composite = __webpack_require__(5);
var Bounds = __webpack_require__(1);
var Events = __webpack_require__(4);
var Vector = __webpack_require__(2);
var Mouse = __webpack_require__(13);

(function() {

    var _requestAnimationFrame,
        _cancelAnimationFrame;

    if (typeof window !== 'undefined') {
        _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame
                                      || window.mozRequestAnimationFrame || window.msRequestAnimationFrame
                                      || function(callback){ window.setTimeout(function() { callback(Common.now()); }, 1000 / 60); };

        _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame
                                      || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
    }

    Render._goodFps = 30;
    Render._goodDelta = 1000 / 60;

    /**
     * Creates a new Renderer. The options parameter is an object that specifies any properties you wish to override the defaults.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {object} [options]
     * @return {Render} A new Renderer
     */
    Render.create = function(options) {
        var defaults = {
            engine: null,
            element: null,
            canvas: null,
            mouse: null,
            frameRequestId: null,
            timing: {
                historySize: 60,
                delta: 0,
                deltaHistory: [],
                lastTime: 0,
                lastTimestamp: 0,
                lastElapsed: 0,
                timestampElapsed: 0,
                timestampElapsedHistory: [],
                engineDeltaHistory: [],
                engineElapsedHistory: [],
                elapsedHistory: []
            },
            options: {
                width: 800,
                height: 600,
                pixelRatio: 1,
                background: '#14151f',
                wireframeBackground: '#14151f',
                hasBounds: !!options.bounds,
                enabled: true,
                wireframes: true,
                showSleeping: true,
                showDebug: false,
                showStats: false,
                showPerformance: false,
                showBounds: false,
                showVelocity: false,
                showCollisions: false,
                showSeparations: false,
                showAxes: false,
                showPositions: false,
                showAngleIndicator: false,
                showIds: false,
                showVertexNumbers: false,
                showConvexHulls: false,
                showInternalEdges: false,
                showMousePosition: false
            }
        };

        var Render = Common.extend(defaults, options);

        if (Render.canvas) {
            Render.canvas.width = Render.options.width || Render.canvas.width;
            Render.canvas.height = Render.options.height || Render.canvas.height;
        }

        Render.mouse = options.mouse;
        Render.engine = options.engine;
        Render.canvas = Render.canvas || _createCanvas(Render.options.width, Render.options.height);
        Render.context = Render.canvas.getContext('2d');
        Render.textures = {};

        Render.bounds = Render.bounds || {
            min: {
                x: 0,
                y: 0
            },
            max: {
                x: Render.canvas.width,
                y: Render.canvas.height
            }
        };

        // for temporary back compatibility only
        Render.controller = Render;
        Render.options.showBroadphase = false;

        if (Render.options.pixelRatio !== 1) {
            Render.setPixelRatio(Render, Render.options.pixelRatio);
        }

        if (Common.isElement(Render.element)) {
            Render.element.appendChild(Render.canvas);
        }

        return Render;
    };

    /**
     * Continuously updates the Render canvas on the `requestAnimationFrame` event.
     * @method run
     * @param {Render} Render
     */
    Render.run = function(Render) {
        (function loop(time){
            Render.frameRequestId = _requestAnimationFrame(loop);
            
            _updateTiming(Render, time);

            Render.world(Render, time);

            if (Render.options.showStats || Render.options.showDebug) {
                Render.stats(Render, Render.context, time);
            }

            if (Render.options.showPerformance || Render.options.showDebug) {
                Render.performance(Render, Render.context, time);
            }
        })();
    };

    /**
     * Ends execution of `Render.run` on the given `Render`, by canceling the animation frame request event loop.
     * @method stop
     * @param {Render} Render
     */
    Render.stop = function(Render) {
        _cancelAnimationFrame(Render.frameRequestId);
    };

    /**
     * Sets the pixel ratio of the Renderer and updates the canvas.
     * To automatically detect the correct ratio, pass the string `'auto'` for `pixelRatio`.
     * @method setPixelRatio
     * @param {Render} Render
     * @param {number} pixelRatio
     */
    Render.setPixelRatio = function(Render, pixelRatio) {
        var options = Render.options,
            canvas = Render.canvas;

        if (pixelRatio === 'auto') {
            pixelRatio = _getPixelRatio(canvas);
        }

        options.pixelRatio = pixelRatio;
        canvas.setAttribute('data-pixel-ratio', pixelRatio);
        canvas.width = options.width * pixelRatio;
        canvas.height = options.height * pixelRatio;
        canvas.style.width = options.width + 'px';
        canvas.style.height = options.height + 'px';
    };

    /**
     * Positions and sizes the viewport around the given object bounds.
     * Objects must have at least one of the following properties:
     * - `object.bounds`
     * - `object.position`
     * - `object.min` and `object.max`
     * - `object.x` and `object.y`
     * @method lookAt
     * @param {Render} Render
     * @param {object[]} objects
     * @param {vector} [padding]
     * @param {bool} [center=true]
     */
    Render.lookAt = function(Render, objects, padding, center) {
        center = typeof center !== 'undefined' ? center : true;
        objects = Common.isArray(objects) ? objects : [objects];
        padding = padding || {
            x: 0,
            y: 0
        };

        // find bounds of all objects
        var bounds = {
            min: { x: Infinity, y: Infinity },
            max: { x: -Infinity, y: -Infinity }
        };

        for (var i = 0; i < objects.length; i += 1) {
            var object = objects[i],
                min = object.bounds ? object.bounds.min : (object.min || object.position || object),
                max = object.bounds ? object.bounds.max : (object.max || object.position || object);

            if (min && max) {
                if (min.x < bounds.min.x)
                    bounds.min.x = min.x;

                if (max.x > bounds.max.x)
                    bounds.max.x = max.x;

                if (min.y < bounds.min.y)
                    bounds.min.y = min.y;

                if (max.y > bounds.max.y)
                    bounds.max.y = max.y;
            }
        }

        // find ratios
        var width = (bounds.max.x - bounds.min.x) + 2 * padding.x,
            height = (bounds.max.y - bounds.min.y) + 2 * padding.y,
            viewHeight = Render.canvas.height,
            viewWidth = Render.canvas.width,
            outerRatio = viewWidth / viewHeight,
            innerRatio = width / height,
            scaleX = 1,
            scaleY = 1;

        // find scale factor
        if (innerRatio > outerRatio) {
            scaleY = innerRatio / outerRatio;
        } else {
            scaleX = outerRatio / innerRatio;
        }

        // enable bounds
        Render.options.hasBounds = true;

        // position and size
        Render.bounds.min.x = bounds.min.x;
        Render.bounds.max.x = bounds.min.x + width * scaleX;
        Render.bounds.min.y = bounds.min.y;
        Render.bounds.max.y = bounds.min.y + height * scaleY;

        // center
        if (center) {
            Render.bounds.min.x += width * 0.5 - (width * scaleX) * 0.5;
            Render.bounds.max.x += width * 0.5 - (width * scaleX) * 0.5;
            Render.bounds.min.y += height * 0.5 - (height * scaleY) * 0.5;
            Render.bounds.max.y += height * 0.5 - (height * scaleY) * 0.5;
        }

        // padding
        Render.bounds.min.x -= padding.x;
        Render.bounds.max.x -= padding.x;
        Render.bounds.min.y -= padding.y;
        Render.bounds.max.y -= padding.y;

        // update mouse
        if (Render.mouse) {
            Mouse.setScale(Render.mouse, {
                x: (Render.bounds.max.x - Render.bounds.min.x) / Render.canvas.width,
                y: (Render.bounds.max.y - Render.bounds.min.y) / Render.canvas.height
            });

            Mouse.setOffset(Render.mouse, Render.bounds.min);
        }
    };

    /**
     * Applies viewport transforms based on `Render.bounds` to a Render context.
     * @method startViewTransform
     * @param {Render} Render
     */
    Render.startViewTransform = function(Render) {
        var boundsWidth = Render.bounds.max.x - Render.bounds.min.x,
            boundsHeight = Render.bounds.max.y - Render.bounds.min.y,
            boundsScaleX = boundsWidth / Render.options.width,
            boundsScaleY = boundsHeight / Render.options.height;

        Render.context.setTransform(
            Render.options.pixelRatio / boundsScaleX, 0, 0, 
            Render.options.pixelRatio / boundsScaleY, 0, 0
        );
        
        Render.context.translate(-Render.bounds.min.x, -Render.bounds.min.y);
    };

    /**
     * Resets all transforms on the Render context.
     * @method endViewTransform
     * @param {Render} Render
     */
    Render.endViewTransform = function(Render) {
        Render.context.setTransform(Render.options.pixelRatio, 0, 0, Render.options.pixelRatio, 0, 0);
    };

    /**
     * Renders the given `engine`'s `Matter.World` object.
     * This is the entry point for all Rendering and should be called every time the scene changes.
     * @method world
     * @param {Render} Render
     */
    Render.world = function(Render, time) {
        var startTime = Common.now(),
            engine = Render.engine,
            world = engine.world,
            canvas = Render.canvas,
            context = Render.context,
            options = Render.options,
            timing = Render.timing;

        var allBodies = Composite.allBodies(world),
            allConstraints = Composite.allConstraints(world),
            background = options.wireframes ? options.wireframeBackground : options.background,
            bodies = [],
            constraints = [],
            i;

        var event = {
            timestamp: engine.timing.timestamp
        };

        Events.trigger(Render, 'beforeRender', event);

        // apply background if it has changed
        if (Render.currentBackground !== background)
            _applyBackground(Render, background);

        // clear the canvas with a transparent fill, to allow the canvas background to show
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = "transparent";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';

        // handle bounds
        if (options.hasBounds) {
            // filter out bodies that are not in view
            for (i = 0; i < allBodies.length; i++) {
                var body = allBodies[i];
                if (Bounds.overlaps(body.bounds, Render.bounds))
                    bodies.push(body);
            }

            // filter out constraints that are not in view
            for (i = 0; i < allConstraints.length; i++) {
                var constraint = allConstraints[i],
                    bodyA = constraint.bodyA,
                    bodyB = constraint.bodyB,
                    pointAWorld = constraint.pointA,
                    pointBWorld = constraint.pointB;

                if (bodyA) pointAWorld = Vector.add(bodyA.position, constraint.pointA);
                if (bodyB) pointBWorld = Vector.add(bodyB.position, constraint.pointB);

                if (!pointAWorld || !pointBWorld)
                    continue;

                if (Bounds.contains(Render.bounds, pointAWorld) || Bounds.contains(Render.bounds, pointBWorld))
                    constraints.push(constraint);
            }

            // transform the view
            Render.startViewTransform(Render);

            // update mouse
            if (Render.mouse) {
                Mouse.setScale(Render.mouse, {
                    x: (Render.bounds.max.x - Render.bounds.min.x) / Render.options.width,
                    y: (Render.bounds.max.y - Render.bounds.min.y) / Render.options.height
                });

                Mouse.setOffset(Render.mouse, Render.bounds.min);
            }
        } else {
            constraints = allConstraints;
            bodies = allBodies;

            if (Render.options.pixelRatio !== 1) {
                Render.context.setTransform(Render.options.pixelRatio, 0, 0, Render.options.pixelRatio, 0, 0);
            }
        }

        if (!options.wireframes || (engine.enableSleeping && options.showSleeping)) {
            // fully featured Rendering of bodies
            Render.bodies(Render, bodies, context);
        } else {
            if (options.showConvexHulls)
                Render.bodyConvexHulls(Render, bodies, context);

            // optimised method for wireframes only
            Render.bodyWireframes(Render, bodies, context);
        }

        if (options.showBounds)
            Render.bodyBounds(Render, bodies, context);

        if (options.showAxes || options.showAngleIndicator)
            Render.bodyAxes(Render, bodies, context);

        if (options.showPositions)
            Render.bodyPositions(Render, bodies, context);

        if (options.showVelocity)
            Render.bodyVelocity(Render, bodies, context);

        if (options.showIds)
            Render.bodyIds(Render, bodies, context);

        if (options.showSeparations)
            Render.separations(Render, engine.pairs.list, context);

        if (options.showCollisions)
            Render.collisions(Render, engine.pairs.list, context);

        if (options.showVertexNumbers)
            Render.vertexNumbers(Render, bodies, context);

        if (options.showMousePosition)
            Render.mousePosition(Render, Render.mouse, context);

        Render.constraints(constraints, context);

        if (options.hasBounds) {
            // revert view transforms
            Render.endViewTransform(Render);
        }

        Events.trigger(Render, 'afterRender', event);

        // log the time elapsed computing this update
        timing.lastElapsed = Common.now() - startTime;
    };

    /**
     * Renders statistics about the engine and world useful for debugging.
     * @private
     * @method stats
     * @param {Render} Render
     * @param {RenderingContext} context
     * @param {Number} time
     */
    Render.stats = function(Render, context, time) {
        var engine = Render.engine,
            world = engine.world,
            bodies = Composite.allBodies(world),
            parts = 0,
            width = 55,
            height = 44,
            x = 0,
            y = 0;
        
        // count parts
        for (var i = 0; i < bodies.length; i += 1) {
            parts += bodies[i].parts.length;
        }

        // sections
        var sections = {
            'Part': parts,
            'Body': bodies.length,
            'Cons': Composite.allConstraints(world).length,
            'Comp': Composite.allComposites(world).length,
            'Pair': engine.pairs.list.length
        };

        // background
        context.fillStyle = '#0e0f19';
        context.fillRect(x, y, width * 5.5, height);

        context.font = '12px Arial';
        context.textBaseline = 'top';
        context.textAlign = 'right';

        // sections
        for (var key in sections) {
            var section = sections[key];
            // label
            context.fillStyle = '#aaa';
            context.fillText(key, x + width, y + 8);

            // value
            context.fillStyle = '#eee';
            context.fillText(section, x + width, y + 26);

            x += width;
        }
    };

    /**
     * Renders engine and Render performance information.
     * @private
     * @method performance
     * @param {Render} Render
     * @param {RenderingContext} context
     */
    Render.performance = function(Render, context) {
        var engine = Render.engine,
            timing = Render.timing,
            deltaHistory = timing.deltaHistory,
            elapsedHistory = timing.elapsedHistory,
            timestampElapsedHistory = timing.timestampElapsedHistory,
            engineDeltaHistory = timing.engineDeltaHistory,
            engineElapsedHistory = timing.engineElapsedHistory,
            lastEngineDelta = engine.timing.lastDelta;
        
        var deltaMean = _mean(deltaHistory),
            elapsedMean = _mean(elapsedHistory),
            engineDeltaMean = _mean(engineDeltaHistory),
            engineElapsedMean = _mean(engineElapsedHistory),
            timestampElapsedMean = _mean(timestampElapsedHistory),
            rateMean = (timestampElapsedMean / deltaMean) || 0,
            fps = (1000 / deltaMean) || 0;

        var graphHeight = 4,
            gap = 12,
            width = 60,
            height = 34,
            x = 10,
            y = 69;

        // background
        context.fillStyle = '#0e0f19';
        context.fillRect(0, 50, gap * 4 + width * 5 + 22, height);

        // show FPS
        Render.status(
            context, x, y, width, graphHeight, deltaHistory.length, 
            Math.round(fps) + ' fps', 
            fps / Render._goodFps,
            function(i) { return (deltaHistory[i] / deltaMean) - 1; }
        );

        // show engine delta
        Render.status(
            context, x + gap + width, y, width, graphHeight, engineDeltaHistory.length,
            lastEngineDelta.toFixed(2) + ' dt', 
            Render._goodDelta / lastEngineDelta,
            function(i) { return (engineDeltaHistory[i] / engineDeltaMean) - 1; }
        );

        // show engine update time
        Render.status(
            context, x + (gap + width) * 2, y, width, graphHeight, engineElapsedHistory.length,
            engineElapsedMean.toFixed(2) + ' ut', 
            1 - (engineElapsedMean / Render._goodFps),
            function(i) { return (engineElapsedHistory[i] / engineElapsedMean) - 1; }
        );

        // show Render time
        Render.status(
            context, x + (gap + width) * 3, y, width, graphHeight, elapsedHistory.length,
            elapsedMean.toFixed(2) + ' rt', 
            1 - (elapsedMean / Render._goodFps),
            function(i) { return (elapsedHistory[i] / elapsedMean) - 1; }
        );

        // show effective speed
        Render.status(
            context, x + (gap + width) * 4, y, width, graphHeight, timestampElapsedHistory.length, 
            rateMean.toFixed(2) + ' x', 
            rateMean * rateMean * rateMean,
            function(i) { return (((timestampElapsedHistory[i] / deltaHistory[i]) / rateMean) || 0) - 1; }
        );
    };

    /**
     * Renders a label, indicator and a chart.
     * @private
     * @method status
     * @param {RenderingContext} context
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} count
     * @param {string} label
     * @param {string} indicator
     * @param {function} plotY
     */
    Render.status = function(context, x, y, width, height, count, label, indicator, plotY) {
        // background
        context.strokeStyle = '#888';
        context.fillStyle = '#444';
        context.lineWidth = 1;
        context.fillRect(x, y + 7, width, 1);

        // chart
        context.beginPath();
        context.moveTo(x, y + 7 - height * Common.clamp(0.4 * plotY(0), -2, 2));
        for (var i = 0; i < width; i += 1) {
            context.lineTo(x + i, y + 7 - (i < count ? height * Common.clamp(0.4 * plotY(i), -2, 2) : 0));
        }
        context.stroke();

        // indicator
        context.fillStyle = 'hsl(' + Common.clamp(25 + 95 * indicator, 0, 120) + ',100%,60%)';
        context.fillRect(x, y - 7, 4, 4);

        // label
        context.font = '12px Arial';
        context.textBaseline = 'middle';
        context.textAlign = 'right';
        context.fillStyle = '#eee';
        context.fillText(label, x + width, y - 5);
    };

    /**
     * Description
     * @private
     * @method constraints
     * @param {constraint[]} constraints
     * @param {RenderingContext} context
     */
    Render.constraints = function(constraints, context) {
        var c = context;

        for (var i = 0; i < constraints.length; i++) {
            var constraint = constraints[i];

            if (!constraint.Render.visible || !constraint.pointA || !constraint.pointB)
                continue;

            var bodyA = constraint.bodyA,
                bodyB = constraint.bodyB,
                start,
                end;

            if (bodyA) {
                start = Vector.add(bodyA.position, constraint.pointA);
            } else {
                start = constraint.pointA;
            }

            if (constraint.Render.type === 'pin') {
                c.beginPath();
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                c.closePath();
            } else {
                if (bodyB) {
                    end = Vector.add(bodyB.position, constraint.pointB);
                } else {
                    end = constraint.pointB;
                }

                c.beginPath();
                c.moveTo(start.x, start.y);

                if (constraint.Render.type === 'spring') {
                    var delta = Vector.sub(end, start),
                        normal = Vector.perp(Vector.normalise(delta)),
                        coils = Math.ceil(Common.clamp(constraint.length / 5, 12, 20)),
                        offset;

                    for (var j = 1; j < coils; j += 1) {
                        offset = j % 2 === 0 ? 1 : -1;

                        c.lineTo(
                            start.x + delta.x * (j / coils) + normal.x * offset * 4,
                            start.y + delta.y * (j / coils) + normal.y * offset * 4
                        );
                    }
                }

                c.lineTo(end.x, end.y);
            }

            if (constraint.Render.lineWidth) {
                c.lineWidth = constraint.Render.lineWidth;
                c.strokeStyle = constraint.Render.strokeStyle;
                c.stroke();
            }

            if (constraint.Render.anchors) {
                c.fillStyle = constraint.Render.strokeStyle;
                c.beginPath();
                c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                c.arc(end.x, end.y, 3, 0, 2 * Math.PI);
                c.closePath();
                c.fill();
            }
        }
    };

    /**
     * Description
     * @private
     * @method bodies
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodies = function(Render, bodies, context) {
        var c = context,
            engine = Render.engine,
            options = Render.options,
            showInternalEdges = options.showInternalEdges || !options.wireframes,
            body,
            part,
            i,
            k;

        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.Render.visible)
                continue;

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k];

                if (!part.Render.visible)
                    continue;

                if (options.showSleeping && body.isSleeping) {
                    c.globalAlpha = 0.5 * part.Render.opacity;
                } else if (part.Render.opacity !== 1) {
                    c.globalAlpha = part.Render.opacity;
                }

                if (part.Render.sprite && part.Render.sprite.texture && !options.wireframes) {
                    // part sprite
                    var sprite = part.Render.sprite,
                        texture = _getTexture(Render, sprite.texture);

                    c.translate(part.position.x, part.position.y);
                    c.rotate(part.angle);

                    c.drawImage(
                        texture,
                        texture.width * -sprite.xOffset * sprite.xScale,
                        texture.height * -sprite.yOffset * sprite.yScale,
                        texture.width * sprite.xScale,
                        texture.height * sprite.yScale
                    );

                    // revert translation, hopefully faster than save / restore
                    c.rotate(-part.angle);
                    c.translate(-part.position.x, -part.position.y);
                } else {
                    // part polygon
                    if (part.circleRadius) {
                        c.beginPath();
                        c.arc(part.position.x, part.position.y, part.circleRadius, 0, 2 * Math.PI);
                    } else {
                        c.beginPath();
                        c.moveTo(part.vertices[0].x, part.vertices[0].y);

                        for (var j = 1; j < part.vertices.length; j++) {
                            if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                                c.lineTo(part.vertices[j].x, part.vertices[j].y);
                            } else {
                                c.moveTo(part.vertices[j].x, part.vertices[j].y);
                            }

                            if (part.vertices[j].isInternal && !showInternalEdges) {
                                c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                            }
                        }

                        c.lineTo(part.vertices[0].x, part.vertices[0].y);
                        c.closePath();
                    }

                    if (!options.wireframes) {
                        c.fillStyle = part.Render.fillStyle;

                        if (part.Render.lineWidth) {
                            c.lineWidth = part.Render.lineWidth;
                            c.strokeStyle = part.Render.strokeStyle;
                            c.stroke();
                        }

                        c.fill();
                    } else {
                        c.lineWidth = 1;
                        c.strokeStyle = '#bbb';
                        c.stroke();
                    }
                }

                c.globalAlpha=1;
//Here's the custom part
if(part.Render.text)
{
	//30px is default font size
	var fontsize = 30;
	//arial is default font family
	var fontfamily = part.Render.text.family || "Arial"; 
	//white text color by default
	var color = part.Render.text.color || "#FFFFFF";

	if(part.Render.text.size)
		fontsize = part.Render.text.size;
	else if(part.circleRadius)
		fontsize = part.circleRadius/2;

	var content = "";
	if(typeof part.Render.text == "string")
		content = part.Render.text;
	else if(part.Render.text.content)
		content = part.Render.text.content;

	c.textBaseline="middle";
	c.textAlign="center";
	c.fillStyle=color;
	c.font = fontsize+'px '+fontfamily;
	c.fillText(content,part.position.x,part.position.y);
}
            }
        }
    };

    /**
     * Optimised method for drawing body wireframes in one pass
     * @private
     * @method bodyWireframes
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyWireframes = function(Render, bodies, context) {
        var c = context,
            showInternalEdges = Render.options.showInternalEdges,
            body,
            part,
            i,
            j,
            k;

        c.beginPath();

        // Render all bodies
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.Render.visible)
                continue;

            // handle compound parts
            for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                part = body.parts[k];

                c.moveTo(part.vertices[0].x, part.vertices[0].y);

                for (j = 1; j < part.vertices.length; j++) {
                    if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                        c.lineTo(part.vertices[j].x, part.vertices[j].y);
                    } else {
                        c.moveTo(part.vertices[j].x, part.vertices[j].y);
                    }

                    if (part.vertices[j].isInternal && !showInternalEdges) {
                        c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                    }
                }

                c.lineTo(part.vertices[0].x, part.vertices[0].y);
            }
        }

        c.lineWidth = 1;
        c.strokeStyle = '#bbb';
        c.stroke();
    };

    /**
     * Optimised method for drawing body convex hull wireframes in one pass
     * @private
     * @method bodyConvexHulls
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyConvexHulls = function(Render, bodies, context) {
        var c = context,
            body,
            part,
            i,
            j,
            k;

        c.beginPath();

        // Render convex hulls
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.Render.visible || body.parts.length === 1)
                continue;

            c.moveTo(body.vertices[0].x, body.vertices[0].y);

            for (j = 1; j < body.vertices.length; j++) {
                c.lineTo(body.vertices[j].x, body.vertices[j].y);
            }

            c.lineTo(body.vertices[0].x, body.vertices[0].y);
        }

        c.lineWidth = 1;
        c.strokeStyle = 'rgba(255,255,255,0.2)';
        c.stroke();
    };

    /**
     * Renders body vertex numbers.
     * @private
     * @method vertexNumbers
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.vertexNumbers = function(Render, bodies, context) {
        var c = context,
            i,
            j,
            k;

        for (i = 0; i < bodies.length; i++) {
            var parts = bodies[i].parts;
            for (k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
                var part = parts[k];
                for (j = 0; j < part.vertices.length; j++) {
                    c.fillStyle = 'rgba(255,255,255,0.2)';
                    c.fillText(i + '_' + j, part.position.x + (part.vertices[j].x - part.position.x) * 0.8, part.position.y + (part.vertices[j].y - part.position.y) * 0.8);
                }
            }
        }
    };

    /**
     * Renders mouse position.
     * @private
     * @method mousePosition
     * @param {Render} Render
     * @param {mouse} mouse
     * @param {RenderingContext} context
     */
    Render.mousePosition = function(Render, mouse, context) {
        var c = context;
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillText(mouse.position.x + '  ' + mouse.position.y, mouse.position.x + 5, mouse.position.y - 5);
    };

    /**
     * Draws body bounds
     * @private
     * @method bodyBounds
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyBounds = function(Render, bodies, context) {
        var c = context,
            engine = Render.engine,
            options = Render.options;

        c.beginPath();

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (body.Render.visible) {
                var parts = bodies[i].parts;
                for (var j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    var part = parts[j];
                    c.rect(part.bounds.min.x, part.bounds.min.y, part.bounds.max.x - part.bounds.min.x, part.bounds.max.y - part.bounds.min.y);
                }
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,255,255,0.08)';
        } else {
            c.strokeStyle = 'rgba(0,0,0,0.1)';
        }

        c.lineWidth = 1;
        c.stroke();
    };

    /**
     * Draws body angle indicators and axes
     * @private
     * @method bodyAxes
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyAxes = function(Render, bodies, context) {
        var c = context,
            engine = Render.engine,
            options = Render.options,
            part,
            i,
            j,
            k;

        c.beginPath();

        for (i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                parts = body.parts;

            if (!body.Render.visible)
                continue;

            if (options.showAxes) {
                // Render all axes
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                        var axis = part.axes[k];
                        c.moveTo(part.position.x, part.position.y);
                        c.lineTo(part.position.x + axis.x * 20, part.position.y + axis.y * 20);
                    }
                }
            } else {
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                        // Render a single axis indicator
                        c.moveTo(part.position.x, part.position.y);
                        c.lineTo((part.vertices[0].x + part.vertices[part.vertices.length-1].x) / 2,
                            (part.vertices[0].y + part.vertices[part.vertices.length-1].y) / 2);
                    }
                }
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'indianred';
            c.lineWidth = 1;
        } else {
            c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            c.globalCompositeOperation = 'overlay';
            c.lineWidth = 2;
        }

        c.stroke();
        c.globalCompositeOperation = 'source-over';
    };

    /**
     * Draws body positions
     * @private
     * @method bodyPositions
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyPositions = function(Render, bodies, context) {
        var c = context,
            engine = Render.engine,
            options = Render.options,
            body,
            part,
            i,
            k;

        c.beginPath();

        // Render current positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];

            if (!body.Render.visible)
                continue;

            // handle compound parts
            for (k = 0; k < body.parts.length; k++) {
                part = body.parts[k];
                c.arc(part.position.x, part.position.y, 3, 0, 2 * Math.PI, false);
                c.closePath();
            }
        }

        if (options.wireframes) {
            c.fillStyle = 'indianred';
        } else {
            c.fillStyle = 'rgba(0,0,0,0.5)';
        }
        c.fill();

        c.beginPath();

        // Render previous positions
        for (i = 0; i < bodies.length; i++) {
            body = bodies[i];
            if (body.Render.visible) {
                c.arc(body.positionPrev.x, body.positionPrev.y, 2, 0, 2 * Math.PI, false);
                c.closePath();
            }
        }

        c.fillStyle = 'rgba(255,165,0,0.8)';
        c.fill();
    };

    /**
     * Draws body velocity
     * @private
     * @method bodyVelocity
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyVelocity = function(Render, bodies, context) {
        var c = context;

        c.beginPath();

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (!body.Render.visible)
                continue;

            c.moveTo(body.position.x, body.position.y);
            c.lineTo(body.position.x + (body.position.x - body.positionPrev.x) * 2, body.position.y + (body.position.y - body.positionPrev.y) * 2);
        }

        c.lineWidth = 3;
        c.strokeStyle = 'cornflowerblue';
        c.stroke();
    };

    /**
     * Draws body ids
     * @private
     * @method bodyIds
     * @param {Render} Render
     * @param {body[]} bodies
     * @param {RenderingContext} context
     */
    Render.bodyIds = function(Render, bodies, context) {
        var c = context,
            i,
            j;

        for (i = 0; i < bodies.length; i++) {
            if (!bodies[i].Render.visible)
                continue;

            var parts = bodies[i].parts;
            for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                var part = parts[j];
                c.font = "12px Arial";
                c.fillStyle = 'rgba(255,255,255,0.5)';
                c.fillText(part.id, part.position.x + 10, part.position.y - 10);
            }
        }
    };

    /**
     * Description
     * @private
     * @method collisions
     * @param {Render} Render
     * @param {pair[]} pairs
     * @param {RenderingContext} context
     */
    Render.collisions = function(Render, pairs, context) {
        var c = context,
            options = Render.options,
            pair,
            collision,
            corrected,
            bodyA,
            bodyB,
            i,
            j;

        c.beginPath();

        // Render collision positions
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;
            for (j = 0; j < pair.activeContacts.length; j++) {
                var contact = pair.activeContacts[j],
                    vertex = contact.vertex;
                c.rect(vertex.x - 1.5, vertex.y - 1.5, 3.5, 3.5);
            }
        }

        if (options.wireframes) {
            c.fillStyle = 'rgba(255,255,255,0.7)';
        } else {
            c.fillStyle = 'orange';
        }
        c.fill();

        c.beginPath();

        // Render collision normals
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;

            if (pair.activeContacts.length > 0) {
                var normalPosX = pair.activeContacts[0].vertex.x,
                    normalPosY = pair.activeContacts[0].vertex.y;

                if (pair.activeContacts.length === 2) {
                    normalPosX = (pair.activeContacts[0].vertex.x + pair.activeContacts[1].vertex.x) / 2;
                    normalPosY = (pair.activeContacts[0].vertex.y + pair.activeContacts[1].vertex.y) / 2;
                }

                if (collision.bodyB === collision.supports[0].body || collision.bodyA.isStatic === true) {
                    c.moveTo(normalPosX - collision.normal.x * 8, normalPosY - collision.normal.y * 8);
                } else {
                    c.moveTo(normalPosX + collision.normal.x * 8, normalPosY + collision.normal.y * 8);
                }

                c.lineTo(normalPosX, normalPosY);
            }
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,165,0,0.7)';
        } else {
            c.strokeStyle = 'orange';
        }

        c.lineWidth = 1;
        c.stroke();
    };

    /**
     * Description
     * @private
     * @method separations
     * @param {Render} Render
     * @param {pair[]} pairs
     * @param {RenderingContext} context
     */
    Render.separations = function(Render, pairs, context) {
        var c = context,
            options = Render.options,
            pair,
            collision,
            corrected,
            bodyA,
            bodyB,
            i,
            j;

        c.beginPath();

        // Render separations
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            collision = pair.collision;
            bodyA = collision.bodyA;
            bodyB = collision.bodyB;

            var k = 1;

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
            if (bodyB.isStatic) k = 0;

            c.moveTo(bodyB.position.x, bodyB.position.y);
            c.lineTo(bodyB.position.x - collision.penetration.x * k, bodyB.position.y - collision.penetration.y * k);

            k = 1;

            if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
            if (bodyA.isStatic) k = 0;

            c.moveTo(bodyA.position.x, bodyA.position.y);
            c.lineTo(bodyA.position.x + collision.penetration.x * k, bodyA.position.y + collision.penetration.y * k);
        }

        if (options.wireframes) {
            c.strokeStyle = 'rgba(255,165,0,0.5)';
        } else {
            c.strokeStyle = 'orange';
        }
        c.stroke();
    };

    /**
     * Description
     * @private
     * @method inspector
     * @param {inspector} inspector
     * @param {RenderingContext} context
     */
    Render.inspector = function(inspector, context) {
        var engine = inspector.engine,
            selected = inspector.selected,
            Render = inspector.Render,
            options = Render.options,
            bounds;

        if (options.hasBounds) {
            var boundsWidth = Render.bounds.max.x - Render.bounds.min.x,
                boundsHeight = Render.bounds.max.y - Render.bounds.min.y,
                boundsScaleX = boundsWidth / Render.options.width,
                boundsScaleY = boundsHeight / Render.options.height;

            context.scale(1 / boundsScaleX, 1 / boundsScaleY);
            context.translate(-Render.bounds.min.x, -Render.bounds.min.y);
        }

        for (var i = 0; i < selected.length; i++) {
            var item = selected[i].data;

            context.translate(0.5, 0.5);
            context.lineWidth = 1;
            context.strokeStyle = 'rgba(255,165,0,0.9)';
            context.setLineDash([1,2]);

            switch (item.type) {

            case 'body':

                // Render body selections
                bounds = item.bounds;
                context.beginPath();
                context.rect(Math.floor(bounds.min.x - 3), Math.floor(bounds.min.y - 3),
                    Math.floor(bounds.max.x - bounds.min.x + 6), Math.floor(bounds.max.y - bounds.min.y + 6));
                context.closePath();
                context.stroke();

                break;

            case 'constraint':

                // Render constraint selections
                var point = item.pointA;
                if (item.bodyA)
                    point = item.pointB;
                context.beginPath();
                context.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                context.closePath();
                context.stroke();

                break;

            }

            context.setLineDash([]);
            context.translate(-0.5, -0.5);
        }

        // Render selection region
        if (inspector.selectStart !== null) {
            context.translate(0.5, 0.5);
            context.lineWidth = 1;
            context.strokeStyle = 'rgba(255,165,0,0.6)';
            context.fillStyle = 'rgba(255,165,0,0.1)';
            bounds = inspector.selectBounds;
            context.beginPath();
            context.rect(Math.floor(bounds.min.x), Math.floor(bounds.min.y),
                Math.floor(bounds.max.x - bounds.min.x), Math.floor(bounds.max.y - bounds.min.y));
            context.closePath();
            context.stroke();
            context.fill();
            context.translate(-0.5, -0.5);
        }

        if (options.hasBounds)
            context.setTransform(1, 0, 0, 1, 0, 0);
    };

    /**
     * Updates Render timing.
     * @method _updateTiming
     * @private
     * @param {Render} Render
     * @param {number} time
     */
    var _updateTiming = function(Render, time) {
        var engine = Render.engine,
            timing = Render.timing,
            historySize = timing.historySize,
            timestamp = engine.timing.timestamp;

        timing.delta = time - timing.lastTime || Render._goodDelta;
        timing.lastTime = time;

        timing.timestampElapsed = timestamp - timing.lastTimestamp || 0;
        timing.lastTimestamp = timestamp;

        timing.deltaHistory.unshift(timing.delta);
        timing.deltaHistory.length = Math.min(timing.deltaHistory.length, historySize);

        timing.engineDeltaHistory.unshift(engine.timing.lastDelta);
        timing.engineDeltaHistory.length = Math.min(timing.engineDeltaHistory.length, historySize);

        timing.timestampElapsedHistory.unshift(timing.timestampElapsed);
        timing.timestampElapsedHistory.length = Math.min(timing.timestampElapsedHistory.length, historySize);

        timing.engineElapsedHistory.unshift(engine.timing.lastElapsed);
        timing.engineElapsedHistory.length = Math.min(timing.engineElapsedHistory.length, historySize);

        timing.elapsedHistory.unshift(timing.lastElapsed);
        timing.elapsedHistory.length = Math.min(timing.elapsedHistory.length, historySize);
    };

    /**
     * Returns the mean value of the given numbers.
     * @method _mean
     * @private
     * @param {Number[]} values
     * @return {Number} the mean of given values
     */
    var _mean = function(values) {
        var result = 0;
        for (var i = 0; i < values.length; i += 1) {
            result += values[i];
        }
        return (result / values.length) || 0;
    };

    /**
     * @method _createCanvas
     * @private
     * @param {} width
     * @param {} height
     * @return canvas
     */
    var _createCanvas = function(width, height) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.oncontextmenu = function() { return false; };
        canvas.onselectstart = function() { return false; };
        return canvas;
    };

    /**
     * Gets the pixel ratio of the canvas.
     * @method _getPixelRatio
     * @private
     * @param {HTMLElement} canvas
     * @return {Number} pixel ratio
     */
    var _getPixelRatio = function(canvas) {
        var context = canvas.getContext('2d'),
            devicePixelRatio = window.devicePixelRatio || 1,
            backingStorePixelRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio
                                      || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio
                                      || context.backingStorePixelRatio || 1;

        return devicePixelRatio / backingStorePixelRatio;
    };

    /**
     * Gets the requested texture (an Image) via its path
     * @method _getTexture
     * @private
     * @param {Render} Render
     * @param {string} imagePath
     * @return {Image} texture
     */
    var _getTexture = function(Render, imagePath) {
        var image = Render.textures[imagePath];

        if (image)
            return image;

        image = Render.textures[imagePath] = new Image();
        image.src = imagePath;

        return image;
    };

    /**
     * Applies the background to the canvas using CSS.
     * @method applyBackground
     * @private
     * @param {Render} Render
     * @param {string} background
     */
    var _applyBackground = function(Render, background) {
        var cssBackground = background;

        if (/(jpg|gif|png)$/.test(background))
            cssBackground = 'url(' + background + ')';

        Render.canvas.style.background = cssBackground;
        Render.canvas.style.backgroundSize = "contain";
        Render.currentBackground = background;
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired before Rendering
    *
    * @event beforeRender
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired after Rendering
    *
    * @event afterRender
    * @param {} event An event object
    * @param {number} event.timestamp The engine.timing.timestamp of the event
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * A back-reference to the `Matter.Render` module.
     *
     * @deprecated
     * @property controller
     * @type Render
     */

    /**
     * A reference to the `Matter.Engine` instance to be used.
     *
     * @property engine
     * @type engine
     */

    /**
     * A reference to the element where the canvas is to be inserted (if `Render.canvas` has not been specified)
     *
     * @property element
     * @type HTMLElement
     * @default null
     */

    /**
     * The canvas element to Render to. If not specified, one will be created if `Render.element` has been specified.
     *
     * @property canvas
     * @type HTMLCanvasElement
     * @default null
     */

    /**
     * A `Bounds` object that specifies the drawing view region.
     * Rendering will be automatically transformed and scaled to fit within the canvas size (`Render.options.width` and `Render.options.height`).
     * This allows for creating views that can pan or zoom around the scene.
     * You must also set `Render.options.hasBounds` to `true` to enable bounded Rendering.
     *
     * @property bounds
     * @type bounds
     */

    /**
     * The 2d Rendering context from the `Render.canvas` element.
     *
     * @property context
     * @type CanvasRenderingContext2D
     */

    /**
     * The sprite texture cache.
     *
     * @property textures
     * @type {}
     */

    /**
     * The mouse to Render if `Render.options.showMousePosition` is enabled.
     *
     * @property mouse
     * @type mouse
     * @default null
     */

    /**
     * The configuration options of the Renderer.
     *
     * @property options
     * @type {}
     */

    /**
     * The target width in pixels of the `Render.canvas` to be created.
     * See also the `options.pixelRatio` property to change Render quality.
     *
     * @property options.width
     * @type number
     * @default 800
     */

    /**
     * The target height in pixels of the `Render.canvas` to be created.
     * See also the `options.pixelRatio` property to change Render quality.
     *
     * @property options.height
     * @type number
     * @default 600
     */

    /**
     * The [pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) to use when Rendering.
     *
     * @property options.pixelRatio
     * @type number
     * @default 1
     */

    /**
     * A CSS background color string to use when `Render.options.wireframes` is disabled.
     * This may be also set to `'transparent'` or equivalent.
     *
     * @property options.background
     * @type string
     * @default '#14151f'
     */

    /**
     * A CSS background color string to use when `Render.options.wireframes` is enabled.
     * This may be also set to `'transparent'` or equivalent.
     *
     * @property options.wireframeBackground
     * @type string
     * @default '#14151f'
     */

    /**
     * A flag that specifies if `Render.bounds` should be used when Rendering.
     *
     * @property options.hasBounds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable all debug information overlays together.  
     * This includes and has priority over the values of:
     *
     * - `Render.options.showStats`
     * - `Render.options.showPerformance`
     *
     * @property options.showDebug
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the engine stats info overlay.  
     * From left to right, the values shown are:
     *
     * - body parts total
     * - body total
     * - constraints total
     * - composites total
     * - collision pairs total
     *
     * @property options.showStats
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable performance charts.  
     * From left to right, the values shown are:
     *
     * - average Render frequency (e.g. 60 fps)
     * - exact engine delta time used for last update (e.g. 16.66ms)
     * - average engine execution duration (e.g. 5.00ms)
     * - average Render execution duration (e.g. 0.40ms)
     * - average effective play speed (e.g. '1.00x' is 'real-time')
     *
     * Each value is recorded over a fixed sample of past frames (60 frames).
     *
     * A chart shown below each value indicates the variance from the average over the sample.
     * The more stable or fixed the value is the flatter the chart will appear.
     *
     * @property options.showPerformance
     * @type boolean
     * @default false
     */
    
    /**
     * A flag to enable or disable Rendering entirely.
     *
     * @property options.enabled
     * @type boolean
     * @default false
     */

    /**
     * A flag to toggle wireframe Rendering otherwise solid fill Rendering is used.
     *
     * @property options.wireframes
     * @type boolean
     * @default true
     */

    /**
     * A flag to enable or disable sleeping bodies indicators.
     *
     * @property options.showSleeping
     * @type boolean
     * @default true
     */

    /**
     * A flag to enable or disable the debug information overlay.
     *
     * @property options.showDebug
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the collision broadphase debug overlay.
     *
     * @deprecated no longer implemented
     * @property options.showBroadphase
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body bounds debug overlay.
     *
     * @property options.showBounds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body velocity debug overlay.
     *
     * @property options.showVelocity
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body collisions debug overlay.
     *
     * @property options.showCollisions
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the collision resolver separations debug overlay.
     *
     * @property options.showSeparations
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body axes debug overlay.
     *
     * @property options.showAxes
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body positions debug overlay.
     *
     * @property options.showPositions
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body angle debug overlay.
     *
     * @property options.showAngleIndicator
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body and part ids debug overlay.
     *
     * @property options.showIds
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body vertex numbers debug overlay.
     *
     * @property options.showVertexNumbers
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body convex hulls debug overlay.
     *
     * @property options.showConvexHulls
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the body internal edges debug overlay.
     *
     * @property options.showInternalEdges
     * @type boolean
     * @default false
     */

    /**
     * A flag to enable or disable the mouse position debug overlay.
     *
     * @property options.showMousePosition
     * @type boolean
     * @default false
     */

})();
