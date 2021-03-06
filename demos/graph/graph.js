var gl;
var height = 480;
var interactor;

function make_graph_model(graph)
{
    var pos = [];
    var indices = {};
    var line_elements = [];
    var names = [];
    _.each(graph.nodes, function(node, i) {
        pos.push.apply(pos, node.position);
        indices[node.name] = i;
        names.push(node.name);
    });
    _.each(graph.edges, function(node, i) {
        line_elements.push(indices[node.source]);
        line_elements.push(indices[node.target]);
    });
    var position = Lux.attribute_buffer({ vertex_array: pos, item_size: 2});
    return {
        position: Shade(position),
        name: names,
        node_elements: position.numItems,
        edge_elements: Lux.element_buffer(line_elements)
    };
}

function graph_actors(model, center, zoom)
{
    return Lux.actor_list([Lux.Marks.dots({
        elements: model.node_elements,
        position: model.position,
        stroke_color: Shade.color("white", 0.9),
        fill_color: Shade.color("slategray", 0.9),
        point_diameter: zoom.mul(2000),
        stroke_width: zoom.mul(200)
    }), Lux.actor({
        model: { type: 'lines',
                 elements: model.edge_elements },
        appearance: {
            position: Shade(model.position, -0.1),
            color: Shade.vec(0, 0, 0, 0.2)
        }
    })]);
}

$().ready(function () {
    var canvas = document.getElementById("webgl");
    var center = Shade.parameter("vec2", vec.make([450, 450]));
    var prev_mouse_pos;
    
    interactor = Lux.UI.center_zoom_interactor({
        width: 720, height: 480, zoom: 1/450, center: vec.make([450, 450]), widest_zoom: 1/450
    });

    gl = Lux.init({
        clearDepth: 1.0,
        clearColor: [0, 0, 0, 0.05],
        interactor: interactor
    });

    jQuery.getJSON("graph_extras/1138_bus.graph",
                   function (data) {
                       var graph = data;
                       var model = make_graph_model(graph);
                       Lux.Scene.add(graph_actors(model, center, interactor.zoom));
                   });
});
