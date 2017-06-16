const fs = require('fs');
const { vec2, mat23 } = require('vmath');
const pathParser = require('svg-path-parser');
const measurablePath = require('point-at-length');
const { neatJSON } = require('neatjson');

// TODO: check for file argument/existence
var originalFile = process.argv[2];
parseXMLFile(originalFile, convertSVGToGeoJSON);

function convertSVGToGeoJSON(doc) {
	const {svg} = doc;
	var layerByName = {};

	// Find Geolocation
	const meta = svg.$$.find( e => e['$ns'] && e['$ns'].uri=='http://www.prognoz.ru' && e['$ns'].local=='MetaInfo' )
	const geo = meta && meta.$$.find(e => e['$ns'].local=='Geo')
	const corners = geo && geo.$$.filter( e => e['$ns'].local=='GeoItem' )
	if (!corners || corners.length!=2) die('Your SVG file must include Prognoz MetaInfo as a child of <svg> element, containing 2 GeoItems. See:\nhttp://help.prognoz.com/8.0/en/mergedProjects/Specifications/svgmapspecification/structure/svgmap_structure.htm');

	var converter = rectangleConverter(corners);
	svg.$$.forEach( (el,i) => {
		switch(el['#name']) {
			case 'g':
				const name = el.$.id ? el.$.id.value.replace(/_1_$/,'').replace(/_/g,' ') : ('Layer '+i);
				if (!layerByName[name]) layerByName[name] = [];
				addGroupToLayer(el, layerByName[name], combineTransform(el));
			break;
			default:
				if (!layerByName['']) layerByName[''] = [];
				addElementToLayer(el, layerByName['']);
		}
	});

	for (var name in layerByName) {
		if (!layerByName[name].length) continue;
		const fileName = originalFile.replace( /\.[^/.]+$/, (name && ('-'+name)) + '.geojson' );
		const geo = {
			type:'FeatureCollection',
			features:layerByName[name].map((data,i) => {
				convertToGeoJSON(data.coordinates, converter)
				return {type:'Feature',	geometry:data, properties:null};
			})
		};

		// TODO: NeatJSON options
		fs.writeFileSync(fileName, neatJSON(geo,{short:0,indent:"\t",wrap:120,aligned:true,decimals:6,afterColonN:1}));
		console.log('Wrote to '+fileName);
	}
}

function convertToGeoJSON(coords,converter) {
	if (typeof coords[0]==='number') converter(coords);
	else coords.forEach( a => { convertToGeoJSON(a,converter) } );
	return coords;
}

function addElementToLayer(el, layer, xform) {
	xform = combineTransform(el,xform);
	switch(el['#name']) {
		case 'g':        return addGroupToLayer(el, layer, xform);
		// case 'path':     return addPathToLayer(el, layer, xform);
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
	if (c.d) addPathData(layer, xform, c.d);
}

function addRectToLayer(el, layer, xform) {
	console.log('--rect');
	const c = attrs(el,'x','y','width','height');
	layer.push({
		type: 'Polygon',
		coordinates:[
			coords([[c.x,         c.y         ],
		            [c.x,         c.y+c.height],
		            [c.x+c.width, c.y+c.height],
		            [c.x+c.width, c.y         ],
		            [c.x,         c.y         ]], xform)
		]
	});
}

function addLineToLayer(el, layer, xform) {
}

function addCircleToLayer(el, layer, xform) {
	const c = attrs(el,'cx','cy','r');
	const r0 = c.r/2+','+c.r/2;
	if (!c.r) return;
	addPathData(
		layer, xform,
		['M', c.cx, c.cy-c.r,
		 'A',r0,0,0,0,c.cx,(c.cy+c.r),
		     r0,0,0,0,c.cx,(c.cy-c.r)].join(' ')
	);
}

function addEllipseToLayer(el, layer, xform) {
}

function addPolygonToLayer(el, layer, xform) {
	const c = attrs(el,'points');
	if (!c.points) return;
	console.log('--polygon');
	const nums = c.points.split(/[\s,]+/);
	const pts = [];
	for (var i=0;i<nums.length;i+=2) if (nums[i] && nums[i+1]) pts.push([nums[i]*1,nums[i+1]*1]);
	pts.push(pts[0].concat()); // Duplicate the array since it will be mutated during transformation
	layer.push({
		type: 'Polygon',
		coordinates:[ coords(pts, xform) ]
	});
}

function addPolylineToLayer(el, layer, xform) {
}

function attrs(el, ...names) {
	const o = {};
	names.forEach(n => { o[n] = el.$[n] ? (isNaN(el.$[n].value*1) ? el.$[n].value : (el.$[n].value*1) ) : 0 });
	return o;
}

function addPathData(layer,xform,pathData) {
	const subpaths = pathData.match(/.+?z|.+/i);
	layer.push({
		// FIXME: if linestring, no wrapping array
		type: 'Polygon',
		// type: (subpaths.length>1 || /z[\s,]*$/i.test(subpaths[0])) ? 'Polygon' : 'LineString',
		coordinates: subpaths.map( subpathData => {
			const path = measurablePath(subpathData);
			const pts = [];
			const len = path.length();
			// TODO: adaptive subdivision
			for (var i=0;i<100;++i) pts.push(path.at(len*i/100));
			pts.push(pts[0].concat());
			return coords(pts,xform);
		})
	});
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

function parseXMLFile(file,callback) {
	fs.readFile(file, (err,xml) => {
		if (err) throw err;
		require('xml2js')
		.Parser({ explicitChildren:1, preserveChildrenOrder:1, xmlns:1 })
		.parseString(xml, (err,doc) => {
			if (err) throw err;
			callback(doc);
		});
	});
}

function lerp(minX, maxX, minY, maxY) {
	var slope = (maxY-minY)/(maxX-minX);
	return function(x){ return (x-minX)*slope + minY };
}

function die(message,code) {
	console.error(message);
	process.exit(code===undefined ? 1 : code);
}

/*

{
	"type": "GeometryCollection",
	"geometries": [ ... ]
}

"str"
42
true
{}
[]

//lon,lat  X,Y

// Geometry
{
	"type": "Point",
	"coordinates": [1.2, 3.4]
}

Point: [x,y]
MultiPoint, LineString: [Point+]
MultiLineString: [LineString+]
Polygon: [LineString+]
MultiPolygon: [Polygon+]

// GeometryCollection
{
	"type": "GeometryCollection",
	"geometries": [ ... ]
}

// Feature
{
	"type": "Feature",
	"geometry": { ... },
	"properties": { any } or null
}

// FeatureCollection ... could be for layers
{
	"type": "FeatureCollection",
	"features": [ ... ]
}



*/

