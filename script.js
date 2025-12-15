import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function log(data) {
    // window.ReactNativeWebView.postMessage(data);
}

const testCoordinate = [30.5107, 50.4174]

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const map = new maplibregl.Map({
    container: "map",
    style: "https://drsrvsyvyuem5.cloudfront.net/freya_map_fake_s3.json",
    center: testCoordinate,
    zoom: 20,
    pitch: 60,
    bearing: 0,
    attributionControl: {compact: true},
    renderWorldCopies: false,
    maplibreLogo: true
});

function createBeamMaterial() {
    return new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

const BEAM_HEIGHT = 10;   // meters
const BEAM_BOTTOM = 0.5; // meters
const BEAM_TOP = 4.0;    // meters

function createLightBeam() {
    const geometry = new THREE.BufferGeometry();

    const h = BEAM_HEIGHT;
    const b = BEAM_BOTTOM / 2;
    const t = BEAM_TOP / 2;

    // 8 vertices (bottom + top)
    const vertices = new Float32Array([
        // bottom
        -b, -b, 0,
        b, -b, 0,
        b,  b, 0,
        -b,  b, 0,

        // top
        -t, -t, h,
        t, -t, h,
        t,  t, h,
        -t,  t, h
    ]);

    // indices (6 faces)
    const indices = [
        0,1,5, 0,5,4,
        1,2,6, 1,6,5,
        2,3,7, 2,7,6,
        3,0,4, 3,4,7
    ];

    // vertex alpha (bottom opaque → top transparent)
    const colors = new Float32Array([
        // bottom (opaque)
        1,1,1, 1,
        1,1,1, 1,
        1,1,1, 1,
        1,1,1, 1,

        // top (transparent)
        1,1,1, 0,
        1,1,1, 0,
        1,1,1, 0,
        1,1,1, 0
    ]);

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
}

const modelUrl = "/map-view/resources/waypoint.glb"

const modelOrigin = testCoordinate;
const modelAltitude = 0;
const modelRotate = [Math.PI / 2, Math.PI / 2, 0];

const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
    modelOrigin,
    modelAltitude
);

const meterToMercator = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

const modelTransform = {
    translateX: modelAsMercatorCoordinate.x + 0.7 * meterToMercator,
    translateY: modelAsMercatorCoordinate.y + 0.7 * meterToMercator,
    translateZ: modelAsMercatorCoordinate.z + 0.3 * meterToMercator,
    rotateX: modelRotate[0],
    rotateY: modelRotate[1],
    rotateZ: modelRotate[2],
    /* Since our 3D model is in real world meters, a scale transform needs to be
    * applied since the CustomLayerInterface expects units in MercatorCoordinates.
    */
    scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * 3
};

const customLayer = {
    id: '3d-model',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        const directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.position.set(0, -70, 100).normalize();
        this.scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff);
        directionalLight2.position.set(0, 70, 100).normalize();
        this.scene.add(directionalLight2);

        // const loader = new GLTFLoader();
        // loader.load(
        //     modelUrl,
        //     (gltf) => {
        //         this.scene.add(gltf.scene);
        //     }
        // );

        // ADD BEAM
        const beam = createLightBeam();
        beam.rotation.set(-Math.PI / 2, 0, 0);
        this.scene.add(beam);

        this.map = map;

        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true
        });

        this.renderer.autoClear = false;
    },

    render(gl, args) {
        const rotationX = new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(1, 0, 0),
            modelTransform.rotateX
        );
        const rotationY = new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(0, 1, 0),
            modelTransform.rotateY
        );
        const rotationZ = new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(0, 0, 1),
            modelTransform.rotateZ
        );

        const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const l = new THREE.Matrix4()
            .makeTranslation(
                modelTransform.translateX,
                modelTransform.translateY,
                modelTransform.translateZ
            )
            .scale(
                new THREE.Vector3(
                    modelTransform.scale,
                    -modelTransform.scale,
                    modelTransform.scale
                )
            )
            .multiply(rotationX)
            .multiply(rotationY)
            .multiply(rotationZ);

        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();
    }
};

map.on('load', () => {
    map.addLayer(customLayer);
});

