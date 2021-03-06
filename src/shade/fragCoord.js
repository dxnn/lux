Shade.fragCoord = function() {
    return Shade._create_concrete_exp({
        expression_type: "builtin_input{gl_FragCoord}",
        parents: [],
        type: Shade.Types.vec4,
        glsl_expression: function() { return "gl_FragCoord"; },
        evaluate: function() {
            throw new Error("evaluate undefined for fragCoord");
        },
        element: function(i) {
            return this.at(i);
        },
        compile: function(ctx) {
        },
        _json_key: function() { return 'fragCoord'; }
    });
};
