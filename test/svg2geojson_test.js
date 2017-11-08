var expect = require('chai').expect
const svg2geojson = require('../lib/svg2geojson.js');

describe('svg2geojson', () => {

  describe('#geoFromSVGXML()', () => {

    it('should return geojson', (done) => {
      svg2geojson.geoFromSVGXML(
        '<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">' +
          '<MetaInfo xmlns="http://www.prognoz.ru">' +
            '<Geo>' +
              '<GeoItem X="0" Y="0" Latitude="100.0" Longitude="100.0"/>' +
              '<GeoItem X="10" Y="10" Latitude="200.0" Longitude="200.0"/>' +
            '</Geo>' +
          '</MetaInfo>' +
          '<g>' +
        '<rect stroke="#000000" id="svg_1" height="10" width="10" y="0" x="0" stroke-width="5" fill="#FF0000"/>' +
        '</g>' +
        '</svg>',
        (geojson) => {
          let expected = {
            type: 'FeatureCollection',
            creator: 'svg2geojson v0.7.0',
            features: [{
              type: 'Feature',
              properties: null,
              geometry: {
                type: 'Polygon',
                'coordinates': [[[100, 100], [100, 200], [200, 200], [200, 100], [100, 100]]]
              }
            }]
          };
          expect(geojson).to.deep.equal(expected);
          done();
        }
      );
    });
  });
});
