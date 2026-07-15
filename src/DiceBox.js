import * as THREE from "three"
import * as CANNON from "cannon-es"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

import { DiceNotation } from './DiceNotation.js';
import { DiceFactory } from './DiceFactory.js';
import { DiceColors } from './DiceColors.js';
import { THEMES } from './const/themes.js';
// import CannonDebugger from 'cannon-es-debugger'

import { debounce } from "./helpers"

const defaultConfig = {
	assetPath: "./",
	framerate: (1/60),
	sounds: false,
	volume: 100,
	color_spotlight: 0xefdfd5,
	shadows: true,
	theme_surface:  "green-felt",
	sound_dieMaterial: 'plastic',
	theme_customColorset: null,
	theme_colorset: "white",
	theme_texture: "",
	theme_material: "glass",
	gravity_multiplier: 400,
	light_intensity: 0.7,
	baseScale: 100,
	strength: 1,
	iterationLimit: 1000,
	onRollComplete: () => {},
	onRerollComplete: () => {},
	onAddDiceComplete: () => {},
	onRemoveDiceComplete: () => {},
}

class DiceBox {

	constructor(element_container, options = {}) {
		//private variables
		this.initialized = false
		this.container = document.querySelector(element_container);
		this.dimensions = new THREE.Vector2(this.container.clientWidth, this.container.clientHeight)
		this.adaptive_timestep = false;
		this.last_time = 0;
		this.running = false;
		this.rolling = false;
		this.threadid;
		// reject handle for whichever roll()/rollMulti()/reroll()/add() call is
		// currently in flight, so a superseding call can settle its Promise
		// instead of leaving it hanging forever
		this.activeReject = null;
		// monotonically incremented every time a roll()/rollMulti()/reroll()/
		// add() call takes ownership of this.diceList/this.running. rollDice()/
		// add() capture the value that was current when they started, and
		// re-check it after their chunked `await this.simulateThrow()` resumes -
		// if a newer call has since bumped it, this one has been superseded and
		// must not fall through to the unguarded tail (setting this.running/
		// firing its own stale callback), which would otherwise double-fire
		// onRollComplete and could wipe out a third, still-pending call's
		// activeReject out from under it
		this.rollGeneration = 0;
		// { type: 'raf'|'timeout', id } for whichever setTimeout/rAF
		// animateThrow()/animateAfterThrow() most recently scheduled for their
		// own continuation, or null if nothing is scheduled. Without this, a
		// superseded roll's already-scheduled callback can still fire once -
		// before its own `this.running == threadid` guard stops it from
		// continuing - and step this.world/sync this.diceList against whatever
		// roll has since taken over. cancelPendingAnimation() (called from
		// supersedePendingRoll(), the single choke point every superseding
		// entry point goes through) cancels it.
		this._pendingAnimationHandle = null;
		// bound resize listener, stashed by resizeWorld() so destroy() can remove it
		this._resizeHandler = null;
		// handle for clearDice()'s ~100ms delayed re-render (see clearDice()'s
		// comment) so destroy() can cancel it - without this, a clearDice()
		// called shortly before destroy() left a setTimeout in flight that
		// would fire after destroy() nulled out this.renderer and throw
		this._clearDiceRenderTimeout = null;
		this._destroyed = false;

		this.display = {
			currentWidth: null,
			currentHeight: null,
			containerWidth: null,
			containerHeight: null,
			aspect: null,
			scale: null
		};

		this.cameraHeight = {
			max: null,
			close: null,
			medium: null,
			far: null
		};

		this.scene = new THREE.Scene();
		this.world = new CANNON.World();
		this.dice_body_material = new CANNON.Material();
		this.sounds_table = {};
		this.sounds_dice = {};
		this.lastSoundType = '';
		this.lastSoundStep = 0;
		this.lastSound = 0;
		this.iteration;
		this.renderer;
		this.barrier;
		this.camera;
		this.light;
		this.light_amb;
		this.desk;
		this.box_body = {};
		this.bodies = [];
		this.meshes = [];
		this.diceList = [];
		this.notationVectors = null
		this.dieIndex = 0

		//public variables
		// this.framerate = (1/60);
		// this.sounds = false;
		// this.volume = 100;
		// this.theme_surface = "green-felt"
		// this.sound_dieMaterial = 'plastic'
		this.soundDelay = 10; // time between sound effects in ms
		this.animstate = '';
		// this.tally = true;


		this.selector = {
			animate: true,
			rotate: true,
			intersected: null,
			dice: []
		};

		// this.colors = {
		// 	ambient:  0xf0f5fb,
		// 	spotlight: 0xefdfd5
		// };

		// this.shadows = true

		// merge this with default config and any options coming in
		Object.assign(this, defaultConfig, options)

		this.DiceColors = new DiceColors({assetPath: this.assetPath});
		this.DiceFactory = new DiceFactory({
			baseScale: this.baseScale
		});
		this.DiceFactory.setBumpMapping(true);

		// post config settings
		this.surface = THEMES[this.theme_surface].surface

	}


	enableShadows(){
		this.shadows = true;
		if (this.renderer) this.renderer.shadowMap.enabled = this.shadows;
		if (this.light) this.light.castShadow = this.shadows;
		if (this.desk) this.desk.receiveShadow = this.shadows;
	}
	disableShadows() {
		this.shadows = false;
		if (this.renderer) this.renderer.shadowMap.enabled = this.shadows;
		if (this.light) this.light.castShadow = this.shadows;
		if (this.desk) this.desk.receiveShadow = this.shadows;
	}

	async initialize() {

		// this.cannonDebugger = new CannonDebugger(this.scene,this.world)
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
		this.container.appendChild(this.renderer.domElement);
		this.renderer.shadowMap.enabled = this.shadows;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.setClearColor(0x000000, 0);
		// three@0.143 defaults to LinearEncoding; without sRGB output every
		// hand-picked colorset hex renders darkened/desaturated
		this.renderer.outputEncoding = THREE.sRGBEncoding;

		// give PBR materials (metal/glass/wood) something to reflect; without a
		// scene.environment, MeshStandardMaterial envMapIntensity has nothing to act on
		// and metallic/glossy dice render as flat dark blobs.
		if (!this.scene.environment) {
			const pmrem = new THREE.PMREMGenerator(this.renderer);
			this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			pmrem.dispose();
		}

		this.setDimensions(this.dimensions);

		this.world.gravity.set(0, 0, -9.8 * this.gravity_multiplier);
		this.world.broadphase = new CANNON.SAPBroadphase(this.world);
		this.world.solver.iterations = 14;
		this.world.allowSleep = true;

		// this.scene.add(new THREE.HemisphereLight( 0xffffbb, 0x676771, 1 ));

		this.makeWorldBox()

		this.resizeWorld()

		await this.loadTheme({
			colorset: this.theme_colorset,
			texture: this.theme_texture,
			material: this.theme_material
		})
		.catch(e=>{throw new Error("Unable to load theme")})

		if(this.sounds){
			await this.loadSounds()
			.catch(e=>{throw new Error("Unable to load sounds")})
		}

		// this.DiceFactory.setCubeMap(`./themes/${this.theme_surface}/`,THEMES[this.theme_surface].cubeMap)

		this.initialized = true

		this.renderer.render(this.scene, this.camera);
	}

	makeWorldBox(){
		if(Object.keys(this.box_body).length) {
			this.world.removeBody(this.box_body.desk)
			this.world.removeBody(this.box_body.topWall)
			this.world.removeBody(this.box_body.bottomWall)
			this.world.removeBody(this.box_body.leftWall)
			this.world.removeBody(this.box_body.rightWall)
		}

		const desk_body_material = new CANNON.Material();
		const barrier_body_material = new CANNON.Material();

		this.world.addContactMaterial(new CANNON.ContactMaterial( desk_body_material, this.dice_body_material, {mass:0,friction: 0.6, restitution: 0.5}));
		this.world.addContactMaterial(new CANNON.ContactMaterial( barrier_body_material, this.dice_body_material, {mass:0, friction: 0.6, restitution: 1.0}));
		this.world.addContactMaterial(new CANNON.ContactMaterial( this.dice_body_material, this.dice_body_material, {mass:0,friction: 0.6, restitution: 0.5}));

		this.box_body.desk = new CANNON.Body({allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: desk_body_material})
		this.world.addBody(this.box_body.desk);

		this.box_body.topWall = new CANNON.Body({allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrier_body_material});
		this.box_body.topWall.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
		this.box_body.topWall.position.set(0, this.display.containerHeight * 0.93, 0);
		this.world.addBody(this.box_body.topWall);

		this.box_body.bottomWall = new CANNON.Body({allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrier_body_material});
		this.box_body.bottomWall.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
		this.box_body.bottomWall.position.set(0, -this.display.containerHeight * 0.93, 0);
		this.world.addBody(this.box_body.bottomWall);

		this.box_body.leftWall = new CANNON.Body({allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrier_body_material});
		this.box_body.leftWall.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
		this.box_body.leftWall.position.set(this.display.containerWidth * 0.93, 0, 0);
		this.world.addBody(this.box_body.leftWall);

		this.box_body.rightWall = new CANNON.Body({allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrier_body_material});
		this.box_body.rightWall.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
		this.box_body.rightWall.position.set(-this.display.containerWidth * 0.93, 0, 0);
		this.world.addBody(this.box_body.rightWall);
	}

	async loadTheme(themeConfig){
		let colorData
		if(this.theme_customColorset){
			colorData = await this.DiceColors.makeColorSet(this.theme_customColorset)
		} else {
			colorData = await this.DiceColors.getColorSet(themeConfig)
		}
		this.DiceFactory.applyColorSet(colorData)
		this.colorData = colorData
	}

	async loadSounds(){
		let surfaces = {
			felt: 7,
			wood_table: 7,
			wood_tray: 7,
			metal: 9
		}

		//TODO: add dice hit noises for other materials
		let dieMaterials = {
			coin: 6,
			metal: 12,
			plastic: 15,
			wood: 12
		}

		const hassound_dieMaterial = this.colorData.texture.material.match(/wood|metal/g)

		this.sound_dieMaterial = hassound_dieMaterial ? this.colorData.texture.material : "plastic"

		// AudioContext is created lazily, only once sounds are actually needed
		if(!this.audioCtx){
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			this.audioCtx = new AudioContextClass();
		}

		// load a numbered group of clips (e.g. surface_felt1.mp3..surface_felt7.mp3) in parallel
		const loadGroup = (prefix, numsounds) => Promise.all(
			Array.from({length: numsounds}, (_, i) => this.loadAudio(this.assetPath + prefix + (i + 1) + '.mp3'))
		)

		const groupLoads = []

		if(!this.sounds_table.hasOwnProperty(this.surface)){
			groupLoads.push(
				loadGroup('sounds/surfaces/surface_'+this.surface, surfaces[this.surface])
					.then(clips => { this.sounds_table[this.surface] = clips; })
			)
		}
		// load the coin sounds for all sets
		if(!this.sounds_dice.hasOwnProperty('coin')){
			groupLoads.push(
				loadGroup('sounds/dicehit/dicehit_coin', dieMaterials['coin'])
					.then(clips => { this.sounds_dice['coin'] = clips; })
			)
		}
		if(!this.sounds_dice.hasOwnProperty(this.sound_dieMaterial)){
			groupLoads.push(
				loadGroup('sounds/dicehit/dicehit_'+this.sound_dieMaterial, dieMaterials[this.sound_dieMaterial])
					.then(clips => { this.sounds_dice[this.sound_dieMaterial] = clips; })
			)
		}

		await Promise.all(groupLoads)
	}

	// fetches an audio file and decodes it into an AudioBuffer for playback via
	// AudioBufferSourceNode; resolves to null on failure so a missing/broken clip
	// never blocks loadSounds() or throws during playback
	loadAudio(src){
		return fetch(src)
			.then(response => response.arrayBuffer())
			.then(arrayBuffer => this.audioCtx.decodeAudioData(arrayBuffer))
			.catch(e => {
				console.error("Unable to load audio", e)
				return null
			})
	}

	// AudioContext playback is locked on most browsers until resumed inside a
	// user-gesture call stack (or as close to it as we can get); this is a no-op
	// once the context is already running
	resumeAudioContext(){
		if(this.audioCtx && this.audioCtx.state === 'suspended'){
			this.audioCtx.resume().catch(() => {})
		}
	}

	async updateConfig(options = {}){
		// if(options.scale && this.scale !== options.scale){
		// 	this.DiceFactory.updateConfig({
		// 		scale: options.scale
		// 	})
		// }
		Object.assign(this,options)
		// truthiness checks here (the old `options.theme_customColorset ? ... : null`
		// and the matching `if(options.theme_xxx)` lines below) would silently wipe
		// this.theme_customColorset to null - or skip a real update - on ANY
		// updateConfig() call that doesn't happen to pass a truthy value for that
		// key, e.g. updateConfig({volume: 50}) resetting a previously-set custom
		// colorset back to null even though the caller never mentioned it.
		// Object.assign() above already leaves keys absent from `options` alone,
		// so use `in` to only touch/react to a field when the caller actually
		// passed it - this also correctly treats an explicit
		// `theme_customColorset: null` (falsy but present) as "clear it".
		if ('theme_customColorset' in options) {
			this.theme_customColorset = options.theme_customColorset || null
		}
		if ('theme_colorset' in options){
			this.theme_colorset = options.theme_colorset
		}
		if ('theme_texture' in options){
			this.theme_texture = options.theme_texture
		}
		if ('theme_material' in options){
			this.theme_material = options.theme_material
		}
		if ('theme_colorset' in options || 'theme_texture' in options || 'theme_material' in options || 'theme_customColorset' in options){
			await this.loadTheme({
				colorset: this.theme_colorset,
				texture: this.theme_texture,
				material: this.theme_material
			})
		}

		// updateConfig({sounds: true}) used to just flip the flag with nothing
		// behind it: the next collision would index this.sounds_table[surface]/
		// this.sounds_dice[...] while they were still empty and throw inside the
		// CANNON collide listener (see eventCollide()'s defensive guards below,
		// which are the other half of this fix). loadSounds() is idempotent - it
		// only fetches groups not already present in sounds_table/sounds_dice -
		// so calling it here whenever sounds is (still/now) true is always safe.
		// Fire-and-forget (matching initialize()'s constructor-path handling of
		// load failures): updateConfig() callers shouldn't have to await
		// network-bound audio loads just to flip a boolean.
		if (options.sounds) {
			this.loadSounds().catch(e => console.error("Unable to load sounds", e));
		}
	}

	setDimensions(dimensions) {
		this.display.currentWidth = this.container.clientWidth / 2;
		this.display.currentHeight = this.container.clientHeight / 2;
		if (dimensions) {
			this.display.containerWidth = dimensions.x;
			this.display.containerHeight = dimensions.y;
		} else {
			this.display.containerWidth = this.display.currentWidth;
			this.display.containerHeight = this.display.currentHeight;
		}
		this.display.aspect = Math.min(this.display.currentWidth / this.display.containerWidth, this.display.currentHeight / this.display.containerHeight);
		this.display.scale = Math.sqrt(this.display.containerWidth * this.display.containerWidth + this.display.containerHeight * this.display.containerHeight) / 13;

		this.makeWorldBox()

		this.renderer.setSize(this.display.currentWidth * 2, this.display.currentHeight * 2);

		this.cameraHeight.max = this.display.currentHeight / this.display.aspect / Math.tan(10 * Math.PI / 180);

		this.cameraHeight.medium = this.cameraHeight.max / 1.5;
		this.cameraHeight.far = this.cameraHeight.max;
		this.cameraHeight.close = this.cameraHeight.max / 2;

		if (this.camera) this.scene.remove(this.camera);
		this.camera = new THREE.PerspectiveCamera(20, this.display.currentWidth / this.display.currentHeight, 1, this.cameraHeight.max * 1.3);

		switch (this.animstate) {
			case 'selector':
				this.camera.position.z = this.selector.dice.length > 9 ? this.cameraHeight.far : (this.selector.dice.length < 6 ? this.cameraHeight.close : this.cameraHeight.medium);
				break;
			case 'throw': case 'afterthrow': default: this.camera.position.z = this.cameraHeight.far;

		}

		this.camera.lookAt(new THREE.Vector3(0,0,0));

		const maxwidth = Math.max(this.display.containerWidth, this.display.containerHeight);

		if (this.light) this.scene.remove(this.light);
		if (this.light_amb) this.scene.remove(this.light_amb);
		this.light = new THREE.SpotLight(this.color_spotlight, this.light_intensity);
		this.light.position.set(-maxwidth / 2, maxwidth / 2, maxwidth * 3);
		this.light.target.position.set(0, 0, 0);
		this.light.distance = maxwidth * 5;
		this.light.angle = Math.PI/4;
		this.light.castShadow = this.shadows;
		this.light.shadow.camera.near = maxwidth / 10;
		this.light.shadow.camera.far = maxwidth * 5;
		this.light.shadow.camera.fov = 50;
		this.light.shadow.bias = 0.001;
		this.light.shadow.mapSize.width = 1024;
		this.light.shadow.mapSize.height = 1024;
		this.scene.add(this.light);

		this.light_amb = new THREE.HemisphereLight( 0xffffbb, 0x676771, this.light_intensity );
		this.scene.add(this.light_amb);

		if (this.desk) this.scene.remove(this.desk);
		let shadowplane = new THREE.ShadowMaterial();
		shadowplane.opacity = 0.5;
		this.desk = new THREE.Mesh(new THREE.PlaneGeometry(this.display.containerWidth * 6, this.display.containerHeight * 6, 1, 1), shadowplane);
		this.desk.receiveShadow = this.shadows;
		this.scene.add(this.desk);

		this.renderer.render(this.scene, this.camera);
	}

	resizeWorld(){
		const resize = () => {
			// debounce() schedules its callback via requestAnimationFrame(); if a
			// resize event fires (scheduling that rAF) just before destroy()
			// runs, removeEventListener() only stops FUTURE resize events from
			// scheduling - it can't cancel an rAF already in flight, and that
			// rAF has no other way to know the instance is gone. Without this
			// guard it would run after destroy() nulled this.renderer/this.desk/
			// etc. and throw.
			if (this._destroyed) return;
			const canvas = this.renderer.domElement;
			const width = this.container.clientWidth;
			const height = this.container.clientHeight;
			const needResize = canvas.width !== width || canvas.height !== height;
			if (needResize) {
				this.setDimensions(new THREE.Vector2(this.container.clientWidth, this.container.clientHeight))
			}
			return needResize;
		}
		// stash the bound handler so destroy() can remove exactly this listener
		this._resizeHandler = debounce(resize)
		window.addEventListener("resize", this._resizeHandler)
	}

	vectorRand({x, y}) {
		let angle = Math.random() * Math.PI / 5 - Math.PI / 5 / 2;
		let vec = {
			x: x * Math.cos(angle) - y * Math.sin(angle),
			y: x * Math.sin(angle) + y * Math.cos(angle)
		};
		if (vec.x == 0) vec.x = 0.01;
		if (vec.y == 0) vec.y = 0.01;
		return vec;
	}

	//returns an array of vectordata objects
	getNotationVectors(notation, vector, boost, dist, colorset = null, label = null){

		let notationVectors = new DiceNotation(notation);

		for (let i in notationVectors.set) {

			notationVectors.set[i].colorset = colorset;
			notationVectors.set[i].label = label ?? colorset;

			const diceobj = this.DiceFactory.get(notationVectors.set[i].type);
			let numdice = notationVectors.set[i].num;
			let operator = notationVectors.set[i].op;
			let sid = notationVectors.set[i].sid;
			let gid = notationVectors.set[i].gid;
			let glvl = notationVectors.set[i].glvl;
			let func = notationVectors.set[i].func;
			let args = notationVectors.set[i].args;

			for(let k = 0; k < numdice; k++){

				let vec = this.vectorRand(vector);

				vec.x /= dist;
				vec.y /= dist;

				let pos = {
					x: this.display.containerWidth * (vec.x > 0 ? -1 : 1) * 0.9,
					y: this.display.containerHeight * (vec.y > 0 ? -1 : 1) * 0.9,
					z: Math.random() * 200 + 200
				};

				let projector = Math.abs(vec.x / vec.y);
				if (projector > 1.0) pos.y /= projector; else pos.x *= projector;

				let velvec = this.vectorRand(vector);
				velvec.x /= dist;
				velvec.y /= dist;
				let velocity, angle, axis;

				if (diceobj.shape != "d2") {

					velocity = {
						x: velvec.x * boost,
						y: velvec.y * boost,
						z: -10
					};

					angle = {
						x: -(Math.random() * vec.y * 5 + diceobj.inertia * vec.y),
						y: Math.random() * vec.x * 5 + diceobj.inertia * vec.x,
						z: 0
					};

					axis = {
						x: Math.random(),
						y: Math.random(),
						z: Math.random(),
						a: Math.random()
					};
				} else {
					//coin flip
					velocity = {
						x: velvec.x * boost / 10,
						y: velvec.y * boost / 10,
						z: 3000
					};

					angle = {
						x: 12 * diceobj.inertia,//-(Math.random() * velvec.y * 50 + diceobj.inertia * velvec.y ) ,
						y: 1 * diceobj.inertia,//Math.random() * velvec.x * 50 + diceobj.inertia * velvec.x ,
						z: 0
					};

					axis = {
						x: 1,//Math.random(),
						y: 1,//Math.random(),
						z: Math.random(),
						a: Math.random()
					};
				}

				notationVectors.vectors.push({
					index: this.dieIndex++,
					type: diceobj.type,
					op: operator,
					sid: sid,
					gid: gid,
					glvl: glvl,
					func: func,
					args: args,
					pos: pos,
					velocity: velocity,
					angle: angle,
					axis: axis,
					colorset: colorset,   // NEW
					label: label ?? colorset   // NEW
				});
			}
		}

		return notationVectors;
	}

	// swaps dice faces to match desired result
	swapDiceFace(dicemesh, result){
		const diceobj = this.DiceFactory.get(dicemesh.notation.type);

		// flag this result as forced
		dicemesh.resultReason = 'forced'

		if (diceobj.shape == 'd4') {
			this.swapDiceFace_D4(dicemesh, result);
			return;
		}

		let values = diceobj.values;
		let value = parseInt(dicemesh.getLastValue().value);
		result = parseInt(result);

		if (dicemesh.notation.type == 'd10' && value == 0) value = 10;
		if (dicemesh.notation.type == 'd100' && value == 0) value = 100;
		if (dicemesh.notation.type == 'd100' && (value > 0 && value < 10)) value *= 10;

		if (dicemesh.notation.type == 'd10' && result == 0) result = 10;
		if (dicemesh.notation.type == 'd100' && result == 0) result = 100;
		if (dicemesh.notation.type == 'd100' && (result > 0 && result < 10)) result *= 10;

		let valueindex = diceobj.values.indexOf(value);
		let resultindex = diceobj.values.indexOf(result);

		if (valueindex < 0 || resultindex < 0) return;
		if (valueindex == resultindex) return;

		// find material index for corresponding value -> face and swap them
		// must clone the geom before modifying it
		let geom = dicemesh.geometry.clone();

		// find list of faces that use the matching material index for the given value/result
		let geomindex_value = [];
		let geomindex_result = [];

		// it's magic but not really
		// the mesh's materials start at index 2
		let magic = 2;
		// except on d10 meshes
		if (diceobj.shape == 'd10') magic = 1;

		let material_value, material_result = (resultindex+magic);

		//and D2 meshes have a lot more faces
		if(diceobj.shape != "d2"){
			material_value = (valueindex+magic);
			material_result = (resultindex+magic);
		} else {
			material_value = valueindex+1;
			material_result = resultindex+1;
		}

		//and probably some third rule eventually...

		// let normals = geom.getAttribute('normal').array;
		for (var i = 0, l = geom.groups.length; i < l; ++i) {
			const face = geom.groups[i];
			const matindex = face.materialIndex;

			if (matindex == material_value) {
				geomindex_value.push(i);
				continue;
			}
			if (matindex == material_result) {
				geomindex_result.push(i);
				continue;
			}
		}

		if (geomindex_value.length <= 0 || geomindex_result.length <= 0) return;

		//swap the materials
		for(let i = 0, l = geomindex_result.length; i < l; i++) {
			geom.groups[geomindex_result[i]].materialIndex = material_value;
		}

		for(let i = 0, l = geomindex_value.length; i < l; i++) {
			geom.groups[geomindex_value[i]].materialIndex = material_result;
		}

		dicemesh.geometry = geom;
		dicemesh.result = [];
	}

	swapDiceFace_D4(dicemesh, result) {
		const diceobj = this.DiceFactory.get(dicemesh.notation.type);
		let value = parseInt(dicemesh.getLastValue().value);
		result = parseInt(result);

		if (!(value >= 1 && value <= 4)) return;

		let num = result - value;
		let geom = dicemesh.geometry.clone();

		for (let i = 0, l = geom.groups.length; i < l; ++i) {
			const face = geom.groups[i];
			let matindex = face.materialIndex;
			if (matindex == 0) continue;

			matindex += num - 1;

			while (matindex > 4) matindex -= 4;
			while (matindex < 1) matindex += 4;

			face.materialIndex = matindex + 1;
		}
		if (num != 0) {
			if (num < 0) num += 4;
			// createMaterials(..., allowcache=false, ...) below always builds a
			// brand new Material array with its own uniquely-owned (non-cached)
			// map/bumpMap CanvasTextures; the old array being replaced here must
			// be disposed first or both the old Materials and (if this die was
			// already swapped once before) its uniquely-owned textures leak
			this.disposeMaterials(dicemesh.material);
			dicemesh.material = this.DiceFactory.createMaterials(diceobj, 0, 0, false, num);
		}

		dicemesh.geometry = geom;
		dicemesh.result = [];
	}

	//spawns one dicemesh object from a single vectordata object
	spawnDice(vectordata, reset = false) {
		const {pos, axis, angle, velocity} = vectordata
		let dicemesh

		if(!reset) {
			const colordata = (vectordata.colorset && this.DiceColors.colorsets[vectordata.colorset]) || this.colorData;
			dicemesh = this.DiceFactory.create(vectordata.type, colordata);
			if(!dicemesh) return;
			dicemesh.notation = vectordata;
			dicemesh.result = [];
			dicemesh.stopped = 0;
			dicemesh.castShadow = this.shadows;
			this.scene.add(dicemesh);
			this.diceList.push(dicemesh);
		} else {
			dicemesh = reset
			// dicemesh.result = [];
			dicemesh.stopped = 0;
			this.world.removeBody(dicemesh.body);
		}

		dicemesh.body = new CANNON.Body({allowSleep: true, sleepSpeedLimit: 75, sleepTimeLimit:0.9, mass: dicemesh.mass, shape: dicemesh.geometry.cannon_shape, material: this.dice_body_material});
		dicemesh.body.type = CANNON.Body.DYNAMIC;
		dicemesh.body.position.set(pos.x, pos.y, pos.z);
		dicemesh.body.quaternion.setFromAxisAngle(new CANNON.Vec3(axis.x, axis.y, axis.z), axis.a * Math.PI * 2);
		dicemesh.body.angularVelocity.set(angle.x, angle.y, angle.z);
		dicemesh.body.velocity.set(velocity.x, velocity.y, velocity.z);
		dicemesh.body.linearDamping = 0.1;
		dicemesh.body.angularDamping = 0.1;
		dicemesh.body.diceShape = dicemesh.shape;
		dicemesh.body.sleepState = 0;

		dicemesh.body.addEventListener('collide', this.eventCollide.bind(this));

		this.world.addBody(dicemesh.body);
	}

	eventCollide({body, target}) {

		// collision events happen simultaneously for both colliding bodies
		// all this sanity checking helps limits sounds being played

		// don't play sounds if we're simulating
		if (this.animstate == 'simulate') return;
		if (!this.sounds || !body) return;

		// let volume = parseInt(window.DiceFavorites.settings.volume.value) || 0;
		if (this.volume <= 0) return;

		let now = Date.now();
		let currentSoundType = (body.mass > 0) ? 'dice' : 'table';

		// the idea here is that a dice clack should never be skipped in favor of a table sound
		// if ((don't play sounds if we played one this world step, or there hasn't been enough delay) AND 'this sound IS NOT a dice clack') then 'skip it'
		if ((this.lastSoundStep == body.world.stepnumber || this.lastSound > now) && currentSoundType != 'dice') return;

		// also skip if it's too early and both last sound and this sound are the same
		if ((this.lastSoundStep == body.world.stepnumber || this.lastSound > now) && currentSoundType == 'dice' && this.lastSoundType == 'dice') return;

		if (body.mass > 0) { // dice to dice collision

			let speed = body.velocity.length();
			// also don't bother playing at low speeds
			if (speed < 250) return;

			// defensive: the needed sound group can legitimately be missing/empty
			// here - e.g. updateConfig({sounds: true}) has kicked off loadSounds()
			// but it hasn't resolved yet, or a die material has no clips loaded -
			// indexing an undefined group would throw inside this CANNON collide
			// listener, so just skip playback rather than crash the physics step
			let soundGroup = body.diceShape === "d2" ? this.sounds_dice['coin'] : this.sounds_dice[this.sound_dieMaterial];
			if (!soundGroup || soundGroup.length === 0) return;

			let sound = soundGroup[Math.floor(Math.random() * soundGroup.length)];
			this.playSound(sound, speed);
			this.lastSoundType = 'dice';


		} else { // dice to table collision
			let speed = target.velocity.length();
			// also don't bother playing at low speeds
			if (speed < 250) return;

			let surface = this.surface;

			// defensive: same reasoning as the dice-to-dice branch above
			let soundlist = this.sounds_table[surface];
			if (!soundlist || soundlist.length === 0) return;

			let sound = soundlist[Math.floor(Math.random() * soundlist.length)];
			this.playSound(sound, speed);
			this.lastSoundType = 'table';
		}

		this.lastSoundStep = body.world.stepnumber;
		this.lastSound = now + this.soundDelay;
	}

	// schedules playback on the audio rendering thread via a fresh
	// AudioBufferSourceNode/GainNode pair; no synchronous decode/session work
	// happens here, so this is safe to call from inside the collide handler.
	// Never throws: a missing buffer or a suspended/absent context just skips
	// playback rather than interrupting the physics/render loop.
	playSound(buffer, speed) {
		if (!buffer || !this.audioCtx || this.audioCtx.state === 'suspended') return;
		try {
			const source = this.audioCtx.createBufferSource();
			source.buffer = buffer;
			const gain = this.audioCtx.createGain();
			gain.gain.value = Math.min(speed / 8000, this.volume / 100);
			source.connect(gain).connect(this.audioCtx.destination);
			source.start(0);
		} catch (e) {
			// swallow: audio playback must never break the animation loop
		}
	}

	throwFinished() {
		const forcedFinish = this.iteration > this.iterationLimit

		// cycle through diceList and if any dice are still awake then return false
		for (let i=0, len=this.diceList.length; i < len; ++i) {
			const dicemesh = this.diceList[i];
			// remove() nulls out .body but leaves the entry's id/index in
			// place (see remove()'s comment); skip it here the same way
			// animateThrow's sync loop does, or dicemesh.body.sleepState
			// below would throw on a die removed mid-session
			if (!dicemesh || dicemesh.body == undefined) continue;
			const sleepState = CANNON.Body.SLEEPING

			if (dicemesh.body.sleepState < sleepState && !forcedFinish) {
				return false;
			}

			if (dicemesh.body.sleepState == sleepState || forcedFinish) {
				if(dicemesh.body.type === CANNON.Body.KINEMATIC){
					continue
				}

				//check for forced roll
				if (dicemesh.result.length == 0) {
					dicemesh.storeRolledValue(dicemesh.resultReason);
				} else if (dicemesh.result.length > 0 && dicemesh.rerolling) {
					dicemesh.rerolling = false;
					dicemesh.storeRolledValue('reroll');
				}

				dicemesh.rerolling = false;
				dicemesh.body.type = CANNON.Body.KINEMATIC;

			}
		}
		return true;
	}

	// runs the pre-simulation (up to iterationLimit world.step() calls) needed
	// to settle a throw before the visible animation starts. Historically this
	// was one long synchronous loop that could block the main thread for up to
	// 1000 steps (worst on mobile / many-dice rollMulti rolls). It now yields to
	// the event loop every SIMULATE_STEPS_PER_SLICE steps via an awaited
	// setTimeout(0), so the same steps happen in the same order (deterministic
	// result unchanged) but spread across macrotasks instead of one long frame -
	// UNLESS superseded mid-flight (see myGeneration below), in which case this
	// coroutine's own stepping stops rather than continuing to drive the shared
	// this.world/this.iteration against whatever roll superseded it.
	async simulateThrow() {
		this.animstate = 'simulate';
		this.iteration = 0;
		this.rolling = true;
		// callers (rollDice()/add()) increment this.rollGeneration before
		// calling simulateThrow(), so capturing it here lets this coroutine
		// detect - even mid-loop, immediately, not just after it resumes from
		// its own await - that a newer roll()/rollMulti()/reroll()/add() call
		// has taken over this.diceList/this.world and stop stepping physics
		// for dice that are no longer this call's own
		const myGeneration = this.rollGeneration;
		const SIMULATE_STEPS_PER_SLICE = 50;
		let stepsThisSlice = 0;
		while (!this._destroyed && myGeneration === this.rollGeneration && !this.throwFinished(true)) {
			++this.iteration;
			this.world.step(this.framerate);
			if (++stepsThisSlice >= SIMULATE_STEPS_PER_SLICE) {
				stepsThisSlice = 0;
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
	}

	animateThrow(threadid, callback){
		if (this._destroyed) return;
		this.animstate = 'throw';
		let time = Date.now();
		this.last_time = this.last_time || time - (this.framerate*1000);
		let time_diff = (time - this.last_time) / 1000;
		++this.iteration;
		// cap the catch-up loop: without this a hitch (GC pause, backgrounded
		// tab, slow frame) makes the next frame run many world.step() calls
		// back-to-back, each of which can fire more collide events -> more
		// steps next time -> spiral of death. Bookkeeping below advances
		// last_time by the steps actually taken, not the steps that were due,
		// so the simulation falls behind wall-clock time gracefully instead.
		let neededSteps = Math.min(Math.floor(time_diff / this.framerate), 5);

		// this.container.style.opacity = '1';

		for(let i = 0; i < neededSteps; i++) {
			this.world.step(this.framerate);
			// this.cannonDebugger.update()
			++this.steps;
		}

		// update physics interactions visually. diceList holds exactly the
		// scene children that carry a .body (walls/lights/desk don't), so an
		// indexed loop over it does the same work as the old for...in over
		// scene.children without the per-frame string-key enumeration of an array
		for (let i = 0, len = this.diceList.length; i < len; ++i) {
			const dicemesh = this.diceList[i];
			if (dicemesh && dicemesh.body != undefined) {
				dicemesh.position.copy(dicemesh.body.position);
				dicemesh.quaternion.copy(dicemesh.body.quaternion);
			}
		}

		this.renderer.render(this.scene, this.camera);
		this.last_time = this.last_time + neededSteps*this.framerate*1000;


		// roll finished
		if (this.running == threadid && this.throwFinished()) {
			this.running = false;
			this.rolling = false;
			if(callback) callback.call(this, this.notationVectors);

			this.running = Date.now();
			this.animateAfterThrow(this.running);
			return;
		}

		// roll not finished, keep animating
		if (this.running == threadid) {
			((animateCallback, tid, at, aftercall, vecs) => {
				if (!at && time_diff < this.framerate) {
					this._pendingAnimationHandle = { type: 'timeout', id: setTimeout(() => {
						this._pendingAnimationHandle = { type: 'raf', id: requestAnimationFrame(() => { animateCallback.call(this, tid, aftercall, vecs); }) };
					}, (this.framerate - time_diff) * 1000) };
				} else {
					this._pendingAnimationHandle = { type: 'raf', id: requestAnimationFrame(() => { animateCallback.call(this, tid, aftercall, vecs); }) };
				}
			}).bind(this)(this.animateThrow, threadid, this.adaptive_timestep, callback);
		}
	}

	animateAfterThrow(threadid) {
		if (this._destroyed) return;
		this.animstate = 'afterthrow';
		let time = Date.now();
		let time_diff = (time - this.last_time) / 1000;
		if (time_diff > 3) time_diff = this.framerate;

		this.running = false;
		this.last_time = time;
		this.renderer.render(this.scene, this.camera);
		if (this.running == threadid) {
			((animateCallback, tid, at) => {
				if (!at && time_diff < this.framerate) {
					this._pendingAnimationHandle = { type: 'timeout', id: setTimeout(() => {
						this._pendingAnimationHandle = { type: 'raf', id: requestAnimationFrame(() => { animateCallback.call(this, tid); }) };
					}, (this.framerate - time_diff) * 1000) };
				} else {
					this._pendingAnimationHandle = { type: 'raf', id: requestAnimationFrame(() => { animateCallback.call(this, tid); }) };
				}
			}).bind(this)(this.animateAfterThrow, threadid, this.adaptive_timestep);
		}
	}

	computeThrowVector() {
		const vector = { x: (Math.random() * 2 - 0.5) * this.display.currentWidth, y: -(Math.random() * 2 - 0.5) * this.display.currentHeight };
		const dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y) + 100;
		const boost = (Math.random() + 3) * dist * this.strength;
		return { vector, dist, boost };
	}

	startClickThrow(notation) {
		// startClickThrow runs synchronously inside the click/tap handler, so this
		// is the most reliable place to unlock the AudioContext on browsers that
		// require a user-gesture call stack (notably iOS Safari)
		this.resumeAudioContext();
		// if (this.rolling) return;
		if(this.rolling) {
			this.supersedePendingRoll();
			this.clearDice();
			this.rolling = false
		}
		const { vector, dist, boost } = this.computeThrowVector();
		return this.getNotationVectors(notation, vector, boost, dist);
	}

	// Disposes the Material instances in `materials` (always safe - see
	// disposeDiceMesh's comment below) and, for each one, the map/bumpMap
	// texture it holds ONLY if that texture is marked uniqueOwner (see
	// DiceFactory.createTextMaterial): textures built via the shared
	// materials_cache (the common case, allowcache=true) are NOT disposed here
	// - they're shared across dice/rolls and only DiceFactory.
	// disposeMaterialsCache()/flushDeferredDispose() (both called from
	// destroy()/clearDice()) may dispose those.
	disposeMaterials(materials) {
		if (!materials) return;
		const mats = Array.isArray(materials) ? materials : [materials];
		mats.forEach(mat => {
			if (!mat) return;
			if (mat.map && mat.map.userData && mat.map.userData.uniqueOwner) mat.map.dispose();
			if (mat.bumpMap && mat.bumpMap !== mat.map && mat.bumpMap.userData && mat.bumpMap.userData.uniqueOwner) mat.bumpMap.dispose();
			mat.dispose();
		});
	}

	// Disposes only the GPU resources uniquely owned by a single die:
	// - dicemesh.material: createMaterials() always builds fresh Material
	//   instances per die, so these are never shared and are always safe to
	//   dispose here via disposeMaterials(), which also disposes the
	//   material's map/bumpMap textures - but only the ones uniquely owned
	//   (built with allowcache=false, e.g. a forced d4 face-swap result); any
	//   texture shared via materials_cache is left alone.
	// - dicemesh.geometry: DiceFactory caches one geometry per die TYPE
	//   (this.DiceFactory.geometries[type]), shared across every die of that
	//   type for the life of the factory - it must survive. The only time a
	//   die's geometry is NOT that shared reference is after a forced-result
	//   face swap (swapDiceFace/swapDiceFace_D4 clone before mutating), so we
	//   only dispose when the reference has diverged from the factory's cache.
	// Explicitly NOT disposed here: DiceFactory.materials_cache (composite/bump
	// CanvasTextures) and DiceFactory.normalTextureCache (per-(type,face) bump
	// normal-map textures) - both owned by this instance's DiceFactory and
	// shared across dice/rolls; only destroy()/clearDice() may dispose them
	// (via disposeMaterialsCache()/flushDeferredDispose()).
	disposeDiceMesh(dicemesh) {
		if (!dicemesh) return;
		const sharedGeometry = dicemesh.notation && this.DiceFactory.geometries[dicemesh.notation.type];
		if (dicemesh.geometry && dicemesh.geometry !== sharedGeometry) {
			dicemesh.geometry.dispose();
		}
		this.disposeMaterials(dicemesh.material);
	}

	clearDice() {
		this.running = false;
		let dice;
		while (dice = this.diceList.pop()) {
			this.scene.remove(dice);
			if (dice.body) this.world.removeBody(dice.body);
			this.disposeDiceMesh(dice);
		}
		this.renderer.render(this.scene, this.camera);

		// the whole table is being cleared, so any materials_cache entry the
		// factory deferred disposing at eviction time (see DiceFactory's
		// flushDeferredDispose() comment) is now safe to actually dispose
		if (typeof this.DiceFactory.flushDeferredDispose === 'function') {
			this.DiceFactory.flushDeferredDispose();
		}

		// tracked in this._clearDiceRenderTimeout so destroy() can cancel it -
		// without that, a clearDice() called shortly before destroy() would
		// leave this fire ~100ms later against a renderer/scene destroy() has
		// already torn down. The this._destroyed guard is a second line of
		// defense in case this ever runs uncancelled.
		clearTimeout(this._clearDiceRenderTimeout);
		this._clearDiceRenderTimeout = setTimeout(() => {
			this._clearDiceRenderTimeout = null;
			if (this._destroyed) return;
			this.renderer.render(this.scene, this.camera);
		}, 100);
	}

	// Cancels whatever rAF/setTimeout continuation animateThrow()/
	// animateAfterThrow() most recently scheduled for itself, if any. Safe to
	// call when nothing is pending.
	cancelPendingAnimation() {
		if (!this._pendingAnimationHandle) return;
		const { type, id } = this._pendingAnimationHandle;
		if (type === 'timeout') clearTimeout(id);
		else if (type === 'raf') cancelAnimationFrame(id);
		this._pendingAnimationHandle = null;
	}

	// Rejects (if present) the Promise of whatever roll()/rollMulti()/reroll()/
	// add() call is currently in flight, so a call that supersedes it (a new
	// roll, a reroll while rolling, etc.) settles the earlier Promise instead
	// of leaving an awaiting caller hanging forever. Also cancels that call's
	// pending animation continuation (see cancelPendingAnimation()) - every
	// path that supersedes an in-flight roll (startClickThrow/rollMulti/
	// reroll/add) calls this before starting its own new animateThrow chain,
	// making this the single choke point for both. Safe to call when nothing
	// is pending.
	supersedePendingRoll() {
		this.cancelPendingAnimation();
		if (this.activeReject) {
			const reject = this.activeReject;
			this.activeReject = null;
			reject(new Error('Roll superseded by a new roll'));
		}
	}

	getDiceResults(id){
		if(id !== undefined){
			return {
				type: this.diceList[id].shape,
				sides: parseInt(this.diceList[id].shape.substring(1)),
				id,
				colorset: this.diceList[id].notation?.colorset ?? null,   // NEW
				...this.diceList[id].result.at(-1)
			}
		}
		let counter = 0
		const modifier = this.notationVectors.constant ? parseInt(`${this.notationVectors.op}${this.notationVectors.constant}`) : 0
		let rollTotal = modifier
		const result = {
			notation: this.notationVectors.notation,
			sets: this.notationVectors.set.map(set => {
				const endCount = counter + set.num - 1
				let setTotal = 0
				const rolls = []
				for (let index = counter; index <= endCount; index++) {
					if(this.diceList[counter].result.at(-1).reason === "remove") {
						counter++
						continue
					}
					rolls.push({
						type: set.type,
						sides: parseInt(set.type.substring(1)),
						id: counter,
						colorset: set.colorset ?? null,   // NEW
						...this.diceList[counter].result.at(-1)
					})
					setTotal += this.diceList[counter].result.at(-1).value
					counter++
				}
				const returnSet = {
					num: set.num,
					type: set.type,
					sides: parseInt(set.type.substring(1)),
					colorset: set.colorset ?? null,   // NEW
					label: set.label ?? null,         // NEW (set-level label lives HERE, not on rolls)
					op: set.op || '+',                // NEW ('' is treated as '+')
					rolls,
					total: setTotal,
				}
				rollTotal += (set.op === '-' ? -setTotal : setTotal)
				return returnSet
			}),
			modifier,
			total: rollTotal
		}
		return result
	}

	async roll(notationSting){
		this.notationVectors = this.startClickThrow(notationSting)
		if(this.notationVectors){
			// const DL = this.diceList
			return new Promise((resolve,reject) => {
				this.activeReject = reject;
				// rollDice() is async (it awaits the now-chunked simulateThrow());
				// .catch(reject) preserves the old behavior where a synchronous
				// throw inside it would reject this Promise instead of becoming
				// an unhandled rejection that leaves the caller hanging forever
				this.rollDice(() => {
					const results = this.getDiceResults()
					this.activeReject = null;

					// setting up a couple of ways to consume the final results
					// call onRollComplete
					this.onRollComplete(results)

					// dispatch an event with the results object for other UI elements to listen for
					const event = new CustomEvent('rollComplete', {detail: results})
					document.dispatchEvent(event)

					resolve(results)
				}, reject).catch(reject)
			})
		}
	}

	// Roll several independently-parsed notations as ONE combined physics throw,
	// each notation tagged with its own colorset. Two specs of the same die type
	// never merge into a single set: addSet()'s duplicate-key merge only runs
	// within one parseNotation() call, and mergeNotation() concatenates set[]/
	// vectors[] across instances with no re-keying.
	// specs: [{ notation: '1d100+1d10', colorset: 'fire', label: 'fire' }, ...]
	async rollMulti(specs) {
		// rollMulti() is a user-triggered entry point whose first work is a
		// network-bound await (colorset pre-warming, below); on iOS Safari the
		// user-gesture activation window for AudioContext.resume() can expire
		// before that await resolves, so this must run synchronously as the
		// very first statement - before any await - rather than relying on
		// rollDice()'s own (later, too-late-for-iOS) resumeAudioContext() call
		this.resumeAudioContext();

		if (!Array.isArray(specs) || specs.length === 0) return;

		// Claim ownership of this.diceList/this.running/this.rollGeneration
		// synchronously, BEFORE the colorset-prewarm await below - mirroring
		// roll()/add()/reroll(), which all take ownership before their first
		// (and, for roll()/add(), only) await. Without this, a roll()/rollMulti()/
		// reroll()/add() call that starts (and possibly finishes) while THIS
		// rollMulti() call is still awaiting the prewarm would be incorrectly
		// superseded when this call resumes and falls into the old
		// `if (this.rolling)` check below: e.g. rollMulti(A) then roll(B) -
		// A's prewarm resolves after B has already taken over, and used to
		// supersede/clearDice() B's in-flight roll out from under it.
		if (this.rolling) {
			this.supersedePendingRoll();
			this.clearDice();
			this.rolling = false;
		}
		const myGeneration = ++this.rollGeneration;

		// Pre-warm every distinct colorset's texture BEFORE any synchronous spawn
		// work — spawnDice reads this.DiceColors.colorsets[name] synchronously.
		// This await must complete before rollDice() is called; do not reorder.
		await Promise.all(
			[...new Set(specs.map(s => s.colorset).filter(Boolean))]
				.map(name => this.DiceColors.getColorSet({ colorset: name }))
		);

		// superseded (or destroyed) while yielding on the prewarm await above -
		// this.diceList/this.running/this.rollGeneration belong to someone else
		// (or nothing) now, so abort here instead of clobbering their in-flight
		// roll. Throwing (not returning) turns rollMulti()'s own promise into a
		// rejection - at this point nothing has registered this.activeReject for
		// this call yet, so there is no other way for a caller awaiting this
		// rollMulti() call to be notified (mirrors add()'s matching guard).
		if (this._destroyed) throw new Error('DiceBox instance was destroyed');
		if (myGeneration !== this.rollGeneration) throw new Error('Roll superseded by a new roll');

		const { vector, dist, boost } = this.computeThrowVector();

		let combined = null;
		for (const spec of specs) {
			const nv = this.getNotationVectors(spec.notation, vector, boost, dist, spec.colorset ?? null, spec.label ?? spec.colorset ?? null);
			combined = combined ? DiceNotation.mergeNotation(combined, nv) : nv;
		}
		combined.notation = specs.map(s => s.notation).join('+'); // cosmetic only
		this.notationVectors = combined;

		if (combined.error) {
			// one or more specs failed to parse - not necessarily the first one
			// merged, so this can't be caught by only checking the first spec.
			// mergeNotation() ORs prevNotation.error/newNotation.error together
			// so `combined.error` is reliably true regardless of which spec (or
			// how many) were malformed. Reject instead of resolving a fake
			// success covering only the valid specs, mirroring rollDice()'s own
			// malformed-notation handling (clear stale dice, reject, never fire
			// callbacks) - checked here too, explicitly, so rollMulti() doesn't
			// depend solely on rollDice() catching it downstream.
			this.clearDice();
			throw new Error(`Malformed dice notation: "${combined.notation}"`);
		}

		return new Promise((resolve, reject) => {
			this.activeReject = reject;
			// see roll()'s matching .catch(reject) comment: rollDice() is async now
			this.rollDice(() => {
				const results = this.getDiceResults();
				this.activeReject = null;
				this.onRollComplete(results);
				document.dispatchEvent(new CustomEvent('rollComplete', { detail: results }));
				resolve(results);
			}, reject).catch(reject);
		});
	}

	async reroll(diceIdArray) {
		// reroll() is a user-triggered entry point that bypasses both
		// startClickThrow() and rollDice(), so it needs its own resume attempt
		this.resumeAudioContext();
		if (this.rolling) {
			// this.rolling is only true while a previous roll()/rollMulti()/
			// add()/reroll() is actively animating (see rollDice()/add(),
			// which both set it right before their animateThrow() call) - so
			// the dice currently on the table are NOT a settled throw, they're
			// still falling. Rerolling specific die ids out of an unsettled
			// table is meaningless (nothing has actually landed, so "reroll
			// this die's result" has no result to start from) - silently
			// adopting those half-fallen dice would be inconsistent with
			// add()'s equivalent fix (see add()'s matching comment), which
			// clears rather than adopts an interrupted call's dice. Settle the
			// interrupted call's Promise, clear its still-falling dice, and
			// reject this reroll() too instead of animating whatever happens
			// to occupy the requested ids.
			this.supersedePendingRoll();
			// bump the generation BEFORE throwing out of this early path: the
			// interrupted roll/add may be a coroutine currently suspended inside
			// its chunked simulateThrow() (this.rolling is true during that
			// phase too, not just during animateThrow) - supersedePendingRoll()
			// only settles its Promise, it cannot stop the coroutine itself.
			// Without this bump, that coroutine would resume, see its captured
			// generation still matching, and plow on over the diceList that
			// clearDice() just emptied - corrupting this.notationVectors via
			// mergeNotation and (for add()) resolving a fake-success empty
			// result. The happy path below has its own bump; this early-throw
			// path needs one too because the throw skips it.
			++this.rollGeneration;
			this.clearDice();
			this.rolling = false;
			throw new Error('Cannot reroll: the table was not settled (a previous roll was still in progress) and has been cleared');
		}
		// bump the generation counter even though reroll() itself never awaits
		// mid-flight (so it has no need to check it): a rollDice()/add() call
		// suspended inside its own chunked simulateThrow() must see that it has
		// been superseded once it resumes, or it would overwrite this.running
		// out from under the animateThrow() loop reroll() is about to start
		++this.rollGeneration;
		this.rolling = true;
		this.running = Date.now();
		this.iteration = 0
		return new Promise((resolve,reject) => {
			this.activeReject = reject;
			diceIdArray.forEach(dieId => {
				const dicemesh = this.diceList[dieId]
				dicemesh.rerolls += 1;
				dicemesh.rerolling = true;
				dicemesh.body.wakeUp();
				dicemesh.body.type = CANNON.Body.DYNAMIC;
				dicemesh.body.angularVelocity = new CANNON.Vec3(25, 25, 25);
				dicemesh.body.velocity = new CANNON.Vec3(0, 0, 3000);
			})
			this.animateThrow(this.running, () => {
				const results = diceIdArray.map(dieId => this.getDiceResults(dieId))
				this.activeReject = null;

				this.onRerollComplete(results)

				// dispatch an event with the results object for other UI elements to listen for
				const event = new CustomEvent('rerollComplete', {detail: results})
				document.dispatchEvent(event)

				resolve(results)
			})
		})
	}

	async add(notationSting){
		if (this.rolling) {
			// a previous roll()/add()/reroll() is still in flight; settle its
			// Promise instead of silently orphaning it (matches reroll()'s
			// pattern). Unlike the settled-table case below, the dice on the
			// table right now are NOT a finished roll - they're the
			// interrupted call's still-falling dice, which was already
			// rejected by supersedePendingRoll() - so mirror
			// startClickThrow()'s own this.rolling branch and clearDice()
			// them rather than silently adopting them into this add()'s
			// result. dieCount below is computed after this, so an
			// interrupted roll falls through to the !dieCount branch and
			// becomes a fresh roll() instead of an add().
			this.supersedePendingRoll();
			this.clearDice();
			this.rolling = false;
		}

		let dieCount = this.diceList.length
		if(!dieCount) return this.roll(notationSting)

		let addNotationVectors = this.startClickThrow(notationSting)

		if (addNotationVectors.error) {
			// malformed notation: reject instead of resolving a fake success
			// with an empty results array, mirroring rollDice()'s handling.
			// Checked before any spawn/simulate work, so there is nothing
			// new to clear here - the dieCount dice already on the table are
			// untouched and must stay that way (unlike rollDice()'s
			// clearDice(), which intentionally replaces the whole table).
			this.activeReject = null;
			throw new Error(`Malformed dice notation: "${addNotationVectors.notation}"`);
		}

		let diceIdArray = []

		// see rollDice()'s matching comment: claim ownership of
		// this.diceList/this.running so a superseding call can be detected
		// when this coroutine resumes from its chunked simulateThrow() below
		const myGeneration = ++this.rollGeneration;

		for (let i=0, len=addNotationVectors.vectors.length; i < len; ++i) {
			this.spawnDice(addNotationVectors.vectors[i]);
		}

		await this.simulateThrow();

		// superseded (or destroyed) while yielding inside simulateThrow() - see
		// rollDice()'s matching guard. Unlike rollDice(), add() has not yet
		// registered an activeReject/Promise for itself at this point (that
		// only happens below), so throwing here is what turns this call's own
		// awaited promise into a rejection instead of it resolving silently
		// with undefined - the `return` this used to be was the bug: it made
		// add() resolve with undefined instead of rejecting when destroy() ran
		// during this await
		if (this._destroyed) throw new Error('DiceBox instance was destroyed');
		if (myGeneration !== this.rollGeneration) throw new Error('Add superseded by a new roll/add/reroll');

		this.steps = 0;
		this.iteration = 0;

		//reset dice vectors - for just the dice added
		for (let i=0, len=addNotationVectors.vectors.length; i < len; ++i) {
			const index = dieCount + i
			if (!this.diceList[index]) continue;

			//reset dice vectors
			this.spawnDice(addNotationVectors.vectors[i], this.diceList[index]);
			diceIdArray.push(index)
		}

		//check forced results, fix dice faces if necessary
		if (addNotationVectors.result && addNotationVectors.result.length > 0) {
			for (let i=0;i<addNotationVectors.result.length;i++) {
				const index = dieCount + i
				let dicemesh = this.diceList[index];
				if (!dicemesh) continue;
				if (dicemesh.getLastValue().value == addNotationVectors.result[i]) continue;
				this.swapDiceFace(dicemesh, addNotationVectors.result[i]);
			}
		}

		// Wake up newly added dice so they animate before settling
		// This fixes a bug where throwFinished() returns true immediately
		// because dice are already in SLEEPING state from simulateThrow()
		for (const idx of diceIdArray) {
			const die = this.diceList[idx];
			if (die && die.body) {
				die.body.wakeUp();
			}
		}

		// let our vectors combine
		this.notationVectors = DiceNotation.mergeNotation(this.notationVectors, addNotationVectors)

		return new Promise((resolve,reject) => {
			this.activeReject = reject;
			const callback = () => {
				const results = diceIdArray.map(dieId => this.getDiceResults(dieId))
				this.activeReject = null;

				// setting up a couple of ways to consume the dice added results
				// call onAddDiceComplete
				this.onAddDiceComplete(results)

				// dispatch an event with the results object for other UI elements to listen for
				const event = new CustomEvent('addDiceComplete', {detail: results})
				document.dispatchEvent(event)

				resolve(results)
			}

			// animate the previously simulated roll
			this.rolling = true;
			this.running = Date.now();
			this.last_time = 0;
			this.animateThrow(this.running, callback);
		})
	}

	async remove(diceIdArray){

		return new Promise((resolve,reject) => {
			const results = []
			diceIdArray.forEach(dieId => {
				const mesh = this.diceList[dieId]
				if (mesh.body) this.world.removeBody(mesh.body);
				// null out .body (rather than splicing the entry out of
				// diceList, which would shift every later die's id/index and
				// break id-based lookups like getDiceResults(id)/reroll()):
				// animateThrow's per-frame sync loop checks
				// `dicemesh.body != undefined` and skips entries where it's
				// null, so a removed die's stale, now-scene-detached
				// transform is no longer needlessly re-synced every frame
				mesh.body = null;
				this.scene.remove(mesh);
				this.disposeDiceMesh(mesh);
				mesh.storeRolledValue('remove');
				results.push(this.getDiceResults(dieId))
			})

			this.renderer.render(this.scene, this.camera);

			this.onRemoveDiceComplete(results)

			// dispatch an event with the results object for other UI elements to listen for
			const event = new CustomEvent('removeDiceComplete', {detail: results})
			document.dispatchEvent(event)

			resolve(results)

		})
	}

	// async so it can await the (now chunked/yielding) simulateThrow() below;
	// callers (roll()/rollMulti()) invoke this without awaiting it themselves -
	// completion is still communicated via callback/reject, same as before.
	async rollDice(callback, reject){

		// claim ownership of this.diceList/this.running for this call. Any
		// previously in-flight rollDice()/add() call that is currently
		// suspended inside its own `await this.simulateThrow()` captured an
		// older generation value below and will detect the mismatch (and bail
		// out instead of firing its own stale callback) once it resumes
		const myGeneration = ++this.rollGeneration;

		// second attempt at unlocking the AudioContext, covering roll paths
		// (e.g. rollMulti) that don't go through startClickThrow()
		this.resumeAudioContext();

		if (this.notationVectors.error) {
			// malformed notation: clear any stale dice from a previous roll and
			// reject instead of resolving a fake {sets:[], total:0} result, so
			// callers can tell a parse failure from a real zero roll
			this.clearDice();
			this.activeReject = null;
			if (reject) reject(new Error(`Malformed dice notation: "${this.notationVectors.notation}"`));
			return;
		}

		// this.camera.position.z = this.cameraHeight.far;
		this.clearDice();

		for (let i=0, len=this.notationVectors.vectors.length; i < len; ++i) {
			this.spawnDice(this.notationVectors.vectors[i]);
		}
		await this.simulateThrow();

		// superseded by a newer roll()/rollMulti()/reroll()/add() call while we
		// were yielding inside simulateThrow(), or the instance was destroyed -
		// this.diceList/this.running belong to someone else (or nothing) now,
		// so stop here instead of falling through to the unguarded tail below.
		// roll()/rollMulti() already registered this call's activeReject
		// before invoking us, and the superseding call's supersedePendingRoll()
		// already rejected it - throwing here just reaches the .catch(reject)
		// those callers attach, which is a harmless no-op on an
		// already-settled promise, or (if we were destroyed instead) is caught
		// the same way
		if (this._destroyed) return;
		if (myGeneration !== this.rollGeneration) throw new Error('Roll superseded by a new roll');

		this.steps = 0;
		this.iteration = 0;

		for (let i=0, len=this.diceList.length; i < len; ++i) {
			if (!this.diceList[i]) continue;

			//reset dice vectors
			this.spawnDice(this.notationVectors.vectors[i],this.diceList[i]);
		}

		//check forced results, fix dice faces if necessary
		if (this.notationVectors.result && this.notationVectors.result.length > 0) {
			for (let i=0;i<this.notationVectors.result.length;i++) {
				let dicemesh = this.diceList[i];
				if (!dicemesh) continue;
				if (dicemesh.getLastValue().value == this.notationVectors.result[i]) continue;
				this.swapDiceFace(dicemesh, this.notationVectors.result[i]);
			}
		}

		// animate the previously simulated roll
		this.rolling = true;
		this.running = Date.now();
		this.last_time = 0;
		this.animateThrow(this.running, callback);

	}

	// Tears down this DiceBox instance for good: stops any in-flight roll/
	// animation, unregisters the window resize listener, settles any pending
	// roll Promise, disposes every GPU resource this instance owns (including
	// the resources DiceFactory caches - safe here specifically because this
	// instance owns its own private DiceFactory and nothing outlives destroy()
	// to need those caches, unlike clearDice()/remove() which must leave them
	// alone), and removes the canvas from the DOM. The instance is not usable
	// after this call.
	destroy() {
		this._destroyed = true;

		// stop the animateThrow/animateAfterThrow rAF+setTimeout chain: both
		// gate their continuation on `this.running == threadid`, and the
		// `_destroyed` guards added to each mean any already-scheduled
		// callback becomes a no-op the next time it fires instead of touching
		// disposed resources. cancelPendingAnimation() additionally cancels
		// the scheduled rAF/timeout outright so it never fires at all.
		this.running = false;
		this.rolling = false;
		this.cancelPendingAnimation();

		// cancel clearDice()'s pending ~100ms delayed re-render (see clearDice()'s
		// comment) - it would otherwise fire after the renderer/scene below are
		// torn down. this._destroyed is now true regardless (set above), so the
		// callback's own guard would also no-op it, but cancelling outright means
		// it never fires at all.
		if (this._clearDiceRenderTimeout) {
			clearTimeout(this._clearDiceRenderTimeout);
			this._clearDiceRenderTimeout = null;
		}

		if (this._resizeHandler) {
			window.removeEventListener("resize", this._resizeHandler);
			this._resizeHandler = null;
		}

		// settle whatever roll()/rollMulti()/reroll()/add() Promise is in
		// flight instead of leaving the caller awaiting it forever
		if (this.activeReject) {
			this.activeReject(new Error("DiceBox instance was destroyed"));
			this.activeReject = null;
		}

		// remove + dispose per-die geometries/materials uniquely owned by
		// each die (mirrors clearDice(), but clearDice() itself would try to
		// re-render afterwards - this instance's renderer is going away)
		let dice;
		while (dice = this.diceList.pop()) {
			this.scene.remove(dice);
			if (dice.body) this.world.removeBody(dice.body);
			this.disposeDiceMesh(dice);
		}

		// this instance's own DiceFactory is not shared with anything else,
		// so - unlike clearDice()/remove() - it's safe and correct to dispose
		// its shared caches here too: the cached composite/bump CanvasTextures,
		// per-(type,face) normal-map textures, any not-yet-flushed deferred LRU
		// evictions, and the per-type geometries
		if (this.DiceFactory) {
			if (typeof this.DiceFactory.disposeMaterialsCache === 'function') {
				this.DiceFactory.disposeMaterialsCache();
			}
			if (typeof this.DiceFactory.flushDeferredDispose === 'function') {
				this.DiceFactory.flushDeferredDispose();
			}
			Object.values(this.DiceFactory.geometries || {}).forEach(geom => geom && geom.dispose());
			this.DiceFactory.geometries = {};
		}

		if (this.desk) {
			this.desk.geometry.dispose();
			this.desk.material.dispose();
			this.scene.remove(this.desk);
			this.desk = null;
		}

		// the PMREMGenerator-derived environment texture created in
		// initialize() is a real GPU resource that outlives the scene unless
		// explicitly disposed
		if (this.scene.environment) {
			this.scene.environment.dispose();
			this.scene.environment = null;
		}

		// browsers hard-cap the number of concurrent un-closed AudioContexts
		// (commonly ~6 in Chrome); close() this instance's so repeatedly
		// creating/destroying DiceBox instances with sounds enabled doesn't
		// exhaust that limit and silently break audio for the rest of the page
		if (this.audioCtx) {
			this.audioCtx.close().catch(() => {});
			this.audioCtx = null;
		}

		if (this.renderer) {
			this.renderer.dispose();
			const canvas = this.renderer.domElement;
			if (canvas && canvas.parentNode) {
				canvas.parentNode.removeChild(canvas);
			}
			this.renderer = null;
		}
	}
}

export { DiceBox }