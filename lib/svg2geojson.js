module.exports = convertSVGToGeoJSON;

const { vec2, mat23 } = require('vmath');
const measurablePath = require('point-at-length');

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

	var converter = rectangleConverter(corners);
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
		const geojson = {
			type:'FeatureCollection',
			features:layerByName[name].map(data => {
				convertCoordinates(data.coordinates, converter);
				return {
					type:'Feature',
					properties:options.debug ? {svgID:data.coordinates.debugId} : null,
					geometry:data
				};
			})
		};
		layers.push({ name:name, geojson:geojson });
	}

	return layers;

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
		default: console.debug('Ignoring unhandled element '+el['#name']);
	}
}

function addGroupToLayer(el, layer, xform) {
	el.$$.forEach(e => { addElementToLayer(e,layer,xform) })
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

function addPathData(layer,xform,pathData,reverse) {
	const subpaths = pathData.match(/.+?z|.+/i);
	const geo = {
		// FIXME: if linestring, no wrapping array
		type: 'Polygon',
		// type: (subpaths.length>1 || /z[\s,]*$/i.test(subpaths[0])) ? 'Polygon' : 'LineString',
		coordinates: subpaths.map( subpathData => {
			const path = measurablePath(subpathData);
			const pts = [];
			const len = path.length();
			// TODO: adaptive subdivision
			var ct = 20;
			for (var i=0;i<=ct;++i) pts.push(path.at(len*i/ct));
			pts.push(pts[0].concat());
			if (reverse) pts.reverse();
			return coords(pts,xform);
		})
	};
	layer.push(geo);
	return geo;
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
	var xLerp = lerp(corners[0].$.X.value*1, corners[1].$.X.value*1, corners[0].$.Longitude.value*1, corners[1].$.Longitude.value*1);
	var yLerp = lerp(corners[0].$.Y.value*1, corners[1].$.Y.value*1, corners[0].$.Latitude.value*1,  corners[1].$.Latitude.value*1);
	return function(svgXY) {
		svgXY[0] = xLerp(svgXY[0]);
		svgXY[1] = yLerp(svgXY[1]);
	};
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
	var slope = (maxY-minY)/(maxX-minX);
	return function(x){ return (x-minX)*slope + minY };
}