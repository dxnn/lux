(function() {

function zipWith(f, v1, v2)
{
    return _.map(_.zip(v1, v2),
                 function(v) { return f(v[0], v[1]); });
}

function zipWith3(f, v1, v2, v3)
{
    return _.map(_.zip(v1, v2, v3),
                 function(v) { return f(v[0], v[1], v[2]); });
}

//////////////////////////////////////////////////////////////////////////////
// common functions

function builtin_glsl_function(opts)
{
    var name = opts.name;
    var shade_name = opts.shade_name || opts.name;
    var evaluator = opts.evaluator;
    var type_resolving_list = opts.type_resolving_list;
    var element_function = opts.element_function;
    var element_constant_evaluator = opts.element_constant_evaluator;

    for (var i=0; i<type_resolving_list.length; ++i)
        for (var j=0; j<type_resolving_list[i].length; ++j) {
            var t = type_resolving_list[i][j];
            if (_.isUndefined(t))
                throw new Error("undefined type in type_resolver");
        }

    // takes a list of lists of possible argument types, returns a function to 
    // resolve those types.
    function type_resolver_from_list(lst)
    {
        var param_length = lst[0].length - 1;
        return function() {
            if (arguments.length != param_length) {
                throw new Error("expected " + param_length + " arguments, got "
                    + arguments.length + " instead.");
            }
            for (var i=0; i<lst.length; ++i) {
                var this_params = lst[i];
                var matched = true;
                for (var j=0; j<param_length; ++j) {
                    if (!this_params[j].equals(arguments[j].type)) {
                        matched = false;
                        break;
                    }
                }
                if (matched)
                    return this_params[param_length];
            }
            var types = _.map(_.toArray(arguments).slice(0, arguments.length),
                  function(x) { return x.type.repr(); }).join(", ");
            throw new Error("could not find appropriate type match for (" + types + ")");
        };
    }

    return function() {
        var resolver = type_resolver_from_list(type_resolving_list);
        var type, canon_args = [];
        for (i=0; i<arguments.length; ++i) {
            canon_args.push(Shade.make(arguments[i]));
        }
        try {
            type = resolver.apply(this, canon_args);
        } catch (err) {
            throw new Error("type error on " + name + ": " + err);
        }
        var obj = {
            parents: canon_args,
            expression_type: "builtin_function{" + name + "}",
            type: type,
            
            value: function() {
                return [name, "(",
                        this.parents.map(function(t) { 
                            return t.glsl_expression(); 
                        }).join(", "),
                        ")"].join(" ");
            },
            _json_helper: Shade.Debug._json_builder(shade_name)
        };

        if (evaluator) {
            obj.evaluate = Shade.memoize_on_guid_dict(function(cache) {
                return evaluator(this, cache);
            });
        } else {
            throw new Error("Internal error: Builtin '" + name + "' has no evaluator?!");
        }

        obj.constant_value = Shade.memoize_on_field("_constant_value", function() {
            if (!this.is_constant())
                throw new Error("constant_value called on non-constant expression");
            return evaluator(this);
        });

        if (element_function) {
            obj.element = function(i) {
                return element_function(this, i);
            };
            if (element_constant_evaluator) {
                obj.element_is_constant = function(i) {
                    return element_constant_evaluator(this, i);
                };
            } else {
                obj.element_is_constant = function(i) {
                    // if (this.guid === 489) {
                    //     debugger;
                    // }
                    return this.element(i).is_constant();
                };
            }
        }
        return Shade._create_concrete_value_exp(obj);
    };
}

function common_fun_1op(fun_name, evaluator) {
    var result = builtin_glsl_function({
        name: fun_name,
        type_resolving_list: [
            [Shade.Types.float_t, Shade.Types.float_t],
            [Shade.Types.vec2, Shade.Types.vec2],
            [Shade.Types.vec3, Shade.Types.vec3],
            [Shade.Types.vec4, Shade.Types.vec4]
        ], 
        evaluator: evaluator,
        element_function: function(exp, i) {
            return result(exp.parents[0].element(i));
        }
    });
    return result;
}

function common_fun_2op(fun_name, evaluator) {
    var result = builtin_glsl_function({
        name: fun_name, 
        type_resolving_list: [
            [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
            [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.vec2],
            [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.vec3],
            [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.vec4]
        ], 
        evaluator: evaluator, 
        element_function: function(exp, i) {
            return result(exp.parents[0].element(i), exp.parents[1].element(i));
        }
    });
    return result;
}

// angle and trig, some common, some exponential,
var funcs_1op = {
    "radians": function(v) { return v * Math.PI / 180; },
    "degrees": function(v) { return v / Math.PI * 180; }, 
    "sin": Math.sin,
    "cos": Math.cos, 
    "tan": Math.tan, 
    "asin": Math.asin, 
    "acos": Math.acos, 
    "abs": Math.abs,
    "sign": function(v) { if (v < 0) return -1;
                          if (v === 0) return 0;
                          return 1;
                        }, 
    "floor": Math.floor,
    "ceil": Math.ceil,
    "fract": function(v) { return v - Math.floor(v); },
    "exp": Math.exp, 
    "log": Math.log, 
    "exp2": function(v) { return Math.exp(v * Math.log(2)); },
    "log2": function(v) { return Math.log(v) / Math.log(2); },
    "sqrt": Math.sqrt,
    "inversesqrt": function(v) { return 1 / Math.sqrt(v); }
};

_.each(funcs_1op, function (evaluator_1, fun_name) {
    function evaluator(exp, cache) {
        if (exp.type.equals(Shade.Types.float_t))
            return evaluator_1(exp.parents[0].evaluate(cache));
        else {
            var c = exp.parents[0].evaluate(cache);
            return vec.map(c, evaluator_1);
        }
    }
    Shade[fun_name] = common_fun_1op(fun_name, evaluator);
    Shade.Exp[fun_name] = function(fun) {
        return function() {
            return fun(this);
        };
    }(Shade[fun_name]);
});

function atan1_evaluator(exp, cache)
{
    var v1 = exp.parents[0].evaluate(cache);
    if (exp.type.equals(Shade.Types.float_t))
        return Math.atan(v1);
    else {
        return vec.map(v1, Math.atan);
    }
}

function common_fun_2op_evaluator(fun)
{
    return function(exp, cache) {
        var v1 = exp.parents[0].evaluate(cache);
        var v2 = exp.parents[1].evaluate(cache);
        if (exp.type.equals(Shade.Types.float_t))
            return fun(v1, v2);
        else {
            var result = [];
            for (var i=0; i<v1.length; ++i) {
                result.push(fun(v1[i], v2[i]));
            }
            return vec.make(result);
        }
    };
}

function atan()
{
    if (arguments.length == 1) {
        return common_fun_1op("atan", atan1_evaluator)(arguments[0]);
    } else if (arguments.length == 2) {
        var c = common_fun_2op_evaluator(Math.atan2);
        return common_fun_2op("atan", c)(arguments[0], arguments[1]);
    } else {
        throw new Error("atan expects 1 or 2 parameters, got " + arguments.length
                        + " instead.");
    }
}

function broadcast_elements(exp, i) {
    return _.map(exp.parents, function(parent) {
        return parent.type.is_vec() ? parent.element(i) : parent;
    });
}

Shade.atan = atan;
Shade.Exp.atan = function() { return Shade.atan(this); };
Shade.pow = common_fun_2op("pow", common_fun_2op_evaluator(Math.pow));
Shade.Exp.pow = function(other) { return Shade.pow(this, other); };

function mod_min_max_evaluator(op) {
    return function(exp, cache) {
        var values = _.map(exp.parents, function (p) {
            return p.evaluate(cache);
        });
        if (exp.parents[0].type.equals(Shade.Types.float_t))
            return op.apply(op, values);
        else if (exp.parents[0].type.equals(Shade.Types.int_t))
            return op.apply(op, values);
        else if (exp.parents[0].type.equals(exp.parents[1].type)) {
            return vec.make(zipWith(op, values[0], values[1]));
        } else {
            return vec.map(values[0], function(v) {
                return op(v, values[1]);
            });
        }
    };
}

_.each({
    "mod": function(a,b) { return a % b; },
    "min": Math.min,
    "max": Math.max
}, function(op, k) {
    var result = builtin_glsl_function({
        name: k, 
        type_resolving_list: [
            [Shade.Types.float_t,  Shade.Types.float_t, Shade.Types.float_t],
            [Shade.Types.vec2,     Shade.Types.vec2,    Shade.Types.vec2],
            [Shade.Types.vec3,     Shade.Types.vec3,    Shade.Types.vec3],
            [Shade.Types.vec4,     Shade.Types.vec4,    Shade.Types.vec4],
            [Shade.Types.float_t,  Shade.Types.float_t, Shade.Types.float_t],
            [Shade.Types.vec2,     Shade.Types.float_t, Shade.Types.vec2],
            [Shade.Types.vec3,     Shade.Types.float_t, Shade.Types.vec3],
            [Shade.Types.vec4,     Shade.Types.float_t, Shade.Types.vec4]
        ], 
        evaluator: mod_min_max_evaluator(op),
        element_function: function(exp, i) {
            return result.apply(this, broadcast_elements(exp, i));
        }
    });
    Shade[k] = result;
});

function clamp_evaluator(exp, cache)
{
    function clamp(v, mn, mx) {
        return Math.max(mn, Math.min(mx, v));
    }

    var e1 = exp.parents[0];
    var e2 = exp.parents[1];
    var e3 = exp.parents[2];
    var v1 = e1.evaluate(cache);
    var v2 = e2.evaluate(cache);
    var v3 = e3.evaluate(cache);

    if (e1.type.equals(Shade.Types.float_t)) {
        return clamp(v1, v2, v3);
    } else if (e1.type.equals(e2.type)) {
        return vec.make(zipWith3(clamp, v1, v2, v3));
    } else {
        return vec.map(v1, function(v) {
            return clamp(v, v2, v3);
        });
    }
}

var clamp = builtin_glsl_function({
    name: "clamp", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4],
        [Shade.Types.vec2,    Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec4]], 
    evaluator: clamp_evaluator,
    element_function: function (exp, i) {
        return Shade.clamp.apply(this, broadcast_elements(exp, i));
    }
});

Shade.clamp = clamp;

function mix_evaluator(exp, cache)
{
    function mix(left, right, u) {
        return (1-u) * left + u * right;
    }
    var e1 = exp.parents[0];
    var e2 = exp.parents[1];
    var e3 = exp.parents[2];
    var v1 = e1.evaluate(cache);
    var v2 = e2.evaluate(cache);
    var v3 = e3.evaluate(cache);
    if (e1.type.equals(Shade.Types.float_t)) {
        return mix(v1, v2, v3);
    } else if (e2.type.equals(e3.type)) {
        return vec.make(zipWith3(mix, v1, v2, v3));
    } else {
        return vec.make(zipWith(function(v1, v2) {
            return mix(v1, v2, v3);
        }, v1, v2));
    }
}

var mix = builtin_glsl_function({ 
    name: "mix", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.float_t, Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.float_t, Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.float_t, Shade.Types.vec4]],
    evaluator: mix_evaluator,
    element_function: function(exp, i) {
        return Shade.mix.apply(this, broadcast_elements(exp, i));
    }
});
Shade.mix = mix;

var step = builtin_glsl_function({
    name: "step", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4],
        [Shade.Types.float_t, Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.float_t, Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.float_t, Shade.Types.vec4,    Shade.Types.vec4]], 
    evaluator: function(exp, cache) {
        function step(edge, x) {
            if (x < edge) return 0.0; else return 1.0;
        }
        var e1 = exp.parents[0];
        var e2 = exp.parents[1];
        var v1 = e1.evaluate(cache);
        var v2 = e2.evaluate(cache);
        if (e2.type.equals(Shade.Types.float_t)) {
            return step(v1, v2);
        } if (e1.type.equals(e2.type)) {
            return vec.make(zipWith(step, v1, v2));
        } else {
            return vec.map(v2, function(v) { 
                return step(v1, v);
            });
        }
    },
    element_function: function(exp, i) {
        return Shade.step.apply(this, broadcast_elements(exp, i));
    }
});
Shade.step = step;

var smoothstep = builtin_glsl_function({
    name: "smoothstep", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.vec4],
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec2,    Shade.Types.vec2],
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec3,    Shade.Types.vec3],
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.vec4,    Shade.Types.vec4]], 
    evaluator: function(exp, cache) {
        var edge0 = exp.parents[0];
        var edge1 = exp.parents[1];
        var x = exp.parents[2];
        var t = Shade.clamp(x.sub(edge0).div(edge1.sub(edge0)), 0, 1);
        return t.mul(t).mul(Shade.sub(3, t.mul(2))).evaluate(cache);
    }, element_function: function(exp, i) {
        return Shade.smoothstep.apply(this, broadcast_elements(exp, i));
    }
});
Shade.smoothstep = smoothstep;

var norm = builtin_glsl_function({
    name: "length", 
    shade_name: "norm",
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.float_t],
        [Shade.Types.vec3,    Shade.Types.float_t],
        [Shade.Types.vec4,    Shade.Types.float_t]], 
    evaluator: function(exp, cache) {
        var v = exp.parents[0].evaluate(cache);
        if (exp.parents[0].type.equals(Shade.Types.float_t))
            return Math.abs(v);
        else
            return vec.length(v);
    }});
Shade.norm = norm;

var distance = builtin_glsl_function({
    name: "distance", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.float_t],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.float_t],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.float_t]], 
    evaluator: function(exp, cache) {
        return exp.parents[0].sub(exp.parents[1]).norm().evaluate(cache);
    }});
Shade.distance = distance;

var dot = builtin_glsl_function({
    name: "dot", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2,    Shade.Types.vec2,    Shade.Types.float_t],
        [Shade.Types.vec3,    Shade.Types.vec3,    Shade.Types.float_t],
        [Shade.Types.vec4,    Shade.Types.vec4,    Shade.Types.float_t]],
    evaluator: function (exp, cache) {
        var v1 = exp.parents[0].evaluate(cache),
            v2 = exp.parents[1].evaluate(cache);
        if (exp.parents[0].type.equals(Shade.Types.float_t)) {
            return v1 * v2;
        } else {
            return vec.dot(v1, v2);
        }
    }});
Shade.dot = dot;

var cross = builtin_glsl_function({
    name: "cross", 
    type_resolving_list: [[Shade.Types.vec3, Shade.Types.vec3, Shade.Types.vec3]], 
    evaluator: function(exp, cache) {
        return vec3.cross(exp.parents[0].evaluate(cache),
                          exp.parents[1].evaluate(cache));
    }, element_function: function (exp, i) {
        var v1 = exp.parents[0];
        var v2 = exp.parents[1];
        if        (i === 0) { return v1.at(1).mul(v2.at(2)).sub(v1.at(2).mul(v2.at(1)));
        } else if (i === 1) { return v1.at(2).mul(v2.at(0)).sub(v1.at(0).mul(v2.at(2)));
        } else if (i === 2) { return v1.at(0).mul(v2.at(1)).sub(v1.at(1).mul(v2.at(0)));
        } else
            throw new Error("invalid element " + i + " for cross");
    }
});
Shade.cross = cross;

var normalize = builtin_glsl_function({
    name: "normalize", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2, Shade.Types.vec2],
        [Shade.Types.vec3, Shade.Types.vec3],
        [Shade.Types.vec4, Shade.Types.vec4]], 
    evaluator: function(exp, cache) {
        return exp.parents[0].div(exp.parents[0].norm()).evaluate(cache);
    }, element_function: function(exp, i) {
        return exp.parents[0].div(exp.parents[0].norm()).element(i);
    }
});
Shade.normalize = normalize;

var faceforward = builtin_glsl_function({
    name: "faceforward", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.vec2, Shade.Types.vec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.vec3, Shade.Types.vec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.vec4, Shade.Types.vec4]], 
    evaluator: function(exp, cache) {
        var N = exp.parents[0];
        var I = exp.parents[1];
        var Nref = exp.parents[2];
        if (Nref.dot(I).evaluate(cache) < 0)
            return N.evaluate(cache);
        else
            return Shade.sub(0, N).evaluate(cache);
    }, element_function: function(exp, i) {
        var N = exp.parents[0];
        var I = exp.parents[1];
        var Nref = exp.parents[2];
        return Shade.ifelse(Nref.dot(I).lt(0),
                            N, Shade.neg(N)).element(i);
    }
});
Shade.faceforward = faceforward;

var reflect = builtin_glsl_function({
    name: "reflect", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.vec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.vec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.vec4]], 
    evaluator: function(exp, cache) {
        var I = exp.parents[0];
        var N = exp.parents[1];
        return I.sub(Shade.mul(2, N.dot(I), N)).evaluate(cache);
    }, element_function: function(exp, i) {
        var I = exp.parents[0];
        var N = exp.parents[1];
        return I.sub(Shade.mul(2, N.dot(I), N)).element(i);
    }
});
Shade.reflect = reflect;

var refract = builtin_glsl_function({
    name: "refract", 
    type_resolving_list: [
        [Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t, Shade.Types.float_t],
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.float_t, Shade.Types.vec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.float_t, Shade.Types.vec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.float_t, Shade.Types.vec4]],
    evaluator: function(exp, cache) {
        var I = exp.parents[0];
        var N = exp.parents[1];
        var eta = exp.parents[2];
        
        var k = Shade.sub(1.0, Shade.mul(eta, eta, Shade.sub(1.0, N.dot(I).mul(N.dot(I)))));
        // FIXME This is cute but inefficient
        if (k.evaluate(cache) < 0.0) {
            return vec[I.type.array_size()].create();
        } else {
            return eta.mul(I).sub(eta.mul(N.dot(I)).add(k.sqrt()).mul(N)).evaluate(cache);
        }
    }, element_function: function(exp, i) {
        var I = exp.parents[0];
        var N = exp.parents[1];
        var eta = exp.parents[2];
        var k = Shade.sub(1.0, Shade.mul(eta, eta, Shade.sub(1.0, N.dot(I).mul(N.dot(I)))));
        var refraction = eta.mul(I).sub(eta.mul(N.dot(I)).add(k.sqrt()).mul(N));
        var zero;
        switch (I.type.array_size()) {
        case 2: zero = Shade.vec(0,0); break;
        case 3: zero = Shade.vec(0,0,0); break;
        case 4: zero = Shade.vec(0,0,0,0); break;
        default: throw new Error("internal error");
        };
        return Shade.ifelse(k.lt(0), zero, refraction).element(i);
    }
});
Shade.refract = refract;

var texture2D = builtin_glsl_function({
    name: "texture2D", 
    type_resolving_list: [[Shade.Types.sampler2D, Shade.Types.vec2, Shade.Types.vec4]],
    element_function: function(exp, i) { return exp.at(i); },

    // This line below is necessary to prevent an infinite loop
    // because we're expressing element_function as exp.at();
    element_constant_evaluator: function(exp, i) { return false; },

    evaluator: function(exp) {
        throw new Error("evaluate unsupported on texture2D expressions");
    }
});
Shade.texture2D = texture2D;

_.each(["dFdx", "dFdy", "fwidth"], function(cmd) {
    var fun = builtin_glsl_function({
        name: cmd,
        type_resolving_list: [
            [Shade.Types.float_t, Shade.Types.float_t],
            [Shade.Types.vec2, Shade.Types.vec2],
            [Shade.Types.vec3, Shade.Types.vec3],
            [Shade.Types.vec4, Shade.Types.vec4]
        ],

        // This line below is necessary to prevent an infinite loop
        // because we're expressing element_function as exp.at();
        element_function: function(exp, i) { return exp.at(i); },

        element_constant_evaluator: function(exp, i) { return false; },

        evaluator: function(exp) {
            throw new Error("evaluate unsupported on " + cmd + " expressions");
        }
    });
    Shade[cmd] = fun;
    Shade.Exp[cmd] = function() {
        return Shade[cmd](this);
    };
});

Shade.equal = builtin_glsl_function({
    name: "equal", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bool_t],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bool_t],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bool_t],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bool_t],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bool_t],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bool_t],
        [Shade.Types.bvec2, Shade.Types.bvec2, Shade.Types.bool_t],
        [Shade.Types.bvec3, Shade.Types.bvec3, Shade.Types.bool_t],
        [Shade.Types.bvec4, Shade.Types.bvec4, Shade.Types.bool_t]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return (_.all(zipWith(function (x, y) { return x === y; }),
                      left, right));
    }});
Shade.Exp.equal = function(other) { return Shade.equal(this, other); };

Shade.notEqual = builtin_glsl_function({
    name: "notEqual", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bool_t],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bool_t],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bool_t],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bool_t],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bool_t],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bool_t],
        [Shade.Types.bvec2, Shade.Types.bvec2, Shade.Types.bool_t],
        [Shade.Types.bvec3, Shade.Types.bvec3, Shade.Types.bool_t],
        [Shade.Types.bvec4, Shade.Types.bvec4, Shade.Types.bool_t]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return !(_.all(zipWith(function (x, y) { return x === y; }),
                       left, right));
    }});
Shade.Exp.notEqual = function(other) { return Shade.notEqual(this, other); };

Shade.lessThan = builtin_glsl_function({
    name: "lessThan", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bvec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bvec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bvec4],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bvec2],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bvec3],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bvec4]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return _.map(left, function(x, i) { return x < right[i]; });
    }, element_function: function(exp, i) {
        return Shade.lt.apply(this, broadcast_elements(exp, i));
    }
});
Shade.Exp.lessThan = function(other) { return Shade.lessThan(this, other); };

Shade.lessThanEqual = builtin_glsl_function({
    name: "lessThanEqual", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bvec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bvec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bvec4],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bvec2],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bvec3],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bvec4]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return _.map(left, function(x, i) { return x <= right[i]; });
    }, element_function: function(exp, i) {
        return Shade.le.apply(this, broadcast_elements(exp, i));
    }
});
Shade.Exp.lessThanEqual = function(other) { 
    return Shade.lessThanEqual(this, other); 
};

Shade.greaterThan = builtin_glsl_function({
    name: "greaterThan", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bvec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bvec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bvec4],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bvec2],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bvec3],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bvec4]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return _.map(left, function(x, i) { return x > right[i]; });
    }, element_function: function(exp, i) {
        return Shade.gt.apply(this, broadcast_elements(exp, i));
    }
});
Shade.Exp.greaterThan = function(other) {
    return Shade.greaterThan(this, other);
};

Shade.greaterThanEqual = builtin_glsl_function({
    name: "greaterThanEqual", 
    type_resolving_list: [
        [Shade.Types.vec2, Shade.Types.vec2, Shade.Types.bvec2],
        [Shade.Types.vec3, Shade.Types.vec3, Shade.Types.bvec3],
        [Shade.Types.vec4, Shade.Types.vec4, Shade.Types.bvec4],
        [Shade.Types.ivec2, Shade.Types.ivec2, Shade.Types.bvec2],
        [Shade.Types.ivec3, Shade.Types.ivec3, Shade.Types.bvec3],
        [Shade.Types.ivec4, Shade.Types.ivec4, Shade.Types.bvec4]], 
    evaluator: function(exp, cache) {
        var left = exp.parents[0].evaluate(cache);
        var right = exp.parents[1].evaluate(cache);
        return _.map(left, function(x, i) { return x >= right[i]; });
    }, element_function: function(exp, i) {
        return Shade.ge.apply(this, broadcast_elements(exp, i));
    }
});
Shade.Exp.greaterThanEqual = function(other) {
    return Shade.greaterThanEqual(this, other);
};

Shade.all = builtin_glsl_function({
    name: "all", 
    type_resolving_list: [
        [Shade.Types.bvec2, Shade.Types.bool_t],
        [Shade.Types.bvec3, Shade.Types.bool_t],
        [Shade.Types.bvec4, Shade.Types.bool_t]], 
    evaluator: function(exp, cache) {
        var v = exp.parents[0].evaluate(cache);
        return _.all(v, function(x) { return x; });
    }});
Shade.Exp.all = function() { return Shade.all(this); };

Shade.any = builtin_glsl_function({
    name: "any", 
    type_resolving_list: [
        [Shade.Types.bvec2, Shade.Types.bool_t],
        [Shade.Types.bvec3, Shade.Types.bool_t],
        [Shade.Types.bvec4, Shade.Types.bool_t]], 
    evaluator: function(exp, cache) {
        var v = exp.parents[0].evaluate(cache);
        return _.any(v, function(x) { return x; });
    }});
Shade.Exp.any = function() { return Shade.any(this); };

Shade.matrixCompMult = builtin_glsl_function({
    name: "matrixCompMult", 
    type_resolving_list: [
        [Shade.Types.mat2, Shade.Types.mat2, Shade.Types.mat2],
        [Shade.Types.mat3, Shade.Types.mat3, Shade.Types.mat3],
        [Shade.Types.mat4, Shade.Types.mat4, Shade.Types.mat4]], 
    evaluator: function(exp, cache) {
        var v1 = exp.parents[0].evaluate(cache);
        var v2 = exp.parents[1].evaluate(cache);
        return mat.map(v1, function(x, i) { return x * v2[i]; });
    }, element_function: function(exp, i) {
        var v1 = exp.parents[0];
        var v2 = exp.parents[1];
        return v1.element(i).mul(v2.element(i));
    }
});
Shade.Exp.matrixCompMult = function(other) {
    return Shade.matrixCompMult(this, other);
};

Shade.Types.int_t.zero   = Shade.constant(0, Shade.Types.int_t);
Shade.Types.float_t.zero = Shade.constant(0);
Shade.Types.vec2.zero    = Shade.constant(vec2.make([0,0]));
Shade.Types.vec3.zero    = Shade.constant(vec3.make([0,0,0]));
Shade.Types.vec4.zero    = Shade.constant(vec4.make([0,0,0,0]));
Shade.Types.mat2.zero    = Shade.constant(mat2.make([0,0,0,0]));
Shade.Types.mat3.zero    = Shade.constant(mat3.make([0,0,0,0,0,0,0,0,0]));
Shade.Types.mat4.zero    = Shade.constant(mat4.make([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

// according to the GLSL ES spec, for highp numbers the limit for ints is 2^16, and for floats, 2^52 ~= 10^18
Shade.Types.int_t.infinity   = Shade.constant(65535, Shade.Types.int_t);
Shade.Types.float_t.infinity = Shade.constant(1e18);
Shade.Types.vec2.infinity    = Shade.constant(vec2.make([1e18,1e18]));
Shade.Types.vec3.infinity    = Shade.constant(vec3.make([1e18,1e18,1e18]));
Shade.Types.vec4.infinity    = Shade.constant(vec4.make([1e18,1e18,1e18,1e18]));
Shade.Types.mat2.infinity    = Shade.constant(mat2.make([1e18,1e18,1e18,1e18]));
Shade.Types.mat3.infinity    = Shade.constant(mat3.make([1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18]));
Shade.Types.mat4.infinity    = Shade.constant(mat4.make([1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18,1e18]));

Shade.Types.int_t.minus_infinity   = Shade.constant(-65535, Shade.Types.int_t);
Shade.Types.float_t.minus_infinity = Shade.constant(-1e18);
Shade.Types.vec2.minus_infinity    = Shade.constant(vec2.make([-1e18,-1e18]));
Shade.Types.vec3.minus_infinity    = Shade.constant(vec3.make([-1e18,-1e18,-1e18]));
Shade.Types.vec4.minus_infinity    = Shade.constant(vec4.make([-1e18,-1e18,-1e18,-1e18]));
Shade.Types.mat2.minus_infinity    = Shade.constant(mat2.make([-1e18,-1e18,-1e18,-1e18]));
Shade.Types.mat3.minus_infinity    = Shade.constant(mat3.make([-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18]));
Shade.Types.mat4.minus_infinity    = Shade.constant(mat4.make([-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18,-1e18]));

})();
