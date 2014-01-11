if (typeof window !== 'undefined') {
    window.exdi = {};
}

(function (global, isBrowser) {
    'use strict';

    function runAsync(fn) {
        if (isBrowser) {
            setTimeout(function () {
                fn();
            });
        } else {
            process.nextTick(fn);
        }
    }

    /**
     * Extract parameter names from any function
     */
    function getFunctionParametersNames(fn) {
        var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m,
            FN_ARG_SPLIT = /\s*,\s*/,
            FN_ARG = /^\s*(_?)(.+?)\1\s*$/,
            STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

        var i = 0,
            fnText,
            argDecl,
            args,
            arg,
            parameters = [];

        if (typeof fn !== 'function') {
            throw new Error('To extract parameters names you must provide a function');
        }

        fnText = fn.toString().replace(STRIP_COMMENTS, '');
        argDecl = fnText.match(FN_ARGS);
        args = argDecl[1].split(FN_ARG_SPLIT);

        if (args.length) {
            for (i = 0; i < args.length; i++) {
                if (args[i]) {
                    parameters.push(args[i]);
                }
            }
        }

        return parameters;
    }


    function Queue(container) {
        if ((this instanceof Queue) === false) {
            return new Queue(container);
        }

        var list = [],
            i = 0,
            exdiDone,
            timeoutListeners    = [],
            timeoutLimit        = 0,
            clock               = false;


        exdiDone = function (fn, params, context) {
            if (list[i] && i < list.length && typeof list[i].fn === 'function') {
                i++;
                list[i-1].params.exdiDone = exdiDone;
                container.execute(list[i-1].fn, list[i-1].params, list[i-1].context || container, true);
            } else {
                if (clock) {
                    clearTimeout(clock);
                }
                if (typeof fn !== 'function') {
                    return;
                }
                if ((params instanceof Object) === false) {
                    params = {};
                }
                if (!context || !(context instanceof Object)) {
                    context = undefined;
                }
                container.execute(fn, params, context || container, true);
            }
        };


        this.add = function (fn, params, context) {
            if (typeof fn !== 'function') {
                throw new Error('You can add only functions to queue');
            }
            if ((params instanceof Object) === false) {
                params = {};
            }
            if (!context || !(context instanceof Object)) {
                context = undefined;
            }
            list.push({
                fn: fn,
                params: params,
                context: context
            });
            return this;
        };

        this.on = function (event, callback) {
            event = String(event).toLowerCase();
            if (event !== 'timeout') {
                throw new Error('Unrecognized event ' + String(event));
            }
            if (typeof callback !== 'function') {
                throw new Error('Callback must be a function');
            }
            if (event === 'timeout') {
                timeoutListeners.push(callback);
            } else {
                throw new Error('Unrecognized event ' + event + '. Available events are: step, timeout and done.');
            }
            return this;
        };


        this.clearQueue = function () {
            list = [];
            return this;
        };


        this.execute = function (fn, params, context) {
            exdiDone(fn, params, context);
            if (timeoutLimit > 0) {
                var c = this;
                clock = setTimeout(function () {
                    exdiDone = function () {
                        return false;
                        list = [];
                        i = 0;
                    }
                    for (i = 0; i < timeoutListeners.length; i++) {
                        container.execute(timeoutListeners[i], {}, container, true);
                    }
                }, timeoutLimit * 1000);
            }
            return this;
        };


        this.run = this.execute;
    }


    function Parallel(container) {
        if ((this instanceof Parallel) === false) {
            return new Parallel(container);
        }

        var tasks               = {},
            isDone              = {},
            taskNr              = 0,
            i                   = 0,
            stepListeners       = [],
            doneListeners       = [],
            timeoutListeners    = [],
            timeoutLimit        = 0,
            clock               = false;

        this.add = function (fn, params, context) {
            if (typeof fn !== 'function') {
                throw new Error('You can add only functions to queue');
            }
            if ((params instanceof Object) === false) {
                params = {};
            }
            if (!context || !(context instanceof Object)) {
                context = undefined;
            }

            taskNr++;

            (function(taskName){
                params.exdiDone = function () {
                    if (isDone[taskName] !== false) {
                        return;
                    }
                    isDone[taskName] = true;
                    var allDone = true,
                        name = '';
                    for (name in isDone) {
                        if (isDone.hasOwnProperty(name)) {
                            if (isDone[name] === false) {
                                allDone = false;
                                break;
                            }
                        }
                    }
                    if (!allDone) {
                        for (i = 0; i < stepListeners.length; i++) {
                            container.execute(stepListeners[i], {}, container, true);
                        }
                    } else {
                        if (clock) {
                            clearTimeout(clock);
                        }
                        for (i = 0; i < doneListeners.length; i++) {
                            container.execute(doneListeners[i], {}, container, true);
                        }
                    }
                };

                tasks[taskName] = {
                    fn: fn,
                    params: params,
                    context: context
                };
                isDone[taskName] = false;
            })('task' + String(taskNr));

            return this;
        };


        this.clearTasks = function () {
            tasks = {};
            taskNr = 0;
            return this;
        };


        this.on = function (event, callback) {
            event = String(event).toLowerCase();
            if (event !== 'step' && event !== 'done' && event !== 'timeout') {
                throw new Error('Unrecognized event ' + String(event));
            }
            if (typeof callback !== 'function') {
                throw new Error('Callback must be a function');
            }
            if (event === 'step') {
                stepListeners.push(callback);
            } else if (event === 'timeout') {
                timeoutListeners.push(callback);
            } else if (event === 'done') {
                doneListeners.push(callback);
            } else {
                throw new Error('Unrecognized event ' + event + '. Available events are: step, timeout and done.');
            }
            return this;
        };


        this.setTimeoutLimit = function (seconds) {
            timeoutLimit = Math.abs(parseInt(seconds, 10));
        };


        this.execute = function () {
            var taskName = '';
            for(taskName in tasks) {
                container.execute(tasks[taskName].fn, tasks[taskName].params, tasks[taskName].context || container, true);
            }
            if (timeoutLimit > 0) {
                var c = this;
                clock = setTimeout(function () {
                    isDone = {};
                    tasks = {};
                    taskNr = 0;
                    for (i = 0; i < timeoutListeners.length; i++) {
                        container.execute(timeoutListeners[i], {}, container, true);
                    }
                }, timeoutLimit * 1000);
            }
            return this;
        };


        this.run = this.execute;
    }


    /**
     * Dependency injection container
     * @param container
     * @returns {Container}
     * @constructor
     */
    function Container(container) {
        if ((this instanceof Container) === false) {
            return new Container(container);
        }

        if (!container) {
            container = {};
        }

        /**
         * set value, remember that first upper case force DI container to create new
         * element if it is a function. So first upper case means that value is a constructor
         * @param name
         * @param value
         * @returns Container
         */
        this.set = function (name, value) {
            name = String(name);
            if (name.length === 0 || name === 'exdi') {
                throw new Error('Invalid name');
            }
            if (/^[A-Z]/.test(name[0].toString()) && typeof value !== 'function') {
                throw new Error('All variables named using first capital letter are constructors and must have first capital letter.');
            }
            container[name] = value;
            return this;
        };

        /**
         * Get container value
         * @param name
         * @param params []|undefined
         * @returns {*}
         */
        this.get = function (name, params, constructorContext) {
            name = String(name);
            if (name.length === 0) {
                throw new Error('Invalid name');
            }
            if (name === 'exdi') {
                return this;
            }
            if (/^[A-Z]/.test(name[0].toString()) && typeof container[name] === 'function') {
                return this.execute(container[name], params, constructorContext);
            }
            if (container[name] === undefined) {
                return params;
            }
            return container[name];
        };

        /**
         * Delete container value
         * @param name
         */
        this.delete = function (name) {
            name = String(name);
            delete container[name];
            return this;
        };

        /**
         * Execute given function using container parameters
         * @param fn
         * @param params
         * @param async - default false - run function async
         * @returns {*}
         */
        this.execute = function (fn, params, context, async) {
            if (!params) {
                params = [];
            }
            if (typeof fn !== 'function') {
                throw new Error('You can only execute a function');
            }

            var fnParametersNames = [],
                applyParameters = [],
                i = 0;

            fnParametersNames = getFunctionParametersNames(fn);
            if (fnParametersNames.length > 0) {
                for (i = 0; i < fnParametersNames.length; i++) {
                    if (params[fnParametersNames[i]]) {
                        applyParameters.push(params[fnParametersNames[i]]);
                        continue;
                    }
                    if (container[fnParametersNames[i]]) {
                        applyParameters.push(this.get(fnParametersNames[i]));
                        continue;
                    }
                    applyParameters.push(undefined);
                }
            }

            context = context instanceof Object ? context : this;

            return async === true ? runAsync(function () { fn.apply(context, applyParameters); }) : fn.apply(context, applyParameters);
        };

        this.run = this.execute;

        this.createQueue = function () {
            return new Queue(this);
        }

        this.createParallel = function () {
            return new Parallel(this);
        }
    }

    var containers = {};

    global.get = function (name) {
        name = String(name);
        if ((containers[name] instanceof Container) === false) {
            containers[name] = new Container();
        }
        return containers[name];
    };

    global.all = function () {
        return containers;
    };

    global.delete = function (name) {
        name = String(name);
        delete containers[name];
        return this;
    };

    global.create = function () {
        return new Container();
    };

    global.createContainer = global.create;

    global.createQueue = function () {
        return global.createContainer().createQueue();
    };

    global.createParallel = function () {
        return global.createContainer().createParallel();
    }

})(typeof window === 'undefined' ? module.exports : window.exdi, typeof window === 'undefined' ? false : true);