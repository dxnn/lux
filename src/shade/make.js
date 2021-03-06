//////////////////////////////////////////////////////////////////////////////
// make converts objects which can be meaningfully interpreted as
// Exp values to the appropriate Exp values, giving us some poor-man
// static polymorphism

Shade.make = function(value)
{
    if (_.isUndefined(value)) {
        return undefined;
    }
    var t = lux_typeOf(value);
    if (t === 'string') {
        // Did you accidentally say exp1 + exp2 when you meant
        // exp1.add(exp2)?
        throw new Error("strings are not valid shade expressions");
    } else if (t === 'boolean' || t === 'number') {
        if (isNaN(value)) {
            // Did you accidentally say exp1 / exp2 or exp1 - exp2 when you meant
            // exp1.div(exp2) or exp1.sub(exp2)?
            throw new Error("nans are not valid in shade expressions");
        }
        return Shade.constant(value);
    } else if (t === 'array') {
        return Shade.seq(value);
    } else if (t === 'function') {
        /* lifts the passed function to a "shade function".
        
         In other words, this creates a function that replaces every
         passed parameter p by Shade.make(p) This way, we save a lot of
         typing and errors. If a javascript function is expected to
         take shade values and produce shade expressions as a result,
         simply wrap that function around a call to Shade.make()

         FIXME: Document js_evaluate appropriately. This is a cool feature!

         */

        var result = function() {
            var wrapped_arguments = [];
            for (var i=0; i<arguments.length; ++i) {
                wrapped_arguments.push(Shade.make(arguments[i]));
            }
            return Shade.make(value.apply(this, wrapped_arguments));
        };

        var args_type_cache = {};
        var create_parameterized_function = function(shade_function, types) {
            var parameters = _.map(types, function(t) {
                return Shade.parameter(t);
            });
            var expression = shade_function.apply(this, parameters);
            return function() {
                for (var i=0; i<arguments.length; ++i)
                    parameters[i].set(arguments[i]);
                return expression.evaluate();
            };
        };

        result.js_evaluate = function() {
            var args_types = [];
            var args_type_string;
            for (var i=0; i<arguments.length; ++i) {
                args_types.push(Shade.Types.type_of(arguments[i]));
            }
            args_type_string = _.map(args_types, function(t) { return t.repr(); }).join(",");
            if (_.isUndefined(args_type_cache[args_type_string]))
                args_type_cache[args_type_string] = create_parameterized_function(result, args_types);
            return args_type_cache[args_type_string].apply(result, arguments);
        };
        return result;
    }
    t = Shade.Types.type_of(value);
    if (t.is_vec() || t.is_mat()) {
        return Shade.constant(value);
    } else if (value._shade_type === 'attribute_buffer') {
        return Shade.attribute_from_buffer(value);
    } else if (value._shade_type === 'render_buffer') {
        return Shade.sampler2D_from_texture(value.texture);
    } else if (value._shade_type === 'texture') {
        return Shade.sampler2D_from_texture(value);
    } else if (t.equals(Shade.Types.other_t)) { // FIXME struct types 
        return Shade.struct(value);
    }

    return value;
};

