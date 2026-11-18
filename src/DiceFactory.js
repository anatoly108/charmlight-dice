"use strict";
import {DicePreset} from './DicePreset.js'
import {MATERIALTYPES} from "./const/materialtypes.js"
import {DICE_GEOM} from "./const/dice.js"

import * as THREE from "three"
import * as CANNON from "cannon-es"

const defaultConfig = {
	baseScale: 100,
	bumpMapping: true,
	edgeRoundness: 1,
	normalMaps: true,
	materialTuning: {}
}
// How steep a full black-to-white step in a height map becomes in its normal map.
const NORMAL_STRENGTH = 1.8
// Glow masks only carry soft lettering, so they can be small.
const GLOW_SIZE = 256

// Sends every drawing call and style to several canvases at once.
function fanOut(...contexts) {
	return new Proxy(contexts[0], {
		get: (first, key) => typeof first[key] === 'function'
			? (...args) => contexts.map(context => context[key](...args))[0]
			: first[key],
		set: (first, key, value) => { for (const context of contexts) context[key] = value; return true; },
	});
}

// Turns a height map (white = high) into a tangent-space normal map. Unlike a
// bump map, it is filtered like any texture, so the relief stays smooth and
// stable when a die is small on screen or seen at a shallow angle.
function makeNormalMap(heightCanvas) {
	const context = heightCanvas.getContext("2d");
	if (typeof context.getImageData !== 'function') return null;
	const width = heightCanvas.width, height = heightCanvas.height;
	const source = context.getImageData(0, 0, width, height).data;
	const heights = new Float32Array(width * height);
	for (let i = 0; i < heights.length; i++) {
		heights[i] = (source[i * 4] * 0.299 + source[i * 4 + 1] * 0.587 + source[i * 4 + 2] * 0.114) / 255;
	}
	const at = (x, y) => heights[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const target = canvas.getContext("2d");
	const image = target.createImageData(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Sobel slopes, smoothed across three rows and columns.
			const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
			const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
			// Canvas rows run down while texture space runs up, hence +dy.
			const nx = -dx * NORMAL_STRENGTH, ny = dy * NORMAL_STRENGTH;
			const length = Math.hypot(nx, ny, 1), i = (y * width + x) * 4;
			image.data[i] = (nx / length * 0.5 + 0.5) * 255;
			image.data[i + 1] = (ny / length * 0.5 + 0.5) * 255;
			image.data[i + 2] = (1 / length * 0.5 + 0.5) * 255;
			image.data[i + 3] = 255;
		}
	}
	target.putImageData(image, 0, 0);
	return new THREE.CanvasTexture(canvas);
}

// White lettering with a soft halo on black, from a canvas of black lettering
// on white. Lit up through the material's emissive channel.
function makeGlowMap(letteringCanvas) {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = GLOW_SIZE;
	const context = canvas.getContext("2d");
	if (typeof context.drawImage !== 'function') return null;
	context.drawImage(letteringCanvas, 0, 0, GLOW_SIZE, GLOW_SIZE);
	context.globalCompositeOperation = 'difference';
	context.fillStyle = '#FFFFFF';
	context.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
	// Halo: add blurred copies, made by shrinking the lettering and scaling it back up.
	context.globalCompositeOperation = 'lighter';
	for (const [size, alpha] of [[GLOW_SIZE / 4, 0.45], [GLOW_SIZE / 10, 0.35]]) {
		const small = document.createElement("canvas");
		small.width = small.height = Math.round(size);
		small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
		context.globalAlpha = alpha;
		context.drawImage(small, 0, 0, GLOW_SIZE, GLOW_SIZE);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
// How much wider the bevel gets per unit of edge roundness.
const BEVEL_WIDEN = 0.8

class DiceFactory {
	static dice = {}
	constructor(options) {
		// this.dice = {};
		this.geometries = {};

		this.materials_cache = {};
		this.cache_hits = 0;
		this.cache_misses = 0;

		this.label_color = '';
		this.dice_color = '';
		this.edge_color = '';
		this.label_outline = '';
		this.dice_texture = '';
		this.dice_material = '';

		this.material_options = {
			specular: 0xffffff,
			color: 0xb5b5b5,
			shininess: 5,
			flatShading: true
		};

		Object.assign(this, defaultConfig, options)
		this.setEdgeRoundness(this.edgeRoundness)
		this.setMaterialTuning(this.materialTuning)
	}

	updateConfig(options = {}){
		Object.assign(this,options)
		if(options.scale){
			this.scaleGeometry()
		}
	}

	// Frees the cached face textures and die shapes.
	dispose() {
		for (const cached of Object.values(this.materials_cache)) {
			if (cached?.composite?.dispose) cached.composite.dispose();
			if (cached?.bump?.dispose) cached.bump.dispose();
			if (cached?.normal?.dispose) cached.normal.dispose();
			if (cached?.glow?.dispose) cached.glow.dispose();
		}
		this.materials_cache = {};
		for (const geometry of Object.values(this.geometries)) geometry.dispose();
		this.geometries = {};
	}

	// 0 keeps the original hard bevel. Above 0 the bevel is shaded as a curve
	// and widens with the value. Takes effect for dice created afterwards.
	setEdgeRoundness(edgeRoundness) {
		this.edgeRoundness = Math.max(0, Number(edgeRoundness) || 0);
		// Flat shading ignores the geometry's normals, which carry the rounding.
		this.material_options.flatShading = this.edgeRoundness === 0;
		for (const geometry of Object.values(this.geometries)) geometry.dispose();
		this.geometries = {};
	}

	// The studio environment the dice reflect. Each material type takes its own
	// share of it (envMapIntensity in MATERIALTYPES).
	setEnvironment(texture, rotation, intensity) {
		this.environment = { texture, rotation, intensity };
	}

	applyEnvironment(material) {
		if (!this.environment || !material.isMeshStandardMaterial) return;
		material.envMap = this.environment.texture;
		if (this.environment.rotation) material.envMapRotation.copy(this.environment.rotation);
		material.envMapIntensity = (material.userData.environmentShare ?? 1) * this.environment.intensity;
	}

	// Fine-tunes how the dice surface answers the light. Every key is optional;
	// a missing key keeps the material's own value.
	//   brightness, texture_depth,
	//   glow, glow_color                       every material
	//   sheen, sheen_tightness                 Phong plastic ("none")
	//   roughness, metalness, reflections,
	//   clearcoat, clearcoat_roughness,
	//   iridescence, iridescence_thickness,
	//   anisotropy, anisotropy_angle           PBR materials
	setMaterialTuning(materialTuning) {
		this.materialTuning = { ...(materialTuning || {}) };
	}

	applyMaterialTuning(material) {
		const number = (key, fallback) => {
			const value = this.materialTuning[key];
			return value === undefined || value === null || !Number.isFinite(Number(value)) ? fallback : Math.max(0, Number(value));
		};
		// Remember what the material type asked for, so a knob can be let go of.
		const base = material.userData.base ??= {
			color: material.color.clone(),
			bumpScale: material.bumpScale,
			shininess: material.shininess,
			roughness: material.roughness,
			metalness: material.metalness,
			reflections: material.userData.environmentShare ?? 1,
			clearcoat: material.clearcoat,
			clearcoatRoughness: material.clearcoatRoughness,
			iridescence: material.iridescence,
			anisotropy: material.anisotropy,
		};
		material.color.copy(base.color).multiplyScalar(number('brightness', 1));
		material.bumpScale = base.bumpScale * number('texture_depth', 1);
		material.normalScale.setScalar(number('texture_depth', 1));

		// Glowing numbers: the lettering emits light of its own.
		// A highlighted face (see DiceBox.highlightDie) glows on top of the tuning.
		const highlight = material.userData.highlight;
		const glow = Math.max(number('glow', 0), highlight?.glow ?? 0);
		const glowMap = glow > 0 ? material.userData.glowMap || null : null;
		if (material.userData.glowMap) {
			if (material.emissiveMap !== glowMap) {
				material.emissiveMap = glowMap;
				material.needsUpdate = true;
			}
			material.emissive.set(glowMap ? highlight?.color || this.materialTuning.glow_color || material.userData.labelColor || '#ffffff' : 0x000000);
			material.emissiveIntensity = glow;
		}
		if (material.isMeshPhongMaterial) {
			material.specular.setScalar(number('sheen', 1));
			material.shininess = number('sheen_tightness', base.shininess);
		}
		if (material.isMeshStandardMaterial) {
			material.roughness = Math.min(1, number('roughness', base.roughness));
			material.metalness = Math.min(1, number('metalness', base.metalness));
			material.userData.environmentShare = number('reflections', base.reflections);
			if (material.isMeshPhysicalMaterial) {
				material.clearcoat = Math.min(1, number('clearcoat', base.clearcoat));
				material.clearcoatRoughness = Math.min(1, number('clearcoat_roughness', base.clearcoatRoughness));
				// Thin-film colour shift, like a pearl or a soap bubble.
				material.iridescence = Math.min(1, number('iridescence', base.iridescence));
				material.iridescenceThicknessMinimum = 100;
				material.iridescenceThicknessMaximum = Math.max(100, number('iridescence_thickness', 400));
				// Stretched highlights along a grain, as on brushed metal.
				material.anisotropy = Math.min(1, number('anisotropy', base.anisotropy));
				material.anisotropyRotation = THREE.MathUtils.degToRad(number('anisotropy_angle', 0));
			}
			this.applyEnvironment(material);
		}
	}

	setBumpMapping(bumpMapping){
		this.bumpMapping = bumpMapping;
		this.materials_cache = {};
	}

	// returns a dicemesh (THREE.Mesh) object
	create(type) {
		let diceobj = this.get(type);
		if (!diceobj) return null;

		let geom = this.geometries[type];
		if(!geom) {
			geom = this.createGeometry(diceobj.shape, diceobj.scale * this.baseScale);
			this.geometries[type] = geom;
		}
		if (!geom) return null;

		this.setMaterialInfo();

		let dicemesh = new THREE.Mesh(geom, this.createMaterials(diceobj, this.baseScale / 2, 1.0));
		dicemesh.result = [];
		dicemesh.shape = diceobj.shape;
		dicemesh.rerolls = 0;
		dicemesh.resultReason = 'natural';
		dicemesh.mass = diceobj.mass

		dicemesh.getFaceValue = function() {
			// callback function. scope of this = Mesh
			let reason = this.resultReason;
			let vector = new THREE.Vector3(0, 0, this.shape == 'd4' ? -1 : 1);

			let closest_face, closest_angle = Math.PI * 2;
			let normals = this.geometry.getAttribute('normal').array;
			for (let i = 0, l = this.geometry.groups.length; i < l; ++i) {
				let face = this.geometry.groups[i];
				if (face.materialIndex == 0) continue;

				//Each group consists in 3 vertices of 3 elements (x, y, z) so the offset between faces in the Float32BufferAttribute is 9
				let startVertex = i * 9;
				let normal = new THREE.Vector3(normals[startVertex], normals[startVertex + 1], normals[startVertex + 2]);
				let angle = normal.clone().applyQuaternion(this.body.quaternion).angleTo(vector);
				if (angle < closest_angle) {
					closest_angle = angle;
					closest_face = face;
				}
			}
			let matindex = closest_face.materialIndex - 1;
			let offset = 2

			const diceobj = DiceFactory.dice[this.notation.type];

			if (this.shape == 'd4') {
				let labelindex2 = ((matindex-1) == 0) ? 5 : matindex;

				return {value: matindex, label: diceobj.labels[matindex-1][labelindex2][0], reason: reason};
			}

			if (['d10','d2'].includes(this.shape)) {
				matindex += 1;
				offset -= 1;
			}

			let value = diceobj.values[((matindex-1) % diceobj.values.length)];
			let label = diceobj.labels[(((matindex-1) % (diceobj.labels.length-2))+offset)];
			
			return {value: value, label: label, reason: reason};
		}

		dicemesh.storeRolledValue = function(reason) {
			this.resultReason = reason || this.resultReason;
			this.result.push(this.getFaceValue());
		}

		dicemesh.getLastValue = function() {
			if (!this.result || this.result.length < 1) return {value: undefined, label: '', reason: ''};

			return this.result[this.result.length-1];
		}

		dicemesh.ignoreLastValue = function(ignore) {
			let lastvalue = this.getLastValue();
			if (lastvalue.value === undefined) return;

			lastvalue.ignore = ignore;
			this.setLastValue(lastvalue);
		}

		dicemesh.setLastValue = function(result) {
			if (!this.result || this.result.length < 1) return;
			if (!result || result.length < 1) return;

			return this.result[this.result.length-1] = result;
		}

		if (diceobj.color) {
			dicemesh.material[0].color = new THREE.Color(diceobj.color);
			dicemesh.material[0].emissive = new THREE.Color(diceobj.color);
			dicemesh.material[0].emissiveIntensity = 1;
			dicemesh.material[0].needsUpdate = true;
		}

		switch (diceobj.values.length) {
			case 1:
				return this.fixmaterials(dicemesh, 1);
			case 2:
				return this.fixmaterials(dicemesh, 2);
			case 3: 
				return this.fixmaterials(dicemesh, 3);
			default:
				return dicemesh;
		}
	}

	get(type) {
		let dieSet
		if(DiceFactory.dice.hasOwnProperty(type)){
			dieSet = DiceFactory.dice[type]
		} else {
			dieSet = new DicePreset(type)
			DiceFactory.dice[type] = dieSet;
		}

		return dieSet
	}

	getGeometry(type) {
		return this.geometries[type];
	}

	scaleGeometry(){
		// console.log('this.geometries :>> ', this.geometries);
		// Object.entries(this.geometries).forEach(([key,geom]) => {
		// 	geom.scale(this.scale,this.scale,this.scale)
		// 	// remove cannon shape
		// 	// geom.cannon_shape.body.removeShape(geom.cannon_shape.body.shapes[0])
		// 	// recreate cannon shape with new scale
		// 	const newShape = this.createGeometry(key, this.scale, true)
		// 	console.log("🚀 ~ Object.entries ~ newShape", newShape)
		// 	geom.cannon_shape= newShape

		// })
	}

	createMaterials(diceobj, size, margin, allowcache = true, d4specialindex = 0) {

		let materials = [];
		let labels = diceobj.labels;
		if (diceobj.shape == 'd4') {
			labels = diceobj.labels[d4specialindex];
			size = this.baseScale / 2;
			margin = this.baseScale * 2;
		}
		
		for (var i = 0; i < labels.length; ++i) {
			var mat;
			if (this.dice_material != 'none') {
				// The physical material is the standard one plus optional layers such as
				// a clear coat. Layers left at 0 cost nothing.
				mat = new THREE.MeshPhysicalMaterial(MATERIALTYPES[this.dice_material]);
				mat.userData.environmentShare = MATERIALTYPES[this.dice_material].envMapIntensity ?? 1;
				this.applyEnvironment(mat);
			} else {
				mat = new THREE.MeshPhongMaterial(this.material_options);
			}

			let canvasTextures;
			if (i==0) { //edge
				//if the texture is fully opaque, we do not use it for edge
				let texture = {name:"none"};
				if(this.dice_texture_rand.composite != "source-over") texture = this.dice_texture_rand;

				canvasTextures = this.createTextMaterial(diceobj, labels, i, size, margin, texture, this.label_color_rand, this.label_outline_rand, this.edge_color_rand, allowcache);
				mat.map = canvasTextures.composite;

			} else {
				canvasTextures = this.createTextMaterial(diceobj, labels, i, size, margin, this.dice_texture_rand, this.label_color_rand, this.label_outline_rand, this.dice_color_rand, allowcache);
				mat.map = canvasTextures.composite;

				if (this.bumpMapping) {
					if (false) {
						mat.bumpScale = 0.5;
					} else {
						let scale = 0.75;;
						if(size > 35)
							scale = 1;
						if(size > 40)
							scale = 2.5;
						if(size > 45)
							scale = 4;
						mat.bumpScale = scale;
					}

					if (canvasTextures.bump) {
						mat.bumpMap = canvasTextures.bump;
					}
					if (canvasTextures.normal) {
						// A normal map replaces the bump map made from the same heights.
						mat.normalMap = canvasTextures.normal;
						mat.bumpMap = null;
					}
					if (diceobj.shape != 'd4' && diceobj.normals[i]) {
						mat.normalMap = null;
						mat.bumpMap = new THREE.Texture(diceobj.normals[i]);
						mat.bumpScale = 4;
						mat.bumpMap.needsUpdate = true;
					}
				}
			}
			mat.opacity = 1;
			mat.transparent = false;
			mat.depthTest = true;
			mat.needUpdate = true;
			if (i > 0) {
				mat.userData.glowMap = canvasTextures.glow;
				mat.userData.labelColor = this.label_color_rand;
			}
			this.applyMaterialTuning(mat);
			materials.push(mat);
		}
		//Edge mat

		return materials;
	}

	createTextMaterial(diceobj, labels, index, size, margin, texture, forecolor, outlinecolor, backcolor, allowcache) {
		if (labels[index] === undefined) return null;

		texture = texture || this.dice_texture_rand;
		forecolor = forecolor || this.label_color_rand;
		outlinecolor = outlinecolor || this.label_outline_rand;
		backcolor = backcolor || this.dice_color_rand;
		allowcache = allowcache == undefined ? true : allowcache;

		let text = labels[index];
		let isTexture = false;
		let textCache = text;
		if (text instanceof HTMLImageElement) {
			textCache = text.src;
		} else if (text instanceof Array) {
			text.forEach(el => {
				textCache += el.src;
			});
		}

		// an attempt at materials caching
		let cachestring = diceobj.type + textCache + index + texture.name + forecolor + outlinecolor + backcolor;
		if (diceobj.shape == 'd4') {
			cachestring = diceobj.type + textCache + texture.name + forecolor + outlinecolor + backcolor;
		}
		if (this.normalMaps) cachestring += 'normal';
		if (allowcache && this.materials_cache[cachestring] != null) {
			this.cache_hits++;
			return this.materials_cache[cachestring];
		}

		let canvas = document.createElement("canvas");
		let context = canvas.getContext("2d", {alpha: true});

		context.globalAlpha = 0;
		context.clearRect(0, 0, canvas.width, canvas.height);

		let canvasBump = document.createElement("canvas");
		let contextBump = canvasBump.getContext("2d", {alpha: true});
		contextBump.globalAlpha = 0;
		contextBump.clearRect(0, 0, canvasBump.width, canvasBump.height);

		let ts;

		if (diceobj.shape == 'd4') {
			ts = this.calc_texture_size(size + margin) * 4;
		} else {
			ts = this.calc_texture_size(size + size * 2 * margin) * 4;
		}

		canvas.width = canvas.height = ts;
		canvasBump.width = canvasBump.height = ts;

		// create color
		context.fillStyle = backcolor;
		context.fillRect(0, 0, canvas.width, canvas.height);

		contextBump.fillStyle = "#FFFFFF";
		contextBump.fillRect(0, 0, canvasBump.width, canvasBump.height);

		//create underlying texture
		if (texture.texture && texture.name != '' && texture.name != 'none') {
			context.globalCompositeOperation = texture.composite || 'source-over';
			context.drawImage(texture.texture, 0, 0, canvas.width, canvas.height);
			context.globalCompositeOperation = 'source-over';

			if (texture.bump) {
				contextBump.globalCompositeOperation = 'source-over';
				contextBump.drawImage(texture.bump, 0, 0, canvas.width, canvas.height);
			}
		} else {
			context.globalCompositeOperation = 'source-over';
		}

		// The glow mask gets the same lettering as the bump canvas, without the texture.
		let canvasGlow = document.createElement("canvas");
		canvasGlow.width = canvasGlow.height = ts;
		let contextGlow = canvasGlow.getContext("2d", {alpha: true});
		contextGlow.fillStyle = "#FFFFFF";
		contextGlow.fillRect(0, 0, ts, ts);
		contextBump = fanOut(contextBump, contextGlow);

		// create text
		context.globalCompositeOperation = 'source-over';
		context.textAlign = "center";
		context.textBaseline = "middle";

		contextBump.textAlign = "center";
		contextBump.textBaseline = "middle";

		if (diceobj.shape != 'd4') {

			// fixes texture rotations on specific dice models
			const rotate = {
				d8: {even: -7.5, odd: -127.5},
				d10: {all: -6},
				d12: {all: 5},
				d20: {all: -7.5},
			};

			// fix for some faces being weirdly rotated
			let rotateface = rotate[diceobj.shape];
			if(rotateface) {
				let degrees
				if(rotateface.hasOwnProperty("all")){
					degrees = rotateface.all
				} else {
					if(index > 0 && (index % 2) != 0){
						degrees = rotateface.odd
					} else {
						degrees = rotateface.even
					}
				} 
				// let degrees = ((rotateface.hasOwnProperty("all") ? rotateface.all : false) || (index > 0 && (index % 2) != 0)) ? rotateface.odd : rotateface.even;

				if (degrees && degrees != 0) {

					var hw = (canvas.width / 2);
					var hh = (canvas.height / 2);

					context.translate(hw, hh);
					context.rotate(degrees * (Math.PI / 180));
					context.translate(-hw, -hh);

					contextBump.translate(hw, hh);
					contextBump.rotate(degrees * (Math.PI / 180));
					contextBump.translate(-hw, -hh);
				}
			}

			//custom texture face
			if (text instanceof HTMLImageElement) {
				isTexture = true;
				context.drawImage(text, 0,0,text.width,text.height,0,0,canvas.width,canvas.height);

			// text-only face
			} else {

				let fontsize = ts / (1 + 2 * margin);
				let textstarty = (canvas.height / 2) + 10;
				let textstartx = (canvas.width / 2);

				if(diceobj.shape == 'd10') {
					fontsize = fontsize*0.75;
					textstarty = (textstarty*1.15) - 10;
				} else if(diceobj.shape == 'd20') {
					textstartx = textstartx*0.98;
				}

				context.font =  fontsize+ 'pt '+diceobj.font;
				contextBump.font =  fontsize+ 'pt '+diceobj.font;

				let lineHeight = context.measureText("M").width * 1.4;
				let textlines = text.split("\n");


				if (textlines.length > 1) {
					fontsize = fontsize / textlines.length;
					context.font =  fontsize+ 'pt '+diceobj.font;
					contextBump.font =  fontsize+ 'pt '+diceobj.font;
					lineHeight = context.measureText("M").width * 1.2;
					textstarty -= (lineHeight * textlines.length) / 2;
				}

				for(let i = 0, l = textlines.length; i < l; i++){
					let textline = textlines[i].trim();

					// attempt to outline the text with a meaningful color
					if (outlinecolor != 'none' && outlinecolor != backcolor) {
						context.strokeStyle = outlinecolor;
						context.lineWidth = 5;
						context.strokeText(textlines[i], textstartx, textstarty);

						contextBump.strokeStyle = "#000000";
						contextBump.lineWidth = 5;
						contextBump.strokeText(textlines[i], textstartx, textstarty);

						if (textline == '6' || textline == '9') {
							context.strokeText('  .', textstartx, textstarty);
							contextBump.strokeText('  .', textstartx, textstarty);
						}
					}

					context.fillStyle = forecolor;
					context.fillText(textlines[i], textstartx, textstarty);

					contextBump.fillStyle = "#000000";
					contextBump.fillText(textlines[i], textstartx, textstarty);

					if (textline == '6' || textline == '9') {
						context.fillText('  .', textstartx, textstarty);
						contextBump.fillText('  .', textstartx, textstarty);
					}
					textstarty += (lineHeight * 1.5);
				}
			}
		} else {

			var hw = (canvas.width / 2);
			var hh = (canvas.height / 2);

			context.font =  (ts / 128 * 24)+'pt '+diceobj.font;
			contextBump.font =  (ts / 128 * 24)+'pt '+diceobj.font;

			//draw the numbers
			for (let i=0; i<text.length; i++) {
				//custom texture face
				if (text[i] instanceof HTMLImageElement) {
					let scaleTexture = text[i].width / canvas.width;
					context.drawImage(text[i], 0, 0, text[i].width, text[i].height, (100/scaleTexture), (25/scaleTexture), (60/scaleTexture), (60/scaleTexture));
				} else {
					// attempt to outline the text with a meaningful color
					if (outlinecolor != 'none' && outlinecolor != backcolor) {
						context.strokeStyle = outlinecolor;
						context.lineWidth = 5;
						context.strokeText(text[i], hw, hh - ts * 0.3);

						contextBump.strokeStyle = "#000000";
						contextBump.lineWidth = 5;
						contextBump.strokeText(text[i], hw, hh - ts * 0.3);
					}

					//draw label in top middle section
					context.fillStyle = forecolor;
					context.fillText(text[i], hw, hh - ts * 0.3);

					contextBump.fillStyle = "#000000";
					contextBump.fillText(text[i], hw, hh - ts * 0.3);
				}

				//rotate 1/3 for next label
				context.translate(hw, hh);
				context.rotate(Math.PI * 2 / 3);
				context.translate(-hw, -hh);

				contextBump.translate(hw, hh);
				contextBump.rotate(Math.PI * 2 / 3);
				contextBump.translate(-hw, -hh);
			}

			//debug side numbering
			// context.fillStyle = forecolor;
			// context.fillText(index, hw, hh);
		}

		var compositetexture = new THREE.CanvasTexture(canvas);
		compositetexture.colorSpace = THREE.SRGBColorSpace;
		var bumpMap, normalMap = null, glowMap = null;
		if (!isTexture) {
			bumpMap = new THREE.CanvasTexture(canvasBump);
			if (this.normalMaps) normalMap = makeNormalMap(canvasBump);
			glowMap = makeGlowMap(canvasGlow);
		} else {
			bumpMap = null;
		}
		const textures = {composite:compositetexture,bump:bumpMap,normal:normalMap,glow:glowMap};

		if (allowcache) {
			// cache new texture
			this.cache_misses++;
			this.materials_cache[cachestring] = textures;
		}

		return textures;
	}

	applyColorSet(colordata) {
		this.colordata = colordata;
		this.label_color = colordata.foreground;
		this.dice_color = colordata.background;
		this.label_outline = colordata.outline;
		this.dice_texture = colordata.texture;
		this.dice_material = colordata?.texture?.material || 'none';
		this.edge_color = colordata.hasOwnProperty("edge") ? colordata.edge:colordata.background;
	}

	// pass in colorset data from dice-box
	setMaterialInfo(colorset = '') {
		let prevcolordata = this.colordata;
		let prevtexture = this.dice_texture;
		let prevmaterial = this.dice_material;

		//reset random choices
		this.dice_color_rand = '';
		this.label_color_rand = '';
		this.label_outline_rand = '';
		this.dice_texture_rand = '';
		this.dice_material_rand = '';
		this.edge_color_rand = '';

		// set base color first
		if (Array.isArray(this.dice_color)) {

			var colorindex = Math.floor(Math.random() * this.dice_color.length);

			// if color list and label list are same length, treat them as a parallel list
			if (Array.isArray(this.label_color) && this.label_color.length == this.dice_color.length) {
				this.label_color_rand = this.label_color[colorindex];

				// if label list and outline list are same length, treat them as a parallel list
				if (Array.isArray(this.label_outline) && this.label_outline.length == this.label_color.length) {
					this.label_outline_rand = this.label_outline[colorindex];
				}
			}
			// if texture list is same length do the same
			if (Array.isArray(this.dice_texture) && this.dice_texture.length == this.dice_color.length) {
				this.dice_texture_rand = this.dice_texture[colorindex];
				this.dice_material_rand = this.dice_texture_rand.material;
			}

			//if edge list and color list are same length, treat them as a parallel list
			if (Array.isArray(this.edge_color) && this.edge_color.length == this.dice_color.length) {
				this.edge_color_rand = this.edge_color[colorindex];
			}

			this.dice_color_rand = this.dice_color[colorindex];
		} else {
			this.dice_color_rand = this.dice_color;
		}

		// set edge color if not set
		if(this.edge_color_rand == ''){
			if (Array.isArray(this.edge_color)) {

				var colorindex = Math.floor(Math.random() * this.edge_color.length);

				this.edge_color_rand = this.edge_color[colorindex];
			} else {
				this.edge_color_rand = this.edge_color;
			}
		}

		// if selected label color is still not set, pick one
		if (this.label_color_rand == '' && Array.isArray(this.label_color)) {
			var colorindex = this.label_color[Math.floor(Math.random() * this.label_color.length)];

			// if label list and outline list are same length, treat them as a parallel list
			if (Array.isArray(this.label_outline) && this.label_outline.length == this.label_color.length) {
				this.label_outline_rand = this.label_outline[colorindex];
			}

			this.label_color_rand = this.label_color[colorindex];

		} else if (this.label_color_rand == '') {
			this.label_color_rand = this.label_color;
		}

		// if selected label outline is still not set, pick one
		if (this.label_outline_rand == '' && Array.isArray(this.label_outline)) {
			var colorindex = this.label_outline[Math.floor(Math.random() * this.label_outline.length)];

			this.label_outline_rand = this.label_outline[colorindex];
			
		} else if (this.label_outline_rand == '') {
			this.label_outline_rand = this.label_outline;
		}

		// same for textures list
		if (this.dice_texture_rand == '' && Array.isArray(this.dice_texture)) {
			this.dice_texture_rand = this.dice_texture[Math.floor(Math.random() * this.dice_texture.length)];
			this.dice_material_rand = this.dice_texture_rand.material || this.dice_material;
		} else if (this.dice_texture_rand == '') {
			this.dice_texture_rand = this.dice_texture;
			this.dice_material_rand = this.dice_texture_rand.material || this.dice_material;
		}

		//apply material
		if (this.dice_material_rand == '' && Array.isArray(this.dice_material)) {
			this.dice_material_rand = this.dice_material[Math.floor(Math.random() * this.dice_material.length)];
		} else if (this.dice_material_rand == '') {
			this.dice_material_rand = this.dice_material;
		}

		// console.log('this.colordata', this.colordata)

		if (this.colordata &&this.colordata.id != prevcolordata.id) {
			this.applyColorSet(prevcolordata, prevtexture, prevmaterial);
			// this.applyTexture(prevtexture);
			// this.applyMaterial(prevmaterial);
		}
	}

	calc_texture_size(approx) {
		return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
	}

	createGeometry(type, radius, onlyShape = false) {
		const func = onlyShape ? "create_shape" : "create_geom"
		switch (type) {
			case 'd2':
				var geom = new THREE.CylinderGeometry(1*radius, 1*radius, 0.1*radius, 32);
				geom.cannon_shape = new CANNON.Cylinder(1*radius, 1*radius, 0.1*radius, 8);
				return geom;
			case 'd4':
				return this[func](DICE_GEOM.d4.vertices, DICE_GEOM.d4.faces, radius, -0.1, Math.PI * 7 / 6, 0.96);
			case 'd6':
				return this[func](DICE_GEOM.d6.vertices, DICE_GEOM.d6.faces, radius, 0.1, Math.PI / 4, 0.96);
			case 'd8':
				return this[func](DICE_GEOM.d8.vertices, DICE_GEOM.d8.faces, radius, 0, -Math.PI / 4 / 2, 0.965);
			case 'd10':
				return this[func](DICE_GEOM.d10.vertices, DICE_GEOM.d10.faces, radius, 0.3, Math.PI, 0.945);
			case 'd12':
				return this[func](DICE_GEOM.d12.vertices, DICE_GEOM.d12.faces, radius, 0.2, -Math.PI / 4 / 2, 0.968);
			case 'd20':
				return this[func](DICE_GEOM.d20.vertices, DICE_GEOM.d20.faces, radius, -0.2, -Math.PI / 4 / 2, 0.955);
			default:
				console.error(`Geometry for ${type} is not available`)
				return null;
		}
	}

	fixmaterials(mesh, unique_sides) {
		// this makes the mesh reuse textures for other sides
		for (let i = 0, l = mesh.geometry.groups.length; i < l; ++i) {
			var matindex = mesh.geometry.groups[i].materialIndex - 2;
			if (matindex < unique_sides) continue;

			let modmatindex = (matindex % unique_sides);

			mesh.geometry.groups[i].materialIndex = modmatindex + 2;
		}
		mesh.geometry.elementsNeedUpdate = true;
		return mesh;
	}

	create_shape(vertices, faces, radius) {
		var vectors = new Array(vertices.length);
		for (var i = 0; i < vertices.length; ++i) {
			vectors[i] = (new THREE.Vector3).fromArray(vertices[i]).normalize();
		}
		var cv = new Array(vertices.length), cf = new Array(faces.length);
		for (var i = 0; i < vectors.length; ++i) {
			var v = vectors[i];
			cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
		}
		for (var i = 0; i < faces.length; ++i) {
			cf[i] = faces[i].slice(0, faces[i].length - 1);
		}
		const shape = new CANNON.ConvexPolyhedron({vertices:cv,faces:cf});
		// console.log("🚀 ~ create_shape ~ shape", shape)
		return shape
	}

	make_geom(vertices, faces, radius, tab, af) {
		let geom = new THREE.BufferGeometry();

		for (let i = 0; i < vertices.length; ++i) {
				vertices[i] = vertices[i].multiplyScalar(radius);
		}
		const bevelNormals = this.edgeRoundness > 0 ? this.face_normals(vertices, faces) : null;

		let positions = [];
		const normals = [];
		const uvs = [];

		const cb = new THREE.Vector3();
		const ab = new THREE.Vector3();
		let materialIndex;
		let faceFirstVertexIndex = 0;

		for (let i = 0; i < faces.length; ++i) {
				let ii = faces[i], fl = ii.length - 1;
				let aa = Math.PI * 2 / fl;
				materialIndex = ii[fl] + 1;
				for (let j = 0; j < fl - 2; ++j) {

						//Vertices
						positions.push(...vertices[ii[0]].toArray());
						positions.push(...vertices[ii[j + 1]].toArray());
						positions.push(...vertices[ii[j + 2]].toArray());

						// Flat face normals
						cb.subVectors( vertices[ii[j + 2]], vertices[ii[j + 1]] );
						ab.subVectors( vertices[ii[0]], vertices[ii[j + 1]] );
						cb.cross( ab );
						cb.normalize();

						// Vertex Normals
						// Bevels borrow the normals of the faces they join, so light rolls
						// over the edge as if it were round.
						const rounded = bevelNormals && ii[fl] === -1;
						normals.push(...(rounded ? bevelNormals[ii[0]] : cb).toArray());
						normals.push(...(rounded ? bevelNormals[ii[j + 1]] : cb).toArray());
						normals.push(...(rounded ? bevelNormals[ii[j + 2]] : cb).toArray());

						//UVs
						uvs.push((Math.cos(af) + 1 + tab) / 2 / (1 + tab), (Math.sin(af) + 1 + tab) / 2 / (1 + tab));
						uvs.push((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab));
						uvs.push((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab));

				}

				//Set Group for face materials.
				let numOfVertices = (fl - 2) * 3;
				for (let i = 0; i < numOfVertices/3; i++) {
					geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
					faceFirstVertexIndex += 3;
				}

		}


		geom.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
		geom.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
		geom.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
		geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
		return geom;
	}

	// The normal of the numbered face each vertex belongs to. After chamfering,
	// every vertex sits on exactly one numbered face.
	face_normals(vertices, faces) {
		const normals = new Array(vertices.length);
		const cb = new THREE.Vector3(), ab = new THREE.Vector3();
		for (const face of faces) {
			const fl = face.length - 1;
			if (face[fl] === -1) continue;
			cb.subVectors(vertices[face[2]], vertices[face[1]]);
			ab.subVectors(vertices[face[0]], vertices[face[1]]);
			const normal = cb.clone().cross(ab).normalize();
			for (let j = 0; j < fl; ++j) normals[face[j]] = normal;
		}
		return normals;
	}

	make_d10_geom(vertices, faces, radius, tab, af) {
		let geom = new THREE.BufferGeometry();

		for (let i = 0; i < vertices.length; ++i) {
				vertices[i] = vertices[i].multiplyScalar(radius);
		}
		const bevelNormals = this.edgeRoundness > 0 ? this.face_normals(vertices, faces) : null;

		let positions = [];
		const normals = [];
		const uvs = [];

		const cb = new THREE.Vector3();
		const ab = new THREE.Vector3();
		let materialIndex;
		let faceFirstVertexIndex = 0;

		for (let i = 0; i < faces.length; ++i) {
			let ii = faces[i], fl = ii.length - 1;
			let aa = Math.PI * 2 / fl;
			materialIndex = ii[fl] + 1;
			var w = 0.65;
			var h = 0.85;
			var v0 = 1 - 1*h;
			var v1 = 1 - (0.895/1.105)*h;
			var v2 = 1;
			for (let j = 0; j < fl - 2; ++j) {

				//Vertices
				positions.push(...vertices[ii[0]].toArray());
				positions.push(...vertices[ii[j + 1]].toArray());
				positions.push(...vertices[ii[j + 2]].toArray());

				// Flat face normals
				cb.subVectors( vertices[ii[j + 2]], vertices[ii[j + 1]] );
				ab.subVectors( vertices[ii[0]], vertices[ii[j + 1]] );
				cb.cross( ab );
				cb.normalize();

				// Vertex Normals
				// Bevels borrow the normals of the faces they join, so light rolls
				// over the edge as if it were round.
				const rounded = bevelNormals && ii[fl] === -1;
				normals.push(...(rounded ? bevelNormals[ii[0]] : cb).toArray());
				normals.push(...(rounded ? bevelNormals[ii[j + 1]] : cb).toArray());
				normals.push(...(rounded ? bevelNormals[ii[j + 2]] : cb).toArray());

				//UVs
				if(faces[i][faces[i].length-1] == -1 || j >= 2){
					uvs.push((Math.cos(af) + 1 + tab) / 2 / (1 + tab), (Math.sin(af) + 1 + tab) / 2 / (1 + tab));
					uvs.push((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab));
					uvs.push((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab));
				} else if(j==0) {
					uvs.push(0.5-w/2, v1);
					uvs.push(0.5, v0);
					uvs.push(0.5+w/2, v1);
				} else if(j==1) {
					uvs.push(0.5-w/2, v1);
					uvs.push(0.5+w/2, v1);
					uvs.push(0.5, v2);
				}
			}
			//Set Group for face materials.
			let numOfVertices = (fl - 2) * 3;
			for (let i = 0; i < numOfVertices/3; i++) {
				geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
				faceFirstVertexIndex += 3;
			}
		}


		geom.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
		geom.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
		geom.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
		geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);

		return geom;
	}

	chamfer_geom(vectors, faces, chamfer) {
		var chamfer_vectors = [], chamfer_faces = [], corner_faces = new Array(vectors.length);
		for (var i = 0; i < vectors.length; ++i) corner_faces[i] = [];
		for (var i = 0; i < faces.length; ++i) {
			var ii = faces[i], fl = ii.length - 1;
			var center_point = new THREE.Vector3();
			var face = new Array(fl);
			for (var j = 0; j < fl; ++j) {
				var vv = vectors[ii[j]].clone();
				center_point.add(vv);
				corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
			}
			center_point.divideScalar(fl);
			for (var j = 0; j < fl; ++j) {
				var vv = chamfer_vectors[face[j]];
				vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
			}
			face.push(ii[fl]);
			chamfer_faces.push(face);
		}
		for (var i = 0; i < faces.length - 1; ++i) {
			for (var j = i + 1; j < faces.length; ++j) {
				var pairs = [], lastm = -1;
				for (var m = 0; m < faces[i].length - 1; ++m) {
					var n = faces[j].indexOf(faces[i][m]);
					if (n >= 0 && n < faces[j].length - 1) {
						if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
						else pairs.push([i, m], [j, n]);
						lastm = m;
					}
				}
				if (pairs.length != 4) continue;
				chamfer_faces.push([
					chamfer_faces[pairs[0][0]][pairs[0][1]],
					chamfer_faces[pairs[1][0]][pairs[1][1]],
					chamfer_faces[pairs[3][0]][pairs[3][1]],
					chamfer_faces[pairs[2][0]][pairs[2][1]],
					-1
				]);
			}
		}
		for (var i = 0; i < corner_faces.length; ++i) {
			var cf = corner_faces[i], face = [cf[0]], count = cf.length - 1;
			while (count) {
				for (var m = faces.length; m < chamfer_faces.length; ++m) {
					var index = chamfer_faces[m].indexOf(face[face.length - 1]);
					if (index >= 0 && index < 4) {
						if (--index == -1) index = 3;
						var next_vertex = chamfer_faces[m][index];
						if (cf.indexOf(next_vertex) >= 0) {
							face.push(next_vertex);
							break;
						}
					}
				}
				--count;
			}
			face.push(-1);
			chamfer_faces.push(face);
		}
		return { vectors: chamfer_vectors, faces: chamfer_faces };
	}

	create_geom(vertices, faces, radius, tab, af, chamfer) {
		var vectors = new Array(vertices.length);
		for (var i = 0; i < vertices.length; ++i) {
			vectors[i] = (new THREE.Vector3).fromArray(vertices[i]).normalize();
		}
		// A rounder edge is also a wider one.
		chamfer = 1 - (1 - chamfer) * (1 + Math.max(0, this.edgeRoundness) * BEVEL_WIDEN);
		var cg = this.chamfer_geom(vectors, faces, chamfer);
		if(faces.length != 10) {
			var geom = this.make_geom(cg.vectors, cg.faces, radius, tab, af);
		}
		else {
			var geom = this.make_d10_geom(cg.vectors, cg.faces, radius, tab, af);
		}
		//var geom = make_geom(vectors, faces, radius, tab, af); // Without chamfer
		geom.cannon_shape = this.create_shape(vertices, faces, radius);
		geom.name = "d"+faces.length
		return geom;
	}
}

export { DiceFactory }