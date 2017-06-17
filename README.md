# SVG 2 GeoJSON

Converts an SVG file with added geo-referencing tags into one or more GeoJSON files.


## Installing

`npm install xml2js vmath point-at-length neatjson`


## Geo-Referencing Tags

You must place two `GeoItems` inside a [Prognoz MetaInfo](http://help.prognoz.com/8.0/en/mergedProjects/Specifications/svgmapspecification/structure/svgmap_structure.htm) element as a direct child of the `<svg>` element at the root of your document.

~~~xml
<MetaInfo xmlns="http://www.prognoz.ru"><Geo>
	<GeoItem X="-595.30" Y="-142.88" Latitude="37.375593" Longitude="-121.977795"/>
	<GeoItem X="1388.66" Y=" 622.34" Latitude="37.369930" Longitude="-121.959404"/>
</Geo></MetaInfo>
~~~

These map opposing X/Y corners in your SVG coordinate space to Longitude/Latitude coordinates on the world. _Note that the SVG coordinate space has Y increasing down (toward the south), while Latitude increases upwards (towards the north)._

## TODO (AKA Known Limitations)

* Control polygonization limits
* Support modes of projection unmapping
* Support non-rectangular, inverse bilinear unmappings
* NeatJSON output