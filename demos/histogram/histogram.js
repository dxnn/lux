var S = Shade;

var gl;
var data;
var bars_batch;
var alive = false;
var histo;

//////////////////////////////////////////////////////////////////////////////

function histo_buffer(opts)
{
    opts = _.defaults(opts || {}, {
        bin_count: 64,
        weight: Shade.vec(1,1,1,1)
    });
    if (_.isUndefined(opts.bin)) {
        throw "histo_buffer requires 'bin' field";
    }
    opts.bin = Shade(opts.bin);

    var sz = Math.ceil(Math.sqrt(opts.bin_count));

    var ctx = Lux._globals.ctx;
    var render_buffer = Lux.render_buffer({
        clearColor: [0,0,0,0],
        width: sz,
        height: sz,
        type: ctx.FLOAT // enable render to floating-point texture
    });
    var read_render_buffer = Lux.render_buffer({
        width: sz,
        height: sz
    });

    function bin_to_texcoord(pos) {
        // the call to floor() prevents spillage when pos is fractional
        return Shade.vec(pos.mod(sz), pos.div(sz)).floor().add(0.5).div(sz);
    }
    function bin_to_screen(pos) {
        // the call to floor() prevents spillage when pos is fractional
        var xy = Shade.vec(pos.mod(sz), pos.div(sz)).floor().add(0.5);
        var map = Shade.Scale.linear({ domain: [0, sz], range: [-1, 1] });
        return Shade.vec(map(xy), 0, 1);
    }

    var convert_actor = render_buffer.screen_actor({
        texel_function: function(texel_accessor) {
            return Shade.Bits.encode_float(texel_accessor().r());
        }});
    
    var draw_actor = Lux.actor({
        model: {
            type: "points",
            elements: opts.elements
        }, 
        appearance: {
            mode: Lux.DrawingMode.additive,
            color: opts.weight,
            screen_position: bin_to_screen(opts.bin)
        }});
    render_buffer.scene.add(draw_actor);
    read_render_buffer.scene.add(convert_actor);

    return {
        buffer: render_buffer,
        read_buffer: read_render_buffer,
        bin_count: opts.bin_count,
        bin_address: bin_to_texcoord,
        bin_value: Shade(function(pos) {
            return Shade.texture2D(this.buffer, this.bin_address(pos)).r();
        }),
        compute: function() {
            render_buffer.scene.draw();
        },
        read: function() {
            read_render_buffer.scene.draw();
            /* In a sane world, we would do this:

             var floatb = new Float32Array(sz * sz);
             ctx.readPixels(0, 0, sz, sz, ctx.RGBA, ctx.FLOAT, floatb);
             return floatb;

             or some rough equivalent. In this crazy WebGL world we
             live in, you can render to a floating point texture,
             you can fetch floating point values in texture
             samplers, but you cannot call readPixels on an FBO
             when it is bound to a floating-point texture.
             
             This upgrades GPGPU from mere torture to a
             particularly exquisite form of torture.

             So we're reduced to doing silly things like Shade.Bits.convert_to_float
             and casting to Float32Array, one channel at a time. Le sigh.

            */
            return read_render_buffer.with_bound_buffer(function() {
                var ctx = Lux._globals.ctx;
                var buffer = new ArrayBuffer(4*sz*sz);
                var uint8 = new Uint8Array(buffer);
                ctx.readPixels(0, 0, sz, sz,
                               ctx.RGBA, ctx.UNSIGNED_BYTE, uint8);
                return new Float32Array(buffer);
            });
        }
    };
}

function data_buffers()
{
    var d = Data.flowers();
    var tt = Lux.Data.texture_table(d);

    var point_index = Lux.attribute_buffer({ vertex_array: _.range(tt.n_rows), item_size: 1});
    
    return {
        sepalLength: tt.at(point_index, 0),
        sepalWidth:  tt.at(point_index, 1),
        petalLength: tt.at(point_index, 2),
        petalWidth:  tt.at(point_index, 3),
        species:     tt.at(point_index, 4),
        columns: ['sepalLength', 'sepalWidth', 'petalLength', 'petalWidth', 'species'],
        n_rows: d.data.length,
        n_columns: 5
    };
}

function init_webgl()
{
    var canvas = document.getElementById("scatterplot");
    gl = Lux.init({ attributes: { alpha: true,
                                  depth: true
                                },
                    display: function() {
                        bars_batch.draw();
                    },
                    clearColor: [0, 0, 0, 0.2]
                  });
    Lux.set_context(gl);
    data = data_buffers();
    var bin_count = 24;
    histo = histo_buffer({
        bin_count: bin_count,
        bin: Shade.Scale.linear({domain: [4, 8], range: [0, bin_count]})(data.sepalLength),
        elements: data.n_rows
    });
    histo.compute();

    // FIXME: compute maximum histogram height.
    // This will require texture reductions.. More GPGPU, yay

    var project = Shade(function(x) { return x.mul(2).sub(1); });

    Lux.Scene.add(Lux.Marks.aligned_rects({
        elements: bin_count,
        bottom: _.compose(project, function(i) { return 0; }),
        top:    _.compose(project, function(i) { return histo.bin_value(i).div(30); }),
        left:   _.compose(project, function(i) { return i.div(bin_count); }),
        right:  _.compose(project, function(i) { return i.add(1).div(bin_count); }),
        color:  function(i) {
            return Shade.Colors.shadetable.hcl.create(0, 50, histo.bin_value(i).mul(3)).as_shade();
        }
    }));
}

$().ready(function() {
    init_webgl();
});
