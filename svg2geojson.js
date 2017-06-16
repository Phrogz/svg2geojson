const fs = require('fs');

// TODO: check for file argument/existence
parseXMLFile(process.argv[2], convertSVGToGeoJSON);

function convertSVGToGeoJSON(doc) {
	const {svg} = doc;
	var layerByName = {};

	// Find Geolocation
	const meta = svg.$$.find( e => e['$ns'] && e['$ns'].uri=='http://www.prognoz.ru' && e['$ns'].local=='MetaInfo' )
	const geo = meta && meta.$$.find(e => e['$ns'].local=='Geo')
	const corners = geo && geo.$$.filter( e => e['$ns'].local=='GeoItem' )
	if (!corners || corners.length!=2) throw 'Your SVG file must include Prognoz MetaInfo as a child of <svg> element, containing 2 GeoItems.\nSee http://help.prognoz.com/8.0/en/index1.htm#mergedProjects/Specifications/svgmapspecification/structure/baseelements/p5_metainfo_element.htm';

	var converter = rectangleConverter(corners);
	svg.$$.forEach( (el,i) => {
		switch(el['#name']) {
			case 'g':
				const name = el.$.id ? el.$.id.value.replace(/_1_$/,'').replace(/_/g,' ') : ('Layer '+i);
				if (!layerByName[name]) layerByName[name] = [];
				console.log('New layer named',name)
				addGroupToLayer(el, layerByName[name]);
			break;
			default:
				if (!layerByName['']) layerByName[''] = [];
				addElementToLayer(el, layerByName['']);
		}
	});

	// TODO: convert all layers to geojson GeometryCollections
	// TODO: serialize layers to disk based on layer name
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

function addElementToLayer(el, layer) {
	switch(el['#name']) {
		case 'g':        return addGroupToLayer(el, layer);
		case 'path':     return addPathToLayer(el, layer);
		case 'rect':     return addRectToLayer(el, layer);
		case 'line':     return addLineToLayer(el, layer);
		case 'circle':   return addCircleToLayer(el, layer);
		case 'ellipse':  return addEllipseToLayer(el, layer);
		case 'polygon':  return addPolygonToLayer(el, layer);
		case 'polyline': return addPolylineToLayer(el, layer);
		default: console.debug('Ignoring unhandled element '+el['#name']);
	}
}

function addGroupToLayer(el, layer) {
	// TODO
}

function addPathToLayer(el, layer) {
	// TODO
}

function addRectToLayer(el, layer) {
	// TODO
}

function addLineToLayer(el, layer) {
	// TODO
}

function addCircleToLayer(el, layer) {
	// TODO
}

function addEllipseToLayer(el, layer) {
	// TODO
}

function addPolygonToLayer(el, layer) {
	// TODO
}

function addPolylineToLayer(el, layer) {
	// TODO
}


function rectangleConverter(corners) {
	var xLerp = lerp(corners[0].$.X.value, corners[1].$.X.value, corners[0].$.Longitude.value, corners[1].$.Longitude.value);
	var yLerp = lerp(corners[0].$.Y.value, corners[1].$.Y.value, corners[0].$.Latitude.value, corners[1].$.Latitude.value);
	return function(svgX,svgY) { return [xLerp(svgX),yLerp(svgY)] };
}

function lerp(minX, maxX, minY, maxY) {
	var slope = (maxY-minY)/(maxX-minX);
	return function(x){ return (x-minX)*slope + minY };
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