const pkg = require('../package.json');

module.exports = {
	geoFromSVGFile:loadFromFile,
	geoFromSVGXML:loadFromString,
	svg2geojsonVersion: pkg.version
};

const { pathDataToPolys } = require('svg-path-to-polygons');
const { vec2, mat23 } = require('vmath');
const fs = require('fs');

function loadFromFile(svgFilePath, callback, options={}) {
	var xml = fs.readFileSync(svgFilePath)+"";
	loadFromString(xml, callback, options);
}

function loadFromString(svgXML, callback, options={}) {
	require('xml2js')
	.Parser({ explicitChildren:1, preserveChildrenOrder:1, xmlns:1 })
	.parseString(svgXML, (err,doc) => {
		if (err) throw err;
		callback( convertSVGToGeoJSON(doc, options) );
	});
}

let svgTolerance=1;

function convertSVGToGeoJSON(doc, options={}) {
	const {svg}=doc, layerByName={}, layers=[];

	// Find Geolocation
	const meta = svg.$$.find( e => e['$ns'] && e['$ns'].uri=='http://www.prognoz.ru' && e['$ns'].local=='MetaInfo' )
	const geo = meta && meta.$$.find(e => e['$ns'].local=='Geo')
	const corners = geo && geo.$$.filter( e => e['$ns'].local=='GeoItem' )
	if (!corners || corners.length!=2) {
		console.error('Your SVG file must include Prognoz MetaInfo as a child of <svg> element, containing 2 GeoItems. See:\nhttp://help.prognoz.com/8.0/en/mergedProjects/Specifications/svgmapspecification/structure/svgmap_structure.htm');
		process.exit(1);
	}

	const converter = rectangleConverter(corners);

	// Convert tolerance from real-world meters to SVG units
	const midLatRadians = (corners[0].$.Latitude.value*1 + corners[1].$.Latitude.value*1)/2 * Math.PI/180;
	const degreeLatLen  = 111132.954 - 559.822*Math.cos(2*midLatRadians) + 1.175*Math.cos(4*midLatRadians);
	const verticalRes   = converter.deltaLat * degreeLatLen / options.tolerance;
	svgTolerance = converter.deltaY / verticalRes;

	svg.$$.forEach( (el,i) => {
		if (options.layers && el['#name']==='g') {
				const name = el.$.id ? el.$.id.value.replace(/_1_$/,'').replace(/_/g,' ') : ('Layer '+i);
				if (!layerByName[name]) layerByName[name] = [];
				addGroupToLayer(el, layerByName[name], combineTransform(el));
		} else {
			if (!layerByName['']) layerByName[''] = [];
			addElementToLayer(el, layerByName['']);
		}
	});

	for (var name in layerByName) {
		if (!layerByName[name].length) continue;
		const geo = {
			type:'FeatureCollection',
			creator:`svg2geojson v${pkg.version}`,
			features:layerByName[name].map(data => {
				convertCoordinates(data.coordinates, converter);
				return {
					type:'Feature',
					properties:options.debug ? {svgID:data.coordinates.debugId} : null,
					geometry:data
				};
			})
		};
		layers.push({ name:name, geo:geo });
	}

	return options.layers ? layers : layers[0].geo;

	function convertCoordinates(coords) {
		if (typeof coords[0]==='number') converter(coords);
		else coords.forEach( a => { convertCoordinates(a) } );
		return coords;
	}
}

function addElementToLayer(el, layer, xform) {
	xform = combineTransform(el,xform);
	switch(el['#name']) {
		case 'g':        return addGroupToLayer(el, layer, xform);
		case 'path':     return addPathToLayer(el, layer, xform);
		case 'rect':     return addRectToLayer(el, layer, xform);
		case 'line':     return addLineToLayer(el, layer, xform);
		case 'circle':   return addCircleToLayer(el, layer, xform);
		case 'ellipse':  return addEllipseToLayer(el, layer, xform);
		case 'polygon':  return addPolygonToLayer(el, layer, xform);
		case 'polyline': return addPolylineToLayer(el, layer, xform);
		case 'style': case 'MetaInfo': case 'defs': case 'use':
			// Elements we expect, that have no impact on the output
		break;
		default: console.warn('Ignoring unhandled element '+el['#name']);
	}
}

function addGroupToLayer(el, layer, xform) {
	el.$$ && el.$$.forEach(e => { addElementToLayer(e,layer,xform) })
}

function addPathToLayer(el, layer, xform) {
	const c = attrs(el,'d');
	if (c.d) {
		const geo = addPathData(layer, xform, c.d, true);
		const pathStart = c.d.match(/^.+?\d.*?[\s,-].*?\d.*?(?=[\s,a-z-]|$)/i);
		addDebugId(geo, el, `path @ ${pathStart && pathStart[0]}`)
	}
}

function addRectToLayer(el, layer, xform) {
	const c = attrs(el,'x','y','width','height');
	const geo = {
		type: 'Polygon',
		coordinates:[
			coords([[c.x,         c.y         ],
		          [c.x,         c.y+c.height],
		          [c.x+c.width, c.y+c.height],
		          [c.x+c.width, c.y         ],
		          [c.x,         c.y         ]], xform)
		]
	};
	addDebugId(geo, el, `rect @ ${c.x},${c.y}`);
	layer.push(geo);
}

function addLineToLayer(el, layer, xform) {
	const c = attrs(el,'x1','y1','x2','y2');
	const geo = {
		type: 'LineString',
		coordinates:coords([[c.x1,c.y1],[c.x2,c.y2]], xform)
	};
	addDebugId(geo, el, `line @ ${c.x1},${c.y1}`);
	layer.push(geo);
}

function addCircleToLayer(el, layer, xform) {
	const c = attrs(el,'cx','cy','r');
	if (!c.r) return;
	const s = 0.55191502449*c.r, m = c.r-s;
	const geo = addPathData(
		layer, xform,
		['M', c.cx, c.cy+c.r,
		 'c',s,0,c.r,-m,c.r,-c.r,
		 's',-m,-c.r,-c.r,-c.r,
		 's',-c.r,m,-c.r,c.r,
		 's',m,c.r,c.r,c.r,'z'].join(' ')
	);
	addDebugId(geo, el, `circle @ ${c.cx},${c.cy}`);
}

function addEllipseToLayer(el, layer, xform) {
	console.error("FIXME: ADD SUPPORT FOR ELLIPSES");
	process.exit(2);
}

function addPolygonToLayer(el, layer, xform) {
	const c = attrs(el,'points');
	if (!c.points) return;
	const nums = c.points.split(/[\s,]+/);
	const pts = [];
	for (var i=0;i<nums.length;i+=2) if (nums[i] && nums[i+1]) pts.push([nums[i]*1,nums[i+1]*1]);
	pts.push(pts[0].concat()); // Duplicate the array since it will be mutated during transformation
	const geo = {
		type: 'Polygon',
		coordinates:[ coords(pts, xform) ]
	};
	if (!windingIsCorrect(geo.coordinates[0],0)) geo.coordinates[0] = geo.coordinates[0].reverse();
	addDebugId(geo, el, `polygon @ ${pts[0]},${pts[1]}`);
	layer.push(geo);
}

function addPolylineToLayer(el, layer, xform) {
	const c = attrs(el,'points');
	if (!c.points) return;
	const nums = c.points.split(/[\s,]+/);
	const pts = [];
	for (var i=0;i<nums.length;i+=2) if (nums[i] && nums[i+1]) pts.push([nums[i]*1,nums[i+1]*1]);
	pts.push(pts[0].concat()); // Duplicate the array since it will be mutated during transformation
	const geo = {
		type: 'LineString',
		coordinates:coords(pts, xform)
	};
	addDebugId(geo, el, `polyline @ ${pts[0]},${pts[1]}`);
	layer.push(geo);
}

function addPathData(layer,xform,pathData,checkWinding) {
	const polys = pathDataToPolys(pathData,{tolerance:svgTolerance});
	const geo = {
		type: (polys.length>1 || polys[0].closed) ? 'Polygon' : 'LineString',
		coordinates: polys.map( poly => coords(poly,xform) )
	};

	if (geo.type==='LineString') {
		geo.coordinates = geo.coordinates[0];
		if (geo.coordinates.length===1) {
			geo.type='Point';
			geo.coordinates = geo.coordinates[0];
		}
	} else if (checkWinding)
		for (var i=geo.coordinates.length;i--;)
			if (!windingIsCorrect(geo.coordinates[i],i))
				geo.coordinates[i] = geo.coordinates[i].reverse();

	layer.push(geo);
	return geo;
}

// https://stackoverflow.com/a/1165943/405017
function windingIsCorrect(pts, shouldBeClockwise) {
	var sum = 0;
	for (var i=0;i<pts.length;++i) {
		var p0 = pts[(i || pts.length) - 1];
		sum += (pts[i][0] - p0[0]) * (pts[i][1] + p0[1]);
	}
	return shouldBeClockwise ? sum<0 : sum>0;
}

function attrs(el, ...names) {
	const o = {};
	names.forEach(n => { o[n] = el.$[n] ? (isNaN(el.$[n].value*1) ? el.$[n].value : (el.$[n].value*1) ) : 0 });
	return o;
}

function combineTransform(el, xform) {
	if (el.$ && el.$.transform) {
		// FIXME: handle arbitrary SVG transform stack here
		const args = /matrix\((.+?)\)/.exec(el.$.transform.value);
		if (args) {
			const n = args[1].split(/[\s,]+/);
			const mat = mat23.new(n[0]*1,n[1]*1,n[2]*1,n[3]*1,n[4]*1,n[5]*1);
			// FIXME: is this the correct multiplication order?
			return xform ? mat23.multiply(xform, xform, mat) : mat;
		}
	}
	return xform;
}

function rectangleConverter(corners) {
	const xLerp = lerp(corners[0].$.X.value*1, corners[1].$.X.value*1, corners[0].$.Longitude.value*1, corners[1].$.Longitude.value*1);
	const yLerp = lerp(corners[0].$.Y.value*1, corners[1].$.Y.value*1, corners[0].$.Latitude.value*1,  corners[1].$.Latitude.value*1);
	const converter = svgXY => {
		svgXY[0] = xLerp(svgXY[0]);
		svgXY[1] = yLerp(svgXY[1]);
	};
	converter.deltaX = xLerp.dx;
	converter.deltaY = yLerp.dx;
	converter.deltaLon = xLerp.dy;
	converter.deltaLat = yLerp.dy;
	return converter;
}

function coords(coords, xform) {
	if (xform) {
		const pt = vec2.create();
		coords.forEach( a => {
			pt.x=a[0]; pt.y=a[1];
			vec2.transformMat23(pt,pt,xform);
			a[0]=pt.x; a[1]=pt.y;
		} );
	}
	return coords;
}

function addDebugId(geo, el, fallback) {
	geo.coordinates.debugId = (el.$ && el.$.id) ? `#${el.$.id}` : fallback;
}

function lerp(minX, maxX, minY, maxY) {
	const dx = maxX-minX,
	      dy = maxY-minY,
	      slope = dy/dx;
	const f = x => (x-minX)*slope + minY;
	f.dx = dx;
	f.dy = dy;
	return f;
}
