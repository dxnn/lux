$().ready(function() {
    var foo = 1;
    function handle_mouse(event) {
        Lux.Picker.draw_pick_scene();
        var r = Lux.Picker.pick(event.luxX, event.luxY);
        $("#pickresult").html(strings[r]);
        var r_id = Shade.id(r);
        if (!vec.equal(r_id, current_pick_id.get())) {
            current_pick_id.set(r_id);
            Lux.Scene.invalidate();
        }
    }

    var pick_id_val = Lux.fresh_pick_id(3);
    var strings = {};
    strings[0] = "Nothing";
    strings[pick_id_val]   = "Wedge 0";
    strings[pick_id_val+1] = "Wedge 1";
    strings[pick_id_val+2] = "Wedge 2";

    var gl = Lux.init({
        clearColor: [0,0,0,0.2],
        clearDepth: 1.0,
        mousedown: handle_mouse,
        mousemove: handle_mouse,
        attributes: {
            alpha: true,
            depth: true,
            preserveDrawingBuffer: true
        }
    });

    var square = Lux.Models.square();
    var vertex = square.vertex.mul(2).sub(1);

    var distance_from_origin = Shade.norm(vertex);
    var angle = Shade.atan(vertex.at(1), vertex.at(0));

    var current_pick_id = Shade.parameter("vec4", Shade.id(0));
    var angle_min = Shade.parameter("float");
    var angle_max = Shade.parameter("float");
    var wedge_id  = Shade.parameter("vec4");
    var wedge_hue = Shade.parameter("float");

    function inside(ang) {
        return ang.ge(angle_min).and(ang.lt(angle_max));
    };
 
    var hit = inside(angle)
        .or(inside(angle.add(Math.PI * 2)))
        .or(inside(angle.sub(Math.PI * 2)));

    function hcl(h, c, l) {
        return Shade.Colors.shadetable.hcl.create(h, c, l).as_shade();
    }

    var camera = Shade.Camera.perspective({
        look_at: [Shade.vec(0, 0, 6), Shade.vec(0, 0, -1), Shade.vec(0, 1, 0)]
    });
    var intensity = current_pick_id.eq(wedge_id).ifelse(75, 50);

    var uniforms = [angle_min, angle_max, wedge_id, wedge_hue];
    var states = [
        [ -1, 1, Shade.id(pick_id_val),   0],
        [  1, 2, Shade.id(pick_id_val+1), 2],
        [  2, 5, Shade.id(pick_id_val+2), 4]
    ];

    var wedge_actor = Lux.actor({
        model: square, 
        appearance: {
            position: camera(vertex),
            color: hcl(wedge_hue, intensity, intensity)
                .discard_if(distance_from_origin.gt(1).or(hit.not())),
            pick_id: wedge_id }});

    var wedge_set_actor = {
        dress: function(scene) {
            var batch = wedge_actor.dress(scene);
            return {
                draw: function() {
                    _.each(states, function(lst) {
                        _.each(lst, function(v, i) { uniforms[i].set(v); });
                        batch.draw();
                    });
                }
            };
        },
        on: function() { return true; }
    };

    Lux.Scene.add(wedge_set_actor);
    // Lux.Picker.draw_pick_scene();
});
