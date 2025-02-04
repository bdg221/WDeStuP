/*globals define, WebGMEGlobal*/
/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Wed Dec 07 2022 22:54:07 GMT+0000 (Coordinated Universal Time).
 */

define([
    'js/Constants',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames'
], function (
    CONSTANTS,
    GMEConcepts,
    nodePropertyNames
) {

    'use strict';

    function SimPNControl(options) {

        this._logger = options.logger.fork('Control');

        this._client = options.client;

        // Initialize core collections and variables
        this._widget = options.widget;

        this._currentNodeId = null;
        
        this._networkRootLoaded = false;

        this._fireableEvents = null;

        this._initWidgetEventHandlers();

        // we need to fix the context of this function as it will be called from the widget directly
        this.setFireableEvents = this.setFireableEvents.bind(this);

        this._logger.debug('ctor finished');
    }

    SimPNControl.prototype._initWidgetEventHandlers = function () {
        this._widget.onNodeClick = function (id) {
            // Change the current active object
            WebGMEGlobal.State.registerActiveObject(id);
        };
    };

    /* * * * * * * * Visualizer content update callbacks * * * * * * * */
    // One major concept here is with managing the territory. The territory
    // defines the parts of the project that the visualizer is interested in
    // (this allows the browser to then only load those relevant parts).
    SimPNControl.prototype.selectedObjectChanged = function (nodeId) {
       var self = this;

        // Remove current territory patterns
        if (self._currentNodeId) {
            self._client.removeUI(self._territoryId);
            self._networkRootLoaded = false;
        }

        self._currentNodeId = nodeId;

        if (typeof self._currentNodeId === 'string') {
            // Put new node's info into territory rules
            self._selfPatterns = {};
            self._selfPatterns[nodeId] = {children: 1};  // Territory "rule"

            self._territoryId = self._client.addUI(self, function (events) {
                self._eventCallback(events);
            });

            // Update the territory
            self._client.updateTerritory(self._territoryId, self._selfPatterns);
        }
    };


    /* * * * * * * * Node Event Handling * * * * * * * */
    SimPNControl.prototype._eventCallback = function (events) {
        const self = this;

        events.forEach(event => {
            if (event.eid && 
                event.eid === self._currentNodeId ) {
                    if (event.etype == 'load' || event.etype == 'update') {
                        self._networkRootLoaded = true;
                    } else {
                        self.clearPN();
                        return;
                    }
                }

        });

        if (events.length && events[0].etype === 'complete' && self._networkRootLoaded) {
            // complete means we got all requested data and we do not have to wait for additional load cycles
            self._initPN();
        }
    };


    SimPNControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
        if (this._currentNodeId === activeObjectId) {
            // The same node selected as before - do not trigger
        } else {
            this.selectedObjectChanged(activeObjectId);
        }
    };

    /* * * * * * * * Machine manipulation functions * * * * * * * */
    SimPNControl.prototype._initPN = function () {
        const self = this;

        //just for the ease of use, lets create a META dictionary
        const rawMETA = self._client.getAllMetaNodes();
        const META = {};
        rawMETA.forEach(node => {
            META[node.getAttribute('name')] = node.getId(); //we just need the id...
        });
        //now we collect all data we need for network visualization
        //we need our transition (names, position, inPlaces, outPlaces) and places (names, position, inP, outP, capacity)
        const pnNode = self._client.getNode(self._currentNodeId);
        const elementIds = pnNode.getChildrenIds();
        const pn = {transitions:{}, places: {}};
        elementIds.forEach(elementId => {
            const node = self._client.getNode(elementId);
            // the simple way of checking type
            if (node.isTypeOf(META['Transition'])) {
                //right now we only interested in transitions...
                const transition = {name: node.getAttribute('name'), position: node.getRegistry('position'), inPlaces: [], outPlaces: []};

                elementIds.forEach(nextId => {
                    const nextNode = self._client.getNode(nextId);
                    if(nextNode.isTypeOf(META['OutplaceArc']) && nextNode.getPointerId('src') === elementId) {
                        transition.outPlaces.push(nextNode.getPointerId('dst'));
                    }
                    if(nextNode.isTypeOf(META['InplaceArc']) && nextNode.getPointerId('dst') == elementId) {
                        transition.inPlaces.push(nextNode.getPointerId('src'));
                    }
                });
                pn.transitions[elementId] = transition;
            }
            if (node.isTypeOf(META['Place'])){
                //right now we interested in places...
                const place = {name: node.getAttribute('name'), position: node.getRegistry('position'), inT: [], outT: [], capacity: node.getAttribute('capacity')};
                elementIds.forEach(nextId => {
                    const nextNode = self._client.getNode(nextId);
                    if(nextNode.isTypeOf(META['OutplaceArc']) && nextNode.getPointerId('dst') === elementId) {
                        place.outT.push(nextNode.getPointerId('src'));
                    }
                    if(nextNode.isTypeOf(META['InplaceArc']) && nextNode.getPointerId('src') == elementId) {
                        place.inT.push(nextNode.getPointerId('dst'));
                    }
                });
                pn.places[elementId] = place;
            }
        });

        pn.setFireableEvents = this.setFireableEvents;

        self._widget.initPetri(pn);
    };

    SimPNControl.prototype.clearPN = function () {
        const self = this;
        self._networkRootLoaded = false;
        self._widget.destroyPetri();
    };

     SimPNControl.prototype.setFireableEvents = function (events) {
         this._fireableEvents = events;
     };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    SimPNControl.prototype.destroy = function () {
        this._detachClientEventListeners();
        this._removeToolbarItems();
    };

    SimPNControl.prototype._attachClientEventListeners = function () {
        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
    };

    SimPNControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
    };

    SimPNControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
        this._displayToolbarItems();

        if (typeof this._currentNodeId === 'string') {
            WebGMEGlobal.State.registerActiveObject(this._currentNodeId, {suppressVisualizerFromNode: true});
        }
    };

    SimPNControl.prototype.onDeactivate = function () {
        this._detachClientEventListeners();
        this._hideToolbarItems();
    };

    /* * * * * * * * * * Updating the toolbar * * * * * * * * * */
    SimPNControl.prototype._displayToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].show();
            }
        } else {
            this._initializeToolbar();
        }
    };

    SimPNControl.prototype._hideToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].show();
            }
        } else {
            this._initializeToolbar();
        }
    };

    SimPNControl.prototype._hideToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].hide();
            }
        }
    };

    SimPNControl.prototype._removeToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].destroy();
            }
        }
    };

    SimPNControl.prototype._initializeToolbar = function () {
        var self = this,
            toolBar = WebGMEGlobal.Toolbar;

        this._toolbarItems = [];

        this._toolbarItems.push(toolBar.addSeparator());

        this.$checkClassification = toolBar.addButton({
            title: 'Check classifications',
            icon: 'glyphicon glyphicon-th-list',
            clickFn: function (){
                // call the plugin some how
                const context = self._client.getCurrentPluginContext('PetriNetClassifier', self._currentNodeId, []);
                context.pluginConfig = {};
                self._client.runServerPlugin(
                    'PetriNetClassifier',
                    context,
                    function(err, result){
                        console.log('plugin err:', err);
                        console.log('plugin result:', result);
                    }
                );
            }
        });

        this._toolbarItems.push(this.$checkClassification);

       
        this.$btnResetPetri = toolBar.addButton({
            title: 'Reset simulator',
            icon: 'glyphicon glyphicon-repeat',
            clickFn: function (/*data*/) {
                self._widget.resetPetri();
            }
        });
        this._toolbarItems.push(this.$btnResetPetri);

        this._toolbarInitialized = true;
    };

    return SimPNControl;
});
