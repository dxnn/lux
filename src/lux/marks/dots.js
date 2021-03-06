Lux.Marks.dots = function(opts)
{
    opts = _.defaults(opts, {
        fill_color: Shade.vec(0,0,0,1),
        stroke_color: Shade.vec(0,0,0,1),
        point_diameter: 5,
        stroke_width: 2,
        mode: Lux.DrawingMode.over_with_depth,
        alpha: true,
        plain: false
    });

    if (!opts.position)
        throw new Error("missing required parameter 'position'");
    if (!opts.elements)
        throw new Error("missing required parameter 'elements'");

    var S = Shade;
    var ctx = Lux._globals.ctx;

    var fill_color     = Shade(opts.fill_color);
    var stroke_color   = Shade(opts.stroke_color);
    var point_diameter = Shade(opts.point_diameter).mul(ctx._lux_globals.devicePixelRatio);
    var stroke_width   = Shade(opts.stroke_width).add(1);
    var use_alpha      = Shade(opts.alpha);
    opts.plain = Shade(opts.plain);
    
    var model_opts = {
        type: "points",
        vertex: opts.position,
        elements: opts.elements
    };

    var model = Lux.model(model_opts);

    var distance_to_center_in_pixels = S.pointCoord().sub(S.vec(0.5, 0.5))
        .norm().mul(point_diameter);
    var point_radius = point_diameter.div(2);
    var distance_to_border = point_radius.sub(distance_to_center_in_pixels);
    var gl_Position = model.vertex;

    var no_alpha = S.mix(fill_color, stroke_color,
                         S.clamp(stroke_width.sub(distance_to_border), 0, 1));
    
    var plain_fill_color = fill_color;
    var alpha_fill_color = 
        S.ifelse(use_alpha,
                    no_alpha.mul(S.vec(1,1,1,S.clamp(distance_to_border, 0, 1))),
                    no_alpha)
        .discard_if(distance_to_center_in_pixels.gt(point_radius));

    var result = Lux.actor({
        model: model, 
        appearance: {
            position: gl_Position,
            point_size: point_diameter,
            color: opts.plain.ifelse(plain_fill_color, alpha_fill_color),
            mode: opts.mode,
            pick_id: opts.pick_id }});

    /* We pass the gl_Position attribute explicitly because some other
     call might want to explicitly use the same position of the dots marks.

     This is the exact use case of dot-and-line graph drawing.
     */
    result.gl_Position = gl_Position;
    return result;
};
