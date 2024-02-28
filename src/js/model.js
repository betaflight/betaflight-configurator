import FC from "./fc";
import * as THREE from 'three';

// generate mixer
export const mixerList = [
    { name: 'Tricopter',        pos:  0, model: 'tricopter',  image: 'tri',          motors: 3, servos: true },
    { name: 'Quad +',           pos:  1, model: 'quad_x',     image: 'quad_p',       motors: 4, servos: false },
    { name: 'Quad X',           pos:  2, model: 'quad_x',     image: 'quad_x',       motors: 4, servos: false },
    { name: 'Bicopter',         pos:  3, model: 'custom',     image: 'bicopter',     motors: 2, servos: true },
    { name: 'Gimbal',           pos:  4, model: 'custom',     image: 'custom',       motors: 0, servos: true },
    { name: 'Y6',               pos:  5, model: 'y6',         image: 'y6',           motors: 6, servos: false },
    { name: 'Hex +',            pos:  6, model: 'hex_plus',   image: 'hex_p',        motors: 6, servos: false },
    { name: 'Flying Wing',      pos:  7, model: 'custom',     image: 'flying_wing',  motors: 1, servos: true },
    { name: 'Y4',               pos:  8, model: 'y4',         image: 'y4',           motors: 4, servos: false },
    { name: 'Hex X',            pos:  9, model: 'hex_x',      image: 'hex_x',        motors: 6, servos: false },
    { name: 'Octo X8',          pos: 10, model: 'custom',     image: 'octo_x8',      motors: 8, servos: false },
    { name: 'Octo Flat +',      pos: 11, model: 'custom',     image: 'octo_flat_p',  motors: 8, servos: false },
    { name: 'Octo Flat X',      pos: 12, model: 'custom',     image: 'octo_flat_x',  motors: 8, servos: false },
    { name: 'Airplane',         pos: 13, model: 'custom',     image: 'airplane',     motors: 1, servos: true },
    { name: 'Heli 120',         pos: 14, model: 'custom',     image: 'custom',       motors: 1, servos: true },
    { name: 'Heli 90',          pos: 15, model: 'custom',     image: 'custom',       motors: 0, servos: true },
    { name: 'V-tail Quad',      pos: 16, model: 'quad_vtail', image: 'vtail_quad',   motors: 4, servos: false },
    { name: 'Hex H',            pos: 17, model: 'custom',     image: 'custom',       motors: 6, servos: false },
    { name: 'PPM to SERVO',     pos: 18, model: 'custom',     image: 'custom',       motors: 0, servos: true },
    { name: 'Dualcopter',       pos: 19, model: 'custom',     image: 'custom',       motors: 2, servos: true },
    { name: 'Singlecopter',     pos: 20, model: 'custom',     image: 'custom',       motors: 1, servos: true },
    { name: 'A-tail Quad',      pos: 21, model: 'quad_atail', image: 'atail_quad',   motors: 4, servos: false },
    { name: 'Custom',           pos: 22, model: 'custom',     image: 'custom',       motors: 0, servos: false },
    { name: 'Custom Airplane',  pos: 23, model: 'custom',     image: 'custom',       motors: 2, servos: true },
    { name: 'Custom Tricopter', pos: 24, model: 'custom',     image: 'custom',       motors: 3, servos: true },
    { name: 'Quad X 1234',      pos: 25, model: 'quad_x',     image: 'quad_x_1234',  motors: 4, servos: false },
    { name: 'Octo X8 +',        pos: 26, model: 'custom',     image: 'custom',       motors: 8, servos: false },
];

// 3D model
const Model = function (wrapper, canvas) {
    const useWebGLRenderer = this.canUseWebGLRenderer();

    this.wrapper = wrapper;
    this.canvas = canvas;

    if (useWebGLRenderer) {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas[0], alpha: true, antialias: true });
    } else {
        this.renderer = new THREE.CanvasRenderer({ canvas: this.canvas[0], alpha: true });
    }

    // initialize render size for current canvas size
    this.renderer.setSize(this.wrapper.width(), this.wrapper.height());

    // load the model including materials
    let model_file = useWebGLRenderer ? mixerList[FC.MIXER_CONFIG.mixer - 1].model : 'fallback';

    // Temporary workaround for 'custom' model until akfreak's custom model is merged.
    if (model_file == 'custom') { model_file = 'fallback'; }

    // setup scene
    this.scene = new THREE.Scene();

    // modelWrapper adds an extra axis of rotation to avoid gimbal lock with the euler angles
    this.modelWrapper = new THREE.Object3D();

    // stationary camera
    this.camera = new THREE.PerspectiveCamera(60, this.wrapper.width() / this.wrapper.height(), 1, 10000);

    // move camera away from the model
    this.camera.position.z = 125;

    // some light
    const light = new THREE.AmbientLight(0x404040);
    const light2 = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 1.5);
    light2.position.set(0, 1, 0);

    // add camera, model, light to the foreground scene
    this.scene.add(light);
    this.scene.add(light2);
    this.scene.add(this.camera);
    this.scene.add(this.modelWrapper);

    // Load model file, add to scene and render it
    this.loadJSON(model_file, (function (model) {
        this.model = model;

        this.modelWrapper.add(model);
        this.scene.add(this.modelWrapper);

        this.render();
    }).bind(this));
};

Model.prototype.loadJSON = function (model_file, callback) {
    const loader = new THREE.JSONLoader();

    loader.load(`./resources/models/${model_file}.json`, function (geometry, materials) {

        const model = new THREE.Mesh(geometry, materials);

        model.scale.set(15, 15, 15);

        callback(model);
    });
};

Model.prototype.canUseWebGLRenderer = function () {
    // webgl capability detector
    // it would seem the webgl "enabling" through advanced settings will be ignored in the future
    // and webgl will be supported if gpu supports it by default (canary 40.0.2175.0), keep an eye on this one
    const detector_canvas = document.createElement('canvas');

    return window.WebGLRenderingContext && (detector_canvas.getContext('webgl') || detector_canvas.getContext('experimental-webgl'));
};

Model.prototype.rotateTo = function (x, y, z) {
    if (!this.model) { return; }

    this.model.rotation.x = x;
    this.modelWrapper.rotation.y = y;
    this.model.rotation.z = z;

    this.render();
};

Model.prototype.rotateBy = function (x, y, z) {
    if (!this.model) { return; }

    this.model.rotateX(x);
    this.model.rotateY(y);
    this.model.rotateZ(z);

    this.render();
};

Model.prototype.render = function () {
    if (!this.model) { return; }

    // draw
    this.renderer.render(this.scene, this.camera);
};

// handle canvas resize
Model.prototype.resize = function () {
    this.renderer.setSize(this.wrapper.width(), this.wrapper.height());

    this.camera.aspect = this.wrapper.width() / this.wrapper.height();
    this.camera.updateProjectionMatrix();

    this.render();
};

Model.prototype.dispose = function () {
    if (this.renderer) {
        this.renderer.forceContextLoss();
        this.renderer.dispose();
        this.renderer = null;
    }
};

export default Model;
