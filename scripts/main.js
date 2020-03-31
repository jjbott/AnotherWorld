requirejs.config({
    baseUrl: 'scripts',
});

define(function (require, exports, module) {
    var Resources = require('./resources');
    var VirtualMachine = require('./vm');

    resources = new Resources();
    resources.init();

    var vm = new VirtualMachine(resources);
    vm.init();

    vm.initForPart(1);

    var run = document.getElementById("run");

    var interval = setInterval(function () {
        if (run.checked) {
            vm.checkThreadRequests();
            //vm.inp_updatePlayer();
            //processInput();
            if (!vm.hostFrame()) {
                clearInterval(interval);
            }
        }

    }, 20);
});
