var S = Shade;

var gl;
var stroke_width;
var point_diameter;
var point_alpha;
var data;
var scatterplot_batch;
var alive = false;

//////////////////////////////////////////////////////////////////////////////

function display()
{
    scatterplot_batch.draw();
}

function data_buffers()
{
    var d = Data.flowers();
    var tt = Lux.Data.texture_table(d);
    var point_index = Lux.attribute_buffer({ 
        vertex_array: _.range(tt.n_rows), 
        item_size: 1
    });
    
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
    Lux.set_context(gl);
    data = data_buffers();

    point_diameter = S.parameter("float", 10);
    stroke_width   = S.parameter("float", 2.5);
    point_alpha    = S.parameter("float", 1.0);

    var species_color = Shade.Colors.Brewer.qualitative({
        name: "Set1",
        alpha: point_alpha
    })(data.species);
    // var species_color = S.Utils.choose(
    //     [S.vec(1, 0, 0, point_alpha),
    //      S.vec(0, 1, 0, point_alpha),
    //      S.vec(0, 0, 1, point_alpha)])(data.species);

    // Shade.debug = true;
    scatterplot_batch = Lux.Marks.scatterplot({
        elements: data.n_rows,
        x: data.sepalLength,
        y: data.petalLength,
        x_scale: S.Scale.linear({ domain: [4, 8], range: [0, 1] }),
        y_scale: S.Scale.linear({ domain: [1, 7], range: [0, 1] }),
        fill_color: species_color,
        stroke_width: stroke_width,
        stroke_color: S.mix(species_color, S.color("black", point_alpha), 0.5),
        point_diameter: point_diameter,
        mode: Lux.DrawingMode.over
    });
}

$().ready(function() {
    function change_pointsize() {
        var new_value = $("#pointsize").slider("value") / 10.0;
        point_diameter.set(new_value);
        gl.display();
    };
    function change_alpha() {
        var new_value = $("#pointalpha").slider("value") / 100.0;
        point_alpha.set(new_value);
        gl.display();
    };
    function change_stroke_width() {
        var new_value = $("#strokewidth").slider("value") / 10.0;
        stroke_width.set(new_value);
        gl.display();
    };
    $("#pointsize").slider({
        min: 0, 
        max: 1000, 
        orientation: "horizontal",
        value: 100,
        slide: change_pointsize,
        change: change_pointsize
    });
    $("#pointalpha").slider({
        min: 0, 
        max: 100, 
        orientation: "horizontal",
        value: 100,
        slide: change_alpha,
        change: change_alpha
    });
    $("#strokewidth").slider({
        min: 0, 
        max: 150, 
        orientation: "horizontal",
        value: 25,
        slide: change_stroke_width,
        change: change_stroke_width
    });
    var canvas = document.getElementById("scatterplot");
    gl = Lux.init({
        display: display,
        clearColor: [0, 0, 0, 0.2]
    });
    init_webgl();
    var start = new Date().getTime();
    var f = function () {
        if (alive) {
            window.requestAnimFrame(f, canvas);
        }
        gl.display();
    };
    f();
});
